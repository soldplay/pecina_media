/**
 * LegalPage (P9, DESIGN_SPEC §4.9): gemeinsames Layout der Unterseiten
 * /impressum, /datenschutz und not-found. Server Component.
 *
 * - <section data-theme> fuer das Header-Theme (hell: Paper-Grund, Ink-Text;
 *   dunkel: Ink-Grund, Paper-Text), mindestens 100svh hoch.
 * - Kopfband mit grosser H1 (CutHeading, static: ohne Spalt im Text, id 'page-title', tabIndex −1
 *   fuer RouteFocus) und 6°-Kante als Unterkante (clip-path), darunter ein 4 px schmaler
 *   oranger Streifen entlang derselben Kante (Grafik, kein Text).
 * - Inhalt in 62ch Breite. Header und Footer kommen aus dem Root-Layout.
 */

import type { CSSProperties, ReactNode } from 'react';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY } from '@/content/site';
import type { CopyText } from '@/content/types';

export type LegalTone = 'light' | 'dark';

/** id der H1; RouteFocus (P7) fokussiert nach Routenwechsel h1[tabindex='-1']. */
export const PAGE_TITLE_ID = 'page-title';

/** Unterkante des Kopfbands: steigt mit 6° von links unten nach rechts oben (--cut-rise = tan 6° · 100vw). */
const BAND_CLIP = 'polygon(0 0, 100% 0, 100% calc(100% - var(--cut-rise)), 0 100%)';
/** Hoehe des orangen Streifens unter der Kante in px. */
const EDGE_STRIPE_PX = 4;

const HEAD_STYLE: CSSProperties = {
  paddingTop: 'calc(var(--header-h) + 4rem)',
  // Text bleibt immer oberhalb der schraegen Kante.
  paddingBottom: 'calc(var(--cut-rise) + 2.5rem)',
};
const BAND_STYLE: CSSProperties = { clipPath: BAND_CLIP };
const STRIPE_STYLE: CSSProperties = { clipPath: BAND_CLIP, bottom: -EDGE_STRIPE_PX };

const TONE_CLASS: Readonly<Record<LegalTone, { section: string; band: string }>> = {
  light: { section: 'bg-paper text-ink', band: 'bg-paper-2' },
  dark: { section: 'bg-ink text-paper', band: 'bg-anthracite' },
};

const GUTTER = 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-[clamp(24px,4vw,64px)]';
const H1_CLASS =
  'font-display font-black wdth-112 text-[clamp(2.25rem,7vw,6.5rem)] leading-[0.95] tracking-[-0.02em] hyphens-auto [overflow-wrap:break-word]';
const BODY_CLASS = 'max-w-[62ch] text-[1.0625rem] leading-[1.6] lg:text-[1.125rem]';

export interface LegalPageProps {
  readonly title: CopyText;
  readonly tone?: LegalTone;
  readonly children: ReactNode;
}

export function LegalPage({ title, tone = 'light', children }: LegalPageProps) {
  const toneClass = TONE_CLASS[tone];

  return (
    <section data-theme={tone} aria-labelledby={PAGE_TITLE_ID} className={`min-h-svh ${toneClass.section}`}>
      <div className="relative" style={HEAD_STYLE}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bg-brand" style={STRIPE_STYLE} />
        <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${toneClass.band}`} style={BAND_STYLE} />
        <div className={`relative ${GUTTER}`}>
          <CutHeading as="h1" id={PAGE_TITLE_ID} text={title} variant="static" tabIndex={-1} className={H1_CLASS} />
        </div>
      </div>
      <div className={`relative pt-10 pb-[clamp(6rem,12vw,12rem)] ${GUTTER}`}>
        <div className={BODY_CLASS}>{children}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fliesstext-Link (immer unterstrichen, Schnitt bei Hover/Fokus oeffnet und schliesst einmal, §4.4)
// ---------------------------------------------------------------------------

const LINK_TONE_CLASS: Readonly<Record<LegalTone, string>> = {
  light: 'text-brand-text',
  dark: 'text-brand',
};
/** cut-text + cut-hover (globals.css): transienter Spalt, kein stehender Spalt im Ruhezustand. */
const LINK_CLASS = 'cut-text cut-hover underline decoration-1 underline-offset-[0.2em] hover:decoration-2';

export interface LegalLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly tone?: LegalTone;
  /** Ziel ausserhalb der Website: ergaenzt den sr-only-Hinweis aus COPY.ui.external. */
  readonly external?: boolean;
}

export function LegalLink({ href, children, tone = 'light', external = false }: LegalLinkProps) {
  return (
    <a href={href} className={`${LINK_CLASS} ${LINK_TONE_CLASS[tone]}`}>
      {children}
      {external ? <span className="sr-only">{COPY.ui.external}</span> : null}
    </a>
  );
}
