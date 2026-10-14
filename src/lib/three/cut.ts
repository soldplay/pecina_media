/**
 * Schnitt-Shader fuer MeshStandardMaterial und MeshPhysicalMaterial
 * (DESIGN_SPEC §5.3). Patcht die three-Shader per onBeforeCompile.
 *
 * Einfuegepunkte, geprueft gegen three r186 (ShaderLib/meshphysical.glsl.js;
 * MeshStandardMaterial und MeshPhysicalMaterial teilen diesen Shader, Physical
 * setzt nur zusaetzlich `#define PHYSICAL`):
 *   Vertex:   nach `#include <common>`            varying vec3 vCutPos + extra.vertexHead
 *             nach `#include <project_vertex>`    vCutPos aus `transformed` + extra.vertexMain
 *   Fragment: nach `#include <common>`            CUT_GLSL + extra.fragmentHead
 *             nach `#include <clipping_planes_fragment>`
 *                                                 cs berechnen, clip/dissolve, extra.fragmentMainStart
 *             nach `#include <color_fragment>`    recolor: diffuseColor
 *             nach `#include <roughnessmap_fragment>`  recolor: roughnessFactor
 *             nach `#include <metalnessmap_fragment>`  recolor: metalnessFactor
 *             nach `#include <emissivemap_fragment>`   Gluehen: totalEmissiveRadiance + extra.fragmentEmissive
 *             nach `#include <lights_physical_fragment>` extra.fragmentMaterial (nur wenn gesetzt)
 *             nach `#include <lights_fragment_maps>`   extra.fragmentLights (nur wenn gesetzt)
 *
 * Raum:
 *   'object' — vCutPos = `transformed` (Geometrie-Raum, nach Morph/Skinning,
 *              vor Instanz-/Batch-Matrix). Ebene in Objektkoordinaten angeben.
 *   'world'  — vCutPos = modelMatrix · (Instanz-/Batch-Matrix ·) transformed.
 *              Ebene per setCutPlaneFromObject aus lokalen Werten umrechnen.
 *
 * Uniform-Objekte werden per Referenz in den Shader gehaengt: Werte aendern
 * (uniforms.uCutOffset.value = …) wirkt sofort und ohne Recompile. Mehrere
 * Materialien duerfen dieselben Uniforms teilen.
 *
 * Konvention: cs = dot(p − uCutOrigin, uCutNormal) − uCutOffset; cs > 0 liegt
 * „oberhalb“ (Seite der Normale), cs < 0 „unterhalb“.
 */

import * as THREE from 'three';
import { COLORS, CUT_COS, CUT_SIN } from '@/lib/brand';

export type CutMode = 'edge' | 'recolor' | 'dissolve' | 'clip';
export type CutSpace = 'world' | 'object';
export type CutKeep = 'positive' | 'negative';

export interface CutUniforms {
  uCutOrigin: { value: THREE.Vector3 };
  uCutNormal: { value: THREE.Vector3 };
  uCutOffset: { value: number };
  uCutEdge: { value: number };
  uCutGlow: { value: THREE.Color };
  uCutGlowStrength: { value: number };
  uBelowColor: { value: THREE.Color };
  uBelowMix: { value: number };
  uBelowRoughness: { value: number };
  uBelowMetalness: { value: number };
  uNoiseAmp: { value: number };
  uCutAlongDir: { value: THREE.Vector3 };
  uCutAlongRange: { value: THREE.Vector2 };
  uCutProgress: { value: number };
}

export type Vec3Like = THREE.Vector3 | readonly [number, number, number];
export type Vec2Like = THREE.Vector2 | readonly [number, number];

/** Startwerte fuer createCutUniforms, je Uniform-Name (alle optional). */
export type CutUniformsInit = Partial<{
  uCutOrigin: Vec3Like;
  uCutNormal: Vec3Like;
  uCutOffset: number;
  uCutEdge: number;
  uCutGlow: THREE.ColorRepresentation;
  uCutGlowStrength: number;
  uBelowColor: THREE.ColorRepresentation;
  uBelowMix: number;
  uBelowRoughness: number;
  uBelowMetalness: number;
  uNoiseAmp: number;
  uCutAlongDir: Vec3Like;
  uCutAlongRange: Vec2Like;
  uCutProgress: number;
}>;

export interface CutExtra {
  /** zusaetzliche Uniforms (ebenfalls per Referenz geteilt) */
  uniforms?: Record<string, THREE.IUniform>;
  /** GLSL im Vertex-Kopf (nach `#include <common>`), z. B. eigene varyings */
  vertexHead?: string;
  /** GLSL im Vertex-main nach `#include <project_vertex>`; `transformed` und `objectNormal` sind verfuegbar */
  vertexMain?: string;
  /** GLSL nach CUT_GLSL (Fragment, nach `#include <common>`) */
  fragmentHead?: string;
  /** GLSL am Anfang von main (nach `#include <clipping_planes_fragment>`); cutCs ist dort verfuegbar */
  fragmentMainStart?: string;
  /**
   * GLSL nach dem Schnitt-Gluehen (nach `#include <emissivemap_fragment>`):
   * `normal` (View-Raum) und `vViewPosition` sind verfuegbar, Beitrag auf
   * `totalEmissiveRadiance` addieren (z. B. Fresnel-Kantenlinie).
   */
  fragmentEmissive?: string;
  /**
   * GLSL nach `#include <lights_physical_fragment>`: das `material`-Struct
   * (roughness, metalness, mit Klarlack clearcoat) pro Fragment anpassen.
   */
  fragmentMaterial?: string;
  /**
   * GLSL nach `#include <lights_fragment_maps>`: Umgebungslicht pro Fragment
   * skalieren (`iblIrradiance`, `radiance`, mit Klarlack `clearcoatRadiance`).
   */
  fragmentLights?: string;
}

export interface PatchCutOptions {
  /** eindeutig je Material-/extra-Variante (Teil des Program-Cache-Keys) */
  key: string;
  mode: CutMode;
  /** Standard 'world' */
  space?: CutSpace;
  /** clip/dissolve: welche Seite bleibt stehen, Standard 'positive' */
  keep?: CutKeep;
  extra?: CutExtra;
  /**
   * Anteil des Gluehens auf Flaechen, die IN der Schnittebene liegen (die
   * Schnittflaechen selbst, Normale parallel zur Schnitt-Normale). Standard 1:
   * die ganze Schnittflaeche glueht (bisheriges Verhalten). Kleiner 1: die
   * Flaeche bleibt Material mit leichtem warmem Schimmer, voll glueht nur die
   * duenne Naht auf den angrenzenden Flaechen. Braucht flache Normalen
   * (extrudePolygons liefert sie).
   */
  faceGlow?: number;
}

/**
 * Uniform-Deklarationen, varying und Helfer (Fragment). hash13 nach Dave
 * Hoskins („Hash without Sine“, MIT), vnoise = trilineares Value-Noise.
 */
export const CUT_GLSL = /* glsl */ `
uniform vec3 uCutOrigin;
uniform vec3 uCutNormal;
uniform float uCutOffset;
uniform float uCutEdge;
uniform vec3 uCutGlow;
uniform float uCutGlowStrength;
uniform vec3 uBelowColor;
uniform float uBelowMix;
uniform float uBelowRoughness;
uniform float uBelowMetalness;
uniform float uNoiseAmp;
uniform vec3 uCutAlongDir;
uniform vec2 uCutAlongRange;
uniform float uCutProgress;
varying vec3 vCutPos;

float hash13( vec3 p3 ) {
  p3 = fract( p3 * 0.1031 );
  p3 += dot( p3, p3.zyx + 31.32 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

float vnoise( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  vec3 u = f * f * ( 3.0 - 2.0 * f );
  float n000 = hash13( i );
  float n100 = hash13( i + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = hash13( i + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = hash13( i + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = hash13( i + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = hash13( i + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = hash13( i + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = hash13( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix(
    mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y ),
    mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y ),
    u.z
  );
}

float cutSide( vec3 p ) {
  return dot( p - uCutOrigin, uCutNormal ) - uCutOffset;
}

float cutEdge( float cs ) {
  return 1.0 - smoothstep( 0.0, max( uCutEdge, 1e-5 ), abs( cs ) );
}

float cutAlong( vec3 p ) {
  float span = max( uCutAlongRange.y - uCutAlongRange.x, 1e-5 );
  return clamp( ( dot( p - uCutOrigin, uCutAlongDir ) - uCutAlongRange.x ) / span, 0.0, 1.0 );
}

float cutAlongMask( vec3 p ) {
  return uCutAlongRange.y > uCutAlongRange.x ? step( cutAlong( p ), uCutProgress ) : 1.0;
}
`;

const VERTEX_HEAD = /* glsl */ `
varying vec3 vCutPos;
`;

function vertexBody(space: CutSpace): string {
  if (space === 'object') {
    return /* glsl */ `
vCutPos = transformed;
`;
  }
  return /* glsl */ `
{
  vec4 cutWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    cutWorld = batchingMatrix * cutWorld;
  #endif
  #ifdef USE_INSTANCING
    cutWorld = instanceMatrix * cutWorld;
  #endif
  vCutPos = ( modelMatrix * cutWorld ).xyz;
}
`;
}

/**
 * Anfang von main: cutCs (Signed Distance), cutBelow (0..1, antialiased),
 * cutCsEdge (fuer das Gluehen; bei dissolve verrauscht). Ableitungen (fwidth)
 * werden vor jedem discard berechnet.
 */
function mainStart(mode: CutMode, keep: CutKeep): string {
  const sign = keep === 'negative' ? '-1.0' : '1.0';
  const base = /* glsl */ `
float cutCs = cutSide( vCutPos );
float cutAA = max( fwidth( cutCs ), 1e-5 );
float cutBelow = 1.0 - smoothstep( -cutAA, cutAA, cutCs );
float cutCsEdge = cutCs;
`;
  if (mode === 'dissolve') {
    return `${base}
cutCsEdge = cutCs + ( vnoise( vCutPos * 9.0 ) - 0.5 ) * uNoiseAmp * 2.0;
if ( ${sign} * cutCsEdge < 0.0 ) discard;
`;
  }
  if (mode === 'clip') {
    return `${base}
if ( ${sign} * cutCs < 0.0 ) discard;
`;
  }
  return base;
}

const RECOLOR_COLOR = /* glsl */ `
diffuseColor.rgb = mix( diffuseColor.rgb, uBelowColor, uBelowMix * cutBelow );
`;
const RECOLOR_ROUGHNESS = /* glsl */ `
roughnessFactor = mix( roughnessFactor, uBelowRoughness, uBelowMix * cutBelow );
`;
const RECOLOR_METALNESS = /* glsl */ `
metalnessFactor = mix( metalnessFactor, uBelowMetalness, uBelowMix * cutBelow );
`;
const GLOW = /* glsl */ `
totalEmissiveRadiance += uCutGlow * uCutGlowStrength * cutEdge( cutCsEdge ) * cutAlongMask( vCutPos );
`;

// --- Option faceGlow: Schnittflaechen nur schimmern lassen -------------------

/**
 * |dot(Flaechen-Normale, Schnitt-Normale)| ab dem eine Flaeche als
 * Schnittflaeche gilt. Waagerechte Flaechen liegen nur 6° daneben
 * (cos 6° = 0,9945), deshalb so eng: cos 2,1° … cos 0,6°.
 */
const FACE_MASK_FROM = 0.9993;
const FACE_MASK_TO = 0.99995;

const VERTEX_FACE_HEAD = /* glsl */ `
uniform vec3 uCutNormal;
varying float vCutFacing;
`;

function vertexFaceBody(space: CutSpace): string {
  if (space === 'object') {
    return /* glsl */ `
vCutFacing = abs( dot( normalize( objectNormal ), uCutNormal ) );
`;
  }
  return /* glsl */ `
{
  vec3 cutObjectNormal = objectNormal;
  #ifdef USE_BATCHING
    cutObjectNormal = mat3( batchingMatrix ) * cutObjectNormal;
  #endif
  #ifdef USE_INSTANCING
    cutObjectNormal = mat3( instanceMatrix ) * cutObjectNormal;
  #endif
  vCutFacing = abs( dot( normalize( mat3( modelMatrix ) * cutObjectNormal ), uCutNormal ) );
}
`;
}

const FRAGMENT_FACE_HEAD = /* glsl */ `
varying float vCutFacing;
`;

function glowWithFace(faceGlow: number): string {
  return /* glsl */ `
{
  float cutFaceMask = smoothstep( ${FACE_MASK_FROM.toFixed(5)}, ${FACE_MASK_TO.toFixed(5)}, vCutFacing );
  float cutFaceGain = mix( 1.0, ${faceGlow.toFixed(4)}, cutFaceMask );
  totalEmissiveRadiance += uCutGlow * uCutGlowStrength * cutEdge( cutCsEdge ) * cutAlongMask( vCutPos ) * cutFaceGain;
}
`;
}

/** faceGlow auf [0, 1] begrenzt; null = Option aus (ganze Schnittflaeche glueht). */
function normalizeFaceGlow(faceGlow: number | undefined): number | null {
  if (faceGlow === undefined || !Number.isFinite(faceGlow) || faceGlow >= 1) return null;
  return Math.max(0, faceGlow);
}

const INC = {
  common: '#include <common>',
  project: '#include <project_vertex>',
  clipping: '#include <clipping_planes_fragment>',
  color: '#include <color_fragment>',
  roughness: '#include <roughnessmap_fragment>',
  metalness: '#include <metalnessmap_fragment>',
  emissive: '#include <emissivemap_fragment>',
  lightsPhysical: '#include <lights_physical_fragment>',
  lightsMaps: '#include <lights_fragment_maps>',
} as const;

function injectAfter(source: string, marker: string, code: string): string {
  if (process.env.NODE_ENV !== 'production') {
    console.assert(source.includes(marker), `[cut] Einfuegepunkt fehlt im Shader: ${marker}`);
  }
  // Ersetzungsfunktion statt String: keine $-Muster-Interpretation im GLSL.
  return source.replace(marker, () => `${marker}\n${code}`);
}

function toVector3(v: Vec3Like): THREE.Vector3 {
  return v instanceof THREE.Vector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2]);
}

function toVector2(v: Vec2Like): THREE.Vector2 {
  return v instanceof THREE.Vector2 ? v.clone() : new THREE.Vector2(v[0], v[1]);
}

/**
 * Neue Uniforms mit Defaults: Normale (−sin 6°, cos 6°, 0), Kante 0,012,
 * Gluehen #FFB257 Staerke 3, belowMix 1, noiseAmp 0,03, alongRange (0, 0)
 * (= Gluehen ueberall), Fortschritt 1.
 */
export function createCutUniforms(init: CutUniformsInit = {}): CutUniforms {
  return {
    uCutOrigin: { value: toVector3(init.uCutOrigin ?? [0, 0, 0]) },
    uCutNormal: { value: toVector3(init.uCutNormal ?? [-CUT_SIN, CUT_COS, 0]).normalize() },
    uCutOffset: { value: init.uCutOffset ?? 0 },
    uCutEdge: { value: init.uCutEdge ?? 0.012 },
    uCutGlow: { value: new THREE.Color(init.uCutGlow ?? COLORS.glow) },
    uCutGlowStrength: { value: init.uCutGlowStrength ?? 3 },
    uBelowColor: { value: new THREE.Color(init.uBelowColor ?? COLORS.brand) },
    uBelowMix: { value: init.uBelowMix ?? 1 },
    uBelowRoughness: { value: init.uBelowRoughness ?? 0.55 },
    uBelowMetalness: { value: init.uBelowMetalness ?? 0 },
    uNoiseAmp: { value: init.uNoiseAmp ?? 0.03 },
    uCutAlongDir: { value: toVector3(init.uCutAlongDir ?? [CUT_COS, CUT_SIN, 0]).normalize() },
    uCutAlongRange: { value: toVector2(init.uCutAlongRange ?? [0, 0]) },
    uCutProgress: { value: init.uCutProgress ?? 1 },
  };
}

/**
 * Haengt den Schnitt-Shader in ein Standard- oder Physical-Material.
 * Ueberschreibt material.onBeforeCompile und customProgramCacheKey und setzt
 * needsUpdate. Gleicher `key` + gleicher Modus/Raum/keep = gleiches Programm;
 * unterschiedliche `extra`-Snippets brauchen unterschiedliche Keys.
 */
export function patchCutMaterial(
  material: THREE.MeshStandardMaterial,
  uniforms: CutUniforms,
  opts: PatchCutOptions,
): void {
  const { key, mode, space = 'world', keep = 'positive', extra } = opts;
  const faceGlow = normalizeFaceGlow(opts.faceGlow);
  const faceHead = faceGlow === null ? '' : FRAGMENT_FACE_HEAD;
  const fragmentHead = `${CUT_GLSL}\n${faceHead}${extra?.fragmentHead ?? ''}`;
  const fragmentMain = `${mainStart(mode, keep)}\n${extra?.fragmentMainStart ?? ''}`;
  const glow = faceGlow === null ? GLOW : glowWithFace(faceGlow);
  const extraUniforms = extra?.uniforms ?? {};

  const vertexHead = `${faceGlow === null ? VERTEX_HEAD : `${VERTEX_HEAD}${VERTEX_FACE_HEAD}`}${extra?.vertexHead ?? ''}`;
  const vertexMain = `${faceGlow === null ? vertexBody(space) : `${vertexBody(space)}${vertexFaceBody(space)}`}${extra?.vertexMain ?? ''}`;
  const emissive = `${glow}${extra?.fragmentEmissive ?? ''}`;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, extraUniforms);

    let vs = shader.vertexShader;
    vs = injectAfter(vs, INC.common, vertexHead);
    vs = injectAfter(vs, INC.project, vertexMain);
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = injectAfter(fs, INC.common, fragmentHead);
    fs = injectAfter(fs, INC.clipping, fragmentMain);
    if (mode === 'recolor') {
      fs = injectAfter(fs, INC.color, RECOLOR_COLOR);
      fs = injectAfter(fs, INC.roughness, RECOLOR_ROUGHNESS);
      fs = injectAfter(fs, INC.metalness, RECOLOR_METALNESS);
    }
    fs = injectAfter(fs, INC.emissive, emissive);
    if (extra?.fragmentMaterial) fs = injectAfter(fs, INC.lightsPhysical, extra.fragmentMaterial);
    if (extra?.fragmentLights) fs = injectAfter(fs, INC.lightsMaps, extra.fragmentLights);
    shader.fragmentShader = fs;
  };
  const faceKey = faceGlow === null ? '' : `-face${faceGlow.toFixed(4)}`;
  material.customProgramCacheKey = () => `cut-${key}-${mode}-${space}-${keep}${faceKey}`;
  material.needsUpdate = true;
}

const scratchNormalMatrix = new THREE.Matrix3();

/** Schreibt einen Vector3 oder ein Tupel in `target` (ohne Allokation). */
function assignVec3(target: THREE.Vector3, v: Vec3Like): THREE.Vector3 {
  return v instanceof THREE.Vector3 ? target.copy(v) : target.set(v[0], v[1], v[2]);
}

/**
 * Rechnet eine Ebene aus Objekt-lokalen Werten in Weltkoordinaten um (fuer
 * space 'world'): Origin per localToWorld, Normale per Normalmatrix,
 * normalisiert. Schreibt in die vorhandenen Uniform-Werte (keine Allokation).
 * Origin/Normale als THREE.Vector3 oder Tupel, z. B. CUT_LOCAL_NORMAL aus lib/scene/stations.
 */
export function setCutPlaneFromObject(
  u: CutUniforms,
  obj: THREE.Object3D,
  localOrigin: Vec3Like,
  localNormal: Vec3Like,
): void {
  obj.updateWorldMatrix(true, false);
  assignVec3(u.uCutOrigin.value, localOrigin).applyMatrix4(obj.matrixWorld);
  scratchNormalMatrix.getNormalMatrix(obj.matrixWorld);
  assignVec3(u.uCutNormal.value, localNormal).applyNormalMatrix(scratchNormalMatrix);
}
