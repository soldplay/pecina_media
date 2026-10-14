/**
 * Statisches Beispiel-Cover eines Cases (DESIGN_SPEC §3.4): reines CSS/SVG aus den
 * Marken-Tokens, keine Bilder, keine Marken. Farbe aus `posterTone`, Form aus
 * `posterShape`. Bewusst ohne Schwerpunkt-Nummern: Im Kunden-Feedback (2026-10-14) waren
 * die nackten Nummern unverstaendlich; die Schwerpunkte stehen als Namen in der Case-Zeile.
 *
 * Server-tauglich (keine Hooks): genutzt von CaseList (Panel, mobile Karte).
 * Exportiert ausserdem das Badge „Beispiel“.
 */
import { COPY } from '@/content/site';
import type { CaseCopy } from '@/content/types';
import { CUT_COS, CUT_SIN, CUT_TAN } from '@/lib/brand';

// ---------------------------------------------------------------------------
// Badge „Beispiel“ (Text #9D5F09 nur auf Paper, 1 px Ink-Rahmen, Radius 4 px)
// ---------------------------------------------------------------------------

export interface ExampleBadgeProps {
  readonly className?: string;
  /** z. B. fuer aria-describedby der Case-Zeile (CaseList) */
  readonly id?: string;
  /** true: nur visuelles Symbol (aria-hidden), der Text steht daneben */
  readonly decorative?: boolean;
}

export function ExampleBadge({ className, id, decorative = false }: ExampleBadgeProps) {
  return (
    <span
      id={id}
      aria-hidden={decorative || undefined}
      data-copy-status={COPY.ui.meta.status}
      data-copy-source={COPY.ui.meta.source}
      className={[
        'inline-flex items-center rounded-sm border border-ink bg-paper px-2 py-0.5',
        'font-sans text-[0.875rem] font-semibold uppercase leading-[1.2] tracking-[0.08em] wdth-75',
        'text-brand-text',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {COPY.ui.exampleBadge}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Poster
// ---------------------------------------------------------------------------

/** portrait 4:5 (Panel, Vorschau), landscape 16:10 (mobile Karte) */
export type PosterRatio = 'portrait' | 'landscape';

export interface CasePosterProps {
  readonly item: CaseCopy;
  readonly ratio: PosterRatio;
  readonly className?: string;
}

interface ToneStyle {
  readonly surface: string;
  readonly text: string;
  readonly shape: string;
}

/** Orange-Flaeche mit Ink, Ink-Flaeche mit Paper/Orange, Paper-Flaeche mit Ink/Orange (Grafik, kein Text). */
const TONES: Readonly<Record<CaseCopy['posterTone'], ToneStyle>> = {
  brand: { surface: 'bg-brand', text: 'text-ink', shape: 'var(--color-ink)' },
  ink: { surface: 'bg-ink', text: 'text-paper', shape: 'var(--color-brand)' },
  paper: { surface: 'bg-paper ring-1 ring-inset ring-ink', text: 'text-ink', shape: 'var(--color-brand)' },
};

const RATIO_CLASS: Readonly<Record<PosterRatio, string>> = {
  portrait: 'aspect-[4/5]',
  landscape: 'aspect-[16/10]',
};

// Geometrie im viewBox 400 x 500 (4:5). Im 16:10-Format schneidet `slice`
// oben und unten je 125 Einheiten ab; die Formen liegen im sichtbaren Band.
const VIEW_W = 400;
const VIEW_H = 500;
/** halber Spalt entlang der Normalen (Einheiten) */
const HALF_GAP = 6;
/** Normale nach oben links im SVG-Raum (y nach unten) */
const N_UP = { x: -CUT_SIN, y: -CUT_COS } as const;

const r1 = (v: number): string => v.toFixed(1);

function shift(sign: 1 | -1): string {
  return `translate(${r1(sign * HALF_GAP * N_UP.x)} ${r1(sign * HALF_GAP * N_UP.y)})`;
}

/** Kreis, entlang der 6°-Linie durch den Mittelpunkt in zwei Haelften geschnitten. */
function circleHalves(): { upper: string; lower: string } {
  const cx = 285;
  const cy = 175;
  const radius = 105;
  const x1 = cx - radius * CUT_COS;
  const y1 = cy + radius * CUT_SIN;
  const x2 = cx + radius * CUT_COS;
  const y2 = cy - radius * CUT_SIN;
  const start = `M${r1(x1)} ${r1(y1)}`;
  const end = `${r1(x2)} ${r1(y2)}`;
  return {
    upper: `${start} A${radius} ${radius} 0 0 1 ${end} Z`,
    lower: `${start} A${radius} ${radius} 0 0 0 ${end} Z`,
  };
}

/** Balken ueber die volle Breite, schraeg geschnitten wie MEDIA im Logo. */
function barHalves(): { upper: string; lower: string } {
  const top = 150;
  const bottom = 222;
  const midY = (top + bottom) / 2;
  const rise = (VIEW_W / 2) * CUT_TAN;
  const leftCut = r1(midY + rise);
  const rightCut = r1(midY - rise);
  return {
    upper: `M0 ${top} L${VIEW_W} ${top} L${VIEW_W} ${rightCut} L0 ${leftCut} Z`,
    lower: `M0 ${leftCut} L${VIEW_W} ${rightCut} L${VIEW_W} ${bottom} L0 ${bottom} Z`,
  };
}

const SHAPES: Readonly<Record<CaseCopy['posterShape'], { upper: string; lower: string }>> = {
  circle: circleHalves(),
  bar: barHalves(),
};

function PosterShape({ shape, color }: { shape: CaseCopy['posterShape']; color: string }) {
  const halves = SHAPES[shape];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <path d={halves.upper} fill={color} transform={shift(1)} />
      <path d={halves.lower} fill={color} transform={shift(-1)} />
    </svg>
  );
}

export default function CasePoster({ item, ratio, className }: CasePosterProps) {
  const tone = TONES[item.posterTone];

  return (
    <div
      role="img"
      aria-label={`${COPY.arbeiten.posterLabel.text} ${item.title.text}`}
      className={['relative w-full overflow-hidden select-none', RATIO_CLASS[ratio], tone.surface, tone.text, className]
        .filter(Boolean)
        .join(' ')}
    >
      <PosterShape shape={item.posterShape} color={tone.shape} />
      <ExampleBadge decorative className="absolute left-[6%] top-[6%]" />
    </div>
  );
}
