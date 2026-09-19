import { FAULT_LINES, FaultLine, Judgment } from "@/lib/ports";

/**
 * The strategic core, and deliberately all in code.
 *
 * Jev scores each market once across the fault lines and returns a full
 * probability vector. Everything below is arithmetic over those vectors, so
 * changing a weight, a threshold or a display filter costs nothing and never
 * re-runs inference.
 */

export type FaultVector = Record<FaultLine, number>;

export function toVector(j: Judgment): number[] {
  return FAULT_LINES.map((f) => j.faultVector[f] ?? 0);
}

/** Graded plate affinity. 1 = same bedrock, 0 = nothing in common. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return clamp01(dot / (Math.sqrt(na) * Math.sqrt(nb)));
}

export interface Position {
  marketId: string;
  /** Dollars staked. Sign encodes the side: positive YES, negative NO. */
  stake: number;
  /** P(YES) at the moment of purchase. Required: without it, P&L against a
   *  moved price is always zero, because shares would be recomputed from the
   *  new price rather than the one actually paid. */
  entryPrice: number;
}

/**
 * Position-weighted exposure across the plates.
 *
 * A NO position still loads the same plate — the exposure is to the driver,
 * not the direction — so magnitude is what counts here.
 */
export function exposureByFault(
  positions: Position[],
  judgments: Record<string, Judgment>,
): FaultVector {
  const totals = Object.fromEntries(FAULT_LINES.map((f) => [f, 0])) as FaultVector;
  let staked = 0;

  for (const p of positions) {
    const j = judgments[p.marketId];
    if (!j) continue;
    const weight = Math.abs(p.stake);
    if (weight <= 0) continue;
    staked += weight;
    for (const f of FAULT_LINES) totals[f] += weight * (j.faultVector[f] ?? 0);
  }

  if (staked > 0) for (const f of FAULT_LINES) totals[f] /= staked;
  return totals;
}

/**
 * Herfindahl index over the exposure vector: 1/n when perfectly spread,
 * 1 when everything rests on one plate.
 */
export function herfindahl(exposure: FaultVector): number {
  return FAULT_LINES.reduce((sum, f) => sum + exposure[f] ** 2, 0);
}

/**
 * Structural integrity, 0..1.
 *
 * Rescaled so a perfectly diversified portfolio reads 1.0 rather than
 * 1 - 1/n, which would cap the player at 0.875 and feel broken.
 */
export function structuralIntegrity(
  positions: Position[],
  judgments: Record<string, Judgment>,
): number {
  const live = positions.filter((p) => Math.abs(p.stake) > 0);
  if (live.length === 0) return 1;

  const hhi = herfindahl(exposureByFault(positions, judgments));
  const floor = 1 / FAULT_LINES.length;
  return clamp01((1 - hhi) / (1 - floor));
}

/**
 * The pairs worth spending a Jev call on: highest joint entropy, so the ones
 * where the single-label answer is least decisive and a hidden link is most
 * likely to be lurking. Capped, because this escalation is the expensive tier.
 */
export function ambiguousPairs(
  ids: string[],
  judgments: Record<string, Judgment>,
  limit = 6,
): Array<[string, string]> {
  const scored: Array<{ pair: [string, string]; rank: number }> = [];

  for (let i = 0; i < ids.length; i++) {
    for (let k = i + 1; k < ids.length; k++) {
      const a = judgments[ids[i]];
      const b = judgments[ids[k]];
      if (!a || !b) continue;
      const va = toVector(a);
      const vb = toVector(b);
      // Ambiguity: both distributions are spread out, and they already overlap
      // somewhat. A confident pair on obviously different plates teaches us
      // nothing; a hazy pair with partial overlap is where the surprise lives.
      const rank = entropy(va) + entropy(vb) + cosineSimilarity(va, vb);
      scored.push({ pair: [ids[i], ids[k]], rank });
    }
  }

  return scored
    .sort((x, y) => y.rank - x.rank)
    .slice(0, limit)
    .map((s) => s.pair);
}

function entropy(v: number[]): number {
  let h = 0;
  for (const p of v) if (p > 0) h -= p * Math.log2(p);
  return h;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** The dominant plate, for labelling a building in the UI. */
export function dominantFault(j: Judgment): FaultLine {
  return FAULT_LINES.reduce(
    (best, f) => ((j.faultVector[f] ?? 0) > (j.faultVector[best] ?? 0) ? f : best),
    FAULT_LINES[0],
  );
}

export const FAULT_LABELS: Record<FaultLine, string> = {
  us_elections: "US Elections",
  fed_and_rates: "Fed & Rates",
  ai_capability: "AI Capability",
  crypto_regulation: "Crypto Regulation",
  global_conflict: "Global Conflict",
  energy_and_climate: "Energy & Climate",
  corporate_leadership: "Corporate Leadership",
  idiosyncratic: "Idiosyncratic",
};
