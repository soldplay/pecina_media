/**
 * Polygone an einer Geraden teilen und extrudieren (DESIGN_SPEC §3.1, §5.3):
 * MEDIA-Skulptur, Werkfuge-Sockel, 404-Ziffern. Reine Funktionen, die
 * Eingaben werden nie veraendert.
 *
 * Konvexe Polygone werden VOR dem Extrudieren per Sutherland-Hodgman geteilt;
 * so entstehen geschlossene Schnittflaechen ohne CSG.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec2 = readonly [number, number];

const SIDE_EPS = 1e-9;
const POINT_EPS = 1e-9;
const AREA_EPS = 1e-10;

function sideOf(p: Vec2, origin: Vec2, normal: Vec2): number {
  return (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1];
}

function intersect(a: Vec2, b: Vec2, da: number, db: number): Vec2 {
  const t = da / (da - db);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a[0] - b[0]) < POINT_EPS && Math.abs(a[1] - b[1]) < POINT_EPS;
}

function signedArea(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** Entfernt aufeinanderfolgende Duplikate (inkl. letzter = erster). */
function dedupe(points: readonly Vec2[]): Vec2[] {
  const out = points.filter((p, i) => i === 0 || !samePoint(p, points[i - 1]));
  return out.length > 1 && samePoint(out[0], out[out.length - 1]) ? out.slice(0, -1) : out;
}

/**
 * Schneidet ein (konvexes) Polygon an der Geraden durch `origin` mit Normale
 * `normal` und behaelt die Seite `keep` ('positive' = Seite der Normale).
 * Ergebnisse mit weniger als 3 Punkten oder ohne Flaeche → [].
 */
export function clipPolygonHalfPlane(
  poly: readonly Vec2[],
  origin: Vec2,
  normal: Vec2,
  keep: 'positive' | 'negative',
): Vec2[] {
  if (poly.length < 3) return [];
  const sign = keep === 'positive' ? 1 : -1;
  const out: Vec2[] = [];

  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const dCur = sideOf(cur, origin, normal) * sign;
    const dPrev = sideOf(prev, origin, normal) * sign;
    const curIn = dCur >= -SIDE_EPS;
    const prevIn = dPrev >= -SIDE_EPS;

    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur, dPrev, dCur));
      out.push([cur[0], cur[1]]);
    } else if (prevIn) {
      out.push(intersect(prev, cur, dPrev, dCur));
    }
  }

  const cleaned = dedupe(out);
  if (cleaned.length < 3 || Math.abs(signedArea(cleaned)) < AREA_EPS) return [];
  return cleaned;
}

/**
 * Teilt alle Polygone an der Geraden: `upper` = Seite der Normale
 * (bei n = (−sin 6°, cos 6°) oben), `lower` = Gegenseite. Leere Teile entfallen.
 */
export function splitPolygons(
  polys: readonly (readonly Vec2[])[],
  origin: Vec2,
  normal: Vec2,
): { upper: Vec2[][]; lower: Vec2[][] } {
  const upper = polys.map((p) => clipPolygonHalfPlane(p, origin, normal, 'positive')).filter((p) => p.length >= 3);
  const lower = polys.map((p) => clipPolygonHalfPlane(p, origin, normal, 'negative')).filter((p) => p.length >= 3);
  return { upper, lower };
}

export interface ExtrudeOptions {
  depth: number;
  /** Standard: keine Fase (aneinanderstossende Polygone wuerden sonst z-fighten) */
  bevel?: { size: number; thickness: number; segments: number };
}

/**
 * Extrudiert jedes Polygon (eine THREE.Shape je Polygon), zentriert in z
 * (−depth/2 … +depth/2), entfernt die Material-Gruppen und fuehrt alles zu
 * EINER BufferGeometry zusammen (1 Draw Call). Leere Eingabe → leere Geometrie.
 */
export function extrudePolygons(polys: readonly (readonly Vec2[])[], opts: ExtrudeOptions): THREE.BufferGeometry {
  const { depth, bevel } = opts;
  const valid = polys.filter((p) => p.length >= 3);
  if (valid.length === 0) return new THREE.BufferGeometry();

  const parts = valid.map((poly) => {
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      curveSegments: 1,
      bevelEnabled: Boolean(bevel),
      bevelSize: bevel?.size ?? 0,
      bevelThickness: bevel?.thickness ?? 0,
      bevelSegments: bevel?.segments ?? 1,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.clearGroups();
    return geometry;
  });

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) throw new Error('extrudePolygons: mergeGeometries ist fehlgeschlagen');
  merged.computeBoundingBox();
  return merged;
}
