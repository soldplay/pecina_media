'use client';

/**
 * Client-Inseln der Kontakt-Sektion (DESIGN_SPEC §3.7):
 *
 * - KontaktLine: 6°-Linie unter „Kontaktiere uns!“ (SVG, 3 px #D17F0C, aria-hidden).
 *   stroke-dashoffset synchron zum Schliessen der Skulptur: eigener ScrollTrigger mit
 *   demselben Bereich wie sections.kontakt ('top 85%' → 'bottom bottom'), gezeichnet
 *   zwischen Fortschritt 0,15 und 0,7. Reduced (und ohne JS): Linie gezeichnet.
 * - KontaktMailButton: primaerer Button „E-Mail schreiben“; Hover und Fokus setzen
 *   ui.ctaHover (onHoverChange). Funktionen lassen sich nicht aus Server Components
 *   uebergeben, daher lebt der Button hier.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { CUT_TAN } from '@/lib/brand';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { clamp01 } from '@/lib/scene/math';
import { ui, useUi } from '@/lib/scene/store';

/**
 * gsap.matchMedia ruft den Callback nur auf, wenn eine Bedingung zutrifft: daher beide
 * Systemzustaende. Die Nutzerwahl (ui.motion) entscheidet; die Abfrage sorgt nur dafuer,
 * dass der Aufbau bei einem Systemwechsel sofort neu laeuft.
 */
const MOTION_CONDITIONS = {
  systemReduced: '(prefers-reduced-motion: reduce)',
  systemFull: '(prefers-reduced-motion: no-preference)',
} as const;
/** Gleicher Bereich wie data-scene-range der Sektion */
const RANGE_START = 'top 85%';
const RANGE_END = 'bottom bottom';
/** Zeichnen zwischen diesen Fortschritten von sections.kontakt */
const DRAW_FROM = 0.15;
const DRAW_TO = 0.7;

/** Linie im eigenen Koordinatensystem: 352 breit, Anstieg tan 6°. */
const LINE_W = 352;
const LINE_H = Number((LINE_W * CUT_TAN).toFixed(2));
const STROKE_PX = 3;

function drawnFraction(progress: number): number {
  return clamp01((progress - DRAW_FROM) / (DRAW_TO - DRAW_FROM));
}

export interface KontaktLineProps {
  readonly className?: string;
}

export function KontaktLine({ className }: KontaktLineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const reduced = useUi((s) => s.motion === 'reduced');

  useGSAP(
    () => {
      const path = pathRef.current;
      const section = svgRef.current?.closest('section');
      if (!path || !section) return;
      const mm = gsap.matchMedia();

      mm.add(MOTION_CONDITIONS, (context) => {
        const systemReduced = context.conditions?.systemReduced === true;
        if (reduced || (ui.get().motionSource === 'system' && systemReduced)) return;

        const apply = (progress: number): void => {
          path.style.strokeDashoffset = String(1 - drawnFraction(progress));
        };
        const trigger = ScrollTrigger.create({
          trigger: section,
          start: RANGE_START,
          end: RANGE_END,
          onUpdate: (self) => apply(self.progress),
          onRefresh: (self) => apply(self.progress),
        });
        apply(trigger.progress);
        return () => {
          path.style.strokeDashoffset = '';
        };
      });
    },
    { dependencies: [reduced], revertOnUpdate: true },
  );

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${LINE_W} ${LINE_H}`}
      className={['block h-auto w-[22rem] max-w-full overflow-visible', className].filter(Boolean).join(' ')}
    >
      <path
        ref={pathRef}
        d={`M0 ${LINE_H} L${LINE_W} 0`}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={STROKE_PX}
        pathLength={1}
        strokeDasharray="1 2"
      />
    </svg>
  );
}

function setCtaHover(isHovered: boolean): void {
  ui.set({ ctaHover: isHovered });
}

export interface KontaktMailButtonProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function KontaktMailButton({ href, children, className }: KontaktMailButtonProps) {
  // Beim Verlassen der Seite keinen haengenden Hover-Zustand zuruecklassen.
  useEffect(() => () => setCtaHover(false), []);

  return (
    <ButtonLink href={href} variant="primary" tone="dark" onHoverChange={setCtaHover} className={className}>
      {children}
    </ButtonLink>
  );
}
