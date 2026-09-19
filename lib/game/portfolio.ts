import { Judgment, Market } from "@/lib/ports";
import { Position, structuralIntegrity } from "./tectonics";

export const STARTING_TREASURY = 10_000;

export interface PortfolioState {
  cash: number;
  positions: Position[];
}

/** Buying YES at price p returns 1/p per dollar if it resolves YES. */
export function sharesFor(stake: number, price: number, side: "yes" | "no"): number {
  const p = side === "yes" ? price : 1 - price;
  if (p <= 0.001) return 0;
  return Math.abs(stake) / p;
}

/**
 * Mark-to-market value of a position.
 *
 * Shares are fixed at the ENTRY price — that is the whole point of recording
 * it. Valuing them at the current price is what produces P&L.
 */
export function positionValue(pos: Position, market: Market): number {
  const side = pos.stake >= 0 ? "yes" : "no";
  const shares = sharesFor(pos.stake, pos.entryPrice, side);
  const now = side === "yes" ? market.yesPrice : 1 - market.yesPrice;
  return shares * now;
}

/** Open a position at the market's current price. */
export function openPosition(
  market: Market,
  stake: number,
): Position {
  return { marketId: market.id, stake, entryPrice: market.yesPrice };
}

export function netWorth(
  state: PortfolioState,
  markets: Market[],
): number {
  const byId = new Map(markets.map((m) => [m.id, m]));
  const staked = state.positions.reduce((sum, p) => {
    const m = byId.get(p.marketId);
    return sum + (m ? positionValue(p, m) : 0);
  }, 0);
  return state.cash + staked;
}

export interface Scorecard {
  netWorth: number;
  integrity: number;
  /** Net worth penalised by concentration. The strategic objective. */
  score: number;
  exposureCount: number;
}

export function scorecard(
  state: PortfolioState,
  markets: Market[],
  judgments: Record<string, Judgment>,
): Scorecard {
  const nw = netWorth(state, markets);
  const integrity = structuralIntegrity(state.positions, judgments);
  return {
    netWorth: nw,
    integrity,
    // A fragile city is worth less than a resilient one of the same value.
    score: Math.round(nw * (0.5 + 0.5 * integrity)),
    exposureCount: state.positions.filter((p) => Math.abs(p.stake) > 0).length,
  };
}

/** Scenario P&L: what the portfolio is worth after a shock moves prices. */
export function scenarioPnL(
  state: PortfolioState,
  markets: Market[],
  impacts: Map<string, number>,
): number {
  const byId = new Map(markets.map((m) => [m.id, m]));
  let delta = 0;
  for (const pos of state.positions) {
    const m = byId.get(pos.marketId);
    if (!m) continue;
    const impact = impacts.get(pos.marketId) ?? 0;
    // Impact shifts probability toward 0 or 1; clamp to a sane band.
    const moved = Math.min(0.99, Math.max(0.01, m.yesPrice + impact * 0.35));
    const before = positionValue(pos, m);
    const after = positionValue(pos, { ...m, yesPrice: moved });
    delta += after - before;
  }
  return delta;
}
