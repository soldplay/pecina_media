/**
 * Ruhe-Kriterium (DESIGN_SPEC §5.7, §6.1): 0 gerenderte Frames spaetestens 1,2 s
 * nach der letzten Eingabe.
 *
 * Der Governor (P8) rendert weiter, solange `now < frame.dirtyUntil` ist,
 * zusaetzlich IDLE_AFTER_MS nach jedem keepAlive, das `frame.dirtyUntil`
 * WACHSEN laesst (Eingabe: Scroll, Pointer, Ausloeser), und solange
 * `now < frame.settleUntil` ist (gedaempfte Animationen, ohne Nachlauf).
 *
 * Fix-Runde 3 (gemessen 14.10.2026: Ruhe 1,25–1,27 s, nach grossen Spruengen
 * 1,8–2,3 s):
 * - EINE Konstante IDLE_AFTER_MS (vorher Governor 1200 + Kopie hier), 1000 ms.
 *   Der Umschalt-Frame rendert selbst noch; mit 1200 lag die Ruhe nie unter 1,2 s.
 * - requestFrames() verlaengert nur noch `frame.settleUntil` (kurz, ohne
 *   Nachlauf). Vorher rief es keepAlive() auf; jede Verlaengerung startete den
 *   vollen Nachlauf neu, eine Daempfung, die knapp nach 0,85 s zur Ruhe kam,
 *   verschob die Ruhe so auf ~1,9 s.
 * Ruhe nach der letzten Eingabe = max(Nachlauf, Ende der letzten Daempfung) + 1 Frame;
 * die Daempfungen (Kamera, Licht, Streifen, Hover) kommen in ≤ 1 s zur Ruhe.
 *
 * Modulzustand (Hot Path, wie `frame` bewusst mutierbar): Spiegel der
 * Governor-Logik, konservativ — er sieht ein Wachstum nie spaeter als der
 * Governor, schaetzt das Fensterende also eher zu frueh.
 */

import { frame, wakeScene } from '@/lib/scene/store';

/**
 * Nachlauf nach dem letzten wachsenden keepAlive (Spec §5.7 „Bewegung an,
 * 1,2 s ohne keepAlive → demand“; 1000 ms + Umschalt-Frame ≤ 1,2 s).
 * Einzige Quelle — der Governor (components/perf/Governor.tsx) importiert sie.
 */
export const IDLE_AFTER_MS = 1000;
/**
 * So frueh vor dem geschaetzten Fensterende wird verlaengert (einige Frames
 * Reserve). Klein, weil requestFrames in jedem Frame kommt, solange etwas
 * nachlaeuft: nach dem Einrasten rendert die Szene hoechstens RENEW_MS weiter.
 */
const RENEW_MARGIN_MS = 60;
/** Dauer der Verlaengerung; > RENEW_MARGIN_MS. */
const RENEW_MS = 2 * RENEW_MARGIN_MS;

interface SettleWindow {
  /** zuletzt gesehenes frame.dirtyUntil */
  lastDirty: number;
  /** Zeitpunkt, an dem dirtyUntil zuletzt gewachsen ist */
  lastGrowthAt: number;
}

const settleWindow: SettleWindow = { lastDirty: 0, lastGrowthAt: Number.NEGATIVE_INFINITY };

/**
 * Einmal pro Frame aufrufen, vor allen requestFrames-Nutzern (CameraRig,
 * Prioritaet −3). Registriert keepAlive-Aufrufe von aussen (Scroll, Pointer).
 */
export function trackSettleWindow(now: number): void {
  if (frame.dirtyUntil <= settleWindow.lastDirty) return;
  settleWindow.lastDirty = frame.dirtyUntil;
  settleWindow.lastGrowthAt = now;
}

/** Bis wann der Governor sicher weiterrendert. */
function framesGuaranteedUntil(): number {
  return Math.max(frame.dirtyUntil, settleWindow.lastGrowthAt + IDLE_AFTER_MS, frame.settleUntil);
}

/**
 * „Diese Animation ruht noch nicht“: haelt die Schleife wach, ohne einen
 * Nachlauf neu zu starten. Aus useFrame aufrufen.
 */
export function requestFrames(now: number = performance.now()): void {
  if (now + RENEW_MARGIN_MS < framesGuaranteedUntil()) return;
  frame.settleUntil = Math.max(frame.settleUntil, now + RENEW_MS);
  // Laeuft der Aufrufer nach dem Governor im selben Frame, kann die Schleife
  // schon auf demand stehen: einen Frame anfordern (aendert dirtyUntil nicht).
  wakeScene();
}
