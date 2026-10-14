'use client';

/**
 * Meldet nach dem ersten Frame der Szene ui.sceneStatus = 'ready'
 * (DESIGN_SPEC §5.2). useFrame laeuft unmittelbar vor dem Rendern desselben
 * Frames; der Status wird einmalig gesetzt. Rendert nichts.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ui } from '@/lib/scene/store';

export default function FirstFrame(): null {
  const reportedRef = useRef(false);

  useFrame(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    ui.set({ sceneStatus: 'ready' });
  });

  return null;
}
