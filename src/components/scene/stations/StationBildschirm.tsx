'use client';

/**
 * Station II – Bildschirm (Leistungen 03 · 04), DESIGN_SPEC §3.3.2.
 *
 * Inhalt im Werkfuge-Sockel, Station-lokale Koordinaten (Ursprung =
 * Sockelmitte am Boden, +z = Front). Gruppe, Sockel, Licht und Kamera
 * gehoeren P1; diese Station fuegt keine Lichter hinzu.
 *
 *   Schnitt 1 + 2 (03, 04): LaptopScreen (Bildschirm-Shader + Gehaeuse)
 *   Stretch:                SocialCards (config.stretch, Anzahl config.socialCards)
 *
 * Die eigene Wurzelgruppe hat die Identitaetstransformation; ihr matrixWorld
 * ist daher der Station-Rahmen fuer setCutPlaneFromObject.
 */

import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { MODELS } from '@/lib/scene/assets';
import type { Vec3Tuple } from '@/lib/scene/stations';
import type { StationContentProps } from '@/types/contracts';
import LaptopScreen from './bildschirm/LaptopScreen';
import SocialCards from './bildschirm/SocialCards';
import { screenCenterLocal } from './bildschirm/screen-material';

export default function StationBildschirm({ id, config, reduced }: StationContentProps) {
  const rootRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(MODELS.laptop.url, false, true);
  const origin = useMemo<Vec3Tuple>(() => screenCenterLocal(scene), [scene]);
  const cards = config.stretch ? config.socialCards : 0;

  return (
    <group ref={rootRef}>
      <LaptopScreen id={id} reduced={reduced} frameRef={rootRef} source={scene} />
      {cards > 0 && <SocialCards key={cards} id={id} reduced={reduced} count={cards} origin={origin} />}
    </group>
  );
}
