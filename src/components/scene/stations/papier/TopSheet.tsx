'use client';

/**
 * Station III, Schnitt 1 (05): der oberste A4-Bogen. Eine 6°-Linie wandert im
 * UV-Raum nach oben, darunter wird das Kritzel zu Satz, die Kante glueht.
 * Waehrend cut1 0 → 0,4 hebt sich der Bogen um 0,12 und kippt zur Kamera
 * (maath damp 0,35). DESIGN_SPEC §3.3.3, docs/build/P4.md.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import { COPY } from '@/content/site';
import { COLORS, CUT_TAN } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { clamp01 } from '@/lib/scene/math';
import { stationPhases } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { requestFrames } from '../../core/settle';
import { useCanvasTexture } from '@/lib/three/canvas-texture';
import {
  SHEET_TEXTURE,
  drawScribble,
  drawTypeset,
  resolvePaperFonts,
  sheetFontSpecs,
} from './textures';

const SHEET_W = 0.21;
const SHEET_H = 0.297;
const SHEET_POS = [-0.12, 1.036, 0.12] as const;
const SHEET_YAW = 0.08;
const LIFT = 0.12;
const TILT = 0.5;
/** Anheben/Kippen ueber cut1 0 → 0,4 */
const LIFT_RANGE = 0.4;
const DAMP_TIME = 0.35;
/**
 * Abbruch-Genauigkeit der Daempfung (2,5 % des Wegs, unsichtbarer Rest-Sprung):
 * nach einem vollen Sprung ruht der Bogen nach ca. 1 s (Ruhe-Regel 1,2 s).
 * Gemessen mit eps 0,0015: 1,43 s.
 */
const DAMP_EPS_LIFT = 0.003;
const DAMP_EPS_TILT = 0.012;
/** leichtes Durchhaengen der Kanten im angehobenen Zustand (m) */
const SAG = 0.008;
/** Steigung der 6°-Linie im UV-Raum: tan 6° · Breite / Hoehe */
const UV_SLOPE = CUT_TAN * (SHEET_W / SHEET_H);
const GLOW_STRENGTH = 2.5;

export interface LightUniform {
  value: THREE.Vector3;
}

interface TopSheetProps {
  id: StationId;
  reduced: boolean;
  light: LightUniform;
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uSag;
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  vUv = uv;
  vec3 p = position;
  float k = uv.y - 0.5;
  // Kanten haengen leicht durch (Parabel entlang der Laengsachse)
  p.z -= uSag * 4.0 * k * k;
  float slope = -uSag * 8.0 * k / ${SHEET_H.toFixed(3)};
  vec3 n = normalize( vec3( 0.0, -slope, 1.0 ) );
  vNormalW = normalize( mat3( modelMatrix ) * n );
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uScribble;
uniform sampler2D uType;
uniform float uCut;
uniform vec3 uLightDir;
uniform vec3 uGlow;
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  float e = vUv.y - ( vUv.x - 0.5 ) * ${UV_SLOPE.toFixed(5)};
  float f = mix( -0.12, 1.12, uCut );
  float aa = max( fwidth( e ), 1e-4 );
  float below = 1.0 - smoothstep( f - aa, f + aa, e );
  vec3 scribble = texture2D( uScribble, vUv ).rgb;
  vec3 typeset = texture2D( uType, vUv ).rgb;
  vec3 tex = mix( scribble, typeset, below );

  vec3 n = normalize( vNormalW );
  float light = 0.75 + 0.25 * max( dot( n, normalize( uLightDir ) ), 0.0 );
  vec3 col = tex * light;

  float edge = ( 1.0 - smoothstep( 0.0, 0.006, abs( e - f ) ) ) * step( 0.001, uCut ) * step( uCut, 0.999 );
  col += uGlow * ${GLOW_STRENGTH.toFixed(1)} * edge;

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

interface SheetUniforms {
  [key: string]: THREE.IUniform;
  uScribble: THREE.IUniform<THREE.Texture | null>;
  uType: THREE.IUniform<THREE.Texture | null>;
  uCut: THREE.IUniform<number>;
  uSag: THREE.IUniform<number>;
  uLightDir: LightUniform;
  uGlow: THREE.IUniform<THREE.Color>;
}

function createSheetMaterial(light: LightUniform): THREE.ShaderMaterial {
  const uniforms: SheetUniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uScribble: { value: null },
    uType: { value: null },
    uCut: { value: 0 },
    uSag: { value: 0 },
    uLightDir: light,
    uGlow: { value: new THREE.Color(COLORS.glow) },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
  });
}

/** Uniform-Werte sind three-Objekte ausserhalb von React (Hot Path). */
function assignTextures(material: THREE.ShaderMaterial, scribble: THREE.Texture | null, type: THREE.Texture | null): void {
  material.uniforms.uScribble.value = scribble;
  material.uniforms.uType.value = type;
}

interface SheetMotion {
  lift: number;
  tilt: number;
}

/** Setzt Schnitt und Pose; liefert true, solange die Daempfung noch laeuft. */
function applySheet(
  material: THREE.ShaderMaterial,
  pose: THREE.Group,
  motion: SheetMotion,
  cut1: number,
  reduced: boolean,
  delta: number,
): boolean {
  const s = clamp01(cut1 / LIFT_RANGE);
  let moving = false;
  if (reduced) {
    motion.lift = LIFT * s;
    motion.tilt = TILT * s;
  } else {
    const a = easing.damp(motion, 'lift', LIFT * s, DAMP_TIME, delta, Infinity, undefined, DAMP_EPS_LIFT);
    const b = easing.damp(motion, 'tilt', TILT * s, DAMP_TIME, delta, Infinity, undefined, DAMP_EPS_TILT);
    moving = a || b;
  }
  pose.position.y = SHEET_POS[1] + motion.lift;
  pose.rotation.x = motion.tilt;
  material.uniforms.uCut.value = cut1;
  material.uniforms.uSag.value = SAG * clamp01(motion.lift / LIFT);
  return moving;
}

export default function TopSheet({ id, reduced, light }: TopSheetProps) {
  const fonts = useMemo(() => resolvePaperFonts(), []);
  const specs = useMemo(() => sheetFontSpecs(fonts), [fonts]);
  const word = COPY.scene3d.scribbleWord;
  const headline = COPY.scene3d.typeHeadline;

  const scribble = useCanvasTexture(
    SHEET_TEXTURE.w,
    SHEET_TEXTURE.h,
    (ctx, w, h) => drawScribble(ctx, w, h, fonts, word),
    [fonts, word],
    specs,
  );
  const typeset = useCanvasTexture(
    SHEET_TEXTURE.w,
    SHEET_TEXTURE.h,
    (ctx, w, h) => drawTypeset(ctx, w, h, fonts, headline),
    [fonts, headline],
    specs,
  );

  const geometry = useMemo(() => new THREE.PlaneGeometry(SHEET_W, SHEET_H, 32, 48), []);
  const material = useMemo(() => createSheetMaterial(light), [light]);
  const poseRef = useRef<THREE.Group>(null);
  const motion = useRef<SheetMotion>({ lift: 0, tilt: 0 });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    assignTextures(material, scribble, typeset);
    keepAlive(200);
  }, [material, scribble, typeset]);

  useFrame((_, delta) => {
    const pose = poseRef.current;
    if (!frame.stationVisible[id] || !pose) return;
    const { cut1 } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
    // Gedaempft: kein neuer 1,2-s-Nachlauf pro Frame (Ruhe-Kriterium, core/settle.ts).
    if (applySheet(material, pose, motion.current, cut1, reduced, delta)) requestFrames();
  });

  const ready = scribble !== null && typeset !== null;

  return (
    <group ref={poseRef} position={[SHEET_POS[0], SHEET_POS[1], SHEET_POS[2]]}>
      <mesh
        geometry={geometry}
        material={material}
        rotation={[-Math.PI / 2, 0, SHEET_YAW]}
        visible={ready}
        frustumCulled={false}
      />
    </group>
  );
}
