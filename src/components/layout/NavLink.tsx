'use client';

/**
 * Anker-Link der Hauptnavigation (P7, DESIGN_SPEC §4.2–§4.4).
 *
 * - href immer `/#<id>` (funktioniert ohne JS und auf Unterseiten).
 * - Auf `/`: Klick → onSelect (z. B. Menue schliessen) → scrollToTarget(id)
 *   (Lenis-Scroll mit Header-Offset, danach Fokus auf `#<id>-title`).
 * - Auf Unterseiten: onSelect, dann uebernimmt TransitionLink (Klingen, router.push('/#id')).
 * - Hover/Fokus am echten Text: `.cut-hover` (globals.css) oeffnet den Spalt in `.cut-text` und
 *   schliesst ihn wieder (600 ms); im Ruhezustand und bei reduzierter Bewegung kein Spalt.
 *   Header: 6°-Unterstrich, der sich von links nach rechts zeichnet.
 *   Menue: Eintrag x +12 px, im Spalt erscheint ein orangefarbener 6°-Strich (die „Klinge“).
 * - Keine Text-Kopien: Nummern und Striche sind dekorativ und aria-hidden.
 */

import type { MouseEvent } from 'react';
import type { NavItem } from '@/content/types';
import { scrollToTarget } from '@/lib/a11y/navigation';
import { isOnHome, isPlainLeftClick } from './transition-bus';
import { TransitionLink } from './TransitionLink';

export type NavLinkVariant = 'header' | 'menu';

interface NavLinkProps {
  readonly item: NavItem;
  readonly variant: NavLinkVariant;
  /** Wird vor dem Scrollen bzw. Navigieren aufgerufen (Menue schliessen, ohne Fokus-Rueckgabe). */
  readonly onSelect?: () => void;
}

const NAV_LINK_CSS = `
.pm-nav-link {
  position: relative; display: inline-flex; align-items: center;
  min-height: 44px; color: inherit; text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
/* inline-flex: Label-Box = Text-Box (kein Strut), damit die Klinge exakt in der Maskenmitte liegt */
.pm-nav-link__label { position: relative; display: inline-flex; }
/* Padding fuer Ober-/Unterlaengen (die Hover-Maske schneidet sonst z. B. das „p“ bei line-height 1 ab);
   Flex-Item, die negativen Raender heben es auf: Hoehe und Mitte (Klinge) bleiben gleich. */
.pm-nav-link .cut-text { display: block; padding-block: 0.15em; margin-block: -0.15em; }

/* Header: Archivo 600, wdth 75, Versalien, 14 px, Tracking 0.08em */
.pm-nav-link--header {
  padding-inline: 4px;
  font-family: var(--font-sans); font-weight: 600; font-variation-settings: 'wdth' 75;
  font-size: 0.875rem; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase;
}
/* 6°-Unterstrich: rechtes Ende knapp unter dem Text, um das rechte Ende gedreht,
   gezeichnet per clip-path von links nach rechts (scaleX-Wirkung ohne Verzerrung). */
.pm-nav-link__line {
  position: absolute; left: 0; right: 0; bottom: -4px; height: 2px;
  background: currentColor; pointer-events: none;
  transform-origin: 100% 50%; transform: rotate(-6deg);
  clip-path: inset(0 100% 0 0);
  transition: clip-path var(--dur-fast) var(--ease-out);
}
.pm-nav-link:hover .pm-nav-link__line, .pm-nav-link:focus-visible .pm-nav-link__line { clip-path: inset(0 0 0 0); }

/* Menue: Archivo 900, wdth 112, clamp(2.25rem, 7vw, 5.5rem) */
.pm-nav-link--menu {
  --pm-blade-ext: 22px;
  align-items: flex-start; gap: 1rem; min-height: 48px; padding-block: 0.06em;
  font-family: var(--font-display); font-weight: 900; font-variation-settings: 'wdth' 112;
  font-size: clamp(2.25rem, 7vw, 5.5rem); line-height: 1; letter-spacing: -0.015em;
}
.pm-nav-link__num {
  flex: none; min-width: 2.25rem; padding-top: 0.55em;
  font-family: var(--font-round); font-weight: 600; font-size: 0.875rem; line-height: 1;
  letter-spacing: 0.08em; color: var(--color-brand);
}
.pm-nav-link--menu .pm-nav-link__label { transition: transform var(--dur-fast) var(--ease-out); }
.pm-nav-link--menu:hover .pm-nav-link__label,
.pm-nav-link--menu:focus-visible .pm-nav-link__label { transform: translateX(12px); }
/* Klinge: Verlaengerung der Spaltlinie links vor dem Wort. Das Element ist symmetrisch
   um die Label-Mitte (gleiche Mitte und 6°-Winkel wie die .cut-text-Maske); sichtbar ist
   nur das linke Stueck ausserhalb des Textes, damit nichts wie durchgestrichen wirkt. */
.pm-nav-link__blade {
  position: absolute; top: 50%;
  left: calc(-1 * var(--pm-blade-ext)); right: calc(-1 * var(--pm-blade-ext));
  height: max(2px, 0.035em); margin-top: calc(max(2px, 0.035em) / -2);
  background: var(--color-brand); box-shadow: 0 0 10px rgba(255, 178, 87, 0.55);
  pointer-events: none; transform: rotate(-6deg);
  clip-path: inset(0 100% 0 0);
  transition: clip-path var(--dur-base) var(--ease-cut);
}
.pm-nav-link--menu:hover .pm-nav-link__blade,
.pm-nav-link--menu:focus-visible .pm-nav-link__blade {
  clip-path: inset(0 calc(100% - var(--pm-blade-ext) + 2px) 0 0);
}

html[data-motion='reduced'] .pm-nav-link__line,
html[data-motion='reduced'] .pm-nav-link__blade,
html[data-motion='reduced'] .pm-nav-link--menu .pm-nav-link__label { transition: none; }
html[data-motion='reduced'] .pm-nav-link--menu:hover .pm-nav-link__label,
html[data-motion='reduced'] .pm-nav-link--menu:focus-visible .pm-nav-link__label { transform: none; }
@media (forced-colors: active) {
  .pm-nav-link__blade { background: LinkText; box-shadow: none; }
}
`;

export function NavLink({ item, variant, onSelect }: NavLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event)) return;
    onSelect?.();
    // Unterseite: TransitionLink fuehrt per Seitenwechsel auf /#id.
    if (!isOnHome()) return;
    event.preventDefault();
    if (!scrollToTarget(item.id)) window.location.hash = item.id;
  };

  return (
    <>
      <style href="pm-p7-nav-link" precedence="pm-p7">
        {NAV_LINK_CSS}
      </style>
      <TransitionLink
        href={`/#${item.id}`}
        className={`pm-nav-link cut-hover pm-nav-link--${variant}`}
        onClick={handleClick}
      >
        {variant === 'menu' && (
          <span className="pm-nav-link__num" aria-hidden="true">
            {item.num}
          </span>
        )}
        <span className="pm-nav-link__label">
          <span className="cut-text" data-copy-status={item.status}>
            {item.label}
          </span>
          <span
            className={variant === 'menu' ? 'pm-nav-link__blade' : 'pm-nav-link__line'}
            aria-hidden="true"
          />
        </span>
      </TransitionLink>
    </>
  );
}
