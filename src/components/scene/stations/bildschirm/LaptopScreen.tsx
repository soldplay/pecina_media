'use client';

/**
 * Station II – Bildschirm, beide Schnitte (Leistungen 03 · 04, MVP),
 * DESIGN_SPEC §3.3.2:
 *   Schnitt 1: Bildschirm DOS → Website (uCut1 = cut1), Gehaeuse Plastik → Alu
 *              (recolor, Ebene y 0,98 → 1,80 synchron)
 *   Schnitt 2: zweiter 6°-Sweep Website → Feed (uCut2 = cut2)
 * Der Cursor-Block blinkt 2-mal (0,5 s) ab Eintritt in beat a (screen.config CURSOR),
 * danach dauerhaft an (zeitbasiert, keepAlive einmal beim Ausloesen).
 *
 * Koordinaten Station-lokal; das Modell wird geklont, Materialien werden
 * ersetzt bzw. geklont — der useGLTF-Cache bleibt unveraendert.
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COPY } from '@/content/site';
import { CUT_TAN, FONT_VARS } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { lerp } from '@/lib/scene/math';
import { CUT_LOCAL_NORMAL, STATIONS, stationPhases } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { createCutUniforms, patchCutMaterial, setCutPlaneFromObject, type CutUniforms } from '@/lib/three/cut';
import { resolveFontFamily, useCanvasTexture } from '@/lib/three/canvas-texture';
import {
  applyScreenState,
  applyScreenTextures,
  createScreenMaterial,
  findMeshesByMaterial,
  findScreenMesh,
  geometryBox,
  laptopToStation,
  matrixToRoot,
  type ScreenMaterialResult,
} from './screen-material';
import {
  CURSOR,
  FALLBACK_SCREEN,
  FEED_SCREEN_MOTIFS,
  HOUSING,
  HOUSING_MATERIAL_NAME,
  LAPTOP,
  REDUCED_STILL,
  SCREEN_FLIP,
  SCREEN_TEXTURE,
  cutGlowEnvelope,
} from './screen.config';
import { drawDos, drawFeed, drawWeb, feedFontSpecs, webFontSpecs } from './textures';

const SCALE_TOLERANCE = 0.05;

const FEED_MOTIFS: readonly string[] = FEED_SCREEN_MOTIFS.map((i) => COPY.scene3d.feed[i]).filter(
  (t): t is (typeof COPY.scene3d.feed)[number] => typeof t === 'string',
);

// ---------------------------------------------------------------------------
// Rig: Klon, Gehaeuse-Material, Bildschirm-Shader
// ---------------------------------------------------------------------------

interface LaptopRig {
  readonly root: THREE.Object3D;
  readonly housing: THREE.MeshStandardMaterial | null;
  readonly cut: CutUniforms;
  readonly screen: ScreenMaterialResult;
  /** nur gesetzt, wenn das Bildschirm-Primitiv fehlte */
  readonly fallbackGeometry: THREE.BufferGeometry | null;
  readonly range: readonly [number, number];
}

function cloneStandard(material: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial {
  const source = Array.isArray(material) ? material[0] : material;
  return source instanceof THREE.MeshStandardMaterial ? source.clone() : new THREE.MeshStandardMaterial();
}

/**
 * Ebenen-Bereich, der das Gehaeuse sicher von „ganz oberhalb“ nach „ganz
 * unterhalb“ bringt. Die Spec-Werte (0,98 → 1,80) bleiben Mindestbereich;
 * die 6°-Neigung laesst sonst die linke obere Deckelecke unverwandelt.
 */
function sweepRange(meshes: readonly THREE.Mesh[], root: THREE.Object3D): readonly [number, number] {
  const corner = new THREE.Vector3();
  const toStation = laptopToStation();
  const offsets = meshes.flatMap((mesh) => {
    const box = geometryBox(mesh.geometry);
    const m = toStation.clone().multiply(matrixToRoot(mesh, root));
    return Array.from({ length: 8 }, (_, i) => {
      corner
        .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .applyMatrix4(m);
      return corner.y - CUT_TAN * corner.x;
    });
  });
  if (offsets.length === 0) return HOUSING.planeY;
  return [
    Math.min(HOUSING.planeY[0], Math.min(...offsets) - HOUSING.edge),
    Math.max(HOUSING.planeY[1], Math.max(...offsets) + HOUSING.edge),
  ];
}

function createFallbackScreen(root: THREE.Object3D): { mesh: THREE.Mesh; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.PlaneGeometry(...FALLBACK_SCREEN.size);
  const mesh = new THREE.Mesh(geometry);
  mesh.position.set(...FALLBACK_SCREEN.center);
  root.add(mesh);
  return { mesh, geometry };
}

function assertLaptop(root: THREE.Object3D, screenFound: boolean): void {
  if (process.env.NODE_ENV === 'production') return;
  console.assert(screenFound, '[StationBildschirm] Bildschirm-Primitiv fehlt, Ersatz-Plane aktiv');
  const width = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).x * LAPTOP.scale;
  console.assert(
    Math.abs(width - LAPTOP.targetWidth) / LAPTOP.targetWidth < SCALE_TOLERANCE,
    `[StationBildschirm] Laptopbreite ${width.toFixed(3)} m statt ${LAPTOP.targetWidth} m`,
  );
}

function buildLaptopRig(source: THREE.Object3D): LaptopRig {
  const root = source.clone(true);
  const cut = createCutUniforms({
    uBelowColor: HOUSING.below,
    uBelowRoughness: HOUSING.roughness,
    uBelowMetalness: HOUSING.metalness,
    uCutEdge: HOUSING.edge,
    uCutGlowStrength: 0,
  });

  // Gehaeuse: Material einmal klonen, allen Meshes zuweisen
  const housingMeshes = findMeshesByMaterial(root, HOUSING_MATERIAL_NAME);
  const housing = housingMeshes.length > 0 ? cloneStandard(housingMeshes[0].material) : null;
  if (housing) {
    patchCutMaterial(housing, cut, { key: 'bildschirm-housing', mode: 'recolor', space: 'world' });
    housingMeshes.forEach((m) => {
      m.material = housing;
    });
  }

  const found = findScreenMesh(root);
  const fallback = found ? null : createFallbackScreen(root);
  const screenMesh = found ?? fallback?.mesh;
  const screen = createScreenMaterial(
    screenMesh ? geometryBox(screenMesh.geometry) : new THREE.Box3(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 0)),
    SCREEN_FLIP,
  );
  if (screenMesh) screenMesh.material = screen.material;

  assertLaptop(root, Boolean(found));
  return {
    root,
    housing,
    cut,
    screen,
    fallbackGeometry: fallback?.geometry ?? null,
    range: sweepRange(housingMeshes, root),
  };
}

function disposeLaptopRig(rig: LaptopRig): void {
  rig.housing?.dispose();
  rig.screen.material.dispose();
  rig.fallbackGeometry?.dispose();
}

// ---------------------------------------------------------------------------
// Laufzeit
// ---------------------------------------------------------------------------

interface CursorState {
  armed: boolean;
  /** performance.now() beim Eintritt, −1 = nicht ausgeloest */
  start: number;
}

/** CURSOR.blinks-mal (Periode CURSOR.periodMs) ab Eintritt in beat a, sonst an. */
function cursorValue(s: CursorState, a: number, now: number): number {
  if (a < CURSOR.rearmBelow) {
    s.armed = true;
    s.start = -1;
    return 1;
  }
  if (s.armed && a > CURSOR.armAbove) {
    s.armed = false;
    s.start = now;
    keepAlive(CURSOR.keepAliveMs);
  }
  if (s.start < 0) return 1;
  const elapsed = now - s.start;
  if (elapsed >= CURSOR.periodMs * CURSOR.blinks) return 1;
  return elapsed % CURSOR.periodMs < CURSOR.periodMs / 2 ? 1 : 0;
}

interface LaptopState {
  planeY: number;
  glow: number;
  cut1: number;
  cut2: number;
  cursorOn: number;
}

function sameState(a: LaptopState, b: LaptopState): boolean {
  return (
    a.planeY === b.planeY && a.glow === b.glow && a.cut1 === b.cut1 && a.cut2 === b.cut2 && a.cursorOn === b.cursorOn
  );
}

const scratchOrigin = new THREE.Vector3();

/** Hot Path: Uniform-Werte werden bewusst in-place gesetzt (kein Recompile). */
function applyLaptopState(rig: LaptopRig, stationFrame: THREE.Object3D, s: LaptopState): void {
  setCutPlaneFromObject(rig.cut, stationFrame, scratchOrigin.set(0, s.planeY, 0), CUT_LOCAL_NORMAL);
  rig.cut.uCutGlowStrength.value = s.glow;
  applyScreenState(rig.screen.uniforms, s.cut1, s.cut2, s.cursorOn);
}

function nextLaptopState(rig: LaptopRig, a: number, b: number, reduced: boolean, cursor: CursorState): LaptopState {
  if (reduced) {
    return {
      planeY: lerp(rig.range[0], rig.range[1], REDUCED_STILL.housing),
      // statische, gluehende Naht wie an den Sockeln
      glow: HOUSING.glowStrength,
      cut1: REDUCED_STILL.cut1,
      cut2: REDUCED_STILL.cut2,
      cursorOn: REDUCED_STILL.cursorOn,
    };
  }
  const { cut1, cut2 } = stationPhases(a, b, false);
  return {
    planeY: lerp(rig.range[0], rig.range[1], cut1),
    glow: HOUSING.glowStrength * cutGlowEnvelope(cut1),
    cut1,
    cut2,
    cursorOn: cursorValue(cursor, a, performance.now()),
  };
}

interface LaptopScreenProps {
  id: StationId;
  reduced: boolean;
  /** Gruppe mit Station-lokalem Koordinatensystem (Ursprung = Sockelmitte am Boden) */
  frameRef: RefObject<THREE.Group | null>;
  /** gecachte GLB-Szene (useGLTF), wird nur geklont */
  source: THREE.Object3D;
}

export default function LaptopScreen({ id, reduced, frameRef, source }: LaptopScreenProps) {
  const rig = useMemo(() => buildLaptopRig(source), [source]);
  const display = useMemo(() => resolveFontFamily(FONT_VARS.display), []);
  const { aspect } = rig.screen;
  const { width, height } = SCREEN_TEXTURE;

  const dos = useCanvasTexture(width, height, (ctx, w, h) => drawDos(ctx, w, h, COPY.scene3d.dos), []);
  const web = useCanvasTexture(
    width,
    height,
    (ctx, w, h) =>
      drawWeb(ctx, w, h, {
        family: display,
        headline: COPY.scene3d.webHeadline,
        button: COPY.scene3d.webButton,
        aspect,
      }),
    [display, aspect],
    webFontSpecs(display),
  );
  const feed = useCanvasTexture(
    width,
    height,
    (ctx, w, h) => drawFeed(ctx, w, h, { family: display, motifs: FEED_MOTIFS, aspect }),
    [display, aspect],
    feedFontSpecs(display),
  );

  const cursor = useRef<CursorState>({ armed: true, start: -1 });
  const last = useRef<LaptopState | null>(null);

  useEffect(() => () => disposeLaptopRig(rig), [rig]);

  useEffect(() => {
    applyScreenTextures(rig.screen.uniforms, dos, web, feed);
    keepAlive();
  }, [rig, dos, web, feed]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const stationFrame = frameRef.current;
    if (!stationFrame) return;
    const [beatA, beatB] = STATIONS[id].beats;
    const next = nextLaptopState(rig, frame.beats[beatA], frame.beats[beatB], reduced, cursor.current);
    if (last.current && sameState(last.current, next)) return;
    last.current = next;
    // Kein keepAlive() hier (Abnahme 14.10.2026): Der Zustand folgt Scroll (dessen
    // keepAlive deckt das ab) und dem Cursor-Blink (keepAlive(CURSOR.keepAliveMs) beim
    // Ausloesen). Ein Aufruf beim letzten Blink-Wechsel startete sonst den Nachlauf neu.
    applyLaptopState(rig, stationFrame, next);
  });

  return (
    <group position={[...LAPTOP.position]} scale={LAPTOP.scale}>
      <primitive object={rig.root} />
    </group>
  );
}
