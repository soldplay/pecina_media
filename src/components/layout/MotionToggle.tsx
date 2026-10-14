'use client';

/**
 * Schalter „Bewegung reduzieren“ (P7 UI, DESIGN_SPEC §4.5; Vertrag: types/contracts.ts).
 *
 * - <button aria-pressed>: true = reduziert. Zustand aus ui.motion, Umschalten ueber
 *   setMotionPreference (Fundament: speichert localStorage['pm-motion'], setzt html[data-motion]).
 * - Sichtbarer Text auf allen Breiten; zweizeilig im Header unter 1024 px, sonst unter 640 px.
 * - Schalter-Grafik: Pille mit Knopf, dessen Oberkante im 6°-Winkel geschnitten ist.
 *   Zustand auch ohne Farbe erkennbar: Knopf links/rechts und Pille leer/gefuellt.
 * - Die Grafik folgt html[data-motion] (vom Inline-Script vor dem ersten Paint gesetzt),
 *   ist also schon vor der Hydration richtig; aria-pressed folgt dem Store.
 * - Mindestens 44 × 44 px. Varianten header/menu/footer unterscheiden sich nur optisch.
 * - Umschalten aendert die Seitenhoehe: keepReadingPosition (lib/a11y/scroll-anchor.ts) haelt
 *   den Footer-Schalter bzw. (Header/Menue, fix) den gelesenen Inhaltsblock an seiner Stelle,
 *   der Fokus bleibt auf dem Schalter.
 */

import type { MouseEvent } from 'react';
import { COPY } from '@/content/site';
import { setMotionPreference } from '@/lib/a11y/motion';
import { keepReadingPosition } from '@/lib/a11y/scroll-anchor';
import { useUi } from '@/lib/scene/store';
import type { MotionToggleProps } from '@/types/contracts';

const TOGGLE_CSS = `
.pm-toggle {
  display: inline-flex; align-items: center; gap: 8px;
  min-width: 44px; min-height: 44px; padding: 4px 8px;
  background: transparent; color: inherit; border: 0; border-radius: 0; cursor: pointer;
  font-family: var(--font-sans); font-weight: 600; font-variation-settings: 'wdth' 75;
  font-size: 0.875rem; line-height: 1.15; letter-spacing: 0.02em; text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.pm-toggle__track {
  position: relative; flex: none; width: 34px; height: 20px;
  border: 1.5px solid currentColor; border-radius: var(--radius-pill);
  background: transparent; transition: background-color var(--dur-instant) linear;
}
.pm-toggle__knob {
  position: absolute; top: 50%; left: 2.5px; width: 12px; height: 12px; margin-top: -6px;
  border-radius: 50%; background: currentColor;
  /* Oberkante im 6°-Winkel geschnitten (steigt nach rechts, wie der Logo-Schnitt) */
  clip-path: polygon(0 30%, 100% 19.5%, 100% 100%, 0 100%);
  transition: transform var(--dur-fast) var(--ease-out), background-color var(--dur-instant) linear;
}
.pm-toggle__label { display: block; }
html:not([data-motion='reduced']) .pm-toggle:hover .pm-toggle__track {
  background: color-mix(in srgb, currentColor 18%, transparent);
}
html[data-motion='reduced'] .pm-toggle__track { background: currentColor; }
html[data-motion='reduced'] .pm-toggle__knob {
  transform: translateX(14px);
  background: var(--pm-toggle-contrast, var(--color-ink));
  transition-duration: 0ms, var(--dur-instant);
}
.pm-toggle--menu { font-size: 1rem; }
@media (max-width: 1023.98px) {
  .pm-toggle--header .pm-toggle__label { inline-size: min-content; }
}
/* 320 px: Logo-Plakette, Schalter und Menue-Button muessen nebeneinander passen */
@media (max-width: 399.98px) {
  .pm-toggle--header { gap: 6px; padding-inline: 4px; letter-spacing: 0; }
}
@media (max-width: 639.98px) {
  .pm-toggle--menu .pm-toggle__label, .pm-toggle--footer .pm-toggle__label { inline-size: min-content; }
  .pm-toggle--menu { font-size: 0.875rem; }
}
@media (forced-colors: active) {
  .pm-toggle__track, .pm-toggle__knob { forced-color-adjust: none; }
  .pm-toggle__track { border-color: ButtonText; background: Canvas; }
  .pm-toggle__knob { background: ButtonText; }
  html[data-motion='reduced'] .pm-toggle__track { border-color: Highlight; background: Highlight; }
  html[data-motion='reduced'] .pm-toggle__knob { background: HighlightText; }
}
`;

export function MotionToggle({ variant }: MotionToggleProps) {
  const reduced = useUi((s) => s.motion === 'reduced');

  // Die Seitenhoehe aendert sich (Runways an/aus): Lese- und Fokusposition halten.
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    const next = reduced ? 'full' : 'reduced';
    keepReadingPosition(() => setMotionPreference(next), event.currentTarget);
  };

  return (
    <>
      <style href="pm-p7-toggle" precedence="pm-p7">
        {TOGGLE_CSS}
      </style>
      <button
        type="button"
        aria-pressed={reduced}
        data-variant={variant}
        className={`pm-toggle pm-toggle--${variant}`}
        onClick={handleClick}
      >
        <span className="pm-toggle__track" aria-hidden="true">
          <span className="pm-toggle__knob" />
        </span>
        <span className="pm-toggle__label" data-copy-status={COPY.ui.meta.status}>
          {COPY.ui.motion}
        </span>
      </button>
    </>
  );
}
