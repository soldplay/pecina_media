'use client';

/**
 * Station II – Bildschirm, Stretch (DESIGN_SPEC §3.3.2): Hochkant-Karten
 * 0,16 × 0,28 (InstancedMesh, Atlas 3 × 3 mit allen neun Feed-Motiven)
 * fliegen waehrend Schnitt 2 per quadratischer Bezierkurve aus der
 * Bildschirmmitte in ein 3 × 3-Raster rechts neben dem Laptop.
 * Verzoegerung i · 0,06 innerhalb cut2, Ease power3.out, CPU-Matrizen nur bei
 * Aenderung. Ecken per SDF-Alpha. Nur wenn config.stretch (StationBildschirm).
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COPY } from '@/content/site';
import { FONT_VARS } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { clamp01, lerp, mulberry32, power3Out } from '@/lib/scene/math';
import { STATIONS, stationPhases, type Vec3Tuple } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { resolveFontFamily, useCanvasTexture } from '@/lib/three/canvas-texture';
import { SOCIAL, SOCIAL_ATLAS } from './screen.config';
import { drawSocialAtlas, socialFontSpec } from './textures';

const CARD_SIZE_GLSL = `vec2( ${SOCIAL.size[0].toFixed(4)}, ${SOCIAL.size[1].toFixed(4)} )`;

const VERTEX_HEAD = /* glsl */ `
attribute vec2 aCell;
varying vec2 vCardUv;
`;

const VERTEX_UV = /* glsl */ `
vCardUv = uv;
#ifdef USE_MAP
  vMapUv = ( uv + vec2( aCell.x, ${(SOCIAL_ATLAS.rows - 1).toFixed(1)} - aCell.y ) ) / vec2( ${SOCIAL_ATLAS.cols.toFixed(1)}, ${SOCIAL_ATLAS.rows.toFixed(1)} );
#endif
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec2 vCardUv;
float cardMask( vec2 uv ) {
  vec2 size = ${CARD_SIZE_GLSL};
  float radius = ${SOCIAL.cornerRadius.toFixed(4)};
  vec2 q = abs( ( uv - 0.5 ) * size ) - ( size * 0.5 - radius );
  float d = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - radius;
  float aa = max( fwidth( d ), 1e-5 );
  return 1.0 - smoothstep( -aa, aa, d );
}
`;

const FRAGMENT_ALPHA = /* glsl */ `
diffuseColor.a *= cardMask( vCardUv );
if ( diffuseColor.a < 0.01 ) discard;
`;

function injectAfter(source: string, marker: string, code: string): string {
  if (process.env.NODE_ENV !== 'production') {
    console.assert(source.includes(marker), `[SocialCards] Einfuegepunkt fehlt: ${marker}`);
  }
  return source.replace(marker, () => `${marker}\n${code}`);
}

function createCardMaterial(atlas: THREE.Texture): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: atlas,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    // flache Karten: ein Durchgang statt Rueck- und Vorderseite getrennt (1 statt 2 Draw Calls)
    forceSinglePass: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = injectAfter(shader.vertexShader, '#include <common>', VERTEX_HEAD);
    shader.vertexShader = injectAfter(shader.vertexShader, '#include <uv_vertex>', VERTEX_UV);
    shader.fragmentShader = injectAfter(shader.fragmentShader, '#include <common>', FRAGMENT_HEAD);
    shader.fragmentShader = injectAfter(shader.fragmentShader, '#include <map_fragment>', FRAGMENT_ALPHA);
  };
  material.customProgramCacheKey = () => 'pm-social-cards';
  return material;
}

function createCardGeometry(count: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(SOCIAL.size[0], SOCIAL.size[1]);
  const cells = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    cells[i * 2] = i % SOCIAL_ATLAS.cols;
    cells[i * 2 + 1] = Math.floor(i / SOCIAL_ATLAS.cols) % SOCIAL_ATLAS.rows;
  }
  geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  return geometry;
}

interface Flight {
  readonly start: THREE.Vector3;
  readonly control: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly roll: number;
}

function createFlights(count: number, origin: Vec3Tuple): readonly Flight[] {
  const rand = mulberry32(SOCIAL.seed);
  const start = new THREE.Vector3(...origin);
  return Array.from({ length: count }, (_, i) => {
    const col = i % SOCIAL.cols.length;
    const row = Math.floor(i / SOCIAL.cols.length) % SOCIAL.rows.length;
    const end = new THREE.Vector3(SOCIAL.cols[col], SOCIAL.rows[row], SOCIAL.z + i * SOCIAL.zStep);
    const control = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0, SOCIAL.controlZ));
    return { start, control, end, roll: (rand() - 0.5) * 2 * SOCIAL.roll };
  });
}

const scratch = Object.freeze({
  position: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  euler: new THREE.Euler(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  matrix: new THREE.Matrix4(),
});

/** Quadratische Bezierkurve, schreibt in `out`. */
function bezier(f: Flight, t: number, out: THREE.Vector3): THREE.Vector3 {
  scratch.a.copy(f.start).lerp(f.control, t);
  scratch.b.copy(f.control).lerp(f.end, t);
  return out.copy(scratch.a).lerp(scratch.b, t);
}

function cardProgress(i: number, count: number, cut2: number): number {
  const span = Math.max(1 - (count - 1) * SOCIAL.delay, 0.1);
  return power3Out(clamp01((cut2 - i * SOCIAL.delay) / span));
}

/** Hot Path: Instanz-Matrizen nur bei Aenderung von cut2 neu setzen. */
function applyCards(mesh: THREE.InstancedMesh, flights: readonly Flight[], cut2: number): void {
  const anyVisible = flights.reduce((visible, f, i) => {
    const t = cardProgress(i, flights.length, cut2);
    const s = t > 0 ? lerp(SOCIAL.startScale, 1, t) : 0;
    bezier(f, t, scratch.position);
    scratch.euler.set(0, (1 - t) * SOCIAL.flightYaw, f.roll * t);
    scratch.quaternion.setFromEuler(scratch.euler);
    scratch.scale.set(s, s, s);
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    mesh.setMatrixAt(i, scratch.matrix);
    return visible || t > 0;
  }, false);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = anyVisible;
}

interface CardsMeshProps {
  id: StationId;
  reduced: boolean;
  count: number;
  origin: Vec3Tuple;
  atlas: THREE.Texture;
}

function CardsMesh({ id, reduced, count, origin, atlas }: CardsMeshProps) {
  const [ox, oy, oz] = origin;
  const geometry = useMemo(() => createCardGeometry(count), [count]);
  const material = useMemo(() => createCardMaterial(atlas), [atlas]);
  const flights = useMemo(() => createFlights(count, [ox, oy, oz]), [count, ox, oy, oz]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const last = useRef(Number.NaN);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    last.current = Number.NaN;
    keepAlive();
  }, [flights, material]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const mesh = meshRef.current;
    if (!mesh) return;
    const [beatA, beatB] = STATIONS[id].beats;
    // Reduced: Karten stehen fertig im Raster (Standbild)
    const cut2 = reduced ? 1 : stationPhases(frame.beats[beatA], frame.beats[beatB], false).cut2;
    if (cut2 === last.current) return;
    last.current = cut2;
    applyCards(mesh, flights, cut2);
    keepAlive();
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />;
}

interface SocialCardsProps {
  id: StationId;
  reduced: boolean;
  /** config.socialCards (9, Compact 6), mal quality */
  count: number;
  /** Bildschirmmitte, Station-lokal (screenCenterLocal) */
  origin: Vec3Tuple;
}

export default function SocialCards({ id, reduced, count, origin }: SocialCardsProps) {
  const display = useMemo(() => resolveFontFamily(FONT_VARS.display), []);
  const atlas = useCanvasTexture(
    SOCIAL_ATLAS.width,
    SOCIAL_ATLAS.height,
    (ctx, w, h) => drawSocialAtlas(ctx, w, h, { family: display, motifs: COPY.scene3d.feed }),
    [display],
    [socialFontSpec(display)],
  );
  if (!atlas || count <= 0) return null;
  return <CardsMesh id={id} reduced={reduced} count={count} origin={origin} atlas={atlas} />;
}
