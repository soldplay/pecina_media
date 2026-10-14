/**
 * Root-404 (P9, DESIGN_SPEC §4.9). Server Component; greift fuer notFound() und
 * fuer alle unbekannten URLs. Next setzt selbst noindex.
 *
 * LegalPage-Layout dunkel (Ink-Grund): H1 „Hier wurde zu viel geschnitten.“
 * (tabIndex −1, RouteFocus fokussiert sie nach Navigation), Text, Button-Link
 * „Zur Startseite“ und darunter das Easter-Egg (NotFoundEgg, Client, lazy ueber NotFoundEggLazy:
 * das not-found steht im Payload jeder Seite, der Egg-Chunk soll nicht ins Initial-JS).
 */

import type { Metadata } from 'next';
import { Copy } from '@/components/copy/Copy';
import { LegalPage } from '@/components/legal/LegalPage';
import NotFoundEggLazy from '@/components/notfound/NotFoundEggLazy';
import { ButtonLink } from '@/components/ui/Button';
import { COPY } from '@/content/site';

export const metadata: Metadata = {
  title: COPY.notFound.code.text,
};

export default function NotFound() {
  return (
    <LegalPage title={COPY.notFound.h1} tone="dark">
      <Copy as="p" value={COPY.notFound.text} className="lead" />
      <div className="mt-8">
        <ButtonLink href="/" variant="primary" tone="dark">
          <Copy value={COPY.notFound.home} />
        </ButtonLink>
      </div>
      <NotFoundEggLazy />
    </LegalPage>
  );
}
