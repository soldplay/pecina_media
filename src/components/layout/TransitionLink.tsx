'use client';

/**
 * TransitionLink (P7, DESIGN_SPEC §4.7; Vertrag: types/contracts.ts).
 *
 * next/link mit onNavigate: Bei internen Routen mit anderem Pathname wird die
 * Navigation angehalten, die Klingen schliessen sich (transitionBus.close())
 * und erst danach folgt router.push/replace. Alles andere (externe Ziele,
 * gleicher Pathname inkl. Hash, Modifier-Klicks, neue Tabs) bleibt normales
 * Link-Verhalten. Browser-Zurueck laeuft ohne Transition (kein onNavigate).
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TransitionLinkProps } from '@/types/contracts';
import { resolveTransitionTarget, transitionBus } from './transition-bus';

type Href = TransitionLinkProps['href'];
type QueryInput = Exclude<Extract<Href, object>['query'], string | null | undefined>;
type QueryValue = QueryInput[string];

function queryToSearch(query: QueryInput): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]: [string, QueryValue]) => {
    if (value === null || value === undefined) return;
    const values = Array.isArray(value) ? value : [value];
    values.forEach((v) => params.append(key, String(v)));
  });
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

/** Formatiert href (String oder UrlObject) als relative URL fuer den Router. */
function hrefToString(href: Href): string {
  if (typeof href === 'string') return href;
  if (href.href) return href.href;
  const pathname = href.pathname ?? '';
  const search =
    href.search ??
    (typeof href.query === 'string'
      ? `?${href.query.replace(/^\?/, '')}`
      : href.query
        ? queryToSearch(href.query)
        : '');
  const hash = href.hash ? `#${href.hash.replace(/^#/, '')}` : '';
  return `${pathname}${search}${hash}`;
}

export function TransitionLink({ children, href, replace, scroll, ...rest }: TransitionLinkProps) {
  const router = useRouter();

  const handleNavigate = (event: { preventDefault: () => void }): void => {
    const target = resolveTransitionTarget(hrefToString(href));
    if (target === null) return;
    event.preventDefault();
    // Laeuft bereits ein Seitenwechsel, keinen zweiten starten (Doppelklick, Enter-Wiederholung).
    if (transitionBus.isBusy()) return;
    const options = { scroll: scroll !== false };
    void transitionBus.close().then(() => {
      if (replace) router.replace(target, options);
      else router.push(target, options);
    });
  };

  return (
    <Link href={href} replace={replace} scroll={scroll} onNavigate={handleNavigate} {...rest}>
      {children}
    </Link>
  );
}
