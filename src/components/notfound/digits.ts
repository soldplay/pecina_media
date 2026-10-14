/**
 * Block-Ziffern fuer das 404-Easter-Egg (DESIGN_SPEC §4.9, P9 Punkt 7).
 *
 * Einheit: Ziffernhoehe 1, konvexe Polygone gegen den Uhrzeigersinn (y nach oben),
 * x je Ziffer ab 0. `[x0,y0]-[x1,y1]` in der Spec = Rechteck. Abstand 0,1.
 * Reine Daten und Funktionen; `Vec2` wird nur als Typ importiert (kein three im Bundle).
 */

import type { Vec2 } from '@/lib/three/split-extrude';

type Polygon = readonly Vec2[];

interface DigitGlyph {
  readonly width: number;
  readonly polygons: readonly Polygon[];
}

export const DIGIT_HEIGHT = 1;
export const DIGIT_SPACING = 0.1;

/** Rechteck als konvexes Polygon gegen den Uhrzeigersinn. */
function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  const points: Vec2[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return Object.freeze(points);
}

function poly(points: Vec2[]): Polygon {
  return Object.freeze(points);
}

const GLYPH_4: DigitGlyph = Object.freeze({
  width: 0.86,
  polygons: Object.freeze([
    // Stamm
    rect(0.5, 0, 0.74, 1),
    // Querbalken links und rechts
    rect(0, 0.22, 0.5, 0.44),
    rect(0.74, 0.22, 0.86, 0.44),
    // Diagonale
    poly([
      [0, 0.44],
      [0.28, 0.44],
      [0.5, 0.84],
      [0.5, 1.0],
      [0.4, 1.0],
    ]),
  ]),
});

const GLYPH_0: DigitGlyph = Object.freeze({
  width: 0.8,
  polygons: Object.freeze([
    rect(0, 0, 0.24, 1),
    rect(0.56, 0, 0.8, 1),
    rect(0.24, 0.76, 0.56, 1),
    rect(0.24, 0, 0.56, 0.24),
  ]),
});

const CODE_404: readonly DigitGlyph[] = Object.freeze([GLYPH_4, GLYPH_0, GLYPH_4]);

/** Gesamtbreite von „404“ inklusive Abstaenden (2,72). */
export const DIGITS_404_WIDTH =
  CODE_404.reduce((sum, glyph) => sum + glyph.width, 0) + DIGIT_SPACING * (CODE_404.length - 1);

function signedArea(polygon: Polygon): number {
  return (
    polygon.reduce((sum, [x0, y0], i) => {
      const [x1, y1] = polygon[(i + 1) % polygon.length];
      return sum + x0 * y1 - x1 * y0;
    }, 0) / 2
  );
}

/**
 * „404“ als Liste konvexer Polygone, um (0, 0) zentriert (x −1,36 … 1,36, y −0,5 … 0,5).
 * Liefert bei jedem Aufruf neue Arrays; die Glyph-Daten bleiben unveraendert.
 */
export function build404(): Vec2[][] {
  const starts = CODE_404.map((_, index) =>
    CODE_404.slice(0, index).reduce((sum, glyph) => sum + glyph.width + DIGIT_SPACING, 0),
  );
  const dx = -DIGITS_404_WIDTH / 2;
  const dy = -DIGIT_HEIGHT / 2;

  const polygons = CODE_404.flatMap((glyph, index) =>
    glyph.polygons.map((polygon) => polygon.map(([x, y]): Vec2 => [x + starts[index] + dx, y + dy])),
  );

  if (process.env.NODE_ENV !== 'production') {
    console.assert(
      polygons.every((polygon) => signedArea(polygon) > 0),
      '[digits] Polygone muessen gegen den Uhrzeigersinn laufen',
    );
  }
  return polygons;
}
