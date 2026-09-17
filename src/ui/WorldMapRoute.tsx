/**
 * WorldMapRoute: loads the offline world map/directory from the live save.
 *
 * Nations come from the world overview query. The region directory is loaded
 * with a full-page query (up to 100 rows) so the map lists the actual regions
 * of the player's country without inventing coordinates. Either query failure
 * shows the shared retry state, matching the other on-demand detail routes.
 */
import { useCallback } from "react";
import type { RegionsQuery, RegionsView } from "../game/regions";
import type { WorldOverviewView } from "../game/worldOverview";
import type { WorldMapSection } from "../preferences";
import { DetailQuery } from "./DetailQuery";
import { WorldMapPanel } from "./WorldMapPanel";
import type { DrawerRouteId } from "./MobileNavigation";

const FULL_DIRECTORY: RegionsQuery = { directoryPage: 0, directoryPageSize: 100 };

export function WorldMapRoute({
  loadOverview,
  loadRegions,
  revision,
  section,
  onSectionChange,
  onNavigate,
}: {
  loadOverview: () => Promise<WorldOverviewView>;
  loadRegions: (query?: RegionsQuery) => Promise<RegionsView>;
  revision: object;
  section: WorldMapSection;
  onSectionChange: (section: WorldMapSection) => void;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
}) {
  const loadDirectory = useCallback(() => loadRegions(FULL_DIRECTORY), [loadRegions]);
  return (
    <DetailQuery load={loadOverview} revision={revision} label="World map">
      {(overview) => (
        <DetailQuery load={loadDirectory} revision={revision} label="World map regions">
          {(regions) => (
            <WorldMapPanel
              overview={overview}
              regions={regions.directory}
              regionsTotal={regions.directoryTotal}
              regionsCountryName={regions.playerCountryName}
              section={section}
              onSectionChange={onSectionChange}
              onNavigate={onNavigate}
            />
          )}
        </DetailQuery>
      )}
    </DetailQuery>
  );
}
