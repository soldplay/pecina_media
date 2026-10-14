/**
 * /datenschutz (P9, DESIGN_SPEC §4.9). Server Component, kein Canvas.
 * Nur der Platzhalter-Hinweis aus COPY.datenschutz, keine technischen oder rechtlichen
 * Behauptungen. noindex (follow bleibt), bis die gepruefte Fassung vorliegt;
 * deshalb fehlt die Seite auch in der Sitemap.
 */

import type { Metadata } from 'next';
import { Copy } from '@/components/copy/Copy';
import { LegalPage } from '@/components/legal/LegalPage';
import { COPY } from '@/content/site';

export const metadata: Metadata = {
  title: COPY.datenschutz.h1.text,
  robots: { index: false, follow: true },
};

export default function DatenschutzPage() {
  return (
    <LegalPage title={COPY.datenschutz.h1}>
      <Copy as="p" value={COPY.datenschutz.text} className="lead" />
    </LegalPage>
  );
}
