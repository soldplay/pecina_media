'use client';

/**
 * Festes Licht-Rig (DESIGN_SPEC §5.2, §3.3.0). Lichter werden bewegt und
 * umgefaerbt, nie hinzugefuegt oder entfernt — andere Pakete fuegen keine
 * Lichter hinzu.
 *
 * Fokus: start/kontakt → Skulptur (Boden unter der Mitte), haltung → Monolith B,
 * Leistungen (Fix-Runde 3): Station nach Scroll-Position — die naechste Station
 * ist ab dem Abfahrts-Key R der vorigen beleuchtet (stationByScroll), nicht erst
 * ab ihrer Artikelmitte (ui.activeStation). Danach (Kran F, Papierwand) und bei
 * Reduced: das gedaempfte Blickziel der Kamera (frame.cameraTarget), Drehung und
 * Toenung zwischen den beiden naechsten Stationen nach Abstand gemischt.
 *   Key  bei Fokus + R_y(rotY)·(−1,6, 3,6, 2,4)·s, Ziel Fokus + (0, 1,35·s, 0)
 *   Rim  bei Fokus + R_y(rotY)·(1,9, 1,6, −2,2)·s, gleiches Ziel, immer #D17F0C;
 *        Stationen: (0,6, 1,5, −3,2), Intensitaet × 0,3 (rimGain, Fix-Runde 3)
 *   s = Groesse des Motivs (Skulptur 2,6, Monolith 1,8, Station 1); Intensitaet
 *   × s², damit die Beleuchtungsstaerke am Motiv gleich bleibt (decay 2), dazu
 *   ein Lichtfaktor je Motiv (focusGain: Skulptur 1,9, Monolith 1,2, Station 1).
 *   Fokus/Drehung/Groesse/Key-Farbe gedaempft 0,25 s (Reduced: sofort).
 * bladeLight: 30 · frame.hero.open, solange die Skulptur sichtbar ist
 * (y < anchorY('haltung', 0,6) oder y ≥ anchorY('cover', 0,5)), sonst 0;
 * nahe vor dem Spalt gedimmt (bladeProximityGain).
 *
 * Abnahme 14.10.2026:
 * - Farbstimmung: Key neutral-warm statt Pfirsich, Orange nur als Rim-Akzent;
 *   Key 90 → 40 cd (weisses Papier lag linear bei ~1,9 und bluehte), Rim 45 → 28.
 * - Skulptur: Rig um 2,6 skaliert — vorher stand ein runder Key-Fleck auf „ED“.
 * - Durchflug: In der Start-Sektion werden Key und Rim nahe der Klinge mit
 *   bladeProximityGain gedimmt (die Schnittflaechen fuellen dort das Bild).
 * - Ruhe: Daempfung 0,6 → 0,25 s und requestFrames() statt keepAlive() pro Frame
 *   (vorher ~3 s Nachlauf nach Bereichswechseln).
 */

import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type RootState } from '@react-three/fiber';
import { easing } from 'maath';
import { COLORS } from '@/lib/brand';
import { STATION_IDS, type StationId } from '@/lib/scene/ids';
import { clamp01 } from '@/lib/scene/math';
import { MONOLITHS, SCULPTURE, STATION_ORDER, STATIONS, type Vec3Tuple } from '@/lib/scene/stations';
import { anchorY, frame, ui, type UiState } from '@/lib/scene/store';
import { bladeProximityGain } from '../hero/hero-timeline';
import { STATION_KEY_AT } from './camera-keys';
import { requestFrames } from './settle';

/** Nach der Kamera (−3), vor den Stationen (0). */
export const LIGHT_RIG_PRIORITY = -2;

export const LIGHT_RIG = Object.freeze({
  ambient: 0.1,
  key: Object.freeze({ intensity: 40, angle: 0.55, penumbra: 0.85, decay: 2, offset: [-1.6, 3.6, 2.4] as Vec3Tuple }),
  /**
   * Rim: flach von hinten (y 1,6 statt 2,6, knapp ueber dem Lichtziel 1,35) —
   * Streiflicht auf Kanten und Silhouetten; von oben faerbte es alle Deckflaechen orange.
   */
  rim: Object.freeze({
    color: COLORS.brand,
    intensity: 28,
    angle: 0.6,
    penumbra: 1,
    decay: 2,
    offset: [1.9, 1.6, -2.2] as Vec3Tuple,
  }),
  blade: Object.freeze({
    color: COLORS.glow,
    maxIntensity: 30,
    distance: 12,
    decay: 2,
    position: [SCULPTURE.center[0], SCULPTURE.center[1], SCULPTURE.bladeZ] as Vec3Tuple,
  }),
  /** Hoehe des Lichtziels ueber dem Fokus (mal Motivgroesse) */
  targetHeight: 1.35,
  /** Motivgroesse s je Fokus-Art */
  focusScale: Object.freeze({ sculpture: 2.6, monolith: 1.8, station: 1 }),
  /**
   * Zusaetzlicher Lichtfaktor je Fokus-Art: die orange Skulptur (Markenobjekt,
   * Albedo nur ~0,3) braucht mehr Licht als Papier/Marmor, um satt zu wirken.
   */
  focusGain: Object.freeze({ sculpture: 1.9, monolith: 1.2, station: 1 }),
  /**
   * Rim je Fokus-Art (Fix-Runde 3): An den Stationen faerbte das orange Rim die
   * grossen Sockel-Seitenflaechen braun (gemessen 1440 × 900, C-marke: Seite
   * RGB 39/25/16, ohne Rim 17/16/14). Dort schwaecher (× 0,3) und fast genau von
   * hinten (x 0,6 statt 1,9, z −3,2): die Sockelseiten liegen nicht mehr im
   * Streiflicht, nur die Objekt-Silhouetten; das Orange kommt ueber die Naht.
   */
  rimGain: Object.freeze({ sculpture: 1, monolith: 1, station: 0.3 }),
  rimOffsetStation: [0.6, 1.5, -3.2] as Vec3Tuple,
  focusSmoothTime: 0.25,
  /** Key-Farbe ausserhalb der Stationen: neutral-warm (Skulptur, Monolithe) */
  defaultKeyTint: '#FFF0DE',
});

const MAX_DT = 0.1;
/** bladeLight × bladeProximityGain^n: bei Scroll 700 (Gain 0,46) ~5 %, in S3 (0,3) < 1 %. */
const BLADE_LIGHT_NEAR_EXPONENT = 4;
/**
 * Restbewegung, unter der das Licht aufs Ziel springt (Integration 14.10.2026). Ohne das
 * daempft maath einen Fokuswechsel zwischen Stationen (bis 36 m) bis auf eps 0,001 aus.
 */
const SNAP_TOLERANCE = Object.freeze({ distance: 0.1, angle: 0.01, scale: 0.01, color: 0.01 });
/**
 * Fokus-Spruenge ueber diese Distanz (m) werden nicht gedaempft: Benachbarte
 * Stationen liegen 12,6–13,6 m auseinander (Schwenk in ~0,9 s); weiter springt der
 * Fokus nur bei Scroll-Spruengen, bei denen auch die Kamera ungedaempft springt.
 * Ein gedaempfter 66-m-Weg (Kopf → Start) kam erst nach ~1,05 s zur Ruhe und
 * verlaengerte den Nachlauf auf 2,3 s.
 */
const FOCUS_JUMP_DISTANCE = 20;

interface Focus {
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly scale: number;
  /** Lichtfaktor (focusGain) */
  readonly gain: number;
  readonly tint: THREE.Color;
  /** Rim-Faktor und -Lage (rimGain, rimOffsetStation) */
  readonly rimGain: number;
  readonly rimY: number;
  readonly rimZ: number;
}

const DEFAULT_TINT = new THREE.Color(LIGHT_RIG.defaultKeyTint);
const RIM_DEFAULT = Object.freeze({ y: LIGHT_RIG.rim.offset[1], z: LIGHT_RIG.rim.offset[2] });

const SCULPTURE_FOCUS: Focus = Object.freeze({
  x: 0,
  z: 0,
  rotY: 0,
  scale: LIGHT_RIG.focusScale.sculpture,
  gain: LIGHT_RIG.focusGain.sculpture,
  tint: DEFAULT_TINT,
  rimGain: LIGHT_RIG.rimGain.sculpture,
  rimY: RIM_DEFAULT.y,
  rimZ: RIM_DEFAULT.z,
});
const MONOLITH_B = MONOLITHS[1];
const MONOLITH_FOCUS: Focus = Object.freeze({
  x: MONOLITH_B.pos[0],
  z: MONOLITH_B.pos[2],
  rotY: MONOLITH_B.rotY,
  scale: LIGHT_RIG.focusScale.monolith,
  gain: LIGHT_RIG.focusGain.monolith,
  tint: DEFAULT_TINT,
  rimGain: LIGHT_RIG.rimGain.monolith,
  rimY: RIM_DEFAULT.y,
  rimZ: RIM_DEFAULT.z,
});

/**
 * Stationen und alles danach (Fix-Runde 3): Das Licht folgt dem gedaempften
 * Blickziel der Kamera (frame.cameraTarget), nicht mehr ui.activeStation.
 * Vorher blieb es bei der Abfahrt auf der alten Station (aktiv bis zur
 * Artikelmitte), die naechste Station lag dunkel im Bild. Jetzt wandert der
 * Key-Spot mit dem Blick — in B/C liegt das Ziel auf dem Objekt, also wie
 * bisher auf der Station; in der Kran-Draufsicht F auf der Mitte zwischen Kopf
 * und Papier. Drehung und Key-Toenung zwischen den beiden naechsten Stationen
 * nach Abstand gemischt (kein Umklappen des Lichts mitten in der Fahrt).
 */
const STATION_TINTS: Readonly<Record<StationId, THREE.Color>> = Object.freeze(
  Object.fromEntries(STATION_IDS.map((id) => [id, new THREE.Color(STATIONS[id].keyTint)])) as Record<StationId, THREE.Color>,
);

/** Hot Path: bewusst mutierbarer Fokus (wie `frame`), pro Frame neu beschrieben. */
type MutableFocus = { -readonly [K in keyof Focus]: Focus[K] };

const followState: MutableFocus = {
  x: 0,
  z: 0,
  rotY: 0,
  scale: LIGHT_RIG.focusScale.station,
  gain: LIGHT_RIG.focusGain.station,
  tint: new THREE.Color(),
  rimGain: LIGHT_RIG.rimGain.station,
  rimY: LIGHT_RIG.rimOffsetStation[1],
  rimZ: LIGHT_RIG.rimOffsetStation[2],
};

function followFocus(): Focus {
  const { x, z } = frame.cameraTarget;
  let near: StationId = STATION_IDS[0];
  let far: StationId = STATION_IDS[1];
  let dNear = Infinity;
  let dFar = Infinity;
  for (const id of STATION_IDS) {
    const [sx, , sz] = STATIONS[id].position;
    const d = Math.hypot(x - sx, z - sz);
    if (d < dNear) {
      far = near;
      dFar = dNear;
      near = id;
      dNear = d;
    } else if (d < dFar) {
      far = id;
      dFar = d;
    }
  }
  const sum = dNear + dFar;
  // Gewicht der zweitnaechsten Station: 0 auf der Station, 0,5 genau dazwischen.
  const w = Number.isFinite(sum) && sum > 1e-6 ? dNear / sum : 0;
  followState.x = x;
  followState.z = z;
  followState.rotY = STATIONS[near].rotY + (STATIONS[far].rotY - STATIONS[near].rotY) * w;
  followState.tint.copy(STATION_TINTS[near]).lerp(STATION_TINTS[far], w);
  return followState;
}

const STATION_FOCUS: Readonly<Record<StationId, Focus>> = Object.freeze(
  Object.fromEntries(
    STATION_IDS.map((id) => {
      const s = STATIONS[id];
      const focus: Focus = {
        x: s.position[0],
        z: s.position[2],
        rotY: s.rotY,
        scale: LIGHT_RIG.focusScale.station,
        gain: LIGHT_RIG.focusGain.station,
        tint: STATION_TINTS[id],
        rimGain: LIGHT_RIG.rimGain.station,
        rimY: LIGHT_RIG.rimOffsetStation[1],
        rimZ: LIGHT_RIG.rimOffsetStation[2],
      };
      return [id, Object.freeze(focus)];
    }),
  ) as Record<StationId, Focus>,
);

/**
 * Beleuchtete Station nach Scroll-Position (Bewegung an): Station i ab dem
 * Abfahrts-Key R der vorigen Station (camera-keys STATION_KEY_AT.depart) bis zu
 * ihrem eigenen R. Die naechste Station ist damit ab Beginn der Abfahrt
 * beleuchtet, waehrend die Kamera sich zu ihr dreht. Nach Kopf (beat b ≥ 1,
 * Kran F, Papierwand) und ohne Anker: Blickziel der Kamera.
 */
function stationByScroll(y: number): StationId | null {
  const last = STATION_ORDER.length - 1;
  for (let i = 0; i < last; i++) {
    const depart = anchorY(`${STATION_ORDER[i]}:b`, STATION_KEY_AT.depart);
    if (depart === null) return null;
    if (y < depart) return STATION_ORDER[i];
  }
  const end = anchorY(`${STATION_ORDER[last]}:b`, 1);
  return end !== null && y < end ? STATION_ORDER[last] : null;
}

function focusFor(st: Readonly<UiState>, y: number): Focus {
  if (st.activeSection === 'start' || st.activeSection === 'kontakt') return SCULPTURE_FOCUS;
  if (st.activeSection === 'haltung') return MONOLITH_FOCUS;
  // Reduced: die Kamera steht auf dem Halte-Key, ihr Ziel liegt auf dem Objekt.
  const station = st.motion === 'reduced' ? null : stationByScroll(y);
  return station ? STATION_FOCUS[station] : followFocus();
}

/** Sichtbarkeit der Skulptur fuer das bladeLight. Fehlende Anker → wie am Seitenanfang. */
function bladeIntensity(y: number, cameraZ: number): number {
  const haltungEnd = anchorY('haltung', 0.6);
  const coverMid = anchorY('cover', 0.5);
  const sculptureVisible = haltungEnd === null || y < haltungEnd || (coverMid !== null && y >= coverMid);
  if (!sculptureVisible) return 0;
  // Im Spalt steht das Punktlicht nur ~0,7 m vor den Schnittflaechen (E ∝ 1/d²):
  // dort fast aus, im Startbild (Kamera weit weg, Gain 1) voll.
  const near = bladeProximityGain(cameraZ) ** BLADE_LIGHT_NEAR_EXPONENT;
  return LIGHT_RIG.blade.maxIntensity * clamp01(frame.hero.open) * near;
}

interface LightShape {
  rotY: number;
  scale: number;
  exposure: number;
  rimGain: number;
  rimY: number;
  rimZ: number;
}

interface LightState {
  initialized: boolean;
  /** Dev: Frames bis zur naechsten Lichter-Zaehlung */
  auditCountdown: number;
  readonly focus: THREE.Vector3;
  readonly focusGoal: THREE.Vector3;
  /** gedaempfte Skalare: Drehung, Motivgroesse, Belichtung von Key/Rim, Rim-Faktor und -Lage */
  readonly shape: LightShape;
  /** Ziel der Belichtung: im Start nahe der Klinge gedimmt (Durchflug), sonst 1 */
  exposureGoal: number;
  readonly tintGoal: THREE.Color;
}

function createLightState(): LightState {
  return {
    initialized: false,
    auditCountdown: LIGHT_AUDIT_INTERVAL,
    focus: new THREE.Vector3(),
    focusGoal: new THREE.Vector3(),
    shape: { rotY: 0, scale: 1, exposure: 1, rimGain: 1, rimY: RIM_DEFAULT.y, rimZ: RIM_DEFAULT.z },
    exposureGoal: 1,
    tintGoal: new THREE.Color(LIGHT_RIG.defaultKeyTint),
  };
}

interface LightTargets {
  readonly key: THREE.Object3D;
  readonly rim: THREE.Object3D;
}

function createTargets(): LightTargets {
  const key = new THREE.Object3D();
  key.name = 'pm-key-target';
  const rim = new THREE.Object3D();
  rim.name = 'pm-rim-target';
  return { key, rim };
}

interface DampCarrier {
  __damp?: unknown;
}

function resetDamp(target: object): void {
  (target as DampCarrier).__damp = undefined;
}

/** out = focus + R_y(rotY) · offset · scale */
function placeAround(out: THREE.Vector3, focus: THREE.Vector3, rotY: number, scale: number, offset: Vec3Tuple): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const ox = offset[0] * scale;
  const oz = offset[2] * scale;
  out.set(focus.x + ox * c + oz * s, focus.y + offset[1] * scale, focus.z - ox * s + oz * c);
}

function snapFocus(ls: LightState, keyLight: THREE.SpotLight, focus: Focus): void {
  ls.focus.copy(ls.focusGoal);
  resetDamp(ls.focus);
  ls.shape.rotY = focus.rotY;
  ls.shape.scale = focus.scale;
  ls.shape.exposure = ls.exposureGoal;
  ls.shape.rimGain = focus.rimGain;
  ls.shape.rimY = focus.rimY;
  ls.shape.rimZ = focus.rimZ;
  resetDamp(ls.shape);
  keyLight.color.copy(ls.tintGoal);
  resetDamp(keyLight.color);
}

function dampFocus(ls: LightState, keyLight: THREE.SpotLight, focus: Focus, delta: number): void {
  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DT) : 0;
  easing.damp3(ls.focus, ls.focusGoal, LIGHT_RIG.focusSmoothTime, dt);
  easing.damp(ls.shape, 'rotY', focus.rotY, LIGHT_RIG.focusSmoothTime, dt);
  easing.damp(ls.shape, 'scale', focus.scale, LIGHT_RIG.focusSmoothTime, dt);
  easing.damp(ls.shape, 'exposure', ls.exposureGoal, LIGHT_RIG.focusSmoothTime, dt);
  easing.damp(ls.shape, 'rimGain', focus.rimGain, LIGHT_RIG.focusSmoothTime, dt);
  easing.damp(ls.shape, 'rimY', focus.rimY, LIGHT_RIG.focusSmoothTime, dt);
  easing.damp(ls.shape, 'rimZ', focus.rimZ, LIGHT_RIG.focusSmoothTime, dt);
  easing.dampC(keyLight.color, ls.tintGoal, LIGHT_RIG.focusSmoothTime, dt);
}

function colorDistance(a: THREE.Color, b: THREE.Color): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

function isNearGoal(ls: LightState, keyLight: THREE.SpotLight, focus: Focus): boolean {
  return (
    ls.focus.distanceTo(ls.focusGoal) <= SNAP_TOLERANCE.distance &&
    Math.abs(ls.shape.rotY - focus.rotY) <= SNAP_TOLERANCE.angle &&
    Math.abs(ls.shape.scale - focus.scale) <= SNAP_TOLERANCE.scale &&
    Math.abs(ls.shape.exposure - ls.exposureGoal) <= SNAP_TOLERANCE.scale &&
    Math.abs(ls.shape.rimGain - focus.rimGain) <= SNAP_TOLERANCE.scale &&
    Math.abs(ls.shape.rimY - focus.rimY) <= SNAP_TOLERANCE.distance &&
    Math.abs(ls.shape.rimZ - focus.rimZ) <= SNAP_TOLERANCE.distance &&
    colorDistance(keyLight.color, ls.tintGoal) <= SNAP_TOLERANCE.color
  );
}

function isSettled(ls: LightState, keyLight: THREE.SpotLight, focus: Focus): boolean {
  return (
    ls.focus.equals(ls.focusGoal) &&
    ls.shape.rotY === focus.rotY &&
    ls.shape.scale === focus.scale &&
    ls.shape.exposure === ls.exposureGoal &&
    ls.shape.rimGain === focus.rimGain &&
    ls.shape.rimY === focus.rimY &&
    ls.shape.rimZ === focus.rimZ &&
    keyLight.color.equals(ls.tintGoal)
  );
}

interface RigLights {
  readonly key: THREE.SpotLight;
  readonly rim: THREE.SpotLight;
  readonly blade: THREE.PointLight;
}

/** Rim-Versatz (x fest, y/z gedaempft je Fokus-Art), wiederverwendet (Hot Path). */
const rimOffset: [number, number, number] = [LIGHT_RIG.rim.offset[0], RIM_DEFAULT.y, RIM_DEFAULT.z];

function placeLights(ls: LightState, lights: RigLights, targets: LightTargets): void {
  const { rotY, scale } = ls.shape;
  rimOffset[1] = ls.shape.rimY;
  rimOffset[2] = ls.shape.rimZ;
  placeAround(lights.key.position, ls.focus, rotY, scale, LIGHT_RIG.key.offset);
  placeAround(lights.rim.position, ls.focus, rotY, scale, rimOffset);
  targets.key.position.set(ls.focus.x, ls.focus.y + LIGHT_RIG.targetHeight * scale, ls.focus.z);
  targets.rim.position.copy(targets.key.position);
  const gain = scale * scale * ls.shape.exposure;
  lights.key.intensity = LIGHT_RIG.key.intensity * gain;
  lights.rim.intensity = LIGHT_RIG.rim.intensity * gain * ls.shape.rimGain;
}

/** Ambient, Key, Rim, bladeLight — mehr Lichter darf es in der Szene nicht geben. */
const RIG_LIGHT_COUNT = 4;
/** Dev: Lichter-Zaehlung alle n gerenderten Frames (Stationen mounten spaeter). */
const LIGHT_AUDIT_INTERVAL = 300;

/** Dev-Pruefung „keine fremden Lichter“ (§5.2): meldet zusaetzliche Lichter per console.assert. */
function auditLights(ls: LightState, scene: THREE.Scene): void {
  ls.auditCountdown -= 1;
  if (ls.auditCountdown > 0) return;
  ls.auditCountdown = LIGHT_AUDIT_INTERVAL;
  const lights: string[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Light).isLight) lights.push(obj.name || obj.type);
  });
  console.assert(
    lights.length === RIG_LIGHT_COUNT,
    `[LightRig] ${lights.length} Lichter in der Szene, erlaubt sind ${RIG_LIGHT_COUNT} (festes Rig): ${lights.join(', ')}`,
  );
}

function stepLights(ls: LightState, lights: RigLights, targets: LightTargets, state: RootState, delta: number): void {
  const st = ui.get();
  const focus = focusFor(st, window.scrollY);
  ls.focusGoal.set(focus.x, 0, focus.z);
  ls.tintGoal.copy(focus.tint);
  // Ziel-z statt gedaempftem z (Fix-Runde 3, Ruhe): Das Belichtungsziel steht mit
  // der Eingabe fest, die Daempfung laeuft parallel zur Kamera statt danach.
  const nearBlade = st.activeSection === 'start' ? bladeProximityGain(frame.cameraGoalZ) : 1;
  ls.exposureGoal = focus.gain * nearBlade;

  const reduced = st.motion === 'reduced';
  const jump = ls.focus.distanceTo(ls.focusGoal) > FOCUS_JUMP_DISTANCE;
  if (!ls.initialized || reduced || jump) snapFocus(ls, lights.key, focus);
  else {
    dampFocus(ls, lights.key, focus, delta);
    if (isNearGoal(ls, lights.key, focus)) snapFocus(ls, lights.key, focus);
  }
  ls.initialized = true;

  placeLights(ls, lights, targets);
  lights.blade.intensity = bladeIntensity(window.scrollY, state.camera.position.z);

  if (!reduced && !isSettled(ls, lights.key, focus)) requestFrames();
  if (process.env.NODE_ENV !== 'production') auditLights(ls, state.scene);
}

export default function LightRig() {
  const [targets] = useState(createTargets);
  const keyRef = useRef<THREE.SpotLight>(null);
  const rimRef = useRef<THREE.SpotLight>(null);
  const bladeRef = useRef<THREE.PointLight>(null);
  const stateRef = useRef<LightState | null>(null);

  useFrame((state, delta) => {
    const key = keyRef.current;
    const rim = rimRef.current;
    const blade = bladeRef.current;
    if (!key || !rim || !blade) return;
    stateRef.current ??= createLightState();
    stepLights(stateRef.current, { key, rim, blade }, targets, state, delta);
  }, LIGHT_RIG_PRIORITY);

  const { key, rim, blade } = LIGHT_RIG;
  return (
    <>
      <ambientLight intensity={LIGHT_RIG.ambient} />
      <primitive object={targets.key} />
      <primitive object={targets.rim} />
      <spotLight
        ref={keyRef}
        name="pm-key"
        target={targets.key}
        color={LIGHT_RIG.defaultKeyTint}
        intensity={key.intensity}
        angle={key.angle}
        penumbra={key.penumbra}
        decay={key.decay}
      />
      <spotLight
        ref={rimRef}
        name="pm-rim"
        target={targets.rim}
        color={rim.color}
        intensity={rim.intensity}
        angle={rim.angle}
        penumbra={rim.penumbra}
        decay={rim.decay}
      />
      <pointLight
        ref={bladeRef}
        name="pm-blade"
        color={blade.color}
        intensity={0}
        distance={blade.distance}
        decay={blade.decay}
        position={[...blade.position]}
      />
    </>
  );
}
