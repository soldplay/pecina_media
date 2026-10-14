'use client';

/**
 * „Zwei Haelften, ein Haus“ (DESIGN_SPEC §3.6), rein dekorativ (aria-hidden).
 *
 * Eine Flaeche, entlang der 6°-Linie in zwei Platten geschnitten: oben „agentur“
 * (Flaeche #D17F0C, Ink-Text, Comfortaa 700), unten „weiterbildung“ (Paper, Ink-Text).
 * Die Platten starten ±26 % entlang d und ±0,8em entlang n auseinander und fuegen sich
 * per Scrub ('top 75%' → 'center 70%') bis auf den Logo-Spalt (0,065em). Review 14.10.2026:
 * vorher ±40 % und Ende 'center 50%' – waehrend des Lesens waren die Woerter angeschnitten.
 *
 * Woerter nie gekappt: Die Woerter bewegen sich nicht mit (Gegen-Transform), die Platten gleiten
 * unter ihnen zusammen. Der Versatz ist so gewaehlt, dass jede Platte ihr Wort auch ganz
 * auseinander vollstaendig traegt („weiterbildung“ misst ca. 64 % der Breite, rechts 6 % Rand:
 * 100 − 6 − 64 = 30 ≥ 26 · cos 6°); der Container schneidet nie ein Wort ab.
 *
 * Gesteuert ueber eine CSS-Variable --t (1 = auseinander, 0 = gefuegt). Standard ist
 * gefuegt (SSR, Reduced, ohne JS); nur bei Bewegung setzt GSAP den Startwert.
 */
import { useRef, type CSSProperties } from 'react';
import { Copy } from '@/components/copy/Copy';
import { COPY } from '@/content/site';
import { CUT_COS, CUT_SIN, CUT_TAN } from '@/lib/brand';
import { gsap, useGSAP } from '@/lib/gsap';
import { ui, useUi } from '@/lib/scene/store';

/**
 * gsap.matchMedia ruft den Callback nur auf, wenn eine Bedingung zutrifft: daher beide
 * Systemzustaende. Die Nutzerwahl (ui.motion) entscheidet; die Abfrage sorgt nur dafuer,
 * dass der Aufbau bei einem Systemwechsel sofort neu laeuft.
 */
const MOTION_CONDITIONS = {
  systemReduced: '(prefers-reduced-motion: reduce)',
  systemFull: '(prefers-reduced-motion: no-preference)',
} as const;

/** Startversatz entlang d in Prozent der Breite (cqw); Grenze siehe Kopfkommentar */
const APART_ALONG_D = 26;
/** Startversatz entlang n in em */
const APART_ALONG_N = 0.8;
/** Logo-Spalt in em (9 % der Versalhoehe) */
const GAP_EM = 0.065;

const f4 = (v: number): string => v.toFixed(4);

/**
 * Versatz einer Platte im CSS-Raum (y nach unten): d = (cos, −sin), n nach oben = (−sin, −cos).
 * Obere Platte (sign 1): t · (−D·d) + t · (N·n) + (Spalt/2)·n; untere Platte gespiegelt.
 */
function plateTransform(sign: 1 | -1): string {
  const dX = -APART_ALONG_D * CUT_COS * sign;
  const dY = APART_ALONG_D * CUT_SIN * sign;
  const nX = -APART_ALONG_N * CUT_SIN * sign;
  const nY = -APART_ALONG_N * CUT_COS * sign;
  const gX = (-GAP_EM / 2) * CUT_SIN * sign;
  const gY = (-GAP_EM / 2) * CUT_COS * sign;
  const x = `calc(var(--t) * ${f4(dX)}cqw + var(--t) * ${f4(nX)}em + ${f4(gX)}em)`;
  const y = `calc(var(--t) * ${f4(dY)}cqw + var(--t) * ${f4(nY)}em + ${f4(gY)}em)`;
  return `translate(${x}, ${y})`;
}

/** halber Anstieg der Schnittlinie ueber die volle Breite (cqw) */
const HALF_RISE = f4((CUT_TAN * 100) / 2);
const LEFT_CUT = `calc(50% + ${HALF_RISE}cqw)`;
const RIGHT_CUT = `calc(50% - ${HALF_RISE}cqw)`;

const UPPER_STYLE: CSSProperties = {
  clipPath: `polygon(0 0, 100% 0, 100% ${RIGHT_CUT}, 0 ${LEFT_CUT})`,
  transform: plateTransform(1),
};

const LOWER_STYLE: CSSProperties = {
  clipPath: `polygon(0 ${LEFT_CUT}, 100% ${RIGHT_CUT}, 100% 100%, 0 100%)`,
  transform: plateTransform(-1),
};

/** Gegen-Transform der Woerter: plateTransform(−sign) hebt den Versatz der Platte genau auf. */
const UPPER_WORD_STYLE: CSSProperties = { transform: plateTransform(-1) };
const LOWER_WORD_STYLE: CSSProperties = { transform: plateTransform(1) };

export default function TwoHalves() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useUi((s) => s.motion === 'reduced');
  const { upper, lower } = COPY.klartext.halves;

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_CONDITIONS, (context) => {
        const systemReduced = context.conditions?.systemReduced === true;
        if (reduced || (ui.get().motionSource === 'system' && systemReduced)) return;
        gsap.fromTo(
          root,
          { '--t': 1 },
          {
            '--t': 0,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top 75%', end: 'center 70%', scrub: true },
          },
        );
      });
    },
    { scope: rootRef, dependencies: [reduced], revertOnUpdate: true },
  );

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="@container relative w-full select-none overflow-hidden [--t:0]"
    >
      <div className="relative aspect-[16/10] font-round text-[9cqw] font-bold leading-none text-ink">
        <div className="absolute inset-0 bg-brand" style={UPPER_STYLE}>
          <span className="absolute left-[6%] top-[14%]" style={UPPER_WORD_STYLE}>
            <Copy value={upper} />
          </span>
        </div>
        <div className="absolute inset-0 bg-paper" style={LOWER_STYLE}>
          <span className="absolute bottom-[14%] right-[6%]" style={LOWER_WORD_STYLE}>
            <Copy value={lower} />
          </span>
        </div>
      </div>
    </div>
  );
}
