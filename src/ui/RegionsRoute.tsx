import { useCallback, useState } from "react";
import type { RegionsQuery, RegionsView } from "../game/regions";
import type { GameScreenProps } from "../game/types";
import { DetailQuery } from "./DetailQuery";
import { RegionsPanel } from "./RegionsPanel";
import type { DrawerRouteId } from "./MobileNavigation";

export function RegionsRoute({ load, loadMarkets, revision, busy, initialId, onNavigate, onDrill, onSectorSale }: {
  load: (query?: RegionsQuery) => Promise<RegionsView>; revision: object; busy: boolean;
  /**
   * Recorded markets projection for the regional corporate-sector inventory
   * (#299). Absent on surfaces without a markets load; the detail then
   * renders exactly as before, with no sector card.
   */
  loadMarkets?: GameScreenProps["loadMarkets"];
  /** Region to open on mount, e.g. from a search result; browsing does not change home. */
  initialId?: string;
  /** Opens a linked destination (election, office, profile) from the role rows. */
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  /**
   * Bounded drill for the role rows. The shell supplies the drill so the
   * selected region id travels as the return frame and Back restores the
   * selection; without it the rows fall back to plain navigation.
   */
  onDrill?: (origin: { route: DrawerRouteId; detailId?: string }, next: DrawerRouteId, id?: string) => void;
  onSectorSale?: GameScreenProps["onSectorSale"];
}) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [query, setQuery] = useState<RegionsQuery>(initialId ? { regionId: initialId } : {});
  const request = useCallback(() => load(query), [load, query]);
  const handleViewerNavigate = useCallback((next: DrawerRouteId, id?: string) => {
    if (onDrill) onDrill({ route: "regions", detailId: query.regionId ?? undefined }, next, id);
    else onNavigate?.(next, id);
  }, [onDrill, onNavigate, query.regionId]);
  // #510 directory surface links: party-support and election rows open the
  // national party/race detail for the same recorded engine id. The directory
  // is player-country scoped (projectRegions), so the ids resolve in the
  // player-country politics projection; stale ids fall back to the first live
  // row on the detail with Back intact. The origin carries the selected region
  // id so Back restores the region that opened the detail, not the default.
  const handleOpenParty = useCallback((partyId: string) => {
    if (onDrill) onDrill({ route: "regions", detailId: query.regionId ?? undefined }, "partyDetails", partyId);
    else onNavigate?.("partyDetails", partyId);
  }, [onDrill, onNavigate, query.regionId]);
  const handleOpenElection = useCallback((electionId: string) => {
    if (onDrill) onDrill({ route: "regions", detailId: query.regionId ?? undefined }, "electionDetails", electionId);
    else onNavigate?.("electionDetails", electionId);
  }, [onDrill, onNavigate, query.regionId]);
  // #299 company drill: a regional sector row opens the same markets company
  // detail the Sectors directory drills to, with the selected region id as
  // the return frame so Back restores the region.
  const handleOpenCompany = useCallback((listingId: string) => {
    if (onDrill) onDrill({ route: "regions", detailId: query.regionId ?? undefined }, "markets", listingId);
    else onNavigate?.("markets", listingId);
  }, [onDrill, onNavigate, query.regionId]);
  return <DetailQuery load={request} revision={revision} label="Regions">
    {view => loadMarkets ? (
      <DetailQuery load={loadMarkets} revision={revision} label="Markets">
        {markets => <RegionsPanel query={view} onQueryChange={setQuery} busy={busy} directoryOpen={directoryOpen} onDirectoryOpenChange={setDirectoryOpen} onNavigate={handleViewerNavigate} onOpenParty={handleOpenParty} onOpenElection={handleOpenElection} sectorAssets={{ listings: markets.listings, playerCash: markets.playerCash, onSectorSale, onOpenCompany: handleOpenCompany }} />}
      </DetailQuery>
    ) : (
      <RegionsPanel query={view} onQueryChange={setQuery} busy={busy} directoryOpen={directoryOpen} onDirectoryOpenChange={setDirectoryOpen} onNavigate={handleViewerNavigate} onOpenParty={handleOpenParty} onOpenElection={handleOpenElection} />
    )}
  </DetailQuery>;
}
