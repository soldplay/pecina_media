'use client';

/**
 * Station I – Marke (Leistungen 01 · 02), DESIGN_SPEC §3.3.1.
 *
 * Inhalt im Werkfuge-Sockel, Station-lokale Koordinaten (Ursprung =
 * Sockelmitte am Boden, +z = Front). Gruppe, Sockel, Licht und Kamera
 * gehoeren P1; diese Station fuegt keine Lichter hinzu.
 *
 *   Schnitt 1 (01): SprayCans + ColorChips (Chips nicht auf Compact)
 *   Schnitt 2 (02): CutterSheet
 *   Stretch:        SprayParticles (config.stretch, config.spray > 0, nicht Compact)
 *
 * Die eigene Wurzelgruppe hat die Identitaetstransformation; ihr matrixWorld
 * ist daher der Station-Rahmen fuer setCutPlaneFromObject.
 */

import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { FONT_VARS } from '@/lib/brand';
import { COPY } from '@/content/site';
import { MODELS } from '@/lib/scene/assets';
import { useUi } from '@/lib/scene/store';
import { resolveFontFamily, useCanvasTexture } from '@/lib/three/canvas-texture';
import type { StationContentProps } from '@/types/contracts';
import ColorChips from './marke/ColorChips';
import CutterSheet from './marke/CutterSheet';
import SprayCans, { canNozzleLocal } from './marke/SprayCans';
import SprayParticles from './marke/SprayParticles';
import { TOOL_ATLAS, drawToolAtlas, toolAtlasFontSpec } from './marke/textures';

export default function StationMarke({ id, config, reduced }: StationContentProps) {
  const rootRef = useRef<THREE.Group>(null);
  const compact = useUi((s) => s.compact);
  const { scene } = useGLTF(MODELS.spray.url, false, true);
  const nozzle = useMemo(() => canNozzleLocal(scene), [scene]);
  const display = useMemo(() => resolveFontFamily(FONT_VARS.display), []);
  const atlas = useCanvasTexture(
    TOOL_ATLAS.width,
    TOOL_ATLAS.height,
    (ctx, w, h) => drawToolAtlas(ctx, w, h, { family: display, swatches: COPY.scene3d.swatches }),
    [display],
    [toolAtlasFontSpec(display)],
  );
  const showSpray = config.stretch && config.spray > 0 && !compact;

  return (
    <group ref={rootRef}>
      <SprayCans id={id} reduced={reduced} frameRef={rootRef} source={scene} />
      {!compact && <ColorChips id={id} reduced={reduced} atlas={atlas} />}
      <CutterSheet id={id} reduced={reduced} atlas={atlas} />
      {showSpray && (
        <SprayParticles key={config.spray} id={id} reduced={reduced} count={config.spray} nozzle={nozzle} />
      )}
    </group>
  );
}
