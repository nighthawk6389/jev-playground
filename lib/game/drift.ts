import { Market } from "@/lib/ports";
import { hash, mulberry32 } from "@/lib/city/seed";

/**
 * Deterministic price drift for offline mode.
 *
 * Live Polymarket prices move on their own; fixtures do not. Without this the
 * whole economy is inert — net worth would sit pinned at the starting treasury
 * forever, which is exactly the gap this exists to close.
 *
 * It is NOT a market model and is never presented as one: the UI labels drifted
 * prices as simulated. It exists so the P&L, glow and scoring code paths are
 * genuinely exercised without a network.
 *
 * Deterministic in (marketId, elapsedSeconds), so it needs no stored state and
 * every client agrees on the same curve.
 */

/** Seeded value noise in [-1, 1] at integer step `t`. */
function noiseAt(seed: number, t: number): number {
  return mulberry32(seed ^ Math.imul(t | 0, 0x9e3779b9))() * 2 - 1;
}

/** Smooth interpolated noise — a random walk shape without accumulating state. */
function smoothNoise(seed: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  // Smoothstep so the curve has no visible kinks at integer boundaries.
  const w = f * f * (3 - 2 * f);
  return noiseAt(seed, i) * (1 - w) + noiseAt(seed, i + 1) * w;
}

export interface DriftOptions {
  /** Seconds since the session's price clock started. */
  elapsedSeconds: number;
  /** Seconds per noise step. Lower = jumpier. */
  periodSeconds?: number;
  /** Maximum excursion from the anchor price, in probability points. */
  amplitude?: number;
}

/**
 * Drift one price around its anchor.
 *
 * Mean-reverting by construction: the noise is bounded, so the price oscillates
 * around the real Polymarket value rather than wandering off to 0 or 1.
 */
export function driftPrice(
  anchor: number,
  marketId: string,
  { elapsedSeconds, periodSeconds = 22, amplitude = 0.07 }: DriftOptions,
): number {
  const seed = hash(marketId);
  const t = elapsedSeconds / periodSeconds;

  // Two octaves: a slow swing plus a smaller faster wobble.
  const slow = smoothNoise(seed, t);
  const fast = smoothNoise(seed ^ 0x5bf03635, t * 2.7) * 0.35;

  // Per-market volatility, so some buildings are placid and others twitchy.
  const vol = 0.45 + mulberry32(seed ^ 0xa5a5)() * 0.95;

  const moved = anchor + (slow + fast) * amplitude * vol;
  return clampPrice(moved);
}

export function clampPrice(p: number): number {
  return Math.min(0.99, Math.max(0.01, Number(p.toFixed(4))));
}

/** Drift a whole book at once. */
export function driftMarkets(
  markets: Market[],
  opts: DriftOptions,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of markets) out[m.id] = driftPrice(m.yesPrice, m.id, opts);
  return out;
}
