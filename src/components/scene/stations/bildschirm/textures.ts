/**
 * Canvas-Zeichnungen der Station II – Bildschirm (DESIGN_SPEC §3.3.2).
 *
 * Reine Zeichenfunktionen fuer den Browser (Canvas 2D); die Texturen erzeugen
 * LaptopScreen und SocialCards per useCanvasTexture. Alle Texte kommen als
 * Parameter aus COPY.scene3d.
 *
 * Seitenverhaeltnis: Die Texturen sind 1024 × 640 (1,6:1), der Bildschirm
 * des Modells aber nur ca. 1,22:1. Website und Feed werden deshalb in einer
 * „logischen“ Breite von 640 · aspect gezeichnet und horizontal auf 1024
 * gestreckt — auf dem Bildschirm erscheinen Schrift, Kreise und Radien
 * unverzerrt. Die DOS-Ansicht bleibt bewusst im Pixelraum der Spec (44 px,
 * Zeilenabstand 64 px): die schmalen Glyphen wirken wie ein echter
 * Textmodus-Font, und die Dateizeile passt in die Breite.
 */

import { COLORS, CUT_RAD } from '@/lib/brand';

const DOS = Object.freeze({
  background: '#0A0700',
  font: '44px ui-monospace, monospace',
  x: 56,
  firstBaseline: 104,
  lineGap: 64,
  /** Cursor-Block relativ zur Grundlinie */
  cursorTop: 34,
  cursorHeight: 40,
});

const WEB = Object.freeze({
  pad: 48,
  navHeight: 64,
  headlineSize: 96,
  headlineMin: 60,
  buttonSize: 28,
  buttonHeight: 58,
  cardGap: 24,
  cardHeader: 22,
  cardRadius: 12,
});

const FEED = Object.freeze({
  marginY: 40,
  marginX: 32,
  gap: 20,
  ratio: 0.8,
  radius: 16,
  fontSize: 34,
  fontMin: 22,
});

const CARD_TONES = Object.freeze([
  { bg: COLORS.paper, fg: COLORS.ink },
  { bg: COLORS.brand, fg: COLORS.ink },
  { bg: COLORS.anthracite, fg: COLORS.paper },
]);

export function webFontSpecs(family: string): readonly string[] {
  return [`900 ${WEB.headlineSize}px ${family}`, `700 ${WEB.buttonSize}px ${family}`];
}

export function feedFontSpecs(family: string): readonly string[] {
  return [`800 ${FEED.fontSize}px ${family}`];
}

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Wortweiser Umbruch mit der aktuell gesetzten Schrift. */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return text.split(/\s+/).reduce<string[]>((lines, word) => {
    const current = lines[lines.length - 1];
    if (current === undefined) return [word];
    const candidate = `${current} ${word}`;
    return ctx.measureText(candidate).width <= maxWidth
      ? [...lines.slice(0, -1), candidate]
      : [...lines, word];
  }, []);
}

interface FittedText {
  readonly lines: readonly string[];
  readonly size: number;
}

/** Groesste Schrift (Schritte 2 px), bei der `text` in maxLines Zeilen passt. Setzt ctx.font. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { weight: number; size: number; min: number; family: string; maxWidth: number; maxLines: number },
): FittedText {
  const { weight, min, family, maxWidth, maxLines } = opts;
  for (let size = opts.size; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrapWords(ctx, text, maxWidth);
    const fits = lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth);
    if (fits) return { lines, size };
  }
  ctx.font = `${weight} ${min}px ${family}`;
  return { lines: wrapWords(ctx, text, maxWidth), size: min };
}

/** Streckt die Zeichnung horizontal; liefert die logische Breite (640 · aspect). */
function applyLogicalWidth(ctx: CanvasRenderingContext2D, w: number, h: number, aspect: number): number {
  const logical = Number.isFinite(aspect) && aspect > 0 ? h * aspect : w;
  ctx.scale(w / logical, 1);
  return logical;
}

// ---------------------------------------------------------------------------
// uDos
// ---------------------------------------------------------------------------

/**
 * DOS-Ansicht: Grund #0A0700, Bernstein #FFB000, Systemmonospace 44 px,
 * Zeilenabstand 64 px. Der Cursor-Block hinter der letzten Zeile wird als
 * transparentes Loch ausgespart (Alpha 0); der Shader fuellt ihn per uCursorOn.
 */
export function drawDos(ctx: CanvasRenderingContext2D, w: number, h: number, lines: readonly string[]): void {
  ctx.save();
  ctx.fillStyle = DOS.background;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
  vignette.addColorStop(0, 'rgba(255, 176, 0, 0.05)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  ctx.font = DOS.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.amber;
  ctx.shadowColor = 'rgba(255, 176, 0, 0.55)';
  ctx.shadowBlur = 10;
  lines.forEach((line, i) => ctx.fillText(line, DOS.x, DOS.firstBaseline + i * DOS.lineGap));
  ctx.shadowBlur = 0;

  const last = lines[lines.length - 1] ?? '';
  const baseline = DOS.firstBaseline + Math.max(0, lines.length - 1) * DOS.lineGap;
  const cursorX = DOS.x + ctx.measureText(`${last} `).width;
  const cursorW = ctx.measureText('M').width;
  ctx.clearRect(Math.round(cursorX), baseline - DOS.cursorTop, Math.round(cursorW), DOS.cursorHeight);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// uWeb
// ---------------------------------------------------------------------------

export interface WebOptions {
  readonly family: string;
  /** COPY.scene3d.webHeadline */
  readonly headline: string;
  /** COPY.scene3d.webButton */
  readonly button: string;
  /** Bildschirm Breite / Hoehe */
  readonly aspect: number;
}

function drawNav(ctx: CanvasRenderingContext2D, lw: number): void {
  const { navHeight: nh, pad } = WEB;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, lw, nh);
  ctx.fillStyle = COLORS.brand;
  ctx.beginPath();
  ctx.arc(pad, nh / 2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.paper;
  roundRectPath(ctx, pad + 22, nh / 2 - 5, 70, 10, 5);
  ctx.fill();
  ctx.globalAlpha = 0.4;
  [0, 1, 2].forEach((i) => {
    roundRectPath(ctx, lw - pad - 52 - i * 68, nh / 2 - 4, 52, 8, 4);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawHeadline(ctx: CanvasRenderingContext2D, lw: number, opts: WebOptions): number {
  const { pad, navHeight, headlineSize, headlineMin } = WEB;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const fitted = fitText(ctx, opts.headline, {
    weight: 900,
    size: headlineSize,
    min: headlineMin,
    family: opts.family,
    maxWidth: lw - 2 * pad,
    maxLines: 2,
  });
  const lineHeight = fitted.size * 0.98;
  const first = navHeight + 40 + fitted.size * 0.74;
  fitted.lines.forEach((line, i) => ctx.fillText(line, pad, first + i * lineHeight));
  const lastBaseline = first + (fitted.lines.length - 1) * lineHeight;

  // 6°-Akzent unter der Headline
  const slope = Math.tan(CUT_RAD);
  const y = lastBaseline + 30;
  ctx.strokeStyle = COLORS.brand;
  ctx.lineWidth = 6;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(pad, y + 160 * slope);
  ctx.lineTo(pad + 160, y);
  ctx.stroke();
  return y + 160 * slope;
}

function drawButton(ctx: CanvasRenderingContext2D, top: number, opts: WebOptions): number {
  const { pad, buttonSize, buttonHeight } = WEB;
  ctx.font = `700 ${buttonSize}px ${opts.family}`;
  const width = ctx.measureText(opts.button).width + 2 * 30;
  ctx.fillStyle = COLORS.brand;
  roundRectPath(ctx, pad, top, width, buttonHeight, buttonHeight / 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.button, pad + 30, top + buttonHeight / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return top + buttonHeight;
}

function drawWebCards(ctx: CanvasRenderingContext2D, lw: number, top: number, bottom: number): void {
  const { pad, cardGap, cardHeader, cardRadius } = WEB;
  const height = bottom - top;
  if (height < 48) return;
  const width = (lw - 2 * pad - 2 * cardGap) / 3;
  [0, 1, 2].forEach((i) => {
    const x = pad + i * (width + cardGap);
    ctx.save();
    roundRectPath(ctx, x, top, width, height, cardRadius);
    ctx.clip();
    ctx.fillStyle = COLORS.paper2;
    ctx.fillRect(x, top, width, height);
    ctx.fillStyle = COLORS.brand;
    ctx.fillRect(x, top, width, cardHeader);
    ctx.fillStyle = COLORS.mutedLight;
    ctx.globalAlpha = 0.45;
    [0.62, 0.86, 0.48].forEach((share, row) => {
      roundRectPath(ctx, x + 18, top + cardHeader + 24 + row * 22, (width - 36) * share, 10, 5);
      ctx.fill();
    });
    ctx.restore();
  });
}

/**
 * Website: Paper-Grund, Ink-Leiste 64 px, Headline Archivo 900 96 px (bei
 * Bedarf zweizeilig), 6°-Akzent, oranger Button mit Ink-Text, drei Karten
 * #EAE5DA mit oranger Kopfleiste.
 */
export function drawWeb(ctx: CanvasRenderingContext2D, w: number, h: number, opts: WebOptions): void {
  ctx.save();
  const lw = applyLogicalWidth(ctx, w, h, opts.aspect);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, lw, h);
  drawNav(ctx, lw);
  const accentBottom = drawHeadline(ctx, lw, opts);
  const buttonBottom = drawButton(ctx, accentBottom + 26, opts);
  drawWebCards(ctx, lw, buttonBottom + 36, h - 40);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Feed-Karten (uFeed und Stretch-Atlas)
// ---------------------------------------------------------------------------

interface FeedCard {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly tone: (typeof CARD_TONES)[number];
  readonly text: string;
}

function drawFeedCard(
  ctx: CanvasRenderingContext2D,
  card: FeedCard,
  family: string,
  opts: { radius: number; size: number; min: number },
): void {
  const { x, y, w, h, tone, text } = card;
  const inset = Math.round(w * 0.09);
  ctx.save();
  roundRectPath(ctx, x, y, w, h, opts.radius);
  ctx.clip();
  ctx.fillStyle = tone.bg;
  ctx.fillRect(x, y, w, h);

  // Kopfzeile: Avatar + Namensbalken (ohne Text)
  ctx.fillStyle = tone.fg;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(x + inset + 9, y + inset + 9, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.3;
  roundRectPath(ctx, x + inset + 26, y + inset + 5, w * 0.36, 8, 4);
  ctx.fill();

  // Motiv
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const fitted = fitText(ctx, text, {
    weight: 800,
    size: opts.size,
    min: opts.min,
    family,
    maxWidth: w - 2 * inset,
    maxLines: 3,
  });
  const lineHeight = fitted.size * 1.04;
  const blockHeight = lineHeight * fitted.lines.length;
  const first = y + h / 2 - blockHeight / 2 + fitted.size * 0.78;
  fitted.lines.forEach((line, i) => ctx.fillText(line, x + inset, first + i * lineHeight));

  // Fusszeile: drei Punkte (Reaktionen, ohne Text)
  ctx.globalAlpha = 0.35;
  [0, 1, 2].forEach((i) => {
    ctx.beginPath();
    ctx.arc(x + inset + 6 + i * 20, y + h - inset - 6, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function toneAt(col: number, row: number): (typeof CARD_TONES)[number] {
  return CARD_TONES[(col + row) % CARD_TONES.length];
}

export interface FeedOptions {
  readonly family: string;
  /** sechs Motive aus COPY.scene3d.feed */
  readonly motifs: readonly string[];
  /** Bildschirm Breite / Hoehe */
  readonly aspect: number;
}

/** Feed: Ink-Grund, 3 × 2 Hochkant-Karten (Paper / Orange / Anthrazit), Archivo 800. */
export function drawFeed(ctx: CanvasRenderingContext2D, w: number, h: number, opts: FeedOptions): void {
  const { marginX, marginY, gap, ratio, radius, fontSize, fontMin } = FEED;
  ctx.save();
  const lw = applyLogicalWidth(ctx, w, h, opts.aspect);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, lw, h);
  const cardH = (h - 2 * marginY - gap) / 2;
  const cardW = Math.min(cardH * ratio, (lw - 2 * marginX - 2 * gap) / 3);
  const x0 = (lw - (3 * cardW + 2 * gap)) / 2;
  const y0 = (h - (2 * cardH + gap)) / 2;
  opts.motifs.slice(0, 6).forEach((text, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawFeedCard(
      ctx,
      { x: x0 + col * (cardW + gap), y: y0 + row * (cardH + gap), w: cardW, h: cardH, tone: toneAt(col, row), text },
      opts.family,
      { radius, size: fontSize, min: fontMin },
    );
  });
  ctx.restore();
}

export interface SocialAtlasOptions {
  readonly family: string;
  /** alle neun Motive aus COPY.scene3d.feed */
  readonly motifs: readonly string[];
}

export function socialFontSpec(family: string): string {
  return `800 30px ${family}`;
}

/**
 * Stretch-Atlas 3 × 3 (Zelle 192 × 336 = Karte 0,16 × 0,28). Die Ecken rundet
 * der Shader per SDF-Alpha, die Zellen sind deshalb vollflaechig.
 */
export function drawSocialAtlas(ctx: CanvasRenderingContext2D, w: number, h: number, opts: SocialAtlasOptions): void {
  const cellW = w / 3;
  const cellH = h / 3;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  opts.motifs.slice(0, 9).forEach((text, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawFeedCard(
      ctx,
      { x: col * cellW, y: row * cellH, w: cellW, h: cellH, tone: toneAt(col, row), text },
      opts.family,
      { radius: 0, size: 30, min: 20 },
    );
  });
  ctx.restore();
}
