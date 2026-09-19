"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Building } from "@/lib/city/mapping";
import { DISTRICT_META } from "@/lib/city/mapping";
import { useCity } from "./store";
import { hash, mulberry32 } from "@/lib/city/seed";

/**
 * A window grid baked into a CanvasTexture.
 *
 * This is why there is no window geometry: 24 buildings x ~200 windows would be
 * thousands of meshes. One procedural texture per archetype, reused, gives lit
 * windows for the cost of a material.
 */
const textureCache = new Map<string, THREE.CanvasTexture>();

function windowTexture(key: string, cols: number, rows: number): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;

  const cell = 16;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rnd = mulberry32(hash(key));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Some windows are dark — a fully lit facade reads as a light box, not
      // a building.
      const lit = rnd();
      if (lit < 0.28) continue;
      const v = Math.floor(150 + lit * 105);
      ctx.fillStyle = `rgb(${v}, ${Math.floor(v * 0.92)}, ${Math.floor(v * 0.72)})`;
      ctx.fillRect(c * cell + 4, r * cell + 4, cell - 8, cell - 7);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Probability drives the glow: a near-certain market blazes, a long shot is
 * nearly dark. Capped well below the old value — past ~1.6 the emissive map
 * swamps the lit surface and the city reads as neon rather than as buildings.
 */
function glowFor(yesPrice: number): number {
  return 0.1 + Math.pow(yesPrice, 1.5) * 1.5;
}

interface Props {
  building: Building;
  /** Live P(yes) — moves as prices tick, unlike the baked geometry. */
  yesPrice: number;
  /** -1..1 signed shock impact, or 0 when no scenario is running. */
  impact: number;
  /** Jev's confidence in that impact. Low -> shimmer instead of commit. */
  confidence: number;
  held: boolean;
  dimmed: boolean;
  /** Clicked, here or in the market list. Gets a beacon so it's findable. */
  selected: boolean;
}

export function BuildingMesh({
  building: b,
  yesPrice,
  impact,
  confidence,
  held,
  dimmed,
  selected,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const select = useCity((s) => s.select);
  const hover = useCity((s) => s.hover);

  const districtColor = DISTRICT_META[b.district].color;

  const tiers = useMemo(() => {
    const rnd = mulberry32(hash(b.id));
    const out: Array<{ y: number; h: number; w: number; d: number }> = [];
    let remaining = b.height;
    let w = b.width;
    let d = b.depth;
    let y = 0;
    for (let t = 0; t < b.tiers; t++) {
      const share = t === b.tiers - 1 ? remaining : remaining * (0.45 + rnd() * 0.2);
      out.push({ y: y + share / 2, h: share, w, d });
      y += share;
      remaining -= share;
      w *= 0.72;
      d *= 0.72;
    }
    return out;
  }, [b.id, b.height, b.width, b.depth, b.tiers]);

  const tex = useMemo(
    () => windowTexture(`${b.archetype}-${b.id}`, 4, Math.max(3, Math.round(b.height * 3))),
    [b.archetype, b.id, b.height],
  );

  // Per-frame animation goes through refs, never React state.
  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Selection beacon: a slow bob + spin above the chosen building, so a click
    // in the market list is findable in the skyline at a glance.
    if (beacon.current) {
      beacon.current.position.y = b.height + 1.5 + Math.sin(t * 2) * 0.16;
      beacon.current.rotation.y = t * 1.4;
    }

    if (!group.current) return;
    const energy = useCity.getState().quakeEnergy;
    const magnitude = Math.abs(impact) * energy;

    if (magnitude > 0.001) {
      // Brittle buildings snap; solid ones sway. Low confidence shimmers fast
      // and small rather than committing to a big directional shake.
      const jitter = 8 + b.brittleness * 14 + (1 - confidence) * 10;
      const amp = magnitude * (0.018 + b.brittleness * 0.05);
      group.current.position.x = b.x + Math.sin(t * jitter + b.z) * amp;
      group.current.position.z = b.z + Math.cos(t * jitter * 0.9 + b.x) * amp;
      group.current.rotation.z = b.rotation + Math.sin(t * jitter * 0.7) * amp * 0.5;
    } else {
      group.current.position.x = b.x;
      group.current.position.z = b.z;
      group.current.rotation.z = b.rotation;
    }
  });

  // A running scenario recolors the city green (rises) / red (falls).
  const emissiveColor =
    Math.abs(impact) > 0.02
      ? impact > 0
        ? "#4ade80"
        : "#f4544f"
      : districtColor;

  // Live price, not the baked one — this is what makes the city react to ticks.
  const intensity =
    glowFor(yesPrice) * (dimmed ? 0.18 : 1) * (held ? 1.35 : 1) * (selected ? 1.5 : 1);

  return (
    <group
      ref={group}
      position={[b.x, 0, b.z]}
      rotation={[0, b.rotation, 0]}
      onClick={(e) => {
        e.stopPropagation();
        select(b.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(b.id);
      }}
      onPointerOut={() => hover(null)}
    >
      {tiers.map((t, i) => (
        <mesh key={i} position={[0, t.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[t.w, t.h, t.d]} />
          <meshStandardMaterial
            color={held ? "#4a5478" : "#2d3552"}
            roughness={0.62 - b.brittleness * 0.28}
            metalness={0.1 + b.brittleness * 0.35}
            emissive={emissiveColor}
            emissiveMap={tex}
            emissiveIntensity={intensity}
          />
        </mesh>
      ))}

      {b.hasSpire && (
        <mesh position={[0, b.height + 0.45, 0]} castShadow>
          <coneGeometry args={[b.width * 0.16, 0.9, 6]} />
          <meshStandardMaterial
            color="#2a3350"
            emissive={emissiveColor}
            emissiveIntensity={intensity * 0.8}
            roughness={0.3}
            metalness={0.6}
          />
        </mesh>
      )}

      {/* A held building gets a lit plinth, so your portfolio is findable. */}
      {held && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[b.width * 0.75, b.width * 0.95, 24]} />
          <meshBasicMaterial color="#ffd27d" transparent opacity={0.85} />
        </mesh>
      )}

      {/* Selection beacon — the visual answer to "which one did I just click?" */}
      {selected && (
        <>
          <mesh ref={beacon} position={[0, b.height + 1.5, 0]}>
            <octahedronGeometry args={[0.38, 0]} />
            <meshBasicMaterial color="#ffd27d" />
          </mesh>
          <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[b.width * 1.05, b.width * 1.3, 28]} />
            <meshBasicMaterial color="#ffd27d" transparent opacity={0.6} />
          </mesh>
        </>
      )}
    </group>
  );
}
