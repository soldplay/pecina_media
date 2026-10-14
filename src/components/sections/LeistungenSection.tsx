/**
 * Sektion „Schwerpunkte“ (#leistungen, P5, DESIGN_SPEC §3.3.0).
 *
 * Server Component. Kopf-Panel mit Original-Eyebrow „Unsere Schwerpunkte:“, H2
 * (CutHeading scroll) und Intro; danach EINE <ol role="list"> mit den 8 Schwerpunkten
 * in Originalreihenfolge (LeistungItem). Kommunikation mit dem 3D nur ueber
 * data-scene-section / data-scene-beat (§5.4).
 */

import { Copy } from '@/components/copy/Copy';
import { CutHeading } from '@/components/ui/CutHeading';
import { COPY } from '@/content/site';
import { STATIONS } from '@/lib/scene/stations';
import { LeistungItem } from './leistungen/LeistungItem';

const SECTION_CSS = `
.leistungen {
  --pm-gutter: 16px;
  padding-block: clamp(6rem, 12vw, 12rem); overflow-x: clip;
}
@media (min-width: 640px) { .leistungen { --pm-gutter: 24px; } }
@media (min-width: 1024px) { .leistungen { --pm-gutter: clamp(24px, 4vw, 64px); } }
.leistungen__inner { max-width: 1440px; margin-inline: auto; padding-inline: var(--pm-gutter); }
/* 60rem: auf Desktop passt jeder Satz der H2 in eine Zeile (11,8em bei 5vw) */
.leistungen__head { max-width: 60rem; padding: clamp(1.5rem, 3vw, 3rem); }
.leistungen__eyebrow { margin: 0 0 1rem; color: var(--color-brand); }
.leistungen__title {
  margin: 0; color: var(--color-paper);
  font-family: var(--font-display); font-weight: 900; font-variation-settings: 'wdth' 112;
  font-size: clamp(min(2.25rem, 8.6vw), 5vw, 5rem); line-height: 0.95; letter-spacing: -0.015em;
  overflow-wrap: break-word;
}
.leistungen__intro { margin: 1.5rem 0 0; max-width: 62ch; color: var(--color-paper); font-size: 1.0625rem; line-height: 1.6; }
.leistungen__list { margin: 0; padding: 0; list-style: none; }
@media (min-width: 1024px) { .leistungen__intro { font-size: 1.125rem; } }
@media (max-width: 767.98px), (pointer: coarse) {
  .leistungen__head { max-width: none; margin-inline: calc(-1 * var(--pm-gutter)); --pm-panel-fill: var(--color-ink); }
}
`;

/** Satzweise Zeilen fuer die H2 (gleicher Text und Status, nur an Satzgrenzen geteilt). */
const TITLE_LINES = COPY.leistungen.h2.text
  .split(/(?<=\.)\s+/)
  .map((text) => Object.freeze({ ...COPY.leistungen.h2, text }));

export default function LeistungenSection() {
  const { eyebrow, h2, intro, items, stations } = COPY.leistungen;

  return (
    <section
      id="leistungen"
      data-scene-section="leistungen"
      data-theme="dark"
      aria-labelledby="leistungen-title"
      className="leistungen"
    >
      <style href="pm-p5-leistungen" precedence="pm-p5">
        {SECTION_CSS}
      </style>
      <div className="leistungen__inner">
        <header className="leistungen__head panel panel--cut">
          <Copy value={eyebrow} as="p" className="kicker leistungen__eyebrow" />
          <CutHeading as="h2" id="leistungen-title" text={h2} lines={TITLE_LINES} variant="scroll" className="leistungen__title" />
          <Copy value={intro} as="p" className="leistungen__intro" />
        </header>
        <ol className="leistungen__list" role="list">
          {items.map((item) => (
            <LeistungItem
              key={item.id}
              item={item}
              textSide={STATIONS[item.station].textSide}
              intro={item.beat.endsWith(':a') ? stations[item.station] : undefined}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
