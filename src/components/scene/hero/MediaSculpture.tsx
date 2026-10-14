'use client';

/**
 * MEDIA-Skulptur (DESIGN_SPEC §3.1): zwei extrudierte Haelften, je in eigener
 * Gruppe, 2 Draw Calls, ein gemeinsames Material mit Schnitt-Shader
 * (mode 'edge', space 'object'): der Saum am Schnitt glueht #FFB257, die
 * Schnittflaechen selbst schimmern nur (faceGlow); nahe der Klinge gedimmt.
 * Zusaetzlich ein Dissolve fuer den Aufbau (uAssemble 0 → 1, Sweep links → rechts).
 *
 * Alle Zeitwerte kommen aus dem HeroState (hero-timeline.ts), den
 * TypoArchitecture pro Frame vor diesem useFrame schreibt.
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS } from '@/lib/brand';
import { CUT_LOCAL_NORMAL, SCULPTURE } from '@/lib/scene/stations';
import { createCutUniforms, patchCutMaterial, type CutUniforms } from '@/lib/three/cut';
import { assembleAt, bladeProximityGain, glowStrength, halfOffset, GLOW_BASE, type HeroState } from './hero-timeline';
import type { SculptureHalves } from './media-glyphs';

/** Breite der glühenden Kante in Objekt-Metern (§3.1) */
const EDGE_WIDTH = 0.035;
/**
 * Abnahme 14.10.2026: Die Schnittflaechen der Lettern gluehten vollflaechig; im
 * Durchflug fuellten sie das Bild. Jetzt glueht nur der Saum an den Vorder-,
 * Rueck- und Seitenflaechen, die Schnittflaechen selbst schimmern (Anteil).
 */
const FACE_GLOW = 0.12;

const MATERIAL_HIGH = Object.freeze({ roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 });
const MATERIAL_MID = Object.freeze({ roughness: 0.4 });

/**
 * Abnahme 14.10.2026, Fix-Runde 3: Die Seitenwaende der Lettern (alles, was nicht
 * nach vorn/hinten zeigt: Laibungen, Ober-/Unterseiten, Schnittflaechen) waren
 * lachsgrau — der Klarlack spiegelte die graue Studio-HDRI, kaum Tonwertabstand
 * zur Front. Jetzt: Wand-Albedo dunkles Orange-Braun, Umgebungslicht dort × 0,3,
 * matt (Rauheit 0,78, ohne Klarlack).
 * Front und Rueckseite bleiben kraeftiges Markenorange → kantige Licht-Schatten-
 * Kanten wie im Logo. Kein zusaetzlicher Draw Call (Objekt-Normale im Shader).
 */
const WALL = Object.freeze({
  color: '#6E3F06',
  envGain: 0.3,
  /**
   * Matt statt Klarlack: Im Durchflug spiegelten die Ober-/Unterseiten der
   * Lettern Key- und bladeLight als pfirsichfarbene Glanzflaechen (RGB ~220/137/57).
   */
  roughness: 0.78,
  /** |n_obj.z| darunter zaehlt als Wand (weicher Uebergang bis 0,65) */
  from: 0.35,
  to: 0.65,
});

/**
 * Dissolve-Snippet nach Spec §3.1, mit einer Korrektur: die Front laeuft ueber
 * `uAssemble * 1.25 - 0.25` statt `uAssemble * 1.25`. Sonst waere bei
 * uAssemble = 0 das linke Viertel (Sweep < 0,25) bereits teilweise sichtbar.
 * Jetzt gilt: 0 = alles verworfen, 1 = alles sichtbar.
 */
const ASSEMBLE_HEAD = /* glsl */ `
uniform float uAssemble;
`;
const ASSEMBLE_MAIN = /* glsl */ `
if ( uAssemble < 1.0 ) {
  float pmSweep = clamp( ( dot( vCutPos.xy, vec2( 0.9945, 0.1045 ) ) + 6.2 ) / 12.4, 0.0, 1.0 );
  if ( hash13( floor( vCutPos * 40.0 ) ) > smoothstep( pmSweep - 0.25, pmSweep, uAssemble * 1.25 - 0.25 ) ) discard;
}
`;

const WALL_VERTEX_HEAD = /* glsl */ `
varying vec3 vPmObjNormal;
`;
const WALL_VERTEX_MAIN = /* glsl */ `
vPmObjNormal = objectNormal;
`;
const WALL_HEAD = /* glsl */ `
uniform vec3 uPmWallColor;
uniform float uPmWallEnv;
varying vec3 vPmObjNormal;
`;
/** Nach dem Dissolve: Wand-Anteil aus der Objekt-Normale, Albedo und Umgebungsanteil. */
const WALL_MAIN = /* glsl */ `
float pmWall = 1.0 - smoothstep( ${WALL.from.toFixed(2)}, ${WALL.to.toFixed(2)}, abs( normalize( vPmObjNormal ).z ) );
diffuseColor.rgb = mix( diffuseColor.rgb, uPmWallColor, pmWall );
float pmEnvGain = mix( 1.0, uPmWallEnv, pmWall );
`;
const WALL_MATERIAL = /* glsl */ `
material.roughness = mix( material.roughness, ${WALL.roughness.toFixed(2)}, pmWall );
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - pmWall;
#endif
`;
const WALL_LIGHTS = /* glsl */ `
#if defined( RE_IndirectDiffuse )
  iblIrradiance *= pmEnvGain;
#endif
#if defined( RE_IndirectSpecular )
  radiance *= pmEnvGain;
  clearcoatRadiance *= pmEnvGain;
#endif
`;

interface SculptureShader {
  readonly uniforms: CutUniforms;
  readonly assemble: THREE.IUniform<number>;
  readonly wallColor: THREE.IUniform<THREE.Color>;
  readonly wallEnv: THREE.IUniform<number>;
}

function createSculptureShader(): SculptureShader {
  return {
    uniforms: createCutUniforms({
      uCutOrigin: SCULPTURE.center,
      uCutNormal: CUT_LOCAL_NORMAL,
      uCutEdge: EDGE_WIDTH,
      uCutGlow: COLORS.glow,
      uCutGlowStrength: GLOW_BASE,
    }),
    assemble: { value: 0 },
    wallColor: { value: new THREE.Color(WALL.color) },
    wallEnv: { value: WALL.envGain },
  };
}

function createSculptureMaterial(physical: boolean, shader: SculptureShader): THREE.MeshStandardMaterial {
  const material = physical
    ? new THREE.MeshPhysicalMaterial({ color: COLORS.brand, ...MATERIAL_HIGH })
    : new THREE.MeshStandardMaterial({ color: COLORS.brand, ...MATERIAL_MID });
  patchCutMaterial(material, shader.uniforms, {
    // -walls: eigener Programm-Schluessel (Shader-Code mit Wand-Abdunklung)
    key: physical ? 'hero-sculpture-physical-walls' : 'hero-sculpture-standard-walls',
    mode: 'edge',
    space: 'object',
    faceGlow: FACE_GLOW,
    extra: {
      uniforms: { uAssemble: shader.assemble, uPmWallColor: shader.wallColor, uPmWallEnv: shader.wallEnv },
      vertexHead: WALL_VERTEX_HEAD,
      vertexMain: WALL_VERTEX_MAIN,
      fragmentHead: `${ASSEMBLE_HEAD}${WALL_HEAD}`,
      fragmentMainStart: `${ASSEMBLE_MAIN}${WALL_MAIN}`,
      fragmentMaterial: WALL_MATERIAL,
      fragmentLights: WALL_LIGHTS,
    },
  });
  return material;
}

/**
 * Three-Objekte ausserhalb von React (Hot Path): Gruppen-Versatz und Uniforms
 * werden bewusst in-place gesetzt, ohne Recompile.
 */
function applySculptureFrame(
  upper: THREE.Group | null,
  lower: THREE.Group | null,
  shader: SculptureShader,
  material: THREE.MeshStandardMaterial,
  hero: HeroState,
  cameraZ: number,
): void {
  const [x, y] = halfOffset(hero.open, hero.hover);
  upper?.position.set(x, y, 0);
  lower?.position.set(-x, -y, 0);
  const near = bladeProximityGain(cameraZ);
  shader.uniforms.uCutGlowStrength.value = glowStrength(hero) * near;
  // Im Spalt sieht man die Schnittflaechen streifend: Fresnel spiegelt dort fast
  // die volle Umgebung (Klarlack) — ohne Daempfung lachsfarbene, flaechige Glanzflaechen.
  if (material.envMapIntensity !== near) material.envMapIntensity = near;
  shader.assemble.value = assembleAt(hero.intro);
}

export interface MediaSculptureProps {
  halves: SculptureHalves;
  heroRef: RefObject<HeroState>;
  /** MeshPhysicalMaterial (Tier high mit HDRI) statt MeshStandardMaterial */
  physical: boolean;
}

export default function MediaSculpture({ halves, heroRef, physical }: MediaSculptureProps) {
  const upperRef = useRef<THREE.Group>(null);
  const lowerRef = useRef<THREE.Group>(null);
  const shader = useMemo(() => createSculptureShader(), []);
  const material = useMemo(() => createSculptureMaterial(physical, shader), [physical, shader]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) =>
    applySculptureFrame(upperRef.current, lowerRef.current, shader, material, heroRef.current, state.camera.position.z),
  );

  return (
    <>
      <group ref={upperRef}>
        <mesh geometry={halves.upper} material={material} />
      </group>
      <group ref={lowerRef}>
        <mesh geometry={halves.lower} material={material} />
      </group>
    </>
  );
}
