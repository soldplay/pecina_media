/**
 * Hintergrund ohne Echtzeit-3D (DESIGN_SPEC §5.7, Tier low bzw. Laufzeit-
 * Fallback). Reines CSS, keine Animation, aria-hidden. Liegt im fixen
 * `.scene-layer` von SceneLoader (z 0) und fuellt ihn ganz aus.
 *
 * - Grund: Ink mit sehr leichtem radialem Verlauf (#1C1C1C → #0E0E0E)
 * - statische 6°-Klinge (2 px #D17F0C, Gluehen 0 0 24px #FFB257 mit 40 %) auf
 *   Hoehe der Skulpturmitte: 36 % (HERO_BLADE_SCREEN_Y), compact (< 768 px oder
 *   grober Pointer) 28 % wie Preloader und Hero-Layout
 *
 * Ohne Hooks: rendert in Client- wie Server-Baeumen.
 */

import type { CSSProperties } from 'react';
import { COLORS, CUT_DEG } from '@/lib/brand';
import { HERO_BLADE_SCREEN_Y } from '@/lib/scene/stations';

const GLOW_ALPHA = 0.4;
const GLOW_BLUR_PX = 24;
const BLADE_THICKNESS_PX = 2;

/** '#RRGGBB' + Deckkraft → rgba(); Markenfarben stehen nur einmal in brand.ts. */
function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const toPercent = (fraction: number): string => `${Math.round(fraction * 1000) / 10}%`;

const ROOT_STYLE: CSSProperties = Object.freeze({
  background: `radial-gradient(120% 90% at 50% ${toPercent(HERO_BLADE_SCREEN_Y.desktop)}, ${COLORS.anthracite} 0%, ${COLORS.ink} 70%)`,
  // Hoehen als Variablen; die Media-Umschaltung uebernehmen die Klassen unten.
  '--pm-blade-y': toPercent(HERO_BLADE_SCREEN_Y.desktop),
  '--pm-blade-y-compact': toPercent(HERO_BLADE_SCREEN_Y.compact),
} as CSSProperties);

const BLADE_STYLE: CSSProperties = Object.freeze({
  height: BLADE_THICKNESS_PX,
  background: COLORS.brand,
  boxShadow: `0 0 ${GLOW_BLUR_PX}px ${withAlpha(COLORS.glow, GLOW_ALPHA)}`,
  // Steigt von links unten nach rechts oben wie der Logo-Schnitt.
  transform: `translateY(-50%) rotate(-${CUT_DEG}deg)`,
});

export default function LowTierBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden" style={ROOT_STYLE}>
      <div
        className="absolute -left-[5%] w-[110%] top-(--pm-blade-y) max-md:top-(--pm-blade-y-compact) pointer-coarse:top-(--pm-blade-y-compact)"
        style={BLADE_STYLE}
      />
    </div>
  );
}
