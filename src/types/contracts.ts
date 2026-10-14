/**
 * Vertraege zwischen Fundament und Paketen P1–P9 (DESIGN_SPEC §5.10).
 * Nur Typen und Doku, kein Laufzeitcode.
 *
 * ---------------------------------------------------------------------------
 * Modul-Tabelle (Importpfad → Export → Paket)
 * ---------------------------------------------------------------------------
 * @/components/scene/Scene                    default Scene(SceneProps)                  P1
 * @/components/scene/hero/TypoArchitecture    default (TypoArchitectureProps)             P2
 * @/components/scene-dom/Preloader            default Preloader()                         P2
 * @/components/scene/stations/StationMarke    default (StationContentProps)               P3
 * @/components/scene/stations/StationBildschirm default (StationContentProps)             P3
 * @/components/scene/stations/StationPapier   default (StationContentProps)               P4
 * @/components/scene/stations/StationKopf     default (StationContentProps)               P4
 * @/components/perf/SceneLoader               default SceneLoader()                       P8
 * @/components/perf/Governor                  default Governor() → null                   P8
 * @/components/a11y/MotionPrefProvider        default ({ children })                      P8
 * @/components/a11y/SmoothScroll              default ({ children })                      P8
 * @/components/sections/StartSection          default ()                                  P5
 * @/components/sections/HaltungSection        default ()                                  P5
 * @/components/sections/LeistungenSection     default ()                                  P5
 * @/components/ui/CutHeading                  named CutHeading(CutHeadingProps)           P5
 * @/components/ui/Button                      named ButtonLink(ButtonLinkProps),
 *                                             named Button(ButtonProps)                   P5
 * @/components/ui/SplitReveal                 named SplitReveal({ as, children, className }) P5
 * @/components/sections/ArbeitenSection       default ()                                  P6
 * @/components/sections/ProzessSection        default ()                                  P6
 * @/components/sections/KlartextSection       default ()                                  P6
 * @/components/sections/KontaktSection        default ()                                  P6
 * @/components/layout/Header                  default ()                                  P7
 * @/components/layout/Footer                  default ()                                  P7
 * @/components/layout/SkipLink                default ()                                  P7
 * @/components/layout/Cursor                  default ()                                  P7
 * @/components/layout/GrainOverlay            default ()                                  P7
 * @/components/layout/PageTransition          default ()                                  P7
 * @/components/layout/RouteFocus              default ()                                  P7
 * @/components/layout/DraftMarker             default ()                                  P7
 * @/components/layout/TransitionLink          named TransitionLink(TransitionLinkProps)   P7
 * @/components/layout/MotionToggle            named MotionToggle(MotionToggleProps)       P7
 * @/components/seo/JsonLd                     default ()                                  P9
 *
 * Stub-Auftrag: Der Integrator legt fuer jeden Eintrag einen Stub an
 * (`export default function X() { return null }` bzw. die benannte Variante;
 * MotionPrefProvider und SmoothScroll reichen children durch; CutHeading,
 * ButtonLink, Button, TransitionLink und MotionToggle sind minimal
 * funktionierende Elemente). Der Stub gehoert dem jeweiligen Paket und wird
 * von ihm ueberschrieben. Exportnamen und Props bleiben wie hier festgelegt.
 */

import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import type Link from 'next/link';
import type { CopyText } from '@/content/types';
import type { SectionId, StationId } from '@/lib/scene/ids';
import type { TierConfig } from '@/lib/scene/tiers';

export type { TierConfig };

/** Scene (P1), gemountet von SceneLoader (P8) */
export interface SceneProps {
  tier: 'high' | 'mid';
  compact: boolean;
}

/** TypoArchitecture (P2) */
export interface TypoArchitectureProps {
  config: TierConfig;
  reduced: boolean;
}

/** Stationen (P3, P4); Koordinaten Station-lokal, Platzierung macht StationShell (P1) */
export interface StationContentProps {
  id: StationId;
  config: TierConfig;
  reduced: boolean;
}

/** CutHeading (P5) */
export interface CutHeadingProps {
  as: 'h1' | 'h2' | 'h3';
  id: string;
  text: CopyText;
  /** je Zeile ein <span class="cut-text block">; ohne lines eine Zeile aus text */
  lines?: readonly CopyText[];
  variant: 'load' | 'scroll' | 'static';
  className?: string;
  /** Standard −1 fuer h1/h2 */
  tabIndex?: number;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonTone = 'dark' | 'light';

/** ButtonLink (P5) */
export interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant: ButtonVariant;
  tone?: ButtonTone;
  /** Klick → scrollToTarget(id); liefert das false, normale Navigation zu /#id */
  scrollTarget?: SectionId;
  external?: boolean;
  cursorLabel?: string;
  onHoverChange?: (hovered: boolean) => void;
  className?: string;
}

/** Button (P5) */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ButtonVariant;
  tone?: ButtonTone;
}

/** TransitionLink (P7) */
export interface TransitionLinkProps extends Omit<ComponentProps<typeof Link>, 'onNavigate'> {
  children: ReactNode;
}

/** MotionToggle (P7) */
export interface MotionToggleProps {
  variant: 'header' | 'menu' | 'footer';
}
