/**
 * Sektion „Start“ (#start, P5, DESIGN_SPEC §3.1).
 *
 * Server Component; Client-Inseln: HeroMotion (Innencontainer + Bewegung), CutHeading
 * (H1 variant 'load'), ButtonLink. Die H1 steht im SSR-HTML und ist ab dem ersten Paint
 * sichtbar (LCP-Element); animiert wird nur ihre Schnitt-Maske.
 *
 * Hoehen (CSS, html[data-motion] + Media Queries):
 * - Bewegung an: min. 160vh; compact (< 768 px oder grober Pointer) min. 140svh
 * - Desktop + Bewegung (SCRUB_QUERY): Innencontainer sticky, 100svh; Band unten links
 * - Reduced: min. 100svh, nichts sticky, Zwischentitel im Fluss unter den CTAs
 * Das Band ist opakes Ink (17,11:1) mit 6°-Oberkante per clip-path; Text wird nie rotiert.
 * Der Zwischentitel (Desktop + Bewegung) blendet nie per opacity: Panel bleibt opak, ein/aus
 * per 6°-Wischkante (--pm-in / --pm-out, Hoehe --pm-rise aus HeroMotion).
 *
 * Abweichung von §2.3 (h1 clamp(2.25rem, 5vw, 5.5rem)): Die H1 ist zusaetzlich auf die
 * Bandbreite begrenzt, damit jeder Satz auf Desktop in einer Zeile steht
 * („Kommunikation mit Wirkung.“ misst 13,95em in Archivo 800, gemessen am Font).
 */

import { Copy } from '@/components/copy/Copy';
import { ButtonLink } from '@/components/ui/Button';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY } from '@/content/site';
import { HeroMotion } from './start/HeroMotion';

/** „Desktop + Bewegung“: Sticky-Band und Scrub; gleiche Bedingung in HeroMotion (gsap.matchMedia). */
const SCRUB_QUERY = '(min-width: 1024px) and (min-height: 600px) and (pointer: fine)';
const COMPACT_QUERY = '(max-width: 767.98px), (pointer: coarse)';
/** Breite der laengsten H1-Zeile in em (13,95) plus Reserve fuer Kerning und Rundung. */
const H1_LINE_EM = 14.2;
/**
 * Bandbreite ab 1024 px (Review 14.10.2026: schlanker, damit die Skulptur groesser wird; vorher
 * min(64vw, 960px)). Mindestens 600 px, damit die H1 bei 1024 px noch je Satz in eine Zeile passt
 * (600 − 2 · 41 px Padding = 518 px ≥ 14,2em · 36 px).
 */
const BAND_W = 'max(min(54vw, 820px), 600px)';

const SECTION_CSS = `
.start { --pm-gutter: 16px; min-height: 100svh; overflow-x: clip; }
@media (min-width: 640px) { .start { --pm-gutter: 24px; } }
@media (min-width: 1024px) { .start { --pm-gutter: clamp(24px, 4vw, 64px); } }
html[data-motion='full'] .start { min-height: 160vh; }
@media ${COMPACT_QUERY} {
  html[data-motion='full'] .start { min-height: 140svh; }
  /* Mobil + Bewegung: Zwischentitel (opak) in der Durchflugstrecke unter dem ersten Screen, das Band bleibt niedrig. */
  html[data-motion='full'] .start__sticky { position: static; }
  html[data-motion='full'] .start__interlude { position: absolute; left: 0; right: 0; bottom: 12svh; width: auto; padding: 1.25rem var(--pm-gutter); }
}

.start__sticky { position: relative; display: flex; flex-direction: column; justify-content: flex-end; min-height: 100svh; }
.start__band {
  position: relative; background: var(--color-ink); color: var(--color-paper);
  clip-path: polygon(0 var(--cut-rise), 100% 0, 100% 100%, 0 100%);
  padding: calc(var(--cut-rise) + 2rem) var(--pm-gutter) 2rem;
}
.start__kicker { margin: 0 0 1.25rem; color: var(--color-brand); }
.start__title {
  margin: 0; color: var(--color-paper);
  font-family: var(--font-display); font-weight: 800; font-variation-settings: 'wdth' 100;
  font-size: clamp(2.25rem, min(5vw, calc((100vw - 2 * var(--pm-gutter)) / ${H1_LINE_EM})), 5.5rem);
  line-height: 0.95; letter-spacing: -0.02em; overflow-wrap: break-word;
}
.start__lead { margin: 1.5rem 0 0; max-width: 40ch; color: var(--color-paper); }
.start__ctas { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 2rem; }
.start__ctas > * { width: 100%; }
.start__interlude {
  margin: 0; padding: 0 var(--pm-gutter) 2rem; background: var(--color-ink); color: var(--color-paper);
  font-family: var(--font-round); font-weight: 600; font-size: clamp(1.25rem, 2vw, 1.75rem); line-height: 1.3;
}

@media (min-width: 1024px) {
  .start { --pm-band-w: ${BAND_W}; --pm-band-pad: clamp(2rem, 4vw, 4rem); }
  .start__sticky { align-items: flex-start; padding-bottom: 4vh; }
  .start__band {
    width: var(--pm-band-w);
    clip-path: polygon(0 calc(0.1051 * var(--pm-band-w)), 100% 0, 100% 100%, 0 100%);
    padding: calc(0.1051 * var(--pm-band-w) + var(--pm-band-pad) * 0.4) var(--pm-band-pad) var(--pm-band-pad);
  }
  .start__title { font-size: clamp(2.25rem, calc((var(--pm-band-w) - 2 * var(--pm-band-pad)) / ${H1_LINE_EM}), 5.5rem); }
  .start__ctas { flex-direction: row; flex-wrap: wrap; }
  .start__ctas > * { width: auto; }
  .start__interlude { width: var(--pm-band-w); padding: 0 var(--pm-band-pad) clamp(1.5rem, 3vw, 2.5rem); }
}
/* Ab 1280 px: Lead links, CTAs rechts daneben (untereinander) – das Band wird niedriger. */
@media (min-width: 1280px) {
  .start__band { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: clamp(1.5rem, 2.5vw, 2.5rem); align-items: start; }
  .start__kicker, .start__title { grid-column: 1 / -1; }
  .start__lead { grid-column: 1; }
  .start__ctas { grid-column: 2; flex-direction: column; flex-wrap: nowrap; margin-top: 1.5rem; }
  .start__ctas > * { width: 100%; }
}

@media ${SCRUB_QUERY} {
  html[data-motion='full'] .start__sticky { position: sticky; top: 0; height: 100svh; min-height: 0; }
  /* Zwischentitel: Panel immer opak (92 % Ink). Ein/aus nur per 6°-Wischkante (clip-path, von unten
     nach oben) und Transform, nie per opacity: jedes sichtbare Pixel Text steht auf vollem Panel. */
  html.js[data-motion='full'] .start__interlude {
    --pm-in: 0; --pm-out: 0;
    position: absolute; left: var(--pm-gutter); bottom: 10vh; width: auto;
    max-width: min(40rem, calc(100vw - 2 * var(--pm-gutter)));
    padding: 1rem 1.5rem; background: var(--color-panel);
    clip-path: polygon(
      0 calc((1 - var(--pm-in)) * (100% + var(--pm-rise, 4rem))),
      100% calc((1 - var(--pm-in)) * (100% + var(--pm-rise, 4rem)) - var(--pm-rise, 4rem)),
      100% calc((1 - var(--pm-out)) * (100% + var(--pm-rise, 4rem)) - var(--pm-rise, 4rem)),
      0 calc((1 - var(--pm-out)) * (100% + var(--pm-rise, 4rem)))
    );
  }
  /* Fokus nie verdeckt (WCAG 2.4.11): ausgeblendetes Band bei Tastaturfokus sichtbar. */
  html.js[data-motion='full'] .start__band:focus-within { opacity: 1 !important; transform: none !important; }
  html.js[data-motion='full'] .start__sticky:has(.start__band:focus-within) .start__interlude { visibility: hidden; }
}
`;

export default function StartSection() {
  const { kicker, h1, h1Lines, lead, ctaPrimary, ctaSecondary, interlude } = COPY.start;

  return (
    <section id="start" data-scene-section="start" data-theme="dark" aria-labelledby="start-title" className="start">
      <style href="pm-p5-start" precedence="pm-p5">
        {SECTION_CSS}
      </style>
      <HeroMotion scrubQuery={SCRUB_QUERY}>
        <div className="start__band">
          <Copy value={kicker} as="p" className="kicker hero-pre start__kicker" />
          <CutHeading as="h1" id="start-title" text={h1} lines={h1Lines} variant="load" className="start__title" />
          <Copy value={lead} as="p" className="lead hero-pre start__lead" />
          <div className="hero-pre start__ctas">
            <ButtonLink href="/#kontakt" variant="primary" scrollTarget="kontakt">
              <Copy value={ctaPrimary} />
            </ButtonLink>
            <ButtonLink href="/#leistungen" variant="secondary" scrollTarget="leistungen">
              <Copy value={ctaSecondary} />
            </ButtonLink>
          </div>
        </div>
        <Copy value={interlude} as="p" className="start__interlude panel" />
      </HeroMotion>
    </section>
  );
}
