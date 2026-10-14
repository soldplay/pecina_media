/**
 * Fallback-Figuren der vier Stationen (P5, DESIGN_SPEC §3.3.0–§3.3.4).
 *
 * Server Component, reines SVG/CSS, aria-hidden. Sichtbar nur bei html[data-scene="off"]
 * (globals.css: .scene-fallback, Umschaltung per visibility, kein CLS).
 * Split-Panel 4:5: oben analog, unten digital, getrennt durch eine 6°-Linie. Deren Lage
 * (--pm-fb-split) laeuft per animation-timeline ueber den View-Timeline `--pm-leistung`
 * des umgebenden Artikels (LeistungItem), nur in @supports und bei Bewegung; sonst 50 %.
 * Beat a zeigt den ersten, Beat b den zweiten Schnitt der Station.
 * Texte stammen aus COPY.scene3d (dieselben Texte wie die 3D-Texturen).
 */

import type { ReactNode } from 'react';
import { COPY } from '@/content/site';
import type { StationId } from '@/lib/scene/ids';
import { mulberry32 } from '@/lib/scene/math';

export type FallbackBeat = 'a' | 'b';

export interface StationFallbackProps {
  readonly station: StationId;
  readonly beat: FallbackBeat;
}

interface FigureLayers {
  readonly analog: ReactNode;
  readonly digital: ReactNode;
}

const W = 400;
const H = 500;
const VIEW_BOX = `0 0 ${W} ${H}`;
const TAN6 = 0.1051;

const C = {
  ink: '#0E0E0E',
  anthracite: '#1C1C1C',
  graphite: '#2A2826',
  paper: '#F4F1EA',
  paper2: '#EAE5DA',
  brand: '#D17F0C',
  glow: '#FFB257',
  muted: '#B5AFA4',
  mutedLight: '#5C574F',
  pencil: '#6B665E',
  lead: '#3A3A3A',
} as const;

const FALLBACK_CSS = `
@property --pm-fb-split { syntax: '<percentage>'; inherits: true; initial-value: 50%; }
@keyframes pm-fb-split { from { --pm-fb-split: 80%; } to { --pm-fb-split: 20%; } }
.pm-fb { position: relative; width: 100%; aspect-ratio: 4 / 5; }
.pm-fb__frame {
  --pm-fb-split: 50%;
  position: absolute; inset: 0; overflow: hidden; container-type: inline-size;
  background: var(--color-ink); outline: 1px solid var(--color-line-dark); outline-offset: -1px;
}
/* Chrome malt feTurbulence-Filter (Korn) auch unter visibility:hidden. Der Rahmen ist absolut
   positioniert, display:none aendert die Groesse von .pm-fb also nicht (kein CLS). */
html:not([data-scene='off']) .pm-fb__frame { display: none; }
@supports (animation-timeline: view()) {
  html[data-motion='full'] .pm-fb__frame {
    animation: pm-fb-split linear both;
    animation-timeline: --pm-leistung;
    animation-range: cover 30% cover 70%;
  }
}
.pm-fb__layer { position: absolute; inset: 0; }
.pm-fb__layer > svg { display: block; width: 100%; height: 100%; }
.pm-fb__analog { clip-path: polygon(0 0, 100% 0, 100% calc(var(--pm-fb-split) - 4.204%), 0 calc(var(--pm-fb-split) + 4.204%)); }
.pm-fb__digital { clip-path: polygon(0 calc(var(--pm-fb-split) + 4.204%), 100% calc(var(--pm-fb-split) - 4.204%), 100% 100%, 0 100%); }
.pm-fb__line {
  position: absolute; left: -5%; width: 110%; height: 2px; top: var(--pm-fb-split); margin-top: -1px;
  background: var(--color-brand); box-shadow: 0 0 6px var(--color-glow); transform: rotate(-6deg);
}
.pm-fb text { font-family: var(--font-sans); }
.pm-fb .pm-fb-round { font-family: var(--font-round); }
.pm-fb .pm-fb-wide { font-variation-settings: 'wdth' 125; }
.pm-fb-dos {
  position: absolute; inset: 0; padding: 10cqi 7cqi; background-color: #0a0700; color: #ffb000;
  background-image: repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0, 0, 0, 0.3) 2px 3px);
}
.pm-fb-dos pre {
  margin: 0; white-space: pre-wrap; overflow-wrap: anywhere;
  font: 400 4.4cqi/1.6 ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace;
  text-shadow: 0 0 1.2cqi rgba(255, 176, 0, 0.45);
}
.pm-fb-dos__cursor { display: inline-block; width: 0.6em; height: 1.05em; margin-left: 0.15em; vertical-align: text-bottom; background: currentColor; }
.pm-fb-web { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--color-paper); color: var(--color-ink); font-family: var(--font-sans); }
.pm-fb-web__nav { display: flex; align-items: center; gap: 3cqi; height: 11cqi; padding: 0 7cqi; background: var(--color-ink); }
.pm-fb-web__logo { width: 3.4cqi; height: 3.4cqi; margin-right: auto; border-radius: 50%; background: var(--color-brand); }
.pm-fb-web__link { width: 9cqi; height: 1.2cqi; background: var(--color-paper); opacity: 0.7; }
.pm-fb-web__body { display: flex; flex: 1; flex-direction: column; gap: 7cqi; padding: 11cqi 7cqi; }
.pm-fb-web__headline { margin: 0; font-weight: 900; font-size: 8.6cqi; line-height: 1; letter-spacing: -0.02em; }
.pm-fb-web__cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3cqi; }
.pm-fb-web__card { height: 26cqi; border-top: 2.2cqi solid var(--color-brand); background: var(--color-paper-2); }
.pm-fb-web__button { align-self: flex-start; padding: 2.6cqi 4.4cqi; background: var(--color-brand); color: var(--color-ink); font-weight: 700; font-size: 3.8cqi; }
.pm-fb-feed { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 4cqi; padding: 0 7cqi; background: var(--color-ink); font-family: var(--font-sans); }
.pm-fb-feed__card { display: flex; flex: 1; flex-direction: column; justify-content: space-between; aspect-ratio: 9 / 16; padding: 3cqi; font-weight: 800; font-size: 3.6cqi; line-height: 1.1; }
.pm-fb-feed__dots { display: flex; gap: 1.2cqi; }
.pm-fb-feed__dots i { width: 2.2cqi; height: 2.2cqi; border-radius: 50%; background: currentColor; opacity: 0.6; }
.pm-fb-feed__card--paper { background: var(--color-paper); color: var(--color-ink); }
.pm-fb-feed__card--brand { background: var(--color-brand); color: var(--color-ink); }
.pm-fb-feed__card--anthracite { background: var(--color-anthracite); color: var(--color-paper); outline: 1px solid var(--color-line-dark); outline-offset: -1px; }
`;

/** Eindeutige SVG-ids je Figur (jede Kombination Station/Beat kommt genau einmal vor). */
function idFor(station: StationId, beat: FallbackBeat, name: string): string {
  return `pm-fb-${station}-${beat}-${name}`;
}

/** y der 6°-Linie durch (cx, cy) an Stelle x (SVG-y zeigt nach unten, die Linie steigt nach rechts). */
function cutY(cx: number, cy: number, x: number): number {
  return cy - TAN6 * (x - cx);
}

function Svg({ children }: { readonly children: ReactNode }) {
  return (
    <svg viewBox={VIEW_BOX} preserveAspectRatio="xMidYMid slice" focusable="false">
      {children}
    </svg>
  );
}

function GrainFilter({ id }: { readonly id: string }) {
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="6" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.42" />
      </feComponentTransfer>
    </filter>
  );
}

// ---------------------------------------------------------------------------
// Station I – Marke
// ---------------------------------------------------------------------------

interface CanColors {
  readonly body: string;
  readonly shoulder: string;
  readonly cap: string;
  readonly label: string;
}

interface CanProps {
  readonly x: number;
  readonly top: number;
  readonly w: number;
  readonly colors: CanColors;
  readonly dented?: boolean;
}

const CAN_BOTTOM = 432;

function Can({ x, top, w, colors, dented = false }: CanProps) {
  const right = x + w;
  const body = dented
    ? `M${x} ${top} H${right} V${top + 70} Q${right - 7} ${top + 92} ${right} ${top + 118} V${CAN_BOTTOM} H${x} Z`
    : `M${x} ${top} H${right} V${CAN_BOTTOM} H${x} Z`;
  return (
    <g>
      <path d={body} fill={colors.body} />
      <path
        d={`M${x} ${top} C${x} ${top - 16} ${x + w * 0.2} ${top - 24} ${x + w * 0.3} ${top - 24} H${x + w * 0.7} C${x + w * 0.8} ${top - 24} ${right} ${top - 16} ${right} ${top} Z`}
        fill={colors.shoulder}
      />
      <rect x={x + w * 0.24} y={top - 64} width={w * 0.52} height={42} rx={6} fill={colors.cap} />
      <rect x={x + w * 0.42} y={top - 78} width={w * 0.16} height={14} rx={2} fill={colors.cap} />
      <rect x={x} y={top + (CAN_BOTTOM - top) * 0.52} width={w} height={(CAN_BOTTOM - top) * 0.3} fill={colors.label} />
    </g>
  );
}

const CAN_A = { x: 108, top: 206, w: 86 } as const;
const CAN_B = { x: 214, top: 236, w: 76 } as const;

function MarkeCans({ a, b }: { readonly a: CanColors; readonly b: CanColors }) {
  return (
    <>
      <Can {...CAN_A} colors={a} />
      <Can {...CAN_B} colors={b} dented />
    </>
  );
}

const RAW_CAN_A: CanColors = { body: '#8A8378', shoulder: '#7A746A', cap: C.mutedLight, label: '#A39C90' };
const RAW_CAN_B: CanColors = { body: C.pencil, shoulder: '#5F5A52', cap: '#4A4640', label: '#8A8378' };
const BRAND_CAN_A: CanColors = { body: C.brand, shoulder: '#B86F0A', cap: C.ink, label: C.glow };
const BRAND_CAN_B: CanColors = { body: C.paper, shoulder: C.paper2, cap: C.anthracite, label: C.muted };

function Swatches() {
  const chips = [
    { fill: C.ink, text: C.paper, stroke: 'rgba(244,241,234,0.4)' },
    { fill: C.brand, text: C.ink, stroke: 'none' },
    { fill: C.paper, text: C.ink, stroke: 'none' },
  ] as const;
  return (
    <g>
      {COPY.scene3d.swatches.map((hex, i) => {
        const chip = chips[i] ?? chips[0];
        const x = 56 + i * 98;
        return (
          <g key={hex}>
            <rect x={x} y={450} width={92} height={34} fill={chip.fill} stroke={chip.stroke} />
            <text x={x + 46} y={472} textAnchor="middle" fontSize={13} fontWeight={700} fill={chip.text}>
              {hex}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const SHEET = { x: 82, y: 186, width: 236, height: 168 } as const;
const SHEET_CX = SHEET.x + SHEET.width / 2;
const SHEET_CY = SHEET.y + SHEET.height / 2;

function SketchMarks() {
  return (
    <g fill="none" stroke={C.pencil} strokeWidth={2} strokeLinecap="round">
      <line x1={100} y1={232} x2={300} y2={232} strokeDasharray="4 5" opacity={0.5} />
      <line x1={SHEET_CX} y1={200} x2={SHEET_CX} y2={340} strokeDasharray="4 5" opacity={0.5} />
      <circle cx={165} cy={268} r={34} />
      <circle cx={167} cy={266} r={37} opacity={0.45} />
      <rect x={205} y={260} width={84} height={18} transform="rotate(-6 247 269)" />
      <text
        className="pm-fb-round"
        x={SHEET.x + SHEET.width - 12}
        y={SHEET.y + SHEET.height - 12}
        textAnchor="end"
        fontSize={13}
        fill={C.pencil}
        stroke="none"
      >
        {COPY.scene3d.sketchLabel}
      </text>
    </g>
  );
}

function CleanMark() {
  return (
    <g>
      <circle cx={165} cy={268} r={34} fill={C.brand} />
      <rect x={205} y={260} width={84} height={18} fill={C.ink} transform="rotate(-6 247 269)" />
    </g>
  );
}

function marke(beat: FallbackBeat): FigureLayers {
  const grain = idFor('marke', beat, 'grain');
  const rawBackground = (
    <>
      <rect width={W} height={H} fill={C.anthracite} />
      <defs>
        <GrainFilter id={grain} />
      </defs>
    </>
  );
  const grainOverlay = <rect width={W} height={H} filter={`url(#${grain})`} />;

  if (beat === 'a') {
    return {
      analog: (
        <Svg>
          {rawBackground}
          <MarkeCans a={RAW_CAN_A} b={RAW_CAN_B} />
          {grainOverlay}
        </Svg>
      ),
      digital: (
        <Svg>
          <rect width={W} height={H} fill={C.ink} />
          <MarkeCans a={BRAND_CAN_A} b={BRAND_CAN_B} />
          <Swatches />
        </Svg>
      ),
    };
  }

  const upper = idFor('marke', beat, 'upper');
  const lower = idFor('marke', beat, 'lower');
  const left = SHEET.x;
  const right = SHEET.x + SHEET.width;
  const yl = cutY(SHEET_CX, SHEET_CY, left);
  const yr = cutY(SHEET_CX, SHEET_CY, right);
  const sheet = <rect {...SHEET} fill={C.paper} />;

  return {
    analog: (
      <Svg>
        {rawBackground}
        <g transform={`rotate(-3 ${SHEET_CX} ${SHEET_CY})`}>
          {sheet}
          <SketchMarks />
        </g>
        {grainOverlay}
      </Svg>
    ),
    digital: (
      <Svg>
        <defs>
          <clipPath id={upper}>
            <polygon points={`${left},${SHEET.y} ${right},${SHEET.y} ${right},${yr} ${left},${yl}`} />
          </clipPath>
          <clipPath id={lower}>
            <polygon points={`${left},${yl} ${right},${yr} ${right},${SHEET.y + SHEET.height} ${left},${SHEET.y + SHEET.height}`} />
          </clipPath>
        </defs>
        <rect width={W} height={H} fill={C.ink} />
        <g clipPath={`url(#${lower})`}>
          {sheet}
          <CleanMark />
        </g>
        {/* Logo-Versatz: obere Haelfte entlang der Schnittrichtung verschoben */}
        <g transform="translate(12 -3.3)">
          <g clipPath={`url(#${upper})`}>
            {sheet}
            <CleanMark />
          </g>
        </g>
        <line x1={left} y1={yl} x2={right} y2={yr} stroke={C.glow} strokeWidth={2} opacity={0.9} />
      </Svg>
    ),
  };
}

// ---------------------------------------------------------------------------
// Station II – Bildschirm
// ---------------------------------------------------------------------------

function DosScreen() {
  return (
    <div className="pm-fb-dos">
      <pre>
        {COPY.scene3d.dos.join('\n')}
        <span className="pm-fb-dos__cursor" />
      </pre>
    </div>
  );
}

function MiniWebsite() {
  return (
    <div className="pm-fb-web">
      <div className="pm-fb-web__nav">
        <span className="pm-fb-web__logo" />
        <span className="pm-fb-web__link" />
        <span className="pm-fb-web__link" />
        <span className="pm-fb-web__link" />
      </div>
      <div className="pm-fb-web__body">
        <p className="pm-fb-web__headline">{COPY.scene3d.webHeadline}</p>
        <div className="pm-fb-web__cards">
          <span className="pm-fb-web__card" />
          <span className="pm-fb-web__card" />
          <span className="pm-fb-web__card" />
        </div>
        <span className="pm-fb-web__button">{COPY.scene3d.webButton}</span>
      </div>
    </div>
  );
}

const FEED_TONES = ['paper', 'brand', 'anthracite'] as const;

function FeedCards() {
  return (
    <div className="pm-fb-feed">
      {COPY.scene3d.feed.slice(0, FEED_TONES.length).map((caption, i) => (
        <div key={caption} className={`pm-fb-feed__card pm-fb-feed__card--${FEED_TONES[i] ?? 'paper'}`}>
          <span className="pm-fb-feed__dots">
            <i />
            <i />
            <i />
          </span>
          <span>{caption}</span>
        </div>
      ))}
    </div>
  );
}

function bildschirm(beat: FallbackBeat): FigureLayers {
  return beat === 'a'
    ? { analog: <DosScreen />, digital: <MiniWebsite /> }
    : { analog: <MiniWebsite />, digital: <FeedCards /> };
}

// ---------------------------------------------------------------------------
// Station III – Papier
// ---------------------------------------------------------------------------

const PAGE = { x: 70, y: 70, width: 260, height: 360 } as const;

/** Bleistift-Kritzel aus seeded Zufall (deterministisch, kein Math.random). */
function scribbleRows(): readonly string[] {
  const rand = mulberry32(5);
  const rows: string[] = [];
  for (let y = 132; y <= 312; y += 30) {
    const points: string[] = [];
    const end = PAGE.x + PAGE.width - 30 - rand() * 60;
    for (let x = PAGE.x + 26; x <= end; x += 9) {
      points.push(`${x.toFixed(1)},${(y + (rand() - 0.5) * 12).toFixed(1)}`);
    }
    rows.push(points.join(' '));
  }
  return rows;
}

const SCRIBBLES = scribbleRows();

function ScribblePage() {
  return (
    <g transform={`rotate(-2.5 ${W / 2} ${H / 2})`}>
      <rect {...PAGE} fill={C.paper} />
      <g fill="none" stroke={C.pencil} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
        {SCRIBBLES.map((points, i) => (
          <polyline key={points} points={points} opacity={i % 3 === 1 ? 0.55 : 0.9} />
        ))}
        <line x1={96} y1={164} x2={262} y2={158} />
        <line x1={96} y1={254} x2={230} y2={250} />
        <ellipse cx={226} cy={378} rx={62} ry={26} transform="rotate(-6 226 378)" />
      </g>
      <text className="pm-fb-round" x={226} y={387} textAnchor="middle" fontSize={26} fontWeight={500} fill={C.pencil}>
        {COPY.scene3d.scribbleWord}
      </text>
    </g>
  );
}

const TEXT_BARS = [208, 186, 214, 160, 198, 120] as const;

function TypesetPage() {
  const words = COPY.scene3d.typeHeadline.split(' ');
  const firstLine = words.slice(0, -1).join(' ');
  const lastLine = words.at(-1) ?? '';
  return (
    <g>
      <rect {...PAGE} fill={C.paper} />
      <text x={PAGE.x + 26} y={PAGE.y + 66} fontSize={30} fontWeight={800} fill={C.ink} letterSpacing={-0.6}>
        <tspan x={PAGE.x + 26}>{firstLine}</tspan>
        <tspan x={PAGE.x + 26} dy={32}>
          {lastLine}
        </tspan>
      </text>
      {TEXT_BARS.map((w, i) => (
        <rect key={`${w}-${i}`} x={PAGE.x + 26} y={PAGE.y + 140 + i * 24} width={w} height={8} fill={C.mutedLight} opacity={0.35} />
      ))}
      <line x1={PAGE.x + 26} y1={cutY(200, 400, PAGE.x + 26)} x2={PAGE.x + PAGE.width - 26} y2={cutY(200, 400, PAGE.x + PAGE.width - 26)} stroke={C.brand} strokeWidth={3} />
    </g>
  );
}

const TYPE_BLOCK = { y: 168, w: 60, h: 66, gap: 2 } as const;
const TYPE_ROW_X = (W - (5 * TYPE_BLOCK.w + 4 * TYPE_BLOCK.gap)) / 2;

function LeadType() {
  const mirrored = Array.from(COPY.scene3d.proof).reverse();
  const cy = TYPE_BLOCK.y + 34;
  const proofCy = 336;
  return (
    <g>
      <rect width={W} height={H} fill={C.graphite} />
      {mirrored.map((letter, i) => {
        const x = TYPE_ROW_X + i * (TYPE_BLOCK.w + TYPE_BLOCK.gap);
        const cx = x + TYPE_BLOCK.w / 2;
        return (
          <g key={`${letter}-${i}`}>
            <rect x={x} y={TYPE_BLOCK.y} width={TYPE_BLOCK.w} height={TYPE_BLOCK.h} fill={C.lead} />
            <rect x={x} y={TYPE_BLOCK.y} width={TYPE_BLOCK.w} height={4} fill="#4A4A4A" />
            <text
              className="pm-fb-wide"
              x={cx}
              y={TYPE_BLOCK.y + 50}
              textAnchor="middle"
              fontSize={44}
              fontWeight={900}
              fill={C.muted}
              transform={`translate(${2 * cx} 0) scale(-1 1)`}
            >
              {letter}
            </text>
          </g>
        );
      })}
      {/* durchgehender 6°-Schnitt ueber alle fuenf Lettern */}
      <line x1={TYPE_ROW_X - 4} y1={cutY(W / 2, cy, TYPE_ROW_X - 4)} x2={W - TYPE_ROW_X + 4} y2={cutY(W / 2, cy, W - TYPE_ROW_X + 4)} stroke={C.lead} strokeWidth={3.2} />
      <rect x={70} y={300} width={260} height={72} fill={C.paper} />
      <text className="pm-fb-wide" x={W / 2} y={proofCy + 15} textAnchor="middle" fontSize={42} fontWeight={900} fill={C.ink}>
        {COPY.scene3d.proof}
      </text>
      <line x1={78} y1={cutY(W / 2, proofCy, 78)} x2={322} y2={cutY(W / 2, proofCy, 322)} stroke={C.paper} strokeWidth={3} />
    </g>
  );
}

function papier(beat: FallbackBeat): FigureLayers {
  const background = <rect width={W} height={H} fill={C.graphite} />;
  return beat === 'a'
    ? {
        analog: (
          <Svg>
            {background}
            <ScribblePage />
          </Svg>
        ),
        digital: (
          <Svg>
            {background}
            <TypesetPage />
          </Svg>
        ),
      }
    : {
        analog: (
          <Svg>
            {background}
            <TypesetPage />
          </Svg>
        ),
        digital: (
          <Svg>
            <LeadType />
          </Svg>
        ),
      };
}

// ---------------------------------------------------------------------------
// Station IV – Kopf
// ---------------------------------------------------------------------------

/** Profil eines klassischen Kopfes mit Bueste, Blick nach rechts (eigene Zeichnung). */
const PROFILE_PATH =
  'M150 452 L150 430 C150 402 146 382 152 362 C121 341 105 302 110 252 C113 182 151 111 215 101 ' +
  'C270 93 312 121 318 171 C320 190 316 200 320 211 C328 228 340 245 345 262 C347 268 340 272 330 274 ' +
  'C333 282 330 290 333 296 C327 300 322 302 326 306 C330 312 326 318 320 322 C318 330 322 340 318 350 ' +
  'C312 362 296 368 280 370 C276 385 278 400 286 412 C320 420 340 436 346 452 Z';

const VEINS = [
  'M120 210 C170 240 190 300 260 330',
  'M200 110 C190 170 230 220 220 300',
  'M150 380 C190 360 250 390 300 430',
] as const;

/** Kleiner Kopf links bzw. Zwilling rechts (Beat b), skaliert 0,72. */
const HEAD_LEFT = 'translate(-57.6 52) scale(0.72)';
const HEAD_RIGHT = 'translate(132.4 52) scale(0.72)';

interface HeadProps {
  readonly beat: FallbackBeat;
  /** Ebene (analog/digital) im id, damit dieselbe Figur zweimal ohne doppelte ids vorkommen kann */
  readonly layer: 'analog' | 'digital';
  readonly transform?: string;
}

function MarbleHead({ beat, layer, transform }: HeadProps) {
  const gradient = idFor('kopf', beat, `${layer}-marble`);
  const clip = idFor('kopf', beat, `${layer}-profile`);
  return (
    <g transform={transform}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.paper} />
          <stop offset="0.45" stopColor="#D8D2C6" />
          <stop offset="0.62" stopColor={C.paper2} />
          <stop offset="1" stopColor={C.muted} />
        </linearGradient>
        <clipPath id={clip}>
          <path d={PROFILE_PATH} />
        </clipPath>
      </defs>
      <path d={PROFILE_PATH} fill={`url(#${gradient})`} />
      <g clipPath={`url(#${clip})`} fill="none" stroke="#9C958A" strokeWidth={2} opacity={0.55}>
        {VEINS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </g>
  );
}

function DotHead({ beat, layer, transform }: HeadProps) {
  const pattern = idFor('kopf', beat, `${layer}-dots`);
  return (
    <g transform={transform}>
      <defs>
        <pattern id={pattern} width={9} height={9} patternUnits="userSpaceOnUse">
          <circle cx={4.5} cy={4.5} r={2.4} fill={C.brand} />
        </pattern>
      </defs>
      <path d={PROFILE_PATH} fill={`url(#${pattern})`} />
    </g>
  );
}

const NODE_COUNT = 6;

function Network() {
  const nodes = Array.from({ length: NODE_COUNT }, (_, i) => {
    const angle = ((-140 + (i * 100) / (NODE_COUNT - 1)) * Math.PI) / 180;
    return { x: 228 + 190 * Math.cos(angle), y: 268 + 190 * Math.sin(angle) };
  });
  const anchors = [
    { x: 200, y: 160 },
    { x: 250, y: 140 },
    { x: 300, y: 190 },
  ] as const;
  return (
    <g>
      <g stroke={C.brand} strokeWidth={1.2} strokeDasharray="5 5" opacity={0.7}>
        {nodes.map((n, i) => {
          const a = anchors[i % anchors.length] ?? anchors[0];
          return <line key={`${n.x.toFixed(1)}-${n.y.toFixed(1)}`} x1={a.x} y1={a.y} x2={n.x} y2={n.y} />;
        })}
      </g>
      {nodes.map((n) => (
        <circle key={`n-${n.x.toFixed(1)}-${n.y.toFixed(1)}`} cx={n.x} cy={n.y} r={4} fill={C.glow} />
      ))}
    </g>
  );
}

function kopf(beat: FallbackBeat): FigureLayers {
  const background = <rect width={W} height={H} fill="#141414" />;
  if (beat === 'a') {
    return {
      analog: (
        <Svg>
          {background}
          <MarbleHead beat="a" layer="analog" />
        </Svg>
      ),
      digital: (
        <Svg>
          {background}
          <DotHead beat="a" layer="digital" />
          <Network />
        </Svg>
      ),
    };
  }
  return {
    analog: (
      <Svg>
        {background}
        <MarbleHead beat="b" layer="analog" transform={HEAD_LEFT} />
      </Svg>
    ),
    digital: (
      <Svg>
        {background}
        <MarbleHead beat="b" layer="digital" transform={HEAD_LEFT} />
        <DotHead beat="b" layer="digital" transform={HEAD_RIGHT} />
      </Svg>
    ),
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const FIGURES: Readonly<Record<StationId, (beat: FallbackBeat) => FigureLayers>> = {
  marke,
  bildschirm,
  papier,
  kopf,
};

export function StationFallback({ station, beat }: StationFallbackProps) {
  const { analog, digital } = FIGURES[station](beat);
  return (
    <div
      className="scene-fallback pm-fb"
      data-station={station}
      data-beat={beat}
      data-copy-status={COPY.scene3d.meta.status}
      aria-hidden="true"
    >
      <style href="pm-p5-fallback" precedence="pm-p5">
        {FALLBACK_CSS}
      </style>
      <div className="pm-fb__frame">
        <div className="pm-fb__layer pm-fb__analog">{analog}</div>
        <div className="pm-fb__layer pm-fb__digital">{digital}</div>
        <span className="pm-fb__line" />
      </div>
    </div>
  );
}
