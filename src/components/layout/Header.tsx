'use client';

/**
 * Header (P7, DESIGN_SPEC §4.2). Fixed, z 50, Hoehe 72 / 60 px, immer sichtbar; Ausnahme: bei
 * Viewport-Hoehe ≤ 480 px (400 % Zoom, Smartphone quer) absolut oben, er scrollt mit.
 *
 * - Theme aus der Sektion unter dem Header: IntersectionObserver auf [data-theme]
 *   (rootMargin '0px 0px -95% 0px') → ui.set({ headerTheme }). Die Papierwand
 *   ([data-covers-canvas]) zaehlt als hell, verschachtelte [data-theme] gewinnen.
 *   dunkel: Verlauf Ink 85 % → transparent, Text Paper; hell: Paper 94 %, Text Ink; Wechsel 200 ms.
 * - Links LogoPlate. Ab 1024 px <nav aria-label="Hauptnavigation"> (NAV.inHeader) und Schalter.
 *   Darunter Schalter (zweizeilig) und Button „Menü“ (aria-expanded, aria-controls site-menu).
 * - Menue oeffnen/schliessen: Skip-Link, #main, Footer und Header inert, Lenis stop/start (ohne Lenis
 *   Scroll-Sperre per overflow), ui.menuOpen (→ Governor frameloop 'never').
 * - JS-Budget (§6.1): Das Menue ist ein eigener Chunk (dynamisches import(), kein SSR — es ist
 *   geschlossen ohnehin leer). Geladen wird es, sobald es absehbar gebraucht wird: im Leerlauf
 *   unter 1024 px (Menue-Button sichtbar), bei Zeiger/Fokus auf dem Button, spaetestens beim
 *   Oeffnen. Bewusst ohne React.lazy/next/dynamic: deren erster Render suspendiert immer, und
 *   React 19 drosselt das Aufdecken danach um bis zu 300 ms. Geladen bleibt es eingehaengt
 *   (AnimatePresence braucht es fuer die Schliess-Animation). Schlaegt das Laden fehl, schliesst
 *   ein angefordertes Menue sofort wieder (kein inert/Scroll-Sperre ohne Dialog); der naechste
 *   Versuch laedt erneut.
 * - usePathname nur in einer Suspense-Blattkomponente (cacheComponents: Routen mit
 *   unbekannten Params suspendieren sonst den ganzen Header beim Prerendern).
 */

import { usePathname } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { COPY, NAV } from '@/content/site';
import { getLenis } from '@/lib/a11y/navigation';
import { ui, useUi, type UiState } from '@/lib/scene/store';
import { MENU_ID } from './menu-id';
import { MotionToggle } from './MotionToggle';
import { NavLink } from './NavLink';
import { LogoPlate } from './LogoPlate';
import { SKIP_LINK_WRAPPER_ID } from './SkipLink';

type MenuComponent = typeof import('./Menu').Menu;

/** Breite, in der der Menue-Button sichtbar ist (HEADER_CSS: ab 1024 px ausgeblendet). */
const MENU_BUTTON_QUERY = '(max-width: 1023.98px)';
/** Ohne requestIdleCallback (Safari): Laden kurz nach der Hydration. */
const IDLE_FALLBACK_MS = 1500;
const IDLE_TIMEOUT_MS = 3000;

/** Auf schmalen Fenstern (Menue-Button sichtbar) das Menue im Leerlauf laden. */
function useIdleMenuLoad(load: () => void): void {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia(MENU_BUTTON_QUERY).matches) return;
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => load(), { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(handle);
    }
    const id = window.setTimeout(load, IDLE_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [load]);
}

type HeaderTheme = UiState['headerTheme'];

const HEADER_ID = 'site-header';
/** Ids der Bereiche, die bei offenem Menue inert werden (Footer: Footer.tsx, Skip-Link: SkipLink.tsx). */
const INERT_IDS = [SKIP_LINK_WRAPPER_ID, 'main', HEADER_ID, 'site-footer'] as const;
const THEME_ROOT_MARGIN = '0px 0px -95% 0px';
const THEME_SELECTOR = '[data-theme], [data-covers-canvas]';
const HEADER_NAV = NAV.filter((item) => item.inHeader);
/** Nach einem Bewegungs-Wechsel bei offenem Menue: neue Lenis-Instanz (P8) erneut stoppen. */
const RELOCK_DELAY_MS = 50;

const HEADER_CSS = `
.pm-header {
  --pm-gutter: 16px;
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  height: var(--header-h);
  color: var(--color-paper);
  transition: color var(--dur-fast) linear;
}
/* dunkel: Ink 85 % ueber der Textzeile, darunter Auslauf nach transparent */
.pm-header::before {
  content: ''; position: absolute; z-index: -1; left: 0; right: 0; top: 0;
  height: calc(100% + 28px); pointer-events: none;
  background: linear-gradient(to bottom,
    rgba(14, 14, 14, 0.85) 0%, rgba(14, 14, 14, 0.85) 58%, rgba(14, 14, 14, 0) 100%);
  transition: opacity var(--dur-fast) linear;
}
/* hell: Paper 94 % */
.pm-header::after {
  content: ''; position: absolute; z-index: -1; inset: 0; pointer-events: none;
  background: rgba(244, 241, 234, 0.94);
  border-bottom: 1px solid var(--color-line-light);
  opacity: 0; transition: opacity var(--dur-fast) linear;
}
.pm-header[data-header-theme='light'] { color: var(--color-ink); --pm-toggle-contrast: var(--color-paper); }
.pm-header[data-header-theme='light']::before { opacity: 0; }
.pm-header[data-header-theme='light']::after { opacity: 1; }
.pm-header[data-header-theme='light'] :focus-visible { outline-color: var(--color-ink); }
.pm-header__inner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  height: 100%; padding-inline: var(--pm-gutter);
}
.pm-header__nav { display: none; margin-inline-start: auto; }
.pm-header__nav-list { display: flex; align-items: center; gap: clamp(8px, 1.6vw, 28px); margin: 0; padding: 0; list-style: none; }
.pm-header__tools { display: flex; align-items: center; gap: 4px; }
.pm-header__menu-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; min-height: 44px; padding: 0 8px;
  background: transparent; color: inherit; border: 0; cursor: pointer;
  font-family: var(--font-sans); font-weight: 600; font-variation-settings: 'wdth' 75;
  font-size: 0.875rem; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase;
  -webkit-tap-highlight-color: transparent;
}
/* 320 px: 16 px Gutter + Plakette 114 px + Schalter ~108 px + Menue-Button ~45 px */
@media (max-width: 399.98px) {
  .pm-header__inner { gap: 6px; }
  .pm-header__tools { gap: 0; }
  .pm-header__menu-btn { padding-inline: 4px; }
}
@media (min-width: 640px) {
  .pm-header { --pm-gutter: 24px; }
  .pm-header__tools { gap: 12px; }
}
@media (min-width: 1024px) {
  .pm-header { --pm-gutter: clamp(24px, 4vw, 64px); }
  .pm-header__nav { display: block; }
  .pm-header__menu-btn { display: none; }
  .pm-header__inner { gap: clamp(16px, 2.4vw, 40px); }
}
/*
 * Niedrige Viewports (≤ 480 px Hoehe, z. B. 400 % Zoom bei 1280 × 1024 oder Smartphone quer): Header
 * scrollt mit, statt 23 % der Hoehe zu belegen und fokussierte Elemente zu verdecken (WCAG 2.4.11/2.4.12).
 * Gleiche Grenze wie scroll-padding-top in globals.css.
 */
@media (max-height: 480px) {
  .pm-header { position: absolute; }
}
html[data-motion='reduced'] .pm-header,
html[data-motion='reduced'] .pm-header::before,
html[data-motion='reduced'] .pm-header::after { transition-duration: var(--dur-instant); }
@media (forced-colors: active) {
  .pm-header::before, .pm-header::after { background: Canvas; opacity: 1; }
  .pm-header { border-bottom: 1px solid CanvasText; }
}
`;

function themeOf(el: Element): HeaderTheme {
  const theme = el.getAttribute('data-theme');
  if (theme === 'light' || theme === 'dark') return theme;
  // Papierwand ohne eigenes data-theme: Paper-Grund
  return el.hasAttribute('data-covers-canvas') ? 'light' : 'dark';
}

/** Das in Dokument-Reihenfolge letzte Element gewinnt (verschachtelte vor aeusseren). */
function pickLast(elements: ReadonlySet<Element>): Element | null {
  return Array.from(elements).reduce<Element | null>(
    (last, el) =>
      !last || last.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING ? el : last,
    null,
  );
}

/** Beobachtet [data-theme] unter dem Header; neu aufgebaut bei jedem Routenwechsel. */
function HeaderThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    let intersecting: ReadonlySet<Element> = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        const next = new Set(intersecting);
        entries.forEach((entry) => {
          if (entry.isIntersecting) next.add(entry.target);
          else next.delete(entry.target);
        });
        intersecting = next;
        const winner = pickLast(intersecting);
        if (winner) ui.set({ headerTheme: themeOf(winner) });
      },
      { rootMargin: THEME_ROOT_MARGIN, threshold: 0 },
    );
    document.querySelectorAll(THEME_SELECTOR).forEach((el) => {
      if (!el.closest(`#${HEADER_ID}, #${MENU_ID}`)) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}

function setChromeInert(inert: boolean): void {
  INERT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.inert = inert;
  });
}

export default function Header() {
  const theme = useUi((s) => s.headerTheme);
  const menuOpen = useUi((s) => s.menuOpen);
  const motionPref = useUi((s) => s.motion);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** overflow-Wert von <html> vor der Scroll-Sperre (nur ohne Lenis), sonst null. */
  const savedOverflowRef = useRef<string | null>(null);
  /** Menue aus dem eigenen Chunk; null bis zum ersten erfolgreichen Laden. */
  const [LoadedMenu, setLoadedMenu] = useState<MenuComponent | null>(null);
  /** Laufendes bzw. erfolgreiches Laden; null = (erneut) laden erlaubt. */
  const menuLoadRef = useRef<Promise<void> | null>(null);

  const lockScroll = useCallback((): void => {
    const lenis = getLenis();
    if (lenis) {
      lenis.stop();
      return;
    }
    if (savedOverflowRef.current !== null) return;
    const root = document.documentElement;
    savedOverflowRef.current = root.style.overflow;
    root.style.overflow = 'hidden';
  }, []);

  const unlockScroll = useCallback((): void => {
    getLenis()?.start();
    if (savedOverflowRef.current === null) return;
    document.documentElement.style.overflow = savedOverflowRef.current;
    savedOverflowRef.current = null;
  }, []);

  const closeMenu = useCallback(
    (restoreFocus: boolean): void => {
      if (!ui.get().menuOpen) return;
      // Reihenfolge: erst Zustand, dann inert/Lenis frei, dann Fokus — alles synchron,
      // damit ein anschliessendes scrollToTarget scrollen und fokussieren kann.
      ui.set({ menuOpen: false });
      setChromeInert(false);
      unlockScroll();
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    },
    [unlockScroll],
  );

  const loadMenu = useCallback((): void => {
    if (menuLoadRef.current) return;
    menuLoadRef.current = import('./Menu').then(
      (mod) => setLoadedMenu(() => mod.Menu),
      () => {
        // Chunk nicht ladbar (z. B. offline): naechster Versuch laedt erneut; ein bereits
        // angefordertes Menue schliesst wieder, damit nichts inert/gesperrt bleibt.
        menuLoadRef.current = null;
        closeMenu(true);
      },
    );
  }, [closeMenu]);

  useIdleMenuLoad(loadMenu);

  const openMenu = useCallback((): void => {
    if (ui.get().menuOpen) return;
    loadMenu();
    setChromeInert(true);
    lockScroll();
    ui.set({ menuOpen: true });
  }, [loadMenu, lockScroll]);

  // Bewegung bei offenem Menue umgeschaltet: P8 baut Lenis neu auf bzw. ab → Sperre erneuern.
  useEffect(() => {
    if (!menuOpen) return;
    const id = window.setTimeout(lockScroll, RELOCK_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [menuOpen, motionPref, lockScroll]);

  // Sicherheitsnetz beim Unmount (Root-Layout, praktisch nie): nichts gesperrt zuruecklassen.
  useEffect(
    () => () => {
      if (!ui.get().menuOpen) return;
      ui.set({ menuOpen: false });
      setChromeInert(false);
      unlockScroll();
    },
    [unlockScroll],
  );

  return (
    <>
      <style href="pm-p7-header" precedence="pm-p7">
        {HEADER_CSS}
      </style>
      <header id={HEADER_ID} className="pm-header" data-header-theme={theme}>
        <div className="pm-header__inner">
          <LogoPlate />
          <nav aria-label={COPY.ui.navLabel} className="pm-header__nav">
            <ul className="pm-header__nav-list">
              {HEADER_NAV.map((item) => (
                <li key={item.id}>
                  <NavLink item={item} variant="header" />
                </li>
              ))}
            </ul>
          </nav>
          <div className="pm-header__tools">
            <MotionToggle variant="header" />
            <button
              ref={triggerRef}
              type="button"
              className="pm-header__menu-btn"
              aria-expanded={menuOpen}
              aria-controls={MENU_ID}
              onClick={openMenu}
              onPointerEnter={loadMenu}
              onFocus={loadMenu}
            >
              <span data-copy-status={COPY.ui.meta.status}>{COPY.ui.menu}</span>
            </button>
          </div>
        </div>
      </header>
      {LoadedMenu && <LoadedMenu open={menuOpen} onClose={closeMenu} />}
      <Suspense fallback={null}>
        <HeaderThemeSync />
      </Suspense>
    </>
  );
}
