import { useEffect, useState } from 'react';
import type { GameScreenProps } from '../game/types';
import { DetailQuery } from './DetailQuery';
import { MarketsPanel } from './MarketsPanel';
import type { DrawerRouteId } from './MobileNavigation';

export function MarketsRoute({ load, revision, busy, onAction, onSectorSale, initialId, onNavigate, onDrill }: {
  initialId?: string;
  load: GameScreenProps['loadMarkets']; revision: object;
  busy: boolean; onAction: GameScreenProps['onAction']; onSectorSale?: GameScreenProps['onSectorSale'];
  /** Opens a linked destination (region) from the company detail. */
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  /**
   * Bounded drill for the company region row. The shell supplies the drill
   * so the selected company id travels as the return frame and Back restores
   * the company; without it the row falls back to plain navigation.
   */
  onDrill?: (origin: { route: DrawerRouteId; detailId?: string }, next: DrawerRouteId, id?: string) => void;
}) {
  // Keep the current company when a completed trade refreshes its balances.
  const [companyId, setCompanyId] = useState<string | null>(initialId ?? null);
  // A same-route deep link (the drawer "My Corporation" row while the market
  // is already open) re-points the selection without remounting the route, so
  // follow a newly supplied id the way the Nations surface follows its browse
  // context. An absent id keeps the current browse selection; a stale id
  // falls back to the market list through the existing panel guard.
  useEffect(() => {
    if (initialId !== undefined) setCompanyId(initialId);
  }, [initialId]);
  // #510 company-to-region entry: a recorded regional asset opens the
  // existing Regions detail with the selected company id as the return frame,
  // so Back restores the company instead of falling to the market list.
  const handleOpenRegion = (regionId: string) => {
    if (onDrill) onDrill({ route: "markets", detailId: companyId ?? undefined }, "regions", regionId);
    else onNavigate?.("regions", regionId);
  };
  return <DetailQuery load={load} revision={revision} label="Stock market">
    {markets => <MarketsPanel markets={markets} initialId={companyId} onSelect={setCompanyId} busy={busy} onAction={onAction} onSectorSale={onSectorSale} onOpenRegion={handleOpenRegion} />}
  </DetailQuery>;
}
