/**
 * Canvas-Zeichnungen der Station I – Marke (DESIGN_SPEC §3.3.1).
 *
 * Reine Zeichenfunktionen fuer den Browser (Canvas 2D). Die Texturen erzeugen
 * die Komponenten per useCanvasTexture. Zufall nur deterministisch (mulberry32).
 *
 * Werkzeug-Atlas (768 × 256, EINE CanvasTexture statt zwei):
 *   y   0–160  drei Farbchips je 256 × 160 (Spec: Atlas 768 × 160)
 *   y 184–240  Skala des Stahllineals (Spec: Skalen-CanvasTexture)
 * Zusammengelegt wegen des Budgets §6.1 (hoechstens 14 CanvasTextures gesamt).
 */

import { COLORS, CUT_RAD } from '@/lib/brand';
import { mulberry32 } from '@/lib/scene/math';

/** Bleistiftgrau der Skizze (§3.3.1). */
export const PENCIL = '#6B665E';
/** Stahl des Lineals (§3.3.1). */
export const RULER_STEEL = '#B9B9B9';

export const TOOL_ATLAS = Object.freeze({
  width: 768,
  height: 256,
  chipW: 256,
  chipH: 160,
  rulerY: 184,
  rulerH: 56,
  /** Lineal-Laenge in mm (Box 0,5 m) */
  rulerMm: 500,
});

export const SKETCH_TEXTURE = Object.freeze({ width: 1024, height: 725 });

/** UV-Rechteck [u0, v0, u1, v1] in three-Konvention (v nach oben, CanvasTexture mit flipY). */
export type UvRect = readonly [number, number, number, number];

/** UV-Bereich des Chips `index` (0 Ink, 1 Orange, 2 Paper) im Werkzeug-Atlas. */
export function chipUvRect(index: number): UvRect {
  const { width, height, chipW, chipH } = TOOL_ATLAS;
  return [(index * chipW) / width, 1 - chipH / height, ((index + 1) * chipW) / width, 1];
}

/** UV-Bereich der Lineal-Skala im Werkzeug-Atlas. */
export const RULER_UV: UvRect = Object.freeze([
  0,
  1 - (TOOL_ATLAS.rulerY + TOOL_ATLAS.rulerH) / TOOL_ATLAS.height,
  1,
  1 - TOOL_ATLAS.rulerY / TOOL_ATLAS.height,
] as const);

const CHIP_FONT_PX = 34;
const SKETCH_LABEL_PX = 46;
const SKETCH_SEED = 0x5ce7c4;
const RULER_SEED = 0x7a1e;
const GRAIN_DOTS = 2600;

export function toolAtlasFontSpec(family: string): string {
  return `700 ${CHIP_FONT_PX}px ${family}`;
}

export function sketchFontSpec(family: string): string {
  return `400 ${SKETCH_LABEL_PX}px ${family}`;
}

// ---------------------------------------------------------------------------
// Werkzeug-Atlas: Farbchips + Lineal-Skala
// ---------------------------------------------------------------------------

export interface ToolAtlasOptions {
  /** Archivo (resolveFontFamily('--font-archivo')) */
  readonly family: string;
  /** COPY.scene3d.swatches: Ink, Orange, Paper */
  readonly swatches: readonly string[];
}

function isInk(hex: string): boolean {
  return hex.toLowerCase() === COLORS.ink.toLowerCase();
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  cw: number,
  ch: number,
  hex: string,
  family: string,
): void {
  const text = isInk(hex) ? COLORS.paper : COLORS.ink;
  ctx.save();
  ctx.fillStyle = hex;
  ctx.fillRect(x, 0, cw, ch);

  // feine 6°-Linie oben rechts (Markenmotiv), 30 % Deckkraft
  const slope = Math.tan(CUT_RAD);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = text;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + cw * 0.52, 36 + cw * 0.4 * slope);
  ctx.lineTo(x + cw * 0.92, 36);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = text;
  ctx.font = toolAtlasFontSpec(family);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(hex, x + 20, ch - 22);
  ctx.restore();
}

function drawRulerScale(ctx: CanvasRenderingContext2D, w: number): void {
  const { rulerY: y, rulerH: h, rulerMm } = TOOL_ATLAS;
  const rand = mulberry32(RULER_SEED);
  ctx.save();
  ctx.fillStyle = RULER_STEEL;
  ctx.fillRect(0, y, w, h);

  // gebuersteter Stahl: feine Laengsstreifen
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.03 + rand() * 0.05;
    ctx.fillStyle = rand() > 0.5 ? '#FFFFFF' : '#000000';
    ctx.fillRect(0, y + rand() * h, w, 1);
  }

  // Teilstriche an beiden Kanten: 5 mm kurz, 10 mm mittel, 50 mm lang
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = COLORS.graphite;
  const pxPerMm = w / rulerMm;
  for (let mm = 0; mm <= rulerMm; mm += 5) {
    const len = mm % 50 === 0 ? h * 0.42 : mm % 10 === 0 ? h * 0.28 : h * 0.16;
    const x = Math.min(w - 1.4, mm * pxPerMm);
    ctx.fillRect(x, y, 1.4, len);
    ctx.fillRect(x, y + h - len, 1.4, len);
  }
  ctx.restore();
}

/** Atlas 768 × 256: Chips oben, Lineal-Skala unten (siehe Dateikopf). */
export function drawToolAtlas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  { family, swatches }: ToolAtlasOptions,
): void {
  const { chipW, chipH } = TOOL_ATLAS;
  ctx.clearRect(0, 0, w, h);
  swatches.slice(0, 3).forEach((hex, i) => drawChip(ctx, i * chipW, chipW, chipH, hex, family));
  drawRulerScale(ctx, w);
}

// ---------------------------------------------------------------------------
// Skizze auf dem Bogen (1024 × 725)
// ---------------------------------------------------------------------------

export interface SketchOptions {
  /** Comfortaa (resolveFontFamily('--font-comfortaa')) */
  readonly family: string;
  /** COPY.scene3d.sketchLabel */
  readonly label: string;
}

type Pt = readonly [number, number];

function strokeLine(ctx: CanvasRenderingContext2D, a: Pt, b: Pt): void {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  ctx.save();
  ctx.fillStyle = COLORS.lead;
  for (let i = 0; i < GRAIN_DOTS; i++) {
    ctx.globalAlpha = 0.025 + rand() * 0.035;
    const s = 1 + rand() * 1.4;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  ctx.restore();
}

function drawGuides(ctx: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const slope = Math.tan(CUT_RAD);
  const reach = w * 0.47;
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.lineWidth = 1.4;
  strokeLine(ctx, [40, cy], [w - 40, cy]);
  strokeLine(ctx, [cx, 36], [cx, h - 36]);
  // 6°-Konstruktionslinie (Canvas: y nach unten, steigt nach rechts)
  strokeLine(ctx, [cx - reach, cy + reach * slope], [cx + reach, cy - reach * slope]);
  ctx.setLineDash([10, 9]);
  ctx.strokeRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.setLineDash([]);
  for (let x = 72; x < w - 60; x += 32) {
    const len = (x - 72) % 128 === 0 ? 14 : 7;
    strokeLine(ctx, [x, cy - len], [x, cy + len]);
  }
  ctx.restore();
}

function drawCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number): void {
  ctx.save();
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = k === 0 ? 0.85 : 0.45;
    ctx.lineWidth = k === 0 ? 3.2 : 1.6;
    const a0 = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(
      cx + (rand() - 0.5) * 3,
      cy + (rand() - 0.5) * 3,
      r + (rand() - 0.5) * 6,
      a0,
      a0 + Math.PI * 2 + 0.2 + rand() * 0.25,
    );
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 6°-Balken: Parallelogramm mit senkrechten Stirnseiten, schraffiert. Liegt
 * parallel direkt VOR der Schnittlinie (Canvas: darunter), weil das Lineal
 * hinter der Linie aufliegt und den Balken sonst halb verdecken wuerde. Der
 * Schnitt teilt so den Kreis, der Balken bleibt als „Kante“ ganz.
 */
function drawBar(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  const thick = h * 0.05;
  const cx = w / 2;
  const cy = h / 2 + thick + 10;
  const slope = Math.tan(CUT_RAD);
  const half = w * 0.33;
  const bar: readonly Pt[] = [
    [cx - half, cy + half * slope - thick],
    [cx + half, cy - half * slope - thick],
    [cx + half, cy - half * slope + thick],
    [cx - half, cy + half * slope + thick],
  ];
  ctx.save();
  tracePolygon(ctx, bar);
  ctx.clip();
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 1.5;
  for (let x = cx - half - h; x < cx + half + h; x += 9) {
    strokeLine(ctx, [x, cy + h * 0.5], [x + h * 0.5, cy - h * 0.5 + (rand() - 0.5) * 4]);
  }
  ctx.restore();

  ctx.save();
  for (let k = 0; k < 2; k++) {
    ctx.globalAlpha = k === 0 ? 0.85 : 0.4;
    ctx.lineWidth = k === 0 ? 2.8 : 1.4;
    const jitter = (k === 0 ? 0 : 2.5) * (rand() - 0.5);
    tracePolygon(
      ctx,
      bar.map(([x, y]) => [x + jitter, y - jitter] as const),
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, w: number, h: number, family: string, label: string): void {
  const slope = Math.tan(CUT_RAD);
  const right = w - 60;
  const base = h - 58;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = PENCIL;
  ctx.font = sketchFontSpec(family);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, right, base);
  const width = ctx.measureText(label).width;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  strokeLine(ctx, [right - width, base + 18 + width * slope], [right, base + 18]);
  ctx.restore();
}

/**
 * Skizze 1024 × 725: Paper-Grund mit Korn, Hilfslinien, Kreis um die
 * Bogenmitte (die Schnittlinie laeuft genau durch die Mitte und teilt ihn),
 * 6°-Balken knapp davor, Label unten rechts. Bleistift #6B665E.
 */
export function drawSketch(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  { family, label }: SketchOptions,
): void {
  const rand = mulberry32(SKETCH_SEED);
  const r = h * 0.3;
  ctx.save();
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, w, h);
  drawGrain(ctx, w, h, rand);
  ctx.strokeStyle = PENCIL;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawGuides(ctx, w, h, r);
  drawCircle(ctx, w / 2, h / 2, r, rand);
  drawBar(ctx, w, h, rand);
  drawLabel(ctx, w, h, family, label);
  ctx.restore();
}
