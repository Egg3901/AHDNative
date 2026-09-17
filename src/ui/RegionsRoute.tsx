import { useCallback, useState } from "react";
import type { RegionsQuery, RegionsView } from "../game/regions";
import { DetailQuery } from "./DetailQuery";
import { RegionsPanel } from "./RegionsPanel";
import type { DrawerRouteId } from "./MobileNavigation";

export function RegionsRoute({ load, revision, busy, initialId, onNavigate, onDrill }: {
  load: (query?: RegionsQuery) => Promise<RegionsView>; revision: object; busy: boolean;
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
}) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [query, setQuery] = useState<RegionsQuery>(initialId ? { regionId: initialId } : {});
  const request = useCallback(() => load(query), [load, query]);
  const handleViewerNavigate = useCallback((next: DrawerRouteId, id?: string) => {
    if (onDrill) onDrill({ route: "regions", detailId: query.regionId ?? undefined }, next, id);
    else onNavigate?.(next, id);
  }, [onDrill, onNavigate, query.regionId]);
  return <DetailQuery load={request} revision={revision} label="Regions">
    {view => <RegionsPanel query={view} onQueryChange={setQuery} busy={busy} directoryOpen={directoryOpen} onDirectoryOpenChange={setDirectoryOpen} onNavigate={handleViewerNavigate} />}
  </DetailQuery>;
}
