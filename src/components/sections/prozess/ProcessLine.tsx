'use client';

/**
 * Prozess-Linie (DESIGN_SPEC §3.5), dekorativ (aria-hidden). Liegt als absolutes SVG (1 x 1 px,
 * overflow sichtbar, Koordinaten in px ab der linken oberen Ecke; 0 x 0 rendert Chrome nicht,
 * eine volle Ueberdeckung stoert die Kontrastpruefung des Textes) im Eltern-Container der
 * <ol class="process"> und liest dort die Schritte:
 * - `[data-process-step]`: <li> je Schritt (bekommt data-active und aria-current="step")
 * - `[data-process-anchor]`: Punkt am Kopf des Schritts, durch den die Linie laeuft
 *
 * Desktop: gerade 6°-Linie durch die versetzten Schritte. Mobil: vertikale Linie mit
 * 6°-Ticks. stroke-dashoffset per Scrub ('top 70%' → 'bottom 60%'), Strich #D17F0C 3 px.
 * Aktiver Schritt per ScrollTrigger je Schritt ('top 60%'). Kein Opacity-Wechsel.
 * Reduced: Linie voll gezeichnet, alle Schritte gleich hervorgehoben, kein aria-current.
 */
import { useEffect, useRef, useState } from 'react';
import { CUT_TAN } from '@/lib/brand';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { ui, useUi } from '@/lib/scene/store';

const DESKTOP_QUERY = '(min-width: 1024px)';
/**
 * gsap.matchMedia ruft den Callback nur auf, wenn eine Bedingung zutrifft: daher beide
 * Systemzustaende. Die Nutzerwahl (ui.motion) entscheidet; die Abfrage sorgt nur dafuer,
 * dass der Aufbau bei einem Systemwechsel sofort neu laeuft.
 */
const MOTION_CONDITIONS = {
  systemReduced: '(prefers-reduced-motion: reduce)',
  systemFull: '(prefers-reduced-motion: no-preference)',
} as const;
const STEP_SELECTOR = '[data-process-step]';
const ANCHOR_SELECTOR = '[data-process-anchor]';
/** x der vertikalen Linie (mobil), passend zu pl-10 der Liste */
const MOBILE_LINE_X = 12;
/** halbe Tick-Laenge (mobil) */
const TICK_HALF = 10;
const STROKE_PX = 3;

interface Geometry {
  readonly line: string;
  readonly ticks: string;
}

/** Platzhalter, bis gemessen ist (Pfad der Laenge 0, zeichnet nichts). */
const EMPTY_GEOMETRY: Geometry = { line: 'M0 0', ticks: '' };

interface Offset {
  readonly x: number;
  readonly y: number;
}

const r1 = (v: number): string => v.toFixed(1);

/** Layout-Position relativ zum Container (offset*-Kette, unabhaengig von Reveal-Transforms). */
function offsetWithin(el: HTMLElement, container: HTMLElement): Offset {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
  }
  if (node === container) return { x, y };
  const a = el.getBoundingClientRect();
  const b = container.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top };
}

function measure(root: HTMLElement): Geometry {
  const anchors = Array.from(root.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR)).map((a) => offsetWithin(a, root));
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last || anchors.length < 2) return EMPTY_GEOMETRY;

  if (window.matchMedia(DESKTOP_QUERY).matches) {
    const dx = last.x - first.x;
    const slope = dx === 0 ? -CUT_TAN : (last.y - first.y) / dx;
    const yAt = (x: number): number => first.y + slope * (x - first.x);
    const width = root.clientWidth;
    return { line: `M0 ${r1(yAt(0))} L${r1(width)} ${r1(yAt(width))}`, ticks: '' };
  }

  const x = MOBILE_LINE_X;
  const dy = TICK_HALF * CUT_TAN;
  const ticks = anchors
    .map((a) => `M${r1(x - TICK_HALF)} ${r1(a.y + dy)} L${r1(x + TICK_HALF)} ${r1(a.y - dy)}`)
    .join(' ');
  return { line: `M${x} ${r1(first.y)} L${x} ${r1(root.clientHeight)}`, ticks };
}

function setActiveStep(steps: readonly HTMLElement[], activeIndex: number): void {
  steps.forEach((step, i) => {
    if (i === activeIndex) {
      step.dataset.active = 'true';
      step.setAttribute('aria-current', 'step');
    } else {
      delete step.dataset.active;
      step.removeAttribute('aria-current');
    }
  });
}

function setAllSteps(steps: readonly HTMLElement[]): void {
  steps.forEach((step) => {
    step.dataset.active = 'true';
    step.removeAttribute('aria-current');
  });
}

function clearSteps(steps: readonly HTMLElement[]): void {
  steps.forEach((step) => {
    delete step.dataset.active;
    step.removeAttribute('aria-current');
  });
}

/** Letzter Schritt, dessen Start ('top 60%') ueberscrollt ist; -1 = keiner. */
function lastPassed(triggers: readonly ScrollTrigger[]): number {
  return triggers.reduce((found, t, i) => (t.scroll() >= t.start ? i : found), -1);
}

export default function ProcessLine() {
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const [geometry, setGeometry] = useState<Geometry>(EMPTY_GEOMETRY);
  const reduced = useUi((s) => s.motion === 'reduced');

  // Geometrie messen: ResizeObserver feuert einmal nach observe() und bei jeder Groessenaenderung.
  useEffect(() => {
    const root = svgRef.current?.parentElement;
    if (!root) return;
    let disposed = false;
    const update = (): void => {
      if (!disposed) setGeometry(measure(root));
    };
    const observer = new ResizeObserver(update);
    observer.observe(root);
    void document.fonts.ready.then(update);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  useGSAP(
    () => {
      const root = svgRef.current?.parentElement;
      const line = lineRef.current;
      if (!root || !line) return;
      const steps = Array.from(root.querySelectorAll<HTMLElement>(STEP_SELECTOR));
      const mm = gsap.matchMedia();

      mm.add(MOTION_CONDITIONS, (context) => {
        const systemReduced = context.conditions?.systemReduced === true;
        const isReduced = reduced || (ui.get().motionSource === 'system' && systemReduced);

        if (isReduced) {
          setAllSteps(steps);
          return () => clearSteps(steps);
        }

        gsap.fromTo(
          line,
          { strokeDashoffset: 1 },
          {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top 70%', end: 'bottom 60%', scrub: true },
          },
        );

        const triggers: ScrollTrigger[] = [];
        const sync = (): void => setActiveStep(steps, lastPassed(triggers));
        steps.forEach((step) => {
          triggers.push(
            ScrollTrigger.create({
              trigger: step,
              start: 'top 60%',
              end: 'bottom top',
              onToggle: sync,
              onRefresh: sync,
            }),
          );
        });
        sync();
        return () => clearSteps(steps);
      });
    },
    { dependencies: [reduced], revertOnUpdate: true },
  );

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible"
    >
      <path
        ref={lineRef}
        d={geometry.line}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={STROKE_PX}
        pathLength={1}
        strokeDasharray="1 2"
      />
      {geometry.ticks && (
        <path d={geometry.ticks} fill="none" stroke="var(--color-brand)" strokeWidth={STROKE_PX} />
      )}
    </svg>
  );
}
