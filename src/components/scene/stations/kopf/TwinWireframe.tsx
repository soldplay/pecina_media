'use client';

/**
 * Station IV, Stretch (nur config.wireframe): Drahtgitter-Huelle am Zwilling.
 * Gleiche Geometrie wie die Bueste, um TWIN_OFFSET versetzt,
 * MeshBasicMaterial wireframe #D17F0C, Opacity smoothstep(0,7, 1, cut2) · 0,18.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { smoothstep } from '@/lib/scene/math';
import { stationPhases } from '@/lib/scene/stations';
import { frame } from '@/lib/scene/store';
import { TWIN_OFFSET } from './point-shaders';

interface TwinWireframeProps {
  id: StationId;
  reduced: boolean;
  /** Geometrie der Bueste (gehoert dem GLTF-Cache, nicht disposen) */
  geometry: THREE.BufferGeometry;
  /** Mesh → Station-lokal (wie beim Punkt-Sampling) */
  bake: THREE.Matrix4;
}

/**
 * Spec: 0,18. Bei 16 000 Dreiecken ueberlagern sich die Kanten so dicht, dass
 * die Huelle bei 0,18 flaechig orange wirkt und den Punktzwilling verdeckt
 * (in der Dev-Pruefung gesehen); 0,08 laesst die Punkte durchscheinen.
 */
const MAX_OPACITY = 0.08;

interface Pose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
}

function twinPose(bake: THREE.Matrix4): Pose {
  const m = new THREE.Matrix4().makeTranslation(TWIN_OFFSET[0], TWIN_OFFSET[1], TWIN_OFFSET[2]).multiply(bake);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

function applyWire(material: THREE.MeshBasicMaterial, cut2: number, reduced: boolean): void {
  material.opacity = (reduced ? 1 : smoothstep(0.7, 1, cut2)) * MAX_OPACITY;
  material.visible = material.opacity > 0.001;
}

export default function TwinWireframe({ id, reduced, geometry, bake }: TwinWireframeProps) {
  const pose = useMemo(() => twinPose(bake), [bake]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: COLORS.brand,
        wireframe: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        visible: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const { cut2 } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
    applyWire(material, cut2, reduced);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={pose.position}
      quaternion={pose.quaternion}
      scale={pose.scale}
    />
  );
}
