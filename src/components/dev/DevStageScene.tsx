'use client';

/**
 * Canvas der Dev-Sandbox. Wird von DevStage per dynamic(..., { ssr: false })
 * geladen. Stationen und TypoArchitecture kommen lazy ueber die Pfade aus
 * src/types/contracts.ts und rendern in Station-lokalen Koordinaten.
 */

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { COLORS, CUT_COS, CUT_SIN } from '@/lib/brand';
import { HDRI } from '@/lib/scene/assets';
import { isStationId, type StationId } from '@/lib/scene/ids';
import { PLINTH, STATIONS, WORLD } from '@/lib/scene/stations';
import { registerInvalidate } from '@/lib/scene/store';
import { resolveTierConfig, type SceneTier } from '@/lib/scene/tiers';
import { createCutUniforms, patchCutMaterial, type CutUniforms } from '@/lib/three/cut';
import type { StationContentProps, TypoArchitectureProps } from '@/types/contracts';
import type { DevStageId, DevTestSettings } from './dev-stage-types';

const STATION_COMPONENTS: Readonly<Record<StationId, LazyExoticComponent<ComponentType<StationContentProps>>>> = {
  marke: lazy(() => import('@/components/scene/stations/StationMarke')),
  bildschirm: lazy(() => import('@/components/scene/stations/StationBildschirm')),
  papier: lazy(() => import('@/components/scene/stations/StationPapier')),
  kopf: lazy(() => import('@/components/scene/stations/StationKopf')),
};

const TypoArchitecture: LazyExoticComponent<ComponentType<TypoArchitectureProps>> = lazy(
  () => import('@/components/scene/hero/TypoArchitecture'),
);

const CAMERA_DEFAULT = { position: [2.5, 1.8, 3.5] as const, target: [0, 1.3, 0] as const };
/** Hero: Skulptur ist 12 m breit, daher aus S0-Naehe (§3.9) statt aus der Naehe. */
const CAMERA_HERO = { position: [0, 1.6, 16] as const, target: [0, 1.6, 0] as const };

const KEY_LIGHT = { position: [2.5, 4.5, 3.5] as const, intensity: 90, angle: 0.55, penumbra: 0.85, decay: 2 };

const SPHERE_RADIUS = 0.28;
const SPHERE_Y = PLINTH.objectBaseY + SPHERE_RADIUS;
const SPHERE_X = 0.34;
const ALONG_HALF_SPAN = 0.5;

export interface DevStageSceneProps {
  id: DevStageId;
  tier: SceneTier;
  compact: boolean;
  reduced: boolean;
  test: DevTestSettings;
}

function InvalidateBridge() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    registerInvalidate(invalidate);
    return () => registerInvalidate(null);
  }, [invalidate]);
  return null;
}

function KeyLight({ color }: { color: string }) {
  const ref = useRef<THREE.SpotLight>(null);
  useEffect(() => {
    const light = ref.current;
    if (!light) return;
    light.target.position.set(CAMERA_DEFAULT.target[0], CAMERA_DEFAULT.target[1], CAMERA_DEFAULT.target[2]);
    light.target.updateMatrixWorld();
  }, []);
  return (
    <spotLight
      ref={ref}
      position={[...KEY_LIGHT.position]}
      color={color}
      intensity={KEY_LIGHT.intensity}
      angle={KEY_LIGHT.angle}
      penumbra={KEY_LIGHT.penumbra}
      decay={KEY_LIGHT.decay}
    />
  );
}

/** Vereinfachter Sockel: Unterteil + Werkplatte (Oberkante = PLINTH.objectBaseY). */
function DevPlinth() {
  const { plate } = PLINTH;
  return (
    <group>
      <mesh position={[0, PLINTH.cutY / 2, 0]}>
        <boxGeometry args={[PLINTH.width, PLINTH.cutY, PLINTH.depth]} />
        <meshStandardMaterial color={COLORS.anthracite} roughness={0.82} />
      </mesh>
      <mesh position={[0, plate.y + plate.h / 2, 0]}>
        <boxGeometry args={[plate.w, plate.h, plate.d]} />
        <meshStandardMaterial color={COLORS.graphite} roughness={0.7} />
      </mesh>
    </group>
  );
}

/**
 * Uniform-Werte sind three-Objekte ausserhalb von React (Hot Path); sie werden
 * bewusst in-place gesetzt, das Programm kompiliert dabei nicht neu.
 */
function applyTestUniforms(u: CutUniforms, offset: number, along: boolean, progress: number): void {
  u.uCutOffset.value = offset;
  u.uCutAlongRange.value.set(along ? -ALONG_HALF_SPAN : 0, along ? ALONG_HALF_SPAN : 0);
  u.uCutProgress.value = progress;
}

/**
 * Schnitt-Test: dieselben Uniforms an MeshStandardMaterial (links) und
 * MeshPhysicalMaterial (rechts). Moduswechsel erzeugt neue Materialien
 * (neues Programm), Offset/Progress aendern nur Uniform-Werte.
 */
function CutTestSpheres({ settings }: { settings: DevTestSettings }) {
  const uniforms = useMemo(
    () =>
      createCutUniforms({
        uCutOrigin: [0, SPHERE_Y, 0],
        uCutNormal: [-CUT_SIN, CUT_COS, 0],
        uCutEdge: 0.02,
        uBelowColor: COLORS.paper,
        uBelowRoughness: 0.25,
        uBelowMetalness: 0.6,
        uNoiseAmp: 0.03,
      }),
    [],
  );

  const materials = useMemo(() => {
    const side = settings.mode === 'edge' || settings.mode === 'recolor' ? THREE.FrontSide : THREE.DoubleSide;
    const standard = new THREE.MeshStandardMaterial({ color: COLORS.brand, roughness: 0.4, side });
    const physical = new THREE.MeshPhysicalMaterial({
      color: COLORS.brand,
      roughness: 0.38,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      side,
    });
    patchCutMaterial(standard, uniforms, { key: 'dev-test-standard', mode: settings.mode, space: 'world', keep: settings.keep });
    patchCutMaterial(physical, uniforms, { key: 'dev-test-physical', mode: settings.mode, space: 'world', keep: settings.keep });
    return { standard, physical };
  }, [settings.mode, settings.keep, uniforms]);

  useEffect(() => () => {
    materials.standard.dispose();
    materials.physical.dispose();
  }, [materials]);

  useEffect(() => {
    applyTestUniforms(uniforms, settings.offset, settings.along, settings.progress);
  }, [uniforms, settings.offset, settings.along, settings.progress]);

  return (
    <group>
      <mesh position={[-SPHERE_X, SPHERE_Y, 0]} material={materials.standard}>
        <sphereGeometry args={[SPHERE_RADIUS, 64, 48]} />
      </mesh>
      <mesh position={[SPHERE_X, SPHERE_Y, 0]} material={materials.physical}>
        <sphereGeometry args={[SPHERE_RADIUS, 64, 48]} />
      </mesh>
    </group>
  );
}

/** Meldet nach jedem Moduswechsel die Zahl der kompilierten Programme. */
function ProgramProbe({ signature, onReport }: { signature: string; onReport: (programs: number) => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const timer = setTimeout(() => onReport(gl.info.programs?.length ?? 0), 600);
    return () => clearTimeout(timer);
  }, [gl, signature, onReport]);
  return null;
}

interface ShaderStatus {
  readonly errors: readonly string[];
  readonly programs: number;
}

export default function DevStageScene({ id, tier, compact, reduced, test }: DevStageSceneProps) {
  const config = resolveTierConfig(tier, compact, 1);
  const station = isStationId(id) ? id : null;
  const Station = station ? STATION_COMPONENTS[station] : null;
  const camera = id === 'hero' ? CAMERA_HERO : CAMERA_DEFAULT;
  const keyTint = station ? STATIONS[station].keyTint : COLORS.blade;
  const [status, setStatus] = useState<ShaderStatus>({ errors: [], programs: 0 });

  const reportPrograms = useCallback((programs: number) => setStatus((s) => ({ ...s, programs })), []);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.debug.checkShaderErrors = true;
    gl.debug.onShaderError = (ctx, program, vs, fs) => {
      const log = [ctx.getProgramInfoLog(program), ctx.getShaderInfoLog(vs), ctx.getShaderInfoLog(fs)]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join('\n');
      setStatus((s) => ({ ...s, errors: [...s.errors, log || 'Unbekannter Shader-Fehler'] }));
    };
  }, []);

  return (
    <>
      <Canvas
        frameloop="always"
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        camera={{ fov: 35, near: 0.1, far: 140, position: [...camera.position] }}
        onCreated={handleCreated}
        style={{ position: 'absolute', inset: 0 }}
      >
        <InvalidateBridge />
        <color attach="background" args={[WORLD.background]} />
        <OrbitControls makeDefault target={[...camera.target]} />
        <ambientLight intensity={0.15} />
        <KeyLight color={keyTint} />
        <Suspense fallback={null}>
          <Environment files={HDRI.studio.url} environmentIntensity={0.35} />
        </Suspense>
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color={WORLD.floorColor} roughness={0.9} />
        </mesh>

        {id !== 'hero' && <DevPlinth />}
        {id === 'test' && (
          <>
            <CutTestSpheres settings={test} />
            <ProgramProbe signature={`${test.mode}-${test.keep}`} onReport={reportPrograms} />
          </>
        )}
        {id === 'hero' && (
          <Suspense fallback={null}>
            <TypoArchitecture config={config} reduced={reduced} />
          </Suspense>
        )}
        {station && Station && (
          <Suspense fallback={null}>
            <Station id={station} config={config} reduced={reduced} />
          </Suspense>
        )}
      </Canvas>
      {id === 'test' && (
        <output
          data-testid="shader-status"
          data-shader-errors={status.errors.length}
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
            maxWidth: 'min(640px, calc(100vw - 300px))',
            maxHeight: '40vh',
            overflow: 'auto',
            padding: 10,
            background: 'rgba(14,14,14,0.92)',
            border: `1px solid ${status.errors.length ? COLORS.brand : 'rgba(244,241,234,0.16)'}`,
            font: '12px/1.4 ui-monospace, monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {status.errors.length === 0
            ? `Shader OK · Modus ${test.mode} · keep ${test.keep} · Programme ${status.programs}`
            : `Shader-Fehler (${status.errors.length}):\n${status.errors.join('\n---\n')}`}
        </output>
      )}
    </>
  );
}
