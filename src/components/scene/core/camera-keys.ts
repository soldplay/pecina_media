/**
 * Kamera-Keys der Startseite (DESIGN_SPEC §3.9) und die reine Pfad-Mathematik.
 * Einziger Besitzer der Kamera ist P1; andere Pakete kennen diese Datei nicht.
 *
 * Keys haengen an Anker-Fortschritten: y = anchorY(at[0], at[1]). Zwischen zwei
 * Keys: t = sine.inOut, Position und Ziel per (zentripetalem) Catmull-Rom ueber
 * die Nachbarn, nie ueber einen cut-Key hinweg; FOV, Roll und Bildausschnitt
 * (shiftX/shiftY, setViewOffset) linear.
 *
 * Bildausschnitt und Compact-Anpassung werden beim Aufloesen je Key gesetzt
 * (CameraFraming, gemessen beim Layout-Refresh): Der Ausschnitt folgt damit der
 * Scroll-Position statt einem eigenen Zeit-Nachlauf (Ruhe-Kriterium §6.1).
 *
 * Ohne React und ohne three-Laufzeit. Die Funktionen mit `out`-Parameter
 * schreiben bewusst in ein vorhandenes Objekt (Hot Path, keine Allokation pro
 * Frame) — dieselbe Ausnahme wie beim Store `frame`.
 */

import { stationOfBeat, type AnchorId, type BeatId, type SectionId, type StationId } from '@/lib/scene/ids';
import { easeSineInOut, lerp } from '@/lib/scene/math';
import { STATION_ORDER, STATIONS, stationLocalToWorld, type Vec3Tuple } from '@/lib/scene/stations';
import type { CardSpan, DocSpan, SceneWindowId } from './framing-probe';
import { fitSculptureInRect, type FreeRect } from './hero-framing';
import { visibleBand, windowShiftY } from './view-offset';

export type CameraKeySpace = 'world' | StationId;

/**
 * Gemessener Bildausschnitt eines Welt-Keys:
 * - 'haltung': x aus der Kante des Haltungs-Panels (Monolith in der freien Flaeche)
 * - 'kontakt': ganze Pose aus der freien Flaeche neben dem Kontakt-Panel
 *   (hero-framing.fitSculptureInRect), Oeffnung laut `open`
 */
export type CameraKeyView = 'haltung' | 'kontakt';

export interface CameraKey {
  readonly id: string;
  /** Anker und Fortschritt (0..1), an dem der Key erreicht ist */
  readonly at: readonly [AnchorId, number];
  /** Position, in Welt- oder Station-lokalen Koordinaten (siehe space) */
  readonly pos: Vec3Tuple;
  /** Blickziel, gleicher Raum wie pos */
  readonly tgt: Vec3Tuple;
  /** vertikales FOV in Grad */
  readonly fov: number;
  /** Grad um die Blickachse (nach lookAt) */
  readonly roll?: number;
  /** unsichtbarer Sprung: das Segment davor haelt, Catmull-Rom nie darueber */
  readonly cut?: boolean;
  /** Halte-Key fuer Reduced Motion */
  readonly hold?: boolean;
  readonly space: CameraKeySpace;
  /** Gemessener Ausschnitt (Welt-Keys), siehe CameraKeyView */
  readonly view?: CameraKeyView;
  /** Skulptur-Oeffnung fuer view 'kontakt' */
  readonly open?: number;
  /** Compact: 3D-Fenster, in dessen Mitte das Motiv steht (framing-probe) */
  readonly window?: SceneWindowId;
  /**
   * Compact: Scroll-Position fuer die Fenster-Messung, falls nicht die eigene
   * (E liegt in der verdeckten Strecke und uebernimmt die Pose von K0).
   */
  readonly frameAt?: readonly [AnchorId, number];
}

/** Startbild; mit gemessener freier Flaeche ersetzt CameraFraming.hero seine Pose. */
export const HERO_KEY_ID = 'S0';

/**
 * S0 laut Spec-Feinabstimmung (Preloader-Anker 36 %), nur noch Rueckfall, wenn
 * keine Hero-Pose gemessen wurde. Seit der Abnahme 14.10.2026 bestimmt
 * hero-framing.ts die Pose (ganze Skulptur ueber dem H1-Band).
 */
export const S0_TARGET_Y = 0.19;

const freezeKey = (key: CameraKey): CameraKey => Object.freeze(key);

/**
 * Haltung: ein Key je Prinzip, erreicht bei haltung:N 0,7 (HALTUNG_KEY_AT), also kurz
 * nachdem der Text des Prinzips aktiv wird. Kunden-Feedback 14.10.2026: Vorher gab es
 * nur S5 (haltung 0,45) und danach S6 Richtung Stationen; bei „03 Technologie“ war die
 * Kamera schon unterwegs, Monolith 3 lief rechts aus dem Bild und Monolith 2 stand davor.
 *
 * Geometrie (MONOLITHS in stations.ts, Front +z lokal, Inhalt y ≈ 2,2–4,4):
 * - H1, H2: Kamera auf der Normalen der Monolith-Front, ~6,2 m, Augenhoehe 2,5, Ziel y 3,0.
 * - H3: Monolith 3 steht hinter Monolith 2. Kamera rechts versetzt (x 3,7), damit die
 *   Sichtlinie zur linken Kante (1,87 / −20,38) bei z −17 auf x 2,84 liegt, rechts von
 *   Monolith 2 (bis x 1,5); Blick ~28° schraeg auf die Front.
 * Alle drei sind Halte-Keys fuer Reduced Motion (reducedHoldKeyId).
 *
 * Bildausschnitt (Fix-Runde 3): view 'haltung' — x aus der gemessenen Panel-Kante
 * (view-offset.haltungShiftX), sodass die Saeule des Prinzips mittig in der
 * freien Flaeche rechts vom Panel steht. Vorher fest −0,10: bei 1440 stand
 * Monolith 01 halb hinter dem Panel. Die Ziele liegen auf den Saeulen-Mitten.
 */
const HALTUNG_KEY_IDS = ['H1', 'H2', 'H3'] as const;

/**
 * Fortschritt im Prinzip-Beat (Bereich „top 75 %“ → „top 35 %“), an dem der Key
 * erreicht ist. Fix-Runde 3: 0,5 → 0,7. Das Prinzip wird aktiv (Nummer orange,
 * Lichtstreifen an), wenn sein Listenpunkt die Viewport-Mitte erreicht — das ist
 * p 0,625. Bei 0,5 stand die Kamera schon auf Saeule N, waehrend noch Prinzip
 * N−1 markiert und beleuchtet war.
 */
const HALTUNG_KEY_AT = 0.7;

const HALTUNG_KEYS: readonly CameraKey[] = [
  freezeKey({
    id: HALTUNG_KEY_IDS[0],
    at: ['haltung:1', HALTUNG_KEY_AT],
    pos: [-0.47, 2.5, -8.18],
    tgt: [-2.6, 3.0, -14],
    fov: 40,
    roll: 0,
    hold: true,
    space: 'world',
    view: 'haltung',
    window: 'haltung',
  }),
  freezeKey({
    id: HALTUNG_KEY_IDS[1],
    at: ['haltung:2', HALTUNG_KEY_AT],
    pos: [0.7, 2.5, -10.8],
    tgt: [0.4, 3.0, -17],
    fov: 40,
    roll: 0,
    hold: true,
    space: 'world',
    view: 'haltung',
    window: 'haltung',
  }),
  freezeKey({
    id: HALTUNG_KEY_IDS[2],
    at: ['haltung:3', HALTUNG_KEY_AT],
    pos: [3.7, 2.5, -14],
    tgt: [2.9, 3.0, -20],
    fov: 40,
    roll: 0,
    hold: true,
    space: 'world',
    view: 'haltung',
    window: 'haltung',
  }),
];

/** Welt-Keys vor den Stationen (Start, Haltung, Leistungen-Kopf). */
const HEAD_KEYS: readonly CameraKey[] = [
  freezeKey({
    id: HERO_KEY_ID,
    at: ['start', 0],
    pos: [0, 1.6, 16],
    tgt: [0, S0_TARGET_Y, 0],
    fov: 35,
    roll: 0,
    hold: true,
    space: 'world',
  }),
  freezeKey({ id: 'S1', at: ['start', 0.22], pos: [0, 1.6, 10], tgt: [0, 1.25, 0], fov: 38, roll: 1, space: 'world' }),
  freezeKey({ id: 'S2', at: ['start', 0.4], pos: [0, 1.62, 4.2], tgt: [0, 1.62, -6], fov: 46, roll: 2, space: 'world' }),
  freezeKey({ id: 'S3', at: ['start', 0.55], pos: [0, 1.62, 0], tgt: [0, 1.62, -10], fov: 55, roll: 2, space: 'world' }),
  freezeKey({
    id: 'S4',
    at: ['haltung', 0],
    pos: [0, 1.7, -5],
    tgt: [0, 1.9, -16],
    fov: 45,
    roll: 0,
    space: 'world',
    view: 'haltung',
    window: 'haltung',
  }),
  ...HALTUNG_KEYS,
  freezeKey({
    id: 'S6',
    at: ['haltung', 0.95],
    pos: [0.5, 1.8, -21],
    tgt: [-3, 1.35, -30],
    fov: 40,
    roll: 0,
    space: 'world',
    view: 'haltung',
    window: 'haltung',
  }),
  freezeKey({ id: 'L0', at: ['leistungen', 0], pos: [0.6, 1.8, -23.5], tgt: [-3.2, 1.38, -30], fov: 40, roll: 0, space: 'world' }),
];

interface StationShot {
  readonly pos: Vec3Tuple;
  readonly tgt: Vec3Tuple;
  readonly fov: number;
}

/**
 * B- und C-Keys (Station-lokal, Halte-Keys). Abnahme 14.10.2026, Rahmung
 * nachgemessen (1440 × 900 und 1280 × 720):
 * - Ziel = Mitte der Inhaltsbox der Station (gemessen, ohne Sockel), damit das
 *   Motiv mit dem Bildausschnitt (view-offset.ts) mittig in der freien Flaeche
 *   neben der Text-Karte steht und nie unter die Header-Zone rutscht.
 * - Abstand: Inhalt ≈ 42 % der freien Hoehe, d. h. D = h / (0,758 · tan(FOV/2));
 *   Papier zusaetzlich durch die Breite (≤ 80 % der freien Breite) begrenzt.
 * Inhaltsboxen (lokal, y): Marke 1,03–1,79 (Dosen + Spruehring), Bildschirm
 * 1,03–1,78 (b: Karten bis x 1,02, y 1,94), Papier 1,03–1,23 (flach, 1,12 × 0,7),
 * Kopf 1,03–1,95 (Buste + Zwilling).
 * Blickrichtungen wie in der Spec (B frontal, C seitlich bzw. Kran fuer Papier).
 *
 * Fix-Runde 3: Seit der Deckel nach dem Oeffnen aus dem Bild faehrt (Plinth,
 * lidOffset), ist oben Kopfraum frei; Marke (B, C), Bildschirm (C) und Kopf
 * (B, C) stehen 13 % naeher (SHOT_DOLLY), die Objekte werden groesser. Papier B flacher
 * (Elevation ~30° statt ~35°, Abstand 3,3 statt 2,75 m), damit die ganze
 * Schneidematte im freien Feld links der Karte liegt; der Kran bleibt C.
 */
const SHOT_DOLLY = 0.87;

/** Kamera auf der Linie zum Ziel naeher (k < 1) bzw. weiter weg (k > 1). */
function dolly(shot: StationShot, k: number): StationShot {
  const [px, py, pz] = shot.pos;
  const [tx, ty, tz] = shot.tgt;
  return Object.freeze({ ...shot, pos: [tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k] as const });
}

const B_SHOTS: Readonly<Record<StationId, StationShot>> = Object.freeze({
  marke: dolly({ pos: [0.24, 1.73, 3.25], tgt: [0.02, 1.41, -0.01], fov: 34 }, SHOT_DOLLY),
  // Bildschirm B bleibt: im Reduced-Standbild (cut2 0,3) stehen dort schon die Social-Karten bis x 1,02.
  bildschirm: { pos: [-0.21, 1.72, 3.17], tgt: [0, 1.4, -0.05], fov: 34 },
  papier: { pos: [0.71, 2.7, 2.83], tgt: [0.01, 1.05, 0.06], fov: 34 },
  kopf: dolly({ pos: [-0.09, 1.88, 3.97], tgt: [0.17, 1.49, 0.03], fov: 34 }, SHOT_DOLLY),
});

/** C-Keys (beat b 0,50): Marke seitlich vorn rechts, Bildschirm mit Karten, Papier Kran, Kopf Portraet mit Zwilling. */
const C_SHOTS: Readonly<Record<StationId, StationShot>> = Object.freeze({
  marke: dolly({ pos: [1.7, 1.94, 3.02], tgt: [0.12, 1.41, -0.06], fov: 32 }, SHOT_DOLLY),
  bildschirm: dolly({ pos: [0.09, 1.87, 3.85], tgt: [0.29, 1.49, -0.05], fov: 34 }, SHOT_DOLLY),
  papier: { pos: [0.28, 3.1, 1.76], tgt: [0.01, 1.06, 0.07], fov: 34 },
  kopf: dolly({ pos: [-0.97, 1.83, 3.34], tgt: [0.17, 1.49, 0.03], fov: 38 }, SHOT_DOLLY),
});

/**
 * Ablauf einer Station (Anker-Fortschritte, Fix-Runde 3). Vorher setzte die
 * Abfahrt D schon bei beat b 0,92 ein, waehrend die Karte noch voll lesbar war:
 * die Kamera blickte auf leeren Boden und den geschlossenen, unbeleuchteten
 * Sockel der naechsten Station. Jetzt:
 * - C (b 0,5) → R (b 1,0): Halt — das Objekt bleibt im Bild, solange die Karte
 *   steht (sticky bis etwa b 1,0–1,06, gemessen 1440 × 900).
 * - R → D-<id> (naechste Station a 0,0): die Abfahrt laeuft, waehrend die Karte
 *   den Viewport verlaesst; bei a 0 ist sie draussen (Unterkante unter der
 *   Header-Zone). D-<id> ist eine Anfahrts-Pose IN der naechsten Station
 *   (frontal, zurueckgesetzt): der Blick dreht frueh auf das naechste Ziel, das
 *   Licht folgt dem Blickziel (LightRig, frame.cameraTarget).
 * - A (a 0,1) → B (a 0,6): Ankunft, der Deckel hebt sich (a 0,1–0,3).
 * D-kopf (Kranfahrt bei kopf:b 0,85) bleibt: dort folgt die Papierwand, keine Station.
 */
export const STATION_KEY_AT = Object.freeze({
  /** Anfahrt D-<vorige> auf beat a der Station */
  approach: 0,
  a: 0.1,
  b: 0.6,
  /** auf beat b */
  c: 0.5,
  /** Ende des Halts (Beginn der Abfahrt) auf beat b */
  depart: 1,
});

/** D-kopf: Kranfahrt, Station-lokal (Abnahme 14.10.2026), bei kopf:b 0,85. */
const KOPF_DEPARTURE: StationShot & { readonly p: number } = Object.freeze({
  p: 0.85,
  pos: [-0.95, 4.07, 3.54] as Vec3Tuple,
  tgt: [0.17, 1.4, 0.03] as Vec3Tuple,
  fov: 40,
});

/**
 * Anfahrts-Pose (Station-lokal der ANKUNFTS-Station, σ = deren Seite): Die
 * vorige Station liegt jeweils fast genau vor der Sockel-Front (lokal x 0,8 … −0,1,
 * z ≈ 13,6), die Anfahrt ist also ein Zug geradeaus auf die Front, aus etwa
 * 6,6 m und etwas erhoeht, bis A (4,4 m).
 */
function approachShot(id: StationId): StationShot {
  const sigma = STATIONS[id].side;
  const targetY = id === 'papier' ? 1.15 : 1.38;
  return { pos: [0.6 * sigma, 2.2, 6.6], tgt: [0, targetY, 0], fov: 40 };
}

function stationKeys(id: StationId, index: number): readonly CameraKey[] {
  const sigma = STATIONS[id].side;
  const beatA = `${id}:a` as const;
  const beatB = `${id}:b` as const;
  const b = B_SHOTS[id];
  const c = C_SHOTS[id];
  const prev = index > 0 ? STATION_ORDER[index - 1] : null;
  const last = index === STATION_ORDER.length - 1;
  const approach = approachShot(id);
  const keys: CameraKey[] = [];
  if (prev) {
    keys.push(
      freezeKey({ id: `D-${prev}`, at: [beatA, STATION_KEY_AT.approach], ...approach, space: id, window: beatA }),
    );
  }
  keys.push(
    freezeKey({ id: `A-${id}`, at: [beatA, STATION_KEY_AT.a], pos: [0.4 * sigma, 1.85, 4.4], tgt: [0, 1.4, 0], fov: 38, space: id, window: beatA }),
    freezeKey({ id: `B-${id}`, at: [beatA, STATION_KEY_AT.b], ...b, hold: true, space: id, window: beatA }),
    freezeKey({ id: `C-${id}`, at: [beatB, STATION_KEY_AT.c], ...c, hold: true, space: id, window: beatB }),
  );
  if (last) {
    const { p, pos, tgt, fov } = KOPF_DEPARTURE;
    keys.push(freezeKey({ id: `D-${id}`, at: [beatB, p], pos, tgt, fov, space: id, window: beatB }));
  } else {
    keys.push(freezeKey({ id: `R-${id}`, at: [beatB, STATION_KEY_AT.depart], ...c, space: id, window: beatB }));
  }
  return keys;
}

/** Rueckfall-Pose der Kontakt-Keys ohne Messung (alte Spec-Werte). */
const E_POS: Vec3Tuple = [-4.5, 1.9, 19];
const E_TGT: Vec3Tuple = [-4.5, 1.5, 0];

/**
 * Welt-Keys nach den Stationen (Kran, Sprung in der Papierwand, Kontakt).
 *
 * F haengt (Integrator-Entscheid 14.10.2026) an cover 0 statt an kopf:b 1:
 * D-kopf → F dreht den Blick; auf kopf:b 0,85 → 1 waeren das nur
 * 0,12 Viewporthoehen (harter Schwenk); bis cover 0 verteilt sich die
 * Kranfahrt ueber die Strecke, auf der die Papierwand ins Bild schiebt.
 *
 * F (Abnahme 14.10.2026): vorher (0, 9, −58) → (0, 0, −44); die Bildmitte lag auf
 * leerem Boden zwischen Bildschirm und Papier, Papier lag unter dem Bildrand,
 * Bildschirm jenseits der Sichtweite, und die Fahrt D-kopf → F schwenkte ~150°
 * ueber leeren Boden. Jetzt ein Kran-Zug zurueck und nach oben: die Kamera
 * faehrt von der Buste nach links oben weg (9 m) und blickt schraeg hinab auf
 * die Mitte zwischen Kopf und Papier — Drehung nur ~40°, Kopf links, Papier
 * rechts, beide waehrend der ganzen Fahrt im Bild (Sichtweite 30 m, StationShell).
 *
 * E/K0/K1 (Fix-Runde 3): view 'kontakt' — die ganze Skulptur mittig in der freien
 * Flaeche (Desktop: rechts vom Kontakt-Panel; Compact: im 40svh-Fenster an der
 * Scroll-Position des Keys), E/K0 offen (o 1, groesser gerahmt), K1 geschlossen.
 * E misst an der Stelle von K0 (frameAt), damit E → K0 stillsteht.
 */
const TAIL_KEYS: readonly CameraKey[] = [
  freezeKey({ id: 'F', at: ['cover', 0], pos: [-14, 9.5, -59.5], tgt: [-0.4, 1, -59.2], fov: 40, roll: 0, space: 'world' }),
  freezeKey({
    id: 'E',
    at: ['cover', 0.5],
    pos: E_POS,
    tgt: E_TGT,
    fov: 35,
    roll: 0,
    cut: true,
    space: 'world',
    view: 'kontakt',
    open: 1,
    window: 'kontakt',
    frameAt: ['kontakt', 0],
  }),
  freezeKey({
    id: 'K0',
    at: ['kontakt', 0],
    pos: E_POS,
    tgt: E_TGT,
    fov: 35,
    roll: 0,
    space: 'world',
    view: 'kontakt',
    open: 1,
    window: 'kontakt',
  }),
  freezeKey({
    id: 'K1',
    at: ['kontakt', 0.85],
    pos: [-4.5, 1.8, 22],
    tgt: [-4.5, 1.45, 0],
    fov: 34,
    roll: 0,
    hold: true,
    space: 'world',
    view: 'kontakt',
    open: 0,
    window: 'kontakt',
  }),
];

/** Alle Keys in Spec-Reihenfolge (§3.9). */
export const CAMERA_KEYS: readonly CameraKey[] = Object.freeze([
  ...HEAD_KEYS,
  ...STATION_ORDER.flatMap((id, index) => stationKeys(id, index)),
  ...TAIL_KEYS,
]);

const KEY_BY_ID: ReadonlyMap<string, CameraKey> = new Map(CAMERA_KEYS.map((k) => [k.id, k]));

export function cameraKeyById(id: string): CameraKey | null {
  return KEY_BY_ID.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Aufloesung in Welt + Scroll-Position
// ---------------------------------------------------------------------------

type MutableVec3 = [number, number, number];

export interface ResolvedCameraKey {
  readonly id: string;
  /** Scroll-Position in px */
  readonly y: number;
  readonly pos: Vec3Tuple;
  readonly tgt: Vec3Tuple;
  readonly fov: number;
  readonly roll: number;
  /** setViewOffset x/y (Anteil der Breite/Hoehe) */
  readonly shiftX: number;
  readonly shiftY: number;
  readonly cut: boolean;
  readonly hold: boolean;
}

/** Fertige Pose fuer S0 (hero-framing.ts), bereits fuer compact passend. */
export interface HeroKeyPose {
  readonly pos: Vec3Tuple;
  readonly tgt: Vec3Tuple;
  readonly fov: number;
  readonly shiftY: number;
}

/** Bildausschnitt und Compact-Zustand, gemessen beim Layout-Refresh (CameraRig). */
export interface CameraFraming {
  readonly compact: boolean;
  /** Viewport (px); 0 = unbekannt → Rueckfall-Posen fuer view 'kontakt' */
  readonly width: number;
  readonly height: number;
  /** Unterkante der Header-Zone (px) */
  readonly safeTop: number;
  /** Pose fuer S0; null = Spec-Pose von S0 */
  readonly hero: HeroKeyPose | null;
  /** Desktop: x-Ausschnitt je Station (Objekt mittig neben der Karte) */
  readonly stationShiftX: Readonly<Record<StationId, number>>;
  /** Desktop: y-Ausschnitt der Station-Keys (unter der Header-Zone) */
  readonly stationShiftY: number;
  /** Desktop: x-Ausschnitt der Haltungs-Keys (Panel-Kante gemessen) */
  readonly haltungShiftX: number;
  /** Desktop: Kontakt-Panel; frei ist die Flaeche rechts davon (null = ganze Breite) */
  readonly kontaktPanel: CardSpan | null;
  /** Compact: 3D-Fenster in Dokument-Koordinaten (framing-probe) */
  readonly windows: Readonly<Partial<Record<SceneWindowId, DocSpan>>>;
  /** Compact: y-Ausschnitt, wenn kein Fenster gemessen bzw. sichtbar ist */
  readonly compactShiftY: number;
}

export const COMPACT_FOV_FACTOR = 1.2;
export const COMPACT_FOV_MAX = 62;
export const COMPACT_DOLLY = 1.25;

function toWorld(space: CameraKeySpace, v: Vec3Tuple): Vec3Tuple {
  return space === 'world' ? v : stationLocalToWorld(space, v);
}

/** Compact (§3.9): Position = Ziel + (Position − Ziel) × 1,25. */
function compactPosition(pos: Vec3Tuple, tgt: Vec3Tuple): Vec3Tuple {
  return [
    tgt[0] + (pos[0] - tgt[0]) * COMPACT_DOLLY,
    tgt[1] + (pos[1] - tgt[1]) * COMPACT_DOLLY,
    tgt[2] + (pos[2] - tgt[2]) * COMPACT_DOLLY,
  ];
}

function keyShiftX(key: CameraKey, framing: CameraFraming): number {
  if (framing.compact) return 0;
  if (key.view === 'haltung') return framing.haltungShiftX;
  return key.space === 'world' ? 0 : framing.stationShiftX[key.space];
}

function keyShiftY(key: CameraKey, framing: CameraFraming, frameY: number): number {
  if (framing.compact) {
    const span = key.window ? framing.windows[key.window] : undefined;
    return windowShiftY(span, frameY, framing.safeTop, framing.height, framing.compactShiftY);
  }
  return key.space === 'world' ? 0 : framing.stationShiftY;
}

/** Compact: Kontakt-Fenster ohne Messung — obere 45 % unter der Header-Zone. */
const KONTAKT_FALLBACK_BOTTOM = 0.45;

/** Freie Flaeche fuer die Kontakt-Skulptur (Desktop rechts vom Panel, Compact im Fenster). */
function kontaktRect(framing: CameraFraming, frameY: number): FreeRect {
  const { width, height, safeTop } = framing;
  if (!framing.compact) {
    const left = framing.kontaktPanel && framing.kontaktPanel.right < width ? framing.kontaktPanel.right : 0;
    return { left, right: width, top: safeTop, bottom: height };
  }
  const span = framing.windows.kontakt;
  const band = span ? visibleBand(span, frameY, safeTop, height) : null;
  const usable = band !== null && band.bottom - band.top > 0;
  return {
    left: 0,
    right: width,
    top: usable ? band.top : safeTop,
    bottom: usable ? band.bottom : height * KONTAKT_FALLBACK_BOTTOM,
  };
}

type PoseCommon = Pick<ResolvedCameraKey, 'id' | 'y' | 'roll' | 'cut' | 'hold'>;

function resolveKontaktPose(key: CameraKey, framing: CameraFraming, common: PoseCommon, frameY: number): ResolvedCameraKey {
  const fit = fitSculptureInRect({
    width: framing.width,
    height: framing.height,
    compact: framing.compact,
    rect: kontaktRect(framing, frameY),
    open: key.open ?? 0,
  });
  return Object.freeze({ ...common, pos: fit.pos, tgt: fit.tgt, fov: fit.fov, shiftX: fit.shiftX, shiftY: fit.shiftY });
}

/**
 * Key in Weltkoordinaten, mit Compact-Anpassung (FOV × 1,2 bis 62°, Abstand
 * × 1,25) und Bildausschnitt. S0 nimmt die gemessene Hero-Pose, view 'kontakt'
 * die gerahmte Kontakt-Pose (sofern die Viewport-Groesse bekannt ist).
 * `y` ist die Scroll-Position des Keys, `frameY` die der Fenster-Messung (Compact).
 */
export function resolveKeyPose(key: CameraKey, framing: CameraFraming, y = 0, frameY = y): ResolvedCameraKey {
  const common: PoseCommon = { id: key.id, y, roll: key.roll ?? 0, cut: key.cut === true, hold: key.hold === true };
  if (key.id === HERO_KEY_ID && framing.hero) {
    const { pos, tgt, fov, shiftY } = framing.hero;
    return Object.freeze({ ...common, pos, tgt, fov, shiftX: 0, shiftY });
  }
  if (key.view === 'kontakt' && framing.width > 0 && framing.height > 0) {
    return resolveKontaktPose(key, framing, common, frameY);
  }
  const tgt = toWorld(key.space, key.tgt);
  const worldPos = toWorld(key.space, key.pos);
  return Object.freeze({
    ...common,
    pos: framing.compact ? compactPosition(worldPos, tgt) : worldPos,
    tgt,
    fov: framing.compact ? Math.min(key.fov * COMPACT_FOV_FACTOR, COMPACT_FOV_MAX) : key.fov,
    shiftX: keyShiftX(key, framing),
    shiftY: keyShiftY(key, framing, frameY),
  });
}

/**
 * Alle Keys mit bekanntem Anker, in Spec-Reihenfolge (nicht sortiert).
 * Keys ohne Anker werden uebersprungen.
 */
export function resolveCameraKeys(
  anchorYOf: (id: AnchorId, p: number) => number | null,
  framing: CameraFraming,
): readonly ResolvedCameraKey[] {
  return Object.freeze(
    CAMERA_KEYS.flatMap((key) => {
      const y = anchorYOf(key.at[0], key.at[1]);
      if (y === null || !Number.isFinite(y)) return [];
      const frameY = key.frameAt ? anchorYOf(key.frameAt[0], key.frameAt[1]) : y;
      return [resolveKeyPose(key, framing, y, frameY !== null && Number.isFinite(frameY) ? frameY : y)];
    }),
  );
}

/**
 * Pfad-Keys streng steigend (Eingabe in Spec-Reihenfolge). Liegt ein Key nicht
 * hinter seinem Vorgaenger, entfaellt der Vorgaenger — sonst fuehre die Kamera
 * nach dem Sortieren kurz zurueck. Beispiel (gemessen 14.10.2026, 768 × 1024
 * compact): A-marke (marke:a 0,1) liegt bei 2979 px vor L0 (leistungen 0, 3007 px),
 * weil der Leistungen-Kopf kuerzer als 0,6 Viewporthoehen ist. cut-Keys bleiben
 * immer stehen; liegt ein Key nicht hinter einem cut-Key, entfaellt er selbst.
 */
export function pathKeys(keys: readonly ResolvedCameraKey[]): readonly ResolvedCameraKey[] {
  const out: ResolvedCameraKey[] = [];
  for (const key of keys) {
    while (out.length > 0 && out[out.length - 1].y >= key.y && !out[out.length - 1].cut) out.pop();
    if (out.length > 0 && out[out.length - 1].y >= key.y) continue;
    out.push(key);
  }
  return Object.freeze(out);
}

/** Dev-Pruefung: Spec-Reihenfolge muss streng steigend sein. Liefert Fehlermeldungen. */
export function findOrderIssues(keys: readonly ResolvedCameraKey[]): readonly string[] {
  return keys.flatMap((key, i) => {
    if (i === 0) return [];
    const prev = keys[i - 1];
    return key.y > prev.y ? [] : [`${prev.id} (${Math.round(prev.y)} px) ≥ ${key.id} (${Math.round(key.y)} px)`];
  });
}

// ---------------------------------------------------------------------------
// Pfad-Auswertung (Hot Path)
// ---------------------------------------------------------------------------

export interface CameraPose {
  pos: MutableVec3;
  tgt: MutableVec3;
  fov: number;
  roll: number;
  shiftX: number;
  shiftY: number;
}

export function createPose(): CameraPose {
  return { pos: [0, 0, 0], tgt: [0, 0, 0], fov: 35, roll: 0, shiftX: 0, shiftY: 0 };
}

function copyVec(out: MutableVec3, v: Vec3Tuple): void {
  out[0] = v[0];
  out[1] = v[1];
  out[2] = v[2];
}

/** Schreibt einen Key unveraendert in `out`. */
export function writeKeyPose(key: ResolvedCameraKey, out: CameraPose): CameraPose {
  copyVec(out.pos, key.pos);
  copyVec(out.tgt, key.tgt);
  out.fov = key.fov;
  out.roll = key.roll;
  out.shiftX = key.shiftX;
  out.shiftY = key.shiftY;
  return out;
}

const CR_MIN_DT = 1e-4;
const CR_SAME_POINT = 1e-6;

function distSq(a: Vec3Tuple, b: Vec3Tuple): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Ein Wert des nicht-uniformen Catmull-Rom-Segments p1 → p2 (Hermite-Form wie three/CatmullRomCurve3). */
function crComponent(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number, t: number): number {
  const m1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1;
  const m2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1;
  const c2 = -3 * x1 + 3 * x2 - 2 * m1 - m2;
  const c3 = 2 * x1 - 2 * x2 + m1 + m2;
  return x1 + m1 * t + c2 * t * t + c3 * t * t * t;
}

/**
 * Zentripetaler Catmull-Rom (alpha 0,5) fuer das Segment p1 → p2, t in [0, 1].
 * Gleiche Endpunkte → konstant (z. B. E → K0).
 */
function catmullRom(p0: Vec3Tuple, p1: Vec3Tuple, p2: Vec3Tuple, p3: Vec3Tuple, t: number, out: MutableVec3): void {
  if (distSq(p1, p2) < CR_SAME_POINT) {
    copyVec(out, p1);
    return;
  }
  let dt1 = Math.pow(distSq(p1, p2), 0.25);
  let dt0 = Math.pow(distSq(p0, p1), 0.25);
  let dt2 = Math.pow(distSq(p2, p3), 0.25);
  if (dt1 < CR_MIN_DT) dt1 = 1;
  if (dt0 < CR_MIN_DT) dt0 = dt1;
  if (dt2 < CR_MIN_DT) dt2 = dt1;
  for (let c = 0; c < 3; c++) {
    out[c] = crComponent(p0[c], p1[c], p2[c], p3[c], dt0, dt1, dt2, t);
  }
}

/** Index i mit keys[i].y ≤ y < keys[i+1].y (keys sortiert, mind. 2). */
function segmentIndex(keys: readonly ResolvedCameraKey[], y: number): number {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].y <= y) i++;
  return i;
}

/**
 * Kamera-Pose an Scroll-Position y (keys nach y sortiert, nicht leer).
 * Vor dem ersten bzw. nach dem letzten Key: dieser Key. Vor einem cut-Key
 * haelt das Segment den vorigen Key.
 */
export function sampleCameraPath(keys: readonly ResolvedCameraKey[], y: number, out: CameraPose): CameraPose {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (keys.length === 1 || y <= first.y) return writeKeyPose(first, out);
  if (y >= last.y) return writeKeyPose(last, out);

  const i = segmentIndex(keys, y);
  const k1 = keys[i];
  const k2 = keys[i + 1];
  if (k2.cut) return writeKeyPose(k1, out);

  const span = k2.y - k1.y;
  const t = span > 0 ? easeSineInOut((y - k1.y) / span) : 1;
  // Nachbarn nur auf derselben Seite eines Schnitts, sonst Endpunkt doppeln.
  const k0 = i > 0 && !k1.cut ? keys[i - 1] : k1;
  const k3 = i + 2 < keys.length && !keys[i + 2].cut ? keys[i + 2] : k2;

  catmullRom(k0.pos, k1.pos, k2.pos, k3.pos, t, out.pos);
  catmullRom(k0.tgt, k1.tgt, k2.tgt, k3.tgt, t, out.tgt);
  out.fov = lerp(k1.fov, k2.fov, t);
  out.roll = lerp(k1.roll, k2.roll, t);
  out.shiftX = lerp(k1.shiftX, k2.shiftX, t);
  out.shiftY = lerp(k1.shiftY, k2.shiftY, t);
  return out;
}

/** true, wenn zwischen y0 und y1 (in beliebiger Richtung) ein cut-Key liegt. */
export function crossesCut(keys: readonly ResolvedCameraKey[], y0: number, y1: number): boolean {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  return keys.some((k) => k.cut && k.y > lo && k.y <= hi);
}

// ---------------------------------------------------------------------------
// Reduced
// ---------------------------------------------------------------------------

interface ReducedContext {
  readonly activeSection: SectionId;
  readonly activeBeat: BeatId | null;
}

/** Halte-Key der Haltung: der Monolith des aktiven Prinzips, sonst Monolith 1. */
function haltungHoldKeyId(activeBeat: BeatId | null): string {
  const index = activeBeat === 'haltung:2' ? 1 : activeBeat === 'haltung:3' ? 2 : 0;
  return HALTUNG_KEY_IDS[index];
}

/**
 * Halte-Key des aktuellen Bereichs (Reduced Motion): start S0, haltung H1–H3
 * (aktives Prinzip), kontakt K1, Station B (Beat a) bzw. C (Beat b). Sonst null
 * → Fallback ueber die Scroll-Position (lastHoldKeyAtOrBefore).
 */
export function reducedHoldKeyId({ activeSection, activeBeat }: ReducedContext): string | null {
  if (activeSection === 'start') return 'S0';
  if (activeSection === 'haltung') return haltungHoldKeyId(activeBeat);
  if (activeSection === 'kontakt') return 'K1';
  const station = stationOfBeat(activeBeat);
  if (station && activeBeat) return `${activeBeat.endsWith(':b') ? 'C' : 'B'}-${station}`;
  return null;
}

/** Letzter Halte-Key mit y ≤ scrollY (keys sortiert); null, wenn keiner. */
export function lastHoldKeyAtOrBefore(keys: readonly ResolvedCameraKey[], y: number): ResolvedCameraKey | null {
  let found: ResolvedCameraKey | null = null;
  for (const key of keys) {
    if (key.y > y) break;
    if (key.hold) found = key;
  }
  return found;
}
