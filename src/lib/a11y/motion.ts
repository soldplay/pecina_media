/**
 * Bewegungs-Praeferenz (DESIGN_SPEC §4.5, §5.8). Keine React-Abhaengigkeit:
 * app/layout.tsx (Server) importiert MOTION_INIT_SCRIPT, Client-Code nutzt
 * setMotionPreference. Deshalb `ui` aus dem React-freien store-core.
 *
 * html[data-motion]        'full' | 'reduced'  (effektiver Wert)
 * html[data-motion-source] 'system' | 'user'   (Herkunft)
 * localStorage['pm-motion'] 'full' | 'reduced'  (nur bei Nutzerwahl)
 */

import { ui } from '@/lib/scene/store-core';

export type MotionValue = 'full' | 'reduced';
export type MotionPreference = MotionValue | 'system';

const MOTION_STORAGE_KEY = 'pm-motion';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Inline-Script fuer <head>: laeuft vor dem ersten Paint, setzt html.js sowie
 * data-motion und data-motion-source. Alles in try/catch (Storage kann fehlen
 * oder werfen, z. B. im privaten Modus).
 */
export const MOTION_INIT_SCRIPT = `(function(){try{var d=document.documentElement;d.classList.add('js');var s=null;try{s=window.localStorage.getItem(${JSON.stringify(
  MOTION_STORAGE_KEY,
)})}catch(e){}var src='system';var m;if(s==='reduced'||s==='full'){m=s;src='user'}else{m=window.matchMedia&&window.matchMedia(${JSON.stringify(
  REDUCED_QUERY,
)}).matches?'reduced':'full'}d.setAttribute('data-motion',m);d.setAttribute('data-motion-source',src)}catch(e){}})();`;

/** true, wenn das System reduzierte Bewegung verlangt (Server: false). */
function getSystemReduced(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

function writeStoredMotion(pref: MotionPreference): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(MOTION_STORAGE_KEY);
    else window.localStorage.setItem(MOTION_STORAGE_KEY, pref);
  } catch {
    // Storage nicht verfuegbar: Wahl gilt nur fuer diese Sitzung.
  }
}

/**
 * Setzt die Praeferenz: 'reduced'/'full' speichern (Nutzerwahl), 'system'
 * loescht den Eintrag und folgt prefers-reduced-motion. Aktualisiert beide
 * html-Attribute und ui.motion / ui.motionSource.
 */
export function setMotionPreference(pref: MotionPreference): void {
  if (typeof document === 'undefined') return;
  writeStoredMotion(pref);
  const motion: MotionValue = pref === 'system' ? (getSystemReduced() ? 'reduced' : 'full') : pref;
  const motionSource = pref === 'system' ? 'system' : 'user';
  const root = document.documentElement;
  root.dataset.motion = motion;
  root.dataset.motionSource = motionSource;
  ui.set({ motion, motionSource });
}
