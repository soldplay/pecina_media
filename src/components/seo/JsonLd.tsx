/**
 * JsonLd (P9): strukturierte Daten (schema.org Organization) fuer die Startseite.
 * Server Component, eingebunden in app/page.tsx. Nur belegte Stammdaten aus SITE,
 * keine Bewertungen, keine Gruendungsjahre. Keine E-Mail: SITE.contactEmail ist noch 'offen'
 * (Kundenfrage 6) und wird erst nach Freigabe als `email` veroeffentlicht.
 *
 * Der Inhalt stammt ausschliesslich aus content/site.ts (keine Nutzerdaten); `<` wird
 * trotzdem als < maskiert (Empfehlung der Next-Doku gegen Script-Injection).
 */

import { SITE } from '@/content/site';

const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.legalName,
  url: SITE.url.text,
  telephone: SITE.phone.intl,
  address: {
    '@type': 'PostalAddress',
    streetAddress: SITE.address.street,
    postalCode: SITE.address.zip,
    addressLocality: SITE.address.city,
    addressCountry: SITE.address.country,
  },
} as const;

const ORGANIZATION_JSON = JSON.stringify(ORGANIZATION).replace(/</g, '\\u003c');

export default function JsonLd() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORGANIZATION_JSON }} />;
}
