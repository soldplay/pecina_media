'use client';

/**
 * Lichtklinge hinter dem Spalt (DESIGN_SPEC §3.1): Plane W × h bei z −1,4
 * durch (0, 1,6), um 6° gedreht, Farbe #FFE3B8 ohne Tonemapping.
 * h = mix(0,04, 0,9, o). Sie steht auch vor dem Aufbau der Skulptur im Bild,
 * damit die Preloader-Linie (DOM) in sie ueberblenden kann.
 * Licht dazu liefert der feste bladeLight des Rigs (P1), hier kein eigenes.
 *
 * Abnahme 14.10.2026 (Durchflug ueberbelichtet): Statt einer flachen, deckenden
 * Flaeche ein leuchtender Spalt mit Falloff — heisser Kern, gedaempftes Band,
 * weicher Halo zu den Raendern (geschlossen: gleichmaessige Linie), additiv. Nahe vor der Klinge
 * (Kamera im Spalt) gedimmt; mindestens 2 px dick, auch wenn die Hero-Kamera bei
 * kleinen Fenstern weit zuruecksteht. Breite 80 m (deckt auch dann die Bildbreite).
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, type RootState } from '@react-three/fiber';
import { COLORS, CUT_RAD } from '@/lib/brand';
import { SCULPTURE } from '@/lib/scene/stations';
import { bladeHeight, bladeOpenness, bladeProximityGain, type HeroState } from './hero-timeline';

const BLADE_WIDTH = 80;
const BLADE_POSITION: [number, number, number] = [SCULPTURE.center[0], SCULPTURE.center[1], SCULPTURE.bladeZ];
/** Helligkeit des Kerns (linear); ~1,2 Luminanz → leichter Bloom-Saum, nur der Kern */
const BLADE_GAIN = 1.5;
/** Mindestdicke im Bild */
const BLADE_MIN_PX = 2.2;
const EPS = 1e-4;

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vBladeUv;
varying float vBladeWorldY;

void main() {
  vBladeUv = uv * 2.0 - 1.0;
  vBladeWorldY = ( modelMatrix * vec4( position, 1.0 ) ).y;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/**
 * uOpen 0 → 1: geschlossen leuchtet die ganze (schmale) Hoehe gleichmaessig
 * (Kernfarbe); offen ein heisser Kern (Gauss, ~12 % der Hoehe) in #FFE3B8, ein
 * gedaempftes Band (24 %) und ein weicher Halo bis zum Rand in Glow #FFB257.
 * Fix-Runde 3: Band und Halo waren kernfarben (beiger Nebelstreifen im
 * Durchflug); jetzt orange und bei offenem Spalt mit halbem Anteil
 * (Band 0,38 → 0,19, Halo 0,32 → 0,16) — eine glühende Werkfuge statt Dunst.
 */
const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uIntensity;
uniform float uOpen;
#include <common>
#include <fog_pars_fragment>
varying vec2 vBladeUv;
varying float vBladeWorldY;

void main() {
  #ifdef BLADE_BELOW_FLOOR
    if ( vBladeWorldY >= 0.0 ) discard;
  #endif
  float across = abs( vBladeUv.y );
  float aa = max( fwidth( across ) * 1.5, 0.01 );
  float bandWidth = mix( 1.0, 0.24, uOpen );
  float band = ( 1.0 - smoothstep( bandWidth, bandWidth + aa, across ) ) * mix( 1.0, 0.19, uOpen );
  float hot = exp( -pow( across / 0.12, 2.0 ) ) * uOpen;
  float halo = pow( max( 1.0 - across, 0.0 ), 2.4 ) * 0.16 * uOpen;
  float ends = 1.0 - smoothstep( 0.85, 1.0, abs( vBladeUv.x ) );
  vec3 outer = mix( uColor, uGlow, uOpen ) * max( band, halo );
  vec3 col = max( uColor * hot, outer );
  gl_FragColor = vec4( col * ends * uIntensity, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

interface BladeUniforms {
  [name: string]: THREE.IUniform;
  uColor: THREE.IUniform<THREE.Color>;
  uGlow: THREE.IUniform<THREE.Color>;
  uIntensity: THREE.IUniform<number>;
  uOpen: THREE.IUniform<number>;
}

interface BladeMaterials {
  readonly uniforms: BladeUniforms;
  /** ueber dem Boden, mit Tiefentest (Lettern verdecken die Klinge) */
  readonly above: THREE.ShaderMaterial;
  /**
   * Teil unter der Bodenebene: Die 6°-Gerade durch y 1,6 taucht bei x −15,2 m in
   * den Boden. Kleine Fenster (Hero-Kamera weit zurueck) sehen dort hin; ohne
   * diesen Teil endete die Klinge links mitten im Bild. Ohne Tiefentest — dort
   * steht kein anderes Objekt (Skulptur ±6,4 m, Monolithe hinter der Klinge
   * bei |x| < 4).
   */
  readonly below: THREE.ShaderMaterial;
}

function createBladeMaterials(): BladeMaterials {
  const uniforms: BladeUniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uColor: { value: new THREE.Color(COLORS.blade) },
    uGlow: { value: new THREE.Color(COLORS.glow) },
    uIntensity: { value: BLADE_GAIN },
    uOpen: { value: 0 },
  };
  const create = (belowFloor: boolean): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: belowFloor ? { BLADE_BELOW_FLOOR: '' } : {},
      fog: true,
      transparent: true,
      depthWrite: false,
      depthTest: !belowFloor,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  return { uniforms, above: create(false), below: create(true) };
}

/** Hoehe in m, die auf dem Bildschirm `px` Pixel ergibt (Abstand Kamera → Klingenebene). */
function worldPerPixels(state: RootState, px: number): number {
  const camera = state.camera;
  if (!(camera instanceof THREE.PerspectiveCamera)) return 0;
  const distance = Math.max(0.01, camera.position.z - SCULPTURE.bladeZ);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return ((2 * distance * tanHalf) / Math.max(1, state.size.height)) * px;
}

/** Hoehe, Kernbreite und Helligkeit pro Frame; nur bei Aenderung schreiben (Hot Path). */
function applyBlade(group: THREE.Group | null, u: BladeUniforms, hero: HeroState, state: RootState): void {
  if (!group) return;
  const height = Math.max(bladeHeight(hero.open), worldPerPixels(state, BLADE_MIN_PX));
  if (Math.abs(group.scale.y - height) > EPS) group.scale.y = height;
  const openness = bladeOpenness(hero.open);
  if (Math.abs(u.uOpen.value - openness) > EPS) u.uOpen.value = openness;
  const intensity = BLADE_GAIN * bladeProximityGain(state.camera.position.z);
  if (Math.abs(u.uIntensity.value - intensity) > EPS) u.uIntensity.value = intensity;
}

export interface LightBladeProps {
  heroRef: RefObject<HeroState>;
}

/** Ueber dem Boden zuerst, danach der Teil darunter (ohne Tiefentest). */
const BELOW_FLOOR_RENDER_ORDER = 1;

export default function LightBlade({ heroRef }: LightBladeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materials = useMemo(() => createBladeMaterials(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(BLADE_WIDTH, 1), []);

  useEffect(
    () => () => {
      materials.above.dispose();
      materials.below.dispose();
      geometry.dispose();
    },
    [materials, geometry],
  );

  useFrame((state) => applyBlade(groupRef.current, materials.uniforms, heroRef.current, state));

  return (
    <group ref={groupRef} position={BLADE_POSITION} rotation-z={CUT_RAD} scale-y={bladeHeight(0)}>
      <mesh geometry={geometry} material={materials.above} />
      <mesh geometry={geometry} material={materials.below} renderOrder={BELOW_FLOOR_RENDER_ORDER} />
    </group>
  );
}
