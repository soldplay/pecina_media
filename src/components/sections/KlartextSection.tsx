/**
 * KLARTEXT! (DESIGN_SPEC §3.6): dunkles Band am Ende der Papierwand, volle Breite Ink mit
 * 6°-Kante oben; unten endet es an der 6°-Unterkante der Wand (orange Naht). Server Component; Client-Insel TwoHalves (dekorativ).
 * Nur Belegtes (Selbstbeschreibung, gleiche Adresse, Kursbereiche laut Navigation).
 * Nicht verwendet: KLARTEXT!-Logo, Petrol, Navy, „EST 2005“, Foerder-/Zertifikatshinweise.
 */
import type { CSSProperties } from 'react';
import { Copy, copyAttrs } from '@/components/copy/Copy';
import { ButtonLink } from '@/components/ui/Button';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY } from '@/content/site';
import TwoHalves from './klartext/TwoHalves';

const CONTAINER = 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-[clamp(24px,4vw,64px)]';
const H2_CLASS =
  'mt-4 font-display text-[clamp(2.25rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.015em] wdth-112';
const BODY_CLASS = 'max-w-[62ch] text-[1.0625rem] leading-[1.6] lg:text-[1.125rem]';
const COURSES_LABEL_ID = 'klartext-courses-label';

/**
 * 6°-Kante oben wie die Papierwand. Unten keine eigene Kante: KLARTEXT! ist das letzte Kind der
 * Wand (page.tsx, .paper-wall--dark-end ohne Innenabstand unten), das dunkle Band laeuft also bis
 * an die 6°-Unterkante der Wand – kein Papier-Keil vor dem Kontakt. Innenabstand unten bleibt
 * ≥ Anstieg + Sektionsabstand, weil die Wand dort den Anstieg wegschneidet.
 */
const BAND_STYLE: CSSProperties = {
  clipPath: 'polygon(0 var(--cut-rise), 100% 0, 100% 100%, 0 100%)',
  paddingBlock: 'calc(var(--cut-rise) + clamp(4rem, 8vw, 8rem))',
};

/**
 * Naht auf der 6°-Unterkante der Wand (2 px #FFB257, dekorativ): SVG-Linie von links unten nach
 * rechts oben ueber die Hoehe --cut-rise, 1 px angehoben, damit der Wand-Clip sie nicht halbiert.
 */
const SEAM_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cline x1='0' y1='10' x2='100' y2='0' stroke='%23FFB257' stroke-width='2' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E\")";
const SEAM_STYLE: CSSProperties = {
  bottom: '1px',
  height: 'var(--cut-rise)',
  backgroundImage: SEAM_SVG,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
};

function ExternalArrow() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className="ml-1.5 inline-block h-[0.9em] w-[0.9em] align-[-0.05em]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path d="M5 11L11 5M6 5h5v5" />
    </svg>
  );
}

export default function KlartextSection() {
  const { kicker, h2, text1, text2, courseLabel, courses, link, linkHref } = COPY.klartext;

  return (
    <section
      id="klartext"
      data-scene-section="klartext"
      data-theme="dark"
      aria-labelledby="klartext-title"
      className="bg-ink text-paper"
      style={BAND_STYLE}
    >
      <div className={`${CONTAINER} grid gap-14 lg:grid-cols-12 lg:items-center lg:gap-x-6`}>
        <div className="lg:col-span-6">
          <Copy as="p" value={kicker} className="kicker text-brand" />
          <CutHeading as="h2" id="klartext-title" text={h2} variant="scroll" className={H2_CLASS} />
          <Copy as="p" value={text1} className={`mt-8 ${BODY_CLASS}`} />
          <Copy as="p" value={text2} className={`mt-4 text-muted-dark ${BODY_CLASS}`} />

          <Copy
            as="p"
            id={COURSES_LABEL_ID}
            value={courseLabel}
            className="mt-10 font-sans text-[0.875rem] font-semibold uppercase leading-[1.2] tracking-[0.08em] text-muted-dark wdth-75"
          />
          <ul aria-labelledby={COURSES_LABEL_ID} {...copyAttrs(courses)} className="mt-4 flex flex-wrap gap-2">
            {courses.items.map((course) => (
              <li
                key={course}
                className="rounded-full border border-line-dark px-4 py-1.5 text-[0.9375rem] leading-[1.3] text-paper"
              >
                {course}
              </li>
            ))}
          </ul>

          <ButtonLink
            href={linkHref}
            external
            variant="ghost"
            tone="dark"
            className="mt-10 px-0! text-brand!"
          >
            {/* Unterstrich setzt die ghost-Variante am Label (Button.tsx) */}
            <Copy value={link} />
            <ExternalArrow />
          </ButtonLink>
        </div>

        <div className="lg:col-span-5 lg:col-start-8">
          <TwoHalves />
        </div>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 block forced-colors:hidden"
        style={SEAM_STYLE}
      />
    </section>
  );
}
