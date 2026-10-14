'use client';

/**
 * Bewegungs-Praeferenz (DESIGN_SPEC §4.5, §5.8) — aeusserster Client-Wrapper im Layout.
 *
 * - Startwert: html[data-motion] / html[data-motion-source], gesetzt vom
 *   Inline-Script im <head> vor dem ersten Paint (lib/a11y/motion.ts).
 * - prefers-reduced-motion wird live verfolgt, wirkt aber nur, solange keine
 *   Nutzerwahl besteht (motionSource 'system'); der Schalter (P7) ruft
 *   setMotionPreference('reduced' | 'full') und gewinnt danach.
 * - motion/react: <MotionConfig reducedMotion> folgt ui.motion ('always' bzw.
 *   'never' — die Systemeinstellung ist in ui.motion schon enthalten).
 * - JS-Budget (§6.1): <LazyMotion strict> laedt domAnimation asynchron nach
 *   (lib/motion-features.ts). Alle Komponenten nutzen `m.*` statt `motion.*`;
 *   `strict` meldet in Dev jede `motion.*`-Komponente (sie wuerde alle Features
 *   wieder ins Initial-Bundle ziehen).
 * - GSAP: globalTimeline.timeScale bleibt 1. Komponenten bauen ihre Kontexte
 *   bei Wechsel selbst mit Endzustaenden neu auf (useGSAP mit Dependency motion).
 */

import { LazyMotion, MotionConfig } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { setMotionPreference } from '@/lib/a11y/motion';
import { keepReadingPosition } from '@/lib/a11y/scroll-anchor';
import { ui, useUi, type UiState } from '@/lib/scene/store';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** Feature-Paket erst nach der Hydration laden (eigener Chunk). */
const loadMotionFeatures = () => import('@/lib/motion-features').then((mod) => mod.default);

interface MotionPrefProviderProps {
  children: ReactNode;
}

/** Effektiver Zustand aus den html-Attributen (Quelle: Inline-Script bzw. setMotionPreference). */
function readDocumentMotion(): Pick<UiState, 'motion' | 'motionSource'> {
  const { motion, motionSource } = document.documentElement.dataset;
  return {
    motion: motion === 'reduced' ? 'reduced' : 'full',
    motionSource: motionSource === 'user' ? 'user' : 'system',
  };
}

/** Systemwechsel ohne Nutzerwahl: Seitenhoehe aendert sich, Leseposition halten (scroll-anchor). */
function followSystemPreference(): void {
  if (ui.get().motionSource !== 'system') return;
  keepReadingPosition(() => setMotionPreference('system'), null);
}

export default function MotionPrefProvider({ children }: MotionPrefProviderProps) {
  const motion = useUi((s) => s.motion);

  useEffect(() => {
    ui.set(readDocumentMotion());
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(REDUCED_QUERY);
    media.addEventListener('change', followSystemPreference);
    return () => media.removeEventListener('change', followSystemPreference);
  }, []);

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion={motion === 'reduced' ? 'always' : 'never'}>{children}</MotionConfig>
    </LazyMotion>
  );
}
