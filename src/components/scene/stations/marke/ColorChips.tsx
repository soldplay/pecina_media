'use client';

/**
 * Station I – Marke: drei Farbchips (Ink, Orange, Paper) blenden nach dem
 * ersten Schnitt ein (cut1 0,85 → 1, Stagger 0,05) und fallen dabei 12 mm auf
 * die Werkplatte (DESIGN_SPEC §3.3.1). Nicht auf Compact (StationMarke).
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { StationId } from '@/lib/scene/ids';
import { smoothstep } from '@/lib/scene/math';
import { PLINTH, STATIONS, stationPhases } from '@/lib/scene/stations';
import { frame, keepAlive } from '@/lib/scene/store';
import { chipUvRect, type UvRect } from './textures';

const CHIPS = Object.freeze({
  width: 0.12,
  depth: 0.075,
  x: [0.18, 0.32, 0.46] as const,
  z: -0.28,
  /** leicht verdreht wie hingelegt (rad) */
  yaw: [0.05, -0.035, 0.07] as const,
  /** 1,2 mm ueber der Platte gegen z-Fighting */
  y: PLINTH.objectBaseY + 0.0012,
  fadeStart: 0.85,
  fadeSpan: 0.05,
  stagger: 0.05,
  drop: 0.012,
  roughness: 0.62,
});

const VISIBLE_EPS = 0.001;

function chipGeometry(rect: UvRect): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(CHIPS.width, CHIPS.depth);
  geometry.rotateX(-Math.PI / 2);
  const uv = geometry.getAttribute('uv');
  const [u0, v0, u1, v1] = rect;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Atlas setzen (map wechselt null ↔ Textur → Programm neu bauen). */
function applyChipMap(materials: readonly THREE.MeshStandardMaterial[], atlas: THREE.Texture | null): void {
  materials.forEach((m) => {
    m.map = atlas;
    m.needsUpdate = true;
  });
}

function applyChip(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, o: number): void {
  material.opacity = o;
  mesh.visible = o > VISIBLE_EPS;
  mesh.position.y = CHIPS.y + CHIPS.drop * (1 - o) * (1 - o);
}

function chipOpacity(index: number, cut1: number): number {
  const start = CHIPS.fadeStart + index * CHIPS.stagger;
  return smoothstep(start, start + CHIPS.fadeSpan, cut1);
}

interface ColorChipsProps {
  id: StationId;
  reduced: boolean;
  /** Werkzeug-Atlas aus StationMarke (null, solange die Fonts laden) */
  atlas: THREE.Texture | null;
}

export default function ColorChips({ id, reduced, atlas }: ColorChipsProps) {
  const geometries = useMemo(() => CHIPS.x.map((_, i) => chipGeometry(chipUvRect(i))), []);
  const materials = useMemo(
    () =>
      CHIPS.x.map(
        () =>
          new THREE.MeshStandardMaterial({
            transparent: true,
            opacity: 0,
            roughness: CHIPS.roughness,
            metalness: 0,
            depthWrite: false,
          }),
      ),
    [],
  );
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const last = useRef(Number.NaN);

  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
    [geometries, materials],
  );

  useEffect(() => {
    applyChipMap(materials, atlas);
    last.current = Number.NaN;
    keepAlive();
  }, [materials, atlas]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const [beatA, beatB] = STATIONS[id].beats;
    // Reduced: cut1 = 1 → alle Chips sichtbar
    const { cut1 } = stationPhases(frame.beats[beatA], frame.beats[beatB], reduced);
    // Ohne Atlas (Fonts laden noch) bleiben die Chips unsichtbar statt weiss.
    const value = atlas ? cut1 : 0;
    if (value === last.current) return;
    last.current = value;
    meshes.current.forEach((mesh, i) => {
      if (mesh) applyChip(mesh, materials[i], chipOpacity(i, value));
    });
    keepAlive();
  });

  return (
    <group>
      {CHIPS.x.map((x, i) => (
        <mesh
          key={x}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geometries[i]}
          material={materials[i]}
          position={[x, CHIPS.y, CHIPS.z]}
          rotation-y={CHIPS.yaw[i]}
          visible={false}
        />
      ))}
    </group>
  );
}
