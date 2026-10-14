'use client';

/**
 * Vollflaechiges Menue (P7, DESIGN_SPEC §4.3). Geoeffnet vom Header unter 1024 px.
 *
 * - id 'site-menu', role 'dialog', aria-modal, aria-label „Menü“, Ink, z 60.
 * - Einstieg: Unterkante als 6°-Linie wischt von oben nach unten
 *   (clip-path mit --menu-p 0 → 1, entspricht --y 0 → calc(100% + 10.51vw)), 0,6 s --ease-cut;
 *   eine orange Klingen-Linie laeuft auf der Kante mit. Eintraege Stagger 0,04 s (y 20 → 0).
 *   Schliessen 0,45 s. Reduced: 150 ms Crossfade, keine Bewegung.
 * - Eintraege: alle NAV-Punkte (Nummer aria-hidden), Kontakt-Kurzinfo, Schalter „Bewegung reduzieren“.
 * - Fokusfalle (Tab/Shift+Tab, focusin-Waechter), Esc schliesst, Fokus zurueck auf den Menue-Button.
 *   Inert, Lenis und ui.menuOpen steuert der Header (openMenu/closeMenu), damit beim Klick auf
 *   einen Eintrag alles synchron frei ist, bevor scrollToTarget scrollt und fokussiert.
 * - Eigener Chunk: der Header laedt diese Datei per import() erst bei Bedarf (Leerlauf unter
 *   1024 px, Zeiger/Fokus auf dem Menue-Button, spaetestens beim Oeffnen).
 */

import { AnimatePresence, m, stagger, useIsPresent, type Variants } from 'motion/react';
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Copy } from '@/components/copy/Copy';
import { COPY, NAV, SITE } from '@/content/site';
import { ui, useUi } from '@/lib/scene/store';
import { MENU_ID } from './menu-id';
import { MotionToggle } from './MotionToggle';
import { NavLink } from './NavLink';

export { MENU_ID };

interface MenuProps {
  readonly open: boolean;
  /** restoreFocus: Fokus zurueck auf den Menue-Button (Esc, Schliessen-Button); false bei Eintrag/Navigation. */
  readonly onClose: (restoreFocus: boolean) => void;
}

interface MenuVariants {
  readonly panel: Variants;
  readonly list: Variants;
  readonly item: Variants;
}

const EASE_CUT = [0.76, 0, 0.24, 1] as const;
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const OPEN_S = 0.6;
const CLOSE_S = 0.45;
const STAGGER_S = 0.04;
const STAGGER_START_S = 0.18;
const REDUCED_FADE_S = 0.15;

const FULL_VARIANTS: MenuVariants = {
  panel: {
    closed: { '--menu-p': 0, opacity: 1, transition: { duration: CLOSE_S, ease: EASE_CUT } },
    open: { '--menu-p': 1, opacity: 1, transition: { duration: OPEN_S, ease: EASE_CUT } },
  },
  list: {
    closed: { transition: { delayChildren: stagger(0.02, { from: 'last' }) } },
    open: { transition: { delayChildren: stagger(STAGGER_S, { startDelay: STAGGER_START_S }) } },
  },
  item: {
    closed: { opacity: 0, y: 20, transition: { duration: 0.2, ease: 'easeIn' } },
    open: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } },
  },
};

const REDUCED_VARIANTS: MenuVariants = {
  panel: {
    closed: { '--menu-p': 1, opacity: 0, transition: { duration: REDUCED_FADE_S, ease: 'linear' } },
    open: { '--menu-p': 1, opacity: 1, transition: { duration: REDUCED_FADE_S, ease: 'linear' } },
  },
  list: { closed: {}, open: {} },
  item: { closed: { opacity: 1, y: 0 }, open: { opacity: 1, y: 0 } },
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

const MENU_CSS = `
.pm-menu {
  --menu-p: 0;
  --pm-gutter: 16px;
  position: fixed; inset: 0; z-index: 60;
}
.pm-menu__panel {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  overflow-y: auto; overscroll-behavior: contain;
  background: var(--color-ink); color: var(--color-paper);
  clip-path: polygon(
    0 0, 100% 0,
    100% calc(var(--menu-p) * (100% + var(--cut-rise)) - var(--cut-rise)),
    0 calc(var(--menu-p) * (100% + var(--cut-rise)))
  );
}
/* Klingen-Linie auf der 6°-Unterkante waehrend des Wischens */
.pm-menu__edge {
  position: absolute; left: -5vw; width: 110vw; height: 2px; margin-top: -1px;
  top: calc(var(--menu-p) * (100% + var(--cut-rise)) - var(--cut-rise) / 2);
  background: var(--color-brand); box-shadow: 0 0 14px rgba(255, 178, 87, 0.6);
  transform: rotate(-6deg); pointer-events: none;
  opacity: min(1, calc((1 - var(--menu-p)) * 6));
}
.pm-menu__bar {
  flex: none; display: flex; align-items: center; justify-content: flex-end;
  height: var(--header-h); padding-inline: var(--pm-gutter);
}
.pm-menu__close {
  display: inline-flex; align-items: center; gap: 10px;
  min-width: 44px; min-height: 44px; padding: 0 8px;
  background: transparent; color: inherit; border: 0; cursor: pointer;
  font-family: var(--font-sans); font-weight: 600; font-variation-settings: 'wdth' 75;
  font-size: 0.875rem; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase;
}
.pm-menu__close-icon { width: 18px; height: 18px; flex: none; }
.pm-menu__nav { flex: 1 0 auto; display: flex; align-items: center; padding: 8px var(--pm-gutter) 32px; }
.pm-menu__list { display: grid; gap: clamp(0px, 0.8vh, 10px); margin: 0; padding: 0; list-style: none; }
.pm-menu__meta {
  flex: none; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 24px 32px; padding: 24px var(--pm-gutter) calc(24px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--color-line-dark);
}
.pm-menu__kicker { margin: 0 0 8px; color: var(--color-muted-dark); }
.pm-menu__contact { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 1rem; line-height: 1.5; }
.pm-menu__contact-label { color: var(--color-muted-dark); margin-inline-end: 0.4em; }
.pm-menu__contact-link {
  display: inline-flex; align-items: center; min-height: 44px; color: var(--color-paper);
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.25em;
  transition: color var(--dur-instant) linear;
}
.pm-menu__contact-link:hover { color: var(--color-brand); }
@media (min-width: 640px) { .pm-menu { --pm-gutter: 24px; } }
@media (min-width: 1024px) { .pm-menu { --pm-gutter: clamp(24px, 4vw, 64px); } }
html[data-motion='reduced'] .pm-menu__edge { display: none; }
@media (forced-colors: active) {
  .pm-menu__panel { border: 1px solid CanvasText; }
  .pm-menu__edge { display: none; }
}
`;

interface MenuPanelProps {
  readonly reduced: boolean;
  readonly onClose: (restoreFocus: boolean) => void;
}

function MenuPanel({ reduced, onClose }: MenuPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isPresent = useIsPresent();
  const variants = reduced ? REDUCED_VARIANTS : FULL_VARIANTS;

  // Beim Oeffnen den ersten bedienbaren Punkt (Schliessen-Button) fokussieren.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) focusableIn(dialog)[0]?.focus({ preventScroll: true });
  }, []);

  // Esc, Fokus-Waechter und Browser-Zurueck, solange das Menue offen ist (nicht waehrend Exit).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isPresent) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !ui.get().menuOpen) return;
      event.preventDefault();
      onClose(true);
    };
    const handleFocusIn = (event: FocusEvent): void => {
      // closeMenu setzt menuOpen vor der Fokus-Rueckgabe auf false: dann nicht eingreifen.
      if (!ui.get().menuOpen) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      focusableIn(dialog)[0]?.focus({ preventScroll: true });
    };
    const handlePopState = (): void => onClose(false);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isPresent, onClose]);

  const handleTrapKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return;
    const items = focusableIn(event.currentTarget);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSelect = (): void => onClose(false);

  return (
    <m.div
      ref={dialogRef}
      id={MENU_ID}
      role="dialog"
      aria-modal="true"
      aria-label={COPY.ui.menu}
      className="pm-menu"
      inert={!isPresent}
      variants={variants.panel}
      initial="closed"
      animate="open"
      exit="closed"
      onKeyDown={handleTrapKeyDown}
    >
      <div className="pm-menu__panel" data-lenis-prevent="">
        <div className="pm-menu__bar">
          <button type="button" className="pm-menu__close" onClick={() => onClose(true)}>
            <span data-copy-status={COPY.ui.meta.status}>{COPY.ui.menuClose}</span>
            <svg className="pm-menu__close-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path d="M2 2 L16 16 M16 2 L2 16" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </button>
        </div>

        <nav aria-label={COPY.ui.navLabel} className="pm-menu__nav">
          <m.ol className="pm-menu__list" variants={variants.list}>
            {NAV.map((item) => (
              <m.li key={item.id} variants={variants.item}>
                <NavLink item={item} variant="menu" onSelect={handleSelect} />
              </m.li>
            ))}
          </m.ol>
        </nav>

        <div className="pm-menu__meta">
          <div>
            <p className="kicker pm-menu__kicker" data-copy-status={COPY.ui.meta.status}>
              {COPY.ui.menuContact}
            </p>
            <ul className="pm-menu__contact">
              <li>
                <Copy value={COPY.kontakt.addressLabels.phone} className="pm-menu__contact-label" />
                <a href={SITE.phone.href} className="pm-menu__contact-link">
                  <Copy value={SITE.phone.display} />
                </a>
              </li>
              <li>
                <Copy value={COPY.kontakt.addressLabels.email} className="pm-menu__contact-label" />
                <a href={`mailto:${SITE.contactEmail.text}`} className="pm-menu__contact-link">
                  <Copy value={SITE.contactEmail} />
                </a>
              </li>
            </ul>
          </div>
          <MotionToggle variant="menu" />
        </div>
      </div>
      <span className="pm-menu__edge" aria-hidden="true" />
    </m.div>
  );
}

export function Menu({ open, onClose }: MenuProps) {
  const reduced = useUi((s) => s.motion === 'reduced');

  return (
    <>
      <style href="pm-p7-menu" precedence="pm-p7">
        {MENU_CSS}
      </style>
      <AnimatePresence>
        {open && <MenuPanel key={MENU_ID} reduced={reduced} onClose={onClose} />}
      </AnimatePresence>
    </>
  );
}
