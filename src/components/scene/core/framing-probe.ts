/**
 * Liest die DOM-Flaechen, die die 3D-Komposition freihalten muss (DESIGN_SPEC
 * §3.1, §3.2, §3.3.0, §3.7): das H1-Band der Start-Sektion, die Text-Karten der
 * Stationen, das Haltungs- und das Kontakt-Panel (alle P5) sowie den Header
 * (P7). Compact: die transparenten 3D-Fenster (Haltung 45svh, Stationen 55svh,
 * Kontakt 40svh) in Dokument-Koordinaten. Nur beim Layout-Refresh der Kamera
 * aufrufen (getBoundingClientRect erzwingt Layout), nie pro Frame.
 *
 * Selektoren laut Spec-DOM. Fehlt ein Element (anderes Layout, Unterseite),
 * liefert die Probe null bzw. laesst den Eintrag weg; die Kamera nimmt dann
 * Fallback-Werte.
 */

import { CUT_TAN } from '@/lib/brand';
import { STATION_IDS, type StationBeatId, type StationId } from '@/lib/scene/ids';
import type { HeroBand } from './hero-framing';

/** Header-Zone, in die kein 3D-Motiv ragen soll (Abnahme 14.10.2026: obere 88 px). */
export const HEADER_SAFE_PX = 88;

const SELECTORS = Object.freeze({
  section: 'start',
  band: '#start .start__band',
  sticky: '#start .start__sticky',
  header: '#site-header',
  card: (id: StationId) => `[data-scene-beat="${id}:a"] .leistung__card`,
  beat: (id: StationBeatId) => `[data-scene-beat="${id}"]`,
  haltungPanel: '#haltung .haltung__panel',
  haltungWindow: '#haltung .haltung__window',
  kontakt: 'kontakt',
  kontaktPanel: '#kontakt .panel',
});

/** Horizontale Lage einer Text-Karte bzw. eines Panels im Viewport (px). */
export interface CardSpan {
  readonly left: number;
  readonly right: number;
}

/** Vertikale Lage im Dokument (px, scrollY-unabhaengig). */
export interface DocSpan {
  readonly top: number;
  readonly bottom: number;
}

/** 3D-Fenster im Compact-Layout: Stations-Beats, Haltung, Kontakt. */
export type SceneWindowId = StationBeatId | 'haltung' | 'kontakt';

export interface FramingProbe {
  readonly band: HeroBand | null;
  readonly cards: Readonly<Partial<Record<StationId, CardSpan>>>;
  /** Haltungs-Panel (Desktop: Spalten 1–5); null, wenn nicht gefunden */
  readonly haltungPanel: CardSpan | null;
  /** Kontakt-Panel (Desktop: Spalten 1–5); null, wenn nicht gefunden */
  readonly kontaktPanel: CardSpan | null;
  /** Compact-Fenster (Dokument-y); leer, wenn das Layout keine Fenster hat */
  readonly windows: Readonly<Partial<Record<SceneWindowId, DocSpan>>>;
  /** Unterkante der Header-Zone (px), mindestens HEADER_SAFE_PX */
  readonly safeTop: number;
}

/** Fenster unter dieser Hoehe (px) gelten als nicht vorhanden (Desktop-Layout). */
const MIN_WINDOW_PX = 40;

/** Verschiebung durch CSS-/GSAP-Transforms (Scrub, Einblendungen) herausrechnen. */
function translation(el: Element): { x: number; y: number } {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') return { x: 0, y: 0 };
  try {
    const m = new DOMMatrixReadOnly(transform);
    return { x: m.m41, y: m.m42 };
  } catch {
    return { x: 0, y: 0 };
  }
}

/** Erste Ecke des clip-path-Polygons „polygon(0 <rise>, 100% 0, …)“ → rise in px. */
function clipRise(el: Element, width: number): number {
  const match = /polygon\(\s*[^\s,]+\s+(-?[\d.]+)px/.exec(getComputedStyle(el).clipPath);
  const parsed = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : CUT_TAN * width;
}

/**
 * Band-Kontur bei scrollY 0. Das Band sitzt im (Desktop: sticky) Innencontainer;
 * sein Abstand zu diesem Container ist scroll-unabhaengig, der Container liegt
 * bei scrollY 0 am Anfang der Sektion.
 */
function probeBand(): HeroBand | null {
  const section = document.getElementById(SELECTORS.section);
  const band = document.querySelector(SELECTORS.band);
  if (!section || !band) return null;
  const rect = band.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const container = document.querySelector(SELECTORS.sticky) ?? section;
  const offset = translation(band);
  const sectionTopAtZero = section.getBoundingClientRect().top + window.scrollY;
  const topRight = rect.top - offset.y - container.getBoundingClientRect().top + sectionTopAtZero;
  return Object.freeze({
    left: rect.left - offset.x,
    right: rect.right - offset.x,
    topRight,
    rise: clipRise(band, rect.width),
  });
}

function spanOf(el: Element | null): CardSpan | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const { x } = translation(el);
  return Object.freeze({ left: rect.left - x, right: rect.right - x });
}

function probeCards(): Partial<Record<StationId, CardSpan>> {
  const cards: Partial<Record<StationId, CardSpan>> = {};
  for (const id of STATION_IDS) {
    const span = spanOf(document.querySelector(SELECTORS.card(id)));
    if (span) cards[id] = span;
  }
  return cards;
}

/** Dokument-y eines Elements (Transforms herausgerechnet). */
function docTop(el: Element): number {
  return el.getBoundingClientRect().top - translation(el).y + window.scrollY;
}

function docSpan(top: number, bottom: number): DocSpan | null {
  return bottom - top >= MIN_WINDOW_PX ? Object.freeze({ top, bottom }) : null;
}

/** Stations-Fenster: Artikel-Oberkante bis Karten-Oberkante (Compact: 55svh-Fenster ueber der Karte). */
function probeBeatWindow(id: StationBeatId): DocSpan | null {
  const article = document.querySelector(SELECTORS.beat(id));
  const card = article?.querySelector('.leistung__card');
  if (!article || !card) return null;
  return docSpan(docTop(article), docTop(card));
}

function probeElementWindow(el: Element | null): DocSpan | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const top = docTop(el);
  return docSpan(top, top + rect.height);
}

/** Kontakt (Compact): das aria-hidden-Fenster als erstes Kind der Sektion. */
function probeKontaktWindow(): DocSpan | null {
  const section = document.getElementById(SELECTORS.kontakt);
  const first = section?.firstElementChild ?? null;
  if (!first || first.getAttribute('aria-hidden') !== 'true') return null;
  return probeElementWindow(first);
}

function probeWindows(): Partial<Record<SceneWindowId, DocSpan>> {
  const windows: Partial<Record<SceneWindowId, DocSpan>> = {};
  for (const id of STATION_IDS) {
    for (const beat of [`${id}:a`, `${id}:b`] as const) {
      const span = probeBeatWindow(beat);
      if (span) windows[beat] = span;
    }
  }
  const haltung = probeElementWindow(document.querySelector(SELECTORS.haltungWindow));
  if (haltung) windows.haltung = haltung;
  const kontakt = probeKontaktWindow();
  if (kontakt) windows.kontakt = kontakt;
  return windows;
}

function probeSafeTop(): number {
  const header = document.querySelector(SELECTORS.header);
  const bottom = header ? header.getBoundingClientRect().bottom : 0;
  return Math.max(HEADER_SAFE_PX, Number.isFinite(bottom) ? bottom : 0);
}

export function probeFraming(): FramingProbe {
  return Object.freeze({
    band: probeBand(),
    cards: Object.freeze(probeCards()),
    haltungPanel: spanOf(document.querySelector(SELECTORS.haltungPanel)),
    kontaktPanel: spanOf(document.querySelector(SELECTORS.kontaktPanel)),
    windows: Object.freeze(probeWindows()),
    safeTop: probeSafeTop(),
  });
}
