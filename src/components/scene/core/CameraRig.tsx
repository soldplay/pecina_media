'use client';

/**
 * Durchgehende Kamerafahrt der Startseite (DESIGN_SPEC §3.9). Rendert nichts.
 *
 * Pro Frame (Bewegung an):
 *   1. Bei neuer layout.version, compact-/Bewegungswechsel oder neuer Groesse:
 *      Bildausschnitt messen (framing-probe: H1-Band, Text-Karten, Header),
 *      Hero-Pose S0 berechnen (hero-framing), Keys neu aufloesen und auf einen
 *      streng steigenden Pfad bringen (pathKeys).
 *   2. Pose an window.scrollY: sine.inOut im Segment, zentripetaler Catmull-Rom,
 *      vor einem cut-Key halten (camera-keys.ts). Die Pose enthaelt FOV, Roll
 *      und den Bildausschnitt (setViewOffset x/y) — alles scroll-gebunden.
 *   3. Pointer-Parallaxe (nur start, feiner Pointer, damp 0,3 s).
 *   4. maath easing.damp3 auf Position und Blickziel (0,18 s), gleiche Daempfung
 *      fuer FOV, Roll und Ausschnitt; lookAt, Roll, Projektion nur bei Aenderung.
 *   5. Nebel-Ausgleich: steht die Kamera weiter als 16 m vor der Skulptur
 *      (Hero-Pose kleiner Fenster, Kontakt), sinkt die Nebeldichte im selben
 *      Verhaeltnis — die Skulptur ist so stark eingenebelt wie im alten S0.
 *   6. requestFrames() statt keepAlive(), solange etwas nachlaeuft (settle.ts):
 *      kein neuer 1,2-s-Nachlauf pro Frame (Ruhe-Kriterium §6.1).
 *   Erster Frame, Sprung ueber einen cut-Key (Key E in der verdeckten Strecke,
 *   waehrend frameloop 'never') und Scroll-Spruenge > 1,5 Viewporthoehen: ohne Daempfung.
 *
 * Reduced: keine Interpolation, keine Daempfung. Kamera = Halte-Key des Bereichs;
 * ein invalidate() pro Wechsel (UI-Abo unten).
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type RootState } from '@react-three/fiber';
import { easing } from 'maath';
import { CUT_TAN } from '@/lib/brand';
import { STATION_IDS, type StationId } from '@/lib/scene/ids';
import { HERO_BLADE_SCREEN_Y, STATIONS, WORLD } from '@/lib/scene/stations';
import { anchorY, frame, layout, ui, type UiState } from '@/lib/scene/store';
import { sculptureLift } from '../hero/hero-timeline';
import {
  cameraKeyById,
  createPose,
  crossesCut,
  findOrderIssues,
  HERO_KEY_ID,
  lastHoldKeyAtOrBefore,
  pathKeys,
  reducedHoldKeyId,
  resolveCameraKeys,
  resolveKeyPose,
  sampleCameraPath,
  writeKeyPose,
  type CameraFraming,
  type CameraPose,
  type ResolvedCameraKey,
} from './camera-keys';
import { probeFraming } from './framing-probe';
import { fitHeroPose } from './hero-framing';
import { requestFrames, trackSettleWindow } from './settle';
import {
  applyViewOffset,
  haltungShiftX,
  stationShiftX,
  stationShiftY,
  VIEW_X_SHIFT_HALTUNG,
  VIEW_Y_SHIFT_COMPACT,
} from './view-offset';

/** useFrame-Prioritaet: Kamera zuerst (negativ = kein Eingriff ins Auto-Rendering). */
export const CAMERA_RIG_PRIORITY = -3;

const SMOOTH_TIME = 0.18;
const PARALLAX_SMOOTH_TIME = 0.3;
const PARALLAX_X = 0.15;
const PARALLAX_Y = 0.08;
/** Groesseres Frame-Delta (nach Ruhephasen) wird gekappt, sonst springt die Daempfung. */
const MAX_DT = 0.1;
/** Scroll-Sprung pro gerendertem Frame, ab dem ohne Daempfung gesetzt wird (in Viewporthoehen). */
const SNAP_SCROLL_VIEWPORTS = 1.5;
const SETTLE_EPS = 1e-4;
const ANGLE_SETTLE_EPS = 1e-3;
/**
 * Restbewegung, unter der die Kamera aufs Ziel springt (Fix-Runde 3, Ruhe):
 * 2 mm bzw. 0,02° liegen unter einem Bildpixel. Ohne das daempfte maath einen
 * 12-m-Weg (Hero → Durchflug) erst nach ~1,2 s auf 0,1 mm aus.
 */
const SNAP_TOLERANCE = Object.freeze({ distance: 2e-3, angle: 0.02, shift: 2e-4 });
const FOV_APPLY_EPS = 0.01;
/** Oeffnung o der Skulptur in S0 (hero-timeline: Reduced 0,35, sonst 0) */
const HERO_OPEN = Object.freeze({ full: 0, reduced: 0.35 });
/** Kameraabstand des alten S0; weiter weg wird der Nebel im selben Verhaeltnis duenner. */
const FOG_REFERENCE_Z = 16;
const FOG_EPS = 1e-7;

interface DampScalars {
  fov: number;
  roll: number;
  shiftX: number;
  shiftY: number;
}

interface RigState {
  /** layout.version | compact | motion | Groesse der letzten Aufloesung */
  signature: string;
  framing: CameraFraming | null;
  canonical: readonly ResolvedCameraKey[];
  sorted: readonly ResolvedCameraKey[];
  fallback: ResolvedCameraKey;
  initialized: boolean;
  lastY: number;
  readonly finePointer: MediaQueryList | null;
  readonly pose: CameraPose;
  readonly goalPos: THREE.Vector3;
  readonly goalTgt: THREE.Vector3;
  readonly lookTarget: THREE.Vector3;
  readonly parallax: THREE.Vector3;
  readonly parallaxGoal: THREE.Vector3;
  readonly scalars: DampScalars;
}

const SPEC_FRAMING: CameraFraming = Object.freeze({
  compact: false,
  width: 0,
  height: 0,
  safeTop: 0,
  hero: null,
  stationShiftX: Object.freeze(
    Object.fromEntries(STATION_IDS.map((id) => [id, stationShiftX(STATIONS[id].textSide, undefined, 1)])) as Record<
      StationId,
      number
    >,
  ),
  stationShiftY: 0,
  haltungShiftX: VIEW_X_SHIFT_HALTUNG,
  kontaktPanel: null,
  windows: Object.freeze({}),
  compactShiftY: VIEW_Y_SHIFT_COMPACT,
});

function heroKey(framing: CameraFraming): ResolvedCameraKey {
  const s0 = cameraKeyById(HERO_KEY_ID);
  if (!s0) throw new Error(`[CameraRig] Key ${HERO_KEY_ID} fehlt in CAMERA_KEYS`);
  return resolveKeyPose(s0, framing);
}

function createRigState(): RigState {
  const fallback = heroKey(SPEC_FRAMING);
  return {
    signature: '',
    framing: null,
    canonical: [],
    sorted: [],
    fallback,
    initialized: false,
    lastY: 0,
    finePointer: typeof window === 'undefined' ? null : window.matchMedia('(pointer: fine)'),
    pose: createPose(),
    goalPos: new THREE.Vector3(),
    goalTgt: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(...fallback.tgt),
    parallax: new THREE.Vector3(),
    parallaxGoal: new THREE.Vector3(),
    scalars: { fov: fallback.fov, roll: 0, shiftX: 0, shiftY: fallback.shiftY },
  };
}

// ---------------------------------------------------------------------------
// Keys und Bildausschnitt
// ---------------------------------------------------------------------------

function assertKeys(keys: readonly ResolvedCameraKey[]): void {
  if (keys.length === 0) return;
  const issues = findOrderIssues(keys);
  console.assert(
    issues.length === 0,
    `[CameraRig] Kamera-Keys nicht streng steigend (der Pfad laesst den frueheren Key aus, pathKeys): ${issues.join(' · ')}`,
  );

  // Verdeckte Strecke = dort, wo die Papierwand den Canvas ganz deckt (wie der
  // Coverage-Trigger im SceneScrollChannel): [cover.start + cutRise, cover.end − cutRise].
  const cut = keys.find((k) => k.cut);
  const start = anchorY('cover', 0);
  const end = anchorY('cover', 1);
  if (!cut || start === null || end === null) return;
  const rise = CUT_TAN * window.innerWidth;
  console.assert(
    cut.y > start + rise && cut.y < end - rise,
    `[CameraRig] Key ${cut.id} (${Math.round(cut.y)} px) liegt nicht in der verdeckten Strecke ` +
      `${Math.round(start + rise)}–${Math.round(end - rise)} px`,
  );
}

/** Misst DOM-Flaechen (Band, Karten, Header) und leitet den Bildausschnitt ab. */
function buildFraming(st: Readonly<UiState>, size: RootState['size']): CameraFraming {
  const probe = probeFraming();
  const { width, height } = size;
  const reduced = st.motion === 'reduced';
  const open = reduced ? HERO_OPEN.reduced : HERO_OPEN.full;
  const shiftX = Object.fromEntries(
    STATION_IDS.map((id) => [id, stationShiftX(STATIONS[id].textSide, probe.cards[id], width)]),
  ) as Record<StationId, number>;
  const hero = fitHeroPose({
    width,
    height,
    compact: st.compact,
    band: probe.band,
    safeTop: probe.safeTop,
    anchor: st.compact ? HERO_BLADE_SCREEN_Y.compact : HERO_BLADE_SCREEN_Y.desktop,
    open,
    lift: sculptureLift(open, reduced),
  });
  return Object.freeze({
    compact: st.compact,
    width,
    height,
    safeTop: probe.safeTop,
    hero,
    stationShiftX: Object.freeze(shiftX),
    stationShiftY: stationShiftY(probe.safeTop, height),
    haltungShiftX: haltungShiftX(probe.haltungPanel, width),
    kontaktPanel: probe.kontaktPanel,
    windows: probe.windows,
    compactShiftY: VIEW_Y_SHIFT_COMPACT,
  });
}

function refreshKeys(rig: RigState, st: Readonly<UiState>, size: RootState['size']): void {
  const signature = `${layout.version}|${st.compact ? 1 : 0}|${st.motion}|${size.width}x${size.height}`;
  if (rig.signature === signature) return;
  rig.signature = signature;
  const framing = buildFraming(st, size);
  rig.framing = framing;
  rig.canonical = resolveCameraKeys(anchorY, framing);
  rig.sorted = pathKeys(rig.canonical);
  rig.fallback = heroKey(framing);
  if (process.env.NODE_ENV !== 'production') {
    assertKeys(rig.canonical);
    exposeKeysForDev(rig);
  }
}

interface DevCameraWindow {
  __pmCameraKeys?: { readonly keys: readonly ResolvedCameraKey[]; readonly framing: CameraFraming | null };
}

/** Nur Dev: aufgeloeste Pfad-Keys fuer Messungen im Browser (wie window.__pmScene). */
function exposeKeysForDev(rig: RigState): void {
  (window as unknown as DevCameraWindow).__pmCameraKeys = { keys: rig.sorted, framing: rig.framing };
}

// ---------------------------------------------------------------------------
// Daempfung
// ---------------------------------------------------------------------------

interface DampCarrier {
  __damp?: unknown;
}

/** maath speichert die Geschwindigkeit am Objekt; nach einem harten Setzen zuruecksetzen. */
function resetDamp(target: object): void {
  (target as DampCarrier).__damp = undefined;
}

function snapVector(current: THREE.Vector3, goal: THREE.Vector3): void {
  current.copy(goal);
  resetDamp(current);
}

function clampDt(delta: number): number {
  return Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DT) : 0;
}

function setGoals(rig: RigState): void {
  const { pos, tgt } = rig.pose;
  rig.goalPos.set(pos[0], pos[1], pos[2]).add(rig.parallax);
  rig.goalTgt.set(tgt[0], tgt[1], tgt[2]);
}

function setParallaxGoal(rig: RigState, st: Readonly<UiState>): void {
  const active = st.activeSection === 'start' && (rig.finePointer?.matches ?? false);
  rig.parallaxGoal.set(active ? frame.pointer.x * PARALLAX_X : 0, active ? frame.pointer.y * PARALLAX_Y : 0, 0);
}

function snapAll(rig: RigState, camera: THREE.PerspectiveCamera): void {
  snapVector(rig.parallax, rig.parallaxGoal);
  setGoals(rig);
  snapVector(camera.position, rig.goalPos);
  snapVector(rig.lookTarget, rig.goalTgt);
  rig.scalars.fov = rig.pose.fov;
  rig.scalars.roll = rig.pose.roll;
  rig.scalars.shiftX = rig.pose.shiftX;
  rig.scalars.shiftY = rig.pose.shiftY;
  resetDamp(rig.scalars);
}

function dampAll(rig: RigState, camera: THREE.PerspectiveCamera, dt: number): void {
  easing.damp3(rig.parallax, rig.parallaxGoal, PARALLAX_SMOOTH_TIME, dt);
  setGoals(rig);
  easing.damp3(camera.position, rig.goalPos, SMOOTH_TIME, dt);
  easing.damp3(rig.lookTarget, rig.goalTgt, SMOOTH_TIME, dt);
  easing.damp(rig.scalars, 'fov', rig.pose.fov, SMOOTH_TIME, dt);
  easing.damp(rig.scalars, 'roll', rig.pose.roll, SMOOTH_TIME, dt);
  easing.damp(rig.scalars, 'shiftX', rig.pose.shiftX, SMOOTH_TIME, dt);
  easing.damp(rig.scalars, 'shiftY', rig.pose.shiftY, SMOOTH_TIME, dt);
}

function isNearGoal(rig: RigState, camera: THREE.PerspectiveCamera): boolean {
  const { distance, angle, shift } = SNAP_TOLERANCE;
  return (
    camera.position.distanceTo(rig.goalPos) <= distance &&
    rig.lookTarget.distanceTo(rig.goalTgt) <= distance &&
    rig.parallax.distanceTo(rig.parallaxGoal) <= distance &&
    Math.abs(rig.scalars.fov - rig.pose.fov) <= angle &&
    Math.abs(rig.scalars.roll - rig.pose.roll) <= angle &&
    Math.abs(rig.scalars.shiftX - rig.pose.shiftX) <= shift &&
    Math.abs(rig.scalars.shiftY - rig.pose.shiftY) <= shift
  );
}

function isSettled(rig: RigState, camera: THREE.PerspectiveCamera): boolean {
  return (
    camera.position.distanceTo(rig.goalPos) <= SETTLE_EPS &&
    rig.lookTarget.distanceTo(rig.goalTgt) <= SETTLE_EPS &&
    rig.parallax.distanceTo(rig.parallaxGoal) <= SETTLE_EPS &&
    Math.abs(rig.scalars.fov - rig.pose.fov) <= ANGLE_SETTLE_EPS &&
    Math.abs(rig.scalars.roll - rig.pose.roll) <= ANGLE_SETTLE_EPS &&
    Math.abs(rig.scalars.shiftX - rig.pose.shiftX) <= SETTLE_EPS &&
    Math.abs(rig.scalars.shiftY - rig.pose.shiftY) <= SETTLE_EPS
  );
}

// ---------------------------------------------------------------------------
// Anwenden
// ---------------------------------------------------------------------------

/** Nebeldichte so, dass die Skulptur aus jedem Abstand wie aus 16 m eingenebelt ist. */
function applyFogGain(scene: THREE.Scene, cameraZ: number): void {
  const fog = scene.fog;
  if (!(fog instanceof THREE.FogExp2)) return;
  const gain = cameraZ > FOG_REFERENCE_Z ? FOG_REFERENCE_Z / cameraZ : 1;
  const density = WORLD.fogDensity * gain;
  if (Math.abs(fog.density - density) > FOG_EPS) fog.density = density;
}

function applyCamera(rig: RigState, camera: THREE.PerspectiveCamera, state: RootState): void {
  camera.lookAt(rig.lookTarget);
  // Hot Path (frame ist bewusst mutierbar): das LightRig folgt dem Blickziel.
  frame.cameraTarget.x = rig.lookTarget.x;
  frame.cameraTarget.y = rig.lookTarget.y;
  frame.cameraTarget.z = rig.lookTarget.z;
  frame.cameraGoalZ = rig.goalPos.z;
  if (rig.scalars.roll !== 0) camera.rotateZ(rig.scalars.roll * THREE.MathUtils.DEG2RAD);

  const fovDiff = Math.abs(camera.fov - rig.scalars.fov);
  const fovSettled = rig.scalars.fov === rig.pose.fov;
  if (fovDiff > FOV_APPLY_EPS || (fovDiff > 0 && fovSettled)) {
    camera.fov = rig.scalars.fov;
    camera.updateProjectionMatrix();
  }
  applyViewOffset(camera, state.size, rig.scalars.shiftX, rig.scalars.shiftY);
  applyFogGain(state.scene, camera.position.z);
}

function stepFull(rig: RigState, st: Readonly<UiState>, camera: THREE.PerspectiveCamera, state: RootState, delta: number): void {
  const y = window.scrollY;
  const keys = rig.sorted;
  if (keys.length > 0) sampleCameraPath(keys, y, rig.pose);
  else writeKeyPose(rig.fallback, rig.pose);

  const viewport = Math.max(1, window.innerHeight);
  const snap = !rig.initialized || crossesCut(keys, rig.lastY, y) || Math.abs(y - rig.lastY) > SNAP_SCROLL_VIEWPORTS * viewport;
  rig.initialized = true;
  rig.lastY = y;

  setParallaxGoal(rig, st);
  if (snap) snapAll(rig, camera);
  else {
    dampAll(rig, camera, clampDt(delta));
    if (isNearGoal(rig, camera)) snapAll(rig, camera);
  }

  applyCamera(rig, camera, state);
  if (!isSettled(rig, camera)) requestFrames();
}

function reducedKey(rig: RigState, st: Readonly<UiState>, y: number): ResolvedCameraKey {
  const id = reducedHoldKeyId(st);
  if (id) {
    const resolved = rig.canonical.find((k) => k.id === id);
    if (resolved) return resolved;
    const def = cameraKeyById(id);
    if (def) return resolveKeyPose(def, rig.framing ?? SPEC_FRAMING);
  }
  return lastHoldKeyAtOrBefore(rig.sorted, y) ?? rig.fallback;
}

function stepReduced(rig: RigState, st: Readonly<UiState>, camera: THREE.PerspectiveCamera, state: RootState): void {
  const y = window.scrollY;
  writeKeyPose(reducedKey(rig, st, y), rig.pose);

  rig.parallaxGoal.set(0, 0, 0);
  snapAll(rig, camera);
  applyCamera(rig, camera, state);
  // Beim Wechsel zurueck auf Bewegung an: erster Frame ohne Daempfung.
  rig.initialized = false;
  rig.lastY = y;
}

function stepCameraRig(rig: RigState, state: RootState, delta: number): void {
  trackSettleWindow(performance.now());
  const camera = state.camera;
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  const st = ui.get();
  refreshKeys(rig, st, state.size);
  if (st.motion === 'reduced') stepReduced(rig, st, camera, state);
  else stepFull(rig, st, camera, state, delta);
}

/**
 * Reduced: ein invalidate() pro Wechsel des Halte-Keys bzw. des Bildausschnitts.
 * Bewegung an: nur beim Umschalten des Modus (Scrollen haelt die Szene ohnehin wach).
 */
function reducedSignature(s: Readonly<UiState>): string {
  if (s.motion !== 'reduced') return 'full';
  return `reduced|${reducedHoldKeyId(s) ?? '-'}|${s.activeSection}|${s.activeStation ?? '-'}|${s.compact ? 1 : 0}`;
}

function watchMotionChanges(invalidate: () => void): () => void {
  let last = reducedSignature(ui.get());
  return ui.subscribe(() => {
    const next = reducedSignature(ui.get());
    if (next === last) return;
    last = next;
    invalidate();
  });
}

export default function CameraRig(): null {
  const rigRef = useRef<RigState | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => watchMotionChanges(invalidate), [invalidate]);

  useFrame((state, delta) => {
    rigRef.current ??= createRigState();
    stepCameraRig(rigRef.current, state, delta);
  }, CAMERA_RIG_PRIORITY);

  return null;
}
