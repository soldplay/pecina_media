/**
 * Favicon (P9), 32 × 32 PNG, beim Build statisch erzeugt; ersetzt das entfernte
 * favicon.ico. Ink-Hintergrund, oranges Quadrat mit 6°-Spalt durch die Mitte:
 * zwei Polygone als inline-SVG, Spaltbreite senkrecht zur Kante 2,4 px.
 */

import { ImageResponse } from 'next/og';
import { COLORS, CUT_COS, CUT_TAN } from '@/lib/brand';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

const SQUARE = { x0: 4, y0: 4, x1: 28, y1: 28 } as const;
const GAP_PX = 2.4;

/** SVG-y der Schnittgeraden (Bildschirm-y nach unten, Anstieg nach rechts oben). */
function cutY(x: number): number {
  const cx = (SQUARE.x0 + SQUARE.x1) / 2;
  const cy = (SQUARE.y0 + SQUARE.y1) / 2;
  return cy - CUT_TAN * (x - cx);
}

function points(list: readonly (readonly [number, number])[]): string {
  return list.map(([x, y]) => `${x},${y.toFixed(2)}`).join(' ');
}

/** Obere und untere Haelfte; der halbe Spalt senkrecht zur Kante wird vertikal umgerechnet. */
function halves(): { readonly upper: string; readonly lower: string } {
  const { x0, y0, x1, y1 } = SQUARE;
  const half = GAP_PX / 2 / CUT_COS;
  return {
    upper: points([
      [x0, y0],
      [x1, y0],
      [x1, cutY(x1) - half],
      [x0, cutY(x0) - half],
    ]),
    lower: points([
      [x0, cutY(x0) + half],
      [x1, cutY(x1) + half],
      [x1, y1],
      [x0, y1],
    ]),
  };
}

export default function Icon() {
  const { upper, lower } = halves();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: COLORS.ink }}>
        <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
          <polygon points={upper} fill={COLORS.brand} />
          <polygon points={lower} fill={COLORS.brand} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
