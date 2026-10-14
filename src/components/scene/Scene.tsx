'use client';

/**
 * Persistenter Canvas der Startseite (DESIGN_SPEC §5.2), gemountet von
 * SceneLoader (P8) per dynamic(..., { ssr: false }).
 *
 * Reihenfolge der Kinder laut P1: Governor (P8) → CameraRig, Studio, LightRig →
 * TypoArchitecture (P2) → vier StationShells mit den Stationen (P3/P4) →
 * PostFX (nur config.composer), AssetPrefetch, FirstFrame.
 *
 * Fremde Teile (Hero, Stationen) stehen je in Suspense + Fehlergrenze: ein
 * fehlendes Modell oder ein Fehler in einer Station legt nicht die ganze
 * Szene lahm.
 */

import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import Governor from '@/components/perf/Governor';
import TypoArchitecture from '@/components/scene/hero/TypoArchitecture';
import StationBildschirm from '@/components/scene/stations/StationBildschirm';
import StationKopf from '@/components/scene/stations/StationKopf';
import StationMarke from '@/components/scene/stations/StationMarke';
import StationPapier from '@/components/scene/stations/StationPapier';
import { COLORS } from '@/lib/brand';
import { STATION_IDS } from '@/lib/scene/ids';
import { WORLD } from '@/lib/scene/stations';
import { registerInvalidate, ui, useUi } from '@/lib/scene/store';
import { resolveTierConfig } from '@/lib/scene/tiers';
import type { SceneProps, StationContentProps } from '@/types/contracts';
import AssetPrefetch from './core/AssetPrefetch';
import CameraRig from './core/CameraRig';
import FirstFrame from './core/FirstFrame';
import LightRig from './core/LightRig';
import { PlinthKitProvider } from './core/Plinth';
import PostFX from './core/PostFX';
import StationShell, { StationCompile } from './core/StationShell';
import Studio from './core/Studio';

const CAMERA = Object.freeze({ fov: 35, near: 0.1, far: 140, position: [0, 1.6, 16] as [number, number, number] });
/** scroll: false — der Layer ist fixed, kein getBoundingClientRect pro Scroll-Event. */
const RESIZE = Object.freeze({ debounce: 200, scroll: false });
/** Der Canvas-Layer nimmt keine Zeiger-Ereignisse an (der DOM liegt darueber). */
const CANVAS_STYLE = Object.freeze({ pointerEvents: 'none' as const });

function createGlOptions(composer: boolean) {
  return {
    antialias: !composer,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance' as const,
  };
}

function applyToneMapping(gl: THREE.WebGLRenderer, composer: boolean): void {
  gl.toneMapping = composer ? THREE.NoToneMapping : THREE.NeutralToneMapping;
}

function onSceneCreated({ gl, scene, invalidate }: RootState, composer: boolean): void {
  applyToneMapping(gl, composer);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  scene.background = new THREE.Color(COLORS.ink);
  scene.fog = new THREE.FogExp2(COLORS.ink, WORLD.fogDensity);
  registerInvalidate(invalidate);
  ui.set({ sceneStatus: 'loading' });
}

/**
 * Haelt Renderer-Zustand synchron, der sich nach onCreated aendern kann:
 * Tonemapping bei Composer-Wechsel (Governor) und die invalidate-Registrierung
 * (auch nach StrictMode-Remount; null beim Unmount).
 */
function RendererSync({ composer }: { composer: boolean }): null {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    registerInvalidate(invalidate);
    return () => registerInvalidate(null);
  }, [invalidate]);

  useEffect(() => {
    applyToneMapping(gl, composer);
    invalidate();
  }, [gl, composer, invalidate]);

  return null;
}

interface DevSceneWindow {
  __pmScene?: { get: () => RootState };
}

/**
 * Nur Dev: macht den R3F-Zustand fuer Messungen im Browser erreichbar
 * (window.__pmScene.get()), z. B. Projektion von Objekt-Grenzen und
 * gl.info.render.frame fuer das Ruhe-Kriterium (§6.1). In Produktion leer.
 */
function DevSceneHook(): null {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return undefined;
    const target = window as unknown as DevSceneWindow;
    target.__pmScene = { get };
    return () => {
      if (target.__pmScene?.get === get) delete target.__pmScene;
    };
  }, [get]);
  return null;
}

interface SceneBoundaryProps {
  name: string;
  children: ReactNode;
}

interface SceneBoundaryState {
  failed: boolean;
}

/** Fehlergrenze fuer fremde Szene-Teile (Fehlergrenzen gibt es nur als Klasse). */
class SceneBoundary extends Component<SceneBoundaryProps, SceneBoundaryState> {
  state: SceneBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== 'production') {
      console.assert(false, `[Scene] ${this.props.name} ausgefallen:`, error, info.componentStack);
    }
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Station-Inhalt nach Id (Importe laut types/contracts.ts). */
function StationContent({ id, config, reduced }: StationContentProps) {
  switch (id) {
    case 'marke':
      return <StationMarke id={id} config={config} reduced={reduced} />;
    case 'bildschirm':
      return <StationBildschirm id={id} config={config} reduced={reduced} />;
    case 'papier':
      return <StationPapier id={id} config={config} reduced={reduced} />;
    case 'kopf':
      return <StationKopf id={id} config={config} reduced={reduced} />;
  }
}

export default function Scene({ tier, compact }: SceneProps) {
  const quality = useUi((s) => s.quality);
  const reduced = useUi((s) => s.motion === 'reduced');
  const config = resolveTierConfig(tier, compact, quality);
  // Kontext-Attribute gelten nur bei der Erstellung; spaetere Composer-Wechsel
  // aendern sie nicht (MSAA uebernimmt dann der Composer bzw. entfaellt).
  const [glOptions] = useState(() => createGlOptions(config.composer));

  return (
    <Canvas
      frameloop="demand"
      dpr={config.dpr}
      gl={glOptions}
      camera={CAMERA}
      resize={RESIZE}
      style={CANVAS_STYLE}
      onCreated={(state) => onSceneCreated(state, config.composer)}
    >
      <RendererSync composer={config.composer} />
      <DevSceneHook />
      <Governor />
      <CameraRig />
      <Studio config={config} />
      <LightRig />
      <SceneBoundary name="TypoArchitecture">
        <Suspense fallback={null}>
          <TypoArchitecture config={config} reduced={reduced} />
        </Suspense>
      </SceneBoundary>
      <PlinthKitProvider>
        {STATION_IDS.map((id) => (
          <StationShell key={id} id={id}>
            <SceneBoundary name={`Station ${id}`}>
              <Suspense fallback={null}>
                <StationContent id={id} config={config} reduced={reduced} />
                <StationCompile />
              </Suspense>
            </SceneBoundary>
          </StationShell>
        ))}
      </PlinthKitProvider>
      {config.composer && <PostFX />}
      <AssetPrefetch />
      <FirstFrame />
    </Canvas>
  );
}
