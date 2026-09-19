import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeEvents, parseMaybeJsonArray, byVolumeDesc } from "@/lib/sources/normalize";
import {
  FixtureJudgmentsSchema,
  FixtureMarketsSchema,
  FAULT_LINES,
  Judgment,
} from "@/lib/ports";
import {
  cosineSimilarity,
  exposureByFault,
  herfindahl,
  structuralIntegrity,
  ambiguousPairs,
  toVector,
} from "@/lib/game/tectonics";
import { buildCity, heightFromVolume } from "@/lib/city/mapping";
import { scorecard, scenarioPnL, openPosition, STARTING_TREASURY } from "@/lib/game/portfolio";
import { ReplayJudge, normalizeShock, PRESET_SHOCKS } from "@/lib/judge/replay";
import { rankNormalize } from "@/lib/judge/typesafe";

const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const rawEvents = read("fixtures/raw/events.json");
const markets = FixtureMarketsSchema.parse(read("fixtures/markets.json")).markets;
const judgments = FixtureJudgmentsSchema.parse(read("fixtures/judgments.json")).judgments;

describe("Gamma normalizer — the JSON-encoded-string trap", () => {
  it("parses outcomes delivered as a JSON-encoded string", () => {
    expect(parseMaybeJsonArray('["Yes", "No"]')).toEqual(["Yes", "No"]);
  });

  it("also tolerates the already-array form some captures show", () => {
    expect(parseMaybeJsonArray(["Yes", "No"])).toEqual(["Yes", "No"]);
  });

  it("returns empty rather than throwing on garbage", () => {
    expect(parseMaybeJsonArray("not-json-at-all")).toEqual([]);
    expect(parseMaybeJsonArray(undefined)).toEqual([]);
    expect(parseMaybeJsonArray(42)).toEqual([]);
  });

  it("normalizes the raw fixture into 24 usable markets", () => {
    const { markets: out } = normalizeEvents(rawEvents, new Date("2026-01-15"));
    expect(out).toHaveLength(24);
  });

  it("warns and drops bad rows instead of throwing", () => {
    const { dropped } = normalizeEvents(rawEvents, new Date("2026-01-15"));
    expect(dropped.map((d) => d.reason)).toEqual([
      "not binary (3 outcomes)",
      "unparseable outcomePrices",
    ]);
  });

  it("hoists tags from the event, since markets do not carry them", () => {
    const { markets: out } = normalizeEvents(rawEvents, new Date("2026-01-15"));
    const fed = out.find((m) => m.question.includes("Fed cut rates"));
    expect(fed?.tags).toContain("Economics");
  });

  it("drops markets already past their end date", () => {
    const { dropped } = normalizeEvents(rawEvents, new Date("2030-01-01"));
    expect(dropped.length).toBeGreaterThan(20);
  });

  it("sorts by volume descending in code, not via the order param", () => {
    const sorted = byVolumeDesc(markets);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].volumeUsd).toBeGreaterThanOrEqual(sorted[i].volumeUsd);
    }
  });
});

describe("tectonics — the mechanic code owns", () => {
  it("fault vectors are real distributions", () => {
    for (const [id, j] of Object.entries(judgments)) {
      const sum = FAULT_LINES.reduce((acc, f) => acc + j.faultVector[f], 0);
      expect(sum, `market ${id}`).toBeCloseTo(1, 5);
    }
  });

  it("scores identical vectors as fully aligned", () => {
    const v = toVector(judgments[Object.keys(judgments)[0]]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it("finds the hidden link code alone could not: Powell and the midterms", () => {
    const powell = markets.find((m) => m.question.includes("Powell"))!;
    const midterms = markets.find((m) => m.question.includes("Republicans hold the House"))!;
    const unrelated = markets.find((m) => m.question.includes("Taylor Swift"))!;

    const linked = cosineSimilarity(
      toVector(judgments[powell.id]),
      toVector(judgments[midterms.id]),
    );
    const notLinked = cosineSimilarity(
      toVector(judgments[powell.id]),
      toVector(judgments[unrelated.id]),
    );
    // They share no tag, no category and no words — only a driver.
    expect(powell.tags).not.toEqual(midterms.tags);
    expect(linked).toBeGreaterThan(notLinked);
  });

  it("herfindahl is 1 when everything rests on one plate", () => {
    const one = Object.fromEntries(FAULT_LINES.map((f) => [f, 0])) as Record<string, number>;
    one[FAULT_LINES[0]] = 1;
    expect(herfindahl(one as never)).toBeCloseTo(1, 6);
  });

  it("an empty portfolio is perfectly intact", () => {
    expect(structuralIntegrity([], judgments)).toBe(1);
  });

  it("CONCENTRATION DROPS INTEGRITY — the core strategic claim", () => {
    const fedMarkets = markets
      .filter((m) => (judgments[m.id]?.faultVector.fed_and_rates ?? 0) > 0.5)
      .slice(0, 3);
    const spread = [
      markets.find((m) => (judgments[m.id]?.faultVector.us_elections ?? 0) > 0.5)!,
      markets.find((m) => (judgments[m.id]?.faultVector.ai_capability ?? 0) > 0.5)!,
      markets.find((m) => (judgments[m.id]?.faultVector.global_conflict ?? 0) > 0.5)!,
    ];

    const concentrated = structuralIntegrity(
      fedMarkets.map((m) => ({ marketId: m.id, stake: 1000, entryPrice: m.yesPrice })),
      judgments,
    );
    const diversified = structuralIntegrity(
      spread.map((m) => ({ marketId: m.id, stake: 1000, entryPrice: m.yesPrice })),
      judgments,
    );

    expect(concentrated).toBeLessThan(diversified);
    expect(diversified - concentrated).toBeGreaterThan(0.15);
  });

  it("a NO position still loads the same plate — exposure is to the driver", () => {
    const m = markets.find((x) => judgments[x.id]?.faultVector.fed_and_rates > 0.5)!;
    const yes = exposureByFault([{ marketId: m.id, stake: 500, entryPrice: m.yesPrice }], judgments);
    const no = exposureByFault([{ marketId: m.id, stake: -500, entryPrice: m.yesPrice }], judgments);
    expect(yes.fed_and_rates).toBeCloseTo(no.fed_and_rates, 6);
  });

  it("caps the expensive pairwise escalation", () => {
    const pairs = ambiguousPairs(markets.map((m) => m.id), judgments, 6);
    expect(pairs.length).toBeLessThanOrEqual(6);
    for (const [a, b] of pairs) expect(a).not.toBe(b);
  });
});

describe("city mapping — data drives geometry", () => {
  const city = buildCity(markets, judgments);

  it("builds one building per judged market", () => {
    expect(city).toHaveLength(24);
  });

  it("is deterministic across runs", () => {
    expect(buildCity(markets, judgments)).toEqual(city);
  });

  it("THE HIGHEST-VOLUME MARKET IS THE TALLEST BUILDING", () => {
    const topVolume = [...markets].sort((a, b) => b.volumeUsd - a.volumeUsd)[0];
    const tallest = [...city].sort((a, b) => b.height - a.height)[0];
    expect(tallest.id).toBe(topVolume.id);
  });

  it("log-scales height so one whale does not flatten the skyline", () => {
    const small = heightFromVolume(1_000_000, 31_200_000);
    const large = heightFromVolume(31_200_000, 31_200_000);
    expect(large).toBeGreaterThan(small);
    expect(large / small).toBeLessThan(2);
  });

  it("populates every district", () => {
    const seen = new Set(city.map((b) => b.district));
    expect(seen.size).toBe(6);
  });

  it("gives no two buildings the same plot", () => {
    const plots = new Set(city.map((b) => `${b.x.toFixed(3)},${b.z.toFixed(3)}`));
    expect(plots.size).toBe(city.length);
  });

  it("reserves spires for genuine landmarks", () => {
    for (const b of city) if (b.hasSpire) expect(b.spectacle).toBeGreaterThan(0.55);
  });
});

describe("portfolio and scoring", () => {
  const base = { cash: STARTING_TREASURY, positions: [] };

  it("an untouched treasury scores its full value at full integrity", () => {
    const s = scorecard(base, markets, judgments);
    expect(s.netWorth).toBe(STARTING_TREASURY);
    expect(s.integrity).toBe(1);
  });

  it("penalises a concentrated portfolio against a diversified one of equal size", () => {
    const fed = markets.filter((m) => (judgments[m.id]?.faultVector.fed_and_rates ?? 0) > 0.5).slice(0, 2);
    const mixed = [
      markets.find((m) => (judgments[m.id]?.faultVector.us_elections ?? 0) > 0.5)!,
      markets.find((m) => (judgments[m.id]?.faultVector.ai_capability ?? 0) > 0.5)!,
    ];
    const mk = (ms: typeof markets) => ({
      cash: 8000,
      positions: ms.map((m) => ({ marketId: m.id, stake: 1000, entryPrice: m.yesPrice })),
    });
    expect(scorecard(mk(fed), markets, judgments).score)
      .toBeLessThan(scorecard(mk(mixed), markets, judgments).score);
  });

  it("scenario P&L moves with the shock direction", () => {
    const m = markets[0];
    const state = { cash: 9000, positions: [openPosition(m, 1000)] };
    const up = scenarioPnL(state, markets, new Map([[m.id, 1]]));
    const down = scenarioPnL(state, markets, new Map([[m.id, -1]]));
    expect(up).toBeGreaterThan(0);
    expect(down).toBeLessThan(0);
  });
});

describe("the offline judge", () => {
  const j = new ReplayJudge();

  it("serves recorded judgments for every fixture market", async () => {
    expect(Object.keys(await j.judgeMarkets(markets))).toHaveLength(24);
  });

  it("marks preset shocks as recorded, not simulated", async () => {
    const preset = Object.keys(PRESET_SHOCKS)[0];
    const r = await j.stressTest(preset, markets);
    expect(r.provenance).toBe("recorded");
  });

  it("a Fed shock moves Fed-driven markets more than unrelated ones", async () => {
    const r = await j.stressTest("The Fed cuts rates by 50 basis points", markets);
    const impact = new Map(r.effects.map((e) => [e.marketId, Math.abs(e.impact)]));
    const fed = markets.find((m) => m.question.includes("Fed cut rates"))!;
    const swift = markets.find((m) => m.question.includes("Taylor Swift"))!;
    expect(impact.get(fed.id)!).toBeGreaterThan(impact.get(swift.id)!);
  });

  it("labels free text as simulated and never claims it is a model", async () => {
    const r = await j.stressTest("a meteor lands in the pacific", markets);
    expect(r.provenance).toBe("simulated");
  });

  it("free-text shocks are deterministic — same input, same quake", async () => {
    const a = await j.stressTest("an unexpected merger", markets);
    const b = await j.stressTest("an unexpected merger", markets);
    expect(a.effects).toEqual(b.effects);
  });

  it("normalizes shock text so punctuation and case still match a preset", () => {
    expect(normalizeShock("  The Fed CUTS rates by 50 basis points! ")).toBe(
      "the fed cuts rates by 50 basis points",
    );
  });

  it("every impact stays in the signed unit band", async () => {
    const r = await j.stressTest("anything at all", markets);
    for (const e of r.effects) {
      expect(e.impact).toBeGreaterThanOrEqual(-1);
      expect(e.impact).toBeLessThanOrEqual(1);
    }
  });
});

describe("rank normalization of Jev score answers", () => {
  it("maps the 0..4 rubric onto signed impact with level 2 neutral", () => {
    const out = rankNormalize([
      { marketId: "a", score: 0, confidence: 0.9 },
      { marketId: "b", score: 2, confidence: 0.9 },
      { marketId: "c", score: 4, confidence: 0.9 },
    ]);
    expect(out[0].impact).toBe(-1);
    expect(out[1].impact).toBe(0);
    expect(out[2].impact).toBe(1);
  });

  it("handles the fractional expected values score actually returns", () => {
    const [out] = rankNormalize([{ marketId: "a", score: 3.2, confidence: 0.7 }]);
    expect(out.impact).toBeCloseTo(0.6, 6);
  });
});
