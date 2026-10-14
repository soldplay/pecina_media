/**
 * Reine Mathe-Helfer fuer Szene und Scroll-Kopplung. Keine Seiteneffekte.
 * Easings entsprechen den gleichnamigen GSAP-Eases (DESIGN_SPEC §2.5).
 */

export function clamp01(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite-Smoothstep wie in GLSL; e0 === e1 liefert eine harte Stufe. */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** GSAP 'sine.inOut' */
export function easeSineInOut(t: number): number {
  return (1 - Math.cos(Math.PI * clamp01(t))) / 2;
}

/** GSAP 'power2.inOut' (quadratisch) */
export function power2InOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** GSAP 'power3.out' (kubisch) */
export function power3Out(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

/** GSAP 'power3.inOut' (kubisch) */
export function power3InOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Deterministischer PRNG (mulberry32) statt Math.random — reproduzierbare
 * Szenen und kein Hydration-Drift. Liefert Werte in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN_SMOOTH_TIME = 1e-4;

/**
 * Bildraten-unabhaengige exponentielle Annaeherung (Skalar). Nach `smoothTime`
 * Sekunden sind ca. 86 % des Abstands ueberbrueckt. Fuer Vektoren/Farben in 3D
 * maath `easing.damp3`/`dampC` bevorzugen.
 */
export function damp(current: number, target: number, smoothTime: number, dt: number): number {
  const k = 1 - Math.exp((-2 * Math.max(dt, 0)) / Math.max(smoothTime, MIN_SMOOTH_TIME));
  return current + (target - current) * k;
}
