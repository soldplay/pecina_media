'use client';

/**
 * Performance-Governor (DESIGN_SPEC §5.7). Lebt in der Canvas (Scene, P1) und
 * zeichnet nichts: er rendert nur den PerformanceMonitor (Kontext ohne Objekte)
 * und in Dev optional das PerfHud.
 *
 * Frameloop (Settle-Pattern):
 * | Zustand                                         | frameloop |
 * | document.hidden, ui.covered, ui.menuOpen         | never     |
 * | Bewegung an und now < frame.dirtyUntil            | always    |
 * | Bewegung an, 1,0 s ohne keepAlive (IDLE_AFTER_MS)  | demand    |
 * |   … und keine Daempfung (frame.settleUntil)        |           |
 * | Bewegung reduziert                                | demand, ein invalidate() pro ui-Wechsel |
 * Zurueck aus never: demand + invalidate(). keepAlive() ruft invalidate und
 * weckt damit eine ruhende Schleife; der useFrame unten schaltet dann auf always.
 *
 * Laufzeit-Abstufung (PerformanceMonitor, Werte laut Spec): onDecline stuft eine
 * wirksame Stufe ab (dpr 1 → Composer aus via ui.quality 0.99 → ui.quality 0.4
 * → Fallback), wirkungslose Stufen werden uebersprungen. onIncline hebt nur den
 * dpr wieder bis zum Tier-Maximum. Fallback (Stufe 4 oder mehr als 3 echte
 * Richtungswechsel) und webglcontextlost → ui.tier 'low' (SceneLoader haengt die
 * Szene aus). drei-onFallback allein reicht dafuer nicht, siehe useDegrade.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useFrame, useThree, type RootState } from '@react-three/fiber';
import { IDLE_AFTER_MS } from '@/components/scene/core/settle';
import { frame, ui, useUi } from '@/lib/scene/store';
import { resolveTierConfig, type SceneTier, type TierConfig } from '@/lib/scene/tiers';

/** Nur in Dev gebuendelt; in Produktion entfernt der Bundler den Import. */
const PerfHud = process.env.NODE_ENV === 'production' ? null : lazy(() => import('./PerfHud'));

const MONITOR_MS = 250;
const MONITOR_ITERATIONS = 10;
const MONITOR_THRESHOLD = 0.75;
/** Richtungswechsel (ab → auf → ab ...), ab denen die Abstufung aufgibt. */
const MONITOR_FLIPFLOPS = 3;
const monitorBounds = (refreshrate: number): [number, number] => (refreshrate > 100 ? [50, 90] : [40, 55]);

/** quality < 1 schaltet in resolveTierConfig den Composer ab (dpr [1, 1]). */
const QUALITY_NO_COMPOSER = 0.99;
const QUALITY_MIN = 0.4;

// ------------------------------------------------------------ Abstufung (rein)

type Stage = 0 | 1 | 2 | 3 | 4;
type Direction = 'down' | 'up';

interface DegradeState {
  readonly stage: Stage;
  /** Richtungswechsel zwischen wirksamen Schritten */
  readonly flips: number;
  readonly lastDirection: Direction | null;
}

type DegradeAction =
  | { readonly kind: 'dpr-min' }
  | { readonly kind: 'dpr-max' }
  | { readonly kind: 'quality'; readonly value: number }
  | { readonly kind: 'fallback' }
  | { readonly kind: 'none' };

interface DegradeContext {
  readonly dpr: number;
  readonly composer: boolean;
  readonly quality: number;
}

interface DegradeStep {
  readonly next: DegradeState;
  readonly action: DegradeAction;
}

const INITIAL_DEGRADE: DegradeState = Object.freeze({ stage: 0, flips: 0, lastDirection: null });
const NO_ACTION: DegradeAction = Object.freeze({ kind: 'none' });
const FALLBACK: DegradeAction = Object.freeze({ kind: 'fallback' });

function step(state: DegradeState, stage: Stage, direction: Direction, action: DegradeAction): DegradeStep {
  const flipped = state.lastDirection !== null && state.lastDirection !== direction;
  const next: DegradeState = Object.freeze({
    stage,
    flips: state.flips + (flipped ? 1 : 0),
    lastDirection: direction,
  });
  // Pendelt die Leistung dauerhaft um die Grenze, gibt die Abstufung auf (Spec: flipflops 3 → low).
  return next.flips > MONITOR_FLIPFLOPS ? { next: Object.freeze({ ...next, stage: 4 }), action: FALLBACK } : { next, action };
}

function planDecline(state: DegradeState, ctx: DegradeContext): DegradeStep {
  if (state.stage < 1 && ctx.dpr > 1) return step(state, 1, 'down', { kind: 'dpr-min' });
  if (state.stage < 2 && ctx.composer) return step(state, 2, 'down', { kind: 'quality', value: QUALITY_NO_COMPOSER });
  if (state.stage < 3 && ctx.quality > QUALITY_MIN) return step(state, 3, 'down', { kind: 'quality', value: QUALITY_MIN });
  return step(state, 4, 'down', FALLBACK);
}

function planIncline(state: DegradeState, ctx: DegradeContext): DegradeStep {
  // Nur Stufe 1 (dpr) ist umkehrbar; Composer und Mengen bleiben unten (Spec).
  if (state.stage !== 1 || ctx.quality < 1) return { next: state, action: NO_ACTION };
  return step(state, 0, 'up', { kind: 'dpr-max' });
}

function asSceneTier(tier: string): SceneTier {
  return tier === 'high' ? 'high' : 'mid';
}

// ------------------------------------------------------------ Hilfen (R3F-State)

/**
 * Wechsel nach never: vorgemerkte Frames verwerfen. Sonst rendert R3F noch
 * einen Frame im never-Modus und rechnet dessen delta aus dem rAF-Zeitstempel
 * (Millisekunden seit Seitenstart statt Sekunden-Delta).
 */
function enterNever(state: RootState): void {
  state.setFrameloop('never');
  state.internal.frames = 0;
}

/** always/demand ohne setFrameloop: die Uhr laeuft weiter (setFrameloop setzt elapsedTime auf 0). */
function switchLoop(state: RootState, mode: 'always' | 'demand'): void {
  state.set({ frameloop: mode });
  // Der laufende Frame gibt den alten Modus zurueck; ohne invalidate stuende die Schleife.
  if (mode === 'always') state.invalidate();
}

function readHudFlag(): boolean {
  if (PerfHud === null) return false;
  try {
    return new URLSearchParams(window.location.search).get('hud') === '1';
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ Hooks

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

/** never bei verborgen/verdeckt/Menue; sonst demand + ein invalidate (auch bei Bewegungswechsel). */
function useBaseFrameloop(blocked: boolean, reduced: boolean): void {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const state = get();
    if (blocked) {
      enterNever(state);
      return;
    }
    state.setFrameloop('demand');
    state.invalidate();
  }, [blocked, reduced, get]);
}

/** Bei reduzierter Bewegung: ein Standbild pro ui-Wechsel. */
function useReducedInvalidate(reduced: boolean): void {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!reduced) return undefined;
    return ui.subscribe(() => invalidate());
  }, [reduced, invalidate]);
}

/**
 * always, solange keepAlive aktiv ist (bzw. bis IDLE_AFTER_MS danach, settle.ts)
 * oder eine Daempfung per requestFrames weiterlaeuft (frame.settleUntil, ohne
 * Nachlauf), sonst demand.
 */
function useSettleLoop(): void {
  const lastDirtyRef = useRef(0);
  const lastKeepAliveRef = useRef(Number.NEGATIVE_INFINITY);

  useFrame((state) => {
    const { motion, covered, menuOpen } = ui.get();
    if (motion === 'reduced' || covered || menuOpen || document.hidden) return;

    const now = performance.now();
    if (frame.dirtyUntil > lastDirtyRef.current) {
      // dirtyUntil ist gewachsen → seit dem letzten Frame lief ein keepAlive.
      lastDirtyRef.current = frame.dirtyUntil;
      lastKeepAliveRef.current = now;
    }
    const busy =
      now < frame.dirtyUntil || now - lastKeepAliveRef.current < IDLE_AFTER_MS || now < frame.settleUntil;
    if (busy && state.frameloop !== 'always') switchLoop(state, 'always');
    else if (!busy && state.frameloop === 'always') switchLoop(state, 'demand');
  });
}

/** Kontextverlust (DevTools „Lose context“, GPU-Reset) → Low ohne Fehlerseite. */
function useContextLossFallback(): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (): void => {
      // Beim regulaeren Aushaengen verliert R3F den Kontext absichtlich; dann ist die Canvas schon weg.
      if (!canvas.isConnected) return;
      ui.set({ tier: 'low' });
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl]);
}

interface DegradeHandlers {
  readonly onDecline: () => void;
  readonly onIncline: () => void;
  readonly onFallback: () => void;
}

/** Aktuelle Tier-Konfiguration (Governor bekommt keine Props; Quelle ist ui wie in Scene). */
function currentConfig(): TierConfig {
  const { tier, compact, quality } = ui.get();
  return resolveTierConfig(asSceneTier(tier), compact, quality);
}

function readDegradeContext(state: RootState): DegradeContext {
  return { dpr: state.viewport.dpr, composer: currentConfig().composer, quality: ui.get().quality };
}

/**
 * Haelt Stufe 1 (dpr 1) gegen die Canvas: R3F setzt bei jedem Render der Canvas
 * (Resize, Prop-Wechsel) den dpr aus dem Prop neu.
 */
function useDprCap(): (capped: boolean) => void {
  const setDpr = useThree((s) => s.setDpr);
  const viewportDpr = useThree((s) => s.viewport.dpr);
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    if (capped && viewportDpr > 1) setDpr(1);
  }, [capped, viewportDpr, setDpr]);
  return setCapped;
}

/** Wendet die Abstufung an (Stufe in einem Ref: die Monitor-Callbacks laufen im Render-Loop). */
function useDegrade(rearmMonitor: () => void): DegradeHandlers {
  const get = useThree((s) => s.get);
  const setDpr = useThree((s) => s.setDpr);
  const invalidate = useThree((s) => s.invalidate);
  const setDprCapped = useDprCap();
  const degradeRef = useRef<DegradeState>(INITIAL_DEGRADE);

  const apply = useCallback(
    ({ next, action }: DegradeStep): void => {
      degradeRef.current = next;
      if (action.kind === 'none') return;
      if (action.kind === 'dpr-min' || action.kind === 'dpr-max') {
        const capped = action.kind === 'dpr-min';
        setDprCapped(capped);
        setDpr(capped ? 1 : currentConfig().dpr);
      } else if (action.kind === 'quality') {
        ui.set({ quality: action.value });
      } else {
        ui.set({ tier: 'low' });
      }
      invalidate();
    },
    [setDprCapped, setDpr, invalidate],
  );

  return {
    onDecline: () => apply(planDecline(degradeRef.current, readDegradeContext(get()))),
    onIncline: () => apply(planIncline(degradeRef.current, readDegradeContext(get()))),
    onFallback: () => {
      // drei zaehlt jedes Ereignis als Flip, auch onIncline bei voller Qualitaet: ein
      // schnelles Geraet laege nach ~10 s ruhigem Scrollen sonst auf Low. Deshalb zaehlt
      // die Abstufung selbst nur echte Richtungswechsel (siehe step) und der Monitor
      // wird hier neu gestartet.
      if (degradeRef.current.stage < 4) rearmMonitor();
    },
  };
}

// ------------------------------------------------------------ Komponente

export default function Governor() {
  const reduced = useUi((s) => s.motion === 'reduced');
  const covered = useUi((s) => s.covered);
  const menuOpen = useUi((s) => s.menuOpen);
  const sceneReady = useUi((s) => s.sceneStatus === 'ready');
  const hidden = useDocumentHidden();
  const blocked = hidden || covered || menuOpen;

  const [hud] = useState(readHudFlag);
  const [monitorEpoch, setMonitorEpoch] = useState(0);
  const rearmMonitor = useCallback(() => setMonitorEpoch((n) => n + 1), []);

  useBaseFrameloop(blocked, reduced);
  useReducedInvalidate(reduced);
  useSettleLoop();
  useContextLossFallback();
  const { onDecline, onIncline, onFallback } = useDegrade(rearmMonitor);

  // Gemessen wird nur bei Bewegung (bei reduziert entstehen Einzelbilder, keine
  // Bildrate) und erst, wenn die Szene steht. Ausreisser nach Ruhephasen: Der
  // erste Messblock nach einer Pause spannt die Pause mit (z. B. 2 Frames in 10 s
  // → 0,2 fps). Pro Wiederaufnahme entsteht hoechstens ein solcher Block, danach
  // laeuft always ohne Luecke weiter (≥ 1,2 s, also ≥ 4 Bloecke à 250 ms). Eine
  // Stufe faellt erst, wenn mehr als 75 % von 10 Bloecken unter der Grenze liegen
  // (≥ 8 von 10) — einzelne Ausreisser loesen also nichts aus.
  const monitoring = !reduced && sceneReady;

  return (
    <>
      {monitoring && (
        <PerformanceMonitor
          key={monitorEpoch}
          ms={MONITOR_MS}
          iterations={MONITOR_ITERATIONS}
          threshold={MONITOR_THRESHOLD}
          bounds={monitorBounds}
          flipflops={MONITOR_FLIPFLOPS}
          onDecline={onDecline}
          onIncline={onIncline}
          onFallback={onFallback}
        />
      )}
      {hud && PerfHud && (
        <Suspense fallback={null}>
          <PerfHud />
        </Suspense>
      )}
    </>
  );
}
