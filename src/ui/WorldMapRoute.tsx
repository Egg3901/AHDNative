/**
 * WorldMapRoute: loads the offline world map/directory from the live save.
 *
 * Nations come from the world overview query. The region directory is loaded
 * per selected country (default: the player's) with a full-page query (up to
 * 100 rows) so the map lists the actual recorded regions of that country
 * without inventing coordinates. Changing the country picker re-queries
 * through the existing client loadRegions({countryId, ...}); an unknown
 * country falls back to the player's inside projectRegions. The Hall of Fame
 * summary comes from the same offline standings projection behind the
 * Leaderboards route, with default filters. Any query failure shows the
 * shared retry state, matching the other on-demand detail routes.
 */
import { useCallback, useEffect, useState } from "react";
import type { RegionsQuery, RegionsView } from "../game/regions";
import type { WorldOverviewView } from "../game/worldOverview";
import type { HallOfFameView } from "../game/hallOfFame";
import type { WorldMapSection, WorldMapView } from "../preferences";
import { DetailQuery } from "./DetailQuery";
import { WorldMapPanel } from "./WorldMapPanel";
import type { DrawerRouteId } from "./MobileNavigation";

const FULL_DIRECTORY_PAGE_SIZE = 100;

type FetchImpl = (url: string) => Promise<{ json(): Promise<unknown> }>;

export function WorldMapRoute({
  loadOverview,
  loadRegions,
  loadHallOfFame,
  fetchImpl,
  revision,
  section,
  onSectionChange,
  view,
  onViewChange,
  onNavigate,
  onOpenElection,
  onOpenHallOfFame,
}: {
  loadOverview: () => Promise<WorldOverviewView>;
  loadRegions: (query?: RegionsQuery) => Promise<RegionsView>;
  /**
   * Standings summary through the same worker query behind the
   * Leaderboards route. Absent (MP without the endpoint) hides the
   * summary instead of projecting one from unrelated queries.
   */
  loadHallOfFame?: () => Promise<HallOfFameView>;
  /** Test seam for the subdivision shard fetch. */
  fetchImpl?: FetchImpl;
  revision: object;
  section: WorldMapSection;
  onSectionChange: (section: WorldMapSection) => void;
  view: WorldMapView;
  onViewChange: (view: WorldMapView) => void;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  onOpenElection?: (id: string) => void;
  onOpenHallOfFame?: () => void;
}) {
  const loadSummary = useCallback(async (): Promise<HallOfFameView | null> => {
    if (!loadHallOfFame) return null;
    return loadHallOfFame();
  }, [loadHallOfFame]);
  return (
    <DetailQuery load={loadOverview} revision={revision} label="World map">
      {(overview) => (
        <CountryDirectory
          overview={overview}
          loadRegions={loadRegions}
          loadSummary={loadSummary}
          fetchImpl={fetchImpl}
          revision={revision}
          section={section}
          onSectionChange={onSectionChange}
          view={view}
          onViewChange={onViewChange}
          onNavigate={onNavigate}
          onOpenElection={onOpenElection}
          onOpenHallOfFame={onOpenHallOfFame}
        />
      )}
    </DetailQuery>
  );
}

function CountryDirectory({
  overview,
  loadRegions,
  loadSummary,
  fetchImpl,
  revision,
  section,
  onSectionChange,
  view,
  onViewChange,
  onNavigate,
  onOpenElection,
  onOpenHallOfFame,
}: {
  overview: WorldOverviewView;
  loadRegions: (query?: RegionsQuery) => Promise<RegionsView>;
  loadSummary: () => Promise<HallOfFameView | null>;
  fetchImpl?: FetchImpl;
  revision: object;
  section: WorldMapSection;
  onSectionChange: (section: WorldMapSection) => void;
  view: WorldMapView;
  onViewChange: (view: WorldMapView) => void;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  onOpenElection?: (id: string) => void;
  onOpenHallOfFame?: () => void;
}) {
  // Selected-country context: defaults to the player's nation and follows a
  // new save's player country. Membership is checked live so a stale id can
  // never scope the directory to a nation outside this world.
  const [countryId, setCountryId] = useState(overview.playerCountryId);
  useEffect(() => {
    setCountryId(overview.playerCountryId);
  }, [overview.playerCountryId]);
  const effectiveCountryId = overview.nations.some((nation) => nation.id === countryId)
    ? countryId
    : overview.playerCountryId;
  const loadDirectory = useCallback(
    () => loadRegions({ countryId: effectiveCountryId, directoryPage: 0, directoryPageSize: FULL_DIRECTORY_PAGE_SIZE }),
    [loadRegions, effectiveCountryId],
  );
  return (
    <DetailQuery load={loadDirectory} revision={revision} label="World map regions">
      {(regions) => (
        <DetailQuery load={loadSummary} revision={revision} label="World map standings">
          {(hallOfFame) => (
            <WorldMapPanel
              overview={overview}
              regions={regions.directory}
              regionsTotal={regions.directoryTotal}
              regionsCountryName={regions.selectedCountryName}
              selectedCountryId={regions.selectedCountryId}
              onCountryChange={setCountryId}
              isoDate={overview.date}
              fetchImpl={fetchImpl}
              section={section}
              onSectionChange={onSectionChange}
              view={view}
              onViewChange={onViewChange}
              hallOfFame={hallOfFame}
              onOpenHallOfFame={onOpenHallOfFame}
              onNavigate={onNavigate}
              onOpenElection={onOpenElection}
            />
          )}
        </DetailQuery>
      )}
    </DetailQuery>
  );
}
