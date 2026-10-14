/**
 * Anker-Navigation (DESIGN_SPEC §4.2, §5.8). Lenis-Instanz registriert
 * SmoothScroll (P8) per setLenis; bei reduzierter Bewegung ist sie null.
 */

import type Lenis from 'lenis';
import { HEADER_OFFSET } from '@/lib/brand';
import { ui } from '@/lib/scene/store-core';

const SCROLL_DURATION_S = 1.2;

let lenis: Lenis | null = null;

export function setLenis(instance: Lenis | null): void {
  lenis = instance;
}

export function getLenis(): Lenis | null {
  return lenis;
}

function ensureFocusable(el: HTMLElement): void {
  if (!el.hasAttribute('tabindex') && el.tabIndex < 0) el.setAttribute('tabindex', '-1');
}

/**
 * Scrollt zur Sektion `id` und fokussiert danach `#<id>-title` (sonst die
 * Sektion selbst), ohne erneut zu scrollen; setzt den Hash per replaceState.
 * Gibt false zurueck, wenn das Ziel fehlt (z. B. auf Unterseiten) — dann
 * navigiert der Aufrufer auf `/#<id>`.
 */
export function scrollToTarget(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById(id);
  if (!el) return false;
  const focusEl = document.getElementById(`${id}-title`) ?? el;

  const done = (): void => {
    ensureFocusable(focusEl);
    focusEl.focus({ preventScroll: true });
    history.replaceState(null, '', `#${id}`);
  };

  if (ui.get().motion === 'full' && lenis) {
    lenis.scrollTo(el, { offset: -HEADER_OFFSET, duration: SCROLL_DURATION_S, onComplete: done });
  } else {
    el.scrollIntoView({ block: 'start' });
    done();
  }
  return true;
}
