'use client';

/**
 * 6°-Linie unter der H3 eines Schwerpunkts (P5, DESIGN_SPEC §3.3.0 „Beat-Kopplung“).
 *
 * Eigener ScrollTrigger auf dem umgebenden <article> mit dem Beat-Bereich
 * ('top 60%' → 'bottom 80%'). Ab Fortschritt 0,85 (Beat a, Ende Schnitt 1) bzw.
 * 0,8 (Beat b, Ende Schnitt 2) zeichnet sich die Linie: scaleX 0 → 1, 350 ms, einmalig.
 * Ohne JS und bei reduzierter Bewegung ist sie sofort sichtbar. aria-hidden.
 */

import { useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { useUi } from '@/lib/scene/store';

export interface CutUnderlineProps {
  readonly beat: 'a' | 'b';
}

const THRESHOLD: Readonly<Record<CutUnderlineProps['beat'], number>> = { a: 0.85, b: 0.8 };
const DRAW_DURATION_S = 0.35;
/** 160 × tan 6° ≈ 16,8: die Linie steigt wie der Logo-Schnitt nach rechts. */
const VIEW_W = 160;
const VIEW_H = 20;

const UNDERLINE_CSS = `
.pm-cut-underline { display: block; width: 10rem; max-width: 60%; margin: 0.75rem 0 1rem; color: var(--color-brand); }
.pm-cut-underline__line { display: block; transform-origin: 0% 50%; }
.pm-cut-underline svg { display: block; width: 100%; height: auto; overflow: visible; }
`;

export function CutUnderline({ beat }: CutUnderlineProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motion = useUi((s) => s.motion);
  const drawnRef = useRef(false);

  useGSAP(
    (context) => {
      const root = ref.current;
      const line = root?.querySelector<HTMLElement>('.pm-cut-underline__line');
      const article = root?.closest('article');
      if (!root || !line || !article || motion !== 'full' || drawnRef.current) return;

      const threshold = THRESHOLD[beat];

      /** Zeichnet einmalig und beendet den Trigger. */
      const drawOnce = (self: ScrollTrigger): void => {
        if (self.progress < threshold) return;
        self.kill();
        if (drawnRef.current) return;
        drawnRef.current = true;
        context.add(() => {
          gsap.to(line, { scaleX: 1, duration: DRAW_DURATION_S, ease: 'power2.out' });
        });
      };

      gsap.set(line, { scaleX: 0 });
      const trigger = ScrollTrigger.create({
        trigger: article,
        start: 'top 60%',
        end: 'bottom 80%',
        onUpdate: drawOnce,
      });
      // Bereits ueber der Schwelle (z. B. Reload mitten in der Seite): sofort zeichnen.
      drawOnce(trigger);
    },
    { dependencies: [motion, beat], revertOnUpdate: true },
  );

  return (
    <span ref={ref} className="pm-cut-underline" aria-hidden="true">
      <style href="pm-p5-cut-underline" precedence="pm-p5">
        {UNDERLINE_CSS}
      </style>
      <span className="pm-cut-underline__line">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} focusable="false">
          <line
            x1={1}
            y1={18.8}
            x2={VIEW_W - 1}
            y2={2.2}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="square"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </span>
    </span>
  );
}
