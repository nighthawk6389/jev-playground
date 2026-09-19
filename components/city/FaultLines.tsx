"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Building } from "@/lib/city/mapping";
import { FAULT_LINES } from "@/lib/ports";
import { useCity } from "./store";

const FAULT_COLOR: Record<string, string> = {
  us_elections: "#e0b057",
  fed_and_rates: "#4fb8e8",
  ai_capability: "#7ee089",
  crypto_regulation: "#c98bff",
  global_conflict: "#e85f7a",
  energy_and_climate: "#ffa14f",
  corporate_leadership: "#5fe8d0",
  idiosyncratic: "#6b7694",
};

/**
 * The bedrock. Buildings resting on the same driver are joined by a glowing
 * seam in the ground.
 *
 * Seams exist only where the survey found a link, so an unsurveyed city looks
 * calm and the reveal actually lands. Links the player holds burn brighter —
 * that is the moment the mechanic teaches: your portfolio looks spread across
 * districts, but the seams underneath tell you it is not.
 */
export function FaultSeams({ buildings }: { buildings: Building[] }) {
  const survey = useCity((s) => s.survey);
  const positions = useCity((s) => s.positions);
  const group = useRef<THREE.Group>(null);

  const byId = useMemo(
    () => new Map(buildings.map((b) => [b.id, b])),
    [buildings],
  );

  const held = useMemo(
    () => new Set(positions.filter((p) => Math.abs(p.stake) > 0).map((p) => p.marketId)),
    [positions],
  );

  const seams = useMemo(() => {
    if (!survey) return [];
    return survey.links
      .filter((l) => l.shared > 0.3 && l.direction !== "unrelated")
      .flatMap((l) => {
        const a = byId.get(l.aId);
        const b = byId.get(l.bId);
        if (!a || !b) return [];

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.01) return [];

        return [{
          key: `${l.aId}-${l.bId}`,
          x: (a.x + b.x) / 2,
          z: (a.z + b.z) / 2,
          length,
          angle: -Math.atan2(dz, dx),
          strength: l.shared,
          // An opposite-direction link is a HEDGE, not a risk. Rendering it
          // differently is the difference between the mechanic teaching
          // something and just looking busy.
          hedge: l.direction === "opposite",
          color: FAULT_COLOR[a.faultLine] ?? "#6b7694",
          exposed: held.has(l.aId) && held.has(l.bId),
        }];
      });
  }, [survey, byId, held]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const energy = useCity.getState().quakeEnergy;
    group.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const seam = seams[i];
      if (!seam || !mat) return;
      // Pulse, faster and brighter while the ground is still moving.
      const pulse = 0.55 + Math.sin(t * (1.4 + energy * 6) + i) * 0.25;
      mat.opacity = seam.strength * pulse * (seam.exposed ? 1 : 0.45) * (0.5 + energy * 0.9);
    });
  });

  if (seams.length === 0) return null;

  return (
    <group ref={group}>
      {seams.map((s) => (
        <mesh
          key={s.key}
          position={[s.x, 0.02, s.z]}
          rotation={[-Math.PI / 2, 0, s.angle]}
        >
          <planeGeometry args={[s.length, s.exposed ? 0.3 : 0.16]} />
          <meshBasicMaterial
            color={s.hedge ? "#5fe8d0" : s.color}
            transparent
            opacity={0.5}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export { FAULT_COLOR };
export const ALL_FAULTS = FAULT_LINES;
