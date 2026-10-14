'use client';

/**
 * NotFoundEgg (P9, DESIGN_SPEC §4.9): kleines Easter-Egg unter der 404-Meldung.
 *
 * - 3D (EggScene, lazy, ssr: false) nur bei Bewegung an, WebGL2 vorhanden (einfacher
 *   Check mit failIfMajorPerformanceCaveat) und nicht bekanntem Tier 'low'.
 * - Sonst statische CSS-Version: „404“ in Archivo 900 / wdth 125 als `.cut-text`, im
 *   Ruhezustand ohne Spalt (Server, Hydration, Laden des 3D). Bei Bewegung an oeffnet sich
 *   der Spalt einmal weit („zu viel geschnitten“) und bleibt offen, bis der Button ihn schliesst.
 *   Die Maske ist nur aktiv, solange der Spalt offen ist oder sich bewegt ([data-cut-active]).
 * - Button „Wieder zusammenfuegen“ immer sichtbar (WCAG 2.5.7): 3D federt die Haelften
 *   auf 0, die CSS-Version schliesst den Spalt auf 0 und nimmt danach die Maske weg.
 * - Rahmen 420 × 260 CSS-px (responsiv bis 100 %), aria-hidden: rein dekorativ.
 * - Faellt das 3D aus (Ladefehler, Kontextverlust), bleibt die statische Version.
 */

import dynamic from 'next/dynamic';
import {
  Component,
  useCallback,
  useState,
  useSyncExternalStore,
  type AnimationEvent,
  type ReactNode,
} from 'react';
import { Copy, copyAttrs } from '@/components/copy/Copy';
import { Button } from '@/components/ui/Button';
import { COPY } from '@/content/site';
import { useUi } from '@/lib/scene/store';

const EggScene = dynamic(() => import('./EggScene'), { ssr: false, loading: () => <StaticDigits joined animate={false} /> });

const EGG_CSS = `
@keyframes pm-egg-open { from { --cut-open: 0px; } to { --cut-open: 0.16em; } }
@keyframes pm-egg-join { from { --cut-open: 0.16em; } to { --cut-open: 0px; } }
.pm-egg-frame { aspect-ratio: 420 / 260; }
.pm-egg-digits {
  display: inline-block;
  /* Puffer fuer die Maske (schneidet sonst am Rand der Box), Rand gleicht ihn aus */
  padding: 0.1em 0.06em; margin: -0.1em -0.06em;
  font-family: var(--font-display);
  font-weight: 900;
  font-variation-settings: 'wdth' 125;
  font-size: clamp(4rem, 14vw, 9rem);
  line-height: 0.9;
  letter-spacing: -0.02em;
  color: var(--color-brand);
}
html[data-motion='full'] .pm-egg-digits.is-animated { animation: pm-egg-open 1.1s var(--ease-cut) 0.3s both; }
html[data-motion='full'] .pm-egg-digits.is-animated.is-joined { animation: pm-egg-join 0.6s var(--ease-out-expo) both; }
@media (forced-colors: active) { .pm-egg-digits { color: CanvasText; } }
`;

// ---------------------------------------------------------------------------
// WebGL2-Check (einmal je Seitenaufruf, Ergebnis gecacht)
// ---------------------------------------------------------------------------

let webgl2Support: boolean | undefined;

function detectWebgl2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function readWebgl2Support(): boolean {
  if (webgl2Support === undefined) webgl2Support = detectWebgl2();
  return webgl2Support;
}

/** Server und Hydration: noch unbekannt. */
function readWebgl2ServerSnapshot(): null {
  return null;
}

/** Der Check aendert sich waehrend der Sitzung nicht; nichts zu abonnieren. */
function subscribeNever(): () => void {
  return () => {};
}

// ---------------------------------------------------------------------------
// Teile
// ---------------------------------------------------------------------------

interface StaticDigitsProps {
  readonly joined: boolean;
  /** false waehrend Hydration/Laden des 3D: keine Animation, kein Spalt */
  readonly animate: boolean;
}

function StaticDigits({ joined, animate }: StaticDigitsProps) {
  /** true, sobald das Zusammenfuegen (pm-egg-join) fertig ist: danach keine Maske mehr. */
  const [settled, setSettled] = useState(false);
  const className = ['pm-egg-digits cut-text', joined && 'is-joined', animate && 'is-animated']
    .filter(Boolean)
    .join(' ');
  const handleAnimationEnd = (event: AnimationEvent<HTMLSpanElement>): void => {
    if (event.animationName === 'pm-egg-join') setSettled(true);
  };
  return (
    <span
      className={className}
      data-cut-active={animate && !settled ? '' : undefined}
      onAnimationEnd={handleAnimationEnd}
      {...copyAttrs(COPY.notFound.code)}
    >
      {COPY.notFound.code.text}
    </span>
  );
}

interface EggBoundaryProps {
  readonly children: ReactNode;
  readonly onError: () => void;
}

interface EggBoundaryState {
  readonly failed: boolean;
}

/**
 * Faengt Fehler des 3D-Teils (Chunk-Ladefehler, WebGL-Erzeugung) ab. React 19 hat
 * keine Funktions-Alternative fuer Error Boundaries; daher bewusst eine Klasse.
 */
class EggBoundary extends Component<EggBoundaryProps, EggBoundaryState> {
  state: EggBoundaryState = { failed: false };

  static getDerivedStateFromError(): EggBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type EggMode = 'pending' | 'webgl' | 'static';

function useEggMode(failed: boolean): EggMode {
  const motionFull = useUi((s) => s.motion === 'full');
  const lowTier = useUi((s) => s.tier === 'low');
  const webgl2 = useSyncExternalStore(subscribeNever, readWebgl2Support, readWebgl2ServerSnapshot);
  if (webgl2 === null) return 'pending';
  return motionFull && webgl2 && !lowTier && !failed ? 'webgl' : 'static';
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default function NotFoundEgg() {
  const [failed, setFailed] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const mode = useEggMode(failed);
  const joined = resetCount > 0;

  const handleFail = useCallback(() => setFailed(true), []);
  const handleReset = (): void => setResetCount((count) => count + 1);

  return (
    <div className="mt-16 flex flex-col items-start gap-5">
      <style href="pm-p9-egg" precedence="pm-p9">
        {EGG_CSS}
      </style>
      <div
        aria-hidden="true"
        className="pm-egg-frame relative flex w-full max-w-[420px] items-center justify-center overflow-hidden border border-line-dark bg-ink"
      >
        {mode === 'webgl' ? (
          <EggBoundary onError={handleFail}>
            <EggScene resetCount={resetCount} onContextLost={handleFail} />
          </EggBoundary>
        ) : (
          <StaticDigits joined={joined} animate={mode === 'static'} />
        )}
      </div>
      <Button variant="secondary" tone="dark" onClick={handleReset}>
        <Copy value={COPY.notFound.egg} />
      </Button>
    </div>
  );
}
