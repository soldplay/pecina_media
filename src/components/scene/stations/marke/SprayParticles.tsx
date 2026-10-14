'use client';

/**
 * Station I – Marke, Stretch „Rund trifft Kante“ (DESIGN_SPEC §3.3.1): eine
 * Spruehwolke aus der Duese von Dose A formt Ring (60 %) und 6°-Balken (40 %).
 * Zeitbasiert 1,05 s (Fix-Runde 3, vorher 1,6 s: Ruhe erst 1,77 s nach der
 * Eingabe), ausgeloest einmal, wenn beat a 0,88 ueberschreitet (Reset bei
 * a < 0,5), keepAlive(1100) nur beim Ausloesen.
 * Nur wenn config.stretch und config.spray > 0 (StationMarke), nie auf Compact.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { COLORS, CUT_COS, CUT_SIN } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { clamp01, mulberry32 } from '@/lib/scene/math';
import { STATIONS, type Vec3Tuple } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';

const SPRAY = Object.freeze({
  center: [0, 1.62, -0.1] as Vec3Tuple,
  ringRadius: 0.16,
  ringWidth: 0.018,
  ringShare: 0.6,
  bar: [0.38, 0.06] as const,
  /** Tiefenstreuung der Zielform (m) */
  depthJitter: 0.006,
  /** Kegel 25° (Oeffnungswinkel), Abstand 0,05–0,4 m entlang der Spruehrichtung */
  coneAngle: (25 * Math.PI) / 180,
  coneNear: 0.05,
  coneFar: 0.4,
  durationMs: 1050,
  keepAliveMs: 1100,
  triggerAbove: 0.88,
  resetBelow: 0.5,
  /** Punktgroesse in px bei 1 m Abstand (mal dpr) */
  pointScale: 9,
  seed: 0x5b2a7,
});

const VERTEX = /* glsl */ `
attribute vec3 aStart;
attribute float aSeed;
attribute float aKind;
uniform float uProgress;
uniform float uPointScale;
varying float vKind;
varying float vAlpha;

void main() {
  float t = smoothstep( aSeed * 0.5, aSeed * 0.5 + 0.5, uProgress );
  vec3 p = mix( aStart, position, 1.0 - pow( 1.0 - t, 3.0 ) );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPointScale / max( -mv.z, 0.05 );
  vKind = aKind;
  // Teilchen erscheinen erst beim Start ihres Flugs (wie aus der Duese)
  vAlpha = smoothstep( aSeed * 0.5 - 0.02, aSeed * 0.5 + 0.03, uProgress );
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uRing;
uniform vec3 uBar;
varying float vKind;
varying float vAlpha;

void main() {
  float d = length( gl_PointCoord - 0.5 );
  float a = ( 1.0 - smoothstep( 0.25, 0.5, d ) ) * vAlpha;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( mix( uRing, uBar, vKind ), a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

type SprayUniforms = {
  uProgress: { value: number };
  uPointScale: { value: number };
  uRing: { value: THREE.Color };
  uBar: { value: THREE.Color };
};

interface SprayTrigger {
  armed: boolean;
  /** performance.now() beim Ausloesen, −1 = nicht ausgeloest */
  start: number;
}

/** Orthonormalbasis (t1, t2) senkrecht zu `dir`. */
function basis(dir: THREE.Vector3): readonly [THREE.Vector3, THREE.Vector3] {
  const helper = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(dir, helper).normalize();
  const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
  return [t1, t2];
}

function ringTarget(rand: () => number, out: THREE.Vector3): THREE.Vector3 {
  const angle = rand() * Math.PI * 2;
  const r = SPRAY.ringRadius + (rand() - 0.5) * SPRAY.ringWidth;
  return out.set(Math.cos(angle) * r, Math.sin(angle) * r, (rand() - 0.5) * SPRAY.depthJitter);
}

/** Parallelogramm 0,38 × 0,06: lange Seiten unter 6°, Stirnseiten senkrecht. */
function barTarget(rand: () => number, out: THREE.Vector3): THREE.Vector3 {
  const u = (rand() - 0.5) * SPRAY.bar[0];
  const w = (rand() - 0.5) * SPRAY.bar[1];
  return out.set(u * CUT_COS, u * CUT_SIN + w, (rand() - 0.5) * SPRAY.depthJitter);
}

function createSprayGeometry(count: number, nozzle: Vec3Tuple): THREE.BufferGeometry {
  const rand = mulberry32(SPRAY.seed + count);
  const center = new THREE.Vector3(...SPRAY.center);
  const origin = new THREE.Vector3(...nozzle);
  const dir = center.clone().sub(origin).normalize();
  const [t1, t2] = basis(dir);
  const cosHalf = Math.cos(SPRAY.coneAngle / 2);
  const ringCount = Math.round(count * SPRAY.ringShare);

  const targets = new Float32Array(count * 3);
  const starts = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const kinds = new Float32Array(count);
  const target = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const kind = i < ringCount ? 0 : 1;
    (kind === 0 ? ringTarget(rand, target) : barTarget(rand, target)).add(center).toArray(targets, i * 3);
    // gleichverteilt im Raumwinkel des Kegels
    const cosT = 1 - rand() * (1 - cosHalf);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = rand() * Math.PI * 2;
    const dist = SPRAY.coneNear + rand() * (SPRAY.coneFar - SPRAY.coneNear);
    v.copy(dir)
      .multiplyScalar(cosT)
      .addScaledVector(t1, Math.cos(phi) * sinT)
      .addScaledVector(t2, Math.sin(phi) * sinT)
      .multiplyScalar(dist)
      .add(origin)
      .toArray(starts, i * 3);
    seeds[i] = rand();
    kinds[i] = kind;
  }

  const geometry = new THREE.BufferGeometry();
  // position = Ziel (Bounding Sphere); der Shader mischt von aStart dorthin
  geometry.setAttribute('position', new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  return geometry;
}

function createSprayMaterial(): { material: THREE.ShaderMaterial; uniforms: SprayUniforms } {
  const uniforms: SprayUniforms = {
    uProgress: { value: 0 },
    uPointScale: { value: SPRAY.pointScale },
    uRing: { value: new THREE.Color(COLORS.brand) },
    uBar: { value: new THREE.Color(COLORS.paper) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  return { material, uniforms };
}

/** Zustandsautomat des Ausloesers; liefert den Fortschritt 0..1. */
function sprayProgress(s: SprayTrigger, a: number, now: number): number {
  if (a < SPRAY.resetBelow) {
    s.armed = true;
    s.start = -1;
    return 0;
  }
  if (s.armed && a > SPRAY.triggerAbove) {
    s.armed = false;
    s.start = now;
    keepAlive(SPRAY.keepAliveMs);
  }
  return s.start < 0 ? 0 : clamp01((now - s.start) / SPRAY.durationMs);
}

function applySpray(points: THREE.Points, uniforms: SprayUniforms, progress: number): void {
  uniforms.uProgress.value = progress;
  points.visible = progress > 0;
}

function applyPointScale(uniforms: SprayUniforms, dpr: number): void {
  uniforms.uPointScale.value = SPRAY.pointScale * dpr;
}

interface SprayParticlesProps {
  id: StationId;
  reduced: boolean;
  /** Anzahl laut config.spray (High 12 000, Mid 5 000, mal quality) */
  count: number;
  /** Duese von Dose A, Station-lokal (canNozzleLocal) */
  nozzle: Vec3Tuple;
}

export default function SprayParticles({ id, reduced, count, nozzle }: SprayParticlesProps) {
  const [nx, ny, nz] = nozzle;
  const geometry = useMemo(() => createSprayGeometry(count, [nx, ny, nz]), [count, nx, ny, nz]);
  const { material, uniforms } = useMemo(() => createSprayMaterial(), []);
  const dpr = useThree((s) => s.viewport.dpr);
  const pointsRef = useRef<THREE.Points>(null);
  const trigger = useRef<SprayTrigger>({ armed: true, start: -1 });
  const last = useRef(Number.NaN);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    applyPointScale(uniforms, dpr);
    keepAlive();
  }, [uniforms, dpr]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const points = pointsRef.current;
    if (!points) return;
    // Reduced: fertige Form, sonst zeitbasiert ab dem Ausloeser
    const progress = reduced ? 1 : sprayProgress(trigger.current, frame.beats[STATIONS[id].beats[0]], performance.now());
    if (progress === last.current) return;
    last.current = progress;
    applySpray(points, uniforms, progress);
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}
