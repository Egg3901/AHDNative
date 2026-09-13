import { useCallback, useEffect, useState } from 'react';
import type { GameScreenProps } from '../game/types';
import { loadLegislatureNav, saveLegislatureNav } from '../game/legislature';
import { DetailQuery } from './DetailQuery';
import { LegislationDetailsPanel } from './LegislationDetailsPanel';

export function LegislationRoute({ load, revision, busy, onAction, initialId, countryId }: {
  initialId?: string;
  /** Playable country; keys the persisted chamber/bill navigation context. */
  countryId?: string;
  load: GameScreenProps['loadLegislation']; revision: object;
  busy: boolean; onAction: GameScreenProps['onAction'];
}) {
  // Restore the last chamber from device storage so chamber navigation survives
  // a reload, then keep it current as the player moves.
  //
  // The expanded bill is deliberately session-scoped: only an explicit deep
  // link (initialId) or the player's own toggle opens a card. Restoring the
  // persisted bill id would re-expand that card on the next visit and replace
  // its "Show details" control with "Hide details", which is the pre-existing
  // bill flow this route must keep working. The chamber-scoped list still
  // renders the player's bill because it opens on the player's own chamber.
  const [billId, setBillId] = useState<string | null>(initialId ?? null);
  const [chamberKey, setChamberKey] = useState<string | null>(() => loadLegislatureNav(countryId).chamberKey);
  useEffect(() => {
    saveLegislatureNav(countryId, { chamberKey, billId });
  }, [countryId, chamberKey, billId]);
  const read = useCallback(() => load({ billId }), [load, billId]);
  return <DetailQuery load={read} revision={revision} label="Legislation details">
    {query => (
      <LegislationDetailsPanel
        query={query}
        busy={busy}
        onAction={onAction}
        onSelectBill={setBillId}
        initialChamberKey={chamberKey ?? undefined}
        onSelectChamber={setChamberKey}
      />
    )}
  </DetailQuery>;
}
