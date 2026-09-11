import { formatFinanceMoney } from "./FinancePanel";
/**
 * PoliticsPanel: per party detail, per election detail with its candidate
 * roster, and the country politician roster.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/app/parties/page.tsx (party list with member counts) and
 *   src/app/parties/[id]/page.tsx (party detail with platform and roster),
 *   src/app/elections/page.tsx with electionsHelpers.ts (race list grouped
 *   by status with candidate names) and src/components/ElectionLog.tsx
 *   (candidate rows with winner marking). No server or Next.js imports;
 *   props arrive through the PoliticsView DTO. Section navigation is owned
 *   by root. Vote figures render only when the projection carries tally
 *   backed totals; campaign strength is never shown as vote share.
 */
import { useEffect, useMemo, useState } from "react";
import type { GameScreenProps } from "../game/types";
import type {
  PoliticsElectionDetail, PoliticsPartyDetail, PoliticsPlayerCampaignView,
  PoliticsPoliticianView, PoliticsProjectionView, PoliticsView,
} from "../game/politics";

export interface PoliticsPanelProps {
  politics: PoliticsView;
  section: "parties" | "elections" | "campaign" | "politicians";
  busy: boolean;
  initialId?: string;
  onOpenElection?: (id: string) => void;
  onOpenCampaign?: (id: string) => void;
  onAction: GameScreenProps["onAction"];
}

const score = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const ROSTER_PAGE_SIZE = 12;

function PartyRoster({ names, busy }: { names: string[]; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return names;
    return names.filter((name) => name.toLowerCase().includes(needle));
  }, [names, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / ROSTER_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const pageNames = filtered.slice(safePage * ROSTER_PAGE_SIZE, (safePage + 1) * ROSTER_PAGE_SIZE);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(0, p), Math.max(0, Math.ceil(filtered.length / ROSTER_PAGE_SIZE) - 1)));
  }, [filtered.length]);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      style={{ marginTop: "0.55rem" }}
    >
      <summary
        style={{ cursor: "pointer", fontWeight: 750, fontSize: "0.78rem", minHeight: 44, paddingBlock: "0.65rem", boxSizing: "border-box" }}
      >
        {`Roster (${names.length})`}
      </summary>
      {open ? (
        <div style={{ marginTop: "0.35rem" }}>
          <label className="ahd-field" style={{ maxWidth: "20rem" }}>
            <span className="ahd-label">Search</span>
            <input
              className="ahd-input"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Name"
              aria-label="Search roster"
              disabled={busy}
            />
          </label>
          <div className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }} aria-live="polite">
            {filtered.length} of {names.length} recorded
          </div>
          {filtered.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No members match this search.</div>
          ) : (
            <ul aria-label="Party roster" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {pageNames.map((name, i) => (
                <li key={`${safePage}-${i}-${name}`} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.4rem", fontSize: "0.8rem" }}>
                  {name}
                </li>
              ))}
            </ul>
          )}
          {filtered.length > ROSTER_PAGE_SIZE && pageCount > 1 ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.4rem", flexWrap: "wrap" }}>
              <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setPage(safePage - 1)} disabled={busy || safePage === 0} aria-label="Previous roster page">
                Previous
              </button>
              <span className="ahd-muted" style={{ fontSize: "0.74rem" }} aria-live="polite">
                Page {safePage + 1} of {pageCount}
              </span>
              <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setPage(safePage + 1)} disabled={busy || safePage >= pageCount - 1} aria-label="Next roster page">
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

function ideologyLabel(value: number, axis: "econ" | "social"): string {
  if (axis === "econ") {
    if (value <= -3) return "Far left";
    if (value < 0) return "Left";
    if (value === 0) return "Centrist";
    if (value <= 3) return "Right";
    return "Far right";
  }
  if (value <= -3) return "Libertarian";
  if (value < 0) return "Liberal";
  if (value === 0) return "Moderate";
  if (value <= 3) return "Conservative";
  return "Authoritarian";
}

function PartiesSection({ politics, busy, onAction, initialId }: Omit<PoliticsPanelProps, "section">) {
  const [selectedId, setSelectedId] = useState(initialId ?? politics.parties[0]?.id ?? "");
  useEffect(() => {
    if (!politics.parties.some((p) => p.id === selectedId)) setSelectedId(politics.parties[0]?.id ?? "");
  }, [politics.parties, selectedId]);
  const selected = politics.parties.find((p) => p.id === selectedId) ?? null;

  const fire = (party: PoliticsPartyDetail, kind: "join" | "leave") => {
    const action = kind === "join" ? party.join : party.leave;
    if (busy || !action.available) return;
    if (kind === "join") onAction(action.id, { partyId: party.id });
    else onAction(action.id, undefined);
  };

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Parties</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {politics.parties.length} parties in {politics.countryName}
        </p>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Switching parties or leaving your party withdraws your candidacy.
        </p>
      </div>
      {politics.parties.length === 0 ? <div className="ahd-empty">No parties in this country.</div> : (
        <label className="ahd-field" style={{ maxWidth: "20rem" }}>
          <span className="ahd-label">Party</span>
          <select className="ahd-select" aria-label="Party" value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
            {politics.parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.abbreviation}){p.isPlayerParty ? " [yours]" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected ? (
        <article aria-label={selected.name} className="ahd-card ahd-card-pad" style={{ borderLeft: `3px solid ${selected.color}` }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.9rem" }}>{selected.name}</strong>
            <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>({selected.abbreviation})</span>
            {selected.isPlayerParty ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Yours</span> : null}
          </div>
          <dl style={{ marginTop: "0.6rem", display: "grid", gap: "0.35rem" }}>
            <div className="ahd-kv"><dt>Platform</dt><dd>{ideologyLabel(selected.economicPosition, "econ")} ({selected.economicPosition}) · {ideologyLabel(selected.socialPosition, "social")} ({selected.socialPosition})</dd></div>
            <div className="ahd-kv"><dt>Tier</dt><dd>{selected.tier}</dd></div>
            <div className="ahd-kv"><dt>Organization</dt><dd className="ahd-mono">{score(selected.organization)}</dd></div>
            <div className="ahd-kv"><dt>Strength</dt><dd className="ahd-mono">{score(selected.politicalStrength)}</dd></div>
            <div className="ahd-kv"><dt>Members</dt><dd className="ahd-mono">{selected.members.toLocaleString()}</dd></div>
            <div className="ahd-kv"><dt>Treasury</dt><dd className="ahd-mono">{formatFinanceMoney(selected.treasury, politics.currency)}</dd></div>
            <div className="ahd-kv"><dt>Leader</dt><dd>{selected.leaderName ?? "Vacant"}</dd></div>
            {selected.viceLeaderName ? <div className="ahd-kv"><dt>Deputy</dt><dd>{selected.viceLeaderName}</dd></div> : null}
            {selected.treasurerName ? <div className="ahd-kv"><dt>Treasurer</dt><dd>{selected.treasurerName}</dd></div> : null}
          </dl>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.6rem" }}>
            {selected.isPlayerParty ? (
              <span style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm"
                  disabled={busy || !selected.leave.available} aria-disabled={busy || !selected.leave.available}
                  aria-label={`Leave ${selected.name}`}
                  onClick={() => fire(selected, "leave")}>
                  Leave {selected.name}
                </button>
                <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                  {!selected.leave.available ? (selected.leave.disabledReason ?? "Unavailable")
                    : selected.leave.cost > 0 ? `Cost ${selected.leave.cost} actions` : "Free"}
                </span>
              </span>
            ) : (
              <span style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm"
                  disabled={busy || !selected.join.available} aria-disabled={busy || !selected.join.available}
                  aria-label={`Join ${selected.name}`}
                  onClick={() => fire(selected, "join")}>
                  Join {selected.name}
                </button>
                <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                  {!selected.join.available ? (selected.join.disabledReason ?? "Unavailable")
                    : selected.join.cost > 0 ? `Cost ${selected.join.cost} actions` : "Free"}
                </span>
              </span>
            )}
          </div>
          {selected.isPlayerParty && !selected.leave.available && selected.leave.disabledReason
            ? <p className="ahd-help" role="note">{selected.leave.disabledReason}</p> : null}
          {!selected.isPlayerParty && !selected.join.available && selected.join.disabledReason
            ? <p className="ahd-help" role="note">{selected.join.disabledReason}</p> : null}
          {selected.memberNames.length > 0
            ? <PartyRoster key={selected.id} names={selected.memberNames} busy={busy} />
            : null}
        </article>
      ) : null}
    </div>
  );
}

function ProjectionBlock({ projection }: { projection: PoliticsProjectionView }) {
  return (
    <section aria-label="Race projection" style={{ marginTop: "0.6rem" }}>
      <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>
        Standing
      </h4>
      {projection.countedVotes != null ? (
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0" }}>
          {projection.countedVotes.toLocaleString()} votes counted so far
          {projection.snapshotTurn != null ? ` (turn ${projection.snapshotTurn})` : ""}
        </p>
      ) : (
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0" }}>
          No votes counted yet.
        </p>
      )}
      {projection.leaderName && projection.leaderShare != null ? (
        <p style={{ fontSize: "0.8rem", margin: "0.15rem 0" }}>
          Counted leader: {projection.leaderName} ({(projection.leaderShare * 100).toFixed(1)}%)
          {projection.runnerUpName && projection.marginPct != null
            ? `, margin +${(projection.marginPct * 100).toFixed(1)}pt over ${projection.runnerUpName}`
            : ""}
        </p>
      ) : null}
      {projection.resolved ? null : projection.seats ? (
        <div style={{ marginTop: "0.3rem" }}>
          <p style={{ fontSize: "0.8rem", margin: "0.15rem 0" }}>
            Projected seats: {projection.seats.map((s) => `${s.name} ${s.seats}`).join(" · ")}
          </p>
          <p className="ahd-help" role="note">
            Projection from the saved tally estimate, not a result. Resolved winners replace it.
          </p>
        </div>
      ) : (
        <p className="ahd-help" role="note">
          Seat projection unavailable: the tally has not produced an estimate yet.
        </p>
      )}
      {projection.drivers.length > 0 ? (
        <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.3rem 0 0" }}>
          Drivers: {projection.drivers.map((d) => d.label).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

function CampaignBlock({ electionId, campaign, busy, onAction }: {
  electionId: string;
  campaign: PoliticsPlayerCampaignView;
  busy: boolean;
  onAction: (id: string, params?: Record<string, string | number>) => void;
}) {
  const fire = (category: string, branch: "a" | "b" | "c" | null) => {
    if (busy) return;
    onAction("campaignUpgrade", branch === null
      ? { electionId, category }
      : { electionId, category, branch });
  };
  const fireRally = () => {
    if (busy || !campaign.rally.action.available) return;
    onAction("campaignRally", { electionId });
  };
  const toggleRallyTour = () => {
    if (busy || !campaign.rally.tour.action.available) return;
    onAction("campaignRallyTour", {
      electionId,
      rallyTour: campaign.rally.tour.active ? "stop" : "start",
    });
  };
  const categoryLabel = (category: string) => category.replace(/([A-Z])/g, " $1").toLowerCase();
  const activityLabel = (entry: PoliticsPlayerCampaignView["activity"][number]) => {
    const target = entry.branch ? `branch ${entry.branch}` : "starter";
    const operation = entry.type === "upgrade" ? "upgraded" : "downgraded";
    const reason = entry.reason === "insolvency" ? " for insolvency" : "";
    return `Turn ${entry.turnNumber} · ${operation} ${categoryLabel(entry.category)} ${target} to level ${entry.newLevel}${reason}`;
  };
  return (
    <section aria-label="Campaign management" style={{ marginTop: "0.7rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem" }}>
      <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>
        Your campaign [{campaign.status}]
      </h4>
      <dl style={{ margin: 0, display: "grid", gap: "0.3rem" }}>
        <div className="ahd-kv"><dt>Treasury</dt><dd className="ahd-mono">{Math.floor(campaign.funds).toLocaleString()}</dd></div>
        <div className="ahd-kv"><dt>Campaign actions</dt><dd className="ahd-mono">{campaign.actions}</dd></div>
        <div className="ahd-kv"><dt>Income</dt><dd className="ahd-mono">+{Math.floor(campaign.incomePerTurn).toLocaleString()}/turn</dd></div>
        <div className="ahd-kv"><dt>Upkeep</dt><dd className="ahd-mono">-{Math.floor(campaign.maintenancePerTurn).toLocaleString()}/turn</dd></div>
        <div className="ahd-kv"><dt>Recent spend</dt><dd className="ahd-mono">{Math.floor(campaign.spendStock + campaign.spendThisTurn).toLocaleString()} feeding the money driver</dd></div>
        {campaign.support != null ? (
          <div className="ahd-kv"><dt>Candidate support</dt><dd className="ahd-mono">{campaign.support.toFixed(1)} (mood input, not a vote forecast)</dd></div>
        ) : null}
      </dl>
      <section aria-label="Campaign rally" style={{ marginTop: "0.6rem" }}>
        <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Campaign rally</h4>
        <p className="ahd-help" style={{ margin: "0 0 0.35rem" }}>
          +{campaign.rally.immediateSupport.toFixed(1)} support now, then +{campaign.rally.pendingPerTurn.toFixed(2)} per turn for {campaign.rally.pendingTurns} turns.
        </p>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="ahd-btn ahd-btn-sm"
            disabled={busy || !campaign.rally.action.available}
            aria-disabled={busy || !campaign.rally.action.available}
            aria-label="Fire campaign rally"
            onClick={fireRally}>
            Rally ({campaign.rally.action.cost} actions)
          </button>
          {!campaign.rally.action.available ? (
            <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{campaign.rally.action.disabledReason ?? "Unavailable"}</span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.35rem" }}>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
            Rally tour: {campaign.rally.tour.active ? "active" : "off"} ({campaign.rally.tour.tickCost} actions/turn)
          </span>
          <button type="button" className="ahd-btn ahd-btn-sm"
            disabled={busy || !campaign.rally.tour.action.available}
            aria-disabled={busy || !campaign.rally.tour.action.available}
            aria-label={campaign.rally.tour.active ? "Stop campaign rally tour" : "Start campaign rally tour"}
            onClick={toggleRallyTour}>
            {campaign.rally.tour.active ? "Stop tour" : "Start tour"}
          </button>
          {!campaign.rally.tour.action.available ? (
            <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{campaign.rally.tour.action.disabledReason ?? "Unavailable"}</span>
          ) : null}
        </div>
      </section>
      {campaign.generalPhase ? (
        <p className="ahd-help" role="note">General phase: upgrade costs carry the 1.5x surcharge.</p>
      ) : null}
      {campaign.activity.length > 0 ? (
        <section aria-label="Campaign activity" style={{ marginTop: "0.65rem" }}>
          <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Recent activity</h4>
          <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {[...campaign.activity].reverse().map((entry) => (
              <li key={`${entry.turnNumber}-${entry.category}-${entry.branch ?? "starter"}-${entry.newLevel}-${entry.type}`} style={{ fontSize: "0.76rem" }}>
                {activityLabel(entry)}
                {entry.costFunds != null || entry.costActions != null ? (
                  <span className="ahd-muted"> · {entry.costFunds != null ? `${Math.floor(entry.costFunds).toLocaleString()} funds` : ""}{entry.costFunds != null && entry.costActions != null ? " + " : ""}{entry.costActions != null ? `${entry.costActions} actions` : ""}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {campaign.levers.map((lever) => (
        <details key={lever.category} style={{ marginTop: "0.45rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", minHeight: 44, paddingBlock: "0.65rem", boxSizing: "border-box" }}>
            {lever.category}{lever.started ? "" : " (locked)"}
          </summary>
          {!lever.started && lever.starterUpgrade ? (
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.3rem" }}>
              <button type="button" className="ahd-btn ahd-btn-sm"
                disabled={busy || !lever.starterUpgrade.available}
                aria-disabled={busy || !lever.starterUpgrade.available}
                aria-label={`Unlock ${lever.category} starter`}
                onClick={() => fire(lever.category, null)}>
                Unlock ({lever.starterFunds != null ? Math.ceil(lever.starterFunds).toLocaleString() : "?"}
                {lever.starterActions != null ? ` + ${lever.starterActions} actions` : ""})
              </button>
              <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                {!lever.starterUpgrade.available ? (lever.starterUpgrade.disabledReason ?? "Unavailable")
                  : (lever.starterEffect ?? "")}
              </span>
            </div>
          ) : null}
          {lever.started ? (
            <ul style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {lever.branches.map((b) => (
                <li key={b.branch} style={{ fontSize: "0.78rem" }}>
                  <span style={{ fontWeight: 650 }}>Branch {b.branch}</span>
                  <span className="ahd-muted"> · level {b.level}/{b.maxLevel}</span>
                  {b.maxed ? <span className="ahd-muted"> · maxed</span> : (
                    <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", marginLeft: "0.4rem", flexWrap: "wrap" }}>
                      <button type="button" className="ahd-btn ahd-btn-sm"
                        disabled={busy || !b.upgrade.available}
                        aria-disabled={busy || !b.upgrade.available}
                        aria-label={`Upgrade ${lever.category} branch ${b.branch}`}
                        onClick={() => fire(lever.category, b.branch)}>
                        Upgrade ({b.nextFunds != null ? Math.ceil(b.nextFunds).toLocaleString() : "?"}
                        {b.nextActions != null ? ` + ${b.nextActions}` : ""})
                      </button>
                      <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                        {!b.upgrade.available ? (b.upgrade.disabledReason ?? "Unavailable") : (b.nextEffect ?? "")}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      ))}
    </section>
  );
}

type ElectionStatusFilter = "all" | "upcoming" | "active" | "resolved";

function ElectionsSection({ politics, busy, onAction, initialId, onOpenCampaign }: Omit<PoliticsPanelProps, "section">) {
  const [status, setStatus] = useState<ElectionStatusFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [decidedOnly, setDecidedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(initialId ?? "");

  const filtered = useMemo(() => politics.elections.filter((e) =>
    (status === "all" || e.status === status)
    && (!mineOnly || e.playerCandidate)
    && (!decidedOnly || e.winnerNames.length > 0),
  ), [politics.elections, status, mineOnly, decidedOnly]);

  useEffect(() => {
    if (!filtered.some((e) => e.id === selectedId)) setSelectedId(filtered[0]?.id ?? "");
  }, [filtered, selectedId]);

  const selected = filtered.find((e) => e.id === selectedId) ?? null;
  const fire = (election: PoliticsElectionDetail) => {
    if (busy || !election.candidacy.available) return;
    onAction(election.candidacy.id, { electionId: election.id });
  };

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Elections</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {filtered.length} of {politics.elections.length} races
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "flex-end" }}>
          <label className="ahd-field" style={{ maxWidth: "12rem" }}>
            <span className="ahd-label">Status</span>
            <select className="ahd-select" aria-label="Race status" value={status}
              onChange={(e) => setStatus(e.target.value as ElectionStatusFilter)} disabled={busy}>
              <option value="all">All</option>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.78rem" }}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} disabled={busy} aria-label="Only my races" />
            Only my races
          </label>
          <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.78rem" }}>
            <input type="checkbox" checked={decidedOnly} onChange={(e) => setDecidedOnly(e.target.checked)} disabled={busy} aria-label="Only decided races" />
            Only decided
          </label>
        </div>
      </div>

      {filtered.length === 0 ? <div className="ahd-empty">No races match these filters.</div> : (
        <label className="ahd-field" style={{ maxWidth: "22rem" }}>
          <span className="ahd-label">Race</span>
          <select className="ahd-select" aria-label="Race" value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
            {filtered.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} [{e.status}]{e.playerCandidate ? " [filed]" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {selected ? (
        <article aria-label={selected.title} className="ahd-card ahd-card-pad">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.9rem" }}>{selected.title}</strong>
            {selected.playerCandidate ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Filed</span> : null}
          </div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
            {selected.status} · {selected.date}
          </div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>Filing deadline: {selected.filingDate}</div>

          <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0.6rem 0 0.25rem" }}>
            Candidates ({selected.candidates.length})
          </h4>
          {selected.candidates.length === 0 ? <div className="ahd-empty">No filed candidates.</div> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {selected.candidates.map((c) => (
                <li key={c.id} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.4rem", fontSize: "0.8rem" }}>
                  <span style={{ fontWeight: 650 }}>{c.name}</span>
                  <span className="ahd-muted"> · {c.partyName}</span>
                  {c.incumbent ? <span className="ahd-muted"> · incumbent</span> : null}
                  {c.isPlayer ? <span className="ahd-muted"> · you</span> : null}
                  {c.winner ? <span style={{ fontWeight: 750 }}> · winner</span> : null}
                  {c.votes != null ? (
                    <span className="ahd-mono ahd-muted" style={{ display: "block", fontSize: "0.76rem" }}>
                      {c.votes.toLocaleString()} votes{c.voteShare != null ? ` (${(c.voteShare * 100).toFixed(1)}%)` : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <ProjectionBlock projection={selected.projection} />
          {selected.winnerNames.length > 0 ? (
            <p style={{ fontSize: "0.8rem", margin: "0.35rem 0 0" }}>Winners: {selected.winnerNames.join(", ")}</p>
          ) : null}
          {selected.playerCampaign ? (
            <section aria-label="Your campaign" style={{ marginTop: "0.7rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem" }}>
              <h4 style={{ fontSize: "0.78rem", margin: "0 0 0.3rem" }}>Your campaign</h4>
              <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0 0 0.4rem" }}>
                {Math.floor(selected.playerCampaign.funds).toLocaleString()} funds · {selected.playerCampaign.actions} actions
              </p>
              {onOpenCampaign ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onOpenCampaign(selected.id)} disabled={busy}>Manage campaign</button> : null}
            </section>
          ) : null}

          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.55rem" }}>
            <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm"
              disabled={busy || !selected.candidacy.available}
              aria-disabled={busy || !selected.candidacy.available}
              aria-label={selected.candidacy.id === "withdrawCandidacy" ? "Withdraw candidacy" : "Run for office"}
              onClick={() => fire(selected)}>
              {selected.candidacy.id === "withdrawCandidacy" ? "Withdraw candidacy" : "Run for office"}
            </button>
            <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
              {!selected.candidacy.available ? (selected.candidacy.disabledReason ?? "Unavailable")
                : selected.candidacy.cost > 0 ? `Cost ${selected.candidacy.cost} actions` : "Free"}
            </span>
          </div>
          {!selected.candidacy.available && selected.candidacy.disabledReason
            ? <p className="ahd-help" role="note">{selected.candidacy.disabledReason}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

function CampaignSection({ politics, busy, onAction, initialId }: Omit<PoliticsPanelProps, "section">) {
  const election = politics.elections.find((item) => item.id === initialId)
    ?? politics.elections.find((item) => item.playerCampaign !== null)
    ?? null;
  if (!election?.playerCampaign) {
    return <div className="ahd-empty">No active player campaign is available.</div>;
  }
  return (
    <div className="ahd-stack">
      <article className="ahd-card ahd-card-pad" aria-label={`Campaign for ${election.title}`}>
        <h2 className="ahd-h2">{election.title}</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {election.status} · election day {election.date}
        </p>
        <CampaignBlock electionId={election.id} campaign={election.playerCampaign} busy={busy} onAction={onAction} />
      </article>
    </div>
  );
}

function PoliticiansSection({ politics, busy, onOpenElection, initialId }: Omit<PoliticsPanelProps, "section" | "onAction">) {
  const [partyId, setPartyId] = useState("all");
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const filtered = useMemo(() => politics.politicians.filter((p) => partyId === "all" || p.partyId === partyId),
    [politics.politicians, partyId]);
  useEffect(() => {
    if (!filtered.some((p) => p.id === selectedId)) setSelectedId(filtered[0]?.id ?? "");
  }, [filtered, selectedId]);
  const selected: PoliticsPoliticianView | null = filtered.find((p) => p.id === selectedId) ?? null;
  const raceTitle = (id: string) => politics.elections.find((e) => e.id === id)?.title ?? id;

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Politicians</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {filtered.length} of {politics.politicians.length} in {politics.countryName}
        </p>
        <label className="ahd-field" style={{ maxWidth: "16rem", marginTop: "0.5rem" }}>
          <span className="ahd-label">Party</span>
          <select className="ahd-select" aria-label="Politician party" value={partyId}
            onChange={(e) => { setPartyId(e.target.value); }} disabled={busy}>
            <option value="all">All parties</option>
            {politics.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? <div className="ahd-empty">No politicians match this filter.</div> : (
        <label className="ahd-field" style={{ maxWidth: "20rem" }}>
          <span className="ahd-label">Politician</span>
          <select className="ahd-select" aria-label="Politician" value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
            {filtered.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.partyName})</option>)}
          </select>
        </label>
      )}
      {selected ? (
        <article aria-label={selected.name} className="ahd-card ahd-card-pad">
          <strong style={{ fontSize: "0.9rem" }}>{selected.name}</strong>
          <span className="ahd-muted" style={{ fontSize: "0.76rem" }}> · {selected.partyName}</span>
          <dl style={{ marginTop: "0.6rem", display: "grid", gap: "0.35rem" }}>
            <div className="ahd-kv"><dt>Office</dt><dd>{selected.office ?? "No seat"}</dd></div>
            <div className="ahd-kv"><dt>Age</dt><dd className="ahd-mono">{selected.age}</dd></div>
            <div className="ahd-kv"><dt>Outlook</dt><dd>{ideologyLabel(selected.economic, "econ")} · {ideologyLabel(selected.social, "social")}</dd></div>
            <div className="ahd-kv"><dt>Influence</dt><dd className="ahd-mono">{score(selected.influence)}</dd></div>
            <div className="ahd-kv"><dt>Favorability</dt><dd className="ahd-mono">{score(selected.favorability)}</dd></div>
            <div className="ahd-kv"><dt>Infamy</dt><dd className="ahd-mono">{score(selected.infamy)}</dd></div>
            <div className="ahd-kv"><dt>Active races</dt><dd>{selected.activeRaceIds.length > 0 ? selected.activeRaceIds.map(id => onOpenElection ? <button key={id} className="ahd-btn ahd-btn-sm" onClick={() => onOpenElection(id)} disabled={busy}>View {raceTitle(id)}</button> : <span key={id}>{raceTitle(id)} </span>) : "None"}</dd></div>
          </dl>
        </article>
      ) : null}
    </div>
  );
}

export function PoliticsPanel({ politics, section, busy, onAction, initialId, onOpenElection, onOpenCampaign }: PoliticsPanelProps) {
  if (section === "campaign") return <CampaignSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} />;
  if (section === "elections") return <ElectionsSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} onOpenCampaign={onOpenCampaign} />;
  if (section === "politicians") return <PoliticiansSection politics={politics} busy={busy} initialId={initialId} onOpenElection={onOpenElection} />;
  return <PartiesSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} />;
}

export default PoliticsPanel;
