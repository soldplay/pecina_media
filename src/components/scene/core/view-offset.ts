/**
 * Bildausschnitt per camera.setViewOffset (DESIGN_SPEC §3.9 „Bildausschnitt“).
 *
 * Seit der Abnahme 14.10.2026 sind x- und y-Verschiebung Kanaele der
 * Kamera-Keys (camera-keys.ts): sie werden wie FOV ueber die Scroll-Position
 * interpoliert und mit der Kamera gedaempft — kein eigener Zeit-Nachlauf mehr.
 * Diese Datei liefert die Werte je Key-Art:
 *
 * - Stationen (Desktop): Objekt mittig in der freien Flaeche neben der Text-Karte
 *   (gemessen, framing-probe.ts); vertikal mittig unter der Header-Zone.
 *   Ohne Messung ±16 % wie in der Spec.
 * - Haltung (Fix-Runde 3): wie die Stationen aus der gemessenen Panel-Kante
 *   (Monolith mittig in der freien Flaeche rechts); ohne Messung −10 %.
 * - Kontakt: Pose samt Ausschnitt aus hero-framing.fitSculptureInRect.
 * - Compact: x 0 (Karten liegen unter dem 3D-Fenster); y aus dem gemessenen
 *   3D-Fenster an der Scroll-Position des Keys (windowShiftY), ohne Fenster +22 %.
 */

import type { PerspectiveCamera } from 'three';
import type { StationDef } from '@/lib/scene/stations';
import type { CardSpan, DocSpan } from './framing-probe';

export const VIEW_X_SHIFT_STATION = 0.16;
/** Rueckfall ohne gemessenes Haltungs-Panel */
export const VIEW_X_SHIFT_HALTUNG = -0.1;
export const VIEW_Y_SHIFT_COMPACT = 0.22;
/** Hoechstens so weit verschieben (Anteil der Breite) */
const MAX_X_SHIFT = 0.35;
/** Compact: sichtbarer Fensteranteil darunter (Anteil der Hoehe) → Rueckfall statt Fenstermitte */
const MIN_WINDOW_FRACTION = 0.12;
/** Compact: Fenstermitte hoechstens so weit verschieben (Anteil der Hoehe) */
const MAX_Y_SHIFT = 0.42;

const SHIFT_EPS = 1e-4;
/** Pixel-Toleranz, unter der ein gesetzter Offset nicht neu geschrieben wird */
const OFFSET_EPS_PX = 0.05;

/**
 * x-Verschiebung einer Station: Mitte der freien Flaeche neben der Karte.
 * Karte rechts → frei [0, Karte links]; Karte links → frei [Karte rechts, Breite].
 * Positiv = Bildinhalt wandert nach links.
 */
export function stationShiftX(textSide: StationDef['textSide'], card: CardSpan | undefined, width: number): number {
  const fallback = textSide === 'right' ? VIEW_X_SHIFT_STATION : -VIEW_X_SHIFT_STATION;
  if (!card || width <= 0) return fallback;
  const [from, to] = textSide === 'right' ? [0, card.left] : [card.right, width];
  if (to - from <= 0) return fallback;
  const shift = (width / 2 - (from + to) / 2) / width;
  return Math.min(MAX_X_SHIFT, Math.max(-MAX_X_SHIFT, shift));
}

/** y-Verschiebung der Stationen (Desktop): Mitte der Flaeche unter der Header-Zone. */
export function stationShiftY(safeTop: number, height: number): number {
  return height > 0 ? -safeTop / 2 / height : 0;
}

/** Haltung (Desktop): Panel links → Monolith mittig in der freien Flaeche rechts davon. */
export function haltungShiftX(panel: CardSpan | null, width: number): number {
  if (!panel || width <= 0 || width - panel.right <= 0) return VIEW_X_SHIFT_HALTUNG;
  return stationShiftX('left', panel, width);
}

/** Sichtbarer Teil eines Dokument-Bereichs bei Scroll-Position y, unter der Header-Zone (px). */
export function visibleBand(span: DocSpan, y: number, safeTop: number, height: number): { top: number; bottom: number } {
  return { top: Math.max(safeTop, span.top - y), bottom: Math.min(height, span.bottom - y) };
}

/**
 * Compact (Fix-Runde 3): Motivmitte in die Mitte des sichtbaren 3D-Fensters an
 * der Scroll-Position y des Keys, statt fester +22 %. Vorher lagen die Objekte
 * mobil an der Karten-Oberkante (Dosen halb verdeckt, Spruehring fehlte).
 * Ohne Fenster oder wenn davon zu wenig sichtbar ist: `fallback`.
 */
export function windowShiftY(span: DocSpan | undefined, y: number, safeTop: number, height: number, fallback: number): number {
  if (!span || height <= 0) return fallback;
  const band = visibleBand(span, y, safeTop, height);
  if (band.bottom - band.top < MIN_WINDOW_FRACTION * height) return fallback;
  const shift = 0.5 - (band.top + band.bottom) / 2 / height;
  return Math.min(MAX_Y_SHIFT, Math.max(-MAX_Y_SHIFT, shift));
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

/**
 * camera.setViewOffset(w, h, xShift·w, yShift·h, w, h); bei 0/0 clearViewOffset.
 * Schreibt nur bei Aenderung (setViewOffset ruft updateProjectionMatrix auf).
 * Liefert true, wenn die Projektion neu berechnet wurde.
 */
export function applyViewOffset(camera: PerspectiveCamera, size: ViewSize, xShift: number, yShift: number): boolean {
  const w = Math.max(1, size.width);
  const h = Math.max(1, size.height);
  const view = camera.view;

  if (Math.abs(xShift) < SHIFT_EPS && Math.abs(yShift) < SHIFT_EPS) {
    if (!view || !view.enabled) return false;
    camera.clearViewOffset();
    return true;
  }

  const offsetX = xShift * w;
  const offsetY = yShift * h;
  const unchanged =
    view !== null &&
    view.enabled &&
    view.fullWidth === w &&
    view.fullHeight === h &&
    view.width === w &&
    view.height === h &&
    Math.abs(view.offsetX - offsetX) < OFFSET_EPS_PX &&
    Math.abs(view.offsetY - offsetY) < OFFSET_EPS_PX;
  if (unchanged) return false;

  camera.setViewOffset(w, h, offsetX, offsetY, w, h);
  return true;
}
