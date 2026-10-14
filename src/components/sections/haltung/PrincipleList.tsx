'use client';

/**
 * Drei Prinzipien der Haltung (P5, DESIGN_SPEC §3.2).
 *
 * <ol> mit drei <li data-scene-beat="haltung:N"> (Beat-Bereich und ui.haltungActive
 * schreibt der SceneScrollChannel). Die aktive Nummer steht in --color-brand, die
 * anderen in --color-muted-dark (Farbwechsel 120 ms, kein Opacity-Wechsel).
 * Reduced: alle drei aktiv (wie die Lichtstreifen der Monolithe).
 * Die Nummern sind dekorativ (aria-hidden), die <ol> nummeriert selbst.
 */

import { Copy } from '@/components/copy/Copy';
import type { PrincipleCopy } from '@/content/types';
import { HALTUNG_BEAT_IDS } from '@/lib/scene/ids';
import { useUi } from '@/lib/scene/store';

export interface PrincipleListProps {
  readonly items: readonly PrincipleCopy[];
}

export function PrincipleList({ items }: PrincipleListProps) {
  const active = useUi((s) => s.haltungActive);

  return (
    <ol className="haltung__principles" role="list">
      {items.map((principle, index) => {
        const beat = HALTUNG_BEAT_IDS[index];
        if (beat === undefined) return null;
        return (
          <li
            key={principle.num}
            className="haltung__principle"
            data-scene-beat={beat}
            data-active={active === index + 1 ? '' : undefined}
          >
            <div className="reveal">
              <p className="haltung__principle-num" aria-hidden="true">
                {principle.num}
              </p>
              <Copy value={principle.title} as="h3" className="haltung__principle-title" />
              <Copy value={principle.text} as="p" className="haltung__principle-text" />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
