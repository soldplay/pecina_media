/**
 * Inhalts-Typen fuer alle sichtbaren Texte der Website (DESIGN_SPEC §5.5).
 * Jeder Text traegt einen Status, damit Entwuerfe im Code markiert und per
 * `?entwurf=1` sichtbar sind (DraftMarker, globals.css).
 */
import type { CaseId, SectionId, StationBeatId, StationId } from '@/lib/scene/ids';

/**
 * - original: wortgetreu aus der Quelle (Wortlaut-Freigabe offen)
 * - fakt: belegt laut Briefing
 * - entwurf: von uns getextet
 * - beispiel: Beispiel-Case
 * - offen: Kundenentscheidung noetig
 */
export type CopyStatus = 'original' | 'fakt' | 'entwurf' | 'beispiel' | 'offen';

export interface CopyText {
  readonly text: string;
  readonly status: CopyStatus;
  readonly source?: string;
  readonly note?: string;
}

export interface CopyList {
  readonly items: readonly string[];
  readonly status: CopyStatus;
  readonly source?: string;
}

/** Status und Quelle fuer eine Gruppe reiner Strings (UI-Bedienelemente, 3D-Texturen, Navigation). */
export interface CopyGroupMeta {
  readonly status: CopyStatus;
  readonly source: string;
}

export type LeistungNum = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08';

export interface LeistungCopy {
  readonly num: LeistungNum;
  /** DOM-id, z. B. 'leistung-01' */
  readonly id: string;
  readonly station: StationId;
  readonly beat: StationBeatId;
  readonly title: CopyText;
  readonly claim: CopyText;
  readonly text: CopyText;
  readonly tags: CopyList;
  readonly note?: CopyText;
}

export interface CaseCopy {
  readonly id: CaseId;
  readonly title: CopyText;
  readonly services: readonly LeistungNum[];
  readonly teaser: CopyText;
  readonly detail: CopyText;
  readonly posterTone: 'brand' | 'ink' | 'paper';
  readonly posterShape: 'circle' | 'bar';
}

export interface StationCopy {
  readonly label: CopyText;
  /** Roemische Ziffer, dekorativ (aria-hidden) */
  readonly numeral: 'I' | 'II' | 'III' | 'IV';
  readonly subline: CopyText;
}

export interface PrincipleCopy {
  readonly num: '01' | '02' | '03';
  readonly title: CopyText;
  readonly text: CopyText;
}

export interface ProcessStepCopy {
  readonly num: '01' | '02' | '03' | '04';
  readonly title: CopyText;
  readonly text: CopyText;
}

export interface NavItem {
  readonly id: SectionId;
  /** Dekorative Nummer (aria-hidden) */
  readonly num: string;
  readonly label: string;
  readonly inHeader: boolean;
  readonly status: CopyStatus;
}

export interface CreditEntry {
  readonly name: string;
  readonly authors: string;
  readonly href: string;
}
