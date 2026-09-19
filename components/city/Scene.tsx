"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
  TiltShift2,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { Building, DISTRICT_META, DISTRICT_ORIGIN } from "@/lib/city/mapping";
import { DISTRICTS } from "@/lib/ports";
import { useCity } from "./store";
import { BuildingMesh } from "./Building";
import { FaultSeams } from "./FaultLines";

/**
 * NOTE on shadows: drei's <SoftShadows> is NOT used. It calls
 * `unpackRGBAToDepth`, which three removed in r182 — on three 0.186 it fails as
 * a shader link error and renders the scene black. PCFSoftShadowMap with a
 * tightly fitted shadow frustum gives the diorama look without the breakage.
 */
function Rig({ lowFx }: { lowFx: boolean }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.enabled = !lowFx;
  }, [gl, lowFx]);
  return null;
}

/** Decays quake energy once per frame, in one place rather than per building. */
function QuakeClock() {
  const decay = useCity((s) => s.decayQuake);
  useFrame((_, dt) => decay(dt));
  return null;
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#0d1120" roughness={0.95} />
      </mesh>
      {DISTRICTS.map((d) => {
        const [x, z] = DISTRICT_ORIGIN[d];
        return (
          <mesh
            key={d}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[x + 2.5, 0.005, z + 1.9]}
            receiveShadow
          >
            <planeGeometry args={[8.4, 7.4]} />
            <meshStandardMaterial
              color={DISTRICT_META[d].color}
              roughness={0.9}
              transparent
              opacity={0.07}
            />
          </mesh>
        );
      })}
    </>
  );
}

/** The districts are laid out around a plaza that is not the world origin, so
 *  the camera must look at the city's real centre or the framing drifts. */
const CENTER: [number, number, number] = [-1.5, 1.8, 3.4];

interface SceneProps {
  buildings: Building[];
  lowFx: boolean;
}

export default function Scene({ buildings, lowFx }: SceneProps) {
  const shock = useCity((s) => s.shock);
  const positions = useCity((s) => s.positions);
  const selectedId = useCity((s) => s.selectedId);
  const select = useCity((s) => s.select);

  const impacts = useMemo(() => {
    const m = new Map<string, { impact: number; confidence: number }>();
    for (const e of shock?.effects ?? []) {
      m.set(e.marketId, { impact: e.impact, confidence: e.confidence });
    }
    return m;
  }, [shock]);

  const held = useMemo(
    () => new Set(positions.filter((p) => Math.abs(p.stake) > 0).map((p) => p.marketId)),
    [positions],
  );

  return (
    <Canvas
      shadows={!lowFx}
      orthographic
      dpr={lowFx ? 1 : [1, 2]}
      camera={{ position: [CENTER[0] + 24, 19, CENTER[2] + 24], zoom: 25, near: -100, far: 200 }}
      gl={{ preserveDrawingBuffer: true, antialias: !lowFx }}
      onPointerMissed={() => select(null)}
    >
      <Rig lowFx={lowFx} />
      <QuakeClock />
      <color attach="background" args={["#070a14"]} />
      <fog attach="fog" args={["#070a14", 48, 96]} />

      <hemisphereLight args={["#8fb6ff", "#241c34", 0.7]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        castShadow={!lowFx}
        position={[18, 26, 12]}
        intensity={2.4}
        color="#ffe6bd"
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.02}
        // Fitted tight to the city bounds: a default ortho shadow camera is the
        // main cause of mushy, detached-looking shadows.
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
      />
      {/* Cool rim light so silhouettes read against the dark ground. */}
      <directionalLight position={[-16, 10, -14]} intensity={0.5} color="#6ea8ff" />

      <Ground />
      <FaultSeams buildings={buildings} />

      {buildings.map((b) => {
        const fx = impacts.get(b.id);
        return (
          <BuildingMesh
            key={b.id}
            building={b}
            impact={fx?.impact ?? 0}
            confidence={fx?.confidence ?? 1}
            held={held.has(b.id)}
            dimmed={!!selectedId && selectedId !== b.id}
          />
        );
      })}

      <OrbitControls
        makeDefault
        target={CENTER}
        enablePan={false}
        minZoom={14}
        maxZoom={70}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
      />

      {!lowFx && (
        <EffectComposer multisampling={0}>
          {/* TiltShift2 is what actually reads as "miniature" — a screen-space
              gradient blur, far cheaper than a depth-correct DepthOfField. */}
          <TiltShift2 blur={0.34} />
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.5} levels={5} />
          <Vignette eskil={false} offset={0.22} darkness={0.75} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
