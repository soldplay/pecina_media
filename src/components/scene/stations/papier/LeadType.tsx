'use client';

/**
 * Station III, Schnitt 2 (06): Bleisatz. N Lettern liegen verstreut (seeded)
 * und ordnen sich ueber cut2 0 → 0,8: fuenf Lettern zur gespiegelten Form
 * A-I-D-E-M mit durchgehendem 6°-Spalt, der Rest in den Setzkasten.
 * Ein InstancedMesh, zwei Materialgruppen (Koerper, Kappe mit Glyphen-Atlas).
 * DESIGN_SPEC §3.3.3, docs/build/P4.md.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COPY } from '@/content/site';
import { COLORS } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { clamp01, lerp, mulberry32, power3InOut } from '@/lib/scene/math';
import { stationPhases } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { useCanvasTexture } from '@/lib/three/canvas-texture';
import {
  ALPHABET,
  ATLAS,
  ATLAS_MEDIA_START,
  LEAD_CAP_SIZE,
  LEAD_PITCH,
  PROOF_STRIP,
  atlasCellOffset,
  atlasIndexOfLetter,
  drawLeadAtlas,
  leadFontSpecs,
  resolvePaperFonts,
} from './textures';

/** Hohe Teile des Notizblock-Modells (Station-lokal), auf denen Lettern liegen koennen. */
export interface PadObstacle {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Oberkante (Station-lokal y) */
  readonly top: number;
}

interface LeadTypeProps {
  id: StationId;
  reduced: boolean;
  /** Tier `leadType` (High 40, Mid 30, Compact 20) */
  count: number;
  /** Auflageflaeche (Station-lokal y) ausserhalb der Obstacles */
  baseY: number;
  obstacles: readonly PadObstacle[];
}

const BODY = Object.freeze({ w: 0.03, h: 0.022, d: 0.03 });
const FORME_LENGTH = 5;
const RASTER_COLS = 7;
const RASTER_ROWS = 5;
const MAX_REST = RASTER_COLS * RASTER_ROWS;

/**
 * Zielflaechen. Spec: Form x 0,22–0,36, Kasten z 0,10–0,30. Verschoben, damit
 * nichts den gelben Block (x ≤ 0,262) oder den Haftnotiz-Wuerfel
 * (x 0,414–0,486, z 0,049–0,121, 2,2 cm hoch) des Modells schneidet.
 */
const FORME = Object.freeze({ cx: PROOF_STRIP.x, z: -0.05 });
const RASTER = Object.freeze({ x: [0.3, 0.5] as const, z: [0.14, 0.32] as const });
const SCATTER = Object.freeze({ x: [0.15, 0.55] as const, z: [-0.35, 0.35] as const });

/** Radius der Grundflaeche bei beliebigem Yaw (halbe Diagonale) */
const FOOTPRINT = 0.0215;
const MIN_DISTANCE = 0.04;
const MAX_ATTEMPTS = 240;
const SEED = 3;
const LIFT_EPS = 0.0005;

/** Ordnung ueber cut2 0 → 0,8, Verzoegerung i · 0,012, Hub 0,03·sin(π·t) */
const ORDER_END = 0.8;
const STAGGER = 0.012;
const HUB = 0.03;
const FLIGHT_PITCH = 0.18;
const CHANGE_EPS = 1e-5;

interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface SortLayout {
  readonly count: number;
  /** je Letter x, y, z, yaw (verstreut) */
  readonly from: Float32Array;
  /** je Letter x, y, z (geordnet) */
  readonly to: Float32Array;
  /** je Letter Atlas-Spalte, -Zeile von unten */
  readonly cells: Float32Array;
}

function expand(r: Rect, m: number): Rect {
  return { minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m };
}

function circleInside(x: number, z: number, r: number, rect: Rect): boolean {
  return x - r >= rect.minX && x + r <= rect.maxX && z - r >= rect.minZ && z + r <= rect.maxZ;
}

function circleTouches(x: number, z: number, r: number, rect: Rect): boolean {
  const cx = Math.max(rect.minX, Math.min(x, rect.maxX));
  const cz = Math.max(rect.minZ, Math.min(z, rect.maxZ));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

const FORME_RECT: Rect = {
  minX: FORME.cx - (FORME_LENGTH / 2) * LEAD_PITCH,
  maxX: FORME.cx + (FORME_LENGTH / 2) * LEAD_PITCH,
  minZ: FORME.z - BODY.d / 2,
  maxZ: FORME.z + BODY.d / 2,
};
const PROOF_RECT: Rect = {
  minX: PROOF_STRIP.x - PROOF_STRIP.w / 2,
  maxX: PROOF_STRIP.x + PROOF_STRIP.w / 2,
  minZ: PROOF_STRIP.z - PROOF_STRIP.h / 2,
  maxZ: PROOF_STRIP.z + PROOF_STRIP.h / 2,
};
const RASTER_RECT: Rect = {
  minX: RASTER.x[0] - BODY.w / 2,
  maxX: RASTER.x[1] + BODY.w / 2,
  minZ: RASTER.z[0] - BODY.d / 2,
  maxZ: RASTER.z[1] + BODY.d / 2,
};
const KEEP_FREE: readonly Rect[] = [FORME_RECT, PROOF_RECT, RASTER_RECT].map((r) => expand(r, FOOTPRINT + 0.004));

/** Auflagehoehe an (x, z) oder null, wenn die Letter eine Kante schneiden wuerde. */
function restHeight(x: number, z: number, baseY: number, obstacles: readonly PadObstacle[]): number | null {
  let y = baseY;
  for (const o of obstacles) {
    if (circleInside(x, z, FOOTPRINT, o)) y = Math.max(y, o.top + LIFT_EPS);
    else if (circleTouches(x, z, FOOTPRINT, o)) return null;
  }
  return y;
}

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function scatterOne(
  rnd: () => number,
  placed: readonly Placed[],
  baseY: number,
  obstacles: readonly PadObstacle[],
): Placed {
  let fallback: Placed = { x: SCATTER.x[0], y: baseY, z: SCATTER.z[0] };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const x = lerp(SCATTER.x[0], SCATTER.x[1], rnd());
    const z = lerp(SCATTER.z[0], SCATTER.z[1], rnd());
    fallback = { x, y: baseY, z };
    if (KEEP_FREE.some((r) => circleTouches(x, z, FOOTPRINT, r))) continue;
    if (placed.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < MIN_DISTANCE * MIN_DISTANCE)) continue;
    const y = restHeight(x, z, baseY, obstacles);
    if (y !== null) return { x, y, z };
  }
  return fallback;
}

function rasterSlot(slot: number): readonly [number, number] {
  const col = slot % RASTER_COLS;
  const row = Math.floor(slot / RASTER_COLS);
  return [
    lerp(RASTER.x[0], RASTER.x[1], col / (RASTER_COLS - 1)),
    lerp(RASTER.z[0], RASTER.z[1], row / (RASTER_ROWS - 1)),
  ];
}

/**
 * Deterministisches Layout (mulberry32(3)): Index = Verzoegerung. Die fuenf
 * Form-Lettern kommen zuerst, dann die uebrigen; deren Kastenplaetze werden
 * nach Lage vergeben (hinterste Letter → hinterer Platz), damit die Wege
 * kurz und weitgehend parallel bleiben.
 */
function buildLayout(count: number, baseY: number, obstacles: readonly PadObstacle[], formeWord: string): SortLayout {
  const rnd = mulberry32(SEED);
  const rest = Math.max(0, Math.min(MAX_REST, count - FORME_LENGTH));
  const total = FORME_LENGTH + rest;
  const from = new Float32Array(total * 4);
  const to = new Float32Array(total * 3);
  const cells = new Float32Array(total * 2);
  const restY = baseY + LIFT_EPS;

  const scattered = Array.from({ length: total }).reduce<readonly Placed[]>(
    (acc) => [...acc, scatterOne(rnd, acc, restY, obstacles)],
    [],
  );
  const yaws = scattered.map(() => (rnd() * 2 - 1) * Math.PI);
  const restLetters = Array.from({ length: rest }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)] ?? 'A');

  // Kasten-Plaetze nach Lage zuordnen (kurze, parallele Wege): sortiert nach z, dann x
  const restOrder = scattered
    .slice(FORME_LENGTH)
    .map((p, i) => ({ i, key: p.z * 10 + p.x }))
    .sort((a, b) => a.key - b.key)
    .map((e) => e.i);

  if (process.env.NODE_ENV !== 'production') {
    console.assert([...formeWord].length === FORME_LENGTH, '[LeadType] Formwort muss 5 Lettern haben');
  }
  for (let i = 0; i < total; i += 1) {
    const p = scattered[i] ?? { x: 0, y: restY, z: 0 };
    from.set([p.x, p.y, p.z, yaws[i] ?? 0], i * 4);
    let cell: number;
    if (i < FORME_LENGTH) {
      // Kachel i des gespiegelten Streifens (von links), siehe drawLeadAtlas
      to.set([FORME.cx + (i - (FORME_LENGTH - 1) / 2) * LEAD_PITCH, restY, FORME.z], i * 3);
      cell = ATLAS_MEDIA_START + i;
    } else {
      const r = i - FORME_LENGTH;
      const slot = restOrder.indexOf(r);
      const [sx, sz] = rasterSlot(slot < 0 ? r : slot);
      to.set([sx, restY, sz], i * 3);
      cell = atlasIndexOfLetter(restLetters[r] ?? 'A');
    }
    cells.set(atlasCellOffset(cell), i * 2);
  }
  return { count: total, from, to, cells };
}

function createLeadGeometry(cells: Float32Array): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(BODY.w, BODY.h, BODY.d);
  body.translate(0, BODY.h / 2, 0);
  const cap = new THREE.PlaneGeometry(LEAD_CAP_SIZE, LEAD_CAP_SIZE);
  cap.rotateX(-Math.PI / 2);
  cap.translate(0, BODY.h + 0.0003, 0);
  const merged = mergeGeometries([body, cap], true);
  body.dispose();
  cap.dispose();
  if (!merged) throw new Error('[LeadType] Geometrie konnte nicht zusammengefuehrt werden');
  merged.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  return merged;
}

const CELL_SCALE = (1 / ATLAS.grid).toFixed(6);

/** Kappe: MeshStandardMaterial mit Atlas; UV-Offset je Instanz aus aCell. */
function createCapMaterial(atlas: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: atlas,
    emissiveMap: atlas,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.16,
    metalness: 0.55,
    roughness: 0.42,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', () => '#include <common>\nattribute vec2 aCell;')
      .replace(
        '#include <uv_vertex>',
        () => `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = ( vMapUv + aCell ) * ${CELL_SCALE};
#endif
#ifdef USE_EMISSIVEMAP
  vEmissiveMapUv = ( vEmissiveMapUv + aCell ) * ${CELL_SCALE};
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'p4-lead-cap';
  return material;
}

function createBodyMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: COLORS.lead, metalness: 0.8, roughness: 0.45 });
}

const scratchMatrix = new THREE.Matrix4();
const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const unitScale = new THREE.Vector3(1, 1, 1);

/** Schreibt alle Instanz-Matrizen fuer den Ordnungsfortschritt cut2. */
function writeSortMatrices(mesh: THREE.InstancedMesh, layout: SortLayout, cut2: number): void {
  const p = clamp01(cut2 / ORDER_END);
  const span = Math.max(0.1, 1 - (layout.count - 1) * STAGGER);
  for (let i = 0; i < layout.count; i += 1) {
    const t = clamp01((p - i * STAGGER) / span);
    const e = power3InOut(t);
    const f = i * 4;
    const g = i * 3;
    const hop = Math.sin(Math.PI * t);
    scratchPos.set(
      lerp(layout.from[f], layout.to[g], e),
      lerp(layout.from[f + 1], layout.to[g + 1], e) + HUB * hop,
      lerp(layout.from[f + 2], layout.to[g + 2], e),
    );
    scratchEuler.set(FLIGHT_PITCH * hop, lerp(layout.from[f + 3], 0, e), 0);
    scratchQuat.setFromEuler(scratchEuler);
    scratchMatrix.compose(scratchPos, scratchQuat, unitScale);
    mesh.setMatrixAt(i, scratchMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

interface WriteState {
  mesh: THREE.InstancedMesh | null;
  cut2: number;
}

export default function LeadType({ id, reduced, count, baseY, obstacles }: LeadTypeProps) {
  const fonts = useMemo(() => resolvePaperFonts(), []);
  const specs = useMemo(() => leadFontSpecs(fonts), [fonts]);
  const formeWord = COPY.scene3d.proof;
  const atlas = useCanvasTexture(
    ATLAS.size,
    ATLAS.size,
    (ctx, w) => drawLeadAtlas(ctx, w, fonts, formeWord),
    [fonts, formeWord],
    specs,
  );

  const layout = useMemo(
    () => buildLayout(count, baseY, obstacles, formeWord),
    [count, baseY, obstacles, formeWord],
  );
  const geometry = useMemo(() => createLeadGeometry(layout.cells), [layout]);
  const bodyMaterial = useMemo(() => createBodyMaterial(), []);
  const capMaterial = useMemo(() => (atlas ? createCapMaterial(atlas) : null), [atlas]);
  const mesh = useMemo(() => {
    if (!capMaterial) return null;
    const instanced = new THREE.InstancedMesh(geometry, [bodyMaterial, capMaterial], layout.count);
    instanced.frustumCulled = false;
    return instanced;
  }, [geometry, bodyMaterial, capMaterial, layout.count]);
  const written = useRef<WriteState>({ mesh: null, cut2: -1 });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);
  useEffect(() => () => capMaterial?.dispose(), [capMaterial]);
  useEffect(() => {
    keepAlive(200);
    return () => mesh?.dispose();
  }, [mesh]);

  useFrame(() => {
    if (!frame.stationVisible[id] || !mesh) return;
    const { cut2 } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
    const state = written.current;
    if (state.mesh === mesh && Math.abs(state.cut2 - cut2) < CHANGE_EPS) return;
    writeSortMatrices(mesh, layout, cut2);
    state.mesh = mesh;
    state.cut2 = cut2;
  });

  if (!mesh) return null;
  return <primitive object={mesh} />;
}
