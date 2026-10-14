'use client';

/**
 * Idle-Prefetch der vier Stations-GLBs (DESIGN_SPEC §5.6). Rendert nichts.
 *
 * Nach ui.preloaderDone: requestIdleCallback (Timeout 1200 ms; ohne API
 * setTimeout 1200) → useGLTF.preload(url, false, true) fuer IDLE_PREFETCH.
 * Kein Draco (sonst laedt drei den Decoder von gstatic), Meshopt aus dem Bundle.
 * Verlaesst der Nutzer `start` schon vorher, startet der Prefetch sofort.
 *
 * Der Start wird als Latch veroeffentlicht (usePrefetchStarted): StationShell
 * mountet die Stations-Inhalte (und damit useGLTF) erst danach, damit die
 * Modelle nicht mit dem Initial-Load konkurrieren.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { useGLTF } from '@react-three/drei';
import { IDLE_PREFETCH } from '@/lib/scene/assets';
import { useUi } from '@/lib/scene/store';

const IDLE_TIMEOUT_MS = 1200;

type Listener = () => void;

// Latch-Store: einmal true, bleibt true (Modelle liegen danach im Loader-Cache).
let prefetchStarted = false;
let listeners: ReadonlySet<Listener> = new Set();

function subscribe(fn: Listener): () => void {
  listeners = new Set([...listeners, fn]);
  return () => {
    listeners = new Set([...listeners].filter((l) => l !== fn));
  };
}

function getSnapshot(): boolean {
  return prefetchStarted;
}

function getServerSnapshot(): boolean {
  return false;
}

/** true, sobald der GLB-Prefetch gestartet wurde (bleibt dann true). */
export function usePrefetchStarted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function startPrefetch(): void {
  if (prefetchStarted) return;
  IDLE_PREFETCH.forEach((url) => useGLTF.preload(url, false, true));
  prefetchStarted = true;
  listeners.forEach((fn) => fn());
}

function scheduleIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, IDLE_TIMEOUT_MS);
  return () => window.clearTimeout(timer);
}

export default function AssetPrefetch(): null {
  const preloaderDone = useUi((s) => s.preloaderDone);
  const leftStart = useUi((s) => s.activeSection !== 'start');

  useEffect(() => {
    if (prefetchStarted) return undefined;
    if (leftStart) {
      startPrefetch();
      return undefined;
    }
    if (!preloaderDone) return undefined;
    return scheduleIdle(startPrefetch);
  }, [preloaderDone, leftStart]);

  return null;
}
