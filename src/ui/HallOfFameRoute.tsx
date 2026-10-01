/**
 * HallOfFameRoute: loads the offline standings DTO through the public
 * GameSession/worker query boundary (`loadHallOfFame`).
 *
 * The DTO is projected inside the worker from the live WorldState, so the
 * whole world never crosses into React. The latest `revision` plus the
 * active filters key the query: DetailQuery re-runs when either changes
 * and ignores a stale response that resolves after a newer query started.
 * Any query failure shows the shared retry state, matching the other
 * on-demand detail routes.
 */
import { useCallback } from "react";
import type { HallOfFameQuery, HallOfFameView } from "../game/hallOfFame";
import type { DrawerRouteId } from "./MobileNavigation";
import { DetailQuery } from "./DetailQuery";
import { HallOfFamePanel } from "./HallOfFamePanel";

export function HallOfFameRoute({
  loadHallOfFame,
  revision,
  query,
  onQueryChange,
  onNavigate,
  onOpenElection,
}: {
  loadHallOfFame: (query: HallOfFameQuery) => Promise<HallOfFameView>;
  revision: object;
  query: Required<HallOfFameQuery>;
  onQueryChange: (query: Required<HallOfFameQuery>) => void;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  onOpenElection?: (id: string) => void;
}) {
  const { rankBy, scope } = query;
  // Stable identity per filter set: DetailQuery re-runs when the filters
  // change and drops a response that resolves after a newer query started.
  const load = useCallback(() => loadHallOfFame({ rankBy, scope }), [loadHallOfFame, rankBy, scope]);
  return (
    <DetailQuery load={load} revision={revision} label="Hall of Fame">
      {(view) => (
        <HallOfFamePanel
          view={view}
          query={{ rankBy, scope }}
          onQueryChange={onQueryChange}
          onNavigate={onNavigate}
          onOpenElection={onOpenElection}
        />
      )}
    </DetailQuery>
  );
}
