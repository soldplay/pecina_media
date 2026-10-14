'use client';

/**
 * Station III, Abzug (06): Papierstreifen 0,17 × 0,05, zeigt das Formwort
 * ungespiegelt mit Spalt. Der Druck wird per 6°-Scan freigelegt
 * (uProof = smoothstep(0,75, 1, cut2)). DESIGN_SPEC §3.3.3, docs/build/P4.md.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COPY } from '@/content/site';
import { COLORS, CUT_TAN } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { smoothstep } from '@/lib/scene/math';
import { stationPhases } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { useCanvasTexture } from '@/lib/three/canvas-texture';
import { PROOF_STRIP, PROOF_TEXTURE, drawProof, leadFontSpecs, resolvePaperFonts } from './textures';
import type { LightUniform } from './TopSheet';

interface ProofStripProps {
  id: StationId;
  reduced: boolean;
  light: LightUniform;
}

/** Steigung der 6°-Linie im UV-Raum: tan 6° · Breite / Hoehe */
const UV_SLOPE = CUT_TAN * (PROOF_STRIP.w / PROOF_STRIP.h);
const UV_REACH = 0.5 * UV_SLOPE + 0.02;

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  vUv = uv;
  vNormalW = normalize( mat3( modelMatrix ) * normal );
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uPrint;
uniform float uProof;
uniform vec3 uPaper;
uniform vec3 uLightDir;
uniform vec3 uGlow;
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  float e = vUv.y - ( vUv.x - 0.5 ) * ${UV_SLOPE.toFixed(5)};
  float f = mix( -${UV_REACH.toFixed(4)}, 1.0 + ${UV_REACH.toFixed(4)}, uProof );
  float aa = max( fwidth( e ), 1e-4 );
  float printed = 1.0 - smoothstep( f - aa, f + aa, e );
  vec3 tex = mix( uPaper, texture2D( uPrint, vUv ).rgb, printed );
  float light = 0.75 + 0.25 * max( dot( normalize( vNormalW ), normalize( uLightDir ) ), 0.0 );
  vec3 col = tex * light;
  float edge = ( 1.0 - smoothstep( 0.0, 0.02, abs( e - f ) ) ) * step( 0.001, uProof ) * step( uProof, 0.999 );
  col += uGlow * 2.5 * edge;
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function createProofMaterial(light: LightUniform): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uPrint: { value: null },
      uProof: { value: 0 },
      uPaper: { value: new THREE.Color(COLORS.paper) },
      uLightDir: light,
      uGlow: { value: new THREE.Color(COLORS.glow) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
  });
}

/** Uniform-Werte sind three-Objekte ausserhalb von React (Hot Path). */
function assignPrint(material: THREE.ShaderMaterial, texture: THREE.Texture | null): void {
  material.uniforms.uPrint.value = texture;
}

function applyProof(material: THREE.ShaderMaterial, cut2: number): void {
  material.uniforms.uProof.value = smoothstep(0.75, 1, cut2);
}

export default function ProofStrip({ id, reduced, light }: ProofStripProps) {
  const fonts = useMemo(() => resolvePaperFonts(), []);
  const specs = useMemo(() => leadFontSpecs(fonts), [fonts]);
  const word = COPY.scene3d.proof;
  const print = useCanvasTexture(
    PROOF_TEXTURE.w,
    PROOF_TEXTURE.h,
    (ctx, w, h) => drawProof(ctx, w, h, fonts, word),
    [fonts, word],
    specs,
  );
  const geometry = useMemo(() => new THREE.PlaneGeometry(PROOF_STRIP.w, PROOF_STRIP.h), []);
  const material = useMemo(() => createProofMaterial(light), [light]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    assignPrint(material, print);
    keepAlive(200);
  }, [material, print]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const { cut2 } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
    applyProof(material, cut2);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[PROOF_STRIP.x, PROOF_STRIP.y, PROOF_STRIP.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={print !== null}
    />
  );
}
