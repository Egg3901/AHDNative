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
  // Restore the last chamber/bill from device storage so navigation context
  // survives a reload, then keep it current as the player moves.
  const [billId, setBillId] = useState<string | null>(() => initialId ?? loadLegislatureNav(countryId).billId);
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
