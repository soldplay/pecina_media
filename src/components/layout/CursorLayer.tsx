'use client';

/**
 * Cursor-Begleiter, sichtbarer Teil (P7, DESIGN_SPEC §4.4). Eigener Chunk: Cursor.tsx laedt
 * ihn per next/dynamic (ssr: false) nur bei feinem Zeiger und Bewegung an — Touch-Geraete
 * und reduzierte Bewegung laden ihn nie.
 *
 * - Folgt per useSpring (stiffness 500, damping 40, mass 0.4); Positionen ueber Motion Values
 *   (kein React-Render pro Mausbewegung).
 * - Ueber a, button, [data-cursor]: Strich waechst auf 56 px; Label aus data-cursor-label
 *   als Pille. mousedown: scaleX 1 → 1.6 → 1 in 0,25 s.
 * - Styles (.pm-cursor*) liefert Cursor.tsx.
 */

import { AnimatePresence, m, useAnimate, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';
import { BAR_WIDTH_PX } from './Cursor';

const INTERACTIVE_SELECTOR = 'a, button, [data-cursor]';
const LABEL_SELECTOR = '[data-cursor-label]';
const CURSOR_SPRING = { stiffness: 500, damping: 40, mass: 0.4 } as const;
const UI_SPRING = { type: 'spring', stiffness: 400, damping: 30 } as const;
const BAR_ACTIVE_PX = 56;
const PRESS_KEYFRAMES = [1, 1.6, 1];
const PRESS_DURATION_S = 0.25;
const OFFSCREEN_PX = -200;

interface HoverState {
  readonly active: boolean;
  readonly label: string | null;
}

const IDLE: HoverState = Object.freeze({ active: false, label: null });

function readHover(target: EventTarget | null): HoverState {
  if (!(target instanceof Element)) return IDLE;
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  const labelText = target.closest(LABEL_SELECTOR)?.getAttribute('data-cursor-label')?.trim();
  const label = labelText ? labelText : null;
  if (!interactive && !label) return IDLE;
  return { active: true, label };
}

export default function CursorLayer() {
  const x = useMotionValue(OFFSCREEN_PX);
  const y = useMotionValue(OFFSCREEN_PX);
  const springX = useSpring(x, CURSOR_SPRING);
  const springY = useSpring(y, CURSOR_SPRING);
  const [pressScope, animatePress] = useAnimate<HTMLSpanElement>();
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState<HoverState>(IDLE);

  useEffect(() => {
    const handleMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      x.set(event.clientX);
      y.set(event.clientY);
      setVisible(true);
    };
    const handleOver = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      const next = readHover(event.target);
      setHover((prev) => (prev.active === next.active && prev.label === next.label ? prev : next));
    };
    const handleOut = (event: PointerEvent): void => {
      // Zeiger verlaesst das Fenster
      if (event.relatedTarget === null) setVisible(false);
    };
    const handleDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !pressScope.current) return;
      void animatePress(
        pressScope.current,
        { scaleX: PRESS_KEYFRAMES },
        { duration: PRESS_DURATION_S, ease: 'easeOut' },
      );
    };

    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerover', handleOver, { passive: true });
    document.addEventListener('pointerout', handleOut, { passive: true });
    document.addEventListener('pointerdown', handleDown, { passive: true });
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerover', handleOver);
      document.removeEventListener('pointerout', handleOut);
      document.removeEventListener('pointerdown', handleDown);
    };
  }, [x, y, pressScope, animatePress]);

  const scaleX = hover.active ? BAR_ACTIVE_PX / BAR_WIDTH_PX : 1;

  return (
    <>
      <m.div
        className="pm-cursor"
        aria-hidden="true"
        style={{ x: springX, y: springY }}
        initial={false}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="pm-cursor__tilt">
          <m.div
            className="pm-cursor__grow"
            initial={false}
            animate={{ scaleX }}
            transition={UI_SPRING}
          >
            <span ref={pressScope} className="pm-cursor__bar" />
          </m.div>
        </div>
      </m.div>
      <m.div className="pm-cursor-label" aria-hidden="true" style={{ x: springX, y: springY }}>
        <AnimatePresence>
          {visible && hover.label !== null && (
            <m.span
              key={hover.label}
              className="pm-cursor-label__pill"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
            >
              {hover.label}
            </m.span>
          )}
        </AnimatePresence>
      </m.div>
    </>
  );
}
