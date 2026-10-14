/**
 * Asset-Manifest der Startseite (DESIGN_SPEC §5.6, docs/ASSETS.md).
 *
 * - Pfade exakt klein geschrieben (Linux/Vercel ist case-sensitiv).
 * - Laden mit useGLTF(url, false, true): kein Draco (sonst laedt drei den Decoder
 *   von gstatic), Meshopt-Decoder kommt aus dem Bundle. Keine drei-`preset`s.
 * - Diese Datei kommt bewusst ohne Imports (kein React, kein three, keine
 *   Pfad-Aliase), damit scripts/check-asset-budget.mjs (P8) sie lesen kann:
 *   per Regex auf ASSET_MANIFEST_JSON oder per dynamischem Import (Node 24
 *   entfernt TypeScript-Typen selbst).
 * - Bytes sind die echten Dateigroessen in web/public (14.10.2026 gemessen).
 */

export const MODELS = {
  spray: {
    id: 'spray_paint_bottles_02',
    url: '/models/spray_paint_bottles_02.glb',
    bytes: 363028,
    station: 'marke',
  },
  laptop: {
    id: 'classic_laptop',
    url: '/models/classic_laptop.glb',
    bytes: 345728,
    station: 'bildschirm',
  },
  notepads: {
    id: 'office_notepads',
    url: '/models/office_notepads.glb',
    bytes: 83960,
    station: 'papier',
  },
  bust: {
    id: 'marble_bust_01',
    url: '/models/marble_bust_01.glb',
    bytes: 351792,
    station: 'kopf',
  },
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelUrl = (typeof MODELS)[ModelKey]['url'];

export const HDRI = {
  studio: {
    url: '/hdri/studio_small_09_1k.hdr',
    bytes: 1615248,
    tiers: ['high'],
  },
} as const;

/** Idle-Prefetch nach ui.preloaderDone (AssetPrefetch, P1). */
export const IDLE_PREFETCH: readonly ModelUrl[] = [
  MODELS.spray.url,
  MODELS.laptop.url,
  MODELS.notepads.url,
  MODELS.bust.url,
];

export const BUDGET = {
  initialBytesMax: 6_000_000,
  modelBytesMax: 1_000_000,
  maxModels: 5,
} as const;

/**
 * Dieselben Daten als JSON-Literal fuer das Node-Budget-Skript (P8, Regex auf
 * das Template-Literal, dann JSON.parse). Bei Aenderungen oben UND hier pflegen;
 * check-asset-budget.mjs soll beide Fassungen gegeneinander pruefen.
 */
export const ASSET_MANIFEST_JSON = `{
  "models": {
    "spray": { "id": "spray_paint_bottles_02", "url": "/models/spray_paint_bottles_02.glb", "bytes": 363028, "station": "marke" },
    "laptop": { "id": "classic_laptop", "url": "/models/classic_laptop.glb", "bytes": 345728, "station": "bildschirm" },
    "notepads": { "id": "office_notepads", "url": "/models/office_notepads.glb", "bytes": 83960, "station": "papier" },
    "bust": { "id": "marble_bust_01", "url": "/models/marble_bust_01.glb", "bytes": 351792, "station": "kopf" }
  },
  "hdri": {
    "studio": { "url": "/hdri/studio_small_09_1k.hdr", "bytes": 1615248, "tiers": ["high"] }
  },
  "initial": ["/hdri/studio_small_09_1k.hdr"],
  "idlePrefetch": [
    "/models/spray_paint_bottles_02.glb",
    "/models/classic_laptop.glb",
    "/models/office_notepads.glb",
    "/models/marble_bust_01.glb"
  ],
  "budget": { "initialBytesMax": 6000000, "modelBytesMax": 1000000, "maxModels": 5 }
}`;
