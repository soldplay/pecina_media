/**
 * Marken-Konstanten (DESIGN_SPEC §1.2, §2.1). Reine Konstanten, keine Imports,
 * damit 3D-, DOM- und Node-Code sie gleichermassen nutzen koennen.
 *
 * Der Schnitt aus dem Logo steigt von links unten nach rechts oben mit 6,0°.
 * Richtung d = (cos 6°, sin 6°), Normale n = (−sin 6°, cos 6°).
 */

/** Schnittwinkel in Grad (am Logo-PNG gemessen, Toleranz ±0,3°). */
export const CUT_DEG = 6;
/** Schnittwinkel in Radiant (6° · π / 180). */
export const CUT_RAD = 0.10472;
/** tan 6° — Anstieg der Schnittlinie, auch Basis von --cut-rise (10,51vw). */
export const CUT_TAN = 0.1051;
export const CUT_SIN = 0.104528;
export const CUT_COS = 0.994522;
/** Spaltbreite als Anteil der Versalhoehe (9 %). */
export const CUT_GAP = 0.09;

/** Richtung entlang der Schnittlinie (2D, x nach rechts, y nach oben). */
export const CUT_DIR = [CUT_COS, CUT_SIN] as const;
/** Normale der Schnittlinie, zeigt nach oben links. */
export const CUT_NORMAL = [-CUT_SIN, CUT_COS] as const;

export const COLORS = {
  ink: '#0E0E0E',
  anthracite: '#1C1C1C',
  graphite: '#2A2826',
  paper: '#F4F1EA',
  paper2: '#EAE5DA',
  brand: '#D17F0C',
  brandText: '#9D5F09',
  glow: '#FFB257',
  blade: '#FFE3B8',
  mutedDark: '#B5AFA4',
  mutedLight: '#5C574F',
  amber: '#FFB000',
  lead: '#3A3A3A',
} as const;

/** CSS-Variablen der next/font-Schriften (gesetzt in app/layout.tsx). */
export const FONT_VARS = {
  display: '--font-archivo',
  round: '--font-comfortaa',
} as const;

/** Header-Hoehe in px (Desktop); Offset fuer Anker-Scrolls. */
export const HEADER_OFFSET = 72;
