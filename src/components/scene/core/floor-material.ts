/**
 * Boden „Schneidematte“ (DESIGN_SPEC §5.2, P1): ShaderMaterial mit three-Fog.
 *
 * - Grund #141414, Raster 1 m (Paper 7 %) und 0,25 m (Paper 3 %), antialiased
 *   per fwidth; zu dichte Raster blenden aus (kein Moiré in der Tiefe).
 * - 6°-Akzentlinien #D17F0C (22 %) durch die Skulptur (0, 0) und alle vier
 *   Stationen. Auf dem Boden steigen sie nach rechts in die Tiefe:
 *   Richtung (cos 6°, −sin 6°) in (x, z), Normale (sin 6°, cos 6°).
 * - Statisches Rauschen hash(floor(p · 600)) mit Amplitude uNoise
 *   (= mix(0,05, 0, sections.start), gesetzt von Studio). Kein uTime.
 * - Deckkraft-Angaben und Rauschamplitude gelten wie in CSS in (annaehernd)
 *   sRGB (Gamma 2,2): lineares Mischen machte die 1-px-Linien auf dem fast
 *   schwarzen Grund etwa doppelt so hell wie gemeint.
 *
 * Reihenfolge der Ausgabe wie bei three-Materialien: Tonemapping, Farbraum, Fog.
 */

import * as THREE from 'three';
import { COLORS, CUT_COS, CUT_SIN } from '@/lib/brand';
import { STATION_ORDER, STATIONS, WORLD } from '@/lib/scene/stations';

/**
 * z −110 … +50, x ±40: Die Hero-Kamera steht je nach freier Flaeche ueber dem
 * H1-Band bis ca. 31 m vor der Skulptur (hero-framing.ts); Boden-Enden sollen
 * dabei nie ins Bild ragen.
 */
export const FLOOR = Object.freeze({ width: 80, length: 160, centerZ: -30 });

/** Rauschen am Seitenanfang; faellt mit sections.start auf 0. */
export const FLOOR_NOISE_MAX = 0.05;

const GRID_FINE = { spacing: 0.25, alpha: 0.03 } as const;
const GRID_COARSE = { spacing: 1, alpha: 0.07 } as const;
const ACCENT_ALPHA = 0.22;
/** halbe Linienbreite in Metern (vorn ca. 1,2 cm breit, hinten mind. 1 px) */
const ACCENT_HALF_WIDTH = 0.006;
const LINE_COUNT = 1 + STATION_ORDER.length;

const VERTEX = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vFloorXZ;

void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vFloorXZ = worldPosition.xz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#define LINE_COUNT ${LINE_COUNT}

uniform vec3 uBase;
uniform vec3 uPaper;
uniform vec3 uBrand;
uniform vec2 uLinePoints[ LINE_COUNT ];
uniform vec2 uLineNormal;
uniform float uNoise;
varying vec2 vFloorXZ;

#include <fog_pars_fragment>

// 1 an einer Rasterlinie (ca. 1 px breit), 0 dazwischen; blendet aus,
// sobald die Zellen kleiner als ca. 2 px werden.
float gridLine( vec2 p, float spacing ) {
  vec2 c = p / spacing;
  vec2 w = max( fwidth( c ), vec2( 1e-5 ) );
  vec2 g = abs( fract( c - 0.5 ) - 0.5 ) / w;
  float line = 1.0 - min( min( g.x, g.y ), 1.0 );
  float fade = 1.0 - smoothstep( 0.3, 0.6, max( w.x, w.y ) );
  return line * fade;
}

// Hash without Sine (Dave Hoskins, MIT)
float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

vec3 toDisplay( vec3 c ) {
  return pow( max( c, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );
}

vec3 toLinear( vec3 c ) {
  return pow( max( c, vec3( 0.0 ) ), vec3( 2.2 ) );
}

void main() {
  // Deckkraft-Angaben (7 %, 3 %, 22 %) wie in CSS: Mischung in (annaehernd) sRGB.
  vec3 col = toDisplay( uBase );
  vec3 paper = toDisplay( uPaper );
  col = mix( col, paper, ${GRID_FINE.alpha.toFixed(3)} * gridLine( vFloorXZ, ${GRID_FINE.spacing.toFixed(3)} ) );
  col = mix( col, paper, ${GRID_COARSE.alpha.toFixed(3)} * gridLine( vFloorXZ, ${GRID_COARSE.spacing.toFixed(3)} ) );

  float accent = 0.0;
  for ( int i = 0; i < LINE_COUNT; i ++ ) {
    // fwidth auf dem vorzeichenbehafteten Abstand: abs() davor unterschaetzt die
    // Ableitung in Pixel-Quads, die die Linie schneiden (Linie zerfaellt in Striche).
    float sd = dot( vFloorXZ - uLinePoints[ i ], uLineNormal );
    float aa = max( fwidth( sd ), 1e-5 );
    float d = abs( sd );
    float halfWidth = max( ${ACCENT_HALF_WIDTH.toFixed(4)}, 0.5 * aa );
    accent = max( accent, 1.0 - smoothstep( halfWidth, halfWidth + aa, d ) );
  }
  col = mix( col, toDisplay( uBrand ), ${ACCENT_ALPHA.toFixed(3)} * accent );

  if ( uNoise > 0.0 ) {
    float n = hash12( floor( vFloorXZ * 600.0 ) ) - 0.5;
    col += n * 2.0 * uNoise;
  }

  gl_FragColor = vec4( toLinear( col ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export interface FloorUniforms {
  uBase: { value: THREE.Color };
  uPaper: { value: THREE.Color };
  uBrand: { value: THREE.Color };
  uLinePoints: { value: THREE.Vector2[] };
  uLineNormal: { value: THREE.Vector2 };
  uNoise: { value: number };
}

function createFloorUniforms(): FloorUniforms {
  const points = [new THREE.Vector2(0, 0), ...STATION_ORDER.map((id) => new THREE.Vector2(STATIONS[id].position[0], STATIONS[id].position[2]))];
  return {
    uBase: { value: new THREE.Color(WORLD.floorColor) },
    uPaper: { value: new THREE.Color(COLORS.paper) },
    uBrand: { value: new THREE.Color(COLORS.brand) },
    uLinePoints: { value: points },
    uLineNormal: { value: new THREE.Vector2(CUT_SIN, CUT_COS) },
    uNoise: { value: FLOOR_NOISE_MAX },
  };
}

/** Neues Boden-Material (Aufrufer disposed). */
export function createFloorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'pm-floor',
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...createFloorUniforms() },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
  });
}

/** Rauschen setzen (Hot Path, nur der Uniform-Wert). Liefert true bei Aenderung. */
export function setFloorNoise(material: THREE.ShaderMaterial, amount: number): boolean {
  const uniform = material.uniforms.uNoise;
  if (!uniform || uniform.value === amount) return false;
  uniform.value = amount;
  return true;
}
