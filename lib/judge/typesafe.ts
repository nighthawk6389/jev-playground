import "server-only";
import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import {
  ARCHETYPES,
  DISTRICTS,
  FAULT_LINES,
  FaultLine,
  Judge,
  Judgment,
  Market,
  ShockResult,
  SurveyResult,
} from "@/lib/ports";
import {
  driverDirectionQuestion,
  sharedDriverQuestion,
  shockImpactQuestion,
  stressState,
  tierOneQuestions,
  tierOneState,
} from "@/lib/typesafe/questions";
import { ambiguousPairs } from "@/lib/game/tectonics";

/**
 * The live Jev judge.
 *
 * The client is a LAZY singleton: `new TypeSafeClient()` throws when the key is
 * absent, so constructing at module scope would break `next build` on a fresh
 * Vercel deploy before env vars are set.
 */
let client: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  if (!client) client = new TypeSafeClient();
  return client;
}

/**
 * Explicit time budget. SDK defaults allow a ~150s worst case (10s x 3 attempts
 * plus up to 60s of Retry-After twice), which blows past Vercel Hobby's 60s
 * function ceiling. We cap well under it and let the caller fall back.
 */
const CALL_OPTS = {
  timeout: 20_000,
  retry: { maxRetries: 1, maxRetryAfterMs: 3_000 },
} as const;

/** Chunk so one failure can't take down the whole city, and so no single
 *  request grows past a question count we haven't verified the server accepts. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class TypeSafeJudge implements Judge {
  readonly kind = "live" as const;

  async judgeMarkets(markets: Market[]): Promise<Record<string, Judgment>> {
    const out: Record<string, Judgment> = {};

    // 5 questions per market, so 8 markets is 40 questions per request.
    for (const batch of chunk(markets, 8)) {
      const { answers } = await getClient().systemOne(
        { state: tierOneState(batch), questions: tierOneQuestions(batch) },
        CALL_OPTS,
      );

      for (const m of batch) {
        const district = answers[`district__${m.id}`];
        const archetype = answers[`archetype__${m.id}`];
        const spectacle = answers[`spectacle__${m.id}`];
        const brittleness = answers[`brittleness__${m.id}`];
        const fault = answers[`fault__${m.id}`];
        if (
          district?.type !== "choice" ||
          archetype?.type !== "choice" ||
          spectacle?.type !== "score" ||
          brittleness?.type !== "noul" ||
          fault?.type !== "choice"
        ) {
          console.warn(`[jev] incomplete answers for market ${m.id}`);
          continue;
        }

        // Keep the WHOLE distribution. The argmax alone would throw away the
        // graded tectonics that the whole mechanic depends on.
        const faultVector = Object.fromEntries(
          FAULT_LINES.map((f) => [f, Number(fault.probabilities[f] ?? 0)]),
        ) as Record<FaultLine, number>;

        out[m.id] = {
          district: coerce(district.choice, DISTRICTS, "capitol"),
          districtConfidence: district.confidence,
          archetype: coerce(archetype.choice, ARCHETYPES, "tower"),
          spectacle: spectacle.score,
          brittleness: brittleness.noul,
          faultVector,
        };
      }
    }
    return out;
  }

  /**
   * The bedrock survey. Only the most ambiguous pairs are escalated, and they
   * all travel as many questions inside ONE request rather than one call each.
   */
  async surveyBedrock(markets: Market[]): Promise<SurveyResult> {
    const judgments = await this.judgeMarkets(markets);
    const pairs = ambiguousPairs(markets.map((m) => m.id), judgments, 6);
    if (pairs.length === 0) {
      return { provenance: "live", links: [], usage: null };
    }

    const index = new Map(markets.map((m, i) => [m.id, i]));
    const questions: Record<string, ReturnType<typeof noul | typeof choice>> = {};
    for (const [a, b] of pairs) {
      const ap = `markets[${index.get(a)}].question`;
      const bp = `markets[${index.get(b)}].question`;
      questions[`shared__${a}__${b}`] = sharedDriverQuestion(ap, bp);
      questions[`dir__${a}__${b}`] = driverDirectionQuestion(ap, bp);
    }

    const { answers, usage } = await getClient().systemOne(
      { state: tierOneState(markets), questions },
      CALL_OPTS,
    );

    const links = pairs.flatMap(([a, b]) => {
      const shared = answers[`shared__${a}__${b}`];
      const dir = answers[`dir__${a}__${b}`];
      if (shared?.type !== "noul" || dir?.type !== "choice") return [];
      return [{
        aId: a,
        bId: b,
        shared: shared.noul,
        direction: coerce(dir.choice, ["same", "opposite", "unrelated"] as const, "unrelated"),
      }];
    });

    return {
      provenance: "live",
      links,
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    };
  }

  async stressTest(shock: string, markets: Market[]): Promise<ShockResult> {
    const state = stressState(shock, markets);
    const raw: Array<{ marketId: string; score: number; confidence: number }> = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (const batch of chunk(markets, 12)) {
      const questions = Object.fromEntries(
        batch.map((m) => [
          m.id,
          shockImpactQuestion(`markets[${markets.indexOf(m)}].question`),
        ]),
      );
      const { answers, usage } = await getClient().systemOne(
        { state, questions },
        CALL_OPTS,
      );
      inputTokens += usage.input_tokens;
      outputTokens += usage.output_tokens;

      for (const m of batch) {
        const a = answers[m.id];
        if (a?.type !== "score") continue;
        raw.push({ marketId: m.id, score: a.score, confidence: a.confidence });
      }
    }

    return {
      shock,
      provenance: "live",
      // Rank-normalize: parallel questions can't calibrate against each other,
      // so absolute scores drift. Relative ordering is the trustworthy signal.
      effects: rankNormalize(raw),
      usage: { inputTokens, outputTokens },
    };
  }
}

/**
 * Map the rubric's 0..4 expected score onto a signed -1..1 impact.
 *
 * Level 2 ("barely moves") is the neutral midpoint. We keep the raw signed
 * value rather than a pure rank so that a genuinely unaffected city stays
 * still instead of being stretched into a full-scale quake.
 */
export function rankNormalize(
  raw: Array<{ marketId: string; score: number; confidence: number }>,
) {
  return raw.map((r) => ({
    marketId: r.marketId,
    impact: clampSigned((r.score - 2) / 2),
    confidence: r.confidence,
  }));
}

function clampSigned(n: number): number {
  return Math.min(1, Math.max(-1, Number.isFinite(n) ? n : 0));
}

function coerce<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
