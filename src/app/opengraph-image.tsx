/**
 * Open-Graph-Bild (P9), 1200 × 630, beim Build statisch erzeugt.
 *
 * Ink-Grund, oranger 6°-Balken, „Pecina Media KG“ und der Claim in zwei Zeilen (Paper).
 * Standardschrift von next/og (Geist, im Paket enthalten): keine Font-Fetches. Alle Texte
 * sind Basis-Latein, damit Satori keine fehlenden Glyphen nachlaedt. Kein Logo-Nachbau.
 */

import { ImageResponse } from 'next/og';
import { COPY, SITE } from '@/content/site';
import { COLORS, CUT_TAN } from '@/lib/brand';

export const alt = COPY.meta.title.text;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PADDING = { x: 88, top: 96 } as const;
/** Balken: Unterkante links bei y = 540, steigt mit tan 6° ueber die volle Breite. */
const BAR = { leftY: 540, thickness: 20 } as const;

/**
 * Setzt jedes Zeichen in eine eigene Box. Satori misst Woerter ohne, zeichnet sie aber mit
 * Kerning; bei stark unterschnittenen Woertern („Kommunikation“) entstuende sonst eine
 * sichtbare Luecke vor dem naechsten Wort. Einzeln gesetzt bleiben die Abstaende gleichmaessig.
 */
function Glyphs({ text }: { readonly text: string }) {
  return (
    <div style={{ display: 'flex', whiteSpace: 'pre' }}>
      {[...text].map((char, index) => (
        <div key={index} style={{ display: 'flex' }}>
          {char}
        </div>
      ))}
    </div>
  );
}

function barPoints(): string {
  const rightY = BAR.leftY - size.width * CUT_TAN;
  const top = BAR.thickness;
  return [
    `0,${BAR.leftY - top}`,
    `${size.width},${(rightY - top).toFixed(1)}`,
    `${size.width},${rightY.toFixed(1)}`,
    `0,${BAR.leftY}`,
  ].join(' ');
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: COLORS.ink,
          color: COLORS.paper,
          padding: `${PADDING.top}px ${PADDING.x}px`,
        }}
      >
        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <polygon points={barPoints()} fill={COLORS.brand} />
        </svg>
        <div style={{ display: 'flex', fontSize: 40 }}>
          <Glyphs text={SITE.legalName} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, fontSize: 64, lineHeight: 1.08 }}>
          {COPY.start.h1Lines.map((line) => (
            <Glyphs key={line.text} text={line.text} />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
