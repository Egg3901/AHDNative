import { useState } from 'react';
import type { GameScreenProps } from '../game/types';
import { DetailQuery } from './DetailQuery';
import { BondMarketPanel } from './BondMarketPanel';

export function BondMarketRoute({ load, revision, busy, onAction }: {
  load: GameScreenProps['loadBondMarket']; revision: object; busy: boolean;
  onAction: GameScreenProps['onAction'];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return <DetailQuery load={load} revision={revision} label="Bond market">
    {market => <BondMarketPanel market={market} selectedId={selectedId} onSelect={setSelectedId} busy={busy} onAction={onAction} />}
  </DetailQuery>;
}
