'use client';

/**
 * Studio (DESIGN_SPEC §5.2): Boden „Schneidematte“ und Environment.
 * Hintergrund und Fog setzt Scene in onCreated.
 *
 * Environment: High → HDRI (einziger Asset-Download der Szene ausser den GLBs),
 * sonst drei Lightformer in einer einmal gerenderten Cube-Map (kein Download,
 * keine drei-Presets). Eigene Suspense-Grenze, damit das HDRI den Rest der
 * Szene nicht blockiert.
 */

import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { HDRI } from '@/lib/scene/assets';
import { frame } from '@/lib/scene/store';
import { lerp } from '@/lib/scene/math';
import type { TierConfig } from '@/lib/scene/tiers';
import { createFloorMaterial, FLOOR, FLOOR_NOISE_MAX, setFloorNoise } from './floor-material';

const HDRI_INTENSITY = 0.35;
const LIGHTFORMER_RESOLUTION = 128;
const LIGHTFORMER_WARM = '#FFE2B8';
const LIGHTFORMER_COOL = '#DDE6F0';

/**
 * Lightformer-Set (Mid/Compact). Modul-Konstante: stabile children, damit
 * Environment die Cube-Map nicht bei jedem Render neu zeichnet.
 * Ohne Rotation richten sich Lightformer auf den Ursprung aus.
 */
const LIGHTFORMERS = (
  <>
    <Lightformer form="rect" intensity={2} position={[0, 5, 0]} scale={[4, 1, 1]} />
    <Lightformer form="rect" color={LIGHTFORMER_WARM} intensity={0.6} position={[-5, 1.6, 1]} scale={[3, 2, 1]} />
    <Lightformer form="rect" color={LIGHTFORMER_COOL} intensity={0.6} position={[5, 1.6, 1]} scale={[3, 2, 1]} />
  </>
);

function Floor() {
  const geometry = useMemo(() => new THREE.PlaneGeometry(FLOOR.width, FLOOR.length), []);
  const material = useMemo(() => createFloorMaterial(), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    setFloorNoise(material, lerp(FLOOR_NOISE_MAX, 0, frame.sections.start));
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation-x={-Math.PI / 2}
      position={[0, 0, FLOOR.centerZ]}
      name="pm-floor"
    />
  );
}

interface StudioProps {
  config: TierConfig;
}

export default function Studio({ config }: StudioProps) {
  return (
    <>
      <Floor />
      <Suspense fallback={null}>
        {config.hdri ? (
          <Environment files={HDRI.studio.url} environmentIntensity={HDRI_INTENSITY} />
        ) : (
          <Environment resolution={LIGHTFORMER_RESOLUTION} frames={1}>
            {LIGHTFORMERS}
          </Environment>
        )}
      </Suspense>
    </>
  );
}
