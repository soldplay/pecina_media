'use client';

/**
 * CutHeading (P5, DESIGN_SPEC §0.3, §3.1, §3.2, §5.8, §5.9; Vertrag: types/contracts.ts).
 *
 * Der echte Text liegt immer in `.cut-text`-Spans und bleibt im A11y-Baum.
 * Im Ruhezustand steht KEIN Spalt im Text (ein stehender Spalt liest sich wie durchgestrichen);
 * der Schnitt ist nur waehrend des Reveals sichtbar. Reduced und forced-colors: nie ein Spalt.
 * - static: ohne Spalt, ohne Bewegung.
 * - load (nur H1): Text ab dem ersten Paint sichtbar und ungeschnitten (LCP). Nach
 *   ui.preloaderDone (+0,3 s) bzw. 1,2 s nach Mount ohne 3D (sceneStatus 'off' / tier 'low')
 *   laeuft je Zeile einmal der Schnitt: --cut-pos 0 % → 50 % bei --cut-open 0 → 0,065em (in px),
 *   0,6 s power3.inOut, dann schliesst der Spalt in 0,5 s power2.inOut (zusammen 1,1 s =
 *   --dur-cut), Stagger 0,12. Die Maske ist nur in dieser Zeit aktiv ([data-cut-active]).
 * Die Zeilen-Spans haben Padding fuer Ober-/Unterlaengen (siehe LINE_CLASS), damit Maske und
 * Kopien keine Glyphen anschneiden; das Layout bleibt durch negative Raender unveraendert.
 * - scroll (H2): einmalig bei 'top 80%', nur wenn die Ueberschrift beim Mount unter dem
 *   Viewport liegt. Zwei aria-hidden Kopien je Zeile (oben/unten per clip-path an der
 *   6°-Linie durch die Zeilenmitte, Breite als --w per ResizeObserver) starten ±6 % entlang d
 *   versetzt und laufen in 0,9 s expo.out zusammen; der echte Text hat waehrenddessen
 *   opacity 0. Danach werden die Kopien entfernt; der echte Text steht ohne Spalt. Ohne JS,
 *   ohne Trigger, bei reduzierter Bewegung und in forced-colors bleibt alles sichtbar (keine Kopien).
 */

import { Fragment, useEffect, useRef, useState, type Ref } from 'react';
import { copyAttrs } from '@/components/copy/Copy';
import { CUT_COS, CUT_SIN, CUT_TAN } from '@/lib/brand';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { useUi } from '@/lib/scene/store';
import type { CutHeadingProps } from '@/types/contracts';

/** Spaltbreite in em, identisch mit --cut-gap in globals.css (9 % der Versalhoehe von Archivo). */
const CUT_GAP_EM = 0.065;
/** Oeffnen + Schliessen = 1,1 s (--dur-cut) je Zeile. */
const LOAD_OPEN_S = 0.6;
const LOAD_CLOSE_S = 0.5;
const LOAD_STAGGER_S = 0.12;
/** Inline-Werte des Reveals; danach gilt wieder der Ruhezustand aus globals.css. */
const CUT_PROPS = '--cut-pos,--cut-open';
/** Schaltet die Schnitt-Maske ein (globals.css); nur waehrend des Reveals gesetzt. */
const ACTIVE_ATTR = 'data-cut-active';
const LOAD_DELAY_AFTER_PRELOADER_S = 0.3;
const SCROLL_DURATION_S = 0.9;
const SCROLL_START = 'top 80%';
/** Versatz der Kopien entlang d, Anteil der Zeilenbreite. */
const COPY_OFFSET = 0.06;
/** Ohne 3D: Start 1,2 s nach Mount; Failsafe 2,5 s (wie der CSS-Failsafe von .hero-pre). */
const INTRO_FALLBACK_MS = 1200;
const INTRO_FAILSAFE_MS = 2500;

/*
 * Zeilen-Box um Ober-/Unterlaengen erweitert: Bei line-height < 1 ragt z. B. das „g“ aus der
 * Zeilenbox, und eine aktive Maske (Reveal) bzw. die clip-path-Kopien (scroll) wuerden es
 * abschneiden. Die negativen Raender heben das Padding im Layout auf. Zwischen zwei Zeilen
 * kollabieren die Raender (es zaehlt nur der negativste), daher dort unten −2 · Pad, oben 0.
 */
const LINE_CLASS = 'cut-text block w-fit px-[0.06em] -mx-[0.06em] py-[0.18em]';
const LINE_FIRST = '-mt-[0.18em]';
const LINE_NOT_FIRST = 'mt-0';
const LINE_LAST = '-mb-[0.18em]';
const LINE_NOT_LAST = '-mb-[0.36em]';

function lineClass(index: number, count: number): string {
  const top = index === 0 ? LINE_FIRST : LINE_NOT_FIRST;
  const bottom = index === count - 1 ? LINE_LAST : LINE_NOT_LAST;
  return `${LINE_CLASS} ${top} ${bottom}`;
}

export type IntroTrigger = 'preloader' | 'fallback' | null;

/**
 * Startsignal der Hero-Intro-Animationen (H1-Schnitt, HeroMotion): 'preloader', sobald
 * ui.preloaderDone gilt; 'fallback' 1,2 s nach Mount ohne 3D bzw. spaetestens nach 2,5 s;
 * sonst null. Nur in Client Components verwenden.
 */
export function useIntroTrigger(): IntroTrigger {
  const preloaderDone = useUi((s) => s.preloaderDone);
  const noScene = useUi((s) => s.sceneStatus === 'off' || s.tier === 'low');
  const [elapsed, setElapsed] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const fallback = window.setTimeout(() => setElapsed((e) => (e < 1 ? 1 : e)), INTRO_FALLBACK_MS);
    const failsafe = window.setTimeout(() => setElapsed(2), INTRO_FAILSAFE_MS);
    return () => {
      window.clearTimeout(fallback);
      window.clearTimeout(failsafe);
    };
  }, []);

  if (preloaderDone) return 'preloader';
  if ((noScene && elapsed >= 1) || elapsed === 2) return 'fallback';
  return null;
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

interface HeadingMarkupProps extends CutHeadingProps {
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

function HeadingMarkup({ as: Tag, id, text, lines, className, tabIndex, headingRef }: HeadingMarkupProps) {
  const focusIndex = tabIndex ?? (Tag === 'h3' ? undefined : -1);
  const hasLines = lines !== undefined && lines.length > 0;

  return (
    <Tag ref={headingRef} id={id} tabIndex={focusIndex} className={className} {...copyAttrs(text)}>
      {hasLines ? (
        lines.map((line, index) => (
          <Fragment key={`${index}-${line.text}`}>
            {/* Leerzeichen zwischen den Block-Zeilen: unsichtbar, aber im Textinhalt und Namen der Ueberschrift */}
            {index > 0 ? ' ' : null}
            <span className={lineClass(index, lines.length)} {...copyAttrs(line)}>
              {line.text}
            </span>
          </Fragment>
        ))
      ) : (
        <span className={lineClass(0, 1)}>{text.text}</span>
      )}
    </Tag>
  );
}

function lineElements(heading: HTMLElement): HTMLElement[] {
  return Array.from(heading.querySelectorAll<HTMLElement>(':scope > .cut-text'));
}

// ---------------------------------------------------------------------------
// variant 'load'
// ---------------------------------------------------------------------------

type Timeline = ReturnType<typeof gsap.timeline>;

/**
 * Ein Schnitt je Zeile ab `at`: Maske an, das Band faehrt von unten in die Zeilenmitte und
 * oeffnet, dann schliesst der Spalt; zum Schluss Maske aus und Inline-Werte weg.
 */
function addLineCut(tl: Timeline, line: HTMLElement, gapPx: number, at: number): void {
  const end = at + LOAD_OPEN_S + LOAD_CLOSE_S;
  tl.call(() => line.setAttribute(ACTIVE_ATTR, ''), undefined, at).fromTo(
    line,
    { '--cut-pos': '0%', '--cut-open': '0px' },
    {
      '--cut-pos': '50%',
      '--cut-open': `${gapPx.toFixed(2)}px`,
      duration: LOAD_OPEN_S,
      ease: 'power3.inOut',
      immediateRender: false,
    },
    at,
  )
    .to(line, { '--cut-open': '0px', duration: LOAD_CLOSE_S, ease: 'power2.inOut' }, at + LOAD_OPEN_S)
    .call(() => line.removeAttribute(ACTIVE_ATTR), undefined, end)
    .set(line, { clearProps: CUT_PROPS }, end);
}

function LoadCutHeading(props: CutHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const motion = useUi((s) => s.motion);
  const trigger = useIntroTrigger();
  const ready = trigger !== null;
  // Nur beim Start gelesen; ein spaeterer Wechsel 'fallback' → 'preloader' startet den Schnitt nicht neu.
  const delay = trigger === 'preloader' ? LOAD_DELAY_AFTER_PRELOADER_S : 0;
  // Erst beim echten Start gesetzt (onStart): uebersteht den StrictMode-Doppelaufruf und
  // verhindert, dass ein Motion-Wechsel den Schnitt spaeter erneut abspielt.
  const startedRef = useRef(false);

  useGSAP(
    () => {
      const heading = ref.current;
      if (!heading || motion !== 'full' || !ready || startedRef.current) return;
      if (window.matchMedia('(forced-colors: active)').matches) return;
      const lines = lineElements(heading);
      if (lines.length === 0) return;
      const gapPx = parseFloat(window.getComputedStyle(heading).fontSize) * CUT_GAP_EM;
      const tl = gsap.timeline({
        delay,
        onStart: () => {
          startedRef.current = true;
        },
      });
      lines.forEach((line, index) => addLineCut(tl, line, gapPx, index * LOAD_STAGGER_S));
      // Abbruch (Motion-Wechsel, Unmount): Maske sicher aus; die Tweens revertiert der Kontext.
      return () => lines.forEach((line) => line.removeAttribute(ACTIVE_ATTR));
    },
    // Revert (Motion-Wechsel, Unmount) stellt den Ausgangszustand ohne Inline-Werte her.
    { dependencies: [motion, ready], revertOnUpdate: true },
  );

  return <HeadingMarkup {...props} headingRef={ref} />;
}

// ---------------------------------------------------------------------------
// variant 'scroll'
// ---------------------------------------------------------------------------

type Half = 'top' | 'bottom';

/** clip-path der Kopien: Grenze ist die 6°-Linie durch die Zeilenmitte (Anstieg tan 6° · --w). */
const HALF_CLIP: Readonly<Record<Half, string>> = {
  top: `polygon(0 0, 100% 0, 100% calc(50% - var(--w) * ${CUT_TAN / 2}), 0 calc(50% + var(--w) * ${CUT_TAN / 2}))`,
  bottom: `polygon(0 calc(50% + var(--w) * ${CUT_TAN / 2}), 100% calc(50% - var(--w) * ${CUT_TAN / 2}), 100% 100%, 0 100%)`,
};

interface CopyPair {
  readonly line: HTMLElement;
  readonly top: HTMLElement;
  readonly bottom: HTMLElement;
}

function placeCopy(copy: HTMLElement, line: HTMLElement, heading: HTMLElement): void {
  const h = heading.getBoundingClientRect();
  const r = line.getBoundingClientRect();
  copy.style.left = `${r.left - h.left}px`;
  copy.style.top = `${r.top - h.top}px`;
  copy.style.width = `${r.width}px`;
  copy.style.setProperty('--w', `${r.width}px`);
}

function createCopy(line: HTMLElement, heading: HTMLElement, half: Half): HTMLElement {
  const copy = line.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  copy.removeAttribute('data-copy-status');
  copy.removeAttribute('data-copy-source');
  copy.setAttribute('aria-hidden', 'true');
  copy.style.position = 'absolute';
  copy.style.margin = '0';
  copy.style.pointerEvents = 'none';
  copy.style.clipPath = HALF_CLIP[half];
  placeCopy(copy, line, heading);
  heading.appendChild(copy);
  return copy;
}

function createCopies(heading: HTMLElement, lines: readonly HTMLElement[]): CopyPair[] {
  return lines.map((line) => ({
    line,
    top: createCopy(line, heading, 'top'),
    bottom: createCopy(line, heading, 'bottom'),
  }));
}

/** Startversatz ±6 % der Zeilenbreite entlang d = (cos 6°, sin 6°); Bildschirm-y zeigt nach unten. */
function offsetAlongCut(width: number, sign: 1 | -1): { x: number; y: number } {
  const distance = COPY_OFFSET * width * sign;
  return { x: distance * CUT_COS, y: -distance * CUT_SIN };
}

function ScrollCutHeading(props: CutHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const motion = useUi((s) => s.motion);
  const playedRef = useRef(false);

  useGSAP(
    (context) => {
      const heading = ref.current;
      if (!heading || motion !== 'full' || playedRef.current) return;
      if (window.matchMedia('(forced-colors: active)').matches) return;
      // Nur, wenn die Ueberschrift beim Mount noch unter dem Viewport liegt.
      if (heading.getBoundingClientRect().top < window.innerHeight) return;

      const play = (): (() => void) | void => {
        const lines = lineElements(heading);
        if (lines.length === 0) return;
        const prevPosition = heading.style.position;
        const prevOverflow = heading.style.overflowX;
        // Bezugsrahmen fuer die absolut positionierten Kopien; overflow-x clip verhindert
        // waehrend des Versatzes horizontales Scrollen.
        heading.style.position = 'relative';
        heading.style.overflowX = 'clip';
        const pairs = createCopies(heading, lines);
        const observer = new ResizeObserver(() => {
          pairs.forEach(({ line, top, bottom }) => {
            placeCopy(top, line, heading);
            placeCopy(bottom, line, heading);
          });
        });
        lines.forEach((line) => observer.observe(line));

        const cleanup = (): void => {
          observer.disconnect();
          pairs.forEach(({ top, bottom }) => {
            top.remove();
            bottom.remove();
          });
          heading.style.position = prevPosition;
          heading.style.overflowX = prevOverflow;
        };

        gsap.set(lines, { opacity: 0 });
        const tl = gsap.timeline({
          defaults: { duration: SCROLL_DURATION_S, ease: 'expo.out' },
          onComplete: () => {
            cleanup();
            gsap.set(lines, { clearProps: 'opacity' });
          },
        });
        pairs.forEach(({ line, top, bottom }, index) => {
          const width = line.getBoundingClientRect().width;
          tl.fromTo(top, offsetAlongCut(width, 1), { x: 0, y: 0 }, index * 0.06);
          tl.fromTo(bottom, offsetAlongCut(width, -1), { x: 0, y: 0 }, index * 0.06);
        });
        return cleanup;
      };

      ScrollTrigger.create({
        trigger: heading,
        start: SCROLL_START,
        once: true,
        onEnter: () => {
          if (playedRef.current) return;
          playedRef.current = true;
          context.add(play);
        },
      });
    },
    { dependencies: [motion], revertOnUpdate: true },
  );

  return <HeadingMarkup {...props} headingRef={ref} />;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function CutHeading(props: CutHeadingProps) {
  if (props.variant === 'load') return <LoadCutHeading {...props} />;
  if (props.variant === 'scroll') return <ScrollCutHeading {...props} />;
  return <HeadingMarkup {...props} />;
}
