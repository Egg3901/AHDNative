/**
 * LegislaturePanel: office summary, bill sponsorship, and bill voting.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/components/bills/BillCard.tsx (headline + sponsor line + vote
 *   buttons with tally) and src/components/bills/BillVoteIndicator.tsx
 *   (For/Against/Abstain buttons with recorded-vote indicator). No server or
 *   Next.js imports; props arrive through the GameView LegislatureView.
 */
import { useEffect, useState } from "react";
import type { GameScreenProps, LegislatureView } from "../game/types";

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
}

export function LegislaturePanel({ legislature, busy, onAction }: LegislaturePanelProps) {
  const [selectedId, setSelectedId] = useState(legislature.proposals[0]?.id ?? "");
  const [billPage, setBillPage] = useState(0);

  useEffect(() => {
    if (!legislature.proposals.some((p) => p.id === selectedId)) {
      setSelectedId(legislature.proposals[0]?.id ?? "");
    }
  }, [legislature.proposals, selectedId]);

  const billPageCount = Math.max(1, Math.ceil(legislature.bills.length / BILLS_PAGE_SIZE));
  const safeBillPage = Math.min(Math.max(0, billPage), billPageCount - 1);
  const pagedBills = legislature.bills.slice(
    safeBillPage * BILLS_PAGE_SIZE,
    (safeBillPage + 1) * BILLS_PAGE_SIZE,
  );

  useEffect(() => {
    setBillPage((p) => Math.min(Math.max(0, p), Math.max(0, Math.ceil(legislature.bills.length / BILLS_PAGE_SIZE) - 1)));
  }, [legislature.bills.length]);

  const selected = legislature.proposals.find((p) => p.id === selectedId) ?? null;
  const sponsorDisabled = busy || !legislature.sponsor.available || !selected;
  const sponsorHint = !legislature.sponsor.available
    ? (legislature.sponsor.disabledReason ?? "Unavailable")
    : legislature.sponsor.cost > 0
      ? `Cost ${legislature.sponsor.cost} actions`
      : "Free";

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Legislature</h2>
        {legislature.office ? (
          <p style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>{legislature.office}</p>
        ) : (
          <p className="ahd-muted" style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>No legislative seat</p>
        )}
      </div>

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
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-primary ahd-btn-sm"
            onClick={() => {
              if (sponsorDisabled || !selected) return;
              onAction("sponsorBill", { catalogId: selected.id });
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

      <div className="ahd-card ahd-card-pad">
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Bills</h3>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{legislature.bills.length} bills</p>
        {billPageCount > 1 ? (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.4rem" }}>
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setBillPage(safeBillPage - 1)} disabled={busy || safeBillPage === 0} aria-label="Previous page">
              Previous
            </button>
            <span className="ahd-muted" style={{ fontSize: "0.74rem" }} aria-live="polite">Page {safeBillPage + 1} of {billPageCount}</span>
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setBillPage(safeBillPage + 1)} disabled={busy || safeBillPage >= billPageCount - 1} aria-label="Next page">
              Next
            </button>
          </div>
        ) : null}
      </div>

      {legislature.bills.length === 0 ? (
        <div className="ahd-empty">No bills before the legislature.</div>
      ) : (
        <div className="ahd-stack">
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
