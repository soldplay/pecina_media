/**
 * Rendert Texte aus content/site.ts mit ihrem Inhalts-Status (DESIGN_SPEC §5.5).
 * Server-tauglich: kein 'use client', keine Hooks. In Client Components ebenso nutzbar.
 */
import type { CopyList, CopyStatus, CopyText } from '@/content/types';

export type CopyTag = 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'strong' | 'em' | 'dt' | 'dd';

export interface CopyAttrs {
  readonly 'data-copy-status': CopyStatus;
  readonly 'data-copy-source'?: string;
}

export interface CopyProps {
  readonly value: CopyText;
  readonly as?: CopyTag;
  readonly className?: string;
  readonly id?: string;
}

/** Status-Attribute fuer eigene Elemente (CutHeading, Listen). */
export function copyAttrs(value: CopyText | CopyList): CopyAttrs {
  return value.source === undefined
    ? { 'data-copy-status': value.status }
    : { 'data-copy-status': value.status, 'data-copy-source': value.source };
}

export function Copy({ value, as: Tag = 'span', className, id }: CopyProps) {
  return (
    <Tag id={id} className={className} {...copyAttrs(value)}>
      {value.text}
    </Tag>
  );
}
