"use client";

import { create } from "zustand";
import { Building } from "@/lib/city/mapping";
import { Judgment, Market, ShockResult, SurveyResult } from "@/lib/ports";
import { Position, structuralIntegrity } from "@/lib/game/tectonics";
import { scorecard, STARTING_TREASURY, openPosition } from "@/lib/game/portfolio";

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

  survey: SurveyResult | null;
  shock: ShockResult | null;
  /** Rises to 1 when a quake fires, then decays. Read transiently. */
  quakeEnergy: number;
  busy: null | "survey" | "stress";
  error: string | null;

  select(id: string | null): void;
  hover(id: string | null): void;
  buy(marketId: string, stake: number): void;
  clearPositions(): void;
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

  clearPositions: () =>
    set({ cash: STARTING_TREASURY, positions: [], survey: null, shock: null }),

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
