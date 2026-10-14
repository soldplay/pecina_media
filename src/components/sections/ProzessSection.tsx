/**
 * Prozess (DESIGN_SPEC §3.5), zweite Sektion der Papierwand. Server Component mit der
 * Client-Insel ProcessLine (Linie, aktiver Schritt).
 *
 * Desktop: vier Spalten entlang einer steigenden 6°-Linie; Schritt k liegt um
 * k · tan 6° · (Spaltenbreite + Spaltenabstand) hoeher als Schritt 0. Mobil: vertikale Liste.
 */
import type { CSSProperties } from 'react';
import { Copy } from '@/components/copy/Copy';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY } from '@/content/site';
import { CUT_TAN } from '@/lib/brand';
import ProcessLine from './prozess/ProcessLine';

const CONTAINER = 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-[clamp(24px,4vw,64px)]';
const H2_CLASS =
  'mt-4 font-display text-[clamp(2.25rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.015em] wdth-112';

/** Spaltenabstand der Schritte (Desktop), geht in den 6°-Versatz ein. */
const STEP_GAP = '2rem';

/**
 * Oberer Versatz von Schritt `index` (Desktop): Prozent-Padding eines Grid-Items bezieht
 * sich auf die Breite seiner Grid-Area, also auf die Spaltenbreite.
 */
function riseStyle(index: number, count: number): CSSProperties {
  const steps = count - 1 - index;
  const percent = (CUT_TAN * 100).toFixed(2);
  return { '--rise': `calc(${steps} * (${percent}% + ${CUT_TAN} * ${STEP_GAP}))` } as CSSProperties;
}

export default function ProzessSection() {
  const { kicker, h2, steps } = COPY.prozess;

  return (
    <section
      id="prozess"
      data-scene-section="prozess"
      data-theme="light"
      aria-labelledby="prozess-title"
      className="pb-[clamp(6rem,12vw,12rem)] text-ink"
    >
      <div className={CONTAINER}>
        <div className="max-w-[62rem]">
          <Copy as="p" value={kicker} className="kicker text-brand-text" />
          <CutHeading as="h2" id="prozess-title" text={h2} variant="scroll" className={H2_CLASS} />
        </div>

        {/* Linie liegt hinter der Liste (die <ol> ist positioniert und folgt im DOM). */}
        <div className="relative mt-14 lg:mt-24">
          <ProcessLine />
          <ol
            className="process relative grid gap-y-12 pl-10 lg:grid-cols-4 lg:gap-x-[var(--step-gap)] lg:pl-0"
            style={{ '--step-gap': STEP_GAP } as CSSProperties}
          >
            {steps.map((step, index) => (
              <li
                key={step.num}
                data-process-step=""
                className="group reveal lg:pt-[var(--rise)]"
                style={riseStyle(index, steps.length)}
              >
                <span data-process-anchor="" aria-hidden="true" className="block h-0" />
                <span
                  aria-hidden="true"
                  className="mt-6 block font-round text-[clamp(2.5rem,5vw,4.5rem)] font-light leading-none tabular-nums text-muted-light transition-colors duration-[120ms] ease-out group-data-[active=true]:text-brand-text"
                >
                  {step.num}
                </span>
                <Copy
                  as="h3"
                  value={step.title}
                  className="mt-4 font-display text-[clamp(1.5rem,2.6vw,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.01em] wdth-100"
                />
                <Copy
                  as="p"
                  value={step.text}
                  className="mt-3 max-w-[62ch] text-[1.0625rem] leading-[1.6] lg:text-[1.125rem]"
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
