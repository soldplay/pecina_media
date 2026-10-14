'use client';

/**
 * Smooth-Scroll (DESIGN_SPEC §4.5, §5.8) — Lenis nur bei Bewegung an.
 *
 * - <ReactLenis root> mit autoRaf: false, lerp 0.1, syncTouch: false (Touch
 *   scrollt nativ). Getaktet vom GSAP-Ticker, damit Lenis und ScrollTrigger im
 *   selben Frame rechnen: lenis.on('scroll', ScrollTrigger.update),
 *   gsap.ticker.add(t => lenis.raf(t * 1000)), lagSmoothing(0). Die Instanz geht
 *   per setLenis an scrollToTarget (lib/a11y/navigation.ts).
 * - Reduced: kein Lenis (nativer Scroll), setLenis(null).
 * - Wechsel zur Laufzeit ohne Reload: Lenis haengt als Geschwister VOR den
 *   Kindern und wird nur ein- bzw. ausgehaengt. Die Kinder (die ganze Seite)
 *   bleiben an derselben Stelle im Baum und werden nie neu gemountet.
 * - Erst nach der Hydration: der Server kennt die Praeferenz nicht; so entsteht
 *   bei reduzierter Bewegung nie kurz eine Lenis-Instanz.
 * - Kein ScrollSmoother, keine Pins, kein Snap.
 */

import 'lenis/dist/lenis.css';
import type Lenis from 'lenis';
import { ReactLenis, useLenis } from 'lenis/react';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { setLenis } from '@/lib/a11y/navigation';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { useUi } from '@/lib/scene/store';

const LENIS_OPTIONS = Object.freeze({ autoRaf: false, lerp: 0.1, syncTouch: false });

/** GSAP-Standard (lagSmoothing(500, 33)), wiederhergestellt, wenn Lenis aus ist. */
const GSAP_LAG_THRESHOLD_MS = 500;
const GSAP_LAG_ADJUSTED_MS = 33;
const MS_PER_S = 1000;

interface SmoothScrollProps {
  children: ReactNode;
}

const subscribeNothing = (): (() => void) => () => {};

/** false auf dem Server und waehrend der Hydration, danach true. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

function connectLenis(lenis: Lenis): () => void {
  const offScroll = lenis.on('scroll', () => ScrollTrigger.update());
  const tick = (time: number): void => lenis.raf(time * MS_PER_S);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  setLenis(lenis);
  return () => {
    setLenis(null);
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(GSAP_LAG_THRESHOLD_MS, GSAP_LAG_ADJUSTED_MS);
    offScroll();
  };
}

/** Verbindet die Instanz aus dem ReactLenis-Kontext mit GSAP und der Navigation. */
function LenisBridge(): null {
  const lenis = useLenis();
  useEffect(() => (lenis ? connectLenis(lenis) : undefined), [lenis]);
  return null;
}

export default function SmoothScroll({ children }: SmoothScrollProps) {
  const hydrated = useHydrated();
  const motionFull = useUi((s) => s.motion === 'full');
  const enabled = hydrated && motionFull;

  useEffect(() => {
    if (!enabled) setLenis(null);
  }, [enabled]);

  return (
    <>
      {enabled ? (
        <ReactLenis root options={LENIS_OPTIONS}>
          <LenisBridge />
        </ReactLenis>
      ) : null}
      {children}
    </>
  );
}
