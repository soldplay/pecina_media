'use client';

/**
 * Fokus nach Routenwechsel (P7, DESIGN_SPEC §4.7, §5.8).
 *
 * Bei Pathname-Wechsel (nicht beim ersten Laden) Fokus auf die sichtbare
 * `h1[tabindex="-1"]` der neuen Seite (preventScroll), sonst auf #main.
 * Zeigt die URL auf einen Anker mit fokussierbarer Ueberschrift (`#<id>-title`),
 * bekommt diese den Fokus (PageTransition scrollt danach per scrollToTarget dorthin).
 *
 * Cache Components haelt bis zu 3 Routen per <Activity> versteckt im DOM
 * (display: none): gesucht wird deshalb nur unter gerenderten Elementen.
 * usePathname liegt in Suspense (Routen mit unbekannten Params suspendieren beim Prerendern).
 */

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

function isRendered(el: Element): boolean {
  return el.getClientRects().length > 0;
}

function hashHeading(): HTMLElement | null {
  const raw = window.location.hash.slice(1);
  if (raw === '') return null;
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const heading = document.getElementById(`${id}-title`);
  return heading && heading.hasAttribute('tabindex') && isRendered(heading) ? heading : null;
}

function focusRouteTarget(): void {
  const main = document.getElementById('main');
  const scope: ParentNode = main ?? document;
  const h1 = Array.from(scope.querySelectorAll<HTMLElement>('h1[tabindex="-1"]')).find(isRendered);
  const target = hashHeading() ?? h1 ?? main;
  target?.focus({ preventScroll: true });
}

function RouteFocusEffect() {
  const pathname = usePathname();
  const previousRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = pathname;
    if (previous === null || previous === pathname) return;
    // Einen Frame warten, bis die neue Seite gemalt ist (Activity blendet um).
    const raf = window.requestAnimationFrame(focusRouteTarget);
    return () => window.cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}

export default function RouteFocus() {
  return (
    <Suspense fallback={null}>
      <RouteFocusEffect />
    </Suspense>
  );
}
