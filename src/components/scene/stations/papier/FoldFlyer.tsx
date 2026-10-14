'use client';

/**
 * Station III, Stretch: Wickelfalz-Flyer mit Halbton-Druck (DESIGN_SPEC
 * §3.3.3). Drei Felder; ab beat b 0,85 faltet erst das rechte Feld ein, dann
 * das linke darueber (scrollgekoppelt bis b 1,0). Halbton prozedural (Kreis
 * und 6°-Balken), keine Textur, kein Text. Nur bei config.stretch.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS, CUT_TAN } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { smoothstep } from '@/lib/scene/math';
import { frame } from '@/lib/scene/store';
import type { LightUniform } from './TopSheet';

interface FoldFlyerProps {
  id: StationId;
  reduced: boolean;
  light: LightUniform;
}

/** Offen 0,27 × 0,19 (drei Felder à 0,09), liegt auf dem A4-Blatt links vorn. */
const FLYER_W = 0.27;
const FLYER_H = 0.19;
const FLYER_POS = [-0.4, 1.0335, 0.19] as const;
const FLYER_YAW = -0.06;
const SEGMENTS_X = 36;
/** Faltwinkel (Spec: uFold · 3,05); das innere Feld legt sich flacher an. */
const FOLD_OUTER = 3.05;
const FOLD_INNER = 3.12;
const DOTS = 46;

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uFoldInner;
uniform float uFoldOuter;
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  vUv = uv;
  vec3 p = position;
  vec3 n = vec3( 0.0, 0.0, 1.0 );
  float x0 = ${(FLYER_W / 6).toFixed(5)};
  if ( p.x > x0 + 1e-5 ) {
    // inneres Feld (rechts) faltet zuerst ein
    float a = uFoldInner * ${FOLD_INNER.toFixed(3)};
    // gefaltet etwas kuerzer, damit die Kante nicht durch den Gegenfalz sticht
    float dx = ( p.x - x0 ) * mix( 1.0, 0.95, uFoldInner );
    p.x = x0 + dx * cos( a );
    p.z = dx * sin( a ) + 0.0006 * uFoldInner;
    n = vec3( -sin( a ), 0.0, cos( a ) );
  } else if ( p.x < -x0 - 1e-5 ) {
    // aeusseres Feld (links) legt sich darueber
    float a = uFoldOuter * ${FOLD_OUTER.toFixed(3)};
    float dx = p.x + x0;
    p.x = -x0 + dx * cos( a );
    p.z = -dx * sin( a ) + 0.0028 * uFoldOuter;
    n = vec3( sin( a ), 0.0, cos( a ) );
  }
  vNormalW = normalize( mat3( modelMatrix ) * n );
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uPaper;
uniform vec3 uBack;
uniform vec3 uInk;
uniform vec3 uBrand;
uniform vec3 uLightDir;
varying vec2 vUv;
varying vec3 vNormalW;

const float ASPECT = ${(FLYER_W / FLYER_H).toFixed(4)};

// Halbton nach Spec: step(length(fract(uv * dots) - .5), sqrt(1. - lum) * .7), antialiased
float halftone( vec2 q, float lum, float angle ) {
  float c = cos( angle );
  float s = sin( angle );
  vec2 r = mat2( c, -s, s, c ) * q * ${DOTS.toFixed(1)};
  float d = length( fract( r ) - 0.5 );
  float radius = sqrt( clamp( 1.0 - lum, 0.0, 1.0 ) ) * 0.7;
  float aa = max( fwidth( d ), 1e-4 );
  return 1.0 - smoothstep( radius - aa, radius + aa, d );
}

void main() {
  vec2 q = vec2( vUv.x * ASPECT, vUv.y );
  // Motiv: Kreis mit Verlauf (orange) und ein 6°-Balken (Ink)
  vec2 cc = vec2( 0.34 * ASPECT, 0.56 );
  float rc = length( q - cc );
  float circle = 1.0 - smoothstep( 0.29, 0.292, rc );
  float circleLum = mix( 0.15, 0.85, clamp( rc / 0.29 + ( q.y - cc.y ) * 0.6, 0.0, 1.0 ) );
  float barCenter = 0.3 + ( q.x - 0.5 * ASPECT ) * ${CUT_TAN.toFixed(4)};
  float bar = ( 1.0 - smoothstep( 0.05, 0.052, abs( q.y - barCenter ) ) ) * step( 0.5 * ASPECT, q.x );
  float barLum = mix( 0.85, 0.2, clamp( ( q.x - 0.5 * ASPECT ) / ( 0.5 * ASPECT ), 0.0, 1.0 ) );

  vec3 front = uPaper;
  front = mix( front, uBrand, circle * halftone( q, circleLum, 0.10472 ) );
  front = mix( front, uInk, bar * halftone( q, barLum, 0.7854 ) );
  vec3 col = gl_FrontFacing ? front : uBack;

  vec3 n = normalize( vNormalW ) * ( gl_FrontFacing ? 1.0 : -1.0 );
  float light = 0.75 + 0.25 * max( dot( n, normalize( uLightDir ) ), 0.0 );
  gl_FragColor = vec4( col * light, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function createFlyerMaterial(light: LightUniform): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uFoldInner: { value: 0 },
      uFoldOuter: { value: 0 },
      uPaper: { value: new THREE.Color(COLORS.paper) },
      uBack: { value: new THREE.Color(COLORS.paper2) },
      uInk: { value: new THREE.Color(COLORS.ink) },
      uBrand: { value: new THREE.Color(COLORS.brand) },
      uLightDir: light,
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/** Faltung scrollgekoppelt ueber beat b 0,85 → 1,0; Reduced: offen (Druck sichtbar). */
function applyFold(material: THREE.ShaderMaterial, b: number, reduced: boolean): void {
  material.uniforms.uFoldInner.value = reduced ? 0 : smoothstep(0.85, 0.93, b);
  material.uniforms.uFoldOuter.value = reduced ? 0 : smoothstep(0.92, 1.0, b);
}

export default function FoldFlyer({ id, reduced, light }: FoldFlyerProps) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(FLYER_W, FLYER_H, SEGMENTS_X, 2), []);
  const material = useMemo(() => createFlyerMaterial(light), [light]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    applyFold(material, frame.beats[`${id}:b`], reduced);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[FLYER_POS[0], FLYER_POS[1], FLYER_POS[2]]}
      rotation={[-Math.PI / 2, 0, FLYER_YAW]}
      frustumCulled={false}
    />
  );
}
