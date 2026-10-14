'use client';

/**
 * Station IV: Marmorbueste mit Dissolve-Schnitt (DESIGN_SPEC §3.3.4).
 * patchCutMaterial(mode 'dissolve', space 'world', Rauschen 0,03, Gluehen
 * #FFB257 Staerke 3). Die Ebene setzt StationKopf pro Frame in die geteilten
 * Uniforms; BustPoints nutzt dieselben Uniform-Objekte.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { patchCutMaterial, type CutUniforms } from '@/lib/three/cut';

export interface BustPlacement {
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly scale: number;
}

interface BustCutProps {
  /** gecachter GLTF-Graph (wird geklont, nicht veraendert) */
  scene: THREE.Object3D;
  cut: CutUniforms;
  placement: BustPlacement;
}

interface DissolvableModel {
  readonly root: THREE.Object3D;
  readonly materials: readonly THREE.Material[];
}

/** Klont den Graphen und patcht je Mesh ein geklontes Standard-Material. */
function cloneDissolvable(scene: THREE.Object3D, cut: CutUniforms): DissolvableModel {
  const root = scene.clone(true);
  const clones = new Map<THREE.Material, THREE.Material>();
  const patch = (m: THREE.Material): THREE.Material => {
    const existing = clones.get(m);
    if (existing) return existing;
    const copy = m.clone();
    if (copy instanceof THREE.MeshStandardMaterial) {
      patchCutMaterial(copy, cut, { key: 'p4-bust', mode: 'dissolve', space: 'world', keep: 'positive' });
    }
    clones.set(m, copy);
    return copy;
  };
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.material = Array.isArray(obj.material) ? obj.material.map(patch) : patch(obj.material);
  });
  return { root, materials: [...clones.values()] };
}

export default function BustCut({ scene, cut, placement }: BustCutProps) {
  const model = useMemo(() => cloneDissolvable(scene, cut), [scene, cut]);

  useEffect(() => () => model.materials.forEach((m) => m.dispose()), [model]);

  const [x, y, z] = placement.position;
  return (
    <group position={[x, y, z]} rotation={[0, placement.rotationY, 0]} scale={placement.scale}>
      <primitive object={model.root} />
    </group>
  );
}
