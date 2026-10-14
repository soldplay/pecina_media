'use client';

/**
 * Dev-Sandbox fuer P1–P4 (nur ausserhalb der Produktion erreichbar, siehe
 * app/dev/stage/[id]/page.tsx). Panel rechts schreibt direkt in den Store;
 * die Szene laedt clientseitig (ssr: false). Kein Einfluss auf Produktion.
 */

import dynamic from 'next/dynamic';
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { isStationId, type StationBeatId, type StationId } from '@/lib/scene/ids';
import { frame, keepAlive, ui, useUi } from '@/lib/scene/store';
import type { SceneTier } from '@/lib/scene/tiers';
import type { CutKeep, CutMode } from '@/lib/three/cut';
import type { DevStageId, DevTestSettings } from './dev-stage-types';

export type { DevStageId } from './dev-stage-types';

const DevStageScene = dynamic(() => import('./DevStageScene'), {
  ssr: false,
  loading: () => <p style={{ padding: 16, color: '#B5AFA4' }}>Szene wird geladen …</p>,
});

const CUT_MODES: readonly CutMode[] = ['edge', 'recolor', 'dissolve', 'clip'];
const KEEP_ALIVE_BUTTON_MS = 1500;

interface DevStageProps {
  id: DevStageId;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
      <span style={{ color: '#B5AFA4' }}>{label}</span>
      {children}
    </label>
  );
}

function Slider({ label, value, min = 0, max = 1, step = 0.001, onChange }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={`${label}: ${value.toFixed(3)}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
      />
    </Row>
  );
}

function useNumber(initial: number, apply: (v: number) => void): [number, (v: number) => void] {
  const [value, setValue] = useState(initial);
  const update = (v: number): void => {
    setValue(v);
    apply(v);
    keepAlive(300);
  };
  return [value, update];
}

export default function DevStage({ id }: DevStageProps) {
  const station: StationId | null = isStationId(id) ? id : null;
  const reduced = useUi((s) => s.motion === 'reduced');
  const [tier, setTier] = useState<SceneTier>('high');
  const [compact, setCompact] = useState(false);
  const [test, setTest] = useState<DevTestSettings>({ mode: 'edge', keep: 'positive', offset: 0, along: false, progress: 1 });

  const beatKey = (suffix: 'a' | 'b'): StationBeatId | null => (station ? `${station}:${suffix}` : null);
  const [beatA, setBeatA] = useNumber(0, (v) => {
    const k = beatKey('a');
    if (k) frame.beats[k] = v;
  });
  const [beatB, setBeatB] = useNumber(0, (v) => {
    const k = beatKey('b');
    if (k) frame.beats[k] = v;
  });
  const [secStart, setSecStart] = useNumber(0, (v) => {
    frame.sections.start = v;
  });
  const [secKontakt, setSecKontakt] = useNumber(0, (v) => {
    frame.sections.kontakt = v;
  });

  useEffect(() => {
    ui.set({ tier, compact, sceneStatus: 'ready' });
  }, [tier, compact]);

  useEffect(() => {
    if (!station) return;
    frame.stationVisible[station] = true;
    ui.set({ activeStation: station });
    return () => {
      frame.stationVisible[station] = false;
      ui.set({ activeStation: null });
    };
  }, [station]);

  const replayIntro = (): void => {
    ui.set({ preloaderDone: false });
    requestAnimationFrame(() => ui.set({ preloaderDone: true }));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0E0E0E', color: '#F4F1EA' }}>
      <DevStageScene id={id} tier={tier} compact={compact} reduced={reduced} test={test} />
      <aside
        aria-label="Dev-Panel"
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          width: 260,
          maxHeight: 'calc(100vh - 24px)',
          overflowY: 'auto',
          display: 'grid',
          gap: 10,
          padding: 12,
          background: 'rgba(14,14,14,0.92)',
          border: '1px solid rgba(244,241,234,0.16)',
          fontFamily: 'ui-monospace, monospace',
          zIndex: 10,
        }}
      >
        <strong style={{ fontSize: 13 }}>/dev/stage/{id}</strong>
        {station && (
          <>
            <Slider label={`beat ${station}:a`} value={beatA} onChange={setBeatA} />
            <Slider label={`beat ${station}:b`} value={beatB} onChange={setBeatB} />
          </>
        )}
        <Slider label="sections.start" value={secStart} onChange={setSecStart} />
        <Slider label="sections.kontakt" value={secKontakt} onChange={setSecKontakt} />
        <Row label="reduced">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => ui.set({ motion: e.target.checked ? 'reduced' : 'full' })}
          />
        </Row>
        <Row label="tier">
          <select value={tier} onChange={(e) => setTier(e.target.value === 'mid' ? 'mid' : 'high')}>
            <option value="high">high</option>
            <option value="mid">mid</option>
          </select>
        </Row>
        <Row label="compact">
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
        </Row>
        <button type="button" onClick={() => keepAlive(KEEP_ALIVE_BUTTON_MS)}>
          keepAlive
        </button>
        <button type="button" onClick={replayIntro}>
          preloaderDone (Intro neu)
        </button>
        {id === 'test' && (
          <>
            <Row label="Modus">
              <select
                value={test.mode}
                onChange={(e) => {
                  const mode = CUT_MODES.find((m) => m === e.target.value) ?? 'edge';
                  setTest((t) => ({ ...t, mode }));
                }}
              >
                {CUT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="keep (clip/dissolve)">
              <select
                value={test.keep}
                onChange={(e) => {
                  const keep: CutKeep = e.target.value === 'negative' ? 'negative' : 'positive';
                  setTest((t) => ({ ...t, keep }));
                }}
              >
                <option value="positive">positive</option>
                <option value="negative">negative</option>
              </select>
            </Row>
            <Slider
              label="uCutOffset"
              value={test.offset}
              min={-0.45}
              max={0.45}
              onChange={(offset) => setTest((t) => ({ ...t, offset }))}
            />
            <Row label="along (Gluehen wandert)">
              <input
                type="checkbox"
                checked={test.along}
                onChange={(e) => setTest((t) => ({ ...t, along: e.target.checked }))}
              />
            </Row>
            <Slider
              label="uCutProgress"
              value={test.progress}
              onChange={(progress) => setTest((t) => ({ ...t, progress }))}
            />
          </>
        )}
      </aside>
    </div>
  );
}
