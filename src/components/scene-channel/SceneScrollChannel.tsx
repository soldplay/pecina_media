'use client';

/**
 * Scroll-Kanal DOM → 3D (DESIGN_SPEC §5.4). Rendert nichts.
 *
 * Liest nur die Datenattribute der Startseite und schreibt in den Store:
 * - data-scene-section → frame.sections[id] (+ Toggle → ui.activeSection)
 * - data-scene-beat    → frame.beats[id]    (+ Toggle → ui.activeBeat/activeStation/haltungActive)
 * - data-scene-anchor="cover" → layout.anchors.cover
 * - data-covers-canvas → ui.covered
 * - data-scene-range="start|end" ueberschreibt den Standard-Bereich
 * Nach jedem ScrollTrigger-Refresh: layout.anchors (neues Objekt) + layout.version++.
 */

import { useEffect } from 'react';
import { CUT_TAN } from '@/lib/brand';
import { ScrollTrigger } from '@/lib/gsap';
import {
  haltungIndexOfBeat,
  isBeatId,
  isHaltungBeatId,
  isSectionId,
  isStationBeatId,
  stationOfBeat,
  type AnchorId,
  type BeatId,
  type SectionId,
} from '@/lib/scene/ids';
import { frame, keepAlive, layout, ui, type AnchorRange } from '@/lib/scene/store';

const REFRESH_DEBOUNCE_MS = 200;
const KEEP_ALIVE_SCROLL_MS = 400;
const KEEP_ALIVE_POINTER_MS = 300;
/** Hoehenaenderungen darunter (mobile Adressleiste) loesen keinen Refresh aus. */
const RESIZE_HEIGHT_THRESHOLD_PX = 150;

type Range = readonly [start: string, end: string];

const RANGE_SECTION: Range = ['top top', 'bottom top'];
const RANGE_STATION_BEAT: Range = ['top 60%', 'bottom 80%'];
const RANGE_HALTUNG_BEAT: Range = ['top 75%', 'top 35%'];
const RANGE_COVER: Range = ['top top', 'bottom bottom'];
const RANGE_TOGGLE: Range = ['top center', 'bottom center'];
/**
 * Haltung: Die Kamera erreicht Monolith N bei haltung:N 0,7 (Oberkante bei 47 % der
 * Hoehe, camera-keys.ts H1–H3). Umschalten bei 55 % = Mitte der Kamerafahrt, damit
 * Markierung, Lichtstreifen und Kamera gemeinsam wechseln (Abnahme 14.10.2026).
 */
const RANGE_TOGGLE_HALTUNG: Range = ['top 55%', 'bottom 55%'];

const cutRise = (): number => CUT_TAN * window.innerWidth;

function readRange(el: HTMLElement, fallback: Range): Range {
  const raw = el.dataset.sceneRange;
  if (!raw) return fallback;
  const [start, end] = raw.split('|').map((part) => part.trim());
  return start && end ? [start, end] : fallback;
}

function queryAll(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector));
}

interface AnchorTrigger {
  readonly id: AnchorId;
  readonly trigger: ScrollTrigger;
}

function writeProgress(id: AnchorId, progress: number): void {
  if (isSectionId(id)) frame.sections[id] = progress;
  else if (isBeatId(id)) frame.beats[id] = progress;
}

function createProgressTrigger(el: HTMLElement, id: AnchorId, range: Range): AnchorTrigger {
  const [start, end] = readRange(el, range);
  const trigger = ScrollTrigger.create({
    trigger: el,
    start,
    end,
    onUpdate: (self) => {
      writeProgress(id, self.progress);
      keepAlive(KEEP_ALIVE_SCROLL_MS);
    },
  });
  return { id, trigger };
}

function onSectionToggle(id: SectionId, active: boolean): void {
  if (active) ui.set({ activeSection: id });
}

function onBeatToggle(id: BeatId, active: boolean): void {
  if (isHaltungBeatId(id)) {
    const n = haltungIndexOfBeat(id);
    if (active) ui.set({ haltungActive: n });
    else if (ui.get().haltungActive === n) ui.set({ haltungActive: 0 });
    return;
  }
  if (active) ui.set({ activeBeat: id, activeStation: stationOfBeat(id) });
  else if (ui.get().activeBeat === id) ui.set({ activeBeat: null, activeStation: null });
}

function createToggleTrigger(
  el: HTMLElement,
  onToggle: (active: boolean) => void,
  range: Range = RANGE_TOGGLE,
): ScrollTrigger {
  return ScrollTrigger.create({
    trigger: el,
    start: range[0],
    end: range[1],
    onToggle: (self) => onToggle(self.isActive),
  });
}

function createCoverageTrigger(el: HTMLElement): ScrollTrigger {
  return ScrollTrigger.create({
    trigger: el,
    start: () => `top+=${cutRise()} top`,
    end: () => `bottom-=${cutRise()} bottom`,
    onToggle: (self) => ui.set({ covered: self.isActive }),
  });
}

function assertCoverHeight(el: HTMLElement): void {
  if (process.env.NODE_ENV === 'production') return;
  const height = el.getBoundingClientRect().height;
  const rise = cutRise();
  console.assert(
    height > window.innerHeight + 2 * rise,
    `[SceneScrollChannel] Papierwand zu niedrig fuer die Verdeckung: ${Math.round(height)}px ≤ innerHeight + 2·cutRise`,
  );
  console.assert(
    height >= 2 * window.innerHeight + 2 * rise,
    `[SceneScrollChannel] Papierwand unter 2·100vh + 2·cutRise (Spec §3.0, Kamerasprung E): ${Math.round(height)}px`,
  );
}

function setupTriggers(): { triggers: ScrollTrigger[]; anchors: AnchorTrigger[]; cover: HTMLElement | null } {
  const anchors: AnchorTrigger[] = [];
  const triggers: ScrollTrigger[] = [];

  queryAll('[data-scene-section]').forEach((el) => {
    const id = el.dataset.sceneSection;
    if (!isSectionId(id)) return;
    anchors.push(createProgressTrigger(el, id, RANGE_SECTION));
    triggers.push(createToggleTrigger(el, (active) => onSectionToggle(id, active)));
  });

  queryAll('[data-scene-beat]').forEach((el) => {
    const id = el.dataset.sceneBeat;
    if (!isBeatId(id)) return;
    anchors.push(createProgressTrigger(el, id, isStationBeatId(id) ? RANGE_STATION_BEAT : RANGE_HALTUNG_BEAT));
    const toggleRange = isHaltungBeatId(id) ? RANGE_TOGGLE_HALTUNG : RANGE_TOGGLE;
    triggers.push(createToggleTrigger(el, (active) => onBeatToggle(id, active), toggleRange));
  });

  const cover = document.querySelector<HTMLElement>('[data-scene-anchor="cover"]');
  if (cover) anchors.push(createProgressTrigger(cover, 'cover', RANGE_COVER));

  const coverage = document.querySelector<HTMLElement>('[data-covers-canvas]');
  if (coverage) triggers.push(createCoverageTrigger(coverage));

  return { triggers: [...triggers, ...anchors.map((a) => a.trigger)], anchors, cover };
}

function publishAnchors(anchors: readonly AnchorTrigger[]): void {
  const next: Partial<Record<AnchorId, AnchorRange>> = {};
  anchors.forEach(({ id, trigger }) => {
    next[id] = Object.freeze({ start: trigger.start, end: trigger.end });
    writeProgress(id, trigger.progress);
  });
  layout.anchors = Object.freeze(next);
  layout.version += 1;
  keepAlive(KEEP_ALIVE_SCROLL_MS);
}

function updateViewport(): void {
  frame.scrollY = window.scrollY;
  frame.vh = window.innerHeight;
  frame.vw = window.innerWidth;
}

export default function SceneScrollChannel(): null {
  useEffect(() => {
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let triggers: ScrollTrigger[] = [];
    let anchors: AnchorTrigger[] = [];
    let cover: HTMLElement | null = null;
    let lastSize = { w: window.innerWidth, h: window.innerHeight };
    const finePointer = window.matchMedia('(pointer: fine)');

    const scheduleRefresh = (): void => {
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (!disposed) ScrollTrigger.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    const onRefresh = (): void => {
      if (disposed) return;
      publishAnchors(anchors);
      if (cover) assertCoverHeight(cover);
    };

    const onScroll = (): void => {
      frame.scrollY = window.scrollY;
    };

    const onResize = (): void => {
      updateViewport();
      const size = { w: window.innerWidth, h: window.innerHeight };
      const widthChanged = size.w !== lastSize.w;
      const heightJump = Math.abs(size.h - lastSize.h) > RESIZE_HEIGHT_THRESHOLD_PX;
      if (widthChanged || heightJump) {
        lastSize = size;
        scheduleRefresh();
      }
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (!finePointer.matches) return;
      frame.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      frame.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      const { activeSection, motion } = ui.get();
      if (activeSection === 'start' && motion === 'full') keepAlive(KEEP_ALIVE_POINTER_MS);
    };

    const resizeObserver = new ResizeObserver(() => scheduleRefresh());

    updateViewport();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pm:layout', scheduleRefresh);
    ScrollTrigger.addEventListener('refresh', onRefresh);

    void document.fonts.ready.then(() => {
      if (disposed) return;
      ({ triggers, anchors, cover } = setupTriggers());
      resizeObserver.observe(document.body);
      ScrollTrigger.refresh();
    });

    return () => {
      disposed = true;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pm:layout', scheduleRefresh);
      ScrollTrigger.removeEventListener('refresh', onRefresh);
      triggers.forEach((t) => t.kill());
      triggers = [];
      anchors = [];
      // onToggle feuert nur bei Wechseln: Verlaesst man / waehrend die Wand den Canvas
      // verdeckt (z. B. Menue → /impressum), bliebe covered sonst true und die Szene bei
      // der Rueckkehr unsichtbar und angehalten. Beat-Zustand ebenso zuruecksetzen.
      ui.set({ covered: false, activeBeat: null, activeStation: null, haltungActive: 0 });
    };
  }, []);

  return null;
}
