'use client';

/**
 * Dev-Anzeige fuer QA (DESIGN_SPEC §5.7, §6.1): drei StatsGl plus
 * gl.info.render (Draw Calls, Dreiecke, Frame-Zaehler), frameloop, dpr und
 * ui.quality. Nur ausserhalb von Produktion, nur mit ?hud=1; der Governor laedt
 * die Datei dynamisch. Die Labels sind reine Entwickler-Ausgabe (wie das
 * Dev-Panel der Sandbox) und kommen deshalb nicht aus site.ts.
 *
 * - Zaehler summieren alle render()-Aufrufe eines Frames (auch Composer-Passes):
 *   info.autoReset ist waehrend der Anzeige aus, zurueckgesetzt wird vor jedem Tick.
 * - Aktualisiert wird nur nach gerenderten Frames: In Ruhe steht der
 *   Frame-Zaehler still (0-Frames-Test, §6.1 „Ruhe“).
 */

import { useLayoutEffect, useRef, type RefObject } from 'react';
import type * as THREE from 'three';
import { StatsGl } from '@react-three/drei';
import { addAfterEffect, addEffect, useThree, type RootState } from '@react-three/fiber';
import { ui } from '@/lib/scene/store';

const HUD_Z_INDEX = '100';

const ROOT_CSS = [
  'position:fixed',
  'left:8px',
  'bottom:8px',
  `z-index:${HUD_Z_INDEX}`,
  'pointer-events:none',
  'display:flex',
  'flex-direction:column',
  'gap:4px',
].join(';');

const INFO_CSS = [
  'margin:0',
  'padding:4px 6px',
  'background:rgba(14,14,14,0.85)',
  'color:#F4F1EA',
  'font:11px/1.35 ui-monospace,monospace',
  'white-space:pre',
].join(';');

interface HudNodes {
  readonly root: HTMLDivElement;
  readonly info: HTMLPreElement;
  readonly statsHost: HTMLDivElement;
}

function createHudNodes(): HudNodes {
  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = ROOT_CSS;
  const statsHost = document.createElement('div');
  const info = document.createElement('pre');
  info.style.cssText = INFO_CSS;
  root.append(statsHost, info);
  document.body.appendChild(root);
  return { root, info, statsHost };
}

function formatInfo(gl: THREE.WebGLRenderer, state: RootState): string {
  const { calls, triangles, points, lines, frame } = gl.info.render;
  const { quality, tier } = ui.get();
  return [
    `calls ${calls}  tris ${triangles}  pts ${points}  lines ${lines}`,
    `frame ${frame}  loop ${state.frameloop}  dpr ${state.viewport.dpr}`,
    `tier ${tier}  quality ${quality}`,
  ].join('\n');
}

/** Schaltet das automatische Zuruecksetzen ab und setzt selbst vor jedem Tick zurueck. */
function trackRenderInfo(gl: THREE.WebGLRenderer): () => void {
  const previousAutoReset = gl.info.autoReset;
  gl.info.autoReset = false;
  const removeReset = addEffect(() => gl.info.reset());
  return () => {
    removeReset();
    gl.info.autoReset = previousAutoReset;
  };
}

export default function PerfHud() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  // StatsGl haengt sich in seinem (passiven) Effekt an parent.current; der
  // Layout-Effekt unten setzt den Wirt vorher.
  const statsHostRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const nodes = createHudNodes();
    statsHostRef.current = nodes.statsHost;
    const stopTracking = trackRenderInfo(gl);
    const removeUpdate = addAfterEffect(() => {
      nodes.info.textContent = formatInfo(gl, get());
    });
    return () => {
      removeUpdate();
      stopTracking();
      nodes.root.remove();
      statsHostRef.current = null;
    };
  }, [gl, get]);

  if (process.env.NODE_ENV === 'production') return null;
  // drei typisiert parent ohne null; gelesen wird er erst nach dem Layout-Effekt.
  return <StatsGl parent={statsHostRef as RefObject<HTMLElement>} />;
}
