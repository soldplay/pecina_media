'use client';

/**
 * SplitReveal (P5, DESIGN_SPEC §2.5, §3.3.0; Vertrag: types/contracts.ts).
 *
 * Zeilen-Reveal mit GSAP SplitText: erst nach document.fonts.ready splitten
 * (type 'lines', mask 'lines', autoSplit, aria 'auto'), Zeilen yPercent 110 → 0,
 * 0,8 s expo.out, Stagger 0,06, Trigger 'top 75%', einmal.
 * - SplitText kommt per loadSplitText() als eigener Chunk (nicht im Initial-JS);
 *   bis dahin bzw. bei einem Ladefehler steht der Text statisch.
 * - Nur bei Bewegung; useGSAP mit Dependency motion baut bei einem Wechsel neu auf.
 * - Liegt das Element beim Aufbau schon oberhalb von 75 % des Viewports, bleibt es statisch.
 * - Ohne JS bzw. bei reduzierter Bewegung steht der Text unveraendert im DOM.
 * - Die Zeilen sind <span> (gueltig in Ueberschriften), per CSS als Block gesetzt.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import type { CopyAttrs } from '@/components/copy/Copy';
import { gsap, loadSplitText, useGSAP } from '@/lib/gsap';
import { useUi } from '@/lib/scene/store';

export type SplitRevealTag = 'p' | 'div' | 'span' | 'h2' | 'h3' | 'li' | 'blockquote';

export interface SplitRevealProps extends Partial<CopyAttrs> {
  as?: SplitRevealTag;
  children: ReactNode;
  className?: string;
  id?: string;
}

const START = 'top 75%';
const VIEWPORT_START_RATIO = 0.75;
const DURATION_S = 0.8;
const STAGGER_S = 0.06;
const FROM_Y_PERCENT = 110;
const LINE_CLASS = 'pm-split-line';

const SPLIT_CSS = `
.pm-split .${LINE_CLASS}, .pm-split .${LINE_CLASS}-mask { display: block; }
.pm-split .${LINE_CLASS}-mask { padding-bottom: 0.08em; margin-bottom: -0.08em; }
`;

export function SplitReveal({ as: Tag = 'p', children, className, id, ...attrs }: SplitRevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const setRef = useCallback((node: HTMLElement | null) => {
    ref.current = node;
  }, []);
  const motion = useUi((s) => s.motion);

  useGSAP(
    (context) => {
      const el = ref.current;
      if (!el || motion !== 'full') return;
      if (el.getBoundingClientRect().top < window.innerHeight * VIEWPORT_START_RATIO) return;

      let cancelled = false;
      // SplitText laedt als eigener Chunk parallel zu den Schriften (lib/gsap.ts).
      void Promise.all([document.fonts.ready, loadSplitText()]).then(([, SplitText]) => {
        if (cancelled) return;
        context.add(() => {
          SplitText.create(el, {
            type: 'lines',
            mask: 'lines',
            autoSplit: true,
            aria: 'auto',
            tag: 'span',
            linesClass: LINE_CLASS,
            // Bei autoSplit (Resize, Font-Wechsel) neu erzeugt; SplitText uebernimmt den Fortschritt.
            onSplit: (self) =>
              gsap.from(self.lines, {
                yPercent: FROM_Y_PERCENT,
                duration: DURATION_S,
                ease: 'expo.out',
                stagger: STAGGER_S,
                scrollTrigger: { trigger: el, start: START, once: true },
              }),
          });
        });
      }).catch(() => {
        // Chunk nicht ladbar (z. B. offline): Text bleibt wie ohne JS statisch sichtbar.
      });

      return () => {
        cancelled = true;
      };
    },
    { dependencies: [motion], revertOnUpdate: true },
  );

  return (
    <>
      <style href="pm-p5-split" precedence="pm-p5">
        {SPLIT_CSS}
      </style>
      <Tag ref={setRef} id={id} className={className ? `pm-split ${className}` : 'pm-split'} {...attrs}>
        {children}
      </Tag>
    </>
  );
}
