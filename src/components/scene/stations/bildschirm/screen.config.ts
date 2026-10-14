/**
 * Konfiguration der Station II – Bildschirm (DESIGN_SPEC §3.3.2).
 * Reine Daten und reine Funktionen, keine Imports von React oder three.
 */

import { COLORS } from '@/lib/brand';
import { smoothstep } from '@/lib/scene/math';
import type { Vec3Tuple } from '@/lib/scene/stations';

/**
 * UV-Spiegelung des Bildschirm-Shaders (vUv planar aus position.xy).
 * Kalibriert per GLB-Analyse (14.10.2026, classic_laptop.glb): das Primitiv
 * mit Material `classic_laptop_screen` liegt in der Objekt-xy-Ebene
 * (z konstant), alle 20 Normalen zeigen nach +z, der Knoten hat keine
 * Rotation. Von vorn (Kamera bei +z) zeigt +x nach rechts und +y nach oben,
 * also passt die CanvasTexture (flipY) ohne Spiegelung. In der Sandbox
 * /dev/stage/bildschirm gegenpruefen: DOS-Zeilen lesbar, Diagonale steigt
 * nach rechts.
 */
export const SCREEN_FLIP = Object.freeze({ u: false, v: false });

/** Laptop: Bounding Box (ASSETS.md) 0,652 m breit → 0,9 m. */
export const LAPTOP = Object.freeze({
  position: [0, 1.03, -0.05] as Vec3Tuple,
  scale: 1.38,
  targetWidth: 0.9,
});

export const SCREEN_MATERIAL_NAME = 'classic_laptop_screen';
export const HOUSING_MATERIAL_NAME = 'classic_laptop';

/** Gehaeuse: Plastik → Alu unterhalb der Ebene; Ebene y = mix(0,98, 1,80, cut1). */
export const HOUSING = Object.freeze({
  /** Spec-Bereich; per Bounding Box nur erweitert, nie verkuerzt */
  planeY: [0.98, 1.8] as const,
  below: '#2A2A2A',
  roughness: 0.32,
  metalness: 0.65,
  edge: 0.012,
  glowStrength: 3,
});

/** Bildschirm-Texturen uDos / uWeb / uFeed */
export const SCREEN_TEXTURE = Object.freeze({ width: 1024, height: 640 });

/** Reduced-Standbild: oben DOS, Mitte Website, unten Feed; Gehaeuse halb; Cursor an. */
export const REDUCED_STILL = Object.freeze({ cut1: 0.62, cut2: 0.3, housing: 0.5, cursorOn: 1 });

/**
 * Cursor-Block: blinkt 2-mal (Periode 0,5 s) ab Eintritt in beat a > 0,05,
 * danach an. Fix-Runde 3: vorher 3 × 1 s mit keepAlive(3100) — Ruhe erst 3,2 s
 * nach der Eingabe; jetzt endet das Blinken nach 1,0 s (Ruhe-Kriterium ≤ 1,2 s).
 */
export const CURSOR = Object.freeze({
  armAbove: 0.05,
  /** erneut scharf erst unterhalb (Hysterese gegen Flackern am Schwellwert) */
  rearmBelow: 0.02,
  periodMs: 500,
  blinks: 2,
  keepAliveMs: 1050,
});

/**
 * Motive der 3 × 2 Feed-Karten auf dem Bildschirm als Indizes in
 * COPY.scene3d.feed. Laut Spec §3.3.2: „Hallo Neubau.“, „Neu!“, „Hinter den
 * Kulissen“, „Frage der Woche“, „Tipp“, „Danke!“ (Zitat/Termin/Story nur im
 * Stretch-Atlas).
 */
export const FEED_SCREEN_MOTIFS: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 7]);

/**
 * Ersatz-Bildschirm, falls das Primitiv fehlt: Mitte und Groesse im
 * Laptop-Modellraum (aus classic_laptop.glb: Knoten-Translation/-Skala und
 * Primitiv-Bounds).
 */
export const FALLBACK_SCREEN = Object.freeze({
  center: [0.0001, 0.3296, -0.2062] as Vec3Tuple,
  size: [0.4485, 0.3665] as const,
});

/** Stretch: Social-Karten (InstancedMesh) */
export const SOCIAL = Object.freeze({
  size: [0.16, 0.28] as const,
  cornerRadius: 0.012,
  cols: [0.55, 0.75, 0.95] as const,
  rows: [1.8, 1.55, 1.3] as const,
  z: 0.05,
  /** Tiefenstaffel je Karte gegen z-Fighting in den Ueberlappungen */
  zStep: 0.002,
  delay: 0.06,
  /** Bezier-Kontrollpunkt: Mitte der Strecke + 0,6 Richtung Kamera (+z lokal) */
  controlZ: 0.6,
  startScale: 0.15,
  /** Drehung um y waehrend des Flugs (rad), endet bei 0 */
  flightYaw: 0.9,
  /** maximale Schraeglage am Ziel (rad, deterministisch je Karte) */
  roll: 0.06,
  seed: 0x50c1a1,
});

export const SOCIAL_ATLAS = Object.freeze({ width: 576, height: 1008, cols: 3, rows: 3 });

export const SCREEN_GLOW = COLORS.glow;

/** Gluehen nur waehrend des Schnitts: 0 bei c = 0 und c = 1, dazwischen 1. */
export function cutGlowEnvelope(c: number): number {
  return smoothstep(0, 0.04, c) * (1 - smoothstep(0.96, 1, c));
}
