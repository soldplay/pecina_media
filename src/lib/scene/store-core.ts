/**
 * React-freier Kern des Szene-Stores (DESIGN_SPEC §5.4).
 *
 * Pakete importieren aus `@/lib/scene/store` (dort zusaetzlich `useUi`). Diese
 * Datei existiert nur, damit `lib/a11y/motion.ts` — das vom Server-Layout
 * importiert wird — `ui` nutzen kann, ohne `useSyncExternalStore` in den
 * Server-Graph zu ziehen (der React-Server-Build exportiert den Hook nicht).
 *
 * Kein Import von zustand: liegt nur transitiv ueber fiber/drei vor
 * (Phantom-Dependency, Version nicht von uns gepinnt).
 */

import {
  BEAT_IDS,
  SECTION_IDS,
  STATION_IDS,
  type AnchorId,
  type BeatId,
  type SectionId,
  type StationId,
} from './ids';

// ---------------------------------------------------------------------------
// frame — Per-Frame-Daten
// ---------------------------------------------------------------------------

export interface FrameState {
  scrollY: number;
  vh: number;
  vw: number;
  /** 0..1 je Sektion (SceneScrollChannel) */
  sections: Record<SectionId, number>;
  /** 0..1 je Beat (SceneScrollChannel) */
  beats: Record<BeatId, number>;
  /** NDC, nur feiner Pointer (SceneScrollChannel) */
  pointer: { x: number; y: number };
  /** geschrieben von P2 */
  hero: { open: number; intro: number };
  /** geschrieben von P1 */
  stationVisible: Record<StationId, boolean>;
  /** Gedaempftes Blickziel der Kamera (Welt), geschrieben von P1 (CameraRig), gelesen vom LightRig */
  cameraTarget: { x: number; y: number; z: number };
  /** Ziel-z der Kamera (ungedaempft, Scroll-Pose), geschrieben von P1; LightRig dimmt danach am Spalt */
  cameraGoalZ: number;
  /** performance.now()-Zeitpunkt, bis zu dem die Szene rendern soll (Settle-Pattern) */
  dirtyUntil: number;
  /**
   * Bis hierhin rendert der Governor ebenfalls, aber OHNE Nachlauf: gesetzt von
   * requestFrames() (gedaempfte Animationen, components/scene/core/settle.ts).
   */
  settleUntil: number;
}

function filled<K extends string, V>(keys: readonly K[], value: V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>;
}

/**
 * BEWUSST MUTIERBAR — einzige Ausnahme von der Immutability-Regel.
 * Hot Path: wird bei jedem Scroll-Event bzw. in useFrame gelesen und
 * geschrieben, ohne React-Render. Nie in React-State spiegeln.
 */
export const frame: FrameState = {
  scrollY: 0,
  vh: typeof window === 'undefined' ? 0 : window.innerHeight,
  vw: typeof window === 'undefined' ? 0 : window.innerWidth,
  sections: filled(SECTION_IDS, 0),
  beats: filled(BEAT_IDS, 0),
  pointer: { x: 0, y: 0 },
  hero: { open: 0, intro: 0 },
  stationVisible: filled(STATION_IDS, false),
  cameraTarget: { x: 0, y: 0, z: 0 },
  cameraGoalZ: 0,
  dirtyUntil: 0,
  settleUntil: 0,
};

// ---------------------------------------------------------------------------
// layout — Scroll-Positionen der Anker (px), nach jedem ScrollTrigger-Refresh
// ---------------------------------------------------------------------------

export interface AnchorRange {
  readonly start: number;
  readonly end: number;
}

export interface LayoutState {
  /** steigt bei jedem Refresh; 3D-Pakete vergleichen ihn in useFrame */
  version: number;
  /** wird pro Refresh als neues, eingefrorenes Objekt ersetzt (nie in-place geaendert) */
  anchors: Readonly<Partial<Record<AnchorId, AnchorRange>>>;
}

/** Teil des Hot-Path-Stores: nur SceneScrollChannel schreibt (version++, anchors ersetzen). */
export const layout: LayoutState = { version: 0, anchors: {} };

/** Scroll-Position, an der der Anker `id` den Fortschritt `p` erreicht; null, wenn unbekannt. */
export function anchorY(id: AnchorId, p: number): number | null {
  const range = layout.anchors[id];
  if (!range) return null;
  return range.start + p * (range.end - range.start);
}

// ---------------------------------------------------------------------------
// ui — unveraenderlicher, abonnierbarer UI-Zustand
// ---------------------------------------------------------------------------

export interface UiState {
  motion: 'full' | 'reduced';
  motionSource: 'system' | 'user';
  tier: 'pending' | 'high' | 'mid' | 'low';
  compact: boolean;
  /** 1 → 0.4 (Governor) */
  quality: number;
  sceneStatus: 'pending' | 'loading' | 'ready' | 'off';
  loadProgress: number;
  preloaderDone: boolean;
  activeSection: SectionId;
  activeStation: StationId | null;
  activeBeat: BeatId | null;
  haltungActive: 0 | 1 | 2 | 3;
  covered: boolean;
  menuOpen: boolean;
  ctaHover: boolean;
  headerTheme: 'dark' | 'light';
}

/**
 * Zustand, den der Server rendert. Dient als getServerSnapshot in useUi, damit
 * die Hydration exakt dem Server-HTML entspricht; danach rendert React mit
 * dem echten Client-Zustand nach.
 */
export const UI_SERVER_STATE: Readonly<UiState> = Object.freeze({
  motion: 'full',
  motionSource: 'system',
  tier: 'pending',
  compact: false,
  quality: 1,
  sceneStatus: 'pending',
  loadProgress: 0,
  preloaderDone: false,
  activeSection: 'start',
  activeStation: null,
  activeBeat: null,
  haltungActive: 0,
  covered: false,
  menuOpen: false,
  ctaHover: false,
  headerTheme: 'dark',
});

function readInitialUiState(): Readonly<UiState> {
  if (typeof document === 'undefined') return UI_SERVER_STATE;
  const { motion, motionSource } = document.documentElement.dataset;
  return Object.freeze({
    ...UI_SERVER_STATE,
    motion: motion === 'reduced' ? 'reduced' : 'full',
    motionSource: motionSource === 'user' ? 'user' : 'system',
  });
}

type Listener = () => void;

export interface UiStore {
  get(): Readonly<UiState>;
  set(patch: Partial<UiState>): void;
  subscribe(fn: Listener): () => void;
}

function createUiStore(): UiStore {
  let state = readInitialUiState();
  let listeners: ReadonlySet<Listener> = new Set();

  return {
    get: () => state,
    set(patch) {
      const keys = Object.keys(patch) as (keyof UiState)[];
      const changed = keys.some((k) => patch[k] !== undefined && !Object.is(state[k], patch[k]));
      if (!changed) return;
      const defined = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ) as Partial<UiState>;
      state = Object.freeze({ ...state, ...defined });
      listeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      listeners = new Set([...listeners, fn]);
      return () => {
        listeners = new Set([...listeners].filter((l) => l !== fn));
      };
    },
  };
}

export const ui: UiStore = createUiStore();

// ---------------------------------------------------------------------------
// Settle-Pattern
// ---------------------------------------------------------------------------

let invalidateFn: (() => void) | null = null;

/** Haelt die Szene `ms` Millisekunden wach und weckt eine ruhende Schleife. */
export function keepAlive(ms = 120): void {
  frame.dirtyUntil = Math.max(frame.dirtyUntil, performance.now() + ms);
  invalidateFn?.();
}

/**
 * Fordert einen Frame an, ohne `dirtyUntil` zu aendern (kein Nachlauf). Fuer
 * requestFrames (components/scene/core/settle.ts): weckt eine Schleife, die
 * der Governor im selben Frame schon auf demand gestellt hat.
 */
export function wakeScene(): void {
  invalidateFn?.();
}

/** Scene (P1) bzw. DevStage registrieren hier R3F-invalidate; null beim Unmount. */
export function registerInvalidate(fn: (() => void) | null): void {
  invalidateFn = fn;
}
