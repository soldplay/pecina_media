/**
 * Station III (Papier): Canvas-Zeichnungen fuer den obersten Bogen, den
 * Bleisatz-Atlas und den Abzug (DESIGN_SPEC §3.3.3). Reine Zeichenfunktionen,
 * die useCanvasTexture aufruft — nur im Browser verwenden.
 *
 * Zufall nur ueber mulberry32 (reproduzierbar). Sichtbare Woerter kommen als
 * Parameter aus COPY.scene3d; das Alphabet A–Z im Atlas ist Glyphen-Inventar
 * der Setzkasten-Lettern, kein Text.
 */

import { COLORS, CUT_GAP, CUT_TAN } from '@/lib/brand';
import { mulberry32 } from '@/lib/scene/math';
import { drawCutText, resolveFontFamily } from '@/lib/three/canvas-texture';

// ---------------------------------------------------------------------------
// Groessen und Konstanten
// ---------------------------------------------------------------------------

/** Bogen-Texturen (A4-Verhaeltnis 0,21 × 0,297). */
export const SHEET_TEXTURE = Object.freeze({ w: 768, h: 1086 });

/** Glyphen-Atlas 1024², 8 × 8 Zellen. */
export const ATLAS = Object.freeze({ size: 1024, grid: 8 });
/** Zellen 0–25: A–Z gespiegelt; ab hier die 5 Kacheln der MEDIA-Form. */
export const ATLAS_MEDIA_START = 26;
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Abzug 0,17 × 0,05 m. */
export const PROOF_TEXTURE = Object.freeze({ w: 1024, h: 301 });

/**
 * Lage des Abzugs (Station-lokal). Spec: x 0,29; nach rechts verschoben, weil
 * der gelbe Block des Modells (x 0,038–0,262, 1 cm hoch) sonst den Streifen
 * schneidet. LeadType haelt diese Flaeche beim Verstreuen frei.
 */
export const PROOF_STRIP = Object.freeze({ x: 0.35, y: 1.0325, z: -0.12, w: 0.17, h: 0.05 });

/** Kappe 0,028 m bei 0,031 m Teilung: daraus die Teilung im Atlas-Streifen. */
export const LEAD_CAP_SIZE = 0.028;
export const LEAD_PITCH = 0.031;

/** Bleistiftgrau (DESIGN_SPEC §3.3.1, Skizze). */
const PENCIL = '#6B665E';
const LEAD_FACE = '#242424';
const LEAD_SHOULDER_LIGHT = '#363636';
const LEAD_SHOULDER_DARK = '#151515';
const LEAD_GLYPH = '#D8D3C8';

const SCRIBBLE_SEED = 11;
const TYPE_SEED = 13;
const PROOF_SEED = 17;

// ---------------------------------------------------------------------------
// Schriften
// ---------------------------------------------------------------------------

export interface PaperFonts {
  readonly archivo: string;
  readonly comfortaa: string;
}

/** Font-Familien der next/font-Variablen (nur Client). */
export function resolvePaperFonts(): PaperFonts {
  return {
    archivo: resolveFontFamily('--font-archivo'),
    comfortaa: resolveFontFamily('--font-comfortaa'),
  };
}

export function sheetFontSpecs(f: PaperFonts): readonly string[] {
  return [`800 76px ${f.archivo}`, `500 58px ${f.comfortaa}`];
}

export function leadFontSpecs(f: PaperFonts): readonly string[] {
  return [`900 96px ${f.archivo}`];
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

type Rand = () => number;

function range(rnd: Rand, min: number, max: number): number {
  return min + (max - min) * rnd();
}

function fillPaper(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, w, h);
  // feines Papierkorn, sehr zurueckhaltend
  const rnd = mulberry32(seed);
  const specks = Math.round((w * h) / 520);
  for (let i = 0; i < specks; i += 1) {
    const dark = rnd() < 0.5;
    ctx.fillStyle = dark ? 'rgba(92,87,79,0.05)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd(), 1 + rnd());
  }
}

/** Bricht `text` an Leerzeichen in Zeilen, die hoechstens `maxWidth` breit sind. */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): readonly string[] {
  const words = text.split(' ');
  return words.reduce<readonly string[]>((lines, word) => {
    const last = lines[lines.length - 1];
    if (last === undefined) return [word];
    const candidate = `${last} ${word}`;
    return ctx.measureText(candidate).width <= maxWidth
      ? [...lines.slice(0, -1), candidate]
      : [...lines, word];
  }, []);
}

// ---------------------------------------------------------------------------
// uScribble — Bleistift-Kritzel
// ---------------------------------------------------------------------------

/**
 * Eine Zeile „Handschrift“ als verschleifte Bogenlinie (verlaengerte Zykloide):
 * Woerter mit Abstaenden, wechselnde Ober-/Unterlaengen.
 */
function drawCursiveLine(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, baseY: number): void {
  const step = 0.28;
  let x = x0;
  while (x < x1 - 30) {
    const letters = 2 + Math.floor(rnd() * 5);
    const advance = range(rnd, 4.6, 5.8);
    const loop = range(rnd, 7, 9.5);
    const height = range(rnd, 12, 16);
    const phase = rnd() * Math.PI * 2;
    const tMax = letters * Math.PI * 2;
    ctx.beginPath();
    for (let t = 0; t <= tMax; t += step) {
      const tall = Math.sin(t * 0.5 + phase) > 0.82 ? 2.1 : 1;
      const px = x + advance * t - loop * Math.sin(t);
      const py = baseY - height * tall * 0.5 * (1 - Math.cos(t)) + Math.sin(t * 0.37 + phase) * 1.4;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      if (px > x1) break;
    }
    ctx.stroke();
    x += advance * tMax + range(rnd, 16, 30);
  }
}

function drawWobblyLine(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, y0: number, x1: number, y1: number): void {
  const segments = 18;
  ctx.beginPath();
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t + (rnd() - 0.5) * 2.2;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/** Zickzack-Ausstreichung ueber einem Wortblock. */
function drawScratchOut(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, y: number): void {
  ctx.beginPath();
  let x = x0;
  let up = true;
  ctx.moveTo(x, y);
  while (x < x1) {
    x += range(rnd, 5, 9);
    ctx.lineTo(x, y + (up ? -13 : 9) + (rnd() - 0.5) * 3);
    up = !up;
  }
  ctx.stroke();
}

function drawPencilEllipse(ctx: CanvasRenderingContext2D, rnd: Rand, cx: number, cy: number, rx: number, ry: number): void {
  const turns = 1.85;
  const steps = 120;
  const phase = rnd() * Math.PI * 2;
  const start = range(rnd, -0.4, 0.4);
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const a = start + (i / steps) * turns * Math.PI * 2;
    const k = 1 + 0.045 * Math.sin(3 * a + phase) + (i / steps) * 0.06;
    const px = cx + Math.cos(a) * rx * k;
    const py = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function drawPencilArrow(ctx: CanvasRenderingContext2D, from: readonly [number, number], to: readonly [number, number]): void {
  const cx = (from[0] + to[0]) / 2 - 40;
  const cy = (from[1] + to[1]) / 2 - 10;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.quadraticCurveTo(cx, cy, to[0], to[1]);
  ctx.stroke();
  const angle = Math.atan2(to[1] - cy, to[0] - cx);
  const head = 14;
  ctx.beginPath();
  ctx.moveTo(to[0] - head * Math.cos(angle - 0.45), to[1] - head * Math.sin(angle - 0.45));
  ctx.lineTo(to[0], to[1]);
  ctx.lineTo(to[0] - head * Math.cos(angle + 0.45), to[1] - head * Math.sin(angle + 0.45));
  ctx.stroke();
}

interface ScribbleLine {
  readonly y: number;
  readonly end: number;
  readonly strike: boolean;
  readonly scratch: boolean;
}

/** Zeilenplan des Kritzelbogens (Anteile der Breite). */
const SCRIBBLE_LINES: readonly ScribbleLine[] = [
  { y: 0.12, end: 0.62, strike: false, scratch: false },
  { y: 0.175, end: 0.88, strike: true, scratch: false },
  { y: 0.23, end: 0.5, strike: false, scratch: false },
  { y: 0.355, end: 0.84, strike: false, scratch: false },
  { y: 0.41, end: 0.9, strike: false, scratch: true },
  { y: 0.465, end: 0.58, strike: true, scratch: false },
  { y: 0.575, end: 0.86, strike: false, scratch: false },
  { y: 0.63, end: 0.74, strike: false, scratch: false },
  { y: 0.685, end: 0.9, strike: true, scratch: false },
  { y: 0.74, end: 0.44, strike: false, scratch: false },
  { y: 0.85, end: 0.8, strike: false, scratch: false },
  { y: 0.905, end: 0.66, strike: true, scratch: false },
];

/**
 * uScribble: Papier, Bleistift-Polylinien aus seeded Noise, durchgestrichene
 * Zeilen und ein eingekreistes Wort (Comfortaa 500).
 */
export function drawScribble(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fonts: PaperFonts,
  word: string,
): void {
  fillPaper(ctx, w, h, SCRIBBLE_SEED);
  const rnd = mulberry32(SCRIBBLE_SEED);
  const left = w * 0.09;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PENCIL;

  SCRIBBLE_LINES.forEach((line) => {
    const y = line.y * h;
    const x1 = line.end * w;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2.8;
    drawCursiveLine(ctx, rnd, left + range(rnd, 0, 16), x1, y);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 3;
    if (line.strike) drawWobblyLine(ctx, rnd, left - 6, y - 7, x1 + 8, y - 9);
    if (line.scratch) drawScratchOut(ctx, rnd, w * 0.46, w * 0.68, y - 4);
  });

  // eingekreistes Wort rechts oben, mit Pfeil auf die freie Zeile
  const cx = w * 0.7;
  const cy = h * 0.272;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = PENCIL;
  ctx.font = `500 58px ${fonts.comfortaa}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, cx, cy);
  const textWidth = ctx.measureText(word).width;
  ctx.lineWidth = 2.6;
  drawPencilEllipse(ctx, rnd, cx, cy + 2, textWidth / 2 + 30, 48);
  ctx.lineWidth = 2.2;
  drawPencilArrow(ctx, [cx - textWidth / 2 - 24, cy + 40], [w * 0.36, h * 0.3]);

  // Randnotiz-Haken am Zeilenende
  ctx.lineWidth = 2.2;
  drawWobblyLine(ctx, rnd, w * 0.88, h * 0.58, w * 0.92, h * 0.6);
  drawWobblyLine(ctx, rnd, w * 0.92, h * 0.6, w * 0.95, h * 0.55);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// uType — gesetzter Bogen
// ---------------------------------------------------------------------------

/**
 * uType: Headline in Archivo 800 (Ink), Textzeilen als Graubalken und eine
 * orange 6°-Linie.
 */
export function drawTypeset(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fonts: PaperFonts,
  headline: string,
): void {
  fillPaper(ctx, w, h, TYPE_SEED);
  const rnd = mulberry32(TYPE_SEED);
  const left = w * 0.09;
  const column = w * 0.82;

  // Kicker-Balken
  ctx.fillStyle = COLORS.brand;
  ctx.fillRect(left, h * 0.105, 58, 9);

  // Headline
  ctx.fillStyle = COLORS.ink;
  ctx.font = `800 76px ${fonts.archivo}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const lines = wrapWords(ctx, headline, column);
  const lineHeight = 82;
  const firstBaseline = h * 0.105 + 96;
  lines.forEach((line, i) => ctx.fillText(line, left, firstBaseline + i * lineHeight));

  // orange 6°-Linie (steigt nach rechts)
  const lineY = firstBaseline + (lines.length - 1) * lineHeight + 92;
  ctx.strokeStyle = COLORS.brand;
  ctx.lineWidth = 6;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(left, lineY);
  ctx.lineTo(left + column, lineY - column * CUT_TAN);
  ctx.stroke();

  // Textzeilen als Balken: drei Absaetze, dazwischen ein Zwischentitel-Balken
  const barHeight = 11;
  const pitch = 26;
  let y = lineY + 70;
  const paragraphs = [5, 4, 6];
  paragraphs.forEach((count, p) => {
    if (p === 1) {
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(left, y, column * 0.46, 17);
      y += pitch + 14;
    }
    ctx.fillStyle = COLORS.mutedDark;
    for (let i = 0; i < count; i += 1) {
      const last = i === count - 1;
      const width = last ? column * range(rnd, 0.35, 0.7) : column * range(rnd, 0.9, 1);
      ctx.fillRect(left, y, width, barHeight);
      y += pitch;
    }
    y += pitch;
  });
}

// ---------------------------------------------------------------------------
// Bleisatz-Atlas
// ---------------------------------------------------------------------------

export interface CutRowOptions {
  /** CSS-Font-Kurzform */
  readonly font: string;
  readonly stretch?: CanvasFontStretch;
  /** Teilung der Lettern in px (feste Dickte) */
  readonly pitch: number;
  /** Mitte der Zeile (x) und Grundlinie (y) */
  readonly cx: number;
  readonly baseline: number;
  /** Spalt als Anteil der Versalhoehe */
  readonly gap: number;
  readonly angleDeg?: number;
  readonly mirror?: boolean;
  readonly fill: string;
  /** horizontale Stauchung je Buchstabe (1 = unveraendert) */
  readonly squeeze?: (letter: string) => number;
}

/**
 * Wie drawCutText aus lib/three/canvas-texture (gleiche Geometrie: Linie
 * durch die Blockmitte, Haelften um ±gap/2 entlang der Normale versetzt),
 * aber mit fester Teilung je Buchstabe. Noetig fuer die Druckform: Die
 * Bleilettern stehen in gleichem Abstand, der Spalt muss trotzdem als EINE
 * Linie durch alle Lettern laufen. drawCutText setzt proportional und
 * schneidet durch die Mitte des ganzen Strings; das passt nicht zu festen
 * Kegeln.
 */
export function drawCutRow(ctx: CanvasRenderingContext2D, letters: string, opts: CutRowOptions): void {
  const { font, stretch, pitch, cx, baseline, gap, angleDeg = 6, mirror = false, fill, squeeze } = opts;
  const chars = [...letters];
  ctx.save();
  ctx.font = font;
  if (stretch) ctx.fontStretch = stretch;
  ctx.fillStyle = fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const capHeight = chars.reduce((max, ch) => Math.max(max, ctx.measureText(ch).actualBoundingBoxAscent), 0);
  const cy = baseline - capHeight / 2;
  const offset = (gap * capHeight) / 2;
  const reach = (chars.length * pitch + capHeight) * 2;
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const nx = -Math.sin(a);
  const ny = -Math.cos(a);

  if (mirror) {
    ctx.translate(2 * cx, 0);
    ctx.scale(-1, 1);
  }

  const drawLetters = (): void => {
    chars.forEach((ch, i) => {
      const x = cx + (i - (chars.length - 1) / 2) * pitch;
      const sx = squeeze ? squeeze(ch) : 1;
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(sx, 1);
      ctx.fillText(ch, 0, baseline);
      ctx.restore();
    });
  };

  const drawHalf = (side: 1 | -1): void => {
    ctx.save();
    ctx.translate(nx * offset * side, ny * offset * side);
    ctx.beginPath();
    ctx.moveTo(cx - dx * reach, cy - dy * reach);
    ctx.lineTo(cx + dx * reach, cy + dy * reach);
    ctx.lineTo(cx + dx * reach + nx * reach * side, cy + dy * reach + ny * reach * side);
    ctx.lineTo(cx - dx * reach + nx * reach * side, cy - dy * reach + ny * reach * side);
    ctx.closePath();
    ctx.clip();
    drawLetters();
    ctx.restore();
  };

  drawHalf(1);
  drawHalf(-1);
  ctx.restore();
}

interface GlyphMetrics {
  readonly fontSize: number;
  readonly capHeight: number;
  readonly maxInk: number;
}

/** Schriftgroesse so, dass die Versalhoehe ~58 % der Zelle fuellt. */
function measureGlyphs(ctx: CanvasRenderingContext2D, family: string, cell: number): GlyphMetrics {
  const probe = 100;
  ctx.save();
  ctx.font = `900 ${probe}px ${family}`;
  ctx.fontStretch = 'expanded';
  const capProbe = ctx.measureText('H').actualBoundingBoxAscent || probe * 0.72;
  ctx.restore();
  const fontSize = (probe * cell * 0.58) / capProbe;
  return { fontSize, capHeight: cell * 0.58, maxInk: cell * 0.84 };
}

function glyphSqueeze(ctx: CanvasRenderingContext2D, maxInk: number): (letter: string) => number {
  return (letter) => {
    const m = ctx.measureText(letter);
    const ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    return ink > maxInk ? maxInk / ink : 1;
  };
}

function drawLeadCell(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
  const bevel = Math.max(2, Math.round(cell * 0.03));
  ctx.fillStyle = LEAD_FACE;
  ctx.fillRect(x, y, cell, cell);
  ctx.fillStyle = LEAD_SHOULDER_LIGHT;
  ctx.fillRect(x, y, cell, bevel);
  ctx.fillRect(x, y, bevel, cell);
  ctx.fillStyle = LEAD_SHOULDER_DARK;
  ctx.fillRect(x, y + cell - bevel, cell, bevel);
  ctx.fillRect(x + cell - bevel, y, bevel, cell);
}

/**
 * Glyphen-Atlas 1024² (8 × 8): Zellen 0–25 A–Z gespiegelt; Zellen 26–30 die
 * fuenf Kacheln der Form, geschnitten aus EINEM gespiegelten Streifen mit
 * durchgehendem 6°-Spalt (Archivo 900 expanded). Kachel k (von links) zeigt
 * den k-ten Buchstaben der gespiegelten Zeile, bei „MEDIA“ also A-I-D-E-M.
 */
export function drawLeadAtlas(
  ctx: CanvasRenderingContext2D,
  size: number,
  fonts: PaperFonts,
  formeWord: string,
): void {
  const grid = ATLAS.grid;
  const cell = size / grid;
  const metrics = measureGlyphs(ctx, fonts.archivo, cell);
  const font = `900 ${metrics.fontSize}px ${fonts.archivo}`;

  for (let i = 0; i < grid * grid; i += 1) {
    drawLeadCell(ctx, (i % grid) * cell, Math.floor(i / grid) * cell, cell);
  }
  drawAlphabetCells(ctx, cell, font, metrics);
  drawFormeTiles(ctx, cell, font, metrics, formeWord);
}

/** Zellen 0–25: A–Z einzeln gespiegelt (ctx.scale(−1, 1)), zentriert. */
function drawAlphabetCells(ctx: CanvasRenderingContext2D, cell: number, font: string, metrics: GlyphMetrics): void {
  const grid = ATLAS.grid;
  ctx.save();
  ctx.font = font;
  ctx.fontStretch = 'expanded';
  ctx.fillStyle = LEAD_GLYPH;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const squeeze = glyphSqueeze(ctx, metrics.maxInk);
  [...ALPHABET].forEach((letter, i) => {
    const x = (i % grid) * cell + cell / 2;
    const y = Math.floor(i / grid) * cell + cell / 2 + metrics.capHeight / 2;
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-squeeze(letter), 1);
    ctx.fillText(letter, 0, y);
    ctx.restore();
  });
  ctx.restore();
}

/**
 * Form: ein Streifen, gespiegelt, feste Teilung, ein Schnitt; danach in
 * Kappen-grosse Kacheln geschnitten (die 3 mm zwischen den Kappen fallen weg,
 * die Linie laeuft in 3D trotzdem durch, weil dort dieselbe Luecke liegt).
 */
function drawFormeTiles(
  ctx: CanvasRenderingContext2D,
  cell: number,
  font: string,
  metrics: GlyphMetrics,
  formeWord: string,
): void {
  const grid = ATLAS.grid;
  const letters = [...formeWord];
  const pitchPx = cell * (LEAD_PITCH / LEAD_CAP_SIZE);
  const strip = document.createElement('canvas');
  strip.width = Math.ceil(letters.length * pitchPx + cell);
  strip.height = Math.ceil(cell);
  const sctx = strip.getContext('2d');
  if (!sctx) return;
  sctx.font = font;
  sctx.fontStretch = 'expanded';
  const stripCx = strip.width / 2;
  drawCutRow(sctx, formeWord, {
    font,
    stretch: 'expanded',
    pitch: pitchPx,
    cx: stripCx,
    baseline: cell / 2 + metrics.capHeight / 2,
    gap: CUT_GAP,
    mirror: true,
    fill: LEAD_GLYPH,
    squeeze: glyphSqueeze(sctx, metrics.maxInk),
  });

  letters.forEach((_, k) => {
    const index = ATLAS_MEDIA_START + k;
    if (index >= grid * grid) return;
    const sx = stripCx + (k - (letters.length - 1) / 2) * pitchPx - cell / 2;
    ctx.drawImage(strip, sx, 0, cell, cell, (index % grid) * cell, Math.floor(index / grid) * cell, cell, cell);
  });
}

/** Zelle (Spalte, Zeile von unten) eines Atlas-Index fuer UV-Offsets (flipY). */
export function atlasCellOffset(index: number): readonly [number, number] {
  const grid = ATLAS.grid;
  return [index % grid, grid - 1 - Math.floor(index / grid)];
}

/** Atlas-Index fuer einen Buchstaben A–Z (unbekannt → A). */
export function atlasIndexOfLetter(letter: string): number {
  const i = ALPHABET.indexOf(letter.toUpperCase());
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------
// Abzug
// ---------------------------------------------------------------------------

/**
 * Abzug: Papier mit dem Wort ungespiegelt in Ink, 6°-Spalt per drawCutText,
 * dazu ungleichmaessiger Farbauftrag wie beim Hochdruck.
 */
export function drawProof(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fonts: PaperFonts,
  word: string,
): void {
  fillPaper(ctx, w, h, PROOF_SEED);
  const probe = 100;
  ctx.save();
  ctx.font = `900 ${probe}px ${fonts.archivo}`;
  ctx.fontStretch = 'expanded';
  const m = ctx.measureText(word);
  ctx.restore();
  const probeWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight || probe * word.length * 0.8;
  const probeCap = m.actualBoundingBoxAscent || probe * 0.72;
  const fontSize = Math.min((probe * w * 0.84) / probeWidth, (probe * h * 0.56) / probeCap);
  const cap = (probeCap * fontSize) / probe;

  ctx.save();
  ctx.textAlign = 'center';
  drawCutText(ctx, word, w / 2, h / 2 + cap / 2, {
    font: `900 ${fontSize}px ${fonts.archivo}`,
    stretch: 'expanded',
    gap: CUT_GAP,
    fill: COLORS.ink,
  });
  ctx.restore();

  // Farbauftrag: helle Fehlstellen nur auf der Farbe
  const rnd = mulberry32(PROOF_SEED);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = rnd() < 0.7 ? 'rgba(244,241,234,0.35)' : 'rgba(42,40,38,0.4)';
    const r = 0.6 + rnd() * 1.8;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
