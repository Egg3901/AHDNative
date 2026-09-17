import { formatFinanceMoney } from "./FinancePanel";
import { PartyMark } from "./PartyMark";
import { PartyPlatformComparison } from "./PartyPlatformComparison";
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
  PoliticsPoliticianView, PoliticsPresidentialView, PoliticsPrimaryView, PoliticsProjectionView,
  PoliticsRaceStageView, PoliticsReferendumView, PoliticsView,
} from "../game/politics";
import type { NationDestination, NationView } from "../game/nation";
import type { RacePhase } from "../game/types";
import { RACE_PHASE_LABELS } from "../game/racePhase";
import { formatGameDate, formatGameTurn, type GameClock } from "../game/gameDate";
import { MetricsSection } from "./NationPanel";
import { RouteHero, electionsHero } from "./RouteHero";

export interface PoliticsPanelProps {
  politics: PoliticsView;
  section: "parties" | "elections" | "campaign" | "politicians" | "referendums" | "presidential" | "metrics";
  busy: boolean;
  /** World clock used to render every in-game date on the reference calendar (#226). */
  clock: GameClock;
  initialId?: string;
  onOpenElection?: (id: string) => void;
  onOpenCampaign?: (id: string) => void;
  onOpenPolitician?: (id: string) => void;
  /** Opens the dedicated presidential race destination (#69) from the Elections surface. */
  onOpenPresidential?: (id: string) => void;
  /** The already-projected nation registry, reused by the political-metrics view (#69). */
  nation?: NationView;
  /** World era for the reused flag identity (#373: RU flies SU in 1979); from `world.era`. */
  era?: string | null;
  /** Navigation for registry consequence links, reused from the nation metrics view. */
  onNavigate?: (route: NationDestination, detailId?: string) => void;
  onAction: GameScreenProps["onAction"];
}

const RACE_PHASE_ORDER: RacePhase[] = ["upcoming", "primary", "general", "resolved"];
const STAGE_STATE_LABELS: Record<PoliticsRaceStageView["state"], string> = {
  upcoming: "Upcoming",
  current: "Current",
  done: "Done",
};

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
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">Parties</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {politics.parties.length} parties in {politics.countryName}
        </p>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Switching parties or leaving your party withdraws your candidacy.
        </p>
      </div>
      {/* Dual-pane list/detail pairing (#438): the comparison/select list and
          the selected-party detail share the existing selection state; the
          shell places them on separate panes only when a hinge is reported.
          Single-pane renders the same stack as before. */}
      <div className="ahd-dual-panes">
      <div data-pane="list" className="ahd-stack">
      {politics.parties.length === 0 ? <div className="ahd-empty">No parties in this country.</div> : (
        <>
          <PartyPlatformComparison
            parties={politics.parties.map((p) => ({
              id: p.id, name: p.name, abbreviation: p.abbreviation, color: p.color,
              economicPosition: p.economicPosition, socialPosition: p.socialPosition,
              isPlayerParty: p.isPlayerParty,
            }))}
            selectedId={selected?.id ?? ""}
            onSelect={setSelectedId}
          />
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
        </>
      )}
      </div>
      {selected ? (
        <article data-pane="detail" aria-label={selected.name} className="ahd-card ahd-card-pad" style={{ borderLeft: `3px solid ${selected.color}` }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <PartyMark name={selected.name} abbreviation={selected.abbreviation} color={selected.color} id={selected.id} countryId={politics.countryId} logoUrl={selected.logoUrl} size={28} />
            <strong style={{ fontSize: "0.9rem" }}>{selected.name}</strong>
            <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>({selected.abbreviation})</span>
            {selected.isPlayerParty ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Yours</span> : null}
          </div>
          <dl className="ahd-kv-grid" style={{ marginTop: "0.6rem" }}>
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
      {projection.projected ? (
        <div style={{ marginTop: "0.3rem" }}>
          {projection.projected.leaderName && projection.projected.leaderShare != null ? (
            <p style={{ fontSize: "0.8rem", margin: "0.15rem 0" }}>
              Projected leader: {projection.projected.leaderName} ({(projection.projected.leaderShare * 100).toFixed(1)}%)
              {projection.projected.marginPct != null
                ? `, margin +${(projection.projected.marginPct * 100).toFixed(1)}pt` : ""}
            </p>
          ) : null}
          <p className="ahd-help" role="note">{projection.projected.note}</p>
        </div>
      ) : null}
    </section>
  );
}

function RaceStages({ stages }: { stages: PoliticsRaceStageView[] }) {
  return (
    <section aria-label="Race stages" style={{ marginTop: "0.6rem" }}>
      <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Race stages</h4>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {stages.map((stage) => (
          <li key={stage.key} style={{ fontSize: "0.76rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.3rem" }}>
            <span style={{ fontWeight: 700 }}>{stage.label}</span>
            <span className="ahd-pill" style={{ fontSize: "0.66rem", marginLeft: "0.35rem" }}>{STAGE_STATE_LABELS[stage.state]}</span>
            <span className="ahd-muted">{` · ${stage.when}`}</span>
            <span className="ahd-muted" style={{ display: "block" }}>{stage.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PrimaryBlock({ primary }: { primary: PoliticsPrimaryView }) {
  return (
    <section aria-label="Primary" style={{ marginTop: "0.6rem" }}>
      <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Primary</h4>
      {!primary.applicable ? (
        <p className="ahd-help" role="note">No primary phase applies to this race.</p>
      ) : (
        <>
          {primary.resolved ? (
            <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0" }}>
              Nominees recorded.
            </p>
          ) : null}
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0" }}>
            {primary.totalBallots != null
              ? `${primary.totalBallots.toLocaleString()} party ballots counted${primary.snapshotTurn != null ? ` (turn ${primary.snapshotTurn})` : ""}`
              : primary.open ? "Primary is open; no ballots counted yet." : "Primary has not opened yet."}
          </p>
          {primary.parties.length === 0 ? (
            <p className="ahd-help" role="note">No primary standings recorded yet.</p>
          ) : primary.parties.map((party) => (
            <div key={party.partyId} style={{ marginTop: "0.3rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 650 }}>{party.partyName}</div>
              <ul style={{ listStyle: "none", margin: "0.15rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {party.entries.map((entry) => (
                  <li key={entry.candidateId} style={{ fontSize: "0.78rem" }}>
                    <span style={{ fontWeight: entry.won ? 700 : 400 }}>{entry.name}</span>
                    <span className="ahd-muted">{` · ${entry.sharePct.toFixed(1)}%`}{entry.won ? " · nominee" : ""}</span>
                    {entry.ballots != null ? (
                      <span className="ahd-mono ahd-muted">{` · ${entry.ballots.toLocaleString()} ballots`}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="ahd-help" role="note">
            Primary ballots are counted separately from general votes and are not a forecast.
          </p>
        </>
      )}
    </section>
  );
}

function CampaignBlock({ electionId, campaign, busy, onAction, currency }: {
  electionId: string;
  campaign: PoliticsPlayerCampaignView;
  busy: boolean;
  currency: string;
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
  const [oppositionTargetId, setOppositionTargetId] = useState(campaign.oppositionResearch.targetId ?? "");
  useEffect(() => {
    setOppositionTargetId(campaign.oppositionResearch.targetId ?? "");
  }, [campaign.oppositionResearch.targetId]);
  const [managerId, setManagerId] = useState(campaign.manager.managerId ?? "");
  useEffect(() => {
    setManagerId(campaign.manager.managerId ?? "");
  }, [campaign.manager.managerId]);
  const [canvassTarget, setCanvassTarget] = useState("");
  useEffect(() => {
    setCanvassTarget((current) => campaign.canvassing.targets.some((target) =>
      `${target.category}:${target.group}` === current) ? current : "");
  }, [campaign.canvassing.targets]);
  const [targetedAdTarget, setTargetedAdTarget] = useState("");
  useEffect(() => {
    setTargetedAdTarget((current) => campaign.targetedAds.targets.some((target) =>
      `${target.category}:${target.group}` === current) ? current : "");
  }, [campaign.targetedAds.targets]);
  const [strengthTargetId, setStrengthTargetId] = useState("player");
  useEffect(() => {
    setStrengthTargetId((current) =>
      campaign.strength.targets.some((target) => target.candidateId === current)
        ? current
        : campaign.strength.targets.find((target) => target.isPlayer)?.candidateId
          ?? campaign.strength.targets[0]?.candidateId ?? "player");
  }, [campaign.strength.targets]);
  const selectedTargetedAd = campaign.targetedAds.targets.find((target) =>
    `${target.category}:${target.group}` === targetedAdTarget);
  const targetSelectionAvailable = campaign.oppositionResearch.action.available
    || campaign.oppositionResearch.action.disabledReason === "Select an opposition target.";
  const retarget = () => {
    if (busy || !campaign.oppositionResearch.action.available || !oppositionTargetId) return;
    onAction("campaignRetarget", { electionId, oppositionTargetId });
  };
  const saveManager = () => {
    if (busy || !campaign.manager.action.available) return;
    onAction("campaignManager", { electionId, managerId });
  };
  const canvass = () => {
    const target = campaign.canvassing.targets.find((candidate) =>
      `${candidate.category}:${candidate.group}` === canvassTarget);
    if (busy || !campaign.canvassing.action.available || !target || !campaign.canvassing.regionId) return;
    onAction("campaignCanvass", {
      electionId,
      regionId: campaign.canvassing.regionId,
      demographicCategory: target.category,
      demographicGroup: target.group,
    });
  };
  const buyTargetedAd = () => {
    if (busy || !campaign.targetedAds.action.available || !selectedTargetedAd || selectedTargetedAd.maxed || !campaign.targetedAds.regionId) return;
    onAction("campaignTargetedAd", {
      electionId,
      regionId: campaign.targetedAds.regionId,
      demographicCategory: selectedTargetedAd.category,
      demographicGroup: selectedTargetedAd.group,
    });
  };
  const contributeStrength = (
    quote: PoliticsPlayerCampaignView["strength"]["single"],
    clicks: number | "max",
  ) => {
    if (busy || !quote.affordable) return;
    const params: Record<string, string | number> = { electionId, clicks };
    if (strengthTargetId && strengthTargetId !== "player") params.targetCandidateId = strengthTargetId;
    onAction("campaignContribute", params);
  };
  const categoryLabel = (category: string) => category.replace(/([A-Z])/g, " $1").toLowerCase();
  const strengthQuoteText = (quote: PoliticsPlayerCampaignView["strength"]["single"]) =>
    `+${quote.strengthAdded.toLocaleString(undefined, { maximumFractionDigits: 1 })} strength for `
    + `${quote.costActions} action${quote.costActions === 1 ? "" : "s"} and ${formatFinanceMoney(quote.costFunds, currency)}`;
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
      {campaign.status === "archived" ? (
        <p className="ahd-help" role="note" style={{ margin: "0 0 0.4rem" }}>
          Archived campaign: management is read-only.
        </p>
      ) : null}
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
      <section aria-label="Campaign strength" style={{ marginTop: "0.6rem" }}>
        <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Campaign strength</h4>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0" }}>
          {campaign.strength.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} strength
          {` · +${campaign.strength.voteBoostPct.toFixed(1)}% vote boost`}
        </p>
        <p className="ahd-muted" style={{ fontSize: "0.72rem", margin: "0.1rem 0 0.3rem" }}>
          Each click adds {campaign.strength.strengthPerClick.toLocaleString(undefined, { maximumFractionDigits: 2 })} strength
          {` from ${campaign.strength.nationalInfluence.toLocaleString()} national influence.`}
        </p>
        {campaign.strength.targets.length > 1 ? (
          <label className="ahd-field" style={{ maxWidth: "26rem", marginBottom: "0.3rem" }}>
            <span className="ahd-label">Contribution target</span>
            <select
              className="ahd-select"
              aria-label="Contribution target"
              value={strengthTargetId}
              onChange={(event) => setStrengthTargetId(event.target.value)}
              disabled={busy || !campaign.strength.eligible}
            >
              {campaign.strength.targets.map((target) => (
                <option key={target.candidateId} value={target.candidateId}>
                  {target.name}{target.isPlayer ? " (you)" : ` (${target.partyName})`}
                  {` · ${target.strength.toLocaleString(undefined, { maximumFractionDigits: 1 })} strength`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
          {([
            { key: "single", label: `Contribute x${campaign.strength.single.clicks}`, quote: campaign.strength.single, clicks: campaign.strength.single.clicks as number | "max" },
            { key: "batch", label: `Contribute x${campaign.strength.batch.clicks}`, quote: campaign.strength.batch, clicks: campaign.strength.batch.clicks as number | "max" },
            { key: "max", label: "Contribute Max", quote: campaign.strength.max, clicks: "max" as number | "max" },
          ]).map((option) => (
            <button
              key={option.key}
              type="button"
              className="ahd-btn ahd-btn-primary ahd-btn-sm"
              disabled={busy || !option.quote.affordable}
              aria-disabled={busy || !option.quote.affordable}
              aria-label={option.label}
              onClick={() => contributeStrength(option.quote, option.clicks)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.72rem", margin: "0.3rem 0 0" }}>
          {`x${campaign.strength.single.clicks}: ${strengthQuoteText(campaign.strength.single)}`}
          {` · x${campaign.strength.batch.clicks}: ${strengthQuoteText(campaign.strength.batch)}`}
          {` · Max: ${strengthQuoteText(campaign.strength.max)}`}
        </p>
        {!campaign.strength.contribute.available && campaign.strength.contribute.disabledReason
          ? <p className="ahd-help" role="note">{campaign.strength.contribute.disabledReason}</p> : null}
        <p className="ahd-help" role="note">
          Strength raises the target's presidential-general vote tally through the reference saturation curve. It is an estimate applied to counted votes, not a result.
        </p>
      </section>
      <section aria-label="Operations blend" style={{ marginTop: "0.6rem" }}>
        <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Operations blend</h4>
        <p className="ahd-help" role="note" style={{ margin: "0 0 0.35rem" }}>
          What each operations lever is doing right now, plus the campaign-strength boost. This is the operations blend of current standing effects, not a vote forecast.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {campaign.blend.levers.map((lever) => (
            <li key={lever.category} style={{ fontSize: "0.78rem" }}>
              <span style={{ fontWeight: 650 }}>{categoryLabel(lever.category)}</span>
              <span className="ahd-muted"> · {lever.effect}</span>
            </li>
          ))}
        </ul>
        <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.3rem 0 0" }}>
          {`Strength vote boost: +${campaign.blend.voteBoostPct.toFixed(1)}% · operations blend, not a vote forecast`}
        </p>
      </section>
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
      <section aria-label="Opposition research" style={{ marginTop: "0.6rem" }}>
        <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Opposition research</h4>
        <p className="ahd-help" style={{ margin: "0 0 0.35rem" }}>
          Target: {campaign.oppositionResearch.targetName ?? "none"}
          {campaign.oppositionResearch.cooldownTurns > 0
            ? ` · retarget in ${campaign.oppositionResearch.cooldownTurns} ${campaign.oppositionResearch.cooldownTurns === 1 ? "turn" : "turns"}`
            : ""}
        </p>
        {campaign.oppositionResearch.targets.length > 0 ? (
          <label className="ahd-field" style={{ maxWidth: "24rem" }}>
            <span className="ahd-label">Opposition target</span>
            <select
              className="ahd-select"
              aria-label="Opposition target"
              value={oppositionTargetId}
              onChange={(event) => setOppositionTargetId(event.target.value)}
              disabled={busy || !targetSelectionAvailable}
            >
              <option value="">Select a target</option>
              {campaign.oppositionResearch.targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name} ({target.partyName})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.35rem" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            disabled={busy || !campaign.oppositionResearch.action.available || !oppositionTargetId}
            aria-disabled={busy || !campaign.oppositionResearch.action.available || !oppositionTargetId}
            aria-label={campaign.oppositionResearch.action.name}
            onClick={retarget}
          >
            {campaign.oppositionResearch.action.name}
          </button>
          {!campaign.oppositionResearch.action.available ? (
            <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
              {campaign.oppositionResearch.action.disabledReason ?? "Unavailable"}
            </span>
          ) : null}
        </div>
      </section>
      <section aria-label="Campaign manager" style={{ marginTop: "0.6rem" }}>
        <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Campaign manager</h4>
        <p className="ahd-help" style={{ margin: "0 0 0.35rem" }}>
          Manager: {campaign.manager.managerName ?? "none"}
        </p>
        <label className="ahd-field" style={{ maxWidth: "24rem" }}>
          <span className="ahd-label">Manager</span>
          <select
            className="ahd-select"
            aria-label="Campaign manager"
            value={managerId}
            onChange={(event) => setManagerId(event.target.value)}
            disabled={busy || !campaign.manager.action.available}
          >
            <option value="">No manager</option>
            {campaign.manager.managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}{manager.office ? ` (${manager.office})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.35rem" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            disabled={busy || !campaign.manager.action.available}
            aria-disabled={busy || !campaign.manager.action.available}
            aria-label="Save campaign manager"
            onClick={saveManager}
          >
            {campaign.manager.action.name}
          </button>
          {!campaign.manager.action.available ? (
            <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
              {campaign.manager.action.disabledReason ?? "Unavailable"}
            </span>
          ) : null}
        </div>
      </section>
      <section aria-label="Campaign canvassing" style={{ marginTop: "0.6rem" }}>
        <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Campaign canvassing</h4>
        <p className="ahd-help" style={{ margin: "0 0 0.35rem" }}>
          Region: {campaign.canvassing.regionId ?? "none"}. Each canvass costs one action and 100 funds.
        </p>
        <label className="ahd-field" style={{ maxWidth: "24rem" }}>
          <span className="ahd-label">Voter target</span>
          <select
            className="ahd-select"
            aria-label="Canvass target"
            value={canvassTarget}
            onChange={(event) => setCanvassTarget(event.target.value)}
            disabled={busy || !campaign.canvassing.action.available}
          >
            <option value="">Select a voter target</option>
            {campaign.canvassing.targets.map((target) => (
              <option key={`${target.category}:${target.group}`} value={`${target.category}:${target.group}`}>
                {target.groupName} ({target.categoryName})
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.35rem" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            disabled={busy || !campaign.canvassing.action.available || !canvassTarget}
            aria-disabled={busy || !campaign.canvassing.action.available || !canvassTarget}
            aria-label="Canvass selected target"
            onClick={canvass}
          >
            {campaign.canvassing.action.name}
          </button>
          {!campaign.canvassing.action.available ? (
            <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
              {campaign.canvassing.action.disabledReason ?? "Unavailable"}
            </span>
          ) : null}
        </div>
      </section>
      <section aria-label="Targeted advertising" style={{ marginTop: "0.6rem" }}>
        <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Targeted advertising</h4>
        <p className="ahd-help" style={{ margin: "0 0 0.35rem" }}>
          Region: {campaign.targetedAds.regionId ?? "none"}. Each purchase costs one action and 100 funds; exposure decays over 24 turns and caps at 25%.
        </p>
        <label className="ahd-field" style={{ maxWidth: "24rem" }}>
          <span className="ahd-label">Ad target</span>
          <select
            className="ahd-select"
            aria-label="Targeted ad target"
            value={targetedAdTarget}
            onChange={(event) => setTargetedAdTarget(event.target.value)}
            disabled={busy || !campaign.targetedAds.action.available}
          >
            <option value="">Select an ad target</option>
            {campaign.targetedAds.targets.map((target) => (
              <option key={`${target.category}:${target.group}`} value={`${target.category}:${target.group}`}>
                {target.groupName} ({target.categoryName}) - {(target.bonus * 100).toFixed(1)}%{target.maxed ? " (cap)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.35rem" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            disabled={busy || !campaign.targetedAds.action.available || !selectedTargetedAd || selectedTargetedAd.maxed}
            aria-disabled={busy || !campaign.targetedAds.action.available || !selectedTargetedAd || selectedTargetedAd.maxed}
            aria-label="Buy targeted ads for selected target"
            onClick={buyTargetedAd}
          >
            {campaign.targetedAds.action.name}
          </button>
          {!campaign.targetedAds.action.available ? (
            <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
              {campaign.targetedAds.action.disabledReason ?? "Unavailable"}
            </span>
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

/**
 * Candidate roster shared by the Elections detail and the presidential race
 * view (#69). Renders only recorded fields; votes appear only when the
 * projection carries tally-backed totals.
 */
function CandidateRoster({ candidates }: { candidates: PoliticsElectionDetail["candidates"] }) {
  if (candidates.length === 0) return <div className="ahd-empty">No filed candidates.</div>;
  return (
    <ul className="ahd-grid ahd-grid-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {candidates.map((c) => (
        <li key={c.id} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.4rem", fontSize: "0.8rem" }}>
          <span style={{ fontWeight: 650 }}>{c.name}</span>
          <span className="ahd-muted"> · {c.partyName}</span>
          {c.incumbent ? <span className="ahd-muted"> · incumbent</span> : null}
          {c.isPlayer ? <span className="ahd-muted"> · you</span> : null}
          {c.winner ? <span style={{ fontWeight: 750 }}> · winner</span> : null}
          {c.votes != null ? (
            <span className="ahd-mono ahd-muted" style={{ display: "block", fontSize: "0.76rem" }}>
              {c.votes.toLocaleString()} votes{c.voteShare != null ? ` (${(c.voteShare * 100).toFixed(1)}%)` : null}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Elections hub summary (#377). Pure composition over the already-projected
 * race list, mirroring the reference `summarize` in AHDGame
 * `src/app/country/[code]/elections/electionsSelectors.ts`:
 * `total` races in scope, `contested` races with at least one declared
 * candidate, and the soonest filing deadline among unresolved races (ISO days
 * sort lexicographically, so the minimum is the soonest). Null when no
 * unresolved race carries a usable date. No tally, projection, or forecast is
 * read or invented here.
 */
export interface ElectionRaceSummary {
  total: number;
  contested: number;
  nextDeadline: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function summarizeElectionRaces(
  races: Pick<PoliticsElectionDetail, "status" | "candidates" | "filingDate" | "date">[],
): ElectionRaceSummary {
  let contested = 0;
  let nextDeadline: string | null = null;
  for (const race of races) {
    if (race.candidates.length > 0) contested += 1;
    if (race.status === "resolved") continue;
    const deadline = ISO_DAY.test(race.filingDate) ? race.filingDate
      : ISO_DAY.test(race.date) ? race.date : null;
    if (deadline !== null && (nextDeadline === null || deadline < nextDeadline)) {
      nextDeadline = deadline;
    }
  }
  return { total: races.length, contested, nextDeadline };
}

function ElectionsSection({ politics, busy, onAction, initialId, onOpenCampaign, onOpenPolitician, onOpenPresidential, clock }: Omit<PoliticsPanelProps, "section">) {
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
  // #69: the Elections surface links into the dedicated presidential race view
  // whenever this country actually records a presidential race.
  const presidentialRace = politics.elections.find((e) => e.presidential !== null) ?? null;
  const fire = (election: PoliticsElectionDetail) => {
    if (busy || !election.candidacy.available) return;
    onAction(election.candidacy.id, { electionId: election.id });
  };

  // Hub framing (#377): hero band plus stat strip above the unchanged race
  // lists. Composition follows the reference `ElectionsHero` (image band,
  // title, tagline, Races/Contested/Next-to-close strip with Contested
  // prominent so zero candidates reads as open ground). The art is the
  // offline `electionsHero()` bundle, never the reference remote photo.
  const summary = useMemo(() => summarizeElectionRaces(politics.elections), [politics.elections]);

  return (
    <div className="ahd-stack">
      <div>
        <RouteHero
          image={electionsHero()}
          alt={`${politics.countryName} elections`}
          eyebrow={politics.countryName}
          title={`${politics.countryName} Elections`}
        >
          <p style={{ fontSize: "0.76rem", margin: "0.32rem 0 0", opacity: 0.85 }}>
            Pick an office, find your seat, and file to stand.
          </p>
        </RouteHero>
        <dl className="ahd-hero-stats ahd-card" aria-label="Election overview">
          <div>
            <dt>Races</dt>
            <dd className="ahd-mono">{summary.total}</dd>
          </div>
          <div>
            <dt>Contested</dt>
            <dd className="ahd-mono">{summary.contested} of {summary.total}</dd>
          </div>
          <div>
            <dt>Next to close</dt>
            <dd className="ahd-mono">{summary.nextDeadline !== null ? formatGameDate(summary.nextDeadline, clock) : "No deadline"}</dd>
          </div>
        </dl>
        {summary.total > 0 && summary.contested === 0 ? (
          <p className="ahd-help" role="note" style={{ marginTop: "0.45rem" }}>
            Open ground: no candidates have filed yet, so every seat is there for the taking.
          </p>
        ) : null}
      </div>
      {/* Dual-pane list/detail pairing (#438): the race filters/select list
          and the selected-race detail share the existing selection state;
          the shell places them on separate panes only when a hinge is
          reported. Single-pane renders the same stack as before. */}
      <div className="ahd-dual-panes">
      <div data-pane="list" className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
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
        {presidentialRace && onOpenPresidential ? (
          <div style={{ marginTop: "0.55rem" }}>
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onOpenPresidential(presidentialRace.id)} disabled={busy}>
              Presidential race
            </button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? <div className="ahd-empty">No races match these filters.</div> : (
        <label className="ahd-field" style={{ maxWidth: "22rem" }}>
          <span className="ahd-label">Race</span>
          <select className="ahd-select" aria-label="Race" value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
            {RACE_PHASE_ORDER.map((phase) => {
              const group = filtered.filter((e) => e.phase === phase);
              if (group.length === 0) return null;
              return (
                <optgroup key={phase} label={RACE_PHASE_LABELS[phase]}>
                  {group.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} [{e.status}]{e.playerCandidate ? " [filed]" : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
      )}
      </div>
      {selected ? (
        <article aria-label={selected.title} data-pane="detail" className="ahd-card ahd-card-pad">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.9rem" }}>{selected.title}</strong>
            <span className="ahd-pill">{RACE_PHASE_LABELS[selected.phase]}</span>
            {selected.playerCandidate ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Filed</span> : null}
          </div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
            {selected.status} · {formatGameDate(selected.date, clock)}
          </div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>Filing deadline: {formatGameDate(selected.filingDate, clock) || "Unknown"}</div>
          {selected.presidential && onOpenPresidential ? (
            <button type="button" className="ahd-btn ahd-btn-sm" style={{ marginTop: "0.4rem" }} onClick={() => onOpenPresidential(selected.id)} disabled={busy}>
              View presidential race
            </button>
          ) : null}
          <RaceStages stages={selected.stages} />

          <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0.6rem 0 0.25rem" }}>
            Candidates ({selected.candidates.length})
          </h4>
          <CandidateRoster candidates={selected.candidates} />
          <PrimaryBlock primary={selected.primary} />
          <ProjectionBlock projection={selected.projection} />
          {selected.winnerIds.length > 0 ? (
            onOpenPolitician ? (
              <p style={{ fontSize: "0.8rem", margin: "0.35rem 0 0", display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                <span>Winners:</span>
                {selected.winnerIds.map((id, index) => (
                  <button key={id} type="button" className="ahd-btn ahd-btn-sm" onClick={() => onOpenPolitician(id)} disabled={busy}>
                    {selected.winnerNames[index] ?? id}
                  </button>
                ))}
              </p>
            ) : (
              <p style={{ fontSize: "0.8rem", margin: "0.35rem 0 0" }}>Winners: {selected.winnerNames.join(", ")}</p>
            )
          ) : null}
          {selected.playerCampaign ? (
            <section aria-label="Your campaign" style={{ marginTop: "0.7rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem" }}>
              <h4 style={{ fontSize: "0.78rem", margin: "0 0 0.3rem" }}>Your campaign</h4>
              <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0 0 0.4rem" }}>
                {Math.floor(selected.playerCampaign.funds).toLocaleString()} funds · {selected.playerCampaign.actions} actions
              </p>
              {onOpenCampaign ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onOpenCampaign(selected.id)} disabled={busy}>
                {selected.playerCampaign.status === "archived" ? "View campaign" : "Manage campaign"}
              </button> : null}
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
    </div>
  );
}

function CampaignSection({ politics, busy, onAction, initialId, clock }: Omit<PoliticsPanelProps, "section">) {
  const election = politics.elections.find((item) => item.id === initialId)
    ?? politics.elections.find((item) => item.playerCampaign !== null)
    ?? null;
  if (!election?.playerCampaign) {
    return <div className="ahd-empty">No player campaign is available.</div>;
  }
  return (
    <div className="ahd-stack">
      <article className="ahd-card ahd-card-pad" aria-label={`Campaign for ${election.title}`}>
        <h2 className="ahd-h2">{election.title}</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {election.status} · election day {formatGameDate(election.date, clock)}
        </p>
        <CampaignBlock electionId={election.id} campaign={election.playerCampaign} busy={busy} onAction={onAction} currency={politics.currency} />
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
      <div className="ahd-card ahd-card-pad ahd-hero">
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
          <dl className="ahd-kv-grid" style={{ marginTop: "0.6rem" }}>
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

function ReferendumCampaignControls({ record, busy, currency, onAction }: {
  record: PoliticsReferendumView;
  busy: boolean;
  currency: string;
  onAction: (id: string, params?: Record<string, string | number>) => void;
}) {
  const campaign = record.campaign;
  const [side, setSide] = useState<"yes" | "no">(campaign.spend.side);
  useEffect(() => { setSide(campaign.spend.side); }, [campaign.spend.side, record.id]);
  const [units, setUnits] = useState(campaign.spend.step);
  useEffect(() => { setUnits(campaign.spend.step); }, [campaign.spend.step, record.id]);
  const [presetId, setPresetId] = useState(campaign.groundGame.presets[0]?.id ?? "");
  useEffect(() => {
    setPresetId((current) => campaign.groundGame.presets.some((p) => p.id === current)
      ? current : campaign.groundGame.presets[0]?.id ?? "");
  }, [campaign.groundGame.presets]);
  const [ggSide, setGgSide] = useState<"yes" | "no">(campaign.playerSide ?? "yes");
  useEffect(() => { setGgSide(campaign.playerSide ?? "yes"); }, [campaign.playerSide, record.id]);
  const [cohortId, setCohortId] = useState("");
  useEffect(() => {
    setCohortId((current) => current !== "" && !campaign.groundGame.cohorts.some((c) => c.groupId === current)
      ? "" : current);
  }, [campaign.groundGame.cohorts]);

  const spendCost = units * campaign.spend.psPerUnit;
  const preset = campaign.groundGame.presets.find((p) => p.id === presetId) ?? null;
  const sideMismatch = campaign.playerSide !== null && side !== campaign.playerSide;
  const spendDisabled = busy || !campaign.spend.available || sideMismatch;
  const spendReason = campaign.spend.disabledReason
    ?? (sideMismatch ? `Your party campaigns for the ${campaign.playerSide === "yes" ? "Yes" : "No"} side.` : undefined);
  const ggDisabled = busy || !campaign.groundGame.available || !preset || !preset.affordable;

  const fireSpend = () => {
    if (spendDisabled) return;
    onAction("referendumCampaignSpend", { referendumId: record.id, referendumSide: side, units });
  };
  const fireGroundGame = () => {
    if (ggDisabled) return;
    onAction("referendumGroundGame", {
      referendumId: record.id, referendumSide: ggSide, presetId, cohortGroupId: cohortId,
    });
  };

  return (
    <section aria-label={`Campaign (${record.question})`} style={{ marginTop: "0.6rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem" }}>
      <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Campaign</h4>
      <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>
        Your position: {campaign.playerSide === "yes" ? "Yes" : campaign.playerSide === "no" ? "No" : "No party"}
        {" · "}Yes spend {campaign.yesUnits} · No spend {campaign.noUnits}
      </div>

      <div style={{ marginTop: "0.45rem" }}>
        <strong style={{ fontSize: "0.78rem" }}>Spend Political Strength</strong>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end", flexWrap: "wrap", marginTop: "0.25rem" }}>
          <label className="ahd-field">
            <span className="ahd-label">Side</span>
            <select className="ahd-select" aria-label={`Campaign side (${record.question})`} value={side}
              onChange={(e) => setSide(e.target.value as "yes" | "no")} disabled={busy}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="ahd-field">
            <span className="ahd-label">Units</span>
            <input className="ahd-input" type="number" min={1} step={1}
              aria-label={`Campaign spend units (${record.question})`} value={units}
              onChange={(e) => setUnits(Math.max(1, Math.floor(Number(e.target.value) || 1)))} disabled={busy} />
          </label>
          <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm"
            aria-label={`Spend on campaign (${record.question})`} disabled={spendDisabled}
            aria-disabled={spendDisabled} onClick={fireSpend}>
            Spend {spendCost} PS
          </button>
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}>
          Cost {spendCost} PS · available {campaign.spend.psAvailable} PS
        </p>
        {spendReason ? <p className="ahd-help" role="note">{spendReason}</p> : null}
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <strong style={{ fontSize: "0.78rem" }}>Ground game</strong>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end", flexWrap: "wrap", marginTop: "0.25rem" }}>
          <label className="ahd-field">
            <span className="ahd-label">Action</span>
            <select className="ahd-select" aria-label={`Ground-game action (${record.question})`} value={presetId}
              onChange={(e) => setPresetId(e.target.value)} disabled={busy}>
              {campaign.groundGame.presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="ahd-field">
            <span className="ahd-label">Side</span>
            <select className="ahd-select" aria-label={`Ground-game side (${record.question})`} value={ggSide}
              onChange={(e) => setGgSide(e.target.value as "yes" | "no")} disabled={busy}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="ahd-field">
            <span className="ahd-label">Target</span>
            <select className="ahd-select" aria-label={`Ground-game target (${record.question})`} value={cohortId}
              onChange={(e) => setCohortId(e.target.value)} disabled={busy}>
              <option value="">Whole electorate</option>
              {campaign.groundGame.cohorts.map((c) => <option key={c.groupId} value={c.groupId}>{c.name}</option>)}
            </select>
          </label>
          <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm"
            aria-label={`Run ground game (${record.question})`} disabled={ggDisabled}
            aria-disabled={ggDisabled} onClick={fireGroundGame}>
            Run action
          </button>
        </div>
        {preset ? (
          <p className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}>
            Cost {formatFinanceMoney(preset.funds, currency)} · {preset.actions} action{preset.actions === 1 ? "" : "s"} · ~{preset.nominalSwing} pts
          </p>
        ) : null}
        {preset && !preset.affordable ? <p className="ahd-help" role="note">Not enough funds or actions for this action.</p> : null}
        {campaign.groundGame.disabledReason ? <p className="ahd-help" role="note">{campaign.groundGame.disabledReason}</p> : null}
      </div>
    </section>
  );
}

function ReferendumsSection({ politics, busy, onAction, initialId, clock }: Omit<PoliticsPanelProps, "section">) {
  const request = politics.referendumRequest;
  const records = politics.referendums;
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  useEffect(() => {
    if (!records.some((record) => record.id === selectedId)) setSelectedId(records[0]?.id ?? "");
  }, [records, selectedId]);
  const selected = records.find((record) => record.id === selectedId) ?? null;
  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">Referendums</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {records.length} recorded referendum {records.length === 1 ? "record" : "records"}
        </p>
        <p className="ahd-help" role="note">{request.note}</p>
      </div>
      {request.applicable ? (
        <article className="ahd-card ahd-card-pad" aria-label="Referendum requests">
          <h3 style={{ fontSize: "0.86rem", margin: 0, fontWeight: 750 }}>Request a referendum</h3>
          <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {request.regions.map((region) => (
              <li key={region.regionId} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.45rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.82rem" }}>{region.regionName}</strong>
                  <span className="ahd-muted" style={{ fontSize: "0.74rem" }}>desire {region.desire.toFixed(1)}</span>
                  <button
                    type="button"
                    className="ahd-btn ahd-btn-primary ahd-btn-sm"
                    disabled={busy || !region.eligible}
                    aria-disabled={busy || !region.eligible}
                    aria-label={`Request referendum in ${region.regionName}`}
                    onClick={() => onAction("requestReferendum", { regionId: region.regionId })}
                  >
                    Request referendum
                  </button>
                </div>
                {!region.eligible && region.reason ? <p className="ahd-help" role="note">{region.reason}</p> : null}
              </li>
            ))}
          </ul>
          {!request.action.available && request.action.disabledReason ? (
            <p className="ahd-help" role="note">{request.action.disabledReason}</p>
          ) : null}
        </article>
      ) : null}
      {records.length === 0 ? (
        <div className="ahd-empty">No referendums have been requested.</div>
      ) : (
        <label className="ahd-field" style={{ maxWidth: "28rem" }}>
          <span className="ahd-label">Referendum</span>
          <select className="ahd-select" aria-label="Referendum" value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.question} [{record.phase}]
              </option>
            ))}
          </select>
        </label>
      )}
      {selected ? (
        <article key={selected.id} aria-label={selected.question} className="ahd-card ahd-card-pad">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.86rem" }}>{selected.question}</strong>
            <span className="ahd-pill">{selected.phase}</span>
          </div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
            {selected.scope} · requested {formatGameTurn(selected.requestedTurn, clock)}
          </div>
          <dl className="ahd-kv-grid" style={{ marginTop: "0.5rem" }}>
            <div className="ahd-kv"><dt>Yes share</dt><dd className="ahd-mono">{selected.yesShare.toFixed(1)}%</dd></div>
            {selected.campaignCloseTurn != null ? <div className="ahd-kv"><dt>Campaign closes</dt><dd className="ahd-mono">{formatGameTurn(selected.campaignCloseTurn, clock)}</dd></div> : null}
            {selected.finalYesShare != null ? <div className="ahd-kv"><dt>Final yes share</dt><dd className="ahd-mono">{selected.finalYesShare.toFixed(1)}%</dd></div> : null}
            {selected.turnout != null ? <div className="ahd-kv"><dt>Turnout</dt><dd className="ahd-mono">{selected.turnout.toFixed(1)}%</dd></div> : null}
            {selected.passed != null ? <div className="ahd-kv"><dt>Result</dt><dd>{selected.passed ? "Passed" : "Rejected"}</dd></div> : null}
            {selected.conversionDeadlineTurn != null ? <div className="ahd-kv"><dt>Consent deadline</dt><dd className="ahd-mono">{formatGameTurn(selected.conversionDeadlineTurn, clock)}</dd></div> : null}
            {selected.latestPollTurn != null ? <div className="ahd-kv"><dt>Latest poll</dt><dd className="ahd-mono">{formatGameTurn(selected.latestPollTurn, clock)}</dd></div> : null}
          </dl>
          {selected.campaign.active ? (
            <ReferendumCampaignControls record={selected} busy={busy} currency={politics.currency} onAction={onAction} />
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

/** The recorded Electoral College state of one presidential race (#69). */
function PresidentialElectoralCollege({ presidential }: { presidential: PoliticsPresidentialView }) {
  return (
    <section aria-label="Electoral College" style={{ marginTop: "0.6rem" }}>
      <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.25rem" }}>Electoral College</h4>
      {presidential.hasStateTallies ? (
        <>
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0" }}>
            {presidential.totalElectoralVotes.toLocaleString()} electoral votes recorded · {presidential.majorityThreshold.toLocaleString()} needed to win
          </p>
          <ul aria-label="Electoral votes by candidate" style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {presidential.electors.map((elector) => (
              <li key={elector.candidateId} style={{ fontSize: "0.8rem" }}>
                <span style={{ fontWeight: 650 }}>{elector.name}</span>
                <span className="ahd-muted"> · {elector.partyName}</span>
                <span className="ahd-mono"> · {elector.electoralVotes.toLocaleString()} EV</span>
                {elector.popularVotes != null ? (
                  <span className="ahd-mono ahd-muted"> · {elector.popularVotes.toLocaleString()} votes</span>
                ) : null}
              </li>
            ))}
          </ul>
          <details style={{ marginTop: "0.35rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "0.76rem", minHeight: 44, paddingBlock: "0.65rem", boxSizing: "border-box" }}>
              {`Per-state tally (${presidential.states.length})`}
            </summary>
            <ul aria-label="Per-state presidential tallies" style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {presidential.states.map((state) => (
                <li key={state.stateId} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.3rem", fontSize: "0.76rem" }}>
                  <span style={{ fontWeight: 650 }}>{state.stateName}</span>
                  <span className="ahd-muted"> · {state.electoralVotes} EV</span>
                  <span> · {state.winnerName ?? "No votes recorded"}</span>
                  {state.votes.length > 0 ? (
                    <span className="ahd-mono ahd-muted" style={{ display: "block" }}>
                      {state.votes.map((vote) => `${vote.name} ${vote.votes.toLocaleString()}`).join(" · ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
      <p className="ahd-help" role="note">{presidential.note}</p>
      {presidential.resolved && presidential.winnerName ? (
        <p style={{ fontSize: "0.8rem", fontWeight: 750, margin: "0.35rem 0 0" }}>
          {`Result: ${presidential.winnerName} won the presidency.`}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Dedicated presidential race destination (#69). Reachable from the Elections
 * surface and the reference Nation > Politics menu. It shows the real recorded
 * race: candidates, the per-state / Electoral College accumulation (only where
 * the engine recorded `stateTallyStates`), the rules and stage timers, the
 * campaign link, and the recorded result after resolution.
 */
function PresidentialRaceSection({ politics, busy, onAction, initialId, onOpenCampaign, onOpenPolitician, clock }: Omit<PoliticsPanelProps, "section">) {
  const races = useMemo(() => politics.elections.filter((e) => e.presidential !== null), [politics.elections]);
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  useEffect(() => {
    if (!races.some((e) => e.id === selectedId)) setSelectedId(races[0]?.id ?? "");
  }, [races, selectedId]);
  const selected = races.find((e) => e.id === selectedId) ?? null;
  const fire = (election: PoliticsElectionDetail) => {
    if (busy || !election.candidacy.available) return;
    onAction(election.candidacy.id, { electionId: election.id });
  };
  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">Presidential election</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {races.length} recorded presidential {races.length === 1 ? "race" : "races"} in {politics.countryName}
        </p>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Electoral votes are allocated winner-take-all from recorded per-state tallies; counted figures are never a forecast.
        </p>
      </div>
      {races.length === 0 ? (
        <div className="ahd-empty">No presidential race is recorded for {politics.countryName}.</div>
      ) : (
        <label className="ahd-field" style={{ maxWidth: "28rem" }}>
          <span className="ahd-label">Presidential race</span>
          <select className="ahd-select" aria-label="Presidential race" value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
            {races.map((race) => (
              <option key={race.id} value={race.id}>
                {race.title} [{race.status}]{race.playerCandidate ? " [filed]" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected ? (
        <article aria-label={selected.title} className="ahd-card ahd-card-pad">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.9rem" }}>{selected.title}</strong>
            <span className="ahd-pill">{RACE_PHASE_LABELS[selected.phase]}</span>
            {selected.playerCandidate ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Filed</span> : null}
          </div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
            {selected.status} · election day {formatGameDate(selected.date, clock)}
          </div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>Filing deadline: {formatGameDate(selected.filingDate, clock) || "Unknown"}</div>
          <RaceStages stages={selected.stages} />

          <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0.6rem 0 0.25rem" }}>
            Candidates ({selected.candidates.length})
          </h4>
          <CandidateRoster candidates={selected.candidates} />

          {selected.presidential ? <PresidentialElectoralCollege presidential={selected.presidential} /> : null}

          {selected.winnerIds.length > 0 ? (
            onOpenPolitician ? (
              <p style={{ fontSize: "0.8rem", margin: "0.35rem 0 0", display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                <span>Winners:</span>
                {selected.winnerIds.map((id, index) => (
                  <button key={id} type="button" className="ahd-btn ahd-btn-sm" onClick={() => onOpenPolitician(id)} disabled={busy}>
                    {selected.winnerNames[index] ?? id}
                  </button>
                ))}
              </p>
            ) : (
              <p style={{ fontSize: "0.8rem", margin: "0.35rem 0 0" }}>Winners: {selected.winnerNames.join(", ")}</p>
            )
          ) : null}

          {selected.playerCampaign ? (
            <section aria-label="Your campaign" style={{ marginTop: "0.7rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem" }}>
              <h4 style={{ fontSize: "0.78rem", margin: "0 0 0.3rem" }}>Your campaign</h4>
              <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0 0 0.4rem" }}>
                {`${Math.floor(selected.playerCampaign.funds).toLocaleString()} funds · ${selected.playerCampaign.actions} actions · `}
                {`${selected.playerCampaign.strength.nationalInfluence.toLocaleString()} national influence feeds campaign strength`}
              </p>
              {onOpenCampaign ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onOpenCampaign(selected.id)} disabled={busy}>
                {selected.playerCampaign.status === "archived" ? "View campaign" : "Manage campaign"}
              </button> : null}
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

/**
 * Political-metrics view (#69). It renders the EXACT registry Native already
 * projects (`projectNation().metrics`) by reusing NationPanel's `MetricsSection`
 * — no second projection and no re-derived metric. Categories, recorded history
 * and recorded modifier rows all come from the shared `NationMetricsView` DTO.
 */
function PoliticalMetricsSection({ politics, nation, era, onNavigate }: {
  politics: PoliticsView;
  nation?: NationView;
  era?: string | null;
  onNavigate?: PoliticsPanelProps["onNavigate"];
}) {
  if (!nation) {
    return (
      <div className="ahd-stack">
        <div className="ahd-card ahd-card-pad ahd-hero">
          <h2 className="ahd-h2">Political metrics</h2>
          <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{politics.countryName}</p>
        </div>
        <div className="ahd-empty">No national metrics are recorded for this country.</div>
      </div>
    );
  }
  return <MetricsSection nation={nation} era={era} onNavigate={onNavigate} />;
}

export function PoliticsPanel({ politics, section, busy, onAction, initialId, onOpenElection, onOpenCampaign, onOpenPolitician, onOpenPresidential, nation, era, onNavigate, clock }: PoliticsPanelProps) {
  if (section === "campaign") return <CampaignSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} clock={clock} />;
  if (section === "elections") return <ElectionsSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} onOpenCampaign={onOpenCampaign} onOpenPolitician={onOpenPolitician} onOpenPresidential={onOpenPresidential} clock={clock} />;
  if (section === "presidential") return <PresidentialRaceSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} onOpenCampaign={onOpenCampaign} onOpenPolitician={onOpenPolitician} clock={clock} />;
  if (section === "metrics") return <PoliticalMetricsSection politics={politics} nation={nation} era={era} onNavigate={onNavigate} />;
  if (section === "referendums") return <ReferendumsSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} clock={clock} />;
  if (section === "politicians") return <PoliticiansSection politics={politics} busy={busy} initialId={initialId} onOpenElection={onOpenElection} clock={clock} />;
  return <PartiesSection politics={politics} busy={busy} onAction={onAction} initialId={initialId} clock={clock} />;
}

export default PoliticsPanel;
