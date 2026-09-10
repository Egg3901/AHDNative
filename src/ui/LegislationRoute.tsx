import { useCallback, useState } from 'react';
import type { GameScreenProps } from '../game/types';
import { DetailQuery } from './DetailQuery';
import { LegislationDetailsPanel } from './LegislationDetailsPanel';

export function LegislationRoute({ load, revision, busy, onAction, initialId }: {
  initialId?: string;
  load: GameScreenProps['loadLegislation']; revision: object;
  busy: boolean; onAction: GameScreenProps['onAction'];
}) {
  const [billId, setBillId] = useState<string | null>(initialId ?? null);
  const read = useCallback(() => load({ billId }), [load, billId]);
  return <DetailQuery load={read} revision={revision} label="Legislation details">
    {query => <LegislationDetailsPanel query={query} busy={busy} onAction={onAction} onSelectBill={setBillId} />}
  </DetailQuery>;
}
