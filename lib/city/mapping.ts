import {
  Archetype,
  DISTRICTS,
  District,
  FaultLine,
  Judgment,
  Market,
} from "@/lib/ports";
import { dominantFault } from "@/lib/game/tectonics";
import { hash, mulberry32 } from "./seed";

/**
 * Turns a market plus Jev's judgment into building geometry.
 *
 * Every number here is computed by code. Jev contributed only the four
 * categorical/graded judgments it read off the question text.
 */

export interface Building {
  id: string;
  question: string;
  district: District;
  archetype: Archetype;
  faultLine: FaultLine;
  /** Grid position within the district block. */
  x: number;
  z: number;
  height: number;
  width: number;
  depth: number;
  /** 0..1 P(YES) — drives emissive intensity. */
  yesPrice: number;
  /** 0..1 — how much of a landmark; drives the spire and crown. */
  spectacle: number;
  /** 0..1 — glass (shatters) vs stone (cracks). */
  brittleness: number;
  volumeUsd: number;
  endDate: string;
  /** Number of setback tiers; a purely visual consequence of archetype. */
  tiers: number;
  hasSpire: boolean;
  rotation: number;
}

/** Volume spans orders of magnitude, so height is log-scaled — otherwise one
 *  $31M market dwarfs everything and the skyline reads as a single spike. */
export function heightFromVolume(volumeUsd: number, maxVolume: number): number {
  const floor = 1.1;
  const ceiling = 7.5;
  if (maxVolume <= 0) return floor;
  const t = Math.log10(1 + volumeUsd) / Math.log10(1 + maxVolume);
  return floor + t * (ceiling - floor);
}

const ARCHETYPE_FORM: Record<Archetype, { tiers: number; spire: boolean; squat: number }> = {
  tower: { tiers: 3, spire: true, squat: 0.78 },
  courthouse: { tiers: 1, spire: false, squat: 1.45 },
  cathedral: { tiers: 2, spire: true, squat: 1.0 },
  casino: { tiers: 1, spire: false, squat: 1.25 },
  factory: { tiers: 1, spire: false, squat: 1.6 },
  stadium: { tiers: 1, spire: false, squat: 1.85 },
  observatory: { tiers: 2, spire: false, squat: 0.95 },
  monument: { tiers: 1, spire: true, squat: 0.62 },
};

/** District blocks laid out around a central plaza. */
const DISTRICT_ORIGIN: Record<District, [number, number]> = {
  capitol: [-9, -7],
  exchange: [1, -7],
  foundry: [-9, 1],
  frontier: [1, 1],
  colosseum: [-9, 9],
  agora: [1, 9],
};

export function buildCity(
  markets: Market[],
  judgments: Record<string, Judgment>,
): Building[] {
  const maxVolume = Math.max(1, ...markets.map((m) => m.volumeUsd));
  const perDistrict = new Map<District, number>();
  const buildings: Building[] = [];

  for (const m of markets) {
    const j = judgments[m.id];
    if (!j) continue;

    const rnd = mulberry32(hash(m.conditionId));
    const form = ARCHETYPE_FORM[j.archetype];
    const slot = perDistrict.get(j.district) ?? 0;
    perDistrict.set(j.district, slot + 1);

    const [ox, oz] = DISTRICT_ORIGIN[j.district];
    const col = slot % 3;
    const row = Math.floor(slot / 3);

    const spectacle01 = Math.min(1, Math.max(0, j.spectacle / 4));
    // Height means volume and ONLY volume. Spectacle earns ornament (spire,
    // crown), never height — otherwise the skyline misreports the data.
    const height = heightFromVolume(m.volumeUsd, maxVolume);
    const width = (0.85 + rnd() * 0.3) * form.squat;

    buildings.push({
      id: m.id,
      question: m.question,
      district: j.district,
      archetype: j.archetype,
      faultLine: dominantFault(j),
      x: ox + col * 2.5 + (rnd() - 0.5) * 0.25,
      z: oz + row * 2.5 + (rnd() - 0.5) * 0.25,
      height,
      width,
      depth: width * (0.9 + rnd() * 0.2),
      yesPrice: m.yesPrice,
      spectacle: spectacle01,
      brittleness: j.brittleness,
      volumeUsd: m.volumeUsd,
      endDate: m.endDate,
      tiers: form.tiers,
      // Only genuine landmarks earn a spire, so the skyline has a hierarchy.
      hasSpire: form.spire && spectacle01 > 0.55,
      rotation: (rnd() - 0.5) * 0.12,
    });
  }

  return buildings;
}

export const DISTRICT_META: Record<District, { label: string; color: string }> = {
  capitol: { label: "The Capitol", color: "#e0b057" },
  exchange: { label: "The Exchange", color: "#4fb8e8" },
  colosseum: { label: "The Colosseum", color: "#e8724f" },
  foundry: { label: "The Foundry", color: "#7ee089" },
  agora: { label: "The Agora", color: "#d98be8" },
  frontier: { label: "The Frontier", color: "#e85f7a" },
};

export const ALL_DISTRICTS = DISTRICTS;
export { DISTRICT_ORIGIN };
