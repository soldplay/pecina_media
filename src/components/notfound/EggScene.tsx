'use client';

/**
 * EggScene (P9, DESIGN_SPEC §4.9): eigener kleiner Canvas fuer das 404-Easter-Egg.
 * Ziel von `dynamic(() => import('./EggScene'), { ssr: false })` in NotFoundEgg.
 *
 * - „404“ aus Block-Ziffern (digits.ts), an der 6°-Geraden durch die Mitte geteilt
 *   (splitPolygons), je Haelfte eine extrudierte Geometrie (Tiefe 0,5).
 * - MeshStandardMaterial #D17F0C, roughness 0,4, Schnitt-Shader 'edge' im Objektraum:
 *   die Naht und die Schnittflaechen gluehen, auch wenn die Haelften auseinanderdriften.
 * - Beim Einblenden oeffnet sich der Spalt einmal („zu viel geschnitten“) und ruht dann.
 *   Pointer-Bewegung treibt die Haelften entlang n auseinander (proportional zur
 *   Geschwindigkeit, gedaempft, Trennung hoechstens 0,6), danach federn sie zurueck.
 *   Der Button „Wieder zusammenfuegen“ (resetCount) federt sie auf 0.
 * - Stretch: die Ziffern neigen sich gedaempft zum Pointer (max. 0,12 / 0,2 rad) und kehren
 *   beim Verlassen in die Neutrallage zurueck.
 * - frameloop 'demand': gerendert wird nur, solange sich etwas bewegt (invalidate aus
 *   useFrame bis zur Ruhe). Eigener Canvas, daher eigenes Licht (ambient 0,3 + eine
 *   DirectionalLight) und kein Postprocessing; der globale Szene-Store bleibt unberuehrt.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { COLORS, CUT_NORMAL } from '@/lib/brand';
import { damp } from '@/lib/scene/math';
import { createCutUniforms, patchCutMaterial } from '@/lib/three/cut';
import { extrudePolygons, splitPolygons } from '@/lib/three/split-extrude';
import { build404 } from './digits';

export interface EggSceneProps {
  /** Zaehler des Buttons „Wieder zusammenfuegen“; jede Erhoehung federt die Haelften auf 0. */
  readonly resetCount: number;
  /** WebGL-Kontext verloren: NotFoundEgg wechselt auf die statische Version. */
  readonly onContextLost: () => void;
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

const DEPTH = 0.5;
/** Hoechste Trennung der Haelften entlang n (Summe beider Haelften). */
const MAX_SEPARATION = 0.6;
/** Ruhe-Trennung nach dem Einblenden, bis der Button sie auf 0 setzt. */
const REST_OPEN = 0.22;
const SPRING_STIFFNESS = 90;
const SPRING_DAMPING = 12;
/** Zusaetzliche Trennung je Pointer-Geschwindigkeit (Canvas-Hoehen pro Sekunde). */
const SPEED_GAIN = 0.12;
const SPEED_CAP = 8;
/** Abklingzeit der Pointer-Geschwindigkeit; danach federn die Haelften zurueck. */
const SPEED_DECAY_S = 0.22;
/** Aeltere Pointer-Samples zaehlen nicht (Pause, Wiedereintritt). */
const POINTER_GAP_MS = 120;
const MAX_DT = 1 / 30;
const SETTLE_EPS = 5e-4;
/** Stretch: Neigung zum Pointer in rad (x = Nicken, y = Gieren), gedaempft; ohne Pointer zurueck auf 0. */
const TILT_MAX = { x: 0.12, y: 0.2 } as const;
const TILT_SMOOTH_S = 0.3;

const DPR: [number, number] = [1, 1.5];
const GL = {
  antialias: true,
  alpha: false,
  stencil: false,
  depth: true,
  powerPreference: 'default',
  toneMapping: THREE.NeutralToneMapping,
} as const;
const CAMERA = { fov: 30, near: 0.1, far: 30, position: [0.55, 0.32, 4.6] } as const;
const AMBIENT_INTENSITY = 0.3;
const KEY_LIGHT = { intensity: 2.4, position: [2.5, 3.5, 4] } as const;
const GLOW = { edge: 0.018, strength: 2.2 } as const;
const CANVAS_STYLE = { position: 'absolute', inset: 0 } as const;

/** Normale der Schnittgeraden (−sin 6°, cos 6°) als 3D-Richtung der Drift. */
const DRIFT_DIR = new THREE.Vector3(CUT_NORMAL[0], CUT_NORMAL[1], 0);

// ---------------------------------------------------------------------------
// Drift (Feder-Daempfer, reine Funktion)
// ---------------------------------------------------------------------------

interface DriftState {
  /** aktuelle Trennung entlang n, 0 … MAX_SEPARATION */
  readonly offset: number;
  readonly velocity: number;
  /** gedaempfte Pointer-Geschwindigkeit (Canvas-Hoehen pro Sekunde) */
  readonly speed: number;
  /** Ruhelage der Trennung */
  readonly rest: number;
}

const DRIFT_START: DriftState = Object.freeze({ offset: 0, velocity: 0, speed: 0, rest: REST_OPEN });

function isSettled(s: DriftState): boolean {
  return s.speed < SETTLE_EPS && Math.abs(s.velocity) < SETTLE_EPS && Math.abs(s.offset - s.rest) < SETTLE_EPS;
}

/**
 * Ein Schritt (semi-implizites Euler, dt ≤ 1/30 s). Unter 0 schlagen die Haelften
 * aneinander (Geschwindigkeit 0), ueber MAX_SEPARATION ist Schluss.
 */
function stepDrift(s: DriftState, impulse: number, dt: number): DriftState {
  const speed = Math.max(damp(s.speed, 0, SPEED_DECAY_S, dt), impulse);
  const target = Math.min(MAX_SEPARATION, s.rest + speed * SPEED_GAIN);
  const accel = SPRING_STIFFNESS * (target - s.offset) - SPRING_DAMPING * s.velocity;
  const velocity = s.velocity + accel * dt;
  const raw = s.offset + velocity * dt;
  const offset = Math.min(MAX_SEPARATION, Math.max(0, raw));
  const next: DriftState = { offset, velocity: offset === raw ? velocity : 0, speed, rest: s.rest };
  return isSettled(next) ? { ...next, offset: next.rest, velocity: 0, speed: 0 } : next;
}

// ---------------------------------------------------------------------------
// Neigung zum Pointer (Stretch, reine Funktionen)
// ---------------------------------------------------------------------------

/** Pointer-Lage relativ zur Canvas-Mitte, je Achse −1 … 1 (y nach unten). */
interface Tilt {
  readonly x: number;
  readonly y: number;
}

const TILT_ZERO: Tilt = Object.freeze({ x: 0, y: 0 });

function clampUnit(v: number): number {
  return Math.min(1, Math.max(-1, v));
}

function pointerTilt(clientX: number, clientY: number, rect: DOMRect): Tilt {
  if (rect.width <= 0 || rect.height <= 0) return TILT_ZERO;
  return {
    x: clampUnit(((clientX - rect.left) / rect.width) * 2 - 1),
    y: clampUnit(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}

function tiltSettled(current: Tilt, target: Tilt): boolean {
  return Math.abs(current.x - target.x) < SETTLE_EPS && Math.abs(current.y - target.y) < SETTLE_EPS;
}

function stepTilt(current: Tilt, target: Tilt, dt: number): Tilt {
  const next = {
    x: damp(current.x, target.x, TILT_SMOOTH_S, dt),
    y: damp(current.y, target.y, TILT_SMOOTH_S, dt),
  };
  return tiltSettled(next, target) ? target : next;
}

// ---------------------------------------------------------------------------
// Geometrie und Material
// ---------------------------------------------------------------------------

interface EggAssets {
  readonly upper: THREE.BufferGeometry;
  readonly lower: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
}

function createEggAssets(): EggAssets {
  const { upper, lower } = splitPolygons(build404(), [0, 0], CUT_NORMAL);
  const material = new THREE.MeshStandardMaterial({ color: COLORS.brand, roughness: 0.4, metalness: 0 });
  const uniforms = createCutUniforms({
    uCutOrigin: [0, 0, 0],
    uCutNormal: [CUT_NORMAL[0], CUT_NORMAL[1], 0],
    uCutEdge: GLOW.edge,
    uCutGlowStrength: GLOW.strength,
  });
  // Objektraum: die Schnittebene haftet an der Geometrie, nicht an der Mesh-Position.
  patchCutMaterial(material, uniforms, { key: 'notfound-egg', mode: 'edge', space: 'object' });
  return {
    upper: extrudePolygons(upper, { depth: DEPTH }),
    lower: extrudePolygons(lower, { depth: DEPTH }),
    material,
  };
}

function disposeEggAssets(assets: EggAssets): void {
  assets.upper.dispose();
  assets.lower.dispose();
  assets.material.dispose();
}

/** Setzt die Haelften symmetrisch um ±offset/2 entlang n (three-Objekte, Hot Path). */
function applySeparation(upper: THREE.Object3D, lower: THREE.Object3D, offset: number): void {
  upper.position.copy(DRIFT_DIR).multiplyScalar(offset / 2);
  lower.position.copy(DRIFT_DIR).multiplyScalar(-offset / 2);
}

/** Dreht die Ziffern zum Pointer: rechts → Front nach rechts, unten → Front nach unten. */
function applyTilt(group: THREE.Object3D, tilt: Tilt): void {
  group.rotation.set(tilt.y * TILT_MAX.x, tilt.x * TILT_MAX.y, 0);
}

/** Pointer-Geschwindigkeit in Canvas-Hoehen pro Sekunde, oder null ohne gueltiges Vorgaenger-Sample. */
function pointerSpeed(prev: PointerSample | null, next: PointerSample, height: number): number | null {
  if (!prev) return null;
  const dtMs = next.t - prev.t;
  if (dtMs <= 0 || dtMs > POINTER_GAP_MS) return null;
  const distance = Math.hypot(next.x - prev.x, next.y - prev.y) / Math.max(height, 1);
  return Math.min(SPEED_CAP, distance / (dtMs / 1000));
}

interface PointerSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

// ---------------------------------------------------------------------------
// Szene
// ---------------------------------------------------------------------------

function EggDigits({ resetCount, onContextLost }: EggSceneProps) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const assets = useMemo(() => createEggAssets(), []);
  const groupRef = useRef<THREE.Group>(null);
  const upperRef = useRef<THREE.Mesh>(null);
  const lowerRef = useRef<THREE.Mesh>(null);
  const driftRef = useRef<DriftState>(DRIFT_START);
  const impulseRef = useRef(0);
  const resetRef = useRef(false);
  const tiltRef = useRef<Tilt>(TILT_ZERO);
  const tiltTargetRef = useRef<Tilt>(TILT_ZERO);

  useEffect(() => () => disposeEggAssets(assets), [assets]);

  // Button: Ruhelage 0, Pointer-Schwung verwerfen, Schleife wecken.
  useEffect(() => {
    if (resetCount === 0) return;
    resetRef.current = true;
    invalidate();
  }, [resetCount, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    let last: PointerSample | null = null;

    const handleMove = (e: PointerEvent): void => {
      const sample: PointerSample = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      const speed = pointerSpeed(last, sample, canvas.clientHeight);
      last = sample;
      tiltTargetRef.current = pointerTilt(e.clientX, e.clientY, canvas.getBoundingClientRect());
      if (speed !== null) impulseRef.current = Math.max(impulseRef.current, speed);
      invalidate();
    };
    const handleLeave = (): void => {
      last = null;
      tiltTargetRef.current = TILT_ZERO;
      invalidate();
    };
    const handleContextLost = (): void => onContextLost();

    canvas.addEventListener('pointermove', handleMove, { passive: true });
    canvas.addEventListener('pointerleave', handleLeave);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    return () => {
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerleave', handleLeave);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
    };
  }, [gl, invalidate, onContextLost]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const upper = upperRef.current;
    const lower = lowerRef.current;
    if (!group || !upper || !lower) return;
    const dt = Math.min(delta, MAX_DT);

    const base = resetRef.current ? { ...driftRef.current, rest: 0, speed: 0 } : driftRef.current;
    resetRef.current = false;
    const impulse = impulseRef.current;
    impulseRef.current = 0;

    const next = stepDrift(base, impulse, dt);
    driftRef.current = next;
    applySeparation(upper, lower, next.offset);

    const tiltTarget = tiltTargetRef.current;
    const tilt = stepTilt(tiltRef.current, tiltTarget, dt);
    tiltRef.current = tilt;
    applyTilt(group, tilt);

    // Settle-Pattern: weiter rendern nur, solange Drift oder Neigung noch nicht ruhen.
    if (!isSettled(next) || !tiltSettled(tilt, tiltTarget)) invalidate();
  });

  return (
    <group ref={groupRef}>
      <mesh ref={upperRef} geometry={assets.upper} material={assets.material} />
      <mesh ref={lowerRef} geometry={assets.lower} material={assets.material} />
    </group>
  );
}

export default function EggScene({ resetCount, onContextLost }: EggSceneProps) {
  return (
    <Canvas frameloop="demand" dpr={DPR} gl={GL} camera={CAMERA} style={CANVAS_STYLE}>
      <color attach="background" args={[COLORS.ink]} />
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight position={KEY_LIGHT.position} intensity={KEY_LIGHT.intensity} />
      <EggDigits resetCount={resetCount} onContextLost={onContextLost} />
    </Canvas>
  );
}
