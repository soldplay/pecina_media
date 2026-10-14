/**
 * 3D-Texte und -Grafiken als CanvasTexture aus den next/font-Schriften
 * (DESIGN_SPEC §2.2, §5.3). Kein troika, kein TextGeometry.
 *
 * Nur im Browser verwenden (Client Components / R3F-Szene): useCanvasTexture
 * ist ein React-Hook, createCanvasTexture braucht `document`.
 */

import * as THREE from 'three';
import { useEffect, useState, type DependencyList } from 'react';
import { keepAlive } from '@/lib/scene/store';

/** Maximale Kantenlaenge einer CanvasTexture (Budget §6.1: ≤ 1024²). */
export const MAX_CANVAS_TEXTURE = 1024;

const FONT_TIMEOUT_MS = 2500;
const KEEP_ALIVE_AFTER_CREATE_MS = 200;

export type FontVarName = '--font-archivo' | '--font-comfortaa';

/**
 * Font-Family-Liste aus der next/font-Variable (der Name ist gehasht, z. B.
 * "'Archivo', 'Archivo Fallback'"). Fallback 'sans-serif'.
 */
export function resolveFontFamily(varName: FontVarName): string {
  if (typeof document === 'undefined') return 'sans-serif';
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || 'sans-serif';
}

/**
 * Wartet, bis alle Font-Specs (z. B. `800 96px ${family}`) geladen sind, aber
 * hoechstens timeoutMs. Wirft nie; im Fehlerfall zeichnet der Aufrufer mit
 * dem Fallback-Font.
 */
export async function ensureFonts(specs: readonly string[], timeoutMs = FONT_TIMEOUT_MS): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document) || specs.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const loads = Promise.all(specs.map((spec) => document.fonts.load(spec))).then(
    () => undefined,
    () => undefined,
  );
  try {
    await Promise.race([loads, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface CanvasTextureOptions {
  /** sRGB-Farbraum (Farbtexturen); false fuer Daten/Alpha-Masken. Standard true */
  srgb?: boolean;
  /** Mipmaps + trilineare Filterung. Standard true */
  mipmaps?: boolean;
  /** Standard 4 */
  anisotropy?: number;
}

export type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function clampSize(n: number): number {
  return Math.min(MAX_CANVAS_TEXTURE, Math.max(1, Math.round(n)));
}

/** Zeichnet in ein neues Canvas (w, h auf 1…1024 geklemmt) und liefert die Textur. */
export function createCanvasTexture(
  w: number,
  h: number,
  draw: CanvasDraw,
  opts: CanvasTextureOptions = {},
): THREE.CanvasTexture {
  const { srgb = true, mipmaps = true, anisotropy = 4 } = opts;
  const width = clampSize(w);
  const height = clampSize(h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('createCanvasTexture: 2D-Kontext nicht verfuegbar');
  draw(ctx, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = mipmaps;
  texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * React-Hook: wartet auf die Fonts, erzeugt die Textur, ruft keepAlive(200)
 * und disposed beim Unmount bzw. wenn sich w, h oder `deps` aendern.
 * `draw` wird nur bei Aenderung von w/h/deps neu ausgewertet (wie useMemo).
 */
export function useCanvasTexture(
  w: number,
  h: number,
  draw: CanvasDraw,
  deps: DependencyList,
  fontSpecs: readonly string[] = [],
): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const fontKey = fontSpecs.join('|');

  useEffect(() => {
    let cancelled = false;
    let created: THREE.CanvasTexture | null = null;
    void ensureFonts(fontKey ? fontKey.split('|') : []).then(() => {
      if (cancelled) return;
      created = createCanvasTexture(w, h, draw);
      setTexture(created);
      keepAlive(KEEP_ALIVE_AFTER_CREATE_MS);
    });
    return () => {
      cancelled = true;
      created?.dispose();
      setTexture(null);
    };
    // deps werden vom Aufrufer vertraglich durchgereicht (wie bei useMemo);
    // `draw` ist absichtlich nicht enthalten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, fontKey, ...deps]);

  return texture;
}

export interface CutTextOptions {
  /** CSS-Font-Kurzform, z. B. `900 160px ${resolveFontFamily('--font-archivo')}` */
  font: string;
  /** Spaltbreite als Anteil der Versalhoehe (z. B. CUT_GAP = 0.09) */
  gap: number;
  /** Steigung der Schnittlinie in Grad, Standard 6 (steigt nach rechts) */
  angleDeg?: number;
  /** spiegelverkehrt (Bleisatz); spiegelt Text und Schnitt um die Textmitte */
  mirror?: boolean;
  /** Breite per ctx.fontStretch (z. B. 'expanded'); Standard unveraendert */
  stretch?: CanvasFontStretch;
  /** Fuellung; Standard: aktueller ctx.fillStyle */
  fill?: string | CanvasGradient | CanvasPattern;
}

/**
 * Zeichnet `text` an (x, y) (Grundlinie, ctx.textAlign wie gesetzt) mit einem
 * Spalt entlang einer Linie durch die Mitte des Textblocks: obere Haelfte um
 * +gap/2 entlang der Normale verschoben, untere um −gap/2. Fuer Bleisatz und
 * Abzug (Station Papier).
 */
export function drawCutText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: CutTextOptions,
): void {
  const { font, gap, angleDeg = 6, mirror = false, stretch, fill } = opts;
  ctx.save();
  ctx.font = font;
  if (stretch) ctx.fontStretch = stretch;
  if (fill) ctx.fillStyle = fill;
  ctx.textBaseline = 'alphabetic';

  const m = ctx.measureText(text);
  const left = x - m.actualBoundingBoxLeft;
  const right = x + m.actualBoundingBoxRight;
  const capHeight = m.actualBoundingBoxAscent;
  const cx = (left + right) / 2;
  const cy = y - capHeight / 2;
  const offset = (gap * capHeight) / 2;
  const reach = (right - left + capHeight) * 2;

  const a = (angleDeg * Math.PI) / 180;
  // Canvas: y zeigt nach unten. Linie steigt nach rechts: d = (cos a, −sin a);
  // Normale nach oben: n = (−sin a, −cos a).
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const nx = -Math.sin(a);
  const ny = -Math.cos(a);

  if (mirror) {
    ctx.translate(2 * cx, 0);
    ctx.scale(-1, 1);
  }

  const drawHalf = (side: 1 | -1): void => {
    ctx.save();
    // Erst verschieben, dann clippen: Maske und Text wandern gemeinsam, der
    // Spalt zwischen den Haelften betraegt so genau gap · Versalhoehe.
    ctx.translate(nx * offset * side, ny * offset * side);
    ctx.beginPath();
    ctx.moveTo(cx - dx * reach, cy - dy * reach);
    ctx.lineTo(cx + dx * reach, cy + dy * reach);
    ctx.lineTo(cx + dx * reach + nx * reach * side, cy + dy * reach + ny * reach * side);
    ctx.lineTo(cx - dx * reach + nx * reach * side, cy - dy * reach + ny * reach * side);
    ctx.closePath();
    ctx.clip();
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  drawHalf(1);
  drawHalf(-1);
  ctx.restore();
}
