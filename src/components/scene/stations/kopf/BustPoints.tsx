'use client';

/**
 * Station IV: Punktwolke der Bueste (DESIGN_SPEC §3.3.4). MeshSurfaceSampler,
 * Station-lokal gebacken. Schnitt 1 (07): sichtbar genau dort, wo der Marmor
 * weg ist. Schnitt 2 (08): die Punkte stroemen zum Zwilling rechts
 * (uTwin = smoothstep(0,2, 0,8, cut2), Verzoegerung aSeed · 0,3) und werden
 * orange. Drift ±0,004 nur auf gerenderten Frames (uTime += delta).
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, type RootState } from '@react-three/fiber';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import type { StationId } from '@/lib/scene/ids';
import { mulberry32, smoothstep } from '@/lib/scene/math';
import { stationPhases } from '@/lib/scene/stations';
import { frame } from '@/lib/scene/store';
import type { CutUniforms } from '@/lib/three/cut';
import { TWIN_OFFSET, createPointsMaterial } from './point-shaders';

export interface BustSample {
  readonly count: number;
  /** Station-lokale Positionen auf der Bueste (x, y, z) */
  readonly positions: Float32Array;
  readonly seeds: Float32Array;
  /** Mittelpunkt der Punkte (Station-lokal) */
  readonly center: Readonly<THREE.Vector3>;
}

interface BustPointsProps {
  id: StationId;
  reduced: boolean;
  sample: BustSample;
  cut: CutUniforms;
}

/** three r186 hat setRandomGenerator, @types/three kennt es (noch) nicht. */
type SeedableSampler = MeshSurfaceSampler & {
  setRandomGenerator?: (fn: () => number) => MeshSurfaceSampler;
};

/**
 * Tastet die Oberflaeche flaechengewichtet ab (deterministisch) und rechnet
 * die Punkte mit `bake` (Mesh relativ zur Stationsgruppe) in Station-lokal um.
 */
export function sampleBustSurface(mesh: THREE.Mesh, bake: THREE.Matrix4, count: number, seed: number): BustSample {
  const n = Math.max(0, Math.floor(count));
  const sampler: SeedableSampler = new MeshSurfaceSampler(mesh);
  sampler.setRandomGenerator?.(mulberry32(seed));
  sampler.build();
  const positions = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  const p = new THREE.Vector3();
  const center = new THREE.Vector3();
  const rnd = mulberry32(seed + 1);
  for (let i = 0; i < n; i += 1) {
    sampler.sample(p);
    p.applyMatrix4(bake);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    center.add(p);
    seeds[i] = rnd();
  }
  if (n > 0) center.divideScalar(n);
  return { count: n, positions, seeds, center };
}

function createPointsGeometry(sample: BustSample): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(sample.positions, 3);
  const target = new Float32Array(sample.positions.length);
  for (let i = 0; i < sample.count; i += 1) {
    target[i * 3] = sample.positions[i * 3] + TWIN_OFFSET[0];
    target[i * 3 + 1] = sample.positions[i * 3 + 1] + TWIN_OFFSET[1];
    target[i * 3 + 2] = sample.positions[i * 3 + 2] + TWIN_OFFSET[2];
  }
  // position und aPos teilen sich denselben Puffer (position braucht three fuer den Draw-Count)
  geometry.setAttribute('position', pos);
  geometry.setAttribute('aPos', pos);
  geometry.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(sample.seeds, 1));
  return geometry;
}

/** Weltgroesse eines Punkts (m); weniger Punkte → etwas groesser. */
function pointWorldSize(count: number): number {
  return Math.min(0.007, Math.max(0.0025, 0.0042 * Math.sqrt(6000 / Math.max(count, 1))));
}

/** uTime periodisch halten (Periode von sin(uTime · 1,3)), damit float genau bleibt. */
const TIME_WRAP = ((Math.PI * 2) / 1.3) * 100;

function applyPoints(
  material: THREE.ShaderMaterial,
  state: RootState,
  delta: number,
  cut2: number,
  reduced: boolean,
  worldSize: number,
): void {
  const u = material.uniforms;
  u.uTwin.value = reduced ? 1 : smoothstep(0.2, 0.8, cut2);
  if (!reduced) u.uTime.value = (u.uTime.value + delta) % TIME_WRAP;
  const camera = state.camera;
  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 35;
  u.uSize.value = (worldSize * state.size.height) / (2 * Math.tan((fov * Math.PI) / 360));
  u.uDpr.value = state.gl.getPixelRatio();
}

export default function BustPoints({ id, reduced, sample, cut }: BustPointsProps) {
  const geometry = useMemo(() => createPointsGeometry(sample), [sample]);
  const material = useMemo(() => createPointsMaterial(cut, sample.center), [cut, sample]);
  const worldSize = pointWorldSize(sample.count);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    if (!frame.stationVisible[id]) return;
    const { cut2 } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
    applyPoints(material, state, delta, cut2, reduced, worldSize);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
