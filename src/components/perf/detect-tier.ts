/**
 * Tier-Erkennung (DESIGN_SPEC §5.7), nur im Browser aufrufen (SceneLoader, nach
 * der Hydration im Idle-Callback). Ohne User-Agent-Sniffing.
 *
 * - low:  kein WebGL2; Kontext mit failIfMajorPerformanceCaveat scheitert;
 *         Software-Renderer (SwiftShader, llvmpipe, Software, Basic Render);
 *         saveData; deviceMemory ≤ 2; hardwareConcurrency ≤ 2
 * - mid:  (pointer: coarse); innerWidth < 1024; deviceMemory ≤ 4; hardwareConcurrency ≤ 4
 * - high: sonst
 * - compact = innerWidth < 768 || (pointer: coarse) — immer frisch berechnet
 *
 * Das Ergebnis liegt in sessionStorage['pm-tier'] ('high' | 'mid' | 'low'), damit
 * der GPU-Test pro Sitzung nur einmal laeuft; ein Laufzeit-Abstieg (Governor:
 * Fallback, Kontextverlust) wird per rememberTier('low') ebenfalls gemerkt.
 * Override per ?tier=low|mid|high: gilt nur fuer diesen Aufruf, beruehrt den
 * Cache nicht (QA: frischer Tab bzw. URL ohne Parameter misst wieder echt).
 */

export type DetectedTier = 'high' | 'mid' | 'low';

export interface TierDetection {
  readonly tier: DetectedTier;
  readonly compact: boolean;
}

const STORAGE_KEY = 'pm-tier';
const OVERRIDE_PARAM = 'tier';

const LOW_MEMORY_GB = 2;
const MID_MEMORY_GB = 4;
const LOW_CORES = 2;
const MID_CORES = 4;
const MID_MAX_WIDTH = 1024;
const COMPACT_MAX_WIDTH = 768;

const COARSE_POINTER_QUERY = '(pointer: coarse)';
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;
/** Maskierte RENDERER-Strings: dann (und nur dann) die Debug-Extension fragen. */
const MASKED_RENDERER = /^(webkit webgl|mozilla)$/i;

/** Nicht standardisierte Navigator-Hinweise (nur Chromium); fehlen sie, zaehlen sie nicht. */
interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly connection?: { readonly saveData?: boolean };
}

function isDetectedTier(value: unknown): value is DetectedTier {
  return value === 'high' || value === 'mid' || value === 'low';
}

function navigatorHints(): NavigatorHints {
  return navigator as Navigator & NavigatorHints;
}

/** Positive Zahl oder null (0/undefined = unbekannt). */
function knownNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function isCoarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(COARSE_POINTER_QUERY).matches;
}

function isCompact(): boolean {
  return window.innerWidth < COMPACT_MAX_WIDTH || isCoarsePointer();
}

// ---------------------------------------------------------------- Storage

function readStoredTier(): DetectedTier | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return isDetectedTier(value) ? value : null;
  } catch {
    return null;
  }
}

/** Merkt den Tier fuer diese Sitzung (z. B. 'low' nach Kontextverlust). Storage-Fehler werden ignoriert. */
export function rememberTier(tier: DetectedTier): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, tier);
  } catch {
    // Storage gesperrt (privater Modus, Richtlinie): dann misst die naechste Seite neu.
  }
}

function readOverride(): DetectedTier | null {
  try {
    const value = new URLSearchParams(window.location.search).get(OVERRIDE_PARAM);
    return isDetectedTier(value) ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- GPU-Test

function readRenderer(gl: WebGL2RenderingContext): string {
  const basic: unknown = gl.getParameter(gl.RENDERER);
  const basicText = typeof basic === 'string' ? basic : '';
  // Firefox liefert hier schon den (bereinigten) echten Namen und warnt bei der
  // veralteten Debug-Extension; Chromium/WebKit maskieren und brauchen sie.
  if (basicText && !MASKED_RENDERER.test(basicText.trim())) return basicText;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  if (!debug) return basicText;
  const unmasked: unknown = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  return typeof unmasked === 'string' ? unmasked : basicText;
}

/**
 * true, wenn ein WebGL2-Kontext ohne grosse Leistungseinbusse entsteht und
 * kein Software-Renderer dahinter steckt. Der Testkontext wird sofort wieder
 * freigegeben (Browser begrenzen die Zahl lebender Kontexte).
 */
function hasCapableWebGL2(): boolean {
  if (typeof WebGL2RenderingContext === 'undefined') return false;
  let gl: WebGL2RenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    gl = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return false;
    return !SOFTWARE_RENDERER.test(readRenderer(gl));
  } catch {
    return false;
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

// ---------------------------------------------------------------- Regeln

function isLowByHints(hints: NavigatorHints): boolean {
  const memory = knownNumber(hints.deviceMemory);
  const cores = knownNumber(hints.hardwareConcurrency);
  return (
    hints.connection?.saveData === true ||
    (memory !== null && memory <= LOW_MEMORY_GB) ||
    (cores !== null && cores <= LOW_CORES)
  );
}

function isMid(hints: NavigatorHints): boolean {
  const memory = knownNumber(hints.deviceMemory);
  const cores = knownNumber(hints.hardwareConcurrency);
  return (
    isCoarsePointer() ||
    window.innerWidth < MID_MAX_WIDTH ||
    (memory !== null && memory <= MID_MEMORY_GB) ||
    (cores !== null && cores <= MID_CORES)
  );
}

/** Misst den Tier ohne Cache: billige Hinweise zuerst, der GPU-Test nur bei Bedarf. */
function measureTier(): DetectedTier {
  const hints = navigatorHints();
  if (isLowByHints(hints)) return 'low';
  if (!hasCapableWebGL2()) return 'low';
  return isMid(hints) ? 'mid' : 'high';
}

/**
 * Bestimmt Tier und compact. Reihenfolge: ?tier= → sessionStorage → Messung
 * (Ergebnis wird gemerkt). Auf dem Server (sollte nie passieren) 'low', damit
 * dort nichts 3D-Spezifisches entschieden wird.
 */
export function detectTier(): TierDetection {
  if (typeof window === 'undefined') return Object.freeze({ tier: 'low', compact: false });
  const compact = isCompact();

  const override = readOverride();
  if (override) return Object.freeze({ tier: override, compact });

  const stored = readStoredTier();
  if (stored) return Object.freeze({ tier: stored, compact });

  const tier = measureTier();
  rememberTier(tier);
  return Object.freeze({ tier, compact });
}
