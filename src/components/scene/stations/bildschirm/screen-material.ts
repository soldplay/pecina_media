/**
 * Bildschirm-Shader der Station II (DESIGN_SPEC §3.3.2): DOS → Website → Feed
 * entlang derselben 6°-Diagonale. Ersetzt das Material des Bildschirm-
 * Primitivs (toneMapped false, fog false).
 *
 * UV planar aus den Objekt-Positionen (das Primitiv hat keine UVs):
 * vUv = (position.xy − uMin) / (uMax − uMin), optional gespiegelt.
 * uAspect = Breite / Hoehe der Bounds, damit die Diagonale physisch 6° steigt.
 *
 * Abweichungen vom Spec-Fragment (bewusst, ohne Bildaenderung im Normalfall):
 * - cursorMask liest den Alpha-Kanal von uDos (die DOS-Textur spart den
 *   Cursor-Block als transparentes Loch aus, siehe textures.ts).
 * - Die statischen Scanlines blenden aus, sobald eine Periode kleiner als
 *   ~2 px wird (Moire-Schutz, sonst flimmert es bei Kamerafahrt); der
 *   Mittelwert 0,88 bleibt gleich.
 * - Cursor- und Kantenfarbe als lineare Farben (#FFB000 / #FFB257), danach
 *   colorspace_fragment, damit der Cursor exakt wie die Bernstein-Schrift wirkt.
 */

import * as THREE from 'three';
import { COLORS, CUT_TAN } from '@/lib/brand';
import { FALLBACK_SCREEN, LAPTOP, SCREEN_GLOW, SCREEN_MATERIAL_NAME } from './screen.config';

export type ScreenUniforms = {
  uDos: { value: THREE.Texture | null };
  uWeb: { value: THREE.Texture | null };
  uFeed: { value: THREE.Texture | null };
  uMin: { value: THREE.Vector2 };
  uMax: { value: THREE.Vector2 };
  uFlip: { value: THREE.Vector2 };
  uAspect: { value: number };
  uCut1: { value: number };
  uCut2: { value: number };
  uCursorOn: { value: number };
  uCursorColor: { value: THREE.Color };
  uGlowColor: { value: THREE.Color };
};

const VERTEX = /* glsl */ `
uniform vec2 uMin;
uniform vec2 uMax;
uniform vec2 uFlip;
varying vec2 vUv;

void main() {
  vec2 uv = ( position.xy - uMin ) / max( uMax - uMin, vec2( 1e-5 ) );
  vUv = mix( uv, 1.0 - uv, uFlip );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uDos;
uniform sampler2D uWeb;
uniform sampler2D uFeed;
uniform float uAspect;
uniform float uCut1;
uniform float uCut2;
uniform float uCursorOn;
uniform vec3 uCursorColor;
uniform vec3 uGlowColor;
varying vec2 vUv;

float cursorMask( vec2 uv ) {
  return 1.0 - texture2D( uDos, uv ).a;
}

void main() {
  float e  = vUv.y - ( vUv.x - 0.5 ) * ${CUT_TAN} * uAspect;
  float f1 = mix( -0.12, 1.12, uCut1 );
  float f2 = mix( -0.12, 1.12, uCut2 );
  float web  = 1.0 - smoothstep( f1, f1 + 0.004, e );
  float feed = 1.0 - smoothstep( f2, f2 + 0.004, e );

  // statische Scanlines (kein uTime), Amplitude 0,12 mit Moire-Schutz
  float scan = vUv.y * 2010.6;
  float scanAmp = 0.12 * ( 1.0 - smoothstep( 1.2, 3.1, fwidth( scan ) ) );
  vec3 dos = texture2D( uDos, vUv ).rgb * ( 0.88 + scanAmp * sin( scan ) );
  dos += uCursorOn * cursorMask( vUv ) * uCursorColor;

  vec3 col = mix( dos, texture2D( uWeb, vUv ).rgb, web );
  col = mix( col, texture2D( uFeed, vUv ).rgb, feed );

  float edge = ( 1.0 - smoothstep( 0.0, 0.006, abs( e - f1 ) ) ) * step( 0.001, uCut1 ) * step( uCut1, 0.999 )
             + ( 1.0 - smoothstep( 0.0, 0.006, abs( e - f2 ) ) ) * step( 0.001, uCut2 ) * step( uCut2, 0.999 );
  gl_FragColor = vec4( col + uGlowColor * 2.5 * edge, 1.0 );
  #include <colorspace_fragment>
}
`;

export interface ScreenFlip {
  readonly u: boolean;
  readonly v: boolean;
}

export interface ScreenMaterialResult {
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: ScreenUniforms;
  /** Breite / Hoehe der Bildschirm-Bounds (uAspect) */
  readonly aspect: number;
}

/** Bounding Box der Geometrie, ohne die (gecachte) Geometrie zu veraendern. */
export function geometryBox(geometry: THREE.BufferGeometry): THREE.Box3 {
  if (geometry.boundingBox) return geometry.boundingBox.clone();
  const position = geometry.getAttribute('position');
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) box.expandByPoint(v.fromBufferAttribute(position, i));
  return box;
}

export function createScreenMaterial(bounds: THREE.Box3, flip: ScreenFlip): ScreenMaterialResult {
  const width = Math.max(bounds.max.x - bounds.min.x, 1e-5);
  const height = Math.max(bounds.max.y - bounds.min.y, 1e-5);
  const aspect = width / height;
  const uniforms: ScreenUniforms = {
    uDos: { value: null },
    uWeb: { value: null },
    uFeed: { value: null },
    uMin: { value: new THREE.Vector2(bounds.min.x, bounds.min.y) },
    uMax: { value: new THREE.Vector2(bounds.max.x, bounds.max.y) },
    uFlip: { value: new THREE.Vector2(flip.u ? 1 : 0, flip.v ? 1 : 0) },
    uAspect: { value: aspect },
    uCut1: { value: 0 },
    uCut2: { value: 0 },
    uCursorOn: { value: 1 },
    uCursorColor: { value: new THREE.Color(COLORS.amber) },
    uGlowColor: { value: new THREE.Color(SCREEN_GLOW) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'pm-bildschirm-screen',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    toneMapped: false,
    fog: false,
  });
  return { material, uniforms, aspect };
}

/** Hot Path: Werte werden bewusst in-place gesetzt (kein Recompile). */
export function applyScreenState(u: ScreenUniforms, cut1: number, cut2: number, cursorOn: number): void {
  u.uCut1.value = cut1;
  u.uCut2.value = cut2;
  u.uCursorOn.value = cursorOn;
}

export function applyScreenTextures(
  u: ScreenUniforms,
  dos: THREE.Texture | null,
  web: THREE.Texture | null,
  feed: THREE.Texture | null,
): void {
  u.uDos.value = dos;
  u.uWeb.value = web;
  u.uFeed.value = feed;
}

// ---------------------------------------------------------------------------
// Modell-Helfer (lesend; aendern den useGLTF-Cache nicht)
// ---------------------------------------------------------------------------

export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  return meshes;
}

function materialName(mesh: THREE.Mesh): string {
  const m = mesh.material;
  return Array.isArray(m) ? (m[0]?.name ?? '') : m.name;
}

/** Bildschirm-Primitiv: Mesh mit Material `classic_laptop_screen`. */
export function findScreenMesh(root: THREE.Object3D): THREE.Mesh | undefined {
  return collectMeshes(root).find((m) => materialName(m) === SCREEN_MATERIAL_NAME);
}

export function findMeshesByMaterial(root: THREE.Object3D, name: string): THREE.Mesh[] {
  return collectMeshes(root).filter((m) => materialName(m) === name);
}

/** Lokale Matrix von `obj` bis (ausschliesslich) `root`, ohne Matrizen des Caches zu aendern. */
export function matrixToRoot(obj: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  const result = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) {
    local.compose(o.position, o.quaternion, o.scale);
    result.premultiply(local);
  }
  return result;
}

/** Laptop-Modellraum → Station-lokal (Position und Skala der Laptop-Gruppe). */
export function laptopToStation(): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...LAPTOP.position),
    new THREE.Quaternion(),
    new THREE.Vector3(LAPTOP.scale, LAPTOP.scale, LAPTOP.scale),
  );
}

/** Bildschirmmitte in Station-lokalen Koordinaten (Start der Social-Karten). */
export function screenCenterLocal(source: THREE.Object3D): readonly [number, number, number] {
  const mesh = findScreenMesh(source);
  const center = mesh
    ? geometryBox(mesh.geometry).getCenter(new THREE.Vector3()).applyMatrix4(matrixToRoot(mesh, source))
    : new THREE.Vector3(...FALLBACK_SCREEN.center);
  center.applyMatrix4(laptopToStation());
  return [center.x, center.y, center.z];
}
