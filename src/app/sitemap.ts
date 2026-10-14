/**
 * sitemap.xml (P9): Startseite und Impressum. /datenschutz ist ausgenommen (noindex,
 * Platzhalter). lastModified ist eine Konstante statt eines Laufzeit-Datums, damit die
 * Ausgabe deterministisch und statisch bleibt; bei inhaltlichen Aenderungen anheben.
 */

import type { MetadataRoute } from 'next';
import { SITE } from '@/content/site';

const LAST_MODIFIED = '2026-10-14';

interface RouteEntry {
  /** Pfad relativ zu SITE.url ('' = Startseite) */
  readonly path: string;
  readonly changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  readonly priority: number;
}

const ROUTES: readonly RouteEntry[] = [
  { path: '', changeFrequency: 'monthly', priority: 1 },
  { path: '/impressum', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE.url.text}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency,
    priority,
  }));
}
