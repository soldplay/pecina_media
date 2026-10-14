'use client';

/**
 * ButtonLink und Button (P5, DESIGN_SPEC §2.1, §2.5, §4.4; Vertrag: types/contracts.ts).
 *
 * - primary: Flaeche #D17F0C, Text Ink (6,21:1)
 * - secondary dunkel: transparent, Paper-Text, 1 px Paper-Rahmen; secondary hell: Ink-Flaeche, Paper-Text
 * - ghost: Text mit Unterstrich (dunkel #D17F0C auf Ink, hell #9D5F09 auf Paper)
 * - Hover/Fokus (motion/react, `m.*` unter LazyMotion — Features laden nach der Hydration):
 *   Fuellung wischt mit einer 6°-Kante von unten nach oben
 *   (clip-path, 0,3 s --ease-cut); whileTap scale 0,97 (Spring 400/30).
 *   Die Fuellfarben halten mit der unveraenderten Textfarbe den Kontrast (keine Text-Kopien).
 *   Am Label oeffnet und schliesst der 6°-Spalt einmal (.cut-hover, 600 ms); kein stehender Spalt.
 * - Reduced: kein Wipe, nur Farbwechsel 120 ms; kein Tap-Scale, kein Spalt.
 */

import { m } from 'motion/react';
import { useRouter } from 'next/navigation';
import type { FocusEvent, MouseEvent, ReactNode } from 'react';
import { isPlainLeftClick, resolveTransitionTarget, transitionBus } from '@/components/layout/transition-bus';
import { COPY } from '@/content/site';
import { scrollToTarget } from '@/lib/a11y/navigation';
import { CUT_TAN } from '@/lib/brand';
import { useUi } from '@/lib/scene/store';
import type { ButtonLinkProps, ButtonProps, ButtonTone, ButtonVariant } from '@/types/contracts';

const WIPE_EASE = [0.76, 0, 0.24, 1] as const;
const WIPE_DURATION_S = 0.3;
const REDUCED_DURATION_S = 0.12;
const TAP_SCALE = 0.97;
const TAP_SPRING = { type: 'spring', stiffness: 400, damping: 30 } as const;

/*
 * In @layer components, damit Tailwind-Utilities der Aufrufer (z. B. w-full, px-8) gewinnen.
 * Die Layer-Reihenfolge entspricht der von Tailwind 4; ist dessen CSS schon geladen, ist die
 * Deklaration wirkungslos, sonst stellt sie dieselbe Reihenfolge her (Preflight in base bleibt darunter).
 */
const BUTTON_CSS = `
@layer properties, theme, base, components, utilities;
@property --pm-wipe { syntax: '<number>'; inherits: true; initial-value: 0; }
@layer components {
.pm-btn {
  --pm-rise: 24px;
  position: relative; isolation: isolate; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  min-height: 48px; padding: 0.75rem 1.5rem;
  border: 1px solid transparent; border-radius: 0;
  font-family: var(--font-sans); font-weight: 700; font-variation-settings: 'wdth' 100;
  font-size: 1rem; line-height: 1.2; text-align: center; text-decoration: none;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: color 120ms linear, background-color 120ms linear, border-color 120ms linear;
}
.pm-btn__fill {
  position: absolute; inset: -1px; z-index: -1; pointer-events: none;
  background: var(--pm-btn-fill, transparent);
  clip-path: polygon(
    0 calc((1 - var(--pm-wipe)) * (100% + var(--pm-rise))),
    100% calc((1 - var(--pm-wipe)) * (100% + var(--pm-rise)) - var(--pm-rise)),
    100% 100%, 0 100%
  );
}
.pm-btn__label { position: relative; display: inline-block; }
.pm-btn--primary { background: var(--color-brand); color: var(--color-ink); --pm-btn-fill: var(--color-paper); }
.pm-btn--primary.pm-btn--light { --pm-btn-fill: var(--color-glow); }
.pm-btn--secondary { background: transparent; color: var(--color-paper); border-color: var(--color-paper); --pm-btn-fill: var(--color-line-dark); }
.pm-btn--secondary.pm-btn--light { background: var(--color-ink); border-color: var(--color-ink); --pm-btn-fill: var(--color-muted-light); }
.pm-btn--ghost { padding-inline: 0; background: transparent; color: var(--color-brand); }
/* Unterstrich am Label: text-decoration des <a> erreicht das inline-block-Label nicht. */
.pm-btn--ghost .pm-btn__label {
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.25em;
}
.pm-btn--ghost.pm-btn--light { color: var(--color-brand-text); }
.pm-btn--ghost:hover .pm-btn__label, .pm-btn--ghost:focus-visible .pm-btn__label { text-decoration-thickness: 2px; }
/* Icons im Label bleiben in der Zeile (Preflight setzt svg auf display:block). */
.pm-btn__label svg { display: inline-block; }
.pm-btn--ghost .pm-btn__fill { display: none; }
.pm-btn:disabled, .pm-btn[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }
html[data-motion='reduced'] .pm-btn__fill { clip-path: none; opacity: var(--pm-wipe); }
@media (forced-colors: active) {
  .pm-btn { border-color: ButtonText; }
  .pm-btn__fill { display: none; }
}
}
`;

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

function buttonClass(variant: ButtonVariant, tone: ButtonTone, className?: string): string {
  // cut-hover (globals.css): Label-Schnitt oeffnet und schliesst einmal bei Hover/Fokus.
  return cx('pm-btn', 'cut-hover', `pm-btn--${variant}`, `pm-btn--${tone}`, className);
}

/** Hoehe der 6°-Kante ueber die Breite des Buttons (tan 6° · Breite), vor jedem Wipe gemessen. */
function measureRise(el: HTMLElement): void {
  el.style.setProperty('--pm-rise', `${(el.offsetWidth * CUT_TAN).toFixed(2)}px`);
}

/** Motion-Props fuer Wipe und Tap; bei reduzierter Bewegung nur ein kurzer Farbwechsel. */
function useButtonMotion() {
  const reduced = useUi((s) => s.motion === 'reduced');
  const wipe = reduced
    ? { duration: REDUCED_DURATION_S, ease: 'linear' as const }
    : { duration: WIPE_DURATION_S, ease: WIPE_EASE };
  return {
    initial: { '--pm-wipe': 0 },
    whileHover: { '--pm-wipe': 1 },
    whileFocus: { '--pm-wipe': 1 },
    whileTap: reduced ? undefined : { scale: TAP_SCALE },
    transition: { '--pm-wipe': wipe, scale: TAP_SPRING },
  };
}

function ButtonStyles() {
  return (
    <style href="pm-p5-button" precedence="pm-p5">
      {BUTTON_CSS}
    </style>
  );
}

interface ButtonInnerProps {
  readonly children: ReactNode;
  readonly suffix?: ReactNode;
}

function ButtonInner({ children, suffix }: ButtonInnerProps) {
  return (
    <>
      <ButtonStyles />
      <span className="pm-btn__fill" aria-hidden="true" />
      <span className="pm-btn__label cut-text">{children}</span>
      {suffix}
    </>
  );
}

export function ButtonLink({
  href,
  children,
  variant,
  tone = 'dark',
  scrollTarget,
  external = false,
  cursorLabel,
  onHoverChange,
  className,
}: ButtonLinkProps) {
  const motionProps = useButtonMotion();
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    if (external || e.defaultPrevented || !isPlainLeftClick(e)) return;
    // Anker auf der Startseite: Lenis-Scroll mit Fokus. Fehlt das Ziel (Unterseite), weiter unten.
    if (scrollTarget && scrollToTarget(scrollTarget)) {
      e.preventDefault();
      return;
    }
    // Interne Route mit anderem Pathname (z. B. 404 → /): Seitenwechsel mit Klingen (§4.7, P7).
    const target = resolveTransitionTarget(href);
    if (target === null) return;
    e.preventDefault();
    if (transitionBus.isBusy()) return;
    void transitionBus.close().then(() => router.push(target));
  };

  const handleFocus = (e: FocusEvent<HTMLAnchorElement>): void => {
    measureRise(e.currentTarget);
    onHoverChange?.(true);
  };

  return (
    <m.a
      href={href}
      className={buttonClass(variant, tone, className)}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      data-cursor-label={cursorLabel}
      onClick={handleClick}
      onPointerEnter={(e) => measureRise(e.currentTarget)}
      onHoverStart={() => onHoverChange?.(true)}
      onHoverEnd={() => onHoverChange?.(false)}
      onFocus={handleFocus}
      onBlur={() => onHoverChange?.(false)}
      {...motionProps}
    >
      <ButtonInner suffix={external ? <span className="sr-only">{COPY.ui.external}</span> : undefined}>
        {children}
      </ButtonInner>
    </m.a>
  );
}

export function Button({
  variant,
  tone = 'dark',
  className,
  type = 'button',
  children,
  style,
  onFocus,
  onPointerEnter,
  ...rest
}: ButtonProps) {
  const motionProps = useButtonMotion();

  return (
    <m.button
      type={type}
      className={buttonClass(variant, tone, className)}
      onPointerEnter={(e) => {
        measureRise(e.currentTarget);
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        measureRise(e.currentTarget);
        onFocus?.(e);
      }}
      style={style}
      {...withoutMotionConflicts(rest)}
      {...motionProps}
    >
      <ButtonInner>{children}</ButtonInner>
    </m.button>
  );
}

type MotionConflictKey = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart';

/**
 * motion/react belegt Drag- und Animations-Handler mit eigenen Signaturen. Native
 * Handler dieser Namen werden deshalb nicht weitergereicht (an Buttons ungenutzt).
 */
function withoutMotionConflicts<T extends Partial<Record<MotionConflictKey, unknown>>>(
  props: T,
): Omit<T, MotionConflictKey> {
  const entries = Object.entries(props).filter(
    ([key]) => key !== 'onDrag' && key !== 'onDragStart' && key !== 'onDragEnd' && key !== 'onAnimationStart',
  );
  return Object.fromEntries(entries) as Omit<T, MotionConflictKey>;
}
