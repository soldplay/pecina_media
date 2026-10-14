'use client';

/**
 * Preloader (P2; DESIGN_SPEC §4.1): rein dekorative 6°-Linie an der Stelle der
 * 3D-Lichtklinge. Kein Overlay, blockiert nichts (pointer-events none),
 * aria-hidden, keine Live-Region.
 *
 * - Linie ueber 10–90 % der Breite bei HERO_BLADE_SCREEN_Y (36 %, compact 28 %),
 *   Anstieg tan 6° · 0,8 · Breite, 2 px #D17F0C mit drop-shadow #FFB257.
 * - Zeichnet sich per stroke-dashoffset: max(zeitbasiert 0 → 0,7 in 1,2 s
 *   power2.out, ui.loadProgress).
 * - sceneStatus 'ready' → 100 %, 200 ms Crossfade in die Klinge, dann
 *   ui.preloaderDone. Spaetestens 1,5 s nach dem Mount fertig, auch ohne 3D.
 * - Tier low / Szene aus: rendert nichts, preloaderDone sofort.
 *   Reduced: Linie statisch, Fade nach 300 ms.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { COLORS, CUT_TAN } from '@/lib/brand';
import { gsap, useGSAP } from '@/lib/gsap';
import { HERO_BLADE_SCREEN_Y } from '@/lib/scene/stations';
import { ui, useUi } from '@/lib/scene/store';

/** Gleiche Regel wie compact in detect-tier (P8): < 768 px oder grober Pointer. */
const COMPACT_QUERY = '(max-width: 767.98px), (pointer: coarse)';
const LINE_FROM = 0.1;
const LINE_SPAN = 0.8;

/** Zeiten in s */
const DRAW_TARGET = 0.7;
const DRAW_DURATION = 1.2;
const FINISH_DRAW = 0.15;
const CROSSFADE = 0.2;
/** Ende spaetestens 1,5 s nach dem Mount: Abschluss beginnt spaetestens hier. */
const FINISH_DEADLINE = 1.5 - FINISH_DRAW - CROSSFADE;
const REDUCED_FADE_DELAY = 0.3;

/** Gluehen als CSS-Filter am <svg> (Filter auf SVG-Kindelementen sind nicht ueberall verlaesslich). */
const SVG_STYLE = Object.freeze({
  filter: `drop-shadow(0 0 6px ${COLORS.glow})`,
});

interface LineGeometry {
  readonly length: number;
}

/** Strichlaenge sichtbar machen: progress 0 = unsichtbar, 1 = ganze Linie. */
function paintLine(line: SVGLineElement | null, geometry: LineGeometry | null, progress: number): void {
  if (!line || !geometry) return;
  line.style.strokeDashoffset = String(geometry.length * (1 - progress));
}

/** Setzt die Linie passend zur aktuellen Viewport-Groesse (gleiches Rechteck wie der Canvas-Layer). */
function layoutLine(root: HTMLElement, line: SVGLineElement): LineGeometry {
  const w = root.clientWidth;
  const h = root.clientHeight;
  const compact = window.matchMedia(COMPACT_QUERY).matches;
  const yCenter = h * (compact ? HERO_BLADE_SCREEN_Y.compact : HERO_BLADE_SCREEN_Y.desktop);
  const span = w * LINE_SPAN;
  const rise = span * CUT_TAN;
  line.setAttribute('x1', String(w * LINE_FROM));
  line.setAttribute('y1', String(yCenter + rise / 2));
  line.setAttribute('x2', String(w * (LINE_FROM + LINE_SPAN)));
  line.setAttribute('y2', String(yCenter - rise / 2));
  const length = Math.hypot(span, rise);
  line.style.strokeDasharray = `${length} ${length}`;
  return { length };
}

function useLineLayout(
  rootRef: RefObject<HTMLDivElement | null>,
  lineRef: RefObject<SVGLineElement | null>,
  geometryRef: RefObject<LineGeometry | null>,
  progressRef: RefObject<number>,
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const line = lineRef.current;
    if (!root || !line) return;
    const relayout = (): void => {
      geometryRef.current = layoutLine(root, line);
      paintLine(line, geometryRef.current, progressRef.current);
    };
    relayout();
    const observer = new ResizeObserver(relayout);
    observer.observe(root);
    const media = window.matchMedia(COMPACT_QUERY);
    media.addEventListener('change', relayout);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', relayout);
    };
  }, [rootRef, lineRef, geometryRef, progressRef]);
}

function markDone(): void {
  ui.set({ preloaderDone: true });
}

interface PreloaderLineProps {
  reduced: boolean;
}

function PreloaderLine({ reduced }: PreloaderLineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const geometryRef = useRef<LineGeometry | null>(null);
  const progressRef = useRef(0);
  const mountedAtRef = useRef<number | null>(null);

  useLineLayout(rootRef, lineRef, geometryRef, progressRef);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      mountedAtRef.current ??= performance.now();
      const mountedAt = mountedAtRef.current;
      const elapsed = (): number => (performance.now() - mountedAt) / 1000;
      const setProgress = (p: number): void => {
        progressRef.current = p;
        paintLine(lineRef.current, geometryRef.current, p);
      };

      // matchMedia haelt die OS-Einstellung live; der Schalter (ui.motion) kommt als Dependency.
      const mm = gsap.matchMedia();
      mm.add({ osReduced: '(prefers-reduced-motion: reduce)' }, (context) => {
        const isReduced = reduced || Boolean(context.conditions?.osReduced);

        if (isReduced) {
          setProgress(1);
          gsap.to(root, {
            opacity: 0,
            duration: CROSSFADE,
            ease: 'none',
            delay: Math.max(0, REDUCED_FADE_DELAY - elapsed()),
            onComplete: markDone,
          });
          return undefined;
        }

        const draw = { p: 0 };
        const render = (): void => setProgress(Math.max(draw.p, ui.get().loadProgress));
        const drawTween = gsap.to(draw, { p: DRAW_TARGET, duration: DRAW_DURATION, ease: 'power2.out', onUpdate: render });
        drawTween.seek(Math.min(elapsed(), DRAW_DURATION));
        render();

        let finished = false;
        let deadline: gsap.core.Tween | null = null;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          drawTween.kill();
          deadline?.kill();
          draw.p = progressRef.current;
          gsap
            .timeline({ onComplete: markDone })
            .to(draw, { p: 1, duration: FINISH_DRAW, ease: 'power2.out', onUpdate: render })
            .to(root, { opacity: 0, duration: CROSSFADE, ease: 'none' });
        };
        deadline = gsap.delayedCall(Math.max(0, FINISH_DEADLINE - elapsed()), finish);

        const unsubscribe = ui.subscribe(() => {
          const s = ui.get();
          if (!finished) render();
          if (s.sceneStatus === 'ready') finish();
        });
        if (ui.get().sceneStatus === 'ready') finish();
        return () => unsubscribe();
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [reduced], revertOnUpdate: true },
  );

  return (
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[4]">
      <svg className="absolute inset-0 h-full w-full overflow-visible" focusable="false" style={SVG_STYLE}>
        <line ref={lineRef} stroke={COLORS.brand} strokeWidth={2} strokeLinecap="butt" />
      </svg>
    </div>
  );
}

export default function Preloader() {
  const tier = useUi((s) => s.tier);
  const sceneOff = useUi((s) => s.sceneStatus === 'off');
  const done = useUi((s) => s.preloaderDone);
  const reduced = useUi((s) => s.motion === 'reduced');
  const disabled = tier === 'low' || sceneOff;

  useEffect(() => {
    if (disabled) markDone();
  }, [disabled]);

  if (disabled || done) return null;
  return <PreloaderLine reduced={reduced} />;
}
