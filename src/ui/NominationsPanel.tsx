/**
 * NominationsPanel: cabinet/SCOTUS nomination list, detail, sponsorship, and
 * ballots inside the Legislature destination (#273).
 *
 * Read-only values arrive through LegislatureView (projected from engine
 * state in src/game/nominations.ts); commands go out through onAction using
 * the session's direct-engine commands (sponsorCabinetNomination,
 * sponsorScotusNomination, voteCabinetNomination, voteScotusNomination).
 * All interactive controls keep a 44px minimum touch target.
 */
import { useState } from "react";
import type { GameScreenProps, LegislatureView } from "../game/types";
import type { NominationView } from "../game/nominations";

type Ballot = "for" | "against" | "abstain";

const BALLOTS: { id: Ballot; label: string }[] = [
  { id: "for", label: "For" },
  { id: "against", label: "Against" },
  { id: "abstain", label: "Abstain" },
];

const TOUCH = { minHeight: 44 };

function voteBar(nomination: NominationView) {
  const total = nomination.tally.for + nomination.tally.against + nomination.tally.abstain;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return (
    <div aria-label={`Vote tally for ${nomination.nominee}`}>
      <div style={{ fontSize: "0.78rem" }}>
        {nomination.tally.for} for · {nomination.tally.against} against · {nomination.tally.abstain} abstain
      </div>
      <div style={{ display: "flex", height: "0.5rem", borderRadius: "0.25rem", overflow: "hidden", marginTop: "0.25rem", background: "#e5e5e5" }}>
        <div style={{ width: `${pct(nomination.tally.for)}%`, background: "#2e7d32" }} />
        <div style={{ width: `${pct(nomination.tally.against)}%`, background: "#c62828" }} />
        <div style={{ width: `${pct(nomination.tally.abstain)}%`, background: "#9e9e9e" }} />
      </div>
      {nomination.chamber === "both" ? (
        <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>
          House: {nomination.tally.houseFor ?? 0} for · {nomination.tally.houseAgainst ?? 0} against · {nomination.tally.houseAbstain ?? 0} abstain
        </div>
      ) : null}
    </div>
  );
}

export function NominationsPanel({ legislature, busy, onAction }: {
  legislature: LegislatureView;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
}) {
  const nominations = legislature.nominations ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nominations.find((n) => n.id === selectedId) ?? null;
  const sponsor = legislature.cabinetSponsor ?? null;
  const [positionId, setPositionId] = useState("");
  const [nomineeId, setNomineeId] = useState("");
  const chosenPosition = sponsor?.positions.find((p) => p.id === positionId) ?? null;
  const sponsorBlocked = !sponsor?.available
    ? (sponsor?.disabledReason ?? "Sponsorship unavailable")
    : chosenPosition && !chosenPosition.available
      ? (chosenPosition.disabledReason ?? "Office unavailable")
      : !positionId || !nomineeId
        ? "Choose an office and a nominee."
        : null;
  const sponsorDisabled = busy || sponsorBlocked !== null;

  const scotus = legislature.scotusSponsor ?? null;
  const [seatNumber, setSeatNumber] = useState("");
  const [justiceNomineeId, setJusticeNomineeId] = useState("");
  const chosenSeat = scotus?.seats.find((s) => String(s.seatNumber) === seatNumber) ?? null;
  const scotusBlocked = !scotus?.available
    ? (scotus?.disabledReason ?? "Sponsorship unavailable")
    : chosenSeat && !chosenSeat.available
      ? (chosenSeat.disabledReason ?? "Seat unavailable")
      : !seatNumber || !justiceNomineeId
        ? "Choose a seat and a nominee."
        : null;
  const scotusDisabled = busy || scotusBlocked !== null;

  const castVote = (nomination: NominationView, vote: Ballot) => {
    if (busy || !nomination.voting.available) return;
    onAction(nomination.kind === "scotus" ? "voteScotusNomination" : "voteCabinetNomination", {
      nominationId: nomination.id,
      vote,
    });
  };

  return (
    <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Nominations</h3>
      {nominations.length === 0 ? (
        <div className="ahd-empty">No nominations before the legislature.</div>
      ) : (
        <div style={{ display: "grid", gap: "0.4rem" }}>
          {nominations.map((nomination) => (
            <button
              key={nomination.id}
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ ...TOUCH, justifyContent: "flex-start", textAlign: "left" }}
              onClick={() => setSelectedId((cur) => (cur === nomination.id ? null : nomination.id))}
              aria-expanded={selected?.id === nomination.id}
              aria-label={`${nomination.office}: ${nomination.nominee}, ${nomination.statusLabel}`}
              disabled={busy}
            >
              {nomination.statusLabel} · {nomination.office} · {nomination.nominee}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <article aria-label={`Nomination detail for ${selected.nominee}`} className="ahd-card ahd-card-pad">
          <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{selected.office}</div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>
            {selected.statusLabel} · {selected.chamberLabel} · Nominee {selected.nominee}
            {selected.sponsor ? ` · Sponsored by ${selected.sponsor}` : ""}
            {` · Vote closes turn ${selected.votingEndsOnTurn}`}
          </div>
          <div style={{ marginTop: "0.3rem" }}>{voteBar(selected)}</div>
          <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>
            {selected.playerVote ? `Your vote: ${selected.playerVote}` : selected.status === "active" ? "Not yet voted" : "No recorded vote"}
          </div>
          {selected.status === "active" ? (
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
              {BALLOTS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="ahd-btn ahd-btn-primary ahd-btn-sm"
                  style={TOUCH}
                  onClick={() => castVote(selected, b.id)}
                  disabled={busy || !selected.voting.available}
                  aria-disabled={busy || !selected.voting.available}
                  aria-label={`${b.label} on ${selected.nominee}`}
                >
                  {b.label}
                </button>
              ))}
              {!selected.voting.available ? (
                <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{selected.voting.disabledReason ?? "Unavailable"}</span>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: "0.3rem 0 0" }}>Sponsor a cabinet nomination</h3>
      {sponsor?.available ? (
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <label className="ahd-field" style={{ maxWidth: "16rem" }}>
            <span className="ahd-label">Office</span>
            <select className="ahd-select" style={TOUCH} aria-label="Cabinet office" value={positionId}
              onChange={(e) => setPositionId(e.target.value)} disabled={busy}>
              <option value="">Choose an office</option>
              {sponsor.positions.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>{p.name}{p.available ? "" : " (unavailable)"}</option>
              ))}
            </select>
          </label>
          <label className="ahd-field" style={{ maxWidth: "16rem" }}>
            <span className="ahd-label">Nominee</span>
            <select className="ahd-select" style={TOUCH} aria-label="Nominee" value={nomineeId}
              onChange={(e) => setNomineeId(e.target.value)} disabled={busy}>
              <option value="">Choose a nominee</option>
              {sponsor.nominees.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" style={TOUCH}
              onClick={() => {
                if (sponsorDisabled || !legislature.countryId) return;
                onAction("sponsorCabinetNomination", { countryId: legislature.countryId, positionId, nomineeId });
              }}
              disabled={sponsorDisabled} aria-disabled={sponsorDisabled} aria-label="Sponsor nomination">
              Sponsor nomination
            </button>
            {sponsorBlocked ? <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{sponsorBlocked}</span> : null}
          </div>
        </div>
      ) : (
        <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: 0 }}>
          {sponsor?.disabledReason ?? "Cabinet sponsorship is unavailable."}
        </p>
      )}
      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: "0.3rem 0 0" }}>Sponsor a Supreme Court nomination</h3>
      {scotus?.available ? (
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <label className="ahd-field" style={{ maxWidth: "16rem" }}>
            <span className="ahd-label">Supreme Court seat</span>
            <select className="ahd-select" style={TOUCH} aria-label="Supreme Court seat" value={seatNumber}
              onChange={(e) => setSeatNumber(e.target.value)} disabled={busy}>
              <option value="">Choose a seat</option>
              {scotus.seats.map((s) => (
                <option key={s.seatNumber} value={String(s.seatNumber)} disabled={!s.available}>Seat #{s.seatNumber}{s.available ? "" : " (unavailable)"}</option>
              ))}
            </select>
          </label>
          <label className="ahd-field" style={{ maxWidth: "16rem" }}>
            <span className="ahd-label">Justice nominee</span>
            <select className="ahd-select" style={TOUCH} aria-label="Justice nominee" value={justiceNomineeId}
              onChange={(e) => setJusticeNomineeId(e.target.value)} disabled={busy}>
              <option value="">Choose a nominee</option>
              {scotus.nominees.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" style={TOUCH}
              onClick={() => {
                if (scotusDisabled || !legislature.countryId || seatNumber === "" || !justiceNomineeId) return;
                onAction("sponsorScotusNomination", { countryId: legislature.countryId, seatNumber: Number(seatNumber), nomineeId: justiceNomineeId });
              }}
              disabled={scotusDisabled} aria-disabled={scotusDisabled} aria-label="Sponsor justice nomination">
              Sponsor justice nomination
            </button>
            {scotusBlocked ? <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{scotusBlocked}</span> : null}
          </div>
        </div>
      ) : (
        <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: 0 }}>
          {scotus?.disabledReason ?? "Supreme Court sponsorship is unavailable."}
        </p>
      )}
    </div>
  );
}

export default NominationsPanel;
