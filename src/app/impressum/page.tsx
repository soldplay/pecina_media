/**
 * /impressum (P9, DESIGN_SPEC §4.9). Server Component, kein Canvas.
 *
 * - Zeilen wortgetreu aus COPY.impressum.lines (BRIEF §1.4), Reihenfolge und Schreibweise
 *   unveraendert, ohne Bankverbindung. Telefon als tel:-Link, E-Mail als mailto:-Link;
 *   der sichtbare Text jeder Zeile bleibt identisch.
 * - Darunter der offene Hinweis (Kasten, 1 px Ink-Rahmen, data-copy-status offen).
 * - Credits: die 4 verwendeten Modelle und das HDRI (Poly Haven, CC0) sowie die Schriften
 *   (SIL Open Font License), Quelle web/CREDITS.md ueber COPY.impressum.credits.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Copy, copyAttrs } from '@/components/copy/Copy';
import { LegalLink, LegalPage } from '@/components/legal/LegalPage';
import { COPY, SITE } from '@/content/site';

export const metadata: Metadata = {
  title: COPY.impressum.h1.text,
};

const { lines, openNote, creditsTitle, credits } = COPY.impressum;

/** Endet eine Zeile auf Telefonnummer bzw. E-Mail-Adresse, wird dieser Teil verlinkt. */
const EMAIL_AT_END = /[^\s:]+@[^\s]+$/;

function linkTarget(line: string): { readonly value: string; readonly href: string } | null {
  const phone = SITE.phone.display.text;
  if (line.endsWith(phone)) return { value: phone, href: SITE.phone.href };
  const email = EMAIL_AT_END.exec(line)?.[0];
  return email ? { value: email, href: `mailto:${email}` } : null;
}

function ImpressumLine({ line }: { readonly line: string }): ReactNode {
  const target = linkTarget(line);
  if (!target) return line;
  return (
    <>
      {line.slice(0, line.length - target.value.length)}
      <LegalLink href={target.href}>{target.value}</LegalLink>
    </>
  );
}

/** Zwischenlabels der Credits (Kicker-Typo, §2.3) */
const CREDIT_LABEL_CLASS = 'kicker mt-8 block';

const CREDITS_ATTRS = {
  'data-copy-status': credits.meta.status,
  'data-copy-source': credits.meta.source,
} as const;

function Credits() {
  return (
    <div className="mt-16 border-t border-line-light pt-10">
      <Copy
        as="h2"
        id="credits-title"
        value={creditsTitle}
        className="font-display font-black wdth-112 text-[clamp(1.5rem,2.6vw,2.5rem)] leading-[1.05] tracking-[-0.01em]"
      />
      <div {...CREDITS_ATTRS}>
        <Copy as="h3" value={credits.labels.assets} className={CREDIT_LABEL_CLASS} />
        <p className="mt-2">
          <LegalLink href={credits.providerHref} external>
            {credits.provider}
          </LegalLink>
          {' · '}
          <LegalLink href={credits.licenseHref} external>
            {credits.license}
          </LegalLink>
        </p>
        <ul className="mt-4 space-y-2">
          {credits.assets.map((asset) => (
            <li key={asset.href}>
              <LegalLink href={asset.href} external>
                {asset.name}
              </LegalLink>
              {` – ${asset.authors} (${credits.license})`}
            </li>
          ))}
        </ul>
        <Copy as="h3" value={credits.labels.fonts} className={CREDIT_LABEL_CLASS} />
        <p className="mt-2">{`${credits.fonts.join(', ')} – ${credits.fontLicense}`}</p>
      </div>
    </div>
  );
}

export default function ImpressumPage() {
  return (
    <LegalPage title={COPY.impressum.h1}>
      <ul className="space-y-1" {...copyAttrs(lines)}>
        {lines.items.map((line, index) => (
          <li key={line} className={index === 0 ? 'font-bold' : undefined}>
            <ImpressumLine line={line} />
          </li>
        ))}
      </ul>
      <Copy as="p" value={openNote} className="mt-10 border border-ink p-5" />
      <Credits />
    </LegalPage>
  );
}
