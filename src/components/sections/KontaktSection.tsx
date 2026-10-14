/**
 * Kontakt (DESIGN_SPEC §3.7). Server Component; Client-Inseln aus kontakt/KontaktMotion.
 *
 * Desktop + Bewegung: min. 130vh, Inhalt sticky in Spalte 1–5 auf .panel (92 % Ink); rechts
 * schliesst sich die Skulptur (3D, P1/P2). Reduced: min. 100svh. Mobil: 40svh-Fenster
 * (aria-hidden) oben, Panel opak darunter, Buttons untereinander, Telefon zuerst.
 * Kein Formular in V1.
 */
import { Copy, copyAttrs } from '@/components/copy/Copy';
import { ButtonLink } from '@/components/ui/Button';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY, SITE } from '@/content/site';
import { KontaktLine, KontaktMailButton } from './kontakt/KontaktMotion';

/*
 * Auf allen Breiten auf die Panelbreite begrenzt (Panel = Container): „Kontaktiere“ misst 6,81em
 * und ragte bei 5,2vw ueber das Panel in die 3D-Szene bzw. bei 320 px (2,75rem) ueber den
 * Viewport (Reflow, WCAG 1.4.10). 14cqi ≈ Inhaltsbreite / 7,1em.
 */
const H2_CLASS =
  'h2-kontakt mt-4 font-display text-[min(clamp(2.75rem,5.2vw,6rem),14cqi)] font-black leading-[0.92] tracking-[-0.02em] wdth-112';
const BODY_CLASS = 'text-[1.0625rem] leading-[1.6] lg:text-[1.125rem]';
const INLINE_LINK =
  'underline decoration-1 underline-offset-[0.25em] transition-colors duration-200 hover:text-brand hover:decoration-2';

export default function KontaktSection() {
  const { kicker, h2, h2Lines, lead, addressLabels, mailButton, phoneButton } = COPY.kontakt;
  const email = SITE.contactEmail.text;
  const mailHref = `mailto:${email}`;
  const phoneHref = SITE.phone.href;

  const phoneLink = (
    <ButtonLink href={phoneHref} variant="secondary" tone="dark" className="w-full lg:w-auto">
      <Copy value={phoneButton} />
    </ButtonLink>
  );

  return (
    <section
      id="kontakt"
      data-scene-section="kontakt"
      data-scene-range="top 85%|bottom bottom"
      data-theme="dark"
      aria-labelledby="kontakt-title"
      className="text-paper lg:min-h-[130vh] lg:[html[data-motion=reduced]_&]:min-h-svh"
    >
      {/* Mobil: Fenster auf die Skulptur, nie Text ueber 3D */}
      <div aria-hidden="true" className="h-[40svh] lg:hidden" />

      <div className="mx-auto w-full max-w-[1440px] lg:grid lg:min-h-[inherit] lg:grid-cols-12 lg:items-start lg:gap-x-6 lg:px-[clamp(24px,4vw,64px)] lg:py-[clamp(6rem,12vw,12rem)]">
        <div className="panel panel--cut px-4 py-14 max-lg:[--pm-panel-fill:var(--color-ink)] sm:px-6 lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:col-span-5 lg:p-[clamp(2rem,3.5vw,3.5rem)] [container-type:inline-size]">
          <Copy as="p" value={kicker} className="kicker text-brand" />
          <CutHeading
            as="h2"
            id="kontakt-title"
            text={h2}
            lines={h2Lines}
            variant="scroll"
            className={H2_CLASS}
          />
          <KontaktLine className="mt-5" />
          <Copy as="p" value={lead} className="lead mt-8 max-w-[34ch]" />

          <address className={`mt-8 not-italic ${BODY_CLASS}`}>
            <span className="block">{SITE.legalName}</span>
            <Copy value={SITE.address.display} className="block" />
            <span className="mt-3 block">
              <Copy value={addressLabels.phone} className="text-muted-dark" />{' '}
              <a href={phoneHref} className={INLINE_LINK}>
                <Copy value={SITE.phone.display} />
              </a>
            </span>
            <span className="block">
              <Copy value={addressLabels.email} className="text-muted-dark" />{' '}
              <a href={mailHref} className={INLINE_LINK} {...copyAttrs(SITE.contactEmail)}>
                {email}
              </a>
            </span>
          </address>

          <div className="mt-10 flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <div className="lg:hidden">{phoneLink}</div>
            <KontaktMailButton href={mailHref} className="w-full lg:w-auto">
              <Copy value={mailButton} />
            </KontaktMailButton>
            <div className="hidden lg:block">{phoneLink}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
