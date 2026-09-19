"use client";

import { create } from "zustand";
import { Building } from "@/lib/city/mapping";
import { Judgment, Market, ShockResult, SurveyResult } from "@/lib/ports";
import { Position, structuralIntegrity } from "@/lib/game/tectonics";
import {
  scorecard,
  STARTING_TREASURY,
  openPosition,
  positionValue,
} from "@/lib/game/portfolio";

/**
 * Client game state.
 *
 * Kept in a "use client" module that no server module imports — a zustand store
 * at server module scope would be shared across requests.
 *
 * Per-frame values (quake offsets) are NOT stored here. The Scene reads them
 * through a transient `subscribe` into refs; driving 24 meshes through React
 * state every frame is the difference between 60fps and 12.
 */

export interface CityState {
  markets: Market[];
  judgments: Record<string, Judgment>;
  buildings: Building[];

  cash: number;
  positions: Position[];

  selectedId: string | null;
  hoveredId: string | null;

  /** Price movement since the previous tick, keyed by market id. Drives the
   *  up/down arrows in the list and the flash on a building. */
  priceDeltas: Record<string, number>;
  /** Where the current prices came from — surfaced, never implied. */
  priceProvenance: "live" | "simulated" | null;
  lastTick: number | null;
  /** Net worth at the moment the session started, so P&L is meaningful. */
  openingNetWorth: number;

  survey: SurveyResult | null;
  shock: ShockResult | null;
  /** Rises to 1 when a quake fires, then decays. Read transiently. */
  quakeEnergy: number;
  busy: null | "survey" | "stress";
  error: string | null;

  select(id: string | null): void;
  hover(id: string | null): void;
  buy(marketId: string, stake: number): void;
  sellAll(marketId: string): void;
  clearPositions(): void;
  applyPrices(prices: Record<string, number>, provenance: "live" | "simulated"): void;
  setSurvey(s: SurveyResult | null): void;
  setShock(s: ShockResult | null): void;
  setBusy(b: CityState["busy"]): void;
  setError(e: string | null): void;
  decayQuake(dt: number): void;
}

export const useCity = create<CityState>((set, get) => ({
  markets: [],
  judgments: {},
  buildings: [],
  cash: STARTING_TREASURY,
  positions: [],
  selectedId: null,
  hoveredId: null,
  priceDeltas: {},
  priceProvenance: null,
  lastTick: null,
  openingNetWorth: STARTING_TREASURY,
  survey: null,
  shock: null,
  quakeEnergy: 0,
  busy: null,
  error: null,

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),

  buy: (marketId, stake) => {
    const { cash, positions, markets } = get();
    const market = markets.find((m) => m.id === marketId);
    if (!market) return;

    const cost = Math.abs(stake);
    if (cost > cash) return;

    // Same market and side: add to the position at a blended entry price.
    const side = Math.sign(stake);
    const existing = positions.find(
      (p) => p.marketId === marketId && Math.sign(p.stake) === side,
    );

    let next: Position[];
    if (existing) {
      const total = Math.abs(existing.stake) + cost;
      const blended =
        (existing.entryPrice * Math.abs(existing.stake) + market.yesPrice * cost) / total;
      next = positions.map((p) =>
        p === existing ? { ...p, stake: p.stake + stake, entryPrice: blended } : p,
      );
    } else {
      next = [...positions, openPosition(market, stake)];
    }

    set({ cash: cash - cost, positions: next });
  },

  /** Close a market's position at the CURRENT price, realising the P&L. */
  sellAll: (marketId) => {
    const { cash, positions, markets } = get();
    const market = markets.find((m) => m.id === marketId);
    if (!market) return;

    const closing = positions.filter((p) => p.marketId === marketId);
    if (closing.length === 0) return;

    const proceeds = closing.reduce((sum, p) => sum + positionValue(p, market), 0);
    set({
      cash: cash + proceeds,
      positions: positions.filter((p) => p.marketId !== marketId),
    });
  },

  clearPositions: () =>
    set({
      cash: STARTING_TREASURY,
      positions: [],
      survey: null,
      shock: null,
      openingNetWorth: STARTING_TREASURY,
    }),

  /**
   * Fold a price tick into the book.
   *
   * This is what makes the economy real: positions keep the shares they bought
   * at their entry price, so a moved price immediately changes what they are
   * worth. Nothing else needs to recompute — net worth is derived on read.
   */
  applyPrices: (prices, provenance) => {
    const { markets } = get();
    if (markets.length === 0) return;

    const deltas: Record<string, number> = {};
    let changed = false;

    const next = markets.map((m) => {
      const p = prices[m.id];
      if (typeof p !== "number" || !Number.isFinite(p)) return m;
      const delta = p - m.yesPrice;
      if (Math.abs(delta) < 1e-6) return m;
      deltas[m.id] = delta;
      changed = true;
      return { ...m, yesPrice: p };
    });

    if (!changed) {
      set({ priceProvenance: provenance, lastTick: Date.now() });
      return;
    }
    set({
      markets: next,
      priceDeltas: deltas,
      priceProvenance: provenance,
      lastTick: Date.now(),
    });
  },

  setSurvey: (survey) => set({ survey }),
  setShock: (shock) => set({ shock, quakeEnergy: shock ? 1 : 0 }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  decayQuake: (dt) => {
    const e = get().quakeEnergy;
    if (e <= 0) return;
    set({ quakeEnergy: Math.max(0, e - dt * 0.22) });
  },
}));

/** Derived, recomputed on read — cheap, and avoids stale mirrored state. */
export function useScore() {
  const { markets, judgments, cash, positions } = useCity();
  return scorecard({ cash, positions }, markets, judgments);
}

export function useIntegrity() {
  const { judgments, positions } = useCity();
  return structuralIntegrity(positions, judgments);
}
