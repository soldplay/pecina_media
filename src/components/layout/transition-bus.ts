/**
 * Seitenwechsel-Bus (DESIGN_SPEC §4.7) und kleine Navigations-Helfer (P7).
 *
 * TransitionLink ruft `transitionBus.close()` und navigiert erst, wenn sich
 * die Klingen geschlossen haben. PageTransition registriert sich als Handler
 * und oeffnet die Klingen selbst, sobald der neue Pathname aktiv ist.
 * Ohne registrierten Handler (z. B. vor der Hydration) erfuellt sich close()
 * sofort: die Navigation laeuft dann ohne Seitenwechsel-Animation.
 */

import type { MouseEvent } from 'react';

export interface TransitionHandler {
  /** Schliesst die Klingen; erfuellt sich, sobald der Bildschirm bedeckt ist. Idempotent. */
  readonly close: () => Promise<void>;
  /** true, solange ein Seitenwechsel laeuft (schliessen, geschlossen, oeffnen). */
  readonly isBusy: () => boolean;
}

// Registry wie setLenis im Fundament: genau ein Handler (PageTransition im Root-Layout).
let handler: TransitionHandler | null = null;

/** Registriert den Handler; die Rueckgabe meldet ihn wieder ab (nur, wenn er noch aktiv ist). */
export function registerTransitionHandler(next: TransitionHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export const transitionBus = Object.freeze({
  /** Schliesst die Klingen. Fehler im Handler blockieren die Navigation nie. */
  close(): Promise<void> {
    if (!handler) return Promise.resolve();
    return handler.close().catch(() => undefined);
  },
  /** true, solange ein Seitenwechsel laeuft; TransitionLink ignoriert dann weitere Klicks. */
  isBusy(): boolean {
    return handler?.isBusy() ?? false;
  },
});

/**
 * Normaler Linksklick ohne Modifier (Strg/Cmd/Shift/Alt, Mittelklick).
 * Tastatur-Enter auf Links loest ebenfalls einen Klick mit button 0 aus.
 */
export function isPlainLeftClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  );
}

/**
 * Relative Ziel-URL, wenn `href` intern ist und einen anderen Pathname hat
 * (dann laeuft der Seitenwechsel mit Klingen); sonst null (extern, mailto:/tel:,
 * gleicher Pathname inkl. Hash, ungueltig). Nur im Browser aufrufen.
 * Genutzt von TransitionLink und ButtonLink (P5).
 */
export function resolveTransitionTarget(href: string): string | null {
  try {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) return null;
    if (target.pathname === window.location.pathname) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/** true auf der Startseite (One-Pager mit Ankern). Nur im Browser aufrufen. */
export function isOnHome(): boolean {
  return window.location.pathname === '/';
}
