'use client';

/**
 * Splitter: Rauschen → Klarheit (DESIGN_SPEC §3.1). Ein InstancedMesh aus
 * Wuerfeln (1 Draw Call), Anzahl laut Tier (config.splinters). Start verstreut
 * in x ±9, y −1…5, z −6…4; Ziel per MeshSurfaceSampler auf beiden Haelften
 * (inklusive aktuellem Haelften-Versatz). Flug zeitbasiert ueber 2,4 s ab
 * ui.preloaderDone, Sweep von links nach rechts, power3.out, Rotation → 0.
 * Am Ziel schrumpfen die Splitter in die einblendende Oberflaeche.
 *
 * Matrizen werden nur waehrend des Laufs (und einmal fuer die Startpose)
 * geschrieben; danach visible = false. Zufall nur aus mulberry32(6).
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { COLORS } from '@/lib/brand';
import { clamp01, lerp, mulberry32, power3Out, smoothstep } from '@/lib/scene/math';
import {
  halfOffset,
  splinterDelay,
  splinterDisplay,
  splinterProgress,
  SPLINTER_FLIGHT,
  type HeroState,
} from './hero-timeline';
import type { SculptureHalves } from './media-glyphs';

const SEED = 6;
const SCALE_RANGE: readonly [number, number] = [0.04, 0.16];
const BRAND_SHARE = 0.7;
const START_BOX = Object.freeze({ x: [-9, 9] as const, y: [-1, 5] as const, z: [-6, 4] as const });
/** Ab diesem Flug-Anteil schrumpft ein Splitter in die Oberflaeche (Dissolve-Front laeuft synchron). */
const SHRINK_FROM = 0.8;
/** Rueckseiten (normal.z darunter) neu ziehen, damit die Splitter von vorn sichtbar landen. */
const BACK_FACE_LIMIT = -0.3;
const SAMPLE_TRIES = 6;
const MATERIAL = Object.freeze({ roughness: 0.45, metalness: 0.05 });

interface SplinterField {
  readonly count: number;
  /** Startpositionen (x, y, z) */
  readonly start: Float32Array;
  /** Ziel auf der Oberflaeche ohne Haelften-Versatz (Objektraum der Skulptur) */
  readonly target: Float32Array;
  /** 1 = obere Haelfte, 0 = untere */
  readonly upper: Uint8Array;
  readonly delay: Float32Array;
  readonly scale: Float32Array;
  /** Startrotation als Quaternion (x, y, z, w), w ≥ 0 (kuerzester Weg zur Identitaet) */
  readonly rotation: Float32Array;
}

interface SplinterParts {
  readonly mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BoxGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly field: SplinterField;
}

/** three liefert setRandomGenerator, die Typen (@types/three 0.186) kennen es noch nicht. */
interface SeedableSampler {
  setRandomGenerator?: (fn: () => number) => unknown;
}

function createSampler(geometry: THREE.BufferGeometry, rand: () => number): { sampler: MeshSurfaceSampler; area: number } {
  const probe = new THREE.Mesh(geometry);
  const sampler = new MeshSurfaceSampler(probe);
  (sampler as unknown as SeedableSampler).setRandomGenerator?.(rand);
  sampler.build();
  (probe.material as THREE.Material).dispose();
  const dist = sampler.distribution;
  const area = dist && dist.length > 0 ? dist[dist.length - 1] : 0;
  return { sampler, area };
}

/** Zieht einen Oberflaechenpunkt, bevorzugt nicht auf der Rueckseite. */
function sampleFront(sampler: MeshSurfaceSampler, position: THREE.Vector3, normal: THREE.Vector3): void {
  for (let attempt = 0; attempt < SAMPLE_TRIES; attempt++) {
    sampler.sample(position, normal);
    if (normal.z >= BACK_FACE_LIMIT) return;
  }
}

function range(rand: () => number, [a, b]: readonly [number, number]): number {
  return lerp(a, b, rand());
}

/** Deterministisches Feld aus mulberry32(6); Ziele inklusive Ruhe-Versatz fuer die Verzoegerung. */
function buildField(count: number, halves: SculptureHalves, rand: () => number): SplinterField {
  const upperSampler = createSampler(halves.upper, rand);
  const lowerSampler = createSampler(halves.lower, rand);
  const upperShare = upperSampler.area / Math.max(upperSampler.area + lowerSampler.area, 1e-6);
  const [restX, restY] = halfOffset(0, 0);

  const field: SplinterField = {
    count,
    start: new Float32Array(count * 3),
    target: new Float32Array(count * 3),
    upper: new Uint8Array(count),
    delay: new Float32Array(count),
    scale: new Float32Array(count),
    rotation: new Float32Array(count * 4),
  };
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  for (let i = 0; i < count; i++) {
    const isUpper = rand() < upperShare;
    sampleFront(isUpper ? upperSampler.sampler : lowerSampler.sampler, position, normal);
    const sign = isUpper ? 1 : -1;
    field.upper[i] = isUpper ? 1 : 0;
    field.target.set([position.x, position.y, position.z], i * 3);
    field.delay[i] = splinterDelay(position.x + sign * restX, position.y + sign * restY);
    field.scale[i] = range(rand, SCALE_RANGE);
    field.start.set([range(rand, START_BOX.x), range(rand, START_BOX.y), range(rand, START_BOX.z)], i * 3);
    quat.setFromEuler(euler.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2));
    const w = quat.w < 0 ? -1 : 1;
    field.rotation.set([quat.x * w, quat.y * w, quat.z * w, quat.w * w], i * 4);
  }
  return field;
}

/**
 * Schreibt alle Instanz-Matrizen fuer Splitter-Zeit u (0..1) direkt in das
 * Matrix-Array (Compose wie Matrix4.compose, ohne Allokation pro Instanz).
 */
function writeMatrices(mesh: THREE.InstancedMesh, field: SplinterField, u: number, ox: number, oy: number): void {
  const m = mesh.instanceMatrix.array;
  const { start, target, upper, delay, scale, rotation } = field;
  for (let i = 0; i < field.count; i++) {
    const t = clamp01((u - delay[i]) / SPLINTER_FLIGHT);
    const e = power3Out(t);
    const sign = upper[i] === 1 ? 1 : -1;
    const i3 = i * 3;
    const px = lerp(start[i3], target[i3] + sign * ox, e);
    const py = lerp(start[i3 + 1], target[i3 + 1] + sign * oy, e);
    const pz = lerp(start[i3 + 2], target[i3 + 2], e);

    // nlerp Startrotation → Identitaet
    const i4 = i * 4;
    let qx = rotation[i4] * (1 - e);
    let qy = rotation[i4 + 1] * (1 - e);
    let qz = rotation[i4 + 2] * (1 - e);
    let qw = rotation[i4 + 3] * (1 - e) + e;
    const len = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= len;
    qy /= len;
    qz /= len;
    qw /= len;

    const s = scale[i] * (1 - smoothstep(SHRINK_FROM, 1, t));
    const x2 = qx + qx;
    const y2 = qy + qy;
    const z2 = qz + qz;
    const xx = qx * x2;
    const xy = qx * y2;
    const xz = qx * z2;
    const yy = qy * y2;
    const yz = qy * z2;
    const zz = qz * z2;
    const wx = qw * x2;
    const wy = qw * y2;
    const wz = qw * z2;
    const o = i * 16;
    m[o] = (1 - (yy + zz)) * s;
    m[o + 1] = (xy + wz) * s;
    m[o + 2] = (xz - wy) * s;
    m[o + 3] = 0;
    m[o + 4] = (xy - wz) * s;
    m[o + 5] = (1 - (xx + zz)) * s;
    m[o + 6] = (yz + wx) * s;
    m[o + 7] = 0;
    m[o + 8] = (xz + wy) * s;
    m[o + 9] = (yz - wx) * s;
    m[o + 10] = (1 - (xx + yy)) * s;
    m[o + 11] = 0;
    m[o + 12] = px;
    m[o + 13] = py;
    m[o + 14] = pz;
    m[o + 15] = 1;
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function buildSplinters(count: number, halves: SculptureHalves): SplinterParts {
  const rand = mulberry32(SEED);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ ...MATERIAL });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Die Instanzen bewegen sich ueber 18 m; eine einmal berechnete Bounding Sphere waere falsch.
  mesh.frustumCulled = false;
  mesh.visible = false;

  const brand = new THREE.Color(COLORS.brand);
  const anthracite = new THREE.Color(COLORS.anthracite);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, rand() < BRAND_SHARE ? brand : anthracite);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const field = buildField(count, halves, rand);
  writeMatrices(mesh, field, 0, 0, 0);
  return { mesh, geometry, material, field };
}

function disposeSplinters(parts: SplinterParts): void {
  parts.mesh.dispose();
  parts.geometry.dispose();
  parts.material.dispose();
}

/** NaN = Startpose noch nicht geschrieben bzw. nach dem Ausblenden neu schreiben. */
const UNSET = Number.NaN;

/**
 * Ein Frame: Sichtbarkeit setzen und bei Bedarf Matrizen schreiben.
 * Liefert die zuletzt geschriebene Splitter-Zeit (UNSET, wenn ausgeblendet).
 */
function updateSplinters(parts: SplinterParts, hero: HeroState, lastU: number): number {
  const display = splinterDisplay(hero.intro);
  if (display === 'hidden') {
    parts.mesh.visible = false;
    return UNSET;
  }
  parts.mesh.visible = true;
  const u = display === 'scatter' ? 0 : splinterProgress(hero.intro);
  if (display === 'scatter' && u === lastU) return lastU;
  const [ox, oy] = halfOffset(hero.open, hero.hover);
  writeMatrices(parts.mesh, parts.field, u, ox, oy);
  return u;
}

export interface SplintersProps {
  count: number;
  halves: SculptureHalves;
  heroRef: RefObject<HeroState>;
}

export default function Splinters({ count, halves, heroRef }: SplintersProps) {
  const parts = useMemo(() => buildSplinters(count, halves), [count, halves]);
  const lastURef = useRef<number>(UNSET);

  useEffect(() => () => disposeSplinters(parts), [parts]);

  useFrame(() => {
    lastURef.current = updateSplinters(parts, heroRef.current, lastURef.current);
  });

  return <primitive object={parts.mesh} />;
}
