/**
 * HallOfFameRoute: loads the offline standings board from the live save.
 *
 * Overview, politics, and profile come from the existing on-demand queries
 * and are projected through `projectHallOfFame` with the caller's persisted
 * filters. Any query failure shows the shared retry state, matching the
 * other on-demand detail routes.
 */
import type { PoliticsView } from "../game/politics";
import type { ProfileView } from "../game/profileTypes";
import type { HallOfFameQuery } from "../game/hallOfFame";
import { projectHallOfFame } from "../game/hallOfFame";
import type { WorldOverviewView } from "../game/worldOverview";
import type { DrawerRouteId } from "./MobileNavigation";
import { DetailQuery } from "./DetailQuery";
import { HallOfFamePanel } from "./HallOfFamePanel";

export function HallOfFameRoute({
  loadOverview,
  loadPolitics,
  loadProfile,
  revision,
  query,
  onQueryChange,
  onNavigate,
  onOpenElection,
}: {
  loadOverview: () => Promise<WorldOverviewView>;
  loadPolitics: () => Promise<PoliticsView>;
  loadProfile: () => Promise<ProfileView>;
  revision: object;
  query: Required<HallOfFameQuery>;
  onQueryChange: (query: Required<HallOfFameQuery>) => void;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  onOpenElection?: (id: string) => void;
}) {
  const load = async () => {
    const [overview, politics, profile] = await Promise.all([loadOverview(), loadPolitics(), loadProfile()]);
    return projectHallOfFame({ overview, politics, profile, query });
  };
  return (
    <DetailQuery load={load} revision={revision} label="Hall of Fame">
      {(view) => (
        <HallOfFamePanel
          view={view}
          query={query}
          onQueryChange={onQueryChange}
          onNavigate={onNavigate}
          onOpenElection={onOpenElection}
        />
      )}
    </DetailQuery>
  );
}
