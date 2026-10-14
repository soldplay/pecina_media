/**
 * Kennungen fuer Sektionen, Stationen, Beats und Cases (DESIGN_SPEC §5.4).
 * Reine Konstanten und Typen, ohne React/three — auch in Server Components nutzbar.
 */

export const SECTION_IDS = ['start', 'haltung', 'leistungen', 'arbeiten', 'prozess', 'klartext', 'kontakt'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const STATION_IDS = ['marke', 'bildschirm', 'papier', 'kopf'] as const;
export type StationId = (typeof STATION_IDS)[number];

export type StationBeatId = `${StationId}:${'a' | 'b'}`;
export const STATION_BEAT_IDS = [
  'marke:a',
  'marke:b',
  'bildschirm:a',
  'bildschirm:b',
  'papier:a',
  'papier:b',
  'kopf:a',
  'kopf:b',
] as const satisfies readonly StationBeatId[];

export const HALTUNG_BEAT_IDS = ['haltung:1', 'haltung:2', 'haltung:3'] as const;
export type HaltungBeatId = (typeof HALTUNG_BEAT_IDS)[number];

export type BeatId = StationBeatId | HaltungBeatId;
/** Alle 11 Beats: 3 Haltungs-Prinzipien + 8 Stations-Artikel. */
export const BEAT_IDS: readonly BeatId[] = [...HALTUNG_BEAT_IDS, ...STATION_BEAT_IDS];

export type AnchorId = SectionId | BeatId | 'cover';

export const CASE_IDS = ['tischlerei', 'bildung', 'cafe', 'verein'] as const;
export type CaseId = (typeof CASE_IDS)[number];

const SECTION_SET: ReadonlySet<string> = new Set(SECTION_IDS);
const STATION_SET: ReadonlySet<string> = new Set(STATION_IDS);
const BEAT_SET: ReadonlySet<string> = new Set(BEAT_IDS);
const STATION_BEAT_SET: ReadonlySet<string> = new Set(STATION_BEAT_IDS);
const HALTUNG_BEAT_SET: ReadonlySet<string> = new Set(HALTUNG_BEAT_IDS);

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === 'string' && SECTION_SET.has(value);
}

export function isStationId(value: unknown): value is StationId {
  return typeof value === 'string' && STATION_SET.has(value);
}

export function isBeatId(value: unknown): value is BeatId {
  return typeof value === 'string' && BEAT_SET.has(value);
}

export function isStationBeatId(value: unknown): value is StationBeatId {
  return typeof value === 'string' && STATION_BEAT_SET.has(value);
}

export function isHaltungBeatId(value: unknown): value is HaltungBeatId {
  return typeof value === 'string' && HALTUNG_BEAT_SET.has(value);
}

/** Station eines Beats ('marke:a' → 'marke'); Haltungs-Beats und null → null. */
export function stationOfBeat(beat: BeatId | null | undefined): StationId | null {
  if (!beat || !isStationBeatId(beat)) return null;
  const station = beat.slice(0, beat.indexOf(':'));
  return isStationId(station) ? station : null;
}

/** Nummer eines Haltungs-Beats ('haltung:2' → 2). */
export function haltungIndexOfBeat(beat: HaltungBeatId): 1 | 2 | 3 {
  const n = Number(beat.slice(beat.indexOf(':') + 1));
  return n === 2 ? 2 : n === 3 ? 3 : 1;
}
