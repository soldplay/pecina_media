/**
 * Ein Schwerpunkt der Liste (P5, DESIGN_SPEC §3.3.0; DOM-Struktur exakt laut Spec).
 *
 * <li id="leistung-0N" class="leistung" data-station data-text-side>
 *   [Station-Intro bei Beat a: Name (display) + Roemer (aria-hidden) + Subline]
 *   <article data-scene-beat="<station>:a|b" aria-labelledby="leistung-0N-title">
 *     Karte (.panel.panel--cut mit 6°-Oberkante, links gespiegelt; sticky top 16vh, max. 34rem,
 *     Seite laut STATIONS[station].textSide); Station-Intro ebenso
 *     Fenster auf der Gegenseite mit der Fallback-Figur (aria-hidden)
 *
 * Server Component; Client-Inseln: SplitReveal (H3), CutUnderline.
 * Desktop + Bewegung: Artikel min. 100vh, Intro 35vh, Karte und Fenster sticky.
 * Mobil (< 768 px oder grober Pointer): 55svh-Fenster ueber einer opaken Karte (nie Text ueber 3D).
 * Reduced: Hoehen auto, nichts sticky.
 */

import { Copy, copyAttrs } from '@/components/copy/Copy';
import type { LeistungCopy, StationCopy } from '@/content/types';
import { SplitReveal } from '@/components/ui/SplitReveal';
import { CutUnderline } from './CutUnderline';
import { StationFallback, type FallbackBeat } from './StationFallback';

export interface LeistungItemProps {
  readonly item: LeistungCopy;
  readonly textSide: 'left' | 'right';
  /** Nur beim ersten Schwerpunkt einer Station (Beat a): Station-Intro */
  readonly intro?: StationCopy;
}

const COMPACT = '(max-width: 767.98px), (pointer: coarse)';

const ITEM_CSS = `
.leistung { position: relative; }
.station-intro { display: flex; align-items: center; margin-top: clamp(3rem, 6vw, 6rem); }
.leistung[data-text-side='right'] .station-intro { justify-content: flex-end; }
.station-intro__panel { padding: clamp(1.25rem, 2.5vw, 2.5rem) clamp(1.25rem, 3vw, 3rem); max-width: 100%; }
.station-intro__name {
  margin: 0; color: var(--color-paper);
  font-family: var(--font-display); font-weight: 900; font-variation-settings: 'wdth' 125;
  font-size: min(clamp(3rem, 8vw, 8.5rem), 12vw); line-height: 0.9; letter-spacing: -0.02em;
  overflow-wrap: break-word;
}
.ziffer-hoch {
  margin-left: 0.06em; color: var(--color-brand);
  font-weight: 800; font-variation-settings: 'wdth' 100; font-size: 0.38em; vertical-align: super; line-height: 0;
}
.station-intro__sub { margin: 1rem 0 0; max-width: 32ch; color: var(--color-muted-dark); }
.leistung__article {
  display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: clamp(16px, 2vw, 32px);
  align-items: start; margin-top: clamp(2rem, 4vw, 4rem);
  view-timeline: --pm-leistung block;
}
.leistung__card {
  grid-row: 1; width: 100%; max-width: 34rem;
  padding: clamp(1.5rem, 2.5vw, 2.5rem);
}
.leistung[data-text-side='right'] .leistung__card { grid-column: 6 / 13; justify-self: end; }
.leistung[data-text-side='left'] .leistung__card { grid-column: 1 / 8; }
.leistung__window { grid-row: 1; display: flex; align-items: center; justify-content: center; }
.leistung[data-text-side='right'] .leistung__window { grid-column: 1 / 6; }
.leistung[data-text-side='left'] .leistung__window { grid-column: 8 / 13; }
.leistung__window .pm-fb { width: min(100%, 54vh); }
@media (min-width: 1024px) {
  .leistung[data-text-side='right'] .leistung__card { grid-column: 8 / 13; }
  .leistung[data-text-side='left'] .leistung__card { grid-column: 1 / 6; }
  .leistung[data-text-side='right'] .leistung__window { grid-column: 1 / 7; }
  .leistung[data-text-side='left'] .leistung__window { grid-column: 7 / 13; }
}
.leistung__num {
  margin: 0 0 0.75rem; color: var(--color-brand);
  font-family: var(--font-round); font-weight: 300; font-size: clamp(2.5rem, 5vw, 4.5rem); line-height: 1;
}
.leistung__title {
  margin: 0; color: var(--color-paper);
  font-family: var(--font-display); font-weight: 800; font-variation-settings: 'wdth' 100;
  font-size: clamp(1.5rem, 2.6vw, 2.5rem); line-height: 1.05; letter-spacing: -0.01em; overflow-wrap: break-word;
}
.leistung__claim {
  margin: 0 0 1rem; color: var(--color-brand);
  font-family: var(--font-sans); font-weight: 700; font-variation-settings: 'wdth' 100;
  font-size: clamp(1.25rem, 1.8vw, 1.625rem); line-height: 1.25;
}
.leistung__text { margin: 0; max-width: 62ch; color: var(--color-paper); font-size: 1.0625rem; line-height: 1.6; }
.leistung__tags { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1.5rem 0 0; padding: 0; list-style: none; }
.leistung__tags li {
  padding: 0.375rem 0.75rem; border: 1px solid var(--color-line-dark); border-radius: var(--radius-pill);
  color: var(--color-muted-dark);
  font-family: var(--font-sans); font-weight: 600; font-variation-settings: 'wdth' 75;
  font-size: 0.875rem; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase;
}
.leistung__note {
  margin: 1.5rem 0 0; padding-top: 1rem; border-top: 1px solid var(--color-line-dark);
  color: var(--color-muted-dark); font-family: var(--font-round); font-weight: 400; font-size: 0.9375rem; line-height: 1.5;
}
@media (min-width: 1024px) { .leistung__text { font-size: 1.125rem; } }
html[data-motion='full'] .station-intro { min-height: 35vh; }
html[data-motion='full'] .leistung__article { min-height: 100vh; }
html[data-motion='full'] .leistung__card,
html[data-motion='full'] .leistung__window { position: sticky; top: 16vh; }
@media ${COMPACT} {
  .station-intro, .leistung[data-text-side='right'] .station-intro { justify-content: flex-start; }
  .station-intro__panel { width: 100%; --pm-panel-fill: var(--color-ink); }
  .leistung__article { display: flex; flex-direction: column; margin-top: 0; }
  .leistung__window { order: -1; height: 55svh; padding-block: 2rem; }
  .leistung__window .pm-fb { width: auto; height: 100%; max-width: 100%; }
  .leistung__card { max-width: none; --pm-panel-fill: var(--color-ink); }
  html[data-motion='full'] .station-intro,
  html[data-motion='full'] .leistung__article { min-height: 0; }
  html[data-motion='full'] .leistung__card,
  html[data-motion='full'] .leistung__window { position: relative; top: auto; }
}
`;

export function LeistungItem({ item, textSide, intro }: LeistungItemProps) {
  const titleId = `${item.id}-title`;
  // 6°-Oberkante (globals.css .panel--cut); auf der linken Seite gespiegelt, die tiefe Ecke zeigt zum 3D.
  const cutClass = textSide === 'left' ? 'panel panel--cut panel--cut-flip' : 'panel panel--cut';
  const beat: FallbackBeat = item.beat.endsWith(':b') ? 'b' : 'a';

  return (
    <li id={item.id} className="leistung" data-station={item.station} data-text-side={textSide}>
      <style href="pm-p5-leistung" precedence="pm-p5">
        {ITEM_CSS}
      </style>
      {intro ? (
        <div className="station-intro">
          <div className={`station-intro__panel ${cutClass}`}>
            <p className="station-intro__name" {...copyAttrs(intro.label)}>
              {intro.label.text}
              <span className="ziffer-hoch" aria-hidden="true">
                {intro.numeral}
              </span>
            </p>
            <Copy value={intro.subline} as="p" className="station-intro__sub lead" />
          </div>
        </div>
      ) : null}
      <article className="leistung__article" data-scene-beat={item.beat} aria-labelledby={titleId}>
        <div className={`leistung__card ${cutClass}`}>
          <p className="leistung__num" aria-hidden="true">
            {item.num}
          </p>
          <SplitReveal as="h3" id={titleId} className="leistung__title" {...copyAttrs(item.title)}>
            {item.title.text}
          </SplitReveal>
          <CutUnderline beat={beat} />
          <Copy value={item.claim} as="p" className="leistung__claim" />
          <Copy value={item.text} as="p" className="leistung__text" />
          <ul className="leistung__tags" role="list" {...copyAttrs(item.tags)}>
            {item.tags.items.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
          {item.note ? <Copy value={item.note} as="p" className="leistung__note" /> : null}
        </div>
        <div className="leistung__window" aria-hidden="true">
          <StationFallback station={item.station} beat={beat} />
        </div>
      </article>
    </li>
  );
}
