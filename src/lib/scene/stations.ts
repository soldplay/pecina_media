/**
 * Szenen-Konstanten der Startseite (DESIGN_SPEC §3.1, §3.2, §3.3.0, §3.9, §5.2).
 * Reine Daten und Funktionen ohne React/three. Koordinaten in Metern,
 * +y oben, Kamera blickt Richtung −z.
 */

import type { LeistungNum } from '@/content/types';
import { CUT_COS, CUT_SIN } from '@/lib/brand';
import type { ModelKey } from './assets';
import type { StationBeatId, StationId } from './ids';
import { power2InOut, smoothstep } from './math';

export type Vec3Tuple = readonly [number, number, number];

export interface StationDef {
  readonly id: StationId;
  /** Interner Name (Dev/Debug). Sichtbarer Stationsname: COPY.leistungen.stations[id] */
  readonly label: string;
  readonly numeral: 'I' | 'II' | 'III' | 'IV';
  /** Sockelmitte am Boden, Weltkoordinaten */
  readonly position: Vec3Tuple;
  /** Drehung um Y in Radiant */
  readonly rotY: number;
  /** σ in den Station-lokalen Kamera-Keys (§3.9) */
  readonly side: 1 | -1;
  /** Seite der Text-Karte im DOM; das Objekt steht im gegenueberliegenden Drittel */
  readonly textSide: 'left' | 'right';
  readonly beats: readonly [StationBeatId, StationBeatId];
  readonly leistungen: readonly [LeistungNum, LeistungNum];
  readonly model: ModelKey;
  /**
   * Key-Licht: neutral-warm (Abnahme 14.10.2026, vorher Pfirsich-Toene). Orange
   * kommt nur als Akzent ins Bild (Rim, Naht, Markenobjekte).
   */
  readonly keyTint: string;
  readonly rimTint: string;
}

const RIM_TINT = '#D17F0C';

/** Friert eine Station ein; der Parameter-Typ sorgt fuer Tupel statt number[]. */
const station = (def: StationDef): StationDef => Object.freeze(def);

export const STATIONS: Readonly<Record<StationId, StationDef>> = Object.freeze({
  marke: station({
    id: 'marke',
    label: 'Marke',
    numeral: 'I',
    position: [-3.2, 0, -30],
    rotY: 0.5,
    side: 1,
    textSide: 'right',
    beats: ['marke:a', 'marke:b'],
    leistungen: ['01', '02'],
    model: 'spray',
    keyTint: '#FFF1E2',
    rimTint: RIM_TINT,
  }),
  bildschirm: station({
    id: 'bildschirm',
    label: 'Bildschirm',
    numeral: 'II',
    position: [3.2, 0, -42],
    rotY: -0.55,
    side: -1,
    textSide: 'left',
    beats: ['bildschirm:a', 'bildschirm:b'],
    leistungen: ['03', '04'],
    model: 'laptop',
    keyTint: '#FFF5EB',
    rimTint: RIM_TINT,
  }),
  papier: station({
    id: 'papier',
    label: 'Papier',
    numeral: 'III',
    position: [-3.2, 0, -54],
    rotY: 0.5,
    side: 1,
    textSide: 'right',
    beats: ['papier:a', 'papier:b'],
    leistungen: ['05', '06'],
    model: 'notepads',
    keyTint: '#FFF3E6',
    rimTint: RIM_TINT,
  }),
  kopf: station({
    id: 'kopf',
    label: 'Kopf',
    numeral: 'IV',
    position: [3.2, 0, -66],
    rotY: -0.6,
    side: -1,
    textSide: 'left',
    beats: ['kopf:a', 'kopf:b'],
    leistungen: ['07', '08'],
    model: 'bust',
    keyTint: '#F2F4F7',
    rimTint: RIM_TINT,
  }),
});

export const STATION_ORDER: readonly StationId[] = ['marke', 'bildschirm', 'papier', 'kopf'];

/** Werkfuge-Sockel (§3.3.0), Station-lokal: Ursprung = Sockelmitte am Boden, +z = Front. */
export const PLINTH = Object.freeze({
  width: 1.6,
  height: 2.0,
  depth: 1.2,
  /** Schnitt durch (0, cutY) mit 6° in der Frontebene */
  cutY: 0.92,
  /**
   * Deckel-Versatz offen: n·lidLift + d·lidSlide, zweistufig (Plinth.lidOffset):
   * erst ein Spalt (n·lidGap), dann faehrt der Deckel entlang der 6°-Linie aus
   * dem Bild. Fix-Runde 3: vorher 1,15 / 0,3 — der offene Deckel hing als
   * schwere Masse im oberen Bilddrittel der B/C-Einstellungen.
   */
  lidGap: 0.3,
  lidLift: 2.6,
  lidSlide: 1.2,
  plate: Object.freeze({ w: 1.36, h: 0.03, d: 1.0, y: 1.0 }),
  /** Oberkante der Werkplatte = Standflaeche der Objekte */
  objectBaseY: 1.03,
});

/** MEDIA-Skulptur (§3.1). */
export const SCULPTURE = Object.freeze({
  center: [0, 1.6, 0] as const,
  capHeight: 3.0,
  /** Gesamtbreite 4,06 Einheiten × 3,0 (§3.1) */
  width: 12.18,
  depth: 1.6,
  /** Ruheversatz der Haelften entlang ±n (Spalt 0,27 = 9 % von 3,0) */
  restOffset: 0.135,
  /** Zusaetzlicher Versatz offen entlang n bzw. d (mal o) */
  openOffsetN: 0.5,
  openOffsetD: 0.9,
  bladeZ: -1.4,
});

/** Typo-Monolithe der Haltung (§3.2). */
export const MONOLITHS: readonly { readonly pos: Vec3Tuple; readonly rotY: number }[] = Object.freeze([
  Object.freeze({ pos: [-2.6, 0, -14] as const, rotY: 0.35 }),
  Object.freeze({ pos: [0.4, 0, -17] as const, rotY: 0 }),
  Object.freeze({ pos: [2.9, 0, -20] as const, rotY: -0.35 }),
]);
export const MONOLITH_SIZE: Vec3Tuple = [2.2, 4.8, 0.28];

export const WORLD = Object.freeze({
  background: '#0E0E0E',
  fogDensity: 0.035,
  floorColor: '#141414',
});

/**
 * Bildschirmhoehe der Skulpturmitte in S0 (Anteil der Viewporthoehe von oben),
 * Anker fuer Preloader-Linie und Low-Tier-Klinge.
 *
 * Desktop 0,36 → 0,22 (Abnahme 14.10.2026): Die ganze Skulptur muss ueber dem
 * H1-Band stehen; bei 1440 × 900 liegt die freie Flaeche zwischen Header (88 px)
 * und Band-Oberkante (322 px), Mitte 22 %. Die Kamera (hero-framing.ts) haelt
 * den Anker, soweit die freie Flaeche es zulaesst (16:9 und schmale Hoehen
 * weichen ab, gemessen 19,6–25 %).
 */
export const HERO_BLADE_SCREEN_Y = Object.freeze({ desktop: 0.22, compact: 0.28 });

/** Schnitt-Normale in Station-lokalen Koordinaten (Frontebene). */
export const CUT_LOCAL_NORMAL: Vec3Tuple = [-CUT_SIN, CUT_COS, 0];

/** Station-lokal → Welt: erst Rotation um Y (rotY), dann Translation. */
export function stationLocalToWorld(id: StationId, v: Vec3Tuple): [number, number, number] {
  const { position, rotY } = STATIONS[id];
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const x = v[0] * c + v[2] * s;
  const z = -v[0] * s + v[2] * c;
  return [position[0] + x, position[1] + v[1], position[2] + z];
}

export interface StationPhases {
  /** Deckel oeffnet (beat a 0,10 → 0,30) */
  readonly open: number;
  /** Schnitt 1 (beat a 0,30 → 0,85, power2.inOut) */
  readonly cut1: number;
  /** Schnitt 2 (beat b 0,20 → 0,80, power2.inOut) */
  readonly cut2: number;
}

const REDUCED_PHASES: StationPhases = Object.freeze({ open: 1, cut1: 1, cut2: 1 });

/**
 * Phasen einer Station aus ihren Beat-Fortschritten (Tabelle §3.3.0).
 * Bei reduced { open: 1, cut1: 1, cut2: 1 }; die Stationen setzen ihre
 * Standbild-Werte selbst.
 */
export function stationPhases(a: number, b: number, reduced: boolean): StationPhases {
  if (reduced) return REDUCED_PHASES;
  return {
    open: smoothstep(0.1, 0.3, a),
    cut1: power2InOut(smoothstep(0.3, 0.85, a)),
    cut2: power2InOut(smoothstep(0.2, 0.8, b)),
  };
}
