'use client';

/**
 * Werkfuge-Sockel (DESIGN_SPEC §3.3.0), Station-lokale Koordinaten:
 * Ursprung = Sockelmitte am Boden, +z = Front.
 *
 * - Block 1,6 × 2,0 × 1,2, vor dem Extrudieren an der 6°-Geraden durch
 *   (0, 0,92) geteilt (splitPolygons + extrudePolygons): Unterteil + Deckel.
 * - MeshStandardMaterial #1C1C1C, roughness 0,82, patchCutMaterial('edge',
 *   'object'): die 6°-Naht glueht #FFB257, Staerke 1,2 (zu) → 2,4 (offen),
 *   Kante 0,004. Die Schnittflaechen selbst schimmern nur (faceGlow 0,006).
 * - Deckel zweistufig (Fix-Runde 3, lidOffset): Spalt n·0,3, dann n·2,6 + d·1,2 —
 *   aus dem Bild; o = stationPhases(a, b, reduced).open.
 * - Kantenlinie ~3,5 % Paper auf allen Blockkanten (Fix-Runde 3).
 * - Werkplatte 1,36 × 0,03 × 1,0 (Oberkante 1,03 = PLINTH.objectBaseY) mit
 *   CanvasTexture „Schneidematte“; Blob-Schatten 2,4 × 2,0 bei y 0,002.
 *
 * Geometrien, Platten-/Schatten-Material und die beiden CanvasTextures teilen
 * sich alle vier Sockel (PlinthKitProvider in Scene). Nur das Sockel-Material
 * ist pro Station eigen (eigene Uniforms, gleiches Programm).
 */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type RootState } from '@react-three/fiber';
import { COLORS, CUT_DIR, CUT_NORMAL, CUT_TAN } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { lerp, power2InOut, smoothstep } from '@/lib/scene/math';
import { CUT_LOCAL_NORMAL, PLINTH, STATIONS, stationPhases } from '@/lib/scene/stations';
import { frame, keepAlive, ui } from '@/lib/scene/store';
import { createCanvasTexture } from '@/lib/three/canvas-texture';
import { createCutUniforms, patchCutMaterial, type CutUniforms } from '@/lib/three/cut';
import { extrudePolygons, splitPolygons, type Vec2 } from '@/lib/three/split-extrude';

const BODY_ROUGHNESS = 0.82;
const GLOW_CLOSED = 1.2;
const GLOW_OPEN = 2.4;
const CUT_EDGE_WIDTH = 0.004;
/** Mindestbreite der gluehenden Naht in Bildpixeln (Anti-Aliasing) */
const SEAM_MIN_PX = 1.5;
/**
 * Abnahme 14.10.2026: Die Schnittflaechen selbst (1,6 × 1,2 m) gluehten voll und
 * dominierten mit Bloom jede Station. Jetzt bleiben sie Anthrazit mit leichtem
 * warmem Schimmer (Anteil des Gluehens); voll glueht nur die duenne 6°-Naht.
 * Fix-Runde 3: 0,02 → 0,006 — die offene Schnittflaeche unter der Werkplatte
 * wirkte braun (RGB 41/28/12); Orange nur noch an Naht und Kanten.
 */
const FACE_GLOW = 0.006;

/** Anteil von `open`, in dem sich nur der Spalt oeffnet; danach faehrt der Deckel weg. */
const LID_GAP_UNTIL = 0.35;
const LID_AWAY_FROM = 0.25;

/**
 * Deckel-Versatz (x, y) in der Frontebene, zweistufig (Fix-Runde 3): erst
 * n·lidGap (der Spalt glueht auf), dann n·lidLift + d·lidSlide — der Deckel
 * faehrt entlang der 6°-Linie aus dem Bild statt ueber dem Objekt zu haengen.
 */
function lidOffset(open: number): readonly [number, number] {
  const gap = smoothstep(0, LID_GAP_UNTIL, open);
  const away = power2InOut(smoothstep(LID_AWAY_FROM, 1, open));
  const lift = PLINTH.lidGap * gap + (PLINTH.lidLift - PLINTH.lidGap) * away;
  const slide = PLINTH.lidSlide * away;
  return [CUT_NORMAL[0] * lift + CUT_DIR[0] * slide, CUT_NORMAL[1] * lift + CUT_DIR[1] * slide];
}

/**
 * Kantenlinie (Fix-Runde 3): Der geschlossene Sockel war Anthrazit auf Ink, nur
 * die Naht sichtbar. Jetzt eine feine Linie auf allen Blockkanten, ~3,5 % Paper
 * (emissiv, im Objektraum: Abstand zur zweitnaechsten Blockflaeche).
 */
const EDGE_LINE = Object.freeze({ strength: 0.035, minWidth: 0.003 });
const EDGE_HEAD = /* glsl */ `
uniform vec3 uPmEdgeColor;
uniform float uPmEdge;
`;
const EDGE_EMISSIVE = /* glsl */ `
{
  vec3 pmD = vec3(
    ${(PLINTH.width / 2).toFixed(4)} - abs( vCutPos.x ),
    min( vCutPos.y, ${PLINTH.height.toFixed(4)} - vCutPos.y ),
    ${(PLINTH.depth / 2).toFixed(4)} - abs( vCutPos.z )
  );
  float pmLo = min( pmD.x, min( pmD.y, pmD.z ) );
  float pmHi = max( pmD.x, max( pmD.y, pmD.z ) );
  float pmMid = pmD.x + pmD.y + pmD.z - pmLo - pmHi;
  float pmW = max( fwidth( pmMid ) * 1.5, ${EDGE_LINE.minWidth.toFixed(4)} );
  totalEmissiveRadiance += uPmEdgeColor * ( uPmEdge * ( 1.0 - smoothstep( pmW * 0.5, pmW * 1.5, pmMid ) ) );
}
`;

const PLATE_CENTER_Y = PLINTH.plate.y + PLINTH.plate.h / 2;
const PLATE_ROUGHNESS = 0.7;
const MAT_TEXTURE = Object.freeze({ w: 1024, h: 768 });
const MAT_FINE_ALPHA = 0.08;
const MAT_COARSE_ALPHA = 0.16;
const MAT_LINE_ALPHA = 0.6;
const MAT_LINE_WIDTH_PX = 3;
const CM_PER_M = 100;

const BLOB = Object.freeze({ w: 2.4, d: 2.0, y: 0.002, opacity: 0.5, texture: 256 });

// ---------------------------------------------------------------------------
// Geteilte Ressourcen
// ---------------------------------------------------------------------------

export interface PlinthKit {
  readonly base: THREE.BufferGeometry;
  readonly lid: THREE.BufferGeometry;
  readonly plate: THREE.BoxGeometry;
  readonly blob: THREE.PlaneGeometry;
  readonly plateTexture: THREE.CanvasTexture;
  readonly blobTexture: THREE.CanvasTexture;
  readonly plateMaterial: THREE.MeshStandardMaterial;
  readonly blobMaterial: THREE.MeshBasicMaterial;
}

/** '#RRGGBB' (Marken-Token) → CSS rgba() fuer das 2D-Canvas. */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Linien im Abstand `step` px; jede fuenfte kraeftiger (5-cm-Raster). */
function drawMatGrid(ctx: CanvasRenderingContext2D, w: number, h: number, stepX: number, stepY: number): void {
  const fine = rgba(COLORS.paper, MAT_FINE_ALPHA);
  const coarse = rgba(COLORS.paper, MAT_COARSE_ALPHA);
  ctx.lineWidth = 1;
  for (let i = 0; i * stepX <= w; i++) {
    const x = Math.round(i * stepX) + 0.5;
    ctx.strokeStyle = i % 5 === 0 ? coarse : fine;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let j = 0; j * stepY <= h; j++) {
    const y = Math.round(j * stepY) + 0.5;
    ctx.strokeStyle = j % 5 === 0 ? coarse : fine;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** „Schneidematte“: Grund #2A2826, Raster 1 cm / 5 cm in Paper 8 % / 16 %, eine 6°-Linie #D17F0C 60 %. */
function drawCuttingMat(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COLORS.graphite;
  ctx.fillRect(0, 0, w, h);
  drawMatGrid(ctx, w, h, w / (PLINTH.plate.w * CM_PER_M), h / (PLINTH.plate.d * CM_PER_M));

  const rise = (CUT_TAN * w) / 2;
  ctx.strokeStyle = rgba(COLORS.brand, MAT_LINE_ALPHA);
  ctx.lineWidth = MAT_LINE_WIDTH_PX;
  ctx.beginPath();
  ctx.moveTo(0, h / 2 + rise);
  ctx.lineTo(w, h / 2 - rise);
  ctx.stroke();
}

/** Radialer Verlauf als Alpha-Maske (gruener Kanal): Mitte deckend, Rand 0. */
function drawBlob(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const r = Math.min(w, h) / 2;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, '#9a9a9a');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function createPlinthKit(): PlinthKit {
  const halfW = PLINTH.width / 2;
  const block: Vec2[] = [
    [-halfW, 0],
    [halfW, 0],
    [halfW, PLINTH.height],
    [-halfW, PLINTH.height],
  ];
  const { upper, lower } = splitPolygons([block], [0, PLINTH.cutY], CUT_NORMAL);
  const blob = new THREE.PlaneGeometry(BLOB.w, BLOB.d);
  blob.rotateX(-Math.PI / 2);
  const plateTexture = createCanvasTexture(MAT_TEXTURE.w, MAT_TEXTURE.h, drawCuttingMat);
  const blobTexture = createCanvasTexture(BLOB.texture, BLOB.texture, drawBlob, { srgb: false });

  return {
    base: extrudePolygons(lower, { depth: PLINTH.depth }),
    lid: extrudePolygons(upper, { depth: PLINTH.depth }),
    plate: new THREE.BoxGeometry(PLINTH.plate.w, PLINTH.plate.h, PLINTH.plate.d),
    blob,
    plateTexture,
    blobTexture,
    plateMaterial: new THREE.MeshStandardMaterial({ map: plateTexture, roughness: PLATE_ROUGHNESS, metalness: 0 }),
    blobMaterial: new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: blobTexture,
      transparent: true,
      opacity: BLOB.opacity,
      depthWrite: false,
    }),
  };
}

function disposePlinthKit(kit: PlinthKit): void {
  kit.base.dispose();
  kit.lid.dispose();
  kit.plate.dispose();
  kit.blob.dispose();
  kit.plateTexture.dispose();
  kit.blobTexture.dispose();
  kit.plateMaterial.dispose();
  kit.blobMaterial.dispose();
}

const PlinthKitContext = createContext<PlinthKit | null>(null);

/** Stellt allen Sockeln dieselben Geometrien, Texturen und Neben-Materialien bereit. */
export function PlinthKitProvider({ children }: { children: ReactNode }) {
  const kit = useMemo(() => createPlinthKit(), []);
  useEffect(() => () => disposePlinthKit(kit), [kit]);
  return <PlinthKitContext.Provider value={kit}>{children}</PlinthKitContext.Provider>;
}

/** Kit aus dem Provider; ohne Provider ein eigenes (z. B. in einer Sandbox). */
function usePlinthKit(): PlinthKit {
  const shared = useContext(PlinthKitContext);
  const own = useMemo(() => (shared ? null : createPlinthKit()), [shared]);
  useEffect(
    () => () => {
      if (own) disposePlinthKit(own);
    },
    [own],
  );
  return shared ?? (own as PlinthKit);
}

// ---------------------------------------------------------------------------
// Sockel pro Station
// ---------------------------------------------------------------------------

interface PlinthBody {
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: CutUniforms;
}

function createPlinthBody(): PlinthBody {
  const uniforms = createCutUniforms({
    uCutOrigin: [0, PLINTH.cutY, 0],
    uCutNormal: CUT_LOCAL_NORMAL,
    uCutEdge: CUT_EDGE_WIDTH,
    uCutGlowStrength: GLOW_CLOSED,
  });
  const material = new THREE.MeshStandardMaterial({ color: COLORS.anthracite, roughness: BODY_ROUGHNESS, metalness: 0 });
  patchCutMaterial(material, uniforms, {
    key: 'plinth-edgeline',
    mode: 'edge',
    space: 'object',
    faceGlow: FACE_GLOW,
    extra: {
      uniforms: {
        uPmEdgeColor: { value: new THREE.Color(COLORS.paper) },
        uPmEdge: { value: EDGE_LINE.strength },
      },
      fragmentHead: EDGE_HEAD,
      fragmentEmissive: EDGE_EMISSIVE,
    },
  });
  return { material, uniforms };
}

interface PlinthFrameState {
  open: number;
}

/**
 * Kantenbreite der Naht: Spec 0,004, aber mindestens SEAM_MIN_PX Bildpixel.
 * Sonst zerfaellt die geschlossene 6°-Naht aus einigen Metern Abstand in
 * Striche (Shading-Detail unter Pixelgroesse, MSAA hilft dort nicht).
 */
function seamEdgeWidth(id: StationId, state: RootState): number {
  const camera = state.camera;
  if (!(camera instanceof THREE.PerspectiveCamera)) return CUT_EDGE_WIDTH;
  const [x, , z] = STATIONS[id].position;
  const p = camera.position;
  const dist = Math.sqrt((p.x - x) ** 2 + (p.y - PLINTH.cutY) ** 2 + (p.z - z) ** 2);
  const pixels = Math.max(1, state.size.height * state.viewport.dpr);
  const pixelWorld = (2 * dist * Math.tan((camera.fov * THREE.MathUtils.DEG2RAD) / 2)) / pixels;
  return Math.max(CUT_EDGE_WIDTH, pixelWorld * SEAM_MIN_PX);
}

/** Deckel, Gluehen und Nahtbreite (nur sichtbare Stationen). Hot Path: Werte in-place. */
function stepPlinth(id: StationId, lid: THREE.Mesh | null, uniforms: CutUniforms, ps: PlinthFrameState, state: RootState): void {
  if (!lid || !frame.stationVisible[id]) return;
  uniforms.uCutEdge.value = seamEdgeWidth(id, state);
  const reduced = ui.get().motion === 'reduced';
  const { open } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
  if (open === ps.open) return;
  ps.open = open;
  const [x, y] = lidOffset(open);
  lid.position.set(x, y, 0);
  uniforms.uCutGlowStrength.value = lerp(GLOW_CLOSED, GLOW_OPEN, open);
  keepAlive();
}

interface PlinthProps {
  id: StationId;
}

export default function Plinth({ id }: PlinthProps) {
  const kit = usePlinthKit();
  const body = useMemo(() => createPlinthBody(), []);
  const lidRef = useRef<THREE.Mesh>(null);
  const stateRef = useRef<PlinthFrameState>({ open: -1 });

  useEffect(() => () => body.material.dispose(), [body]);

  useFrame((state) => stepPlinth(id, lidRef.current, body.uniforms, stateRef.current, state));

  return (
    <group name={`pm-plinth-${id}`}>
      <mesh geometry={kit.base} material={body.material} />
      <mesh ref={lidRef} geometry={kit.lid} material={body.material} />
      <mesh geometry={kit.plate} material={kit.plateMaterial} position={[0, PLATE_CENTER_Y, 0]} />
      <mesh geometry={kit.blob} material={kit.blobMaterial} position={[0, BLOB.y, 0]} />
    </group>
  );
}
