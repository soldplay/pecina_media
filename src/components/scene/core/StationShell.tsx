'use client';

/**
 * Rahmen einer Station (DESIGN_SPEC §3.3.0, §5.2): Gruppe bei
 * STATIONS[id].position mit rotY, darin der Werkfuge-Sockel und der
 * Stations-Inhalt (P3/P4) in Station-lokalen Koordinaten.
 *
 * - Sichtbar, wenn |Index(id) − Index(activeStation)| ≤ 1 oder die Kamera
 *   naeher als 30 m ist. Schreibt frame.stationVisible[id]
 *   (vor den useFrame der Stationen, Prioritaet −2).
 * - Inhalt erst nach dem Start des GLB-Prefetch (AssetPrefetch) mounten,
 *   damit useGLTF nicht mit dem Initial-Load konkurriert.
 * - StationCompile (im Suspense-Baum NACH dem Inhalt) ruft einmalig
 *   gl.compileAsync(group, camera, scene) auf, gegen Shader-Ruckler beim
 *   ersten Sichtbarwerden. Die Szene als targetScene, damit die Programme mit
 *   den echten Lichtern und dem Fog kompiliert werden.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { STATION_IDS, type StationId } from '@/lib/scene/ids';
import { STATIONS } from '@/lib/scene/stations';
import { frame, keepAlive, ui } from '@/lib/scene/store';
import { usePrefetchStarted } from './AssetPrefetch';
import Plinth from './Plinth';

/** Nach der Kamera (−3), vor den Stationen (0). */
export const STATION_SHELL_PRIORITY = -2;
/**
 * Sichtweite (m), unabhaengig von der aktiven Station. 18 → 30 (Abnahme
 * 14.10.2026): Von der Kran-Draufsicht F aus lagen Bildschirm (18,6 m) und Marke
 * jenseits der Grenze, das Bild zeigte nur Boden. Jenseits von 30 m nimmt der
 * Nebel (Dichte 0,035) ohnehin ueber 65 % weg.
 */
export const STATION_VISIBLE_DISTANCE = 30;
const VISIBLE_DISTANCE_SQ = STATION_VISIBLE_DISTANCE * STATION_VISIBLE_DISTANCE;

const STATION_INDEX: Readonly<Record<StationId, number>> = Object.freeze(
  Object.fromEntries(STATION_IDS.map((id, i) => [id, i])) as Record<StationId, number>,
);

const StationGroupContext = createContext<RefObject<THREE.Group | null> | null>(null);

/** Sichtbar: Nachbar der aktiven Station (Index ±1) oder naeher als STATION_VISIBLE_DISTANCE. */
function isStationVisible(id: StationId, camera: THREE.Camera): boolean {
  const active = ui.get().activeStation;
  if (active && Math.abs(STATION_INDEX[id] - STATION_INDEX[active]) <= 1) return true;
  const [x, y, z] = STATIONS[id].position;
  const p = camera.position;
  return (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 < VISIBLE_DISTANCE_SQ;
}

/** Hot Path: frame.stationVisible ist der bewusst mutierbare Frame-Store. */
function updateVisibility(id: StationId, group: THREE.Group | null, camera: THREE.Camera): void {
  const visible = isStationVisible(id, camera);
  frame.stationVisible[id] = visible;
  if (group && group.visible !== visible) group.visible = visible;
}

function clearVisibility(id: StationId): void {
  frame.stationVisible[id] = false;
}

/**
 * Kompiliert die Station einmal, sobald ihr Inhalt geladen ist. Gehoert in
 * denselben Suspense-Baum wie der Inhalt, hinter ihn.
 */
export function StationCompile(): null {
  const groupRef = useContext(StationGroupContext);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const group = groupRef?.current;
    if (!group) return undefined;
    let cancelled = false;
    gl.compileAsync(group, camera, scene).then(
      () => {
        if (!cancelled) keepAlive();
      },
      (error: unknown) => {
        if (process.env.NODE_ENV !== 'production') {
          console.assert(false, `[StationShell] compileAsync fehlgeschlagen (${group.name}):`, error);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gl, camera, scene, groupRef]);

  return null;
}

interface StationShellProps {
  id: StationId;
  children: ReactNode;
}

export default function StationShell({ id, children }: StationShellProps) {
  const groupRef = useRef<THREE.Group>(null);
  const contentAllowed = usePrefetchStarted();
  const station = STATIONS[id];

  useFrame((state) => updateVisibility(id, groupRef.current, state.camera), STATION_SHELL_PRIORITY);
  useEffect(() => () => clearVisibility(id), [id]);

  return (
    <group ref={groupRef} name={`pm-station-${id}`} position={[...station.position]} rotation-y={station.rotY}>
      <Plinth id={id} />
      <StationGroupContext.Provider value={groupRef}>{contentAllowed ? children : null}</StationGroupContext.Provider>
    </group>
  );
}
