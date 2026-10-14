'use client';

/**
 * Station I – Marke, Schnitt 1 (Leistung 01, MVP): zwei Spraydosen, die eine
 * steigende 6°-Ebene umfaerbt (DESIGN_SPEC §3.3.1). Dose A wird Orange,
 * Dose B Paper; die Schnittkante glueht nur waehrend des Schnitts.
 *
 * Koordinaten Station-lokal. Materialien werden pro Knoten geklont, der
 * useGLTF-Cache bleibt unveraendert.
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS, CUT_TAN } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { lerp, smoothstep } from '@/lib/scene/math';
import { CUT_LOCAL_NORMAL, STATIONS, stationPhases, type Vec3Tuple } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { createCutUniforms, patchCutMaterial, setCutPlaneFromObject, type CutUniforms } from '@/lib/three/cut';

export const CANS = Object.freeze({
  position: [-0.28, 1.03, -0.2] as Vec3Tuple,
  rotY: 0.35,
  /** Bounding Box (ASSETS.md) 0,217 m hoch → 0,42 m */
  scale: 1.935,
  targetHeight: 0.42,
  nodeA: 'spray_paint_bottles_02',
  nodeB: 'spray_paint_bottles_02_dented',
  belowA: COLORS.brand,
  belowB: COLORS.paper,
  belowRoughness: 0.55,
  belowMetalness: 0.1,
  /** Ebenen-Origin y = mix(0.97, 1.50, cut1); per Bounding Box nur erweitert, nie verkuerzt */
  planeY: [0.97, 1.5] as const,
  edge: 0.012,
  glowStrength: 3,
});

const SCALE_TOLERANCE = 0.05;

/** Gluehen nur waehrend des Schnitts: 0 bei c = 0 und c = 1, dazwischen 1. */
export function cutGlowEnvelope(c: number): number {
  return smoothstep(0, 0.04, c) * (1 - smoothstep(0.96, 1, c));
}

// ---------------------------------------------------------------------------
// Geometrie-Helfer (rein lesend auf dem Cache)
// ---------------------------------------------------------------------------

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  return meshes;
}

function nodeName(o: THREE.Object3D): string {
  const original: unknown = o.userData.name;
  return typeof original === 'string' ? original : o.name;
}

function findCan(meshes: readonly THREE.Mesh[], name: string): THREE.Mesh | undefined {
  return meshes.find((m) => nodeName(m) === name) ?? meshes.find((m) => m.name === name);
}

/** Lokale Matrix von `obj` bis (ausschliesslich) `root`, ohne Matrizen des Caches zu aendern. */
function matrixToRoot(obj: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  const result = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) {
    local.compose(o.position, o.quaternion, o.scale);
    result.premultiply(local);
  }
  return result;
}

/** Bounding Box der Geometrie, ohne die gecachte Geometrie zu veraendern. */
function geometryBox(geometry: THREE.BufferGeometry): THREE.Box3 {
  if (geometry.boundingBox) return geometry.boundingBox.clone();
  const position = geometry.getAttribute('position');
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) box.expandByPoint(v.fromBufferAttribute(position, i));
  return box;
}

/** Modell → Station-lokal (Position, rotY, Skala der Dosen-Gruppe). */
function cansToStation(): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...CANS.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, CANS.rotY, 0)),
    new THREE.Vector3(CANS.scale, CANS.scale, CANS.scale),
  );
}

function stationBox(mesh: THREE.Mesh, root: THREE.Object3D): THREE.Box3 {
  return geometryBox(mesh.geometry).applyMatrix4(cansToStation().multiply(matrixToRoot(mesh, root)));
}

/**
 * Ebenen-Bereich, der die Dosen sicher von „ganz oberhalb“ nach „ganz
 * unterhalb“ bringt (inkl. Kantenbreite). Spec-Werte bleiben Mindestbereich.
 */
function sweepRange(meshes: readonly THREE.Mesh[], root: THREE.Object3D): readonly [number, number] {
  const corner = new THREE.Vector3();
  const offsets = meshes.flatMap((mesh) => {
    const box = geometryBox(mesh.geometry);
    const m = cansToStation().multiply(matrixToRoot(mesh, root));
    return Array.from({ length: 8 }, (_, i) => {
      corner
        .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .applyMatrix4(m);
      return corner.y - CUT_TAN * corner.x;
    });
  });
  if (offsets.length === 0) return CANS.planeY;
  return [
    Math.min(CANS.planeY[0], Math.min(...offsets) - CANS.edge),
    Math.max(CANS.planeY[1], Math.max(...offsets) + CANS.edge),
  ];
}

/** Duese von Dose A (Mitte der Oberseite) in Station-lokalen Koordinaten. */
export function canNozzleLocal(source: THREE.Object3D): Vec3Tuple {
  const meshes = collectMeshes(source);
  const can = findCan(meshes, CANS.nodeA) ?? meshes[0];
  if (!can) return [CANS.position[0], CANS.position[1] + CANS.targetHeight, CANS.position[2]];
  const box = stationBox(can, source);
  const center = box.getCenter(new THREE.Vector3());
  return [center.x, box.max.y, center.z];
}

// ---------------------------------------------------------------------------
// Rig: Klon + Materialien
// ---------------------------------------------------------------------------

interface CansRig {
  readonly root: THREE.Object3D;
  readonly materials: readonly THREE.MeshStandardMaterial[];
  /** Ebene, Kante und Gluehen sind fuer beide Dosen dieselben Uniform-Objekte */
  readonly uniforms: CutUniforms;
  readonly range: readonly [number, number];
}

function cloneStandard(material: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial {
  const source = Array.isArray(material) ? material[0] : material;
  return source instanceof THREE.MeshStandardMaterial ? source.clone() : new THREE.MeshStandardMaterial();
}

function assertScale(root: THREE.Object3D): void {
  if (process.env.NODE_ENV === 'production') return;
  const height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y * CANS.scale;
  console.assert(
    Math.abs(height - CANS.targetHeight) / CANS.targetHeight < SCALE_TOLERANCE,
    `[StationMarke] Dosenhoehe ${height.toFixed(3)} m statt ${CANS.targetHeight} m`,
  );
}

function buildCansRig(source: THREE.Object3D): CansRig {
  const root = source.clone(true);
  const meshes = collectMeshes(root);
  const canA = findCan(meshes, CANS.nodeA) ?? meshes[0];
  const canB = findCan(meshes, CANS.nodeB) ?? meshes.find((m) => m !== canA);

  const uniforms = createCutUniforms({
    uBelowColor: CANS.belowA,
    uBelowRoughness: CANS.belowRoughness,
    uBelowMetalness: CANS.belowMetalness,
    uCutEdge: CANS.edge,
    uCutGlowStrength: 0,
  });
  // Dose B teilt Ebene/Kante/Gluehen (gleiche Uniform-Objekte), nur die Zielfarbe ist eigen.
  const uniformsB: CutUniforms = { ...uniforms, uBelowColor: { value: new THREE.Color(CANS.belowB) } };

  const pairs: readonly (readonly [THREE.Mesh | undefined, CutUniforms])[] = [
    [canA, uniforms],
    [canB, uniformsB],
  ];
  const materials = pairs.flatMap(([mesh, u]) => {
    if (!mesh) return [];
    const material = cloneStandard(mesh.material);
    patchCutMaterial(material, u, { key: 'marke-cans', mode: 'recolor', space: 'world' });
    mesh.material = material;
    return [material];
  });

  if (process.env.NODE_ENV !== 'production') {
    console.assert(Boolean(canA && canB), '[StationMarke] Dosen-Knoten im GLB nicht gefunden');
    assertScale(root);
  }

  const cans = [canA, canB].filter((m): m is THREE.Mesh => m !== undefined);
  return { root, materials, uniforms, range: sweepRange(cans, root) };
}

// ---------------------------------------------------------------------------
// Laufzeit (Hot Path: Uniform-Werte werden bewusst in-place gesetzt)
// ---------------------------------------------------------------------------

const scratchOrigin = new THREE.Vector3();

function applyCansCut(rig: CansRig, stationFrame: THREE.Object3D, planeY: number, glow: number): void {
  setCutPlaneFromObject(rig.uniforms, stationFrame, scratchOrigin.set(0, planeY, 0), CUT_LOCAL_NORMAL);
  rig.uniforms.uCutGlowStrength.value = glow;
}

interface SprayCansProps {
  id: StationId;
  reduced: boolean;
  /** Gruppe mit Station-lokalem Koordinatensystem (Ursprung = Sockelmitte am Boden) */
  frameRef: RefObject<THREE.Group | null>;
  /** gecachte GLB-Szene (useGLTF), wird nur geklont */
  source: THREE.Object3D;
}

export default function SprayCans({ id, reduced, frameRef, source }: SprayCansProps) {
  const rig = useMemo(() => buildCansRig(source), [source]);
  const last = useRef({ planeY: Number.NaN, glow: Number.NaN });

  useEffect(
    () => () => {
      rig.materials.forEach((m) => m.dispose());
    },
    [rig],
  );

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const stationFrame = frameRef.current;
    if (!stationFrame) return;
    const [beatA, beatB] = STATIONS[id].beats;
    // Reduced: stationPhases liefert cut1 = 1 (Dosen fertig umgefaerbt, kein Gluehen)
    const { cut1 } = stationPhases(frame.beats[beatA], frame.beats[beatB], reduced);
    const planeY = lerp(rig.range[0], rig.range[1], cut1);
    const glow = CANS.glowStrength * cutGlowEnvelope(cut1);
    const state = last.current;
    if (state.planeY === planeY && state.glow === glow) return;
    applyCansCut(rig, stationFrame, planeY, glow);
    state.planeY = planeY;
    state.glow = glow;
    keepAlive();
  });

  return (
    <group position={[...CANS.position]} rotation-y={CANS.rotY} scale={CANS.scale}>
      <primitive object={rig.root} />
    </group>
  );
}
