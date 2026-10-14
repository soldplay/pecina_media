'use client';

/**
 * Typo-Architektur (P2; DESIGN_SPEC §3.1, §3.2, §3.7): MEDIA-Skulptur,
 * Lichtklinge, Splitter und Haltungs-Monolithe. Keine eigenen Lichter (Rig = P1).
 *
 * Pro Frame (useFrame-Prioritaet −1, also vor allen anderen Szene-Teilen):
 * - HeroState per stepHero ersetzen (Oeffnung o, Hover, Aufgluehen, Intro)
 * - frame.hero.open und frame.hero.intro schreiben (P1 liest open fuer bladeLight)
 * - Sichtbarkeit von Skulptur-Gruppe und Monolith-Gruppe setzen
 * - keepAlive nur beim Ausloesen, danach requestFrames (Settle-Pattern, core/settle.ts)
 *
 * Ausserdem: drei useProgress → ui.loadProgress (nur Aenderungen ≥ 0,05) fuer
 * den Preloader, und ui.preloaderDone → Start des Intros.
 */

import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import { clamp01 } from '@/lib/scene/math';
import { frame, keepAlive, ui, type UiState } from '@/lib/scene/store';
import type { TypoArchitectureProps } from '@/types/contracts';
import {
  FLASH_KEEPALIVE_MS,
  HERO_INITIAL,
  INTRO_FAILSAFE_MS,
  INTRO_WAITING,
  flashStarted,
  heroNeedsFrames,
  introProgress,
  introStartKeepAlive,
  requestIntro,
  sculptureLift,
  stepHero,
  withIntro,
  type HeroState,
  type HeroVisibility,
} from './hero-timeline';
import { requestFrames } from '../core/settle';
import LightBlade from './LightBlade';
import { buildSculptureHalves, disposeSculptureHalves } from './media-glyphs';
import MediaSculpture from './MediaSculpture';
import Monoliths from './Monoliths';
import Splinters from './Splinters';

/** loadProgress nur bei Aenderungen ab 5 Prozentpunkten melden. */
const LOAD_PROGRESS_STEP = 0.05;
/** Wach halten nach UI-Wechseln, die gedaempft wirken (Hover, Streifen). */
const UI_CHANGE_KEEPALIVE_MS = 500;

/** Veroeffentlicht den Hero-Zustand im Hot-Path-Store (bewusst mutierbar, §5.4). */
function writeHeroFrame(state: HeroState): void {
  frame.hero.open = state.open;
  frame.hero.intro = introProgress(state.intro);
}

function applyVisibility(
  sculpture: THREE.Group | null,
  monoliths: THREE.Group | null,
  visibility: HeroVisibility,
): void {
  if (sculpture && sculpture.visible !== visibility.sculpture) sculpture.visible = visibility.sculpture;
  if (monoliths && monoliths.visible !== visibility.monoliths) monoliths.visible = visibility.monoliths;
}

/** Reduced-Standbild: untere Haelfte nicht im Boden versenken (sculptureLift). */
function applyLift(sculpture: THREE.Group | null, open: number, reduced: boolean): void {
  const lift = sculptureLift(open, reduced);
  if (sculpture && sculpture.position.y !== lift) sculpture.position.y = lift;
}

/** UI-Felder, deren Wechsel einen gedaempften Uebergang ausloest. */
function visualInputsChanged(prev: Readonly<UiState>, next: Readonly<UiState>): boolean {
  return (
    prev.ctaHover !== next.ctaHover ||
    prev.activeSection !== next.activeSection ||
    prev.haltungActive !== next.haltungActive ||
    prev.motion !== next.motion
  );
}

/** drei useProgress (0..100) → ui.loadProgress (0..1), solange der Preloader laeuft. */
function useLoadProgressBridge(): void {
  useEffect(() => {
    let last = -1;
    const push = (progress: number): void => {
      if (ui.get().preloaderDone) return;
      const p = clamp01(progress / 100);
      const complete = p === 1 && last !== 1;
      if (last >= 0 && Math.abs(p - last) < LOAD_PROGRESS_STEP && !complete) return;
      last = p;
      ui.set({ loadProgress: p });
    };
    push(useProgress.getState().progress);
    return useProgress.subscribe((state) => push(state.progress));
  }, []);
}

/**
 * Intro-Ausloeser: ui.preloaderDone false → true startet mit Splittern; war es
 * beim Mount schon true (Szene kam nach dem Preloader) oder kommt es nie
 * (Failsafe), blendet die Skulptur ohne Splitter ein.
 */
function useIntroTrigger(heroRef: { current: HeroState }): void {
  useEffect(() => {
    let prev = ui.get();
    if (prev.preloaderDone) {
      heroRef.current = withIntro(heroRef.current, requestIntro(true));
      keepAlive();
    }
    const failsafe = window.setTimeout(() => {
      if (heroRef.current.intro.phase !== 'waiting') return;
      heroRef.current = withIntro(heroRef.current, requestIntro(true));
      keepAlive();
    }, INTRO_FAILSAFE_MS);

    const unsubscribe = ui.subscribe(() => {
      const next = ui.get();
      if (next.preloaderDone !== prev.preloaderDone) {
        heroRef.current = withIntro(heroRef.current, next.preloaderDone ? requestIntro(false) : INTRO_WAITING);
        keepAlive();
      }
      if (visualInputsChanged(prev, next)) keepAlive(UI_CHANGE_KEEPALIVE_MS);
      prev = next;
    });
    return () => {
      window.clearTimeout(failsafe);
      unsubscribe();
    };
  }, [heroRef]);
}

export default function TypoArchitecture({ config, reduced }: TypoArchitectureProps) {
  const sculptureRef = useRef<THREE.Group>(null);
  const monolithRef = useRef<THREE.Group>(null);
  const heroRef = useRef<HeroState>(HERO_INITIAL);
  const halves = useMemo(() => buildSculptureHalves(), []);
  const splintersAvailable = config.splinters > 0 && !reduced;

  useEffect(() => () => disposeSculptureHalves(halves), [halves]);
  useLoadProgressBridge();
  useIntroTrigger(heroRef);

  useFrame((_, delta) => {
    const s = ui.get();
    const prev = heroRef.current;
    const next = stepHero(
      prev,
      {
        scrollY: frame.scrollY,
        vh: frame.vh,
        sections: frame.sections,
        motion: reduced ? 'reduced' : 'full',
        hoverTarget: s.ctaHover && s.activeSection === 'kontakt',
        splintersAvailable,
      },
      delta,
      performance.now(),
    );
    heroRef.current = next;
    writeHeroFrame(next);
    applyVisibility(sculptureRef.current, monolithRef.current, next.visibility);
    applyLift(sculptureRef.current, next.open, reduced);

    const introKeepAlive = introStartKeepAlive(prev, next);
    if (introKeepAlive > 0) keepAlive(introKeepAlive);
    if (flashStarted(prev, next)) keepAlive(FLASH_KEEPALIVE_MS);
    // Gedaempft/zeitbasiert nach einem Ausloeser (Hover, Aufgluehen, Intro): Frames
    // ohne neuen Nachlauf (Fix-Runde 3, Ruhe; Ausloeser rufen keepAlive selbst).
    if (heroNeedsFrames(next)) requestFrames();
  }, -1);

  return (
    <>
      <group ref={sculptureRef}>
        <MediaSculpture halves={halves} heroRef={heroRef} physical={config.hdri} />
        <LightBlade heroRef={heroRef} />
        {splintersAvailable && (
          <Splinters key={config.splinters} count={config.splinters} halves={halves} heroRef={heroRef} />
        )}
      </group>
      <group ref={monolithRef}>
        <Monoliths reduced={reduced} />
      </group>
    </>
  );
}
