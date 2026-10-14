'use client';

/**
 * Korn (P7, DESIGN_SPEC §4.6).
 *
 * Statische SVG-Noise-Kachel (feTurbulence, Data-URI, 160 px), fixed, z 5:
 * ueber dem Canvas (z 0), unter dem Inhalt (z 10) — auf der Papierwand also unsichtbar.
 * KEINE Animation. Deckkraft je aktiver Sektion (Rauschen → Klarheit), Uebergang 600 ms:
 * start 0,10 · haltung 0,07 · leistungen 0,05 · kontakt 0,03 · sonst 0,04.
 */

import type { SectionId } from '@/lib/scene/ids';
import { useUi } from '@/lib/scene/store';

const GRAIN_TILE_PX = 160;
const DEFAULT_OPACITY = 0.04;
const OPACITY_BY_SECTION: Readonly<Partial<Record<SectionId, number>>> = Object.freeze({
  start: 0.1,
  haltung: 0.07,
  leistungen: 0.05,
  kontakt: 0.03,
});

const GRAIN_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_TILE_PX}' height='${GRAIN_TILE_PX}' viewBox='0 0 ${GRAIN_TILE_PX} ${GRAIN_TILE_PX}'>` +
  `<filter id='n' x='0' y='0' width='100%' height='100%'>` +
  `<feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/>` +
  `<feColorMatrix type='saturate' values='0'/></filter>` +
  `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;

const GRAIN_URI = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

const GRAIN_CSS = `
.pm-grain {
  position: fixed; inset: 0; z-index: 5; pointer-events: none;
  background-image: ${GRAIN_URI};
  background-repeat: repeat;
  background-size: ${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px;
  transition: opacity var(--dur-slow) linear;
}
@media (forced-colors: active) { .pm-grain { display: none; } }
`;

export default function GrainOverlay() {
  const opacity = useUi((s) => OPACITY_BY_SECTION[s.activeSection] ?? DEFAULT_OPACITY);

  return (
    <>
      <style href="pm-p7-grain" precedence="pm-p7">
        {GRAIN_CSS}
      </style>
      <div className="pm-grain" aria-hidden="true" style={{ opacity }} />
    </>
  );
}
