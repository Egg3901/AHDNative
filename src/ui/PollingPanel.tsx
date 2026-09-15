/**
 * PollingPanel: readable display of commissioned poll results.
 *
 * Hierarchy mirrors the AHDGame poll results view
 * (src/app/actions/poll/components/pollResults: stat cards, top/bottom
 * groups, per-category breakdown, in-race projection, timestamp banner):
 * mobile layout adapts, the result fields do not.
 */
import type { PollingView, StoredPollView } from "../game/types";

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function GroupList({ groups, empty }: { groups: StoredPollView["topGroups"]; empty: string }) {
  if (groups.length === 0) return <p className="ahd-muted" style={{ fontSize: "0.76rem" }}>{empty}</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      {groups.map((group) => (
        <li key={group.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.78rem" }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {group.name}
            <span className="ahd-muted"> · appeal {group.appeal} · turnout {group.turnoutPct}%</span>
            {group.estimatedSharePct !== undefined ? (
              <span className="ahd-muted"> · share {group.estimatedSharePct}%</span>
            ) : null}
          </span>
          <strong style={{ flexShrink: 0 }}>{formatCount(group.weightedPotential)}</strong>
        </li>
      ))}
    </ul>
  );
}

function PollCard({ snapshot, title }: { snapshot: StoredPollView; title: string }) {
  return (
    <article aria-label={title} className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      <div>
        <div style={{ fontWeight: 750, fontSize: "0.86rem" }}>{title}</div>
        <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>
          {snapshot.homeRegion} · turn {snapshot.takenAtTurn}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        <span className="ahd-badge" aria-label={`Topline appeal ${snapshot.overallAppeal}`}>
          Appeal {snapshot.overallAppeal}
        </span>
        <span className="ahd-badge" aria-label={`${snapshot.totalEstimatedVoters} likely voters`}>
          {formatCount(snapshot.totalEstimatedVoters)} likely voters
        </span>
        <span className="ahd-badge" aria-label={`${snapshot.totalPotentialVoters} reachable voters`}>
          {formatCount(snapshot.totalPotentialVoters)} reachable
        </span>
      </div>
      {snapshot.inRace ? (
        <div style={{ fontSize: "0.78rem" }} aria-label="Projected vote">
          Projected vote: <strong>You {formatCount(snapshot.inRace.myVotes)}</strong>
          {snapshot.inRace.opponents.map((opp) => (
            <span key={opp.id}>
              {" "}vs {opp.name}{opp.party ? ` (${opp.party})` : ""} {formatCount(opp.votes)}
            </span>
          ))}
        </div>
      ) : null}
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: "0.25rem" }}>Strongest groups</div>
        <GroupList groups={snapshot.topGroups} empty="No group data." />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: "0.25rem" }}>Weakest groups</div>
        <GroupList groups={snapshot.bottomGroups} empty="No group data." />
      </div>
      {snapshot.categories ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {snapshot.categories.map((category) => (
            <details key={category.id}>
              <summary style={{ fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
                {category.name} · {formatCount(category.totalPotentialVoters)} reachable
              </summary>
              <div style={{ marginTop: "0.3rem" }}>
                <GroupList groups={category.groups} empty="No groups in this category." />
              </div>
            </details>
          ))}
        </div>
      ) : null}
      {snapshot.granular.cells.length > 0 ? (
        <details>
          <summary style={{ fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
            Granular electorate · {snapshot.granular.dimensions.join(", ")}
          </summary>
          <ul style={{ listStyle: "none", margin: "0.35rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {snapshot.granular.cells.map((cell) => (
              <li key={cell.id} style={{ fontSize: "0.76rem" }}>
                {cell.label}: {cell.sharePct}% electorate · turnout {cell.turnoutPct}% · you {cell.playerSharePct}% · undecided {cell.undecidedPct}%
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

export function PollingPanel({ polls }: { polls: PollingView }) {
  const { quick, full } = polls;
  if (!quick && !full) {
    return (
      <section aria-label="Latest polls" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Latest polls</h2>
        <p className="ahd-muted" style={{ fontSize: "0.78rem" }}>
          No polls yet. Commission a Quick Poll or a Full Demographic Poll under Intelligence to read the electorate.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Latest polls" className="ahd-stack">
      <h2 className="ahd-h2">Latest polls</h2>
      {quick ? <PollCard snapshot={quick} title="Quick Poll" /> : null}
      {full ? <PollCard snapshot={full} title="Full Demographic Poll" /> : null}
    </section>
  );
}
