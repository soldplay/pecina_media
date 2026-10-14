/**
 * Sektion „Haltung“ (#haltung, P5, DESIGN_SPEC §3.2).
 *
 * Server Component. Panel (92 %) in den Spalten 1–5: Kicker, H2 (CutHeading scroll),
 * drei Absaetze (.reveal) und die Prinzipien-Liste (Client-Insel PrincipleList).
 * Rechts sind die Monolithe des 3D sichtbar.
 * - Desktop + Bewegung: Sektion min. 130vh, Prinzipien je min. 40vh.
 * - Mobil (< 768 px oder grober Pointer): 45svh-Fenster (aria-hidden) ueber einem opaken Panel.
 * - Reduced: Hoehen auto, alles sichtbar.
 */

import { Copy } from '@/components/copy/Copy';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY, SHOW_CHARTA } from '@/content/site';
import { PrincipleList } from './haltung/PrincipleList';

const SECTION_CSS = `
.haltung {
  --pm-gutter: 16px;
  padding-block: clamp(6rem, 12vw, 12rem); overflow-x: clip;
}
@media (min-width: 640px) { .haltung { --pm-gutter: 24px; } }
@media (min-width: 1024px) { .haltung { --pm-gutter: clamp(24px, 4vw, 64px); } }
html[data-motion='full'] .haltung { min-height: 130vh; }
.haltung__inner { max-width: 1440px; margin-inline: auto; padding-inline: var(--pm-gutter); }
.haltung__window { display: none; }
.haltung__panel { max-width: 40rem; padding: clamp(1.5rem, 3vw, 3rem); }
@media (min-width: 1024px) {
  .haltung__inner { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: clamp(16px, 2vw, 32px); }
  .haltung__panel { grid-column: 1 / 6; max-width: none; }
}
.haltung__kicker { margin: 0 0 1rem; color: var(--color-brand); }
.haltung__title {
  margin: 0 0 2rem; color: var(--color-paper);
  font-family: var(--font-display); font-weight: 900; font-variation-settings: 'wdth' 112;
  font-size: clamp(min(2.25rem, 8.6vw), 5vw, 5rem); line-height: 0.95; letter-spacing: -0.015em;
  overflow-wrap: break-word;
}
.haltung__text { margin: 0 0 1rem; max-width: 62ch; color: var(--color-paper); font-size: 1.0625rem; line-height: 1.6; }
.haltung__charta { margin: 1.5rem 0 0; color: var(--color-muted-dark); font-size: 0.9375rem; line-height: 1.5; }
.haltung__principles { margin: clamp(2rem, 4vw, 3.5rem) 0 0; padding: 0; list-style: none; }
.haltung__principle { padding-block: 1.25rem; border-top: 1px solid var(--color-line-dark); }
.haltung__principle-num {
  margin: 0 0 0.5rem; color: var(--color-muted-dark); transition: color var(--dur-instant) linear;
  font-family: var(--font-round); font-weight: 300; font-size: clamp(2.5rem, 5vw, 4.5rem); line-height: 1;
}
.haltung__principle[data-active] .haltung__principle-num,
html[data-motion='reduced'] .haltung__principle-num { color: var(--color-brand); }
.haltung__principle-title {
  margin: 0 0 0.5rem; color: var(--color-paper);
  font-family: var(--font-display); font-weight: 800; font-variation-settings: 'wdth' 100;
  font-size: clamp(1.5rem, 2.6vw, 2.5rem); line-height: 1.05; letter-spacing: -0.01em;
}
.haltung__principle-text { margin: 0; max-width: 46ch; color: var(--color-muted-dark); font-size: 1.0625rem; line-height: 1.6; }
@media (min-width: 1024px) { .haltung__text, .haltung__principle-text { font-size: 1.125rem; } }
html[data-motion='full'] .haltung__principle { min-height: 40vh; }
@media (max-width: 767.98px), (pointer: coarse) {
  html[data-motion='full'] .haltung { min-height: 0; }
  html[data-motion='full'] .haltung__principle { min-height: 0; }
  .haltung { padding-top: 0; }
  .haltung__window { display: block; height: 45svh; }
  .haltung__panel { max-width: none; margin-inline: calc(-1 * var(--pm-gutter)); padding-inline: var(--pm-gutter); --pm-panel-fill: var(--color-ink); }
}
`;

/**
 * Wortweise Zeilen fuer die H2 (gleicher Text und Status, nur an Leerzeichen geteilt): Im
 * 5-Spalten-Panel bricht jeder Satz ohnehin um; so liegt der Schnitt in jeder Zeile im Wort
 * statt zwischen zwei umbrochenen Zeilen.
 */
const TITLE_LINES = COPY.haltung.h2.text.split(/\s+/).map((text) => Object.freeze({ ...COPY.haltung.h2, text }));

export default function HaltungSection() {
  const { kicker, h2, paragraphs, principles, charta } = COPY.haltung;

  return (
    <section id="haltung" data-scene-section="haltung" data-theme="dark" aria-labelledby="haltung-title" className="haltung">
      <style href="pm-p5-haltung" precedence="pm-p5">
        {SECTION_CSS}
      </style>
      <div className="haltung__window" aria-hidden="true" />
      <div className="haltung__inner">
        <div className="haltung__panel panel panel--cut">
          <Copy value={kicker} as="p" className="kicker haltung__kicker" />
          <CutHeading as="h2" id="haltung-title" text={h2} lines={TITLE_LINES} variant="scroll" className="haltung__title" />
          {paragraphs.map((paragraph) => (
            <Copy key={paragraph.text} value={paragraph} as="p" className="haltung__text reveal" />
          ))}
          {SHOW_CHARTA ? <Copy value={charta} as="p" className="haltung__charta reveal" /> : null}
          <PrincipleList items={principles} />
        </div>
      </div>
    </section>
  );
}
