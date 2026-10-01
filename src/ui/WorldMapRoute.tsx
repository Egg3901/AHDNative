/**
 * WorldMapRoute: loads the offline world map/directory from the live save.
 *
 * Nations come from the world overview query. The region directory is loaded
 * with a full-page query (up to 100 rows) so the map lists the actual regions
 * of the player's country without inventing coordinates. The Hall of Fame
 * summary comes from the same offline standings projection behind the
 * Leaderboards route, with default filters. Any query failure shows the
 * shared retry state, matching the other on-demand detail routes.
 */
import { useCallback } from "react";
import type { RegionsQuery, RegionsView } from "../game/regions";
import type { WorldOverviewView } from "../game/worldOverview";
import type { HallOfFameView } from "../game/hallOfFame";
import type { WorldMapSection, WorldMapView } from "../preferences";
import { DetailQuery } from "./DetailQuery";
import { WorldMapPanel } from "./WorldMapPanel";
import type { DrawerRouteId } from "./MobileNavigation";

const FULL_DIRECTORY: RegionsQuery = { directoryPage: 0, directoryPageSize: 100 };

export function WorldMapRoute({
  loadOverview,
  loadRegions,
  loadHallOfFame,
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
  revision: object;
  section: WorldMapSection;
  onSectionChange: (section: WorldMapSection) => void;
  view: WorldMapView;
  onViewChange: (view: WorldMapView) => void;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  onOpenElection?: (id: string) => void;
  onOpenHallOfFame?: () => void;
}) {
  const loadDirectory = useCallback(() => loadRegions(FULL_DIRECTORY), [loadRegions]);
  const loadSummary = useCallback(async (): Promise<HallOfFameView | null> => {
    if (!loadHallOfFame) return null;
    return loadHallOfFame();
  }, [loadHallOfFame]);
  return (
    <DetailQuery load={loadOverview} revision={revision} label="World map">
      {(overview) => (
        <DetailQuery load={loadDirectory} revision={revision} label="World map regions">
          {(regions) => (
            <DetailQuery load={loadSummary} revision={revision} label="World map standings">
              {(hallOfFame) => (
                <WorldMapPanel
                  overview={overview}
                  regions={regions.directory}
                  regionsTotal={regions.directoryTotal}
                  regionsCountryName={regions.playerCountryName}
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
      )}
    </DetailQuery>
  );
}
