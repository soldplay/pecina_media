'use client';

/**
 * Seitenwechsel „Klingen“ (P7, DESIGN_SPEC §4.7). z 70, aria-hidden.
 *
 * - Zwei Ink-Panels: oberes mit 6°-Unterkante von oben, unteres mit 6°-Oberkante von unten.
 *   Sie treffen sich an einer orangen Naht (2 px #D17F0C) durch die Bildmitte.
 * - Schliessen 0,55 s power3.inOut, Naht 0,12 s halten → close() erfuellt sich, TransitionLink navigiert.
 * - Oeffnen, sobald der neue Pathname aktiv ist: 0,65 s expo.out. Danach bei Hash im Ziel
 *   scrollToTarget(hash) (Lenis-Scroll mit Offset, Fokus auf die Ueberschrift).
 * - Reduced (ui.motion, auch per Nutzer-Schalter): 150 ms Crossfade statt Klingen.
 *   Die Wahl faellt pro Seitenwechsel aus dem Store, nicht per gsap.matchMedia, weil die
 *   Bewegungs-Praeferenz auch eine Nutzerwahl sein kann.
 * - Browser-Zurueck: keine Transition (nur TransitionLink ruft close()).
 * - Sicherheitsnetz: bleibt der Pathname nach dem Schliessen unveraendert, oeffnet sich die
 *   Blende nach FAILSAFE_MS trotzdem.
 * - usePathname in Suspense (Routen mit unbekannten Params suspendieren beim Prerendern).
 */

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { scrollToTarget } from '@/lib/a11y/navigation';
import { CUT_TAN } from '@/lib/brand';
import { gsap, useGSAP } from '@/lib/gsap';
import { ui } from '@/lib/scene/store';
import { registerTransitionHandler } from './transition-bus';

type Phase = 'idle' | 'closing' | 'closed' | 'opening';

const CLOSE_S = 0.55;
const SEAM_IN_S = 0.06;
const SEAM_HOLD_S = 0.12;
const OPEN_S = 0.65;
const SEAM_OUT_S = 0.15;
const FADE_S = 0.15;
const FAILSAFE_MS = 4000;
/** Zusatz, damit die Panel-Kanten sicher ausserhalb des Viewports starten. */
const OFFSCREEN_PAD_PX = 8;

const TRANSITION_CSS = `
.pm-pt {
  position: fixed; inset: 0; z-index: 70; pointer-events: none;
  visibility: hidden;
}
.pm-pt.is-active { pointer-events: auto; }
.pm-pt__panel { position: absolute; inset: 0; background: var(--color-ink); }
/* Naht durch die Bildmitte: links tiefer, rechts hoeher (6°, wie der Logo-Schnitt).
   1 px Ueberlappung je Panel, die Naht deckt sie ab. */
.pm-pt__panel--top {
  clip-path: polygon(0 0, 100% 0, 100% calc(50% - var(--cut-rise) / 2 + 1px), 0 calc(50% + var(--cut-rise) / 2 + 1px));
}
.pm-pt__panel--bottom {
  clip-path: polygon(0 calc(50% + var(--cut-rise) / 2 - 1px), 100% calc(50% - var(--cut-rise) / 2 - 1px), 100% 100%, 0 100%);
}
.pm-pt__seam {
  position: absolute; top: 50%; left: -5vw; width: 110vw; height: 2px; margin-top: -1px;
  background: var(--color-brand); box-shadow: 0 0 16px rgba(255, 178, 87, 0.65);
  transform: rotate(-6deg); opacity: 0;
}
.pm-pt__fade { position: absolute; inset: 0; background: var(--color-ink); opacity: 0; }
@media (forced-colors: active) { .pm-pt__panel, .pm-pt__fade { background: Canvas; } }
`;

/** Weg, den ein Panel braucht, um vollstaendig ausserhalb des Viewports zu liegen. */
function panelOffset(): number {
  return window.innerHeight / 2 + (window.innerWidth * CUT_TAN) / 2 + OFFSCREEN_PAD_PX;
}

function currentHashId(): string | null {
  const raw = window.location.hash.slice(1);
  if (raw === '') return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function PageTransitionStage() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  /** open() des aktuellen GSAP-Kontexts; der Pathname-Effekt ruft es auf. */
  const openRef = useRef<(() => void) | null>(null);

  useGSAP(
    (_context, contextSafe) => {
      const root = rootRef.current;
      if (!root || !contextSafe) return undefined;

      let phase: Phase = 'idle';
      let reduced = false;
      let closePromise: Promise<void> | null = null;
      let failsafe: number | null = null;
      let timeline: gsap.core.Timeline | null = null;

      const clearFailsafe = (): void => {
        if (failsafe !== null) window.clearTimeout(failsafe);
        failsafe = null;
      };

      const finishOpen = (): void => {
        root.classList.remove('is-active');
        gsap.set(root, { autoAlpha: 0 });
        phase = 'idle';
        closePromise = null;
        timeline = null;
        const hashId = currentHashId();
        if (hashId) scrollToTarget(hashId);
      };

      const open = contextSafe((): void => {
        if (phase !== 'closed' && phase !== 'closing') return;
        clearFailsafe();
        timeline?.kill();
        phase = 'opening';
        if (reduced) {
          timeline = gsap
            .timeline({ onComplete: finishOpen })
            .to('.pm-pt__fade', { opacity: 0, duration: FADE_S, ease: 'none' });
          return;
        }
        const offset = panelOffset();
        timeline = gsap
          .timeline({ onComplete: finishOpen })
          .to('.pm-pt__seam', { opacity: 0, duration: SEAM_OUT_S, ease: 'none' }, 0)
          .to('.pm-pt__panel--top', { y: -offset, duration: OPEN_S, ease: 'expo.out' }, 0)
          .to('.pm-pt__panel--bottom', { y: offset, duration: OPEN_S, ease: 'expo.out' }, 0);
      });

      const playClose = contextSafe((onDone: () => void): void => {
        if (reduced) {
          gsap.set(['.pm-pt__panel', '.pm-pt__seam'], { autoAlpha: 0 });
          timeline = gsap
            .timeline({ onComplete: onDone })
            .fromTo('.pm-pt__fade', { opacity: 0 }, { opacity: 1, duration: FADE_S, ease: 'none' });
          return;
        }
        const offset = panelOffset();
        gsap.set('.pm-pt__fade', { opacity: 0 });
        gsap.set('.pm-pt__panel', { autoAlpha: 1 });
        timeline = gsap
          .timeline({ onComplete: onDone })
          .fromTo('.pm-pt__panel--top', { y: -offset }, { y: 0, duration: CLOSE_S, ease: 'power3.inOut' }, 0)
          .fromTo('.pm-pt__panel--bottom', { y: offset }, { y: 0, duration: CLOSE_S, ease: 'power3.inOut' }, 0)
          .fromTo('.pm-pt__seam', { opacity: 0 }, { opacity: 1, duration: SEAM_IN_S, ease: 'none' }, CLOSE_S)
          .to({}, { duration: SEAM_HOLD_S - SEAM_IN_S });
      });

      const close = (): Promise<void> => {
        if (closePromise && (phase === 'closing' || phase === 'closed')) return closePromise;
        timeline?.kill();
        phase = 'closing';
        reduced = ui.get().motion === 'reduced';
        root.classList.add('is-active');
        gsap.set(root, { autoAlpha: 1 });
        closePromise = new Promise<void>((resolve) => {
          playClose(() => {
            phase = 'closed';
            timeline = null;
            failsafe = window.setTimeout(open, FAILSAFE_MS);
            resolve();
          });
        });
        return closePromise;
      };

      const unregister = registerTransitionHandler({ close, isBusy: () => phase !== 'idle' });
      openRef.current = open;

      return () => {
        unregister();
        clearFailsafe();
        openRef.current = null;
      };
    },
    { scope: rootRef },
  );

  // Neuer Pathname aktiv → oeffnen. open() tut nichts, wenn kein Seitenwechsel per Bus lief.
  useEffect(() => {
    openRef.current?.();
  }, [pathname]);

  return (
    <div ref={rootRef} className="pm-pt" aria-hidden="true">
      <div className="pm-pt__panel pm-pt__panel--top" />
      <div className="pm-pt__panel pm-pt__panel--bottom" />
      <div className="pm-pt__seam" />
      <div className="pm-pt__fade" />
    </div>
  );
}

export default function PageTransition() {
  return (
    <>
      <style href="pm-p7-transition" precedence="pm-p7">
        {TRANSITION_CSS}
      </style>
      <Suspense fallback={null}>
        <PageTransitionStage />
      </Suspense>
    </>
  );
}
