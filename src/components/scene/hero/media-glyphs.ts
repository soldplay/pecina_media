/**
 * MEDIA-Glyphen der Skulptur (DESIGN_SPEC §5.3, §3.1). Eigene Block-Versalien aus
 * konvexen Polygonen, kein Logo-Nachbau. Einheit: Versalhoehe = 1, x je Buchstabe
 * ab 0, alle Polygone gegen den Uhrzeigersinn (y nach oben).
 *
 * buildMediaPolygons() liefert die Polygone in Weltmass: x um −2,03 zentriert,
 * ×3,0 skaliert, um (0, 0,1) verschoben → Unterkante y 0,1, Mitte y 1,6.
 * buildSculptureHalves() teilt sie am 6°-Schnitt durch (0, 1,6) und extrudiert
 * jede Haelfte zu EINER Geometrie (2 Draw Calls, geschlossene Schnittflaechen).
 */

import type * as THREE from 'three';
import { CUT_NORMAL } from '@/lib/brand';
import { SCULPTURE } from '@/lib/scene/stations';
import { extrudePolygons, splitPolygons, type Vec2 } from '@/lib/three/split-extrude';

export interface Glyph {
  readonly char: 'M' | 'E' | 'D' | 'I' | 'A';
  readonly width: number;
  readonly polygons: readonly (readonly Vec2[])[];
}

/** Rechteck [x0,y0]-[x1,y1] als 4 Punkte gegen den Uhrzeigersinn. */
function rect(x0: number, y0: number, x1: number, y1: number): readonly Vec2[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Tabelle §5.3, Wert fuer Wert. */
export const MEDIA_GLYPHS: readonly Glyph[] = Object.freeze([
  {
    char: 'M',
    width: 1.1,
    polygons: [
      rect(0, 0, 0.24, 1),
      rect(0.86, 0, 1.1, 1),
      [
        [0.24, 0.7],
        [0.55, 0.34],
        [0.55, 0.64],
        [0.24, 1.0],
      ],
      [
        [0.55, 0.34],
        [0.86, 0.7],
        [0.86, 1.0],
        [0.55, 0.64],
      ],
    ],
  },
  {
    char: 'E',
    width: 0.7,
    polygons: [rect(0, 0, 0.24, 1), rect(0.24, 0.76, 0.7, 1), rect(0.24, 0.38, 0.62, 0.62), rect(0.24, 0, 0.7, 0.24)],
  },
  {
    char: 'D',
    width: 0.8,
    polygons: [
      rect(0, 0, 0.24, 1),
      rect(0.24, 0.76, 0.62, 1),
      rect(0.24, 0, 0.62, 0.24),
      rect(0.56, 0.24, 0.8, 0.76),
      [
        [0.62, 0.76],
        [0.8, 0.76],
        [0.8, 0.82],
        [0.62, 1.0],
      ],
      [
        [0.62, 0.0],
        [0.8, 0.18],
        [0.8, 0.24],
        [0.62, 0.24],
      ],
    ],
  },
  {
    char: 'I',
    width: 0.24,
    polygons: [rect(0, 0, 0.24, 1)],
  },
  {
    char: 'A',
    width: 0.9,
    polygons: [
      [
        [0, 0],
        [0.24, 0],
        [0.45, 1],
        [0.21, 1],
      ],
      [
        [0.66, 0],
        [0.9, 0],
        [0.69, 1],
        [0.45, 1],
      ],
      [
        [0.2904, 0.24],
        [0.6096, 0.24],
        [0.5634, 0.46],
        [0.3366, 0.46],
      ],
    ],
  },
]);

/** Buchstabenabstand in Versalhoehen. */
export const MEDIA_LETTER_GAP = 0.08;
/** Gesamtbreite M E D I A inklusive Abstaende (§5.3). */
export const MEDIA_TOTAL_WIDTH = 4.06;
/** Skalierung Einheit → Meter (Versalhoehe 3,0 m). */
export const MEDIA_SCALE = SCULPTURE.capHeight;
/** Verschiebung nach oben: Unterkante bei y 0,1, Mitte bei y 1,6. */
export const MEDIA_BASE_Y = SCULPTURE.center[1] - SCULPTURE.capHeight / 2;

const WIDTH_EPS = 1e-9;

function measuredWidth(): number {
  return MEDIA_GLYPHS.reduce((sum, g) => sum + g.width, 0) + MEDIA_LETTER_GAP * (MEDIA_GLYPHS.length - 1);
}

if (process.env.NODE_ENV !== 'production') {
  console.assert(
    Math.abs(measuredWidth() - MEDIA_TOTAL_WIDTH) < WIDTH_EPS,
    `[media-glyphs] Gesamtbreite ${measuredWidth()} statt ${MEDIA_TOTAL_WIDTH}`,
  );
}

/** x-Startposition jedes Buchstabens in Versalhoehen (0, 1,18, 1,96, 2,84, 3,16). */
function letterOffsets(): readonly number[] {
  return MEDIA_GLYPHS.map((_, i) =>
    MEDIA_GLYPHS.slice(0, i).reduce((x, prev) => x + prev.width + MEDIA_LETTER_GAP, 0),
  );
}

/**
 * Alle Glyphen-Polygone in Weltmass (neue Arrays, Eingaben bleiben unveraendert):
 * x' = (x + Buchstaben-x − 2,03) · 3,0; y' = y · 3,0 + 0,1.
 */
export function buildMediaPolygons(): Vec2[][] {
  const offsets = letterOffsets();
  const half = MEDIA_TOTAL_WIDTH / 2;
  return MEDIA_GLYPHS.flatMap((glyph, i) =>
    glyph.polygons.map((poly) =>
      poly.map(([x, y]): Vec2 => [(x + offsets[i] - half) * MEDIA_SCALE, y * MEDIA_SCALE + MEDIA_BASE_Y]),
    ),
  );
}

export interface SculptureHalves {
  /** Seite der Normale n = (−sin 6°, cos 6°), also oberhalb des Schnitts */
  readonly upper: THREE.BufferGeometry;
  readonly lower: THREE.BufferGeometry;
}

/**
 * Kleinste Teilflaeche (m²), die nach dem Schnitt erhalten bleibt. Der Schnitt
 * streift die unteren Spitzen der M-Diagonalen (y 0,34 knapp unter der Linie)
 * und liesse dort zwei ~1-cm²-Reste stehen (7e-5 bzw. 8e-5 m²), die extrudiert
 * als 1,6 m lange, voll gluehende Staebe frei im Spalt schweben. Das naechst-
 * kleinere echte Teil hat 0,24 m², die Grenze liegt weit dazwischen.
 */
const SLIVER_MIN_AREA = 0.01;

function polygonArea(poly: readonly Vec2[]): number {
  const twice = poly.reduce((sum, a, i) => {
    const b = poly[(i + 1) % poly.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  return Math.abs(twice) / 2;
}

function withoutSlivers(polys: readonly Vec2[][]): Vec2[][] {
  return polys.filter((p) => polygonArea(p) >= SLIVER_MIN_AREA);
}

/**
 * Teilt die Polygone per Sutherland-Hodgman an der 6°-Geraden durch (0, 1,6),
 * verwirft Schnitt-Reste unter SLIVER_MIN_AREA und extrudiert jede Haelfte
 * (Tiefe 1,6, ohne Fase, z zentriert).
 * Der Aufrufer ist Besitzer der Geometrien und disposed sie.
 */
export function buildSculptureHalves(): SculptureHalves {
  const origin: Vec2 = [SCULPTURE.center[0], SCULPTURE.center[1]];
  const { upper, lower } = splitPolygons(buildMediaPolygons(), origin, CUT_NORMAL);
  return {
    upper: extrudePolygons(withoutSlivers(upper), { depth: SCULPTURE.depth }),
    lower: extrudePolygons(withoutSlivers(lower), { depth: SCULPTURE.depth }),
  };
}

export function disposeSculptureHalves(halves: SculptureHalves): void {
  halves.upper.dispose();
  halves.lower.dispose();
}
