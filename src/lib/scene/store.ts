/**
 * Szene-Store (DESIGN_SPEC §5.4) — einzige Import-Adresse fuer Pakete.
 *
 * - frame:  Per-Frame-Daten, bewusst mutierbar (Hot Path, kein React-Render)
 * - layout: Anker-Scroll-Positionen, anchorY(id, p)
 * - ui:     unveraenderlicher UI-Zustand mit get/set/subscribe
 * - useUi:  React-Hook (nur in Client Components)
 * - keepAlive / registerInvalidate: Settle-Pattern
 *
 * Den React-freien Kern siehe ./store-core.ts.
 */

import { useSyncExternalStore } from 'react';
import { UI_SERVER_STATE, ui, type UiState } from './store-core';

export * from './store-core';

/**
 * Abonniert einen Ausschnitt des UI-Zustands. Der Selektor muss primitive oder
 * stabile Werte liefern (keine neu erzeugten Objekte/Arrays), sonst rendert
 * die Komponente endlos neu. Nur in Client Components verwenden.
 */
export function useUi<T>(selector: (s: Readonly<UiState>) => T): T {
  return useSyncExternalStore(
    ui.subscribe,
    () => selector(ui.get()),
    () => selector(UI_SERVER_STATE),
  );
}
