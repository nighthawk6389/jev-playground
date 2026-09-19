import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAULT_LINES,
  FixtureJudgmentsSchema,
  Judge,
  Judgment,
  Market,
  ShockResult,
  SurveyResult,
} from "@/lib/ports";
import { ambiguousPairs, cosineSimilarity, toVector } from "@/lib/game/tectonics";

/**
 * The offline judge.
 *
 * Recorded answers cover the preset shocks. Free text can never hit a recorded
 * fixture, so arbitrary input falls through to a deterministic simulator that
 * is clearly labelled `simulated` in the UI. It is not a model — it exists so
 * every downstream code path stays exercised without a key.
 */
export class ReplayJudge implements Judge {
  readonly kind = "fixture" as const;

  private judgments(): Record<string, Judgment> {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "fixtures", "judgments.json"), "utf8"),
    );
    return FixtureJudgmentsSchema.parse(raw).judgments;
  }

  async judgeMarkets(markets: Market[]): Promise<Record<string, Judgment>> {
    const all = this.judgments();
    const out: Record<string, Judgment> = {};
    for (const m of markets) if (all[m.id]) out[m.id] = all[m.id];
    return out;
  }

  /**
   * Derives links from the fault vectors themselves. Honest about what it is:
   * this is geometry over recorded judgments, not a fresh model opinion.
   */
  async surveyBedrock(markets: Market[]): Promise<SurveyResult> {
    const judgments = await this.judgeMarkets(markets);
    const pairs = ambiguousPairs(markets.map((m) => m.id), judgments, 6);

    const links = pairs.flatMap(([a, b]) => {
      const ja = judgments[a];
      const jb = judgments[b];
      if (!ja || !jb) return [];
      const shared = cosineSimilarity(toVector(ja), toVector(jb));
      // Two markets on one driver usually move together; a pair where one is a
      // "will X survive" and the other a "will X be replaced" moves opposite.
      const opposed = isOpposed(a, b, markets);
      return [{
        aId: a,
        bId: b,
        shared,
        direction: (shared < 0.25 ? "unrelated" : opposed ? "opposite" : "same") as
          | "same"
          | "opposite"
          | "unrelated",
      }];
    });

    return { provenance: "simulated", links, usage: null };
  }

  async stressTest(shock: string, markets: Market[]): Promise<ShockResult> {
    const recorded = PRESET_SHOCKS[normalizeShock(shock)];
    const judgments = await this.judgeMarkets(markets);

    if (recorded) {
      return {
        shock,
        provenance: "recorded",
        effects: markets.map((m) => {
          const j = judgments[m.id];
          const weight = j
            ? FAULT_LINES.reduce(
                (s, f) => s + (j.faultVector[f] ?? 0) * (recorded.weights[f] ?? 0),
                0,
              )
            : 0;
          return {
            marketId: m.id,
            impact: clampSigned(weight),
            confidence: j ? 0.55 + (j.districtConfidence - 0.7) : 0.5,
          };
        }),
        usage: null,
      };
    }

    // Free text: deterministic pseudo-judgment, seeded so the same shock always
    // produces the same quake. Biased by the fault vector so it at least looks
    // structurally plausible rather than random noise.
    return {
      shock,
      provenance: "simulated",
      effects: markets.map((m) => {
        const j = judgments[m.id];
        const rnd = mulberry32(hash(`${shock}::${m.id}`));
        const base = rnd() * 2 - 1;
        const conviction = j ? 0.4 + j.brittleness * 0.6 : 0.5;
        return {
          marketId: m.id,
          impact: clampSigned(base * conviction),
          confidence: 0.35 + rnd() * 0.3,
        };
      }),
      usage: null,
    };
  }
}

/** The demo's happy path: recorded, explicable shocks with real structure. */
export const PRESET_SHOCKS: Record<
  string,
  { label: string; weights: Partial<Record<(typeof FAULT_LINES)[number], number>> }
> = {
  "the fed cuts rates by 50 basis points": {
    label: "The Fed cuts rates by 50bps",
    weights: { fed_and_rates: 0.95, crypto_regulation: 0.45, energy_and_climate: 0.15, us_elections: 0.2 },
  },
  "a ceasefire is signed in ukraine": {
    label: "A ceasefire is signed in Ukraine",
    weights: { global_conflict: 0.9, energy_and_climate: -0.6, fed_and_rates: 0.2 },
  },
  "a frontier ai lab announces a major capability jump": {
    label: "A frontier lab announces a capability jump",
    weights: { ai_capability: 0.92, corporate_leadership: 0.3, idiosyncratic: 0.1 },
  },
  "a major exchange collapses": {
    label: "A major crypto exchange collapses",
    weights: { crypto_regulation: -0.88, corporate_leadership: -0.4, fed_and_rates: -0.1 },
  },
};

export function normalizeShock(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

/** A market about someone LEAVING moves opposite one about them STAYING. */
function isOpposed(aId: string, bId: string, markets: Market[]): boolean {
  const q = (id: string) =>
    markets.find((m) => m.id === id)?.question.toLowerCase() ?? "";
  const leaving = /replaced|resign|step down|leave|ousted|removed/;
  const staying = /remain|stay|hold|keep|survive|through/;
  const a = q(aId);
  const b = q(bId);
  return (leaving.test(a) && staying.test(b)) || (staying.test(a) && leaving.test(b));
}

function clampSigned(n: number): number {
  return Math.min(1, Math.max(-1, Number.isFinite(n) ? n : 0));
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
