/**
 * Gemeinsame Daten der Dev-Sandbox (Server-Seite und Client-Komponenten).
 * Ohne 'use client', damit die Server-Page die Liste lesen kann.
 */

import type { CutKeep, CutMode } from '@/lib/three/cut';

export const DEV_STAGE_IDS = ['test', 'hero', 'marke', 'bildschirm', 'papier', 'kopf'] as const;
export type DevStageId = (typeof DEV_STAGE_IDS)[number];

const DEV_STAGE_SET: ReadonlySet<string> = new Set(DEV_STAGE_IDS);

export function isDevStageId(value: unknown): value is DevStageId {
  return typeof value === 'string' && DEV_STAGE_SET.has(value);
}

/** Einstellungen des Schnitt-Tests (/dev/stage/test). */
export interface DevTestSettings {
  readonly mode: CutMode;
  readonly keep: CutKeep;
  readonly offset: number;
  /** Gluehen nur bis uCutProgress entlang der Schnittlinie */
  readonly along: boolean;
  readonly progress: number;
}
