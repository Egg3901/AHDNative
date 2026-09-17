/**
 * LegislaturePanel: chamber, committee, and floor-schedule navigation with
 * bill sponsorship and voting.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/app/congress/CongressClient.tsx (chamber switcher + per-chamber bill
 *   tab), src/components/bills/BillCard.tsx (headline + sponsor line + vote
 *   buttons with tally) and src/components/bills/BillVoteIndicator.tsx
 *   (For/Against/Abstain buttons with recorded-vote indicator). No server or
 *   Next.js imports; props arrive through the GameView LegislatureView, whose
 *   chamber/committee/schedule data is projected from real engine state.
 */
import { useEffect, useState } from "react";
import type { GameScreenProps, LegislatureView } from "../game/types";
import { NominationsPanel } from "./NominationsPanel";
import { loadLegislatureNav, saveLegislatureNav } from "../game/legislature";
import { formatGameTurn, type GameClock } from "../game/gameDate";
import { ChamberSeatingDiagram } from "./legislature/ChamberSeatingDiagram";

const BILLS_PAGE_SIZE = 20;

type Vote = "for" | "against" | "abstain";

const VOTE_LABELS: { id: Vote; label: string }[] = [
  { id: "for", label: "For" },
  { id: "against", label: "Against" },
  { id: "abstain", label: "Abstain" },
];

export interface LegislaturePanelProps {
  legislature: LegislatureView;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
  /** World clock used to render floor-schedule deadlines on the reference calendar (#226). */
  clock: GameClock;
}

export function LegislaturePanel({ legislature, busy, onAction, clock }: LegislaturePanelProps) {
  const [selectedId, setSelectedId] = useState(legislature.proposals[0]?.id ?? "");
  const [billPage, setBillPage] = useState(0);
  const [chamberKey, setChamberKey] = useState<string>(() => {
    const chambers = legislature.chambers ?? [];
    if (!legislature.countryId || chambers.length === 0) return "";
    const persisted = loadLegislatureNav(legislature.countryId).chamberKey;
    return persisted && chambers.some((c) => c.key === persisted) ? persisted : "";
  });

  useEffect(() => {
    if (!legislature.proposals.some((p) => p.id === selectedId)) {
      setSelectedId(legislature.proposals[0]?.id ?? "");
    }
  }, [legislature.proposals, selectedId]);

  // Drop a chamber selection that no longer exists in the configuration.
  useEffect(() => {
    if (chamberKey && !(legislature.chambers ?? []).some((c) => c.key === chamberKey)) {
      setChamberKey("");
    }
  }, [legislature.chambers, chamberKey]);

  // Persist navigation context so the selected chamber survives a reload.
  useEffect(() => {
    if (!legislature.countryId) return;
    const existing = loadLegislatureNav(legislature.countryId);
    saveLegislatureNav(legislature.countryId, { chamberKey: chamberKey || null, billId: existing.billId });
  }, [legislature.countryId, chamberKey]);

  const selectedChamber = (legislature.chambers ?? []).find((c) => c.key === chamberKey) ?? null;
  // The seating diagram follows the chamber selection, defaulting to the
  // first chamber so the chamber view always shows the house itself.
  const diagramChamber = selectedChamber ?? (legislature.chambers ?? [])[0] ?? null;
  const visibleBills = selectedChamber
    ? legislature.bills.filter((bill) => (bill.chamberKey ?? bill.chamber) === selectedChamber.key || bill.chamber === selectedChamber.name)
    : legislature.bills;

  const billPageCount = Math.max(1, Math.ceil(visibleBills.length / BILLS_PAGE_SIZE));
  const safeBillPage = Math.min(Math.max(0, billPage), billPageCount - 1);
  const pagedBills = visibleBills.slice(
    safeBillPage * BILLS_PAGE_SIZE,
    (safeBillPage + 1) * BILLS_PAGE_SIZE,
  );

  useEffect(() => {
    setBillPage((p) => Math.min(Math.max(0, p), Math.max(0, Math.ceil(visibleBills.length / BILLS_PAGE_SIZE) - 1)));
  }, [visibleBills.length]);

  const committees = (legislature.committees ?? []).filter(
    (committee) => !selectedChamber || committee.chamberKey === selectedChamber.key,
  );
  const schedule = (legislature.schedule ?? []).filter(
    (entry) => !selectedChamber || entry.chamberKey === selectedChamber.key,
  );
  const billTitleById = new Map(legislature.bills.map((bill) => [bill.id, bill.title]));

  const selected = legislature.proposals.find((p) => p.id === selectedId) ?? null;
  const sponsorDisabled = busy || !legislature.sponsor.available || !selected;
  const sponsorHint = !legislature.sponsor.available
    ? (legislature.sponsor.disabledReason ?? "Unavailable")
    : legislature.sponsor.cost > 0
      ? `Cost ${legislature.sponsor.cost} actions`
      : "Free";

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">Legislature</h2>
        {legislature.office ? (
          <p style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>{legislature.office}</p>
        ) : (
          <p className="ahd-muted" style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>No legislative seat</p>
        )}
      </div>

      {(legislature.chambers ?? []).length > 0 ? (
        <div className="ahd-card ahd-card-pad">
          <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Chambers</h3>
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.5rem" }} role="group" aria-label="Chamber">
            {(legislature.chambers ?? []).map((chamber) => (
              <button
                key={chamber.key}
                type="button"
                className="ahd-btn ahd-btn-sm"
                onClick={() => setChamberKey(chamber.key === chamberKey ? "" : chamber.key)}
                disabled={busy}
                aria-pressed={chamber.key === chamberKey}
                aria-label={`Show ${chamber.name} bills`}
              >
                {chamber.shortName} ({chamber.activeCount} active, {chamber.completedCount} completed)
              </button>
            ))}
          </div>
          {selectedChamber ? (
            <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.4rem 0 0" }}>
              {selectedChamber.name} · {selectedChamber.seats} seats · {selectedChamber.elected ? "elected" : "appointed"}
              {selectedChamber.description ? ` · ${selectedChamber.description}` : ""}
            </p>
          ) : (
            <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.4rem 0 0" }}>
              Showing bills for every chamber.
            </p>
          )}
          {diagramChamber ? (
            <div style={{ marginTop: "0.55rem" }}>
              <ChamberSeatingDiagram
                chamberName={diagramChamber.name}
                countryId={legislature.countryId}
                chamberKey={diagramChamber.key}
                total={diagramChamber.seats}
                seatsByParty={diagramChamber.seatsByParty}
                vacancies={diagramChamber.vacancies}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Sponsor a bill</h3>
        {legislature.proposals.length === 0 ? (
          <div className="ahd-empty">No proposals available.</div>
        ) : (
          <label className="ahd-field" style={{ maxWidth: "20rem" }}>
            <span className="ahd-label">Legislation</span>
            <select
              className="ahd-select"
              aria-label="Legislation"
              value={selected?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={busy}
            >
              {legislature.proposals.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
        )}
        {selected ? (
          <p className="ahd-muted" style={{ fontSize: "0.78rem", lineHeight: 1.5, margin: 0 }}>{selected.description}</p>
        ) : null}
        {selectedChamber ? (
          <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: 0 }}>
            Sponsoring originates in {selectedChamber.name}.
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-primary ahd-btn-sm"
            onClick={() => {
              if (sponsorDisabled || !selected) return;
              onAction("sponsorBill", {
                catalogId: selected.id,
                ...(selectedChamber ? { originChamber: selectedChamber.key } : {}),
              });
            }}
            disabled={sponsorDisabled}
            aria-disabled={sponsorDisabled}
            aria-label="Sponsor bill"
          >
            Sponsor bill
          </button>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{sponsorHint}</span>
        </div>
      </div>

      {committees.length > 0 ? (
        <div className="ahd-card ahd-card-pad">
          <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Committees</h3>
          <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.45rem" }}>
            {committees.map((committee) => (
              <div key={committee.id} aria-label={`Committee ${committee.name}`} style={{ fontSize: "0.78rem" }}>
                <div style={{ fontWeight: 700 }}>{committee.name}</div>
                <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>
                  {committee.chamberName} · {committee.jurisdiction.join(", ")} · {committee.memberCount} members
                  {committee.chairName ? ` · Chair ${committee.chairName}` : ""}
                </div>
                <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>
                  {committee.activeBillIds.length === 0
                    ? "No bills in queue."
                    : `Queue: ${committee.activeBillIds.map((id) => billTitleById.get(id) ?? id).join(", ")}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {schedule.length > 0 ? (
        <div className="ahd-card ahd-card-pad">
          <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Floor schedule</h3>
          <ul style={{ listStyle: "none", margin: "0.45rem 0 0", padding: 0, display: "grid", gap: "0.35rem" }}>
            {schedule.map((entry) => (
              <li key={entry.billId} style={{ fontSize: "0.78rem" }}>
                <span style={{ fontWeight: 700 }}>{entry.title}</span>
                {` · ${entry.chamberName} · ${entry.statusLabel}`}
                <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>
                  {entry.nextAction}
                  {entry.dueTurn !== null ? ` (${formatGameTurn(entry.dueTurn, clock)})` : ""}
                  {entry.overdue ? " · overdue" : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ahd-card ahd-card-pad">
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Bills</h3>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {visibleBills.length} bills{selectedChamber ? ` in the ${selectedChamber.name}` : ""}
        </p>
        {billPageCount > 1 ? (
          <div className="ahd-bills-pager" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", minWidth: 0, marginTop: "0.4rem" }}>
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setBillPage(safeBillPage - 1)} disabled={busy || safeBillPage === 0} aria-label="Previous page">
              Previous
            </button>
            <span className="ahd-muted" style={{ fontSize: "0.74rem", minWidth: 0, overflowWrap: "anywhere" }} aria-live="polite">Page {safeBillPage + 1} of {billPageCount}</span>
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setBillPage(safeBillPage + 1)} disabled={busy || safeBillPage >= billPageCount - 1} aria-label="Next page">
              Next
            </button>
          </div>
        ) : null}
      </div>

      <NominationsPanel legislature={legislature} busy={busy} onAction={onAction} />

      {visibleBills.length === 0 ? (
        <div className="ahd-empty">No bills before the legislature.</div>
      ) : (
        <div className="ahd-grid ahd-grid-2">
          {pagedBills.map((bill) => {
            const votingOpen = ["active", "active_other", "veto_override"].includes(bill.status);
            const voteDisabled = busy || !bill.voting.available;
            const voteHint = !bill.voting.available
              ? (bill.voting.disabledReason ?? "Unavailable")
              : bill.voting.cost > 0
                ? `Cost ${bill.voting.cost} actions`
                : "Free";
            return (
              <article key={bill.id} aria-label={bill.title} className="ahd-card ahd-card-pad">
                <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{bill.title}</div>
                <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>
                  {bill.status} · {bill.chamber} · Sponsored by {bill.sponsorName}
                </div>
                <div style={{ fontSize: "0.78rem", marginTop: "0.3rem" }}>
                  {bill.votesFor} for · {bill.votesAgainst} against · {bill.votesAbstain} abstain
                </div>
                <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>
                  {bill.playerVote ? `Your vote: ${bill.playerVote}` : votingOpen ? "Not yet voted" : "No recorded vote"}
                </div>
                {votingOpen ? <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {VOTE_LABELS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="ahd-btn ahd-btn-primary ahd-btn-sm"
                      onClick={() => {
                        if (voteDisabled) return;
                        onAction("voteOnBill", { billId: bill.id, vote: v.id });
                      }}
                      disabled={voteDisabled}
                      aria-disabled={voteDisabled}
                      aria-label={`${v.label} on ${bill.title}`}
                    >
                      {v.label}
                    </button>
                  ))}
                  <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{voteHint}</span>
                </div> : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LegislaturePanel;
