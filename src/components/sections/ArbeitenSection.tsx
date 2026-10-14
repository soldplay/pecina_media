/**
 * Arbeiten (DESIGN_SPEC §3.4), erste Sektion der Papierwand (page.tsx legt den Wrapper
 * `.paper-wall` an). Server Component; Client-Insel: CaseList.
 * Alle Texte aus content/site.ts. 3D: keine (die Wand deckt den Canvas).
 * Die Schwerpunkt-Leiste mit Nummern 01–08 ist nach Kunden-Feedback (2026-10-14) entfallen:
 * ohne Beschriftung unverstaendlich. Die Schwerpunkte stehen als Namen in jeder Case-Zeile.
 */
import { Copy } from '@/components/copy/Copy';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY } from '@/content/site';
import CaseList from './arbeiten/CaseList';
import { ExampleBadge } from './arbeiten/CasePoster';

const CONTAINER = 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-[clamp(24px,4vw,64px)]';
const H2_CLASS =
  'mt-4 font-display text-[clamp(2.25rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.015em] wdth-112';
const BODY_CLASS = 'text-[1.0625rem] leading-[1.6] lg:text-[1.125rem]';

export default function ArbeitenSection() {
  const { kicker, h2, lead, disclaimer } = COPY.arbeiten;

  return (
    <section
      id="arbeiten"
      data-scene-section="arbeiten"
      data-theme="light"
      aria-labelledby="arbeiten-title"
      className="pb-[clamp(6rem,12vw,12rem)] pt-[clamp(2rem,5vw,5rem)] text-ink"
    >
      <div className={CONTAINER}>
        <div className="max-w-[62rem]">
          <Copy as="p" value={kicker} className="kicker text-brand-text" />
          <CutHeading as="h2" id="arbeiten-title" text={h2} variant="scroll" className={H2_CLASS} />
          <Copy as="p" value={lead} className="lead mt-6 max-w-[62ch]" />
          <p className={`mt-6 flex max-w-[62ch] items-start gap-3 ${BODY_CLASS}`}>
            <ExampleBadge decorative className="mt-[0.15em] shrink-0" />
            <Copy value={disclaimer} />
          </p>
        </div>

        <div className="mt-12 lg:mt-16">
          <div className="lg:grid lg:grid-cols-12 lg:gap-x-6">
            <div className="lg:col-span-8">
              <CaseList />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
