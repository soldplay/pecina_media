'use client';

/**
 * Station I – Marke, Schnitt 2 (Leistung 02, MVP): Skizzenbogen, Stahllineal
 * und Cutter (DESIGN_SPEC §3.3.1). Der Cutter senkt sich, faehrt die 6°-Linie
 * durch die Bogenmitte ab (cut2), die Kante glueht nur bis zur Klinge; danach
 * hebt er ab und die obere Haelfte rutscht als „Logo-Versatz“ weg.
 *
 * Koordinaten Station-lokal. Rahmen:
 *   Bogen-Rahmen  Position (0,12 | 1,034 | 0,16), rotY −0,12, y = Bogenoberflaeche
 *   Linien-Rahmen im Bogen-Rahmen um +6° gedreht: x = Schnittrichtung,
 *                 −z = „hinter der Linie“ (Seite der oberen Haelfte)
 * Der Bogen wird im Objektraum geschnitten (PlaneGeometry-Koordinaten).
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { COLORS, CUT_COS, CUT_RAD, CUT_SIN, FONT_VARS } from '@/lib/brand';
import { COPY } from '@/content/site';
import type { StationId } from '@/lib/scene/ids';
import { lerp, smoothstep } from '@/lib/scene/math';
import { STATIONS, stationPhases, type Vec3Tuple } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { createCutUniforms, patchCutMaterial, type CutUniforms } from '@/lib/three/cut';
import { resolveFontFamily, useCanvasTexture } from '@/lib/three/canvas-texture';
import { cutGlowEnvelope } from './SprayCans';
import { RULER_STEEL, RULER_UV, SKETCH_TEXTURE, drawSketch, sketchFontSpec, type UvRect } from './textures';

const SHEET = Object.freeze({
  width: 0.36,
  height: 0.255,
  position: [0.12, 1.034, 0.16] as Vec3Tuple,
  rotY: -0.12,
  roughness: 0.92,
});

const CUT = Object.freeze({
  /** Kante im Objektraum (Bogen), schmaler als an den Dosen */
  edge: 0.003,
  glowStrength: 3,
  /** halbe Laenge der 6°-Linie durch die Bogenmitte bis zum Bogenrand */
  halfLength: SHEET.width / 2 / CUT_COS,
});

/** Versatz der oberen Haelfte: entlang der Linie, senkrecht dazu in der Bogenebene, hoch. */
const SEP = Object.freeze({ along: 0.03, perpendicular: 0.012, up: 0.004, beat: [0.75, 1] as const });

const RULER = Object.freeze({
  size: [0.5, 0.005, 0.032] as Vec3Tuple,
  /** Mitte 0,017 hinter der Schnittlinie */
  behind: 0.017,
  /** Abstand zur Bogenoberflaeche gegen z-Fighting */
  gap: 0.0004,
  metalness: 1,
  roughness: 0.28,
});

const CUTTER = Object.freeze({
  tilt: (35 * Math.PI) / 180,
  handle: [0.13, 0.02, 0.026] as Vec3Tuple,
  handleRadius: 0.006,
  handleRoughness: 0.45,
  /** Griff seitlich vor der Linie, die Klinge liegt in der Schnittebene (z = 0) */
  handleSide: 0.014,
  slider: [0.024, 0.005, 0.012] as Vec3Tuple,
  sliderX: -0.04,
  bladeColor: '#D6D9DC',
  bladeRoughness: 0.2,
  /** abgehoben vor und nach dem Schnitt */
  lift: 0.04,
  lowerBeat: [0.1, 0.2] as const,
  raiseBeat: [0.8, 0.9] as const,
  /** Spitze sticht beim Schneiden knapp unter die Bogenoberflaeche */
  pierce: 0.0008,
});

/** Klinge (Trapez, 0,035 lang) im Griff-Rahmen: x zur Spitze, y nach oben. */
const BLADE_POINTS: readonly (readonly [number, number])[] = [
  [-0.006, 0.005],
  [0.022, 0.005],
  [0.035, -0.004],
  [-0.006, -0.004],
];
const BLADE_TIP = BLADE_POINTS[2];

/** Spitze nach der Neigung (−35° um z); die Cutter-Gruppe wird um sie verschoben. */
const TIP_AFTER_TILT = Object.freeze([
  BLADE_TIP[0] * Math.cos(-CUTTER.tilt) - BLADE_TIP[1] * Math.sin(-CUTTER.tilt),
  BLADE_TIP[0] * Math.sin(-CUTTER.tilt) + BLADE_TIP[1] * Math.cos(-CUTTER.tilt),
] as const);

/** Versatz der oberen Haelfte im Bogen-Rahmen (x rechts, y oben, −z hinten). */
const SEP_OFFSET = new THREE.Vector3(
  SEP.along * CUT_COS - SEP.perpendicular * CUT_SIN,
  SEP.up,
  -SEP.along * CUT_SIN - SEP.perpendicular * CUT_COS,
);

const WHITE = '#FFFFFF';

// ---------------------------------------------------------------------------
// Rig: Geometrien, Materialien, Uniforms
// ---------------------------------------------------------------------------

interface SheetRig {
  readonly sheetGeometry: THREE.PlaneGeometry;
  readonly upper: THREE.MeshStandardMaterial;
  readonly lower: THREE.MeshStandardMaterial;
  readonly uniforms: CutUniforms;
  readonly rulerGeometry: THREE.BoxGeometry;
  readonly ruler: THREE.MeshStandardMaterial;
  readonly bladeShape: THREE.Shape;
}

function remapUv(geometry: THREE.BufferGeometry, [u0, v0, u1, v1]: UvRect): void {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
}

function createSheetRig(): SheetRig {
  const uniforms = createCutUniforms({
    uCutOrigin: [0, 0, 0],
    uCutNormal: [-CUT_SIN, CUT_COS, 0],
    uCutEdge: CUT.edge,
    uCutGlowStrength: 0,
    uCutAlongDir: [CUT_COS, CUT_SIN, 0],
    uCutAlongRange: [-CUT.halfLength, CUT.halfLength],
    uCutProgress: 0,
  });
  const upper = new THREE.MeshStandardMaterial({ color: COLORS.paper, roughness: SHEET.roughness });
  const lower = new THREE.MeshStandardMaterial({ color: COLORS.paper, roughness: SHEET.roughness });
  patchCutMaterial(upper, uniforms, { key: 'marke-sheet', mode: 'clip', space: 'object', keep: 'positive' });
  patchCutMaterial(lower, uniforms, { key: 'marke-sheet', mode: 'clip', space: 'object', keep: 'negative' });

  const rulerGeometry = new THREE.BoxGeometry(...RULER.size);
  remapUv(rulerGeometry, RULER_UV);
  const ruler = new THREE.MeshStandardMaterial({
    color: RULER_STEEL,
    metalness: RULER.metalness,
    roughness: RULER.roughness,
  });

  const bladeShape = new THREE.Shape(BLADE_POINTS.map(([x, y]) => new THREE.Vector2(x, y)));

  return {
    sheetGeometry: new THREE.PlaneGeometry(SHEET.width, SHEET.height),
    upper,
    lower,
    uniforms,
    rulerGeometry,
    ruler,
    bladeShape,
  };
}

function disposeSheetRig(rig: SheetRig): void {
  rig.sheetGeometry.dispose();
  rig.upper.dispose();
  rig.lower.dispose();
  rig.rulerGeometry.dispose();
  rig.ruler.dispose();
}

/** Texturen setzen; map null ↔ Textur aendert die Defines → needsUpdate. */
function applySheetMaps(rig: SheetRig, sketch: THREE.Texture | null, atlas: THREE.Texture | null): void {
  [rig.upper, rig.lower].forEach((m) => {
    m.map = sketch;
    m.color.set(sketch ? WHITE : COLORS.paper);
    m.needsUpdate = true;
  });
  rig.ruler.map = atlas;
  rig.ruler.color.set(atlas ? WHITE : RULER_STEEL);
  rig.ruler.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Laufzeit
// ---------------------------------------------------------------------------

interface SheetState {
  cut2: number;
  sep: number;
  lift: number;
  glow: number;
}

function cutterLift(b: number): number {
  const lowered = 1 - smoothstep(CUTTER.lowerBeat[0], CUTTER.lowerBeat[1], b);
  const raised = smoothstep(CUTTER.raiseBeat[0], CUTTER.raiseBeat[1], b);
  return CUTTER.lift * Math.max(lowered, raised);
}

/** Hot Path: Uniforms und Object3D-Transformationen werden bewusst in-place gesetzt. */
function applySheetState(rig: SheetRig, upper: THREE.Object3D, cutter: THREE.Object3D, s: SheetState): void {
  rig.uniforms.uCutProgress.value = s.cut2;
  rig.uniforms.uCutGlowStrength.value = s.glow;
  upper.position.copy(SEP_OFFSET).multiplyScalar(s.sep);
  const pierce = s.lift > 0 ? 0 : CUTTER.pierce;
  cutter.position.set(lerp(-CUT.halfLength, CUT.halfLength, s.cut2), s.lift - pierce, 0);
}

function sameState(a: SheetState, b: SheetState): boolean {
  return a.cut2 === b.cut2 && a.sep === b.sep && a.lift === b.lift && a.glow === b.glow;
}

function CutterModel({ bladeShape }: { bladeShape: THREE.Shape }) {
  const [hx, hy, hz] = CUTTER.handle;
  const [sx, sy, sz] = CUTTER.slider;
  return (
    <group position={[-TIP_AFTER_TILT[0], -TIP_AFTER_TILT[1], 0]}>
      <group rotation-z={-CUTTER.tilt}>
        <RoundedBox
          args={[hx, hy, hz]}
          radius={CUTTER.handleRadius}
          smoothness={3}
          position={[-hx / 2, 0, CUTTER.handleSide]}
        >
          <meshStandardMaterial color={COLORS.brand} roughness={CUTTER.handleRoughness} />
        </RoundedBox>
        <mesh position={[CUTTER.sliderX, hy / 2 + sy / 2, CUTTER.handleSide]}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial color={COLORS.ink} roughness={0.5} />
        </mesh>
        <mesh>
          <shapeGeometry args={[bladeShape]} />
          <meshStandardMaterial
            color={CUTTER.bladeColor}
            metalness={1}
            roughness={CUTTER.bladeRoughness}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

interface CutterSheetProps {
  id: StationId;
  reduced: boolean;
  /** Werkzeug-Atlas aus StationMarke (Lineal-Skala), null solange die Fonts laden */
  atlas: THREE.Texture | null;
}

export default function CutterSheet({ id, reduced, atlas }: CutterSheetProps) {
  const rig = useMemo(() => createSheetRig(), []);
  const round = useMemo(() => resolveFontFamily(FONT_VARS.round), []);
  const sketch = useCanvasTexture(
    SKETCH_TEXTURE.width,
    SKETCH_TEXTURE.height,
    (ctx, w, h) => drawSketch(ctx, w, h, { family: round, label: COPY.scene3d.sketchLabel }),
    [round],
    [sketchFontSpec(round)],
  );
  const upperRef = useRef<THREE.Group>(null);
  const cutterRef = useRef<THREE.Group>(null);
  const last = useRef<SheetState>({ cut2: Number.NaN, sep: Number.NaN, lift: Number.NaN, glow: Number.NaN });

  useEffect(() => () => disposeSheetRig(rig), [rig]);

  useEffect(() => {
    applySheetMaps(rig, sketch, atlas);
    keepAlive();
  }, [rig, sketch, atlas]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const upper = upperRef.current;
    const cutter = cutterRef.current;
    if (!upper || !cutter) return;
    const [beatA, beatB] = STATIONS[id].beats;
    const b = frame.beats[beatB];
    // Reduced: cut2 = 1, Haelften versetzt, Cutter abgehoben am Linienende
    const { cut2 } = stationPhases(frame.beats[beatA], b, reduced);
    const next: SheetState = {
      cut2,
      sep: reduced ? 1 : smoothstep(SEP.beat[0], SEP.beat[1], b),
      lift: reduced ? CUTTER.lift : cutterLift(b),
      glow: CUT.glowStrength * cutGlowEnvelope(cut2),
    };
    if (sameState(last.current, next)) return;
    last.current = next;
    applySheetState(rig, upper, cutter, next);
    keepAlive();
  });

  const rulerY = RULER.size[1] / 2 + RULER.gap;

  return (
    <group position={[...SHEET.position]} rotation-y={SHEET.rotY}>
      <mesh geometry={rig.sheetGeometry} material={rig.lower} rotation-x={-Math.PI / 2} />
      <group ref={upperRef}>
        <mesh geometry={rig.sheetGeometry} material={rig.upper} rotation-x={-Math.PI / 2} />
        <group rotation-y={CUT_RAD}>
          <mesh geometry={rig.rulerGeometry} material={rig.ruler} position={[0, rulerY, -RULER.behind]} />
        </group>
      </group>
      <group rotation-y={CUT_RAD}>
        {/* Position setzt ausschliesslich useFrame (kein JSX-Prop, der sie zuruecksetzen koennte) */}
        <group ref={cutterRef}>
          <CutterModel bladeShape={rig.bladeShape} />
        </group>
      </group>
    </group>
  );
}
