import { z } from "zod";

/**
 * The single source of truth for every shape that crosses a boundary.
 * Types are inferred from these schemas, never hand-written, so a drifted
 * fixture fails loudly in a test rather than quietly in the renderer.
 */

export const DISTRICTS = [
  "capitol",
  "exchange",
  "colosseum",
  "foundry",
  "agora",
  "frontier",
] as const;
export type District = (typeof DISTRICTS)[number];

export const ARCHETYPES = [
  "tower",
  "courthouse",
  "cathedral",
  "casino",
  "factory",
  "stadium",
  "observatory",
  "monument",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/**
 * The tectonic plates. These are the named real-world drivers a market can
 * rest on. Jev returns a probability across all of them, not just a winner,
 * which is what makes graded tectonics possible.
 */
export const FAULT_LINES = [
  "us_elections",
  "fed_and_rates",
  "ai_capability",
  "crypto_regulation",
  "global_conflict",
  "energy_and_climate",
  "corporate_leadership",
  "idiosyncratic",
] as const;
export type FaultLine = (typeof FAULT_LINES)[number];

/** A market after normalization. Nothing downstream sees raw Gamma shapes. */
export const MarketSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  question: z.string(),
  slug: z.string(),
  /** P(YES), 0..1 */
  yesPrice: z.number().min(0).max(1),
  volumeUsd: z.number().nonnegative(),
  liquidityUsd: z.number().nonnegative(),
  endDate: z.string(),
  oneDayChange: z.number(),
  /** Event tags, e.g. "Politics". A prior only — the district is Jev's call. */
  tags: z.array(z.string()),
});
export type Market = z.infer<typeof MarketSchema>;

/**
 * A probability distribution over the fault lines.
 *
 * Built as an explicit object rather than z.record so the inferred type is a
 * COMPLETE Record<FaultLine, number> — a partial record would force optional
 * chaining through every tectonics calculation.
 */
const FaultVectorSchema = z.object(
  Object.fromEntries(FAULT_LINES.map((f) => [f, z.number()])) as {
    [K in FaultLine]: z.ZodNumber;
  },
);

/** Jev's Tier-1 judgment for one market. */
export const JudgmentSchema = z.object({
  district: z.enum(DISTRICTS),
  districtConfidence: z.number().min(0).max(1),
  archetype: z.enum(ARCHETYPES),
  /** Expected value on the 0..4 spectacle rubric; may be fractional. */
  spectacle: z.number().min(0).max(4),
  /** P(resolves on a single discrete event). No confidence field — noul has none. */
  brittleness: z.number().min(0).max(1),
  /** The full distribution, not just the argmax. This drives the tectonics. */
  faultVector: FaultVectorSchema,
});
export type Judgment = z.infer<typeof JudgmentSchema>;

export const JudgedMarketSchema = z.object({
  market: MarketSchema,
  judgment: JudgmentSchema,
});
export type JudgedMarket = z.infer<typeof JudgedMarketSchema>;

export const FixtureMarketsSchema = z.object({
  capturedAt: z.string(),
  gammaQuery: z.string(),
  schemaVersion: z.literal(1),
  markets: z.array(MarketSchema),
});

export const FixtureJudgmentsSchema = z.object({
  capturedAt: z.string(),
  model: z.string(),
  schemaVersion: z.literal(1),
  /** Keyed by market id. */
  judgments: z.record(z.string(), JudgmentSchema),
});

/** One market's response to a hypothetical shock. */
export const ShockEffectSchema = z.object({
  marketId: z.string(),
  /** Signed, -1..1 after rank-normalization in code. */
  impact: z.number().min(-1).max(1),
  /** Jev's confidence in the score. Low confidence -> shimmer, not commit. */
  confidence: z.number().min(0).max(1),
});
export type ShockEffect = z.infer<typeof ShockEffectSchema>;

export const ShockResultSchema = z.object({
  shock: z.string(),
  /** Which judge produced this — surfaced in the UI, never hidden. */
  provenance: z.enum(["live", "recorded", "simulated"]),
  effects: z.array(ShockEffectSchema),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
});
export type ShockResult = z.infer<typeof ShockResultSchema>;

/** A discovered link between two holdings that code alone could not find. */
export const BedrockLinkSchema = z.object({
  aId: z.string(),
  bId: z.string(),
  /** P(one piece of news moves both). */
  shared: z.number().min(0).max(1),
  direction: z.enum(["same", "opposite", "unrelated"]),
});
export type BedrockLink = z.infer<typeof BedrockLinkSchema>;

export const SurveyResultSchema = z.object({
  provenance: z.enum(["live", "recorded", "simulated"]),
  links: z.array(BedrockLinkSchema),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
});
export type SurveyResult = z.infer<typeof SurveyResultSchema>;

/* ── Ports ─────────────────────────────────────────────────────────────── */

export interface MarketSource {
  readonly kind: "live" | "fixture";
  listMarkets(limit: number): Promise<Market[]>;
}

export interface Judge {
  readonly kind: "live" | "fixture";
  judgeMarkets(markets: Market[]): Promise<Record<string, Judgment>>;
  surveyBedrock(markets: Market[]): Promise<SurveyResult>;
  stressTest(shock: string, markets: Market[]): Promise<ShockResult>;
}
