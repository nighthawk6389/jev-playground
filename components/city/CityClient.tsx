"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Building } from "@/lib/city/mapping";
import { Judgment, Market } from "@/lib/ports";
import { useCity } from "./store";
import { structuralIntegrity } from "@/lib/game/tectonics";
import { Hud } from "./Hud";

/**
 * The client boundary that makes `ssr: false` legal.
 *
 * Next 16 rejects `ssr: false` inside a Server Component outright, and the
 * Canvas must never SSR — three touches the DOM at import time.
 */
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        color: "var(--muted)",
        fontSize: 13,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}
    >
      Surveying the ground…
    </div>
  ),
});

interface Props {
  markets: Market[];
  judgments: Record<string, Judgment>;
  buildings: Building[];
  live: boolean;
}

export default function CityClient({ markets, judgments, buildings, live }: Props) {
  // Software rendering in CI is slow; ?fx=0 drops shadows and postprocessing.
  const [lowFx, setLowFx] = useState(false);

  useEffect(() => {
    useCity.setState({ markets, judgments, buildings });
    const params = new URLSearchParams(window.location.search);
    setLowFx(params.get("fx") === "0");
  }, [markets, judgments, buildings]);

  /**
   * Debug snapshot for tests. Asserting on this tests the data->geometry
   * mapping, which is the actual product logic, rather than pixels.
   */
  useEffect(() => {
    // Test hooks: drive the real store, so smoke tests exercise the same code
    // path the UI does rather than a parallel mock.
    (window as unknown as Record<string, unknown>).__zustandCity = useCity;

    const unsub = useCity.subscribe((s) => {
      const w = window as unknown as Record<string, unknown>;
      w.__integrity = structuralIntegrity(s.positions, s.judgments);
      w.__oddsville = {
        ready: true,
        live,
        buildings: s.buildings.map((b) => ({
          id: b.id,
          height: Number(b.height.toFixed(4)),
          district: b.district,
          archetype: b.archetype,
          faultLine: b.faultLine,
          yesPrice: b.yesPrice,
          hasSpire: b.hasSpire,
        })),
        positions: s.positions,
        survey: s.survey,
        shock: s.shock ? { provenance: s.shock.provenance, count: s.shock.effects.length } : null,
      };
    });
    // Fire once immediately so tests don't wait for a state change.
    useCity.setState((s) => ({ ...s }));
    return unsub;
  }, [live]);

  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <Scene buildings={buildings} lowFx={lowFx} />
      <Hud live={live} />
    </main>
  );
}
