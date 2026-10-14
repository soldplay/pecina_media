'use client';

/**
 * Station III – Papier (05 · 06), Paket P4. Station-lokale Koordinaten
 * (Ursprung Sockelmitte am Boden, +z Front); Gruppe, Sockel, Licht und Kamera
 * gehoeren P1. DESIGN_SPEC §3.3.3, docs/build/P4.md.
 *
 * - Notizbloecke (office_notepads, Skala 1, Knoten unveraendert)
 * - Schnitt 1: oberster Bogen, Kritzel wird Satz (TopSheet)
 * - Schnitt 2: Bleisatz ordnet sich zu MEDIA (LeadType), Abzug (ProofStrip)
 * - Stretch: Wickelfalz-Flyer (FoldFlyer)
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { MODELS } from '@/lib/scene/assets';
import { PLINTH } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import type { StationContentProps } from '@/types/contracts';
import FoldFlyer from './papier/FoldFlyer';
import LeadType, { type PadObstacle } from './papier/LeadType';
import ProofStrip from './papier/ProofStrip';
import TopSheet, { type LightUniform } from './papier/TopSheet';

/** Werkplatte + 1 mm gegen Z-Fighting mit der Platte. */
const NOTEPADS_Y = PLINTH.objectBaseY + 0.001;
/** Modell ist bereits 1,1 × 0,66 m (ASSETS.md), Skala 1. */
const NOTEPADS_SCALE = 1;
/** Knoten, die hoeher als 2 mm sind, gelten fuer die Lettern als Hindernis. */
const TALL_NODE = 0.002;
/** Lichtrichtung der Papier-Shader (Station-lokal, von oben rechts vorn). */
const LIGHT_LOCAL: readonly [number, number, number] = [0.45, 0.75, 0.5];
const MOUNT_KEEP_ALIVE_MS = 300;

/**
 * Fix-Runde 3: Die zitronengelben Bloecke und Haftnotizen aus office_notepads
 * bissen sich mit #D17F0C (einzige Fremdfarbe der Seite). Alle Knoten teilen
 * einen Textur-Atlas, deshalb faerbt ein Shader-Zusatz nur die gelben Texel um
 * (Farbton linear 32–70°, Saettigung > 0,4; Gelb liegt linear bei 40–50°):
 * grosser Block → Paper-2 #EAE5DA, Haftnotizen → Marke #D17F0C. Linien und
 * Schattierung bleiben (Helligkeit relativ zum Atlas-Gelb, linear ~0,62).
 */
const RECOLOR = Object.freeze({
  /** Knotenname enthaelt … → Zielfarbe */
  groups: Object.freeze([
    Object.freeze({ match: 'yellow', color: '#EAE5DA' }),
    Object.freeze({ match: 'sticky', color: '#D17F0C' }),
  ]),
  /** lineare Luminanz des Atlas-Gelbs (238/204/85) */
  referenceLuminance: 0.62,
});

const RECOLOR_FRAGMENT = /* glsl */ `
{
  vec3 pmC = diffuseColor.rgb;
  float pmMax = max( pmC.r, max( pmC.g, pmC.b ) );
  float pmMin = min( pmC.r, min( pmC.g, pmC.b ) );
  float pmChroma = pmMax - pmMin;
  float pmSat = pmMax > 1e-4 ? pmChroma / pmMax : 0.0;
  float pmHue = 0.0;
  if ( pmChroma > 1e-5 && pmMax == pmC.r ) pmHue = 60.0 * ( pmC.g - pmC.b ) / pmChroma;
  else if ( pmChroma > 1e-5 && pmMax == pmC.g ) pmHue = 60.0 * ( ( pmC.b - pmC.r ) / pmChroma + 2.0 );
  float pmMask = smoothstep( 0.3, 0.45, pmSat ) * smoothstep( 28.0, 34.0, pmHue ) * ( 1.0 - smoothstep( 66.0, 74.0, pmHue ) );
  float pmLum = dot( pmC, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( pmC, uPmTint * ( pmLum / ${RECOLOR.referenceLuminance.toFixed(3)} ), pmMask );
}
`;

/** Klon mit Farbton-Umfaerbung (MeshStandardMaterial des Atlas). */
function recolorMaterial(source: THREE.Material, hex: string): THREE.Material {
  const copy = source.clone();
  if (!(copy instanceof THREE.MeshStandardMaterial)) return copy;
  const tint = { value: new THREE.Color(hex) };
  copy.onBeforeCompile = (shader) => {
    shader.uniforms.uPmTint = tint;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', () => '#include <common>\nuniform vec3 uPmTint;')
      .replace('#include <map_fragment>', () => `#include <map_fragment>\n${RECOLOR_FRAGMENT}`);
  };
  copy.customProgramCacheKey = () => 'papier-notepads-recolor';
  copy.needsUpdate = true;
  return copy;
}

function recolorFor(name: string): string | null {
  const lower = name.toLowerCase();
  return RECOLOR.groups.find((g) => lower.includes(g.match))?.color ?? null;
}

interface PreparedPads {
  readonly scene: THREE.Object3D;
  readonly materials: readonly THREE.Material[];
  readonly obstacles: readonly PadObstacle[];
}

/**
 * Klont den gecachten GLTF-Graphen (Geometrien geteilt, Materialien
 * geklont, gelbe Knoten umgefaerbt) und liest die Hoehen der Knoten fuer die
 * Lettern-Auflage.
 */
function preparePads(source: THREE.Object3D): PreparedPads {
  const scene = source.clone(true);
  const clones = new Map<string, THREE.Material>();
  const cloneFor = (m: THREE.Material, tint: string | null): THREE.Material => {
    const key = `${m.uuid}|${tint ?? ''}`;
    const existing = clones.get(key);
    if (existing) return existing;
    const copy = tint ? recolorMaterial(m, tint) : m.clone();
    clones.set(key, copy);
    return copy;
  };
  const obstacles: PadObstacle[] = [];
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const tint = recolorFor(obj.name);
    const cloneOnce = (m: THREE.Material): THREE.Material => cloneFor(m, tint);
    obj.material = Array.isArray(obj.material) ? obj.material.map(cloneOnce) : cloneOnce(obj.material);
    const geometry: THREE.BufferGeometry = obj.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    box.copy(geometry.boundingBox).applyMatrix4(obj.matrixWorld);
    if (box.max.y - box.min.y <= TALL_NODE) return;
    obstacles.push({
      minX: box.min.x * NOTEPADS_SCALE,
      maxX: box.max.x * NOTEPADS_SCALE,
      minZ: box.min.z * NOTEPADS_SCALE,
      maxZ: box.max.z * NOTEPADS_SCALE,
      top: NOTEPADS_Y + box.max.y * NOTEPADS_SCALE,
    });
  });
  return { scene, materials: [...clones.values()], obstacles };
}

/** Lichtrichtung Station-lokal → Welt (Uniform-Objekt, Hot Path). */
function updateLight(light: LightUniform, root: THREE.Object3D): void {
  root.updateWorldMatrix(true, false);
  light.value.set(LIGHT_LOCAL[0], LIGHT_LOCAL[1], LIGHT_LOCAL[2]).transformDirection(root.matrixWorld);
}

export default function StationPapier({ id, config, reduced }: StationContentProps) {
  const gltf = useGLTF(MODELS.notepads.url, false, true);
  const pads = useMemo(() => preparePads(gltf.scene), [gltf.scene]);
  const light = useMemo<LightUniform>(
    () => ({ value: new THREE.Vector3(LIGHT_LOCAL[0], LIGHT_LOCAL[1], LIGHT_LOCAL[2]).normalize() }),
    [],
  );
  const rootRef = useRef<THREE.Group>(null);

  useEffect(() => () => pads.materials.forEach((m) => m.dispose()), [pads]);

  // Nach Mount, Tier- oder Bewegungswechsel einen Frame anfordern (Demand-Loop).
  useEffect(() => {
    keepAlive(MOUNT_KEEP_ALIVE_MS);
  }, [reduced, config]);

  useFrame(() => {
    const root = rootRef.current;
    if (!frame.stationVisible[id] || !root) return;
    updateLight(light, root);
  });

  return (
    <group ref={rootRef}>
      <primitive object={pads.scene} position={[0, NOTEPADS_Y, 0]} scale={NOTEPADS_SCALE} />
      <TopSheet id={id} reduced={reduced} light={light} />
      <LeadType id={id} reduced={reduced} count={config.leadType} baseY={NOTEPADS_Y} obstacles={pads.obstacles} />
      <ProofStrip id={id} reduced={reduced} light={light} />
      {config.stretch && <FoldFlyer id={id} reduced={reduced} light={light} />}
    </group>
  );
}
