'use client';

/**
 * Entwurfs-Anzeige (P7, DESIGN_SPEC §4.8, §5.5).
 *
 * Liest im Client location.search; bei `?entwurf=1` setzt sie html[data-show-drafts].
 * Das CSS (Fundament, globals.css) umrandet dann alle [data-copy-status] mit Status
 * entwurf/beispiel/offen gestrichelt und zeigt ein Label. Bewusst keine Server-searchParams
 * (Cache Components: die Seiten bleiben statisch). Das Attribut bleibt fuer die Sitzung stehen.
 */

import { useEffect } from 'react';

const DRAFT_PARAM = 'entwurf';
const DRAFT_VALUE = '1';

export default function DraftMarker() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get(DRAFT_PARAM) !== DRAFT_VALUE) return;
    document.documentElement.dataset.showDrafts = '';
  }, []);

  return null;
}
