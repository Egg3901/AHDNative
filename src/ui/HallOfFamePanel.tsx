/**
 * HallOfFamePanel: the offline singleplayer life board (#73).
 *
 * Rows come from `projectHallOfFame` through the GameSession/worker query:
 * exactly one recorded local life (the player), ranked by the reference's
 * own metrics — composite Legacy Score or forex-normalized net worth —
 * with `scope` (all lives / current era) and `rankBy` (legacy / netWorth)
 * filters. This panel never re-sorts and never invents rows: no NPC
 * politicians, no raw-influence ranking, no party filter.
 *
 * Reference: AHDGame `src/app/world/legacy/page.tsx` (pinned rev 954f1c2).
 * That board reads cross-player Mongo records the offline device never
 * sees, so the cross-player table stays tracked for the later authoritative
 * MP integration and is stated as such, never rendered as a table.
 */
import type { HallOfFameQuery, HallOfFameView } from "../game/hallOfFame";
import type { DrawerRouteId } from "./MobileNavigation";

export interface HallOfFamePanelProps {
  view: HallOfFameView;
  query: Required<HallOfFameQuery>;
  onQueryChange: (query: Required<HallOfFameQuery>) => void;
  /** The life opens Profile; its home region opens Regions; races open elections. */
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
 * (`src/app/world/legacy/page.tsx` at the pinned rev). The projector keeps
 * the full deterministic order; the panel shows the top slice.
 */
export const HALL_OF_FAME_PAGE_SIZE = 50;

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function HallOfFamePanel({ view, query, onQueryChange, onNavigate, onOpenElection }: HallOfFamePanelProps) {
  const metricLabel = query.rankBy === "netWorth" ? "Net worth" : "Legacy Score";
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
          {view.total} recorded {view.total === 1 ? "life" : "lives"} on this device. The cross-player leaderboard lives on the
          authoritative server and is not available offline.
        </p>
      </div>

      <div className="ahd-card ahd-card-pad" aria-label="Standings filters">
        <div role="group" aria-label="Leaderboard scope" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <FilterButton
            pressed={query.scope === "all"}
            onClick={() => onQueryChange({ ...query, scope: "all" })}
            label="Show every recorded life"
          >
            Every life
          </FilterButton>
          <FilterButton
            pressed={query.scope === "current"}
            onClick={() => onQueryChange({ ...query, scope: "current" })}
            label="Show only the current era"
          >
            Current era
          </FilterButton>
        </div>
        <div role="group" aria-label="Leaderboard ranking" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
          <FilterButton
            pressed={query.rankBy === "legacy"}
            onClick={() => onQueryChange({ ...query, rankBy: "legacy" })}
            label="Rank by Legacy Score"
          >
            Legacy Score
          </FilterButton>
          <FilterButton
            pressed={query.rankBy === "netWorth"}
            onClick={() => onQueryChange({ ...query, rankBy: "netWorth" })}
            label="Rank by net worth"
          >
            Net worth
          </FilterButton>
        </div>
      </div>

      <section className="ahd-card ahd-card-pad" aria-label="Hall of Fame standings section">
        <h2 className="ahd-h2">Standings</h2>
        {view.entries.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>
            No recorded lives match these filters. There are no unresolved races to show instead.
          </div>
        ) : (
          <div className="ahd-mp-wallet-table" style={{ marginTop: "0.55rem" }}>
            <table aria-label="Hall of Fame standings">
              <caption className="ahd-muted" style={{ fontSize: "0.72rem", textAlign: "left", paddingBottom: "0.4rem" }}>
                Ranked by {query.rankBy === "netWorth" ? "forex-normalized net worth" : "the Legacy Score composite"}.
                Showing the top {page.length} of {view.total}
                {shown.length > page.length ? ", plus your pinned row" : ""}. Choosing a name opens that
                life&apos;s profile.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Name</th>
                  <th scope="col">Highest office</th>
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
                        onClick={() => onNavigate?.(entry.profileRoute)}
                        disabled={!onNavigate}
                        aria-label={`${entry.name}, your character, open profile`}
                        style={{ minHeight: "2.75rem" }}
                      >
                        {entry.name}
                        {entry.isPlayer ? " (you)" : ""}
                      </button>
                      <div className="ahd-muted" style={{ fontSize: "0.68rem" }}>{entry.era}</div>
                    </td>
                    <td>{entry.highestOffice ?? "No office held"}</td>
                    <td>{formatAmount(query.rankBy === "netWorth" ? entry.netWorth : entry.score)}</td>
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

      {player && (
        <section className="ahd-card ahd-card-pad" aria-label="Life details">
          <h2 className="ahd-h2">Life details</h2>
          <dl style={{ margin: "0.55rem 0 0", display: "grid", gap: "0.3rem", fontSize: "0.78rem" }}>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Legacy Score</dt>
              <dd style={{ margin: 0 }}>{formatAmount(player.score)}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Net worth</dt>
              <dd style={{ margin: 0 }}>{formatAmount(player.netWorth)}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Current office</dt>
              <dd style={{ margin: 0 }}>{player.office ?? "None"}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Country</dt>
              <dd style={{ margin: 0 }}>{player.countryName}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Party</dt>
              <dd style={{ margin: 0 }}>{player.partyName ?? "No party"}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Home region</dt>
              <dd style={{ margin: 0 }}>
                {player.homeRegion ? (
                  <button
                    type="button"
                    className="ahd-btn ahd-btn-ghost ahd-btn-sm"
                    onClick={() => onNavigate?.("regions", player.homeRegion!.id)}
                    disabled={!onNavigate}
                    aria-label={`${player.homeRegion.name}, open region details`}
                    style={{ minHeight: "2.75rem" }}
                  >
                    {player.homeRegion.name}
                  </button>
                ) : (
                  "Not recorded"
                )}
              </dd>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Score breakdown</dt>
              <dd style={{ margin: 0 }}>
                influence {formatAmount(player.scoreBreakdown.nationalInfluence + player.scoreBreakdown.partyInfluence)},
                {" "}achievements {formatAmount(player.scoreBreakdown.achievements)},
                {" "}office {formatAmount(player.scoreBreakdown.officeTier)},
                {" "}infamy {formatAmount(player.scoreBreakdown.infamyPenalty)},
                {" "}wealth {formatAmount(player.scoreBreakdown.wealth)}
              </dd>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <dt className="ahd-muted">Net worth breakdown</dt>
              <dd style={{ margin: 0 }}>
                cash {formatAmount(player.netWorthBreakdown.personal)},
                {" "}savings {formatAmount(player.netWorthBreakdown.savings)},
                {" "}shares {formatAmount(player.netWorthBreakdown.shares)},
                {" "}bonds {formatAmount(player.netWorthBreakdown.bonds)},
                {" "}index funds {formatAmount(player.netWorthBreakdown.indexFunds)}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
