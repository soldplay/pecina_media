/**
 * Einzige GSAP-Import-Adresse aller Pakete. Registriert die Plugins genau einmal
 * im Browser. Seit GSAP 3.13 sind alle Plugins (SplitText usw.) kostenlos im
 * Paket `gsap`. Kein ScrollSmoother — Smooth-Scroll macht Lenis (P8).
 * Nur aus Client Components importieren.
 *
 * JS-Budget (§6.1): ScrollTrigger braucht schon das Layout (SmoothScroll) und bleibt
 * statisch. SplitText nutzt nur SplitReveal, und erst nach document.fonts.ready —
 * deshalb eigener Chunk ueber loadSplitText() statt im Initial-Bundle.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

export type SplitTextPlugin = typeof SplitText;

let splitTextLoad: Promise<SplitTextPlugin> | null = null;

/**
 * Laedt SplitText (eigener Chunk) und registriert es einmal. Mehrfachaufrufe teilen sich
 * dasselbe Promise; nach einem Ladefehler versucht der naechste Aufruf es erneut.
 */
export function loadSplitText(): Promise<SplitTextPlugin> {
  splitTextLoad ??= import('gsap/SplitText').then(
    (mod) => {
      gsap.registerPlugin(mod.SplitText);
      return mod.SplitText;
    },
    (error: unknown) => {
      splitTextLoad = null;
      throw error;
    },
  );
  return splitTextLoad;
}

export { gsap, ScrollTrigger, useGSAP };
