/**
 * Zeitachse der Typo-Architektur (P2; DESIGN_SPEC §3.1, §3.2, §3.7):
 * Oeffnung o der MEDIA-Skulptur, Sichtbarkeit, Intro (Splitter bzw. Dissolve),
 * CTA-Hover und das einmalige Kontakt-Aufgluehen.
 *
 * Reine Funktionen ohne React/three. Der Zustand (HeroState) ist ein
 * unveraenderlicher Datensatz; TypoArchitecture ersetzt ihn pro Frame
 * (stepHero) und schreibt das Ergebnis nach frame.hero.
 */

import { CUT_COS, CUT_SIN } from '@/lib/brand';
import { clamp01, damp, easeSineInOut, lerp, smoothstep } from '@/lib/scene/math';
import type { SectionId } from '@/lib/scene/ids';
import { SCULPTURE } from '@/lib/scene/stations';
import { anchorY, type FrameState, type UiState } from '@/lib/scene/store';

// ---------------------------------------------------------------------------
// Konstanten (§3.1, §3.7)
// ---------------------------------------------------------------------------

/** start: o = smoothstep(0,08, 0,38, sections.start) */
const OPEN_START: readonly [number, number] = [0.08, 0.38];
/** kontakt: o = 1 − smoothstep(0,15, 0,7, sections.kontakt) */
const CLOSE_KONTAKT: readonly [number, number] = [0.15, 0.7];
/** Reduced: feste Oeffnung je Bereich */
const REDUCED_OPEN = Object.freeze({ start: 0.35, kontakt: 0 });

/** Skulptur + Klinge unsichtbar ab haltung 0,6 bis zum Kamerasprung (cover 0,5). */
const SCULPTURE_HIDE_AT = 0.6;
const SCULPTURE_SHOW_AT = 0.5;
/** Monolithe ab start 0,4 bis leistungen 0 + 1 Viewport. */
const MONOLITHS_SHOW_AT = 0.4;

/** CTA-Hover: Spalt insgesamt +0,25 (je Haelfte +0,125), Gluehen ×1,8, damp 0,25 s. */
const HOVER_GAP_HALF = 0.125;
const HOVER_GLOW = 1.8;
const HOVER_SMOOTH = 0.25;
/** Hover rastet ab 0,3 % ein (Fix-Runde 3: mit 0,1 % ~1,15 s Nachlauf bei Daempfung 0,25 s). */
const SETTLE_EPS = 3e-3;

/** Kantengluehen Ruhe (§3.1) */
export const GLOW_BASE = 2.4;

/** Kontakt-Aufgluehen: ab sections.kontakt ≥ 0,75 einmal 2,4 → 4,8 → 2,4 in 400 ms; neu scharf bei < 0,5. */
const FLASH_TRIGGER = 0.75;
const FLASH_REARM = 0.5;
const FLASH_DURATION = 0.4;
/** keepAlive beim Ausloesen (ms) */
export const FLASH_KEEPALIVE_MS = 450;

/** Klinge: h = mix(0,04, 0,9, o) */
const BLADE_MIN = 0.04;
const BLADE_MAX = 0.9;

/** Intro-Dauern in s (§3.1): Splitter 2,4, Dissolve allein 0,8. */
export const INTRO_SPLINTER_S = 2.4;
export const INTRO_DISSOLVE_S = 0.8;
/** Harte Obergrenze nach dem Ausloeser (Regel: zeitbasiert ≤ 3 s). */
const INTRO_HARD_LIMIT_MS = 3000;
/** Groesstes Frame-Delta, das die Intro-Uhr annimmt (Shader-Kompilier-Haenger ueberspringen nichts). */
const INTRO_MAX_DT = 0.05;
/** keepAlive beim Start (ms): Splitter 2,4 s + Reserve, Dissolve 0,8 s + Reserve. */
const INTRO_KEEPALIVE_MS = Object.freeze({ splinters: 2600, dissolve: 1000, instant: 120 });
/** Kommt nie ein preloaderDone (z. B. Dev-Sandbox), blendet die Skulptur nach dieser Zeit trotzdem ein. */
export const INTRO_FAILSAFE_MS = 2500;

/** Splitter: Verzoegerung delay_i ∈ [0, 0,5], Flugdauer 0,5 (Anteile von 2,4 s). */
export const SPLINTER_DELAY_SPAN = 0.5;
export const SPLINTER_FLIGHT = 0.5;
const SWEEP_OFFSET = 6.1;
const SWEEP_RANGE = 12.2;

// ---------------------------------------------------------------------------
// Oeffnung und Sichtbarkeit
// ---------------------------------------------------------------------------

export type HeroPhase = 'start' | 'studio' | 'kontakt';

/**
 * Bereich der Skulptur nach Scroll-Position (anchorY): vor der Haltung 'start',
 * ab dem Kamerasprung (cover 0,5) 'kontakt', dazwischen 'studio'.
 * Ohne Anker (vor dem ersten Refresh, Dev-Sandbox) entscheiden die Sektionen.
 */
export function heroPhaseAt(scrollY: number, f: Pick<FrameState, 'sections'>): HeroPhase {
  const haltung = anchorY('haltung', 0);
  const jump = anchorY('cover', 0.5);
  if (haltung === null || jump === null) return f.sections.kontakt > 0 ? 'kontakt' : 'start';
  if (scrollY < haltung) return 'start';
  if (scrollY >= jump) return 'kontakt';
  return 'studio';
}

/** Oeffnung o (0 = Ruhespalt, 1 = Durchflug) laut §3.1 bzw. P2 Punkt 2. */
export function openAt(scrollY: number, f: Pick<FrameState, 'sections'>, s: Pick<UiState, 'motion'>): number {
  const reduced = s.motion === 'reduced';
  const phase = heroPhaseAt(scrollY, f);
  if (phase === 'start') {
    return reduced ? REDUCED_OPEN.start : smoothstep(OPEN_START[0], OPEN_START[1], f.sections.start);
  }
  if (phase === 'kontakt') {
    return reduced ? REDUCED_OPEN.kontakt : 1 - smoothstep(CLOSE_KONTAKT[0], CLOSE_KONTAKT[1], f.sections.kontakt);
  }
  return 1;
}

export interface HeroVisibility {
  /** MEDIA-Skulptur, Klinge, Splitter */
  readonly sculpture: boolean;
  readonly monoliths: boolean;
}

const VISIBLE_ALL: HeroVisibility = Object.freeze({ sculpture: true, monoliths: true });
const VISIBLE_SCULPTURE: HeroVisibility = Object.freeze({ sculpture: true, monoliths: false });
const VISIBLE_MONOLITHS: HeroVisibility = Object.freeze({ sculpture: false, monoliths: true });
const VISIBLE_NONE: HeroVisibility = Object.freeze({ sculpture: false, monoliths: false });

/** Geteilte, eingefrorene Objekte: gleiche Sichtbarkeit → gleiche Referenz (billiger Vergleich). */
function visibility(sculpture: boolean, monoliths: boolean): HeroVisibility {
  if (sculpture) return monoliths ? VISIBLE_ALL : VISIBLE_SCULPTURE;
  return monoliths ? VISIBLE_MONOLITHS : VISIBLE_NONE;
}

/**
 * Sichtbarkeit nach Scroll-Position. Skulptur: y < anchorY('haltung', 0,6) oder
 * y ≥ anchorY('cover', 0,5). Monolithe: anchorY('start', 0,4) ≤ y < anchorY('leistungen', 0) + vh.
 * Unbekannte Anker → sichtbar (Dev-Sandbox, erster Frame vor dem Refresh).
 */
export function visibilityAt(scrollY: number, vh: number): HeroVisibility {
  const hideFrom = anchorY('haltung', SCULPTURE_HIDE_AT);
  const showFrom = anchorY('cover', SCULPTURE_SHOW_AT);
  const sculpture = hideFrom === null || showFrom === null || scrollY < hideFrom || scrollY >= showFrom;

  const monoFrom = anchorY('start', MONOLITHS_SHOW_AT);
  const monoTo = anchorY('leistungen', 0);
  const monoliths = monoFrom === null || monoTo === null || (scrollY >= monoFrom && scrollY < monoTo + vh);

  return visibility(sculpture, monoliths);
}

// ---------------------------------------------------------------------------
// Intro: Rauschen → Klarheit
// ---------------------------------------------------------------------------

export type IntroMode = 'splinters' | 'dissolve' | 'instant';
/**
 * waiting   – vor ui.preloaderDone (Splitter liegen verstreut, Skulptur unsichtbar)
 * requested – preloaderDone gesehen, Start im naechsten Frame
 * running   – laeuft (elapsed in s)
 * done      – Skulptur vollstaendig
 */
export type IntroPhase = 'waiting' | 'requested' | 'running' | 'done';

export interface IntroState {
  readonly phase: IntroPhase;
  readonly mode: IntroMode;
  /** requested: Szene kam erst nach dem Preloader → ohne Splitter einblenden */
  readonly late: boolean;
  /** Summe der geklemmten Frame-Deltas seit dem Start (s) */
  readonly elapsed: number;
  /** performance.now() beim Start (fuer die harte Obergrenze) */
  readonly startedAt: number;
}

export const INTRO_WAITING: IntroState = Object.freeze({
  phase: 'waiting',
  mode: 'splinters',
  late: false,
  elapsed: 0,
  startedAt: 0,
});

const INTRO_DONE: IntroState = Object.freeze({ phase: 'done', mode: 'instant', late: true, elapsed: 0, startedAt: 0 });

export function requestIntro(late: boolean): IntroState {
  return Object.freeze({ phase: 'requested', mode: 'splinters', late, elapsed: 0, startedAt: 0 });
}

function introDuration(mode: IntroMode): number {
  if (mode === 'splinters') return INTRO_SPLINTER_S;
  if (mode === 'dissolve') return INTRO_DISSOLVE_S;
  return 0;
}

interface IntroContext {
  readonly reduced: boolean;
  readonly splintersAvailable: boolean;
}

function advanceIntro(intro: IntroState, dt: number, now: number, ctx: IntroContext): IntroState {
  if (ctx.reduced) return intro.phase === 'done' ? intro : INTRO_DONE;
  if (intro.phase === 'requested') {
    const mode: IntroMode = !intro.late && ctx.splintersAvailable ? 'splinters' : 'dissolve';
    return Object.freeze({ phase: 'running', mode, late: intro.late, elapsed: 0, startedAt: now });
  }
  if (intro.phase !== 'running') return intro;
  const elapsed = intro.elapsed + Math.min(Math.max(dt, 0), INTRO_MAX_DT);
  if (elapsed >= introDuration(intro.mode) || now - intro.startedAt >= INTRO_HARD_LIMIT_MS) return INTRO_DONE;
  return Object.freeze({ ...intro, elapsed });
}

/** Fortschritt 0..1 des Intros (wird als frame.hero.intro veroeffentlicht). */
export function introProgress(intro: IntroState): number {
  if (intro.phase === 'done') return 1;
  if (intro.phase !== 'running') return 0;
  return clamp01(intro.elapsed / introDuration(intro.mode));
}

/** Splitter-Zeit u = t / 2,4 (0..1); ausserhalb des Splitter-Laufs 0 bzw. 1. */
export function splinterProgress(intro: IntroState): number {
  if (intro.phase === 'running' && intro.mode === 'splinters') return clamp01(intro.elapsed / INTRO_SPLINTER_S);
  return intro.phase === 'done' ? 1 : 0;
}

export type SplinterDisplay = 'scatter' | 'fly' | 'hidden';

/** Splitter zeigen: verstreut vor dem Start, fliegend im Splitter-Lauf, sonst aus. */
export function splinterDisplay(intro: IntroState): SplinterDisplay {
  if (intro.phase === 'waiting' || (intro.phase === 'requested' && !intro.late)) return 'scatter';
  if (intro.phase === 'running' && intro.mode === 'splinters') return 'fly';
  return 'hidden';
}

/**
 * uAssemble fuer den Dissolve der Skulptur (0 = unsichtbar, 1 = vollstaendig).
 * Splitter-Lauf: die Dissolve-Front laeuft so, dass ein Voxel bei Sweep s
 * genau dann erscheint, wenn die Splitter dort ankommen (Flug 75 % → 100 %):
 * uAssemble = 1,6 · u − 0,6. Dissolve allein: sine.inOut ueber 0,8 s.
 */
export function assembleAt(intro: IntroState): number {
  if (intro.phase === 'done') return 1;
  if (intro.phase !== 'running') return 0;
  if (intro.mode === 'splinters') return clamp01(1.6 * clamp01(intro.elapsed / INTRO_SPLINTER_S) - 0.6);
  return easeSineInOut(intro.elapsed / Math.max(introDuration(intro.mode), 1e-3));
}

/** Verzoegerung eines Splitters aus seiner Zielposition (Sweep links → rechts entlang d). */
export function splinterDelay(x: number, y: number): number {
  return clamp01((x * CUT_COS + y * CUT_SIN + SWEEP_OFFSET) / SWEEP_RANGE) * SPLINTER_DELAY_SPAN;
}

// ---------------------------------------------------------------------------
// Hero-Zustand pro Frame
// ---------------------------------------------------------------------------

export interface HeroState {
  /** Oeffnung o (0..1) */
  readonly open: number;
  /** CTA-Hover, gedaempft 0..1 */
  readonly hover: number;
  /** Kontakt-Aufgluehen: s seit Ausloesung, −1 = inaktiv */
  readonly flashT: number;
  readonly flashArmed: boolean;
  readonly intro: IntroState;
  readonly visibility: HeroVisibility;
}

export const HERO_INITIAL: HeroState = Object.freeze({
  open: 0,
  hover: 0,
  flashT: -1,
  flashArmed: true,
  intro: INTRO_WAITING,
  visibility: VISIBLE_ALL,
});

export interface HeroInput {
  readonly scrollY: number;
  readonly vh: number;
  readonly sections: Readonly<Record<SectionId, number>>;
  readonly motion: UiState['motion'];
  /** ui.ctaHover && activeSection === 'kontakt' */
  readonly hoverTarget: boolean;
  /** Splitter gemountet (config.splinters > 0, nicht reduced) */
  readonly splintersAvailable: boolean;
}

function stepHover(prev: number, target: number, reduced: boolean, dt: number): number {
  if (reduced) return target;
  const next = damp(prev, target, HOVER_SMOOTH, dt);
  return Math.abs(next - target) < SETTLE_EPS ? target : next;
}

interface FlashState {
  readonly flashT: number;
  readonly flashArmed: boolean;
}

function stepFlash(prev: FlashState, kontakt: number, phase: HeroPhase, reduced: boolean, dt: number): FlashState {
  const armed = prev.flashArmed || kontakt < FLASH_REARM;
  if (prev.flashT >= 0) {
    const t = prev.flashT + Math.max(dt, 0);
    return { flashT: t >= FLASH_DURATION || reduced ? -1 : t, flashArmed: armed };
  }
  if (armed && !reduced && phase === 'kontakt' && kontakt >= FLASH_TRIGGER) return { flashT: 0, flashArmed: false };
  return { flashT: -1, flashArmed: armed };
}

/** Naechster Zustand; liefert `prev` unveraendert zurueck, wenn sich nichts geaendert hat. */
export function stepHero(prev: HeroState, input: HeroInput, dt: number, now: number): HeroState {
  const reduced = input.motion === 'reduced';
  const open = openAt(input.scrollY, input, input);
  const hover = stepHover(prev.hover, input.hoverTarget ? 1 : 0, reduced, dt);
  const flash = stepFlash(prev, input.sections.kontakt, heroPhaseAt(input.scrollY, input), reduced, dt);
  const intro = advanceIntro(prev.intro, dt, now, { reduced, splintersAvailable: input.splintersAvailable });
  const visibility = visibilityAt(input.scrollY, input.vh);

  const unchanged =
    open === prev.open &&
    hover === prev.hover &&
    flash.flashT === prev.flashT &&
    flash.flashArmed === prev.flashArmed &&
    intro === prev.intro &&
    visibility === prev.visibility;
  if (unchanged) return prev;
  return Object.freeze({ open, hover, flashT: flash.flashT, flashArmed: flash.flashArmed, intro, visibility });
}

export function withIntro(state: HeroState, intro: IntroState): HeroState {
  return Object.freeze({ ...state, intro });
}

/** true, solange etwas zeitbasiert laeuft (→ keepAlive in useFrame). */
export function heroNeedsFrames(state: HeroState): boolean {
  const hoverSettled = state.hover === 0 || state.hover === 1;
  return !hoverSettled || state.flashT >= 0 || state.intro.phase === 'running' || state.intro.phase === 'requested';
}

export function flashStarted(prev: HeroState, next: HeroState): boolean {
  return prev.flashT < 0 && next.flashT >= 0;
}

/** keepAlive-Dauer, wenn das Intro in diesem Frame gestartet ist, sonst 0. */
export function introStartKeepAlive(prev: HeroState, next: HeroState): number {
  if (prev.intro.phase === 'running' || next.intro.phase !== 'running') return 0;
  return INTRO_KEEPALIVE_MS[next.intro.mode];
}

// ---------------------------------------------------------------------------
// Abgeleitete Werte
// ---------------------------------------------------------------------------

/** 0 → 1 → 0, schneller Anstieg, weiches Abklingen (ease-out), kein Blitz. */
function flashCurve(flashT: number): number {
  if (flashT < 0) return 0;
  const k = clamp01(flashT / FLASH_DURATION);
  const p = 1 - (1 - k) * (1 - k);
  return Math.sin(Math.PI * p);
}

/** Kantengluehen: 2,4 · (Hover ×1,8) · (Aufgluehen bis ×2). */
export function glowStrength(state: HeroState): number {
  return GLOW_BASE * lerp(1, HOVER_GLOW, state.hover) * (1 + flashCurve(state.flashT));
}

/**
 * Versatz der oberen Haelfte in der Bildebene (x, y); die untere ist negiert.
 * oben = n · (0,135 + 0,5·o + 0,125·hover) + d · (0,9·o)
 */
export function halfOffset(open: number, hover: number): readonly [number, number] {
  const alongN = SCULPTURE.restOffset + SCULPTURE.openOffsetN * open + HOVER_GAP_HALF * hover;
  const alongD = SCULPTURE.openOffsetD * open;
  return [-CUT_SIN * alongN + CUT_COS * alongD, CUT_COS * alongN + CUT_SIN * alongD];
}

/** Unterkante der Skulptur ohne Versatz (y 0,1) */
const SCULPTURE_BASE_Y = SCULPTURE.center[1] - SCULPTURE.capHeight / 2;

/**
 * Anhebung der ganzen Skulptur-Gruppe im Reduced-Standbild (Abnahme 14.10.2026):
 * Bei o = 0,35 sinkt die untere Haelfte 0,24 m unter den Boden, die Unterkanten
 * der Lettern fehlten. Bei Bewegung 0 — der Durchflug braucht den Spalt auf
 * Augenhoehe der Kamera-Keys.
 */
export function sculptureLift(open: number, reduced: boolean): number {
  if (!reduced) return 0;
  return Math.max(0, halfOffset(open, 0)[1] - SCULPTURE_BASE_Y);
}

/** Hoehe der Lichtklinge aus o. */
export function bladeHeight(open: number): number {
  return lerp(BLADE_MIN, BLADE_MAX, clamp01(open));
}

/**
 * Abnahme 14.10.2026: Beim Durchflug (S2 → S3) fuellten Klinge, Schnittflaechen und
 * bladeLight das Bild flaechig ueberbelichtet. Steht die Kamera nahe vor der
 * Klingenebene (z −1,4), werden Klinge, Kantengluehen und bladeLight gedimmt.
 * Abstand in m vor der Klingenebene: ab `to` volle Staerke, bis `from` auf `min`.
 */
const BLADE_NEAR = Object.freeze({ from: 1.2, to: 7, min: 0.3 });

/** Helligkeitsfaktor 0,3…1 fuer Klinge, bladeLight und Skulptur-Gluehen nach Kamera-z. */
export function bladeProximityGain(cameraZ: number): number {
  const ahead = cameraZ - SCULPTURE.bladeZ;
  if (ahead <= 0) return BLADE_NEAR.min;
  return lerp(BLADE_NEAR.min, 1, smoothstep(BLADE_NEAR.from, BLADE_NEAR.to, ahead));
}

/**
 * Klingenprofil 0..1: 0 = geschlossen (schmale Linie, ganze Hoehe leuchtet),
 * 1 = offen (heller Kern mit Falloff zu den Raendern). Erreicht 1 bei o = 0,6.
 */
export function bladeOpenness(open: number): number {
  return smoothstep(0, 0.6, clamp01(open));
}
