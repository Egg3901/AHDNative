import { useState } from 'react';
import type { GameScreenProps } from '../game/types';
import { DetailQuery } from './DetailQuery';
import { MarketsPanel } from './MarketsPanel';

export function MarketsRoute({ load, revision, busy, onAction }: {
  load: GameScreenProps['loadMarkets']; revision: object;
  busy: boolean; onAction: GameScreenProps['onAction'];
}) {
  // Keep the current company when a completed trade refreshes its balances.
  const [companyId, setCompanyId] = useState<string | null>(null);
  return <DetailQuery load={load} revision={revision} label="Stock market">
    {markets => <MarketsPanel markets={markets} initialId={companyId} onSelect={setCompanyId} busy={busy} onAction={onAction} />}
  </DetailQuery>;
}
