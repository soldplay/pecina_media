'use client';

/**
 * Drei Haltungs-Monolithe (DESIGN_SPEC §3.2): Platten 2,2 × 4,8 × 0,28 mit
 * 6°-Oberkante, Front-Textur (Ziffer als Outline + Stichwort), 6°-Lichtstreifen
 * und Blob-Schatten. 6 Draw Calls: Platten (1, zusammengefuehrt), Fronten (3,
 * je eigene CanvasTexture), Lichtstreifen (1, instanziert), Schatten (1, instanziert).
 *
 * Lichtstreifen: 0,15 → 2,2 fuer den aktiven Monolithen (ui.haltungActive),
 * gedaempft 0,25 s (Fix-Runde 3, Ruhe); Reduced: alle 2,2. Texte aus content/site.ts.
 * Fronten: Helligkeit nach Blickwinkel (FRONT_FOCUS, Fix-Runde 3) — die Saeule
 * des aktuellen Haltungs-Keys voll, Nachbarn hinter dem Panel gedimmt.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COPY } from '@/content/site';
import { COLORS, CUT_RAD, CUT_TAN, FONT_VARS } from '@/lib/brand';
import { damp } from '@/lib/scene/math';
import { MONOLITHS, MONOLITH_SIZE } from '@/lib/scene/stations';
import { ui } from '@/lib/scene/store';
import { createCanvasTexture, resolveFontFamily, useCanvasTexture } from '@/lib/three/canvas-texture';
import { extrudePolygons, type Vec2 } from '@/lib/three/split-extrude';
import { requestFrames } from '../core/settle';

const [SLAB_W, SLAB_H, SLAB_D] = MONOLITH_SIZE;
const SLAB_MATERIAL = Object.freeze({ color: COLORS.anthracite, roughness: 0.7 });

/** Front-Plane 2,0 × 4,4 knapp vor der Plattenfront (z +0,14), Textur 512 × 1024. */
const FRONT = Object.freeze({ w: 2.0, h: 4.4, y: SLAB_H / 2, z: 0.142, texW: 512, texH: 1024 });
/** Lichtstreifen 2,2 × 0,03 auf 62 % Hoehe, 6° geneigt, vor der Front-Plane. */
/**
 * Daempfung 0,4 → 0,25 s, Einrasten ab 0,02 (< 1 % von 2,2), Fix-Runde 3: mit
 * 0,4 s / 0,001 kam der Streifen erst ~2 s nach dem Prinzip-Wechsel zur Ruhe
 * (gemessen Haltung: Ruhe 1,85 s). Jetzt ≤ 0,85 s.
 */
const STRIP = Object.freeze({ w: 2.2, h: 0.03, y: SLAB_H * 0.62, z: 0.146, off: 0.15, on: 2.2, smooth: 0.25 });
const STRIP_EPS = 0.02;
/** Blob-Schatten: Ellipse unter der Platte, Alpha 0,5 in der Mitte. */
const SHADOW = Object.freeze({ w: 3.2, h: 1.4, y: 0.002, alpha: 0.5, tex: 128 });

/** Front-Typografie in Canvas-Pixeln (512 breit; Hoehen siehe drawFront). */
const TYPE = Object.freeze({
  digitPx: 360,
  digitWeight: 900,
  stroke: 3,
  labelPx: 64,
  labelWeight: 600,
  margin: 28,
  digitBaseline: 340,
  labelBaseline: 545,
});

// ---------------------------------------------------------------------------
// Geometrie und Materialien (ausserhalb von React; Besitzer = Monoliths)
// ---------------------------------------------------------------------------

/** Viereck mit 6°-Oberkante (steigt nach rechts), Mitte der Oberkante bei 4,8. */
function slabOutline(): readonly Vec2[] {
  const rise = (SLAB_W / 2) * CUT_TAN;
  return [
    [-SLAB_W / 2, 0],
    [SLAB_W / 2, 0],
    [SLAB_W / 2, SLAB_H + rise],
    [-SLAB_W / 2, SLAB_H - rise],
  ];
}

function monolithMatrix(index: number): THREE.Matrix4 {
  const { pos, rotY } = MONOLITHS[index];
  return new THREE.Matrix4().makeRotationY(rotY).setPosition(pos[0], pos[1], pos[2]);
}

function buildSlabs(): THREE.Mesh {
  const base = extrudePolygons([slabOutline()], { depth: SLAB_D });
  const placed = MONOLITHS.map((_, i) => base.clone().applyMatrix4(monolithMatrix(i)));
  const merged = mergeGeometries(placed, false);
  placed.forEach((g) => g.dispose());
  base.dispose();
  if (!merged) throw new Error('Monoliths: mergeGeometries ist fehlgeschlagen');
  return new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ ...SLAB_MATERIAL }));
}

function buildStrips(): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(STRIP.w, STRIP.h);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, MONOLITHS.length);
  const local = new THREE.Matrix4()
    .makeRotationZ(CUT_RAD)
    .setPosition(0, STRIP.y, STRIP.z);
  const off = new THREE.Color(COLORS.glow).multiplyScalar(STRIP.off);
  MONOLITHS.forEach((_, i) => {
    mesh.setMatrixAt(i, monolithMatrix(i).multiply(local));
    mesh.setColorAt(i, off);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function drawBlob(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const r = Math.min(w, h) / 2;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${SHADOW.alpha})`);
  gradient.addColorStop(0.55, `rgba(0, 0, 0, ${SHADOW.alpha * 0.45})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function buildShadows(): { mesh: THREE.InstancedMesh; texture: THREE.CanvasTexture } {
  const texture = createCanvasTexture(SHADOW.tex, SHADOW.tex, drawBlob, { mipmaps: true });
  const geometry = new THREE.PlaneGeometry(SHADOW.w, SHADOW.h);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, MONOLITHS.length);
  const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, SHADOW.y, 0);
  MONOLITHS.forEach((_, i) => mesh.setMatrixAt(i, monolithMatrix(i).multiply(flat)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh, texture };
}

interface MonolithParts {
  readonly slabs: THREE.Mesh;
  readonly strips: THREE.InstancedMesh;
  readonly shadows: THREE.InstancedMesh;
  readonly shadowTexture: THREE.CanvasTexture;
}

function buildMonolithParts(): MonolithParts {
  const shadows = buildShadows();
  return { slabs: buildSlabs(), strips: buildStrips(), shadows: shadows.mesh, shadowTexture: shadows.texture };
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((m) => m.dispose());
}

function disposeMonolithParts(parts: MonolithParts): void {
  disposeMesh(parts.slabs);
  disposeMesh(parts.strips);
  disposeMesh(parts.shadows);
  parts.strips.dispose();
  parts.shadows.dispose();
  parts.shadowTexture.dispose();
}

// ---------------------------------------------------------------------------
// Lichtstreifen (Hot Path)
// ---------------------------------------------------------------------------

type StripLevels = readonly number[];

function stripTargets(active: number, reduced: boolean): StripLevels {
  return MONOLITHS.map((_, i) => (reduced || active === i + 1 ? STRIP.on : STRIP.off));
}

/** Naechste Intensitaeten; gleiche Referenz, wenn alles ruht (keine Allokation im Ruhezustand). */
function stepStripLevels(prev: StripLevels | null, active: number, reduced: boolean, dt: number): StripLevels {
  const targets = stripTargets(active, reduced);
  if (!prev || reduced) return prev && prev.every((v, i) => v === targets[i]) ? prev : targets;
  if (prev.every((v, i) => v === targets[i])) return prev;
  return prev.map((v, i) => {
    const next = damp(v, targets[i], STRIP.smooth, dt);
    return Math.abs(next - targets[i]) < STRIP_EPS ? targets[i] : next;
  });
}

const scratchColor = new THREE.Color();
const glowColor = new THREE.Color(COLORS.glow);

function applyStripLevels(strips: THREE.InstancedMesh, levels: StripLevels): void {
  levels.forEach((level, i) => strips.setColorAt(i, scratchColor.copy(glowColor).multiplyScalar(level)));
  if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
}

function stripsSettled(levels: StripLevels, active: number, reduced: boolean): boolean {
  const targets = stripTargets(active, reduced);
  return levels.every((v, i) => v === targets[i]);
}

// ---------------------------------------------------------------------------
// Front-Texturen
// ---------------------------------------------------------------------------

interface FrontFonts {
  readonly archivo: string;
  readonly comfortaa: string;
}

/**
 * Plane 2,0 × 4,4 auf Textur 512 × 1024: ein Pixel ist vertikal 1,1-mal so hoch
 * wie breit. Gezeichnet wird in einem um 1/1,1 gestauchten Raum, damit die
 * Schrift auf der Platte unverzerrt erscheint.
 */
const PIXEL_ASPECT = FRONT.h / FRONT.texH / (FRONT.w / FRONT.texW);

function drawFront(ctx: CanvasRenderingContext2D, w: number, h: number, num: string, label: string, fonts: FrontFonts): void {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(1, 1 / PIXEL_ASPECT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  const maxWidth = w - TYPE.margin * 2;

  ctx.font = `${TYPE.digitWeight} ${TYPE.digitPx}px ${fonts.archivo}`;
  if ('fontStretch' in ctx) ctx.fontStretch = 'expanded';
  ctx.lineWidth = TYPE.stroke;
  ctx.lineJoin = 'miter';
  ctx.strokeText(num, w / 2, TYPE.digitBaseline, maxWidth);

  if ('fontStretch' in ctx) ctx.fontStretch = 'normal';
  ctx.font = `${TYPE.labelWeight} ${TYPE.labelPx}px ${fonts.comfortaa}`;
  ctx.fillText(label, w / 2, TYPE.labelBaseline, maxWidth);
  ctx.restore();
}

/**
 * Fix-Runde 3: Seit der Haltungs-Ausschnitt aus der Panel-Kante gemessen wird,
 * steht die Saeule des Prinzips mittig in der freien Flaeche; die Nachbar-
 * Saeulen liegen links hinter dem 92-%-Panel bzw. im Seitenrand und schienen mit
 * voller Paper-Helligkeit durch („Strategie“ neben 02). Ihre Fronten werden
 * deshalb nach Blickwinkel gedimmt: bis 18° von der Blickachse voll, ab 30° 6 %.
 * Scroll-gebunden (folgt der Kamera), keine eigene Zeitanimation.
 */
const FRONT_FOCUS = Object.freeze({ fullDeg: 18, dimDeg: 30, dim: 0.06 });
const FRONT_COLOR_EPS = 1e-3;
const DEG = Math.PI / 180;
const scratchForward = new THREE.Vector3();
const scratchToFront = new THREE.Vector3();
const paperColor = new THREE.Color(COLORS.paper);

/** Helligkeit der Front aus dem Winkel zwischen Blickachse und Front-Mitte. */
function frontBrightness(camera: THREE.Camera, center: THREE.Vector3): number {
  camera.getWorldDirection(scratchForward);
  scratchToFront.copy(center).sub(camera.position);
  const length = scratchToFront.length();
  if (length < 1e-4) return 1;
  const angle = Math.acos(Math.min(1, Math.max(-1, scratchForward.dot(scratchToFront) / length)));
  const t = Math.min(1, Math.max(0, (angle - FRONT_FOCUS.fullDeg * DEG) / ((FRONT_FOCUS.dimDeg - FRONT_FOCUS.fullDeg) * DEG)));
  const eased = t * t * (3 - 2 * t);
  return 1 + (FRONT_FOCUS.dim - 1) * eased;
}

function MonolithFront({ index }: { index: number }) {
  const { pos, rotY } = MONOLITHS[index];
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const center = useMemo(() => new THREE.Vector3(pos[0], pos[1] + FRONT.y, pos[2]), [pos]);
  // −1: erster Frame setzt die Farbe immer (Paper × Helligkeit; kein color-Prop, sonst setzte ein Re-Render sie zurueck).
  const brightnessRef = useRef(-1);
  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;
    const brightness = frontBrightness(state.camera, center);
    if (Math.abs(brightness - brightnessRef.current) < FRONT_COLOR_EPS) return;
    brightnessRef.current = brightness;
    material.color.copy(paperColor).multiplyScalar(brightness);
  });
  const num = COPY.haltung.principles[index].num;
  const label = COPY.scene3d.monoliths[index];
  const fonts = useMemo<FrontFonts>(
    () => ({ archivo: resolveFontFamily(FONT_VARS.display), comfortaa: resolveFontFamily(FONT_VARS.round) }),
    [],
  );
  const fontSpecs = useMemo(
    () => [
      `${TYPE.digitWeight} ${TYPE.digitPx}px ${fonts.archivo}`,
      `${TYPE.labelWeight} ${TYPE.labelPx}px ${fonts.comfortaa}`,
    ],
    [fonts],
  );
  const texture = useCanvasTexture(
    FRONT.texW,
    FRONT.texH,
    (ctx, w, h) => drawFront(ctx, w, h, num, label, fonts),
    [num, label, fonts.archivo, fonts.comfortaa],
    fontSpecs,
  );

  // Erst mit fertiger Textur montieren: kein leeres Paper-Rechteck, kein Programmwechsel.
  if (!texture) return null;
  return (
    <group position={[pos[0], pos[1], pos[2]]} rotation-y={rotY}>
      <mesh position={[0, FRONT.y, FRONT.z]}>
        <planeGeometry args={[FRONT.w, FRONT.h]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          transparent
          depthWrite={false}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export interface MonolithsProps {
  reduced: boolean;
}

export default function Monoliths({ reduced }: MonolithsProps) {
  const parts = useMemo(() => buildMonolithParts(), []);
  const levelsRef = useRef<StripLevels | null>(null);

  useEffect(() => () => disposeMonolithParts(parts), [parts]);

  useFrame((_, delta) => {
    const active = ui.get().haltungActive;
    const prev = levelsRef.current;
    const next = stepStripLevels(prev, active, reduced, delta);
    if (next !== prev) {
      levelsRef.current = next;
      applyStripLevels(parts.strips, next);
    }
    // Gedaempft: kein neuer 1,2-s-Nachlauf pro Frame (Ruhe-Kriterium, core/settle.ts).
    if (!stripsSettled(next, active, reduced)) requestFrames();
  });

  return (
    <>
      <primitive object={parts.slabs} />
      <primitive object={parts.strips} />
      <primitive object={parts.shadows} />
      {MONOLITHS.map((m, i) => (
        <MonolithFront key={`monolith-${m.pos.join('_')}`} index={i} />
      ))}
    </>
  );
}
