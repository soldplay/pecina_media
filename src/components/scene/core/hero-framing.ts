/**
 * Startbild S0 (DESIGN_SPEC §3.1, §3.9): die GANZE MEDIA-Skulptur steht in der
 * freien Flaeche zwischen Header und H1-Band (DOM, P5), die Lichtklinge quer
 * durch. Reine Mathematik ohne React/three/DOM; die Masse des Bands liefert
 * framing-probe.ts.
 *
 * Kamera: gerade auf die Skulptur (Augenhoehe = Skulpturmitte, keine Neigung,
 * keine stuerzenden Linien), Position (0, 1,6, D). Die Hoehe im Bild setzt eine
 * Objektivverschiebung (setViewOffset y). Die Skulptur wird so gross wie moeglich,
 * begrenzt durch
 *   - oben:  Header-Zone (88 px) + Rand
 *   - unten: Oberkante des Bands an der rechten Skulpturkante (6°-Schraege) − Rand
 *   - Seiten: Rand
 * Die Mitte bleibt so nah wie moeglich am Preloader-Anker (HERO_BLADE_SCREEN_Y).
 * FOV und Abstand: bevorzugter Abstand, FOV in Grenzen; reicht das nicht, faehrt
 * die Kamera zurueck (CameraRig gleicht den Nebel ueber den Abstand aus).
 */

import { CUT_COS, CUT_SIN } from '@/lib/brand';
import { SCULPTURE, type Vec3Tuple } from '@/lib/scene/stations';

/** Band-Kontur im Viewport bei scrollY 0 (px). Oberkante steigt nach rechts um `rise`. */
export interface HeroBand {
  readonly left: number;
  readonly right: number;
  /** y der Oberkante an der rechten Bandkante */
  readonly topRight: number;
  /** Hoehenunterschied der Oberkante links − rechts */
  readonly rise: number;
}

export interface HeroFitInput {
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
  /** null: Band nicht gefunden → Fallback-Flaeche (obere FALLBACK_BOTTOM der Hoehe) */
  readonly band: HeroBand | null;
  /** Unterkante der Header-Zone (px) */
  readonly safeTop: number;
  /** Wunschhoehe der Skulpturmitte (Anteil der Hoehe, Preloader-Anker) */
  readonly anchor: number;
  /** Oeffnung o in S0 (Bewegung 0, Reduced 0,35): Haelften stehen weiter auseinander */
  readonly open: number;
  /** Anhebung der ganzen Skulptur (Reduced, hero-timeline.sculptureLift) */
  readonly lift: number;
}

export interface HeroPose {
  readonly pos: Vec3Tuple;
  readonly tgt: Vec3Tuple;
  /** vertikales FOV in Grad */
  readonly fov: number;
  /** setViewOffset y, Anteil der Hoehe (positiv: Bildinhalt wandert nach oben) */
  readonly shiftY: number;
}

const EYE_Y = SCULPTURE.center[1];
/** Vorderflaeche der Skulptur (naechste Ebene → groesste Projektion) */
const FRONT_Z = SCULPTURE.depth / 2;
const HALF_WIDTH = SCULPTURE.width / 2;
const HALF_CAP = SCULPTURE.capHeight / 2;

const MARGIN = Object.freeze({ top: 8, bottom: 12, sideMin: 16, sideFraction: 0.04 });
/** Anteil der maximal moeglichen Groesse (Luft zu den Grenzen, Pointer-Parallaxe) */
const FILL = 0.96;
/** Breite hoechstens dieser Anteil der Viewportbreite (Desktop: sehr breite Fenster) */
const MAX_WIDTH_FRACTION = Object.freeze({ desktop: 0.82, compact: 0.9 });
/** Ohne Band: Skulptur in der oberen Haelfte bzw. den oberen 42 % (compact) */
const FALLBACK_BOTTOM = Object.freeze({ desktop: 0.5, compact: 0.42 });
const PREFERRED_DISTANCE = Object.freeze({ desktop: 20, compact: 22 });
const FOV_RANGE = Object.freeze({ desktop: [32, 50] as const, compact: [36, 72] as const });
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
/** Wenige Durchlaeufe genuegen: die Bandkante haengt nur schwach von der Skulpturbreite ab. */
const FIT_PASSES = 3;

interface Extents {
  /** Abstand Oberkante − Augenhoehe */
  readonly above: number;
  /** Abstand Augenhoehe − sichtbare Unterkante (Boden verdeckt alles unter y 0) */
  readonly below: number;
  readonly halfWidth: number;
}

/** Ausdehnung der beiden Haelften bei Oeffnung o (Versatz wie hero-timeline.halfOffset). */
function sculptureExtents(open: number, lift: number): Extents {
  const alongN = SCULPTURE.restOffset + SCULPTURE.openOffsetN * open;
  const alongD = SCULPTURE.openOffsetD * open;
  const dx = Math.abs(-CUT_SIN * alongN + CUT_COS * alongD);
  const dy = CUT_COS * alongN + CUT_SIN * alongD;
  const bottom = Math.max(0, EYE_Y - HALF_CAP - dy + lift);
  return { above: HALF_CAP + dy + lift, below: EYE_Y - bottom, halfWidth: HALF_WIDTH + dx };
}

/** Oberkante des Bands bei x (px); rechts vom Band keine Grenze. */
function bandTopAt(band: HeroBand, x: number, height: number): number {
  if (x >= band.right) return band.topRight;
  if (x < band.left) return height;
  const span = Math.max(1, band.right - band.left);
  return band.topRight + band.rise * ((band.right - x) / span);
}

interface ScaleFit {
  /** Pixel pro Meter auf der Vorderflaeche */
  readonly scale: number;
  /** unterste erlaubte Bildzeile (px) */
  readonly bottom: number;
}

function fitScale(input: HeroFitInput, ext: Extents, top: number, sideMargin: number): ScaleFit {
  const { width, height, band, compact } = input;
  const widthFraction = compact ? MAX_WIDTH_FRACTION.compact : MAX_WIDTH_FRACTION.desktop;
  const maxByWidth = Math.min(width / 2 - sideMargin, (widthFraction * width) / 2) / ext.halfWidth;
  const fallbackBottom = height * (compact ? FALLBACK_BOTTOM.compact : FALLBACK_BOTTOM.desktop);
  let bottom = (band ? band.topRight : fallbackBottom) - MARGIN.bottom;
  let scale = 0;
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const maxByHeight = Math.max(1, bottom - top) / (ext.above + ext.below);
    scale = FILL * Math.min(maxByWidth, maxByHeight);
    if (!band) break;
    bottom = bandTopAt(band, width / 2 + scale * ext.halfWidth, height) - MARGIN.bottom;
  }
  return { scale: Math.max(scale, 1e-3), bottom };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Skulptur in einem freien Rechteck (Kontakt, §3.7)
// ---------------------------------------------------------------------------

/** Freie Bildflaeche (px, Viewport). */
export interface FreeRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface SculptureRectInput {
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
  readonly rect: FreeRect;
  /** Oeffnung o (Kontakt: 1 bei E/K0, 0 bei K1) */
  readonly open: number;
}

/** Pose mit Bildausschnitt in x und y (setViewOffset, Anteil der Breite/Hoehe). */
export interface FramedPose extends HeroPose {
  readonly shiftX: number;
}

/**
 * Ganze Skulptur mittig in `rect` (Kontakt, Fix-Runde 3): vorher stand die Kamera
 * fest links versetzt (x −4,5) und schnitt MEDIA zufaellig mitten im A an, mobil
 * blieb nur „ME“. Jetzt gerade auf die Skulptur, Groesse aus der freien Flaeche,
 * Lage per Bildausschnitt — gemessen wie bei den Stationen.
 */
export function fitSculptureInRect(input: SculptureRectInput): FramedPose {
  const { width, height, compact, rect } = input;
  const ext = sculptureExtents(input.open, 0);
  const rectW = Math.max(1, rect.right - rect.left);
  const rectH = Math.max(1, rect.bottom - rect.top);
  const side = Math.max(MARGIN.sideMin, rectW * MARGIN.sideFraction);
  const availW = Math.max(1, rectW - 2 * side);
  const availH = Math.max(1, rectH - MARGIN.top - MARGIN.bottom);
  const scale = Math.max(1e-3, FILL * Math.min(availW / (2 * ext.halfWidth), availH / (ext.above + ext.below)));

  const centerX = (rect.left + rect.right) / 2;
  // Box [Augenhoehe − above, + below] mittig ins Rechteck (Boden schneidet unten ab).
  const boxCenter = rect.top + MARGIN.top + availH / 2;
  const centerY = boxCenter + (scale * (ext.above - ext.below)) / 2;

  const [fovMin, fovMax] = compact ? FOV_RANGE.compact : FOV_RANGE.desktop;
  const preferred = compact ? PREFERRED_DISTANCE.compact : PREFERRED_DISTANCE.desktop;
  const idealTan = height / (2 * scale * (preferred - FRONT_Z));
  const fov = clamp(2 * Math.atan(idealTan) * RAD2DEG, fovMin, fovMax);
  const distance = FRONT_Z + height / (2 * Math.tan((fov * DEG2RAD) / 2) * scale);

  return Object.freeze({
    pos: [0, EYE_Y, distance] as const,
    tgt: [0, EYE_Y, 0] as const,
    fov,
    shiftX: (width / 2 - centerX) / Math.max(1, width),
    shiftY: (height / 2 - centerY) / Math.max(1, height),
  });
}

/** S0-Pose fuer die freie Flaeche ueber dem Band. */
export function fitHeroPose(input: HeroFitInput): HeroPose {
  const { width, height, compact } = input;
  const ext = sculptureExtents(input.open, input.lift);
  const top = input.safeTop + MARGIN.top;
  const sideMargin = Math.max(MARGIN.sideMin, width * MARGIN.sideFraction);
  const { scale, bottom } = fitScale(input, ext, top, sideMargin);

  // Mitte: so nah am Anker wie die freie Flaeche erlaubt.
  const lo = top + scale * ext.above;
  const hi = bottom - scale * ext.below;
  const anchorPx = input.anchor * height;
  const centerY = lo <= hi ? clamp(anchorPx, lo, hi) : (lo + hi) / 2;

  const [fovMin, fovMax] = compact ? FOV_RANGE.compact : FOV_RANGE.desktop;
  const preferred = compact ? PREFERRED_DISTANCE.compact : PREFERRED_DISTANCE.desktop;
  const idealTan = height / (2 * scale * (preferred - FRONT_Z));
  const fov = clamp(2 * Math.atan(idealTan) * RAD2DEG, fovMin, fovMax);
  const distance = FRONT_Z + height / (2 * Math.tan((fov * DEG2RAD) / 2) * scale);

  return Object.freeze({
    pos: [0, EYE_Y, distance] as const,
    tgt: [0, EYE_Y, 0] as const,
    fov,
    shiftY: (height / 2 - centerY) / height,
  });
}
