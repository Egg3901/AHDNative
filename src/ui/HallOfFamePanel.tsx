/**
 * HallOfFamePanel: the offline singleplayer standings board (#73).
 *
 * Rows come from `projectHallOfFame`: the recorded player plus the
 * player-country politician roster, in the projector's deterministic order
 * (this panel never re-sorts). Scope (all/party), ranking
 * (standing/influence), and era (current/all) filters are the caller's
 * persisted preferences, applied through `onQueryChange`.
 *
 * Reference: AHDGame `src/app/world/legacy/page.tsx` ranks every life ever
 * played across all game iterations (pinned rev 08820d1). That board reads
 * cross-player Mongo records the offline device never sees, so the
 * cross-player table stays tracked for the later authoritative MP
 * integration and is stated as such, never rendered as a table.
 */
import type { HallOfFameQuery, HallOfFameView } from "../game/hallOfFame";
import type { DrawerRouteId } from "./MobileNavigation";

export interface HallOfFamePanelProps {
  view: HallOfFameView;
  query: Required<HallOfFameQuery>;
  onQueryChange: (query: Required<HallOfFameQuery>) => void;
  /** Player figure opens Profile; recorded politicians open Politicians. */
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  /** Recorded unresolved races open the existing election detail route. */
  onOpenElection?: (id: string) => void;
}

function FilterButton({
  pressed,
  onClick,
  label,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      className="ahd-btn ahd-btn-sm"
      onClick={onClick}
      style={{ minHeight: "2.75rem" }}
    >
      {children}
    </button>
  );
}

/**
 * Phone-sized page cap, matching the reference board's TOP_N = 50
 * (`src/app/world/legacy/page.tsx` at pinned rev 08820d1). The projector
 * keeps the full deterministic order; the panel shows the top slice.
 */
export const HALL_OF_FAME_PAGE_SIZE = 50;

export function HallOfFamePanel({ view, query, onQueryChange, onNavigate, onOpenElection }: HallOfFamePanelProps) {
  const metricLabel = query.rankBy === "influence" ? "Influence" : "Standing";
  const page = view.entries.slice(0, HALL_OF_FAME_PAGE_SIZE);
  // The player row is always visible: pinned after the page when it ranks
  // outside the top slice. Rank numbers stay the projector's own.
  const player = view.entries.find((entry) => entry.isPlayer);
  const shown = player && !page.some((entry) => entry.id === player.id) ? [...page, player] : page;
  return (
    <div className="ahd-stack" aria-label="Hall of Fame">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <div className="ahd-eyebrow">
          {view.playerCountryName} · {view.era} · Turn {view.turn}
        </div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>Hall of Fame</h1>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.32rem 0 0" }}>
          {view.total} recorded figures in this save. The cross-player leaderboard lives on the
          authoritative server and is not available offline.
        </p>
      </div>

      <div className="ahd-card ahd-card-pad" aria-label="Standings filters">
        <div role="group" aria-label="Leaderboard scope" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <FilterButton
            pressed={query.scope === "all"}
            onClick={() => onQueryChange({ ...query, scope: "all" })}
            label="Show every recorded figure"
          >
            Everyone
          </FilterButton>
          <FilterButton
            pressed={query.scope === "party"}
            onClick={() => onQueryChange({ ...query, scope: "party" })}
            label="Show only my party"
          >
            My party
          </FilterButton>
        </div>
        <div role="group" aria-label="Leaderboard ranking" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
          <FilterButton
            pressed={query.rankBy === "standing"}
            onClick={() => onQueryChange({ ...query, rankBy: "standing" })}
            label="Rank by standing"
          >
            Standing
          </FilterButton>
          <FilterButton
            pressed={query.rankBy === "influence"}
            onClick={() => onQueryChange({ ...query, rankBy: "influence" })}
            label="Rank by influence"
          >
            Influence
          </FilterButton>
        </div>
        <div role="group" aria-label="Leaderboard era" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
          <FilterButton
            pressed={query.era === "current"}
            onClick={() => onQueryChange({ ...query, era: "current" })}
            label="Show the current era"
          >
            Current era
          </FilterButton>
          <FilterButton
            pressed={query.era === "all"}
            onClick={() => onQueryChange({ ...query, era: "all" })}
            label="Show every era"
          >
            Every era
          </FilterButton>
        </div>
      </div>

      <section className="ahd-card ahd-card-pad" aria-label="Hall of Fame standings section">
        <h2 className="ahd-h2">Standings</h2>
        {view.entries.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>
            No recorded figures match these filters. There are no unresolved races to show instead.
          </div>
        ) : (
          <div className="ahd-mp-wallet-table" style={{ marginTop: "0.55rem" }}>
            <table aria-label="Hall of Fame standings">
              <caption className="ahd-muted" style={{ fontSize: "0.72rem", textAlign: "left", paddingBottom: "0.4rem" }}>
                Ranked by {query.rankBy === "influence" ? "raw political influence" : "the standing composite"}.
                Showing the top {page.length} of {view.total}
                {shown.length > page.length ? ", plus your pinned row" : ""}. Choosing a name opens that
                figure&apos;s profile.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Name</th>
                  <th scope="col">Party</th>
                  <th scope="col">Office</th>
                  <th scope="col">{metricLabel}</th>
                  <th scope="col">Race</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.rank}</td>
                    <td>
                      <button
                        type="button"
                        className="ahd-btn ahd-btn-ghost ahd-btn-sm"
                        onClick={() => entry.isPlayer
                          ? onNavigate?.("profile")
                          : onNavigate?.(entry.profileRoute, entry.id)}
                        disabled={!onNavigate}
                        aria-label={entry.isPlayer
                          ? `${entry.name}, your character, open profile`
                          : `${entry.name}, recorded politician, open politician details`}
                        style={{ minHeight: "2.75rem" }}
                      >
                        {entry.name}
                        {entry.isPlayer ? " (you)" : ""}
                      </button>
                      <div className="ahd-muted" style={{ fontSize: "0.68rem" }}>{entry.era}</div>
                    </td>
                    <td>{entry.partyName ?? "No party"}</td>
                    <td>{entry.office ?? "No office"}</td>
                    <td>{query.rankBy === "influence" ? entry.influence : entry.score}</td>
                    <td>
                      {entry.activeRaceIds.length === 0 ? (
                        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>No unresolved races</span>
                      ) : (
                        <span style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                          {entry.activeRaceIds.map((raceId) => (
                            <button
                              key={raceId}
                              type="button"
                              className="ahd-btn ahd-btn-ghost ahd-btn-sm"
                              onClick={() => onOpenElection?.(raceId)}
                              disabled={!onOpenElection}
                              aria-label={`Open ${raceId} race details`}
                              style={{ minHeight: "2.75rem" }}
                            >
                              {raceId}
                            </button>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
