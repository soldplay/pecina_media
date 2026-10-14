'use client';

/**
 * SceneLoader (DESIGN_SPEC §5.2, §5.7) — erstes Kind von page.tsx.
 *
 * - Rendert sofort den fixen Canvas-Layer `<div class="scene-layer" aria-hidden>`
 *   (Ink, z 0). Solange `ui.covered` (Papierwand), ist er `visibility: hidden`.
 * - Nach der Hydration und requestIdleCallback (Timeout 1200 ms) bestimmt er den
 *   Tier (detect-tier.ts):
 *   - low:  LowTierBackdrop, html[data-scene="off"],
 *           ui { tier: 'low', sceneStatus: 'off', preloaderDone: true }
 *   - sonst: Scene (P1) per dynamic(..., { ssr: false }) mit { tier, compact },
 *           html[data-scene="on"], ui { tier, compact }
 * - Faellt der Tier zur Laufzeit auf low (Governor: Fallback/Kontextverlust,
 *   oder ein Fehler im 3D-Baum), wird die Scene ausgehaengt, data-scene 'off',
 *   LowTierBackdrop sichtbar, und 'low' fuer die Sitzung gemerkt.
 * - Ein Fehler im 3D-Baum hinterlaesst auch in Produktion eine Spur:
 *   html[data-scene-error="<Fehlername>"] (z. B. 'ChunkLoadError'), fuer Abnahmen und Geraetetests.
 *
 * Der 3D-Chunk (three, fiber, drei, Scene) haengt nur am dynamischen Import:
 * Auf Low wird <Scene> nie gerendert, also nie geladen. Mit ssr: false gibt es
 * auch keinen Preload-Link im Server-HTML.
 */

import dynamic from 'next/dynamic';
import { Component, useEffect, useMemo, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { ui, useUi } from '@/lib/scene/store';
import type { SceneProps } from '@/types/contracts';
import { detectTier, rememberTier, type TierDetection } from './detect-tier';
import LowTierBackdrop from './LowTierBackdrop';

const Scene = dynamic(() => import('@/components/scene/Scene'), { ssr: false });

const IDLE_TIMEOUT_MS = 1200;
/** Ohne requestIdleCallback (Safari): kurz nach der Hydration. */
const IDLE_FALLBACK_MS = 50;

const HIDDEN_STYLE: CSSProperties = Object.freeze({ visibility: 'hidden' });

type Phase = 'pending' | 'scene' | 'off';

const SCENE_ATTRIBUTE: Readonly<Record<Phase, string>> = Object.freeze({
  pending: 'pending',
  scene: 'on',
  off: 'off',
});

function scheduleIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(timer);
}

/** Schreibt das Erkennungsergebnis in den Store (vor dem Mount der Scene). */
function publishDetection({ tier, compact }: TierDetection): void {
  if (tier === 'low') {
    ui.set({ tier: 'low', compact, sceneStatus: 'off', preloaderDone: true });
  } else {
    ui.set({ tier, compact });
  }
}

function derivePhase(detection: TierDetection | null, runtimeLow: boolean): Phase {
  if (detection === null) return 'pending';
  return detection.tier === 'low' || runtimeLow ? 'off' : 'scene';
}

function toSceneProps(detection: TierDetection | null): SceneProps | null {
  if (detection === null || detection.tier === 'low') return null;
  return { tier: detection.tier, compact: detection.compact };
}

interface SceneBoundaryState {
  failed: boolean;
}

/**
 * Faengt Fehler im 3D-Baum (Chunk laedt nicht, Kontext laesst sich nicht
 * anlegen, ...) und schaltet auf Low, statt die Seite in die Fehleransicht zu
 * reissen. Fehlergrenzen gibt es in React nur als Klasse.
 */
class SceneBoundary extends Component<{ children: ReactNode }, SceneBoundaryState> {
  state: SceneBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    document.documentElement.dataset.sceneError = error instanceof Error ? error.name : 'unknown';
    if (process.env.NODE_ENV !== 'production') {
      console.assert(false, '[SceneLoader] 3D ausgefallen, wechsle auf Low:', error, info.componentStack);
    }
    ui.set({ tier: 'low' });
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** html[data-scene] folgt der Phase; beim Verlassen der Seite wieder 'pending'. */
function useSceneAttribute(phase: Phase): void {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scene = SCENE_ATTRIBUTE[phase];
    return () => {
      root.dataset.scene = SCENE_ATTRIBUTE.pending;
    };
  }, [phase]);
}

/** Laufzeit-Abstieg auf low: Szene aus, Preloader frei, fuer die Sitzung merken. */
function useRuntimeFallback(detection: TierDetection | null, runtimeLow: boolean): void {
  const sceneWasOn = detection !== null && detection.tier !== 'low';
  useEffect(() => {
    if (!sceneWasOn || !runtimeLow) return;
    ui.set({ sceneStatus: 'off', preloaderDone: true });
    rememberTier('low');
  }, [sceneWasOn, runtimeLow]);
}

export default function SceneLoader() {
  const covered = useUi((s) => s.covered);
  const runtimeLow = useUi((s) => s.tier === 'low');
  const [detection, setDetection] = useState<TierDetection | null>(null);

  useEffect(
    () =>
      scheduleIdle(() => {
        const result = detectTier();
        publishDetection(result);
        setDetection(result);
      }),
    [],
  );

  // Ohne Szene gibt es keinen Szenenstatus; beim Zurueckkehren laedt sie neu.
  useEffect(() => () => ui.set({ sceneStatus: 'pending' }), []);

  const phase = derivePhase(detection, runtimeLow);
  useSceneAttribute(phase);
  useRuntimeFallback(detection, runtimeLow);

  // Stabiles Element: Neu-Renders des Layers (covered) erreichen die Canvas nicht.
  const sceneProps = toSceneProps(detection);
  const sceneTier = sceneProps?.tier;
  const sceneCompact = sceneProps?.compact;
  const sceneElement = useMemo(
    () =>
      sceneTier === undefined || sceneCompact === undefined ? null : (
        <SceneBoundary>
          <Scene tier={sceneTier} compact={sceneCompact} />
        </SceneBoundary>
      ),
    [sceneTier, sceneCompact],
  );

  return (
    <div className="scene-layer" aria-hidden="true" style={covered ? HIDDEN_STYLE : undefined}>
      {phase === 'off' && <LowTierBackdrop />}
      {phase === 'scene' && sceneElement}
    </div>
  );
}
