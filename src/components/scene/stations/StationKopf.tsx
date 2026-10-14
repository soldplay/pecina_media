'use client';

/**
 * Station IV – Kopf (07 · 08), Paket P4. Station-lokale Koordinaten
 * (Ursprung Sockelmitte am Boden, +z Front); Gruppe, Sockel, Licht und Kamera
 * gehoeren P1. DESIGN_SPEC §3.3.4, docs/build/P4.md.
 *
 * - Schnitt 1 (07): Marmor zerfaellt unterhalb einer steigenden 6°-Ebene zu
 *   Punkten, Netzlinien zu sechs Knoten erscheinen.
 * - Schnitt 2 (08): Ebene faellt zurueck, Marmor wieder ganz; die Punkte
 *   stroemen zum orangen Zwilling rechts, das Netz zieht sich zurueck.
 * - Stretch: Drahtgitter am Zwilling (nur config.wireframe).
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { COLORS } from '@/lib/brand';
import { MODELS } from '@/lib/scene/assets';
import { CUT_LOCAL_NORMAL, PLINTH, stationPhases } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { createCutUniforms, setCutPlaneFromObject, type CutUniforms } from '@/lib/three/cut';
import type { StationContentProps } from '@/types/contracts';
import BustCut, { type BustPlacement } from './kopf/BustCut';
import BustPoints, { sampleBustSurface } from './kopf/BustPoints';
import NetworkLines from './kopf/NetworkLines';
import TwinWireframe from './kopf/TwinWireframe';
import { kopfPlaneY } from './kopf/point-shaders';

/** Bounding-Box-Hoehe laut docs/ASSETS.md (marble_bust_01: y 0,000 → 0,515). */
const BUST_BBOX_HEIGHT = 0.515;
/** Zielhoehe 0,72 → Skala 1,398 */
const BUST_TARGET_HEIGHT = 0.72;
const BUST: BustPlacement = Object.freeze({
  position: Object.freeze([-0.12, PLINTH.objectBaseY, 0] as const),
  rotationY: -0.25,
  scale: BUST_TARGET_HEIGHT / BUST_BBOX_HEIGHT,
});
const SAMPLE_SEED = 7;
const MOUNT_KEEP_ALIVE_MS = 300;

interface BustSource {
  readonly mesh: THREE.Mesh;
  /** Mesh → Station-lokal (Platzierung × Knotenkette im GLTF) */
  readonly bake: THREE.Matrix4;
}

/** Lokale Matrix von `obj` relativ zu `root` (ohne Weltmatrizen anzufassen). */
function matrixRelativeTo(obj: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  let node: THREE.Object3D | null = obj;
  while (node && node !== root) {
    node.updateMatrix();
    m.premultiply(node.matrix);
    node = node.parent;
  }
  return m;
}

function findBust(scene: THREE.Object3D): BustSource | null {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  const mesh = meshes[0];
  if (!mesh) return null;
  const placement = new THREE.Matrix4().compose(
    new THREE.Vector3(BUST.position[0], BUST.position[1], BUST.position[2]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), BUST.rotationY),
    new THREE.Vector3(BUST.scale, BUST.scale, BUST.scale),
  );
  return { mesh, bake: placement.multiply(matrixRelativeTo(mesh, scene)) };
}

const scratchOrigin = new THREE.Vector3();

/** Ebene Station-lokal → Welt in die geteilten Uniforms (Hot Path). */
function applyPlane(cut: CutUniforms, root: THREE.Object3D, y: number): void {
  setCutPlaneFromObject(cut, root, scratchOrigin.set(0, y, 0), CUT_LOCAL_NORMAL);
}

export default function StationKopf({ id, config, reduced }: StationContentProps) {
  const gltf = useGLTF(MODELS.bust.url, false, true);
  const bust = useMemo(() => findBust(gltf.scene), [gltf.scene]);
  const sample = useMemo(
    () => (bust ? sampleBustSurface(bust.mesh, bust.bake, config.bustPoints, SAMPLE_SEED) : null),
    [bust, config.bustPoints],
  );
  const cut = useMemo(
    () => createCutUniforms({ uNoiseAmp: 0.03, uCutGlow: COLORS.glow, uCutGlowStrength: 3 }),
    [],
  );
  const rootRef = useRef<THREE.Group>(null);

  if (process.env.NODE_ENV !== 'production') {
    console.assert(bust !== null, '[StationKopf] kein Mesh in marble_bust_01.glb gefunden');
  }

  // Nach Mount, Tier- oder Bewegungswechsel einen Frame anfordern (Demand-Loop).
  useEffect(() => {
    keepAlive(MOUNT_KEEP_ALIVE_MS);
  }, [reduced, config]);

  useFrame(() => {
    const root = rootRef.current;
    if (!frame.stationVisible[id] || !root) return;
    const { cut1, cut2 } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
    applyPlane(cut, root, kopfPlaneY(cut1, cut2, reduced));
  });

  const hasPoints = sample !== null && sample.count > 0;

  return (
    <group ref={rootRef}>
      <BustCut scene={gltf.scene} cut={cut} placement={BUST} />
      {hasPoints && <BustPoints id={id} reduced={reduced} sample={sample} cut={cut} />}
      {hasPoints && config.bustLines > 0 && (
        <NetworkLines id={id} reduced={reduced} sample={sample} count={config.bustLines} />
      )}
      {bust && config.stretch && config.wireframe && (
        <TwinWireframe id={id} reduced={reduced} geometry={bust.mesh.geometry} bake={bust.bake} />
      )}
    </group>
  );
}
