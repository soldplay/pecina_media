'use client';

/**
 * Cursor-Begleiter (P7, DESIGN_SPEC §4.4).
 *
 * - Nur bei (hover: hover) and (pointer: fine) UND Bewegung an; sonst rendert nichts.
 * - aria-hidden, z 90, pointer-events none. Der Systemcursor bleibt sichtbar (kein cursor: none).
 * - 6°-Strich 22 × 2 px (rotate(-6deg)), Paper mit mix-blend-mode difference,
 *   folgt per useSpring (stiffness 500, damping 40, mass 0.4).
 * - Ueber a, button, [data-cursor]: Strich waechst auf 56 px; Label aus data-cursor-label
 *   als Pille (Paper/Ink, Comfortaa 600, 14 px). mousedown: scaleX 1 → 1.6 → 1 in 0,25 s.
 * - Positionen laufen ueber Motion Values (kein React-Render pro Mausbewegung).
 * - JS-Budget (§6.1): Diese Datei liefert nur Styles und die Bedingung; der sichtbare Teil
 *   (CursorLayer, motion-Hooks) ist ein eigener Chunk, geladen per next/dynamic nach der
 *   Hydration und nur, wenn die Bedingung erfuellt ist.
 */

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { useUi } from '@/lib/scene/store';

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
/** Breite des Strichs; auch von CursorLayer genutzt (Wachstum auf 56 px). */
export const BAR_WIDTH_PX = 22;

const CursorLayer = dynamic(() => import('./CursorLayer'), { ssr: false });

const CURSOR_CSS = `
.pm-cursor {
  position: fixed; top: 0; left: 0; z-index: 90; pointer-events: none;
  mix-blend-mode: difference;
}
/* Mitte des Strichs liegt auf der Zeigerspitze; Drehung, Wachsen und Druck jeweils um die Mitte */
.pm-cursor__tilt {
  position: absolute; left: -${BAR_WIDTH_PX / 2}px; top: -1px;
  width: ${BAR_WIDTH_PX}px; height: 2px; transform: rotate(-6deg);
}
.pm-cursor__grow { width: 100%; height: 100%; }
.pm-cursor__bar { display: block; width: 100%; height: 100%; background: var(--color-paper); }
.pm-cursor-label {
  position: fixed; top: 0; left: 0; z-index: 90; pointer-events: none;
}
.pm-cursor-label__pill {
  display: inline-block; margin: 18px 0 0 18px; padding: 4px 12px;
  border-radius: var(--radius-pill); background: var(--color-paper); color: var(--color-ink);
  font-family: var(--font-round); font-weight: 600; font-size: 0.875rem; line-height: 1.3;
  white-space: nowrap;
}
@media (forced-colors: active) { .pm-cursor, .pm-cursor-label { display: none; } }
`;

function subscribeFinePointer(onChange: () => void): () => void {
  const mql = window.matchMedia(FINE_POINTER_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const getFinePointer = (): boolean => window.matchMedia(FINE_POINTER_QUERY).matches;
const getFinePointerServer = (): boolean => false;

export default function Cursor() {
  const finePointer = useSyncExternalStore(subscribeFinePointer, getFinePointer, getFinePointerServer);
  const motionOn = useUi((s) => s.motion === 'full');

  return (
    <>
      <style href="pm-p7-cursor" precedence="pm-p7">
        {CURSOR_CSS}
      </style>
      {finePointer && motionOn && <CursorLayer />}
    </>
  );
}
