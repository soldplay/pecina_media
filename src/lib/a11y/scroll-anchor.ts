/**
 * Lese- und Fokusposition halten, waehrend sich die Seitenhoehe aendert (DESIGN_SPEC §4.5, §5.8).
 *
 * Anlass: Der Schalter „Bewegung reduzieren“ schaltet die Scroll-Strecken (Runways) an bzw. aus.
 * Die Seite wird dabei mehrere tausend Pixel kuerzer oder laenger; ohne Gegenmassnahme bliebe
 * scrollY absolut gleich: Man landet in einer anderen Station, und ein fokussierter Schalter im
 * Footer liegt danach weit ausserhalb des Viewports (WCAG 2.4.7 / 2.4.11).
 *
 * Ablauf von keepReadingPosition(change, origin):
 * 1. Anker merken, bevor `change` laeuft:
 *    - `origin` (der bediente Schalter) liegt im Seitenfluss (Footer): seine Oberkante.
 *    - `origin` liegt in einer fixen Ebene (Header, Menue) oder fehlt: der kleinste Inhaltsblock
 *      ([data-scene-beat], [data-scene-section], Footer), der die Leselinie unter dem Header
 *      schneidet, mit relativer Lage der Leselinie in diesem Block; sonst der erste Block unterhalb.
 *    - Ganz oben (scrollY 0) bleibt die Seite oben.
 * 2. `change` ausfuehren, danach den Anker sofort und nach dem Relayout (2 Frames, 120/400/900 ms:
 *    React-Commit, Lenis an/aus, ScrollTrigger-Refresh) wieder an dieselbe Stelle setzen.
 *    Eigene Scroll-Eingaben (Rad, Touch, Taste, Zeiger) beenden das Nachfuehren sofort.
 * 3. Fokus: War `origin` fokussiert und hat ihn verloren, bekommt er ihn zurueck (ohne Scrollen).
 */

import { getLenis } from './navigation';

const CONTENT_SELECTOR = '[data-scene-beat], [data-scene-section], #site-footer';
const HEADER_ID = 'site-header';
const SETTLE_DELAYS_MS = [120, 400, 900] as const;
const CANCEL_EVENTS = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;
/** Unterhalb dieser Abweichung (px) wird nicht nachgescrollt. */
const TOLERANCE_PX = 1;

type ScrollAnchor =
  | { readonly mode: 'top' }
  | { readonly mode: 'edge'; readonly el: Element; readonly top: number }
  | { readonly mode: 'ratio'; readonly el: Element; readonly line: number; readonly ratio: number };

let cancelActiveHold: (() => void) | null = null;

function isInFixedLayer(el: Element): boolean {
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
}

/** Leselinie: Unterkante des Headers (fix), mindestens 0 (Header nicht fixiert, z. B. bei 400 % Zoom). */
function readingLine(): number {
  const header = document.getElementById(HEADER_ID);
  return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

function captureContentAnchor(): ScrollAnchor | null {
  const line = readingLine();
  const blocks = Array.from(document.querySelectorAll(CONTENT_SELECTOR))
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height > 0);

  const straddling = blocks
    .filter(({ rect }) => rect.top <= line && rect.bottom > line)
    .sort((a, b) => a.rect.height - b.rect.height)[0];
  if (straddling) {
    const { el, rect } = straddling;
    return { mode: 'ratio', el, line, ratio: (line - rect.top) / rect.height };
  }

  const below = blocks.find(({ rect }) => rect.top > line && rect.top < window.innerHeight);
  return below ? { mode: 'edge', el: below.el, top: below.rect.top } : null;
}

function captureAnchor(origin: HTMLElement | null): ScrollAnchor | null {
  if (window.scrollY < TOLERANCE_PX) return { mode: 'top' };
  if (origin && origin.isConnected && !isInFixedLayer(origin)) {
    return { mode: 'edge', el: origin, top: origin.getBoundingClientRect().top };
  }
  return captureContentAnchor();
}

/** Ziel-scrollY, an dem der Anker wieder an seiner gemerkten Stelle steht; null, wenn er fehlt. */
function targetScrollY(anchor: ScrollAnchor): number | null {
  if (anchor.mode === 'top') return 0;
  if (!anchor.el.isConnected) return null;
  const rect = anchor.el.getBoundingClientRect();
  const offset =
    anchor.mode === 'edge' ? rect.top - anchor.top : rect.top + anchor.ratio * rect.height - anchor.line;
  return window.scrollY + offset;
}

function scrollToY(y: number): void {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const top = Math.min(Math.max(0, y), max);
  if (Math.abs(top - window.scrollY) < TOLERANCE_PX) return;
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: 'instant' });
}

function restore(anchor: ScrollAnchor, origin: HTMLElement | null, hadFocus: boolean): void {
  const y = targetScrollY(anchor);
  if (y !== null) scrollToY(y);
  if (hadFocus && origin?.isConnected && document.activeElement !== origin) {
    origin.focus({ preventScroll: true });
  }
}

/** Fuehrt den Anker ueber das Relayout nach; liefert die Abbruchfunktion. */
function holdAnchor(anchor: ScrollAnchor, origin: HTMLElement | null, hadFocus: boolean): () => void {
  const frames: number[] = [];
  const timers: number[] = [];
  const step = (): void => restore(anchor, origin, hadFocus);

  const cancel = (): void => {
    frames.forEach((id) => window.cancelAnimationFrame(id));
    timers.forEach((id) => window.clearTimeout(id));
    CANCEL_EVENTS.forEach((type) => window.removeEventListener(type, cancel, true));
    if (cancelActiveHold === cancel) cancelActiveHold = null;
  };

  frames.push(window.requestAnimationFrame(() => frames.push(window.requestAnimationFrame(step))));
  SETTLE_DELAYS_MS.forEach((ms, index) => {
    const isLast = index === SETTLE_DELAYS_MS.length - 1;
    timers.push(
      window.setTimeout(() => {
        step();
        if (isLast) cancel();
      }, ms),
    );
  });
  CANCEL_EVENTS.forEach((type) => window.addEventListener(type, cancel, { capture: true, passive: true }));
  return cancel;
}

/**
 * Fuehrt `change` aus (z. B. setMotionPreference) und haelt dabei die Leseposition.
 * `origin`: das ausloesende Bedienelement (Fokus bleibt darauf), sonst null.
 */
export function keepReadingPosition(change: () => void, origin: HTMLElement | null): void {
  if (typeof window === 'undefined') {
    change();
    return;
  }
  cancelActiveHold?.();
  const hadFocus = origin !== null && document.activeElement === origin;
  const anchor = captureAnchor(origin);
  change();
  if (!anchor) return;
  restore(anchor, origin, hadFocus);
  cancelActiveHold = holdAnchor(anchor, origin, hadFocus);
}
