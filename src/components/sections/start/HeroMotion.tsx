'use client';

/**
 * Bewegung der Start-Sektion (P5, DESIGN_SPEC §3.1 „Motion“).
 *
 * Rendert den Innencontainer `.start__sticky` (Server-Inhalt als children) und animiert:
 * - Intro: Kicker, Lead, CTAs (`.hero-pre`) y 16 → 0 + Opacity, 0,7 s power2.out,
 *   Delays 0,15 / 0,3 / 0,45 s nach ui.preloaderDone (Fallback ohne 3D: 1,2 s nach Mount).
 *   Kommt das Signal spaeter als der CSS-Failsafe (2,5 s), bleibt es beim Failsafe.
 * - Scrub auf #start ('top top' → 'bottom top'), nur Desktop + Bewegung (scrubQuery):
 *   Band Opacity 1 → 0 und y 0 → −24 ueber 0,06 → 0,2; Zwischentitel ein 0,42 → 0,55,
 *   aus 0,7 → 0,82. Der Zwischentitel blendet nicht per opacity (Kontrast): Sein opakes
 *   Panel wird per 6°-Wischkante freigelegt (--pm-in 0 → 1) und wieder weggeschnitten
 *   (--pm-out 0 → 1), dazu y ±12 px. Kantenhoehe --pm-rise = tan 6° · Panelbreite.
 * Reduced: nichts animiert (CSS zeigt alles, Zwischentitel steht im Fluss unter den CTAs).
 * Die H1 animiert CutHeading (variant 'load') selbst.
 */

import { useRef, type ReactNode } from 'react';
import { useIntroTrigger } from '@/components/ui/CutHeading';
import { CUT_TAN } from '@/lib/brand';
import { gsap, useGSAP } from '@/lib/gsap';
import { useUi } from '@/lib/scene/store';

export interface HeroMotionProps {
  readonly children: ReactNode;
  /** Media Query fuer „Desktop + Bewegung“; identisch mit der CSS-Bedingung der Start-Sektion */
  readonly scrubQuery: string;
}

const INTRO_Y = 16;
const INTRO_DURATION_S = 0.7;
const INTRO_DELAYS_S = [0.15, 0.3, 0.45] as const;
/** Ab hier hat der CSS-Failsafe (2,5 s) bzw. sein Ende das Intro ersetzt. */
const INTRO_LATE_MS = 2400;

const SCRUB = {
  bandOut: { at: 0.06, duration: 0.14 },
  interludeIn: { at: 0.42, duration: 0.13 },
  interludeOut: { at: 0.7, duration: 0.12 },
  bandY: -24,
  interludeY: 12,
} as const;

function playIntro(elements: readonly HTMLElement[]): void {
  elements.forEach((el, index) => {
    gsap.fromTo(
      el,
      { y: INTRO_Y, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: INTRO_DURATION_S,
        ease: 'power2.out',
        delay: INTRO_DELAYS_S[Math.min(index, INTRO_DELAYS_S.length - 1)],
      },
    );
  });
}

/** Hoehe der 6°-Wischkante (tan 6° · Panelbreite) als --pm-rise; folgt Groessenaenderungen. */
function trackInterludeRise(interlude: HTMLElement): () => void {
  const apply = (): void => {
    interlude.style.setProperty('--pm-rise', `${(interlude.offsetWidth * CUT_TAN).toFixed(2)}px`);
  };
  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(interlude);
  return () => {
    observer.disconnect();
    interlude.style.removeProperty('--pm-rise');
  };
}

/** Liefert das Aufraeumen fuer gsap.matchMedia (Tweens revertiert GSAP selbst). */
function createScrub(section: HTMLElement, band: HTMLElement, interlude: HTMLElement): () => void {
  const stopRise = trackInterludeRise(interlude);
  gsap
    .timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true },
    })
    .fromTo(band, { opacity: 1, y: 0 }, { opacity: 0, y: SCRUB.bandY, duration: SCRUB.bandOut.duration }, SCRUB.bandOut.at)
    .fromTo(
      interlude,
      { '--pm-in': 0, y: SCRUB.interludeY },
      { '--pm-in': 1, y: 0, duration: SCRUB.interludeIn.duration },
      SCRUB.interludeIn.at,
    )
    .fromTo(
      interlude,
      { '--pm-out': 0, y: 0 },
      { '--pm-out': 1, y: -SCRUB.interludeY, duration: SCRUB.interludeOut.duration, immediateRender: false },
      SCRUB.interludeOut.at,
    )
    // Zeitachse auf 1 strecken, damit die Positionen dem Sektions-Fortschritt entsprechen.
    .set({}, {}, 1);
  return stopRise;
}

export function HeroMotion({ children, scrubQuery }: HeroMotionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const motion = useUi((s) => s.motion);
  const ready = useIntroTrigger() !== null;
  const introPlayedRef = useRef(false);
  const mountedAtRef = useRef<number | null>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      mountedAtRef.current ??= performance.now();
      if (motion !== 'full') return;

      const pre = Array.from(root.querySelectorAll<HTMLElement>('.hero-pre'));
      if (introPlayedRef.current) {
        // Wechsel zurueck auf Bewegung: sichtbar halten (die CSS-Regel .hero-pre greift neu).
        gsap.set(pre, { opacity: 1, y: 0 });
      } else if (ready) {
        introPlayedRef.current = true;
        if (performance.now() - mountedAtRef.current > INTRO_LATE_MS) gsap.set(pre, { opacity: 1 });
        else playIntro(pre);
      }

      const section = root.closest('section');
      const band = root.querySelector<HTMLElement>('.start__band');
      const interlude = root.querySelector<HTMLElement>('.start__interlude');
      if (!section || !band || !interlude) return;
      gsap.matchMedia().add(scrubQuery, () => createScrub(section, band, interlude));
    },
    { dependencies: [motion, ready, scrubQuery], revertOnUpdate: true },
  );

  return (
    <div ref={ref} className="start__sticky">
      {children}
    </div>
  );
}
