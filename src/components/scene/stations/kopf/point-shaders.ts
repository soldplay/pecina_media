/**
 * Station IV (Kopf): Shader fuer Punktwolke und Netzlinien (DESIGN_SPEC
 * §3.3.4, docs/build/P4.md). Beide nutzen ShaderMaterial mit Fog.
 *
 * Punkte: Die Sichtbarkeit wird an der Ursprungsposition aPos gegen dieselbe
 * Ebene geprueft wie der Marmor (CUT_GLSL, Weltraum, gleiche Uniform-Objekte,
 * gleiches Rauschen) — Punkte erscheinen genau dort, wo der Marmor
 * verschwindet.
 */

import * as THREE from 'three';
import { COLORS } from '@/lib/brand';
import { lerp, smoothstep } from '@/lib/scene/math';
import { CUT_GLSL, type CutUniforms } from '@/lib/three/cut';

/** Gleiche Verrauschung wie patchCutMaterial im Modus 'dissolve'. */
const DISSOLVE_NOISE_SCALE = '9.0';

/**
 * Ebenen-Origin y (Station-lokal) fuer Marmor, Punkte und Netz. Spec:
 * mix(1,0, 1,80, cut1), dann zurueck auf 1,0 ueber smoothstep(0, 0,4, cut2).
 * Unten/oben je ~4 cm Rand, weil das Dissolve-Rauschen (±0,03) die Kante
 * verschiebt: sonst franst der Sockel der Bueste in Ruhe aus bzw. bleibt
 * der Scheitel bei cut1 = 1 stehen.
 */
export const KOPF_PLANE = Object.freeze({ rest: 0.96, top: 1.82 });

export function kopfPlaneY(cut1: number, cut2: number, reduced: boolean): number {
  if (reduced) return KOPF_PLANE.rest;
  const up = lerp(KOPF_PLANE.rest, KOPF_PLANE.top, cut1);
  return lerp(up, KOPF_PLANE.rest, smoothstep(0, 0.4, cut2));
}

/** Zwilling: aTarget = aPos + TWIN_OFFSET (Station-lokal). */
export const TWIN_OFFSET = Object.freeze([0.55, 0, 0.05] as const);

export const POINTS_VERTEX = /* glsl */ `
${CUT_GLSL}
#include <fog_pars_vertex>
uniform float uTwin;
uniform float uTime;
uniform float uSize;
uniform float uDpr;
uniform vec3 uCenter;
attribute vec3 aPos;
attribute vec3 aTarget;
attribute float aSeed;
varying float vAlpha;
varying float vTwin;

void main() {
  vec4 worldOrigin = modelMatrix * vec4( aPos, 1.0 );
  vCutPos = worldOrigin.xyz;
  float cs = cutSide( worldOrigin.xyz ) + ( vnoise( worldOrigin.xyz * ${DISSOLVE_NOISE_SCALE} ) - 0.5 ) * uNoiseAmp * 2.0;
  float below = 1.0 - smoothstep( -0.002, 0.002, cs );
  float visible = max( below, smoothstep( 0.0, 0.05, uTwin ) );

  float tp = smoothstep( aSeed * 0.3, aSeed * 0.3 + 0.7, uTwin );
  vec3 offset = aTarget - aPos;
  vec3 p = aPos + offset * tp;
  vec3 dir = p - ( uCenter + offset * tp );
  float len = length( dir );
  p += ( len > 1e-5 ? dir / len : vec3( 0.0 ) ) * 0.004 * sin( uTime * 1.3 + aSeed * 30.0 );

  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize * uDpr / max( -mvPosition.z, 0.05 ) * ( 0.8 + 0.4 * aSeed );
  if ( visible < 0.001 ) {
    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
    gl_PointSize = 1.0;
  }
  vAlpha = visible;
  vTwin = tp;
  #include <fog_vertex>
}
`;

export const POINTS_FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vAlpha;
varying float vTwin;

void main() {
  float r = length( gl_PointCoord - 0.5 );
  float a = ( 1.0 - smoothstep( 0.3, 0.5, r ) ) * vAlpha;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( mix( uColorA, uColorB, vTwin ), a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export const LINES_VERTEX = /* glsl */ `
#include <fog_pars_vertex>
attribute float aDist;
attribute float aT;
varying float vDist;
varying float vT;

void main() {
  vDist = aDist;
  vT = aT;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/**
 * Dash nach Spec: alpha = uLines · step(0.5, fract(vDist·10 − uTime·1.2)) · 0.8,
 * mit uDash 0 durchgehend (NetworkLines, Fix-Runde 3: ruhige Boegen).
 * Zusaetzlich waechst die Linie mit uGrow vom Punkt zum Knoten und zieht sich
 * mit uRetract in den Knoten zurueck.
 */
export const LINES_FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
uniform float uLines;
uniform float uTime;
uniform float uGrow;
uniform float uRetract;
uniform float uDash;
uniform vec3 uColor;
varying float vDist;
varying float vT;

void main() {
  float dash = mix( 1.0, step( 0.5, fract( vDist * 10.0 - uTime * 1.2 ) ), uDash );
  float mask = step( vT, uGrow ) * step( uRetract, vT );
  float a = uLines * dash * 0.8 * mask;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor, a );
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export interface PointUniforms {
  [key: string]: THREE.IUniform;
  uTwin: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uSize: THREE.IUniform<number>;
  uDpr: THREE.IUniform<number>;
  uCenter: THREE.IUniform<THREE.Vector3>;
  uColorA: THREE.IUniform<THREE.Color>;
  uColorB: THREE.IUniform<THREE.Color>;
}

/** Punkt-Material; die Schnitt-Uniforms werden per Referenz mit BustCut geteilt. */
export function createPointsMaterial(cut: CutUniforms, center: THREE.Vector3): THREE.ShaderMaterial {
  const own: PointUniforms = {
    uTwin: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: 4 },
    uDpr: { value: 1 },
    uCenter: { value: center.clone() },
    uColorA: { value: new THREE.Color(COLORS.paper) },
    uColorB: { value: new THREE.Color(COLORS.brand) },
  };
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...cut, ...own },
    vertexShader: POINTS_VERTEX,
    fragmentShader: POINTS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: true,
  });
}

export function createLinesMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uLines: { value: 0 },
      uTime: { value: 0 },
      uGrow: { value: 0 },
      uRetract: { value: 0 },
      uDash: { value: 1 },
      uColor: { value: new THREE.Color(COLORS.glow) },
    },
    vertexShader: LINES_VERTEX,
    fragmentShader: LINES_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
}
