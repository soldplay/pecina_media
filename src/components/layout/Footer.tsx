/**
 * Footer (P7, DESIGN_SPEC §3.8), global auf allen Seiten. Server Component.
 *
 * - <footer role="contentinfo">, Ink opak, z 10, data-theme dark (Header-Theme am Seitenende).
 * - Zeile 1: SITE.legalName · Adresse, Links Impressum und Datenschutz (TransitionLink),
 *   Schalter „Bewegung reduzieren“ (Variante footer).
 * - Zeile 2: COPY.footer.credits, SITE.copyright (Konstante, kein new Date()).
 * - id 'site-footer': wird bei offenem Menue inert (Header).
 */

import { Copy, copyAttrs } from '@/components/copy/Copy';
import { COPY, SITE } from '@/content/site';
import type { CopyText } from '@/content/types';
import { MotionToggle } from './MotionToggle';
import { TransitionLink } from './TransitionLink';

interface LegalLink {
  readonly href: string;
  readonly label: CopyText;
}

const LEGAL_LINKS: readonly LegalLink[] = [
  { href: '/impressum', label: COPY.footer.legalLinks.impressum },
  { href: '/datenschutz', label: COPY.footer.legalLinks.datenschutz },
];

const FOOTER_CSS = `
.pm-footer {
  --pm-gutter: 16px;
  position: relative; z-index: 10;
  background: var(--color-ink); color: var(--color-paper);
  border-top: 1px solid var(--color-line-dark);
  padding: 40px var(--pm-gutter) calc(28px + env(safe-area-inset-bottom, 0px));
}
.pm-footer__inner { max-width: 1440px; margin-inline: auto; }
.pm-footer__row {
  display: flex; flex-direction: column; align-items: flex-start; gap: 12px 32px;
}
.pm-footer__address { margin: 0; font-style: normal; font-size: 1rem; line-height: 1.5; }
.pm-footer__sep { color: var(--color-muted-dark); }
.pm-footer__links { display: flex; flex-wrap: wrap; gap: 0 24px; margin: 0; padding: 0; list-style: none; }
.pm-footer__link { display: inline-flex; align-items: center; min-height: 44px; color: var(--color-paper); }
/* Unterstrich am Text selbst (inline-block erbt keine Dekoration vom Link).
   Spalt nur transient ueber .cut-hover am Link (globals.css: oeffnen → schliessen);
   Padding mit negativem Rand, damit die Hover-Maske Unterlaenge und Unterstrich nicht abschneidet. */
.pm-footer__link .cut-text {
  display: inline-block; padding-block: 0.15em; margin-block: -0.15em;
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.25em;
  transition: color var(--dur-instant) linear;
}
.pm-footer__link:hover .cut-text, .pm-footer__link:focus-visible .cut-text { color: var(--color-brand); }
.pm-footer__meta {
  display: flex; flex-direction: column; gap: 4px 32px;
  margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--color-line-dark);
  color: var(--color-muted-dark); font-size: 0.9375rem; line-height: 1.5;
}
.pm-footer__meta p { margin: 0; }
@media (min-width: 640px) { .pm-footer { --pm-gutter: 24px; } }
@media (min-width: 1024px) {
  .pm-footer { --pm-gutter: clamp(24px, 4vw, 64px); padding-top: 48px; }
  .pm-footer__row { flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .pm-footer__meta { flex-direction: row; justify-content: space-between; flex-wrap: wrap; }
}
html[data-motion='reduced'] .pm-footer__link .cut-text { transition: none; }
`;

export default function Footer() {
  return (
    <>
      <style href="pm-p7-footer" precedence="pm-p7">
        {FOOTER_CSS}
      </style>
      <footer id="site-footer" role="contentinfo" data-theme="dark" className="pm-footer">
        <div className="pm-footer__inner">
          <div className="pm-footer__row">
            <address className="pm-footer__address">
              <span>{SITE.legalName}</span>{' '}
              <span className="pm-footer__sep" aria-hidden="true">
                ·
              </span>{' '}
              <Copy value={SITE.address.display} />
            </address>
            <ul className="pm-footer__links">
              {LEGAL_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <TransitionLink href={href} className="pm-footer__link cut-hover">
                    <span className="cut-text" {...copyAttrs(label)}>
                      {label.text}
                    </span>
                  </TransitionLink>
                </li>
              ))}
            </ul>
            <MotionToggle variant="footer" />
          </div>
          <div className="pm-footer__meta">
            <Copy value={COPY.footer.credits} as="p" />
            <p>{SITE.copyright}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
