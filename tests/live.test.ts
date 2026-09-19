import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureMarketsSchema } from "@/lib/ports";
import { driftPrice, driftMarkets, clampPrice } from "@/lib/game/drift";
import {
  netWorth,
  openPosition,
  positionValue,
  sharesFor,
  STARTING_TREASURY,
} from "@/lib/game/portfolio";

const markets = FixtureMarketsSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "fixtures/markets.json"), "utf8")),
).markets;

describe("price drift — the thing that makes the economy real", () => {
  it("is deterministic in (market, time)", () => {
    const a = driftPrice(0.5, "abc", { elapsedSeconds: 42 });
    const b = driftPrice(0.5, "abc", { elapsedSeconds: 42 });
    expect(a).toBe(b);
  });

  it("ACTUALLY MOVES over time — otherwise net worth stays pinned", () => {
    const samples = Array.from({ length: 40 }, (_, i) =>
      driftPrice(0.5, "abc", { elapsedSeconds: i * 6 }),
    );
    // Distinct values, and a real spread — not just float noise.
    expect(new Set(samples).size).toBeGreaterThan(20);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.02);
  });

  it("moves different markets differently", () => {
    const a = driftPrice(0.5, "market-a", { elapsedSeconds: 30 });
    const b = driftPrice(0.5, "market-b", { elapsedSeconds: 30 });
    expect(a).not.toBe(b);
  });

  it("stays a valid probability under extreme anchors", () => {
    for (const anchor of [0, 0.01, 0.5, 0.99, 1]) {
      for (let t = 0; t < 200; t += 3) {
        const p = driftPrice(anchor, "edge", { elapsedSeconds: t });
        expect(p).toBeGreaterThanOrEqual(0.01);
        expect(p).toBeLessThanOrEqual(0.99);
      }
    }
  });

  it("mean-reverts: it orbits the anchor rather than wandering off", () => {
    const anchor = 0.5;
    const samples = Array.from({ length: 400 }, (_, i) =>
      driftPrice(anchor, "walker", { elapsedSeconds: i * 4 }),
    );
    const mean = samples.reduce((s, p) => s + p, 0) / samples.length;
    expect(Math.abs(mean - anchor)).toBeLessThan(0.05);
    // And never drifts to a rail.
    expect(Math.max(...samples)).toBeLessThan(0.85);
    expect(Math.min(...samples)).toBeGreaterThan(0.15);
  });

  it("is smooth — no wild jumps between adjacent ticks", () => {
    let maxJump = 0;
    for (let t = 0; t < 300; t++) {
      const a = driftPrice(0.5, "smooth", { elapsedSeconds: t });
      const b = driftPrice(0.5, "smooth", { elapsedSeconds: t + 1 });
      maxJump = Math.max(maxJump, Math.abs(a - b));
    }
    expect(maxJump).toBeLessThan(0.03);
  });

  it("drifts a whole book and covers every market", () => {
    const prices = driftMarkets(markets, { elapsedSeconds: 17 });
    expect(Object.keys(prices)).toHaveLength(markets.length);
    for (const m of markets) expect(typeof prices[m.id]).toBe("number");
  });

  it("clamps out-of-range input", () => {
    expect(clampPrice(-5)).toBe(0.01);
    expect(clampPrice(5)).toBe(0.99);
  });
});

describe("P&L against moved prices", () => {
  const market = markets[0];

  it("a YES position gains when the price rises", () => {
    const pos = openPosition(market, 1000);
    const before = positionValue(pos, market);
    const after = positionValue(pos, { ...market, yesPrice: market.yesPrice + 0.1 });
    expect(after).toBeGreaterThan(before);
  });

  it("a NO position gains when the price FALLS", () => {
    const pos = openPosition(market, -1000);
    const before = positionValue(pos, market);
    const after = positionValue(pos, { ...market, yesPrice: market.yesPrice - 0.1 });
    expect(after).toBeGreaterThan(before);
  });

  it("a NO position loses when the price rises", () => {
    const pos = openPosition(market, -1000);
    const before = positionValue(pos, market);
    const after = positionValue(pos, { ...market, yesPrice: market.yesPrice + 0.1 });
    expect(after).toBeLessThan(before);
  });

  it("an untouched position is worth exactly its stake", () => {
    const pos = openPosition(market, 1000);
    expect(positionValue(pos, market)).toBeCloseTo(1000, 6);
  });

  it("NET WORTH MOVES when prices move — the bug this feature fixes", () => {
    const pos = openPosition(market, 2000);
    const state = { cash: STARTING_TREASURY - 2000, positions: [pos] };

    const flat = netWorth(state, markets);
    expect(flat).toBeCloseTo(STARTING_TREASURY, 6);

    const moved = markets.map((m) =>
      m.id === market.id ? { ...m, yesPrice: clampPrice(m.yesPrice + 0.12) } : m,
    );
    expect(netWorth(state, moved)).toBeGreaterThan(flat + 100);
  });

  it("payout scales inversely with entry price — a longshot pays more", () => {
    expect(sharesFor(100, 0.1, "yes")).toBeCloseTo(1000, 6);
    expect(sharesFor(100, 0.5, "yes")).toBeCloseTo(200, 6);
  });

  it("does not divide by zero at the rails", () => {
    expect(sharesFor(100, 0.0001, "yes")).toBe(0);
    expect(sharesFor(100, 0.9999, "no")).toBe(0);
  });
});
