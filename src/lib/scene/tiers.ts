/**
 * Qualitaetsstufen der Szene (DESIGN_SPEC §5.6, §5.7). Reine Daten + Funktion,
 * ohne React/three.
 */

export interface TierConfig {
  /** Tupel bewusst nicht readonly: passt direkt auf die Canvas-Prop `dpr`. Nicht mutieren. */
  readonly dpr: [number, number];
  /** Postprocessing (Bloom, Vignette, ToneMapping) */
  readonly composer: boolean;
  /** HDRI-Environment statt Lightformer */
  readonly hdri: boolean;
  readonly splinters: number;
  readonly spray: number;
  readonly bustPoints: number;
  readonly bustLines: number;
  readonly socialCards: number;
  readonly leadType: number;
  readonly wireframe: boolean;
  /** optionale Stretch-Effekte der Stationen */
  readonly stretch: boolean;
}

export type SceneTier = 'high' | 'mid';

/** Friert eine Konfiguration ein; der Parameter-Typ sorgt fuer Tupel statt number[]. */
const tierConfig = (config: TierConfig): TierConfig => Object.freeze(config);

export const TIER_CONFIG: Readonly<Record<SceneTier, TierConfig>> = Object.freeze({
  high: tierConfig({
    dpr: [1, 1.5],
    composer: true,
    hdri: true,
    splinters: 2400,
    spray: 12000,
    bustPoints: 16000,
    bustLines: 120,
    socialCards: 9,
    leadType: 40,
    wireframe: true,
    stretch: true,
  }),
  mid: tierConfig({
    dpr: [1, 1.25],
    composer: false,
    hdri: false,
    splinters: 800,
    spray: 5000,
    bustPoints: 6000,
    bustLines: 60,
    socialCards: 9,
    leadType: 30,
    wireframe: false,
    stretch: true,
  }),
});

/** Ueberschreibt high/mid bei compact (< 768 px oder grober Pointer). */
const COMPACT_OVERRIDES_VALUES: Partial<TierConfig> = {
  dpr: [1, 1.25],
  composer: false,
  hdri: false,
  splinters: 0,
  spray: 0,
  bustPoints: 4000,
  bustLines: 40,
  socialCards: 6,
  leadType: 20,
  wireframe: false,
  stretch: false,
};
export const COMPACT_OVERRIDES: Readonly<Partial<TierConfig>> = Object.freeze(COMPACT_OVERRIDES_VALUES);

const QUANTITY_KEYS = ['splinters', 'spray', 'bustPoints', 'bustLines', 'socialCards', 'leadType'] as const;

const cache = new Map<string, TierConfig>();

function normalizeQuality(quality: number): number {
  if (!Number.isFinite(quality)) return 1;
  return Math.min(1, Math.max(0, quality));
}

/**
 * Effektive Konfiguration: Tier-Basis, bei compact ueberschrieben; Mengen mal
 * quality (gerundet, mindestens 0). Bei quality < 1 kein Composer und dpr [1, 1].
 * Gleiche Eingaben liefern dasselbe (eingefrorene) Objekt — stabil fuer React-Deps.
 */
export function resolveTierConfig(tier: SceneTier, compact: boolean, quality: number): TierConfig {
  const q = normalizeQuality(quality);
  const key = `${tier}|${compact ? 1 : 0}|${q}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const base: TierConfig = compact ? { ...TIER_CONFIG[tier], ...COMPACT_OVERRIDES } : TIER_CONFIG[tier];
  const quantities = Object.fromEntries(
    QUANTITY_KEYS.map((k) => [k, Math.max(0, Math.round(base[k] * q))]),
  ) as Pick<TierConfig, (typeof QUANTITY_KEYS)[number]>;
  const degraded = q < 1;

  const resolved = tierConfig({
    ...base,
    ...quantities,
    composer: degraded ? false : base.composer,
    dpr: degraded ? [1, 1] : base.dpr,
  });
  cache.set(key, resolved);
  return resolved;
}
