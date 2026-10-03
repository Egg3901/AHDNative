/**
 * PartyManagementPanel: party founding form plus the country charter roster.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/app/parties/page.tsx (party list with member counts) and
 *   src/app/parties/[id]/page.tsx (party detail with platform and roster),
 *   plus the charter draft flow under src/lib/charters (name, abbreviation,
 *   founder cost). No server or Next.js imports; props arrive through the
 *   PartyManagementView DTO, so the
 *   engine package never enters the React bundle (type-only import below).
 *   Inline draft checks run synchronously from the DTO via partyDraft, so
 *   typing never issues worker queries. Section navigation, the management
 *   query and action dispatch are owned by root.
 */
import { useState } from "react";
import type { GameScreenProps } from "../game/types";
import type { PartyManagementView } from "../game/partyManagement";

function MergerNppWarning() {
  return (
    <aside role="note" aria-label="Merger warning: excess incoming NPPs are permanently deleted"
      style={{ border: "1px solid var(--ahd-border)", borderRadius: "0.45rem", padding: "0.55rem", marginTop: "0.5rem", fontSize: "0.72rem" }}>
      <p><strong>Merger warning: excess incoming NPPs are permanently deleted</strong></p>
      <p>The target keeps all existing NPPs, even if already over either limit. Only incoming NPPs can be deleted.</p>
      <p>Incoming active NPPs must fit remaining home-region slots: 2 below 30% organization, 3 from 30% to below 40%, 4 from 40% to below 50%, and 5 at 50% or more after half the absorbed party's organization is added.</p>
      <p>They must also fit the combined party's national limit: 5 per active player, up to 25. An active player needs at least 2 qualifying actions in the last 14 days; members of both parties count after the merger.</p>
      <p>Regional limits apply first. Incoming NPPs are retained by political influence, favorability, then stable ID. Retired NPPs transfer without using slots. Limits are checked when the merger takes effect.</p>
      <p><strong>Culled NPP office and candidacy records are removed; their campaigns are archived. Holding office does not protect an incoming NPP.</strong></p>
    </aside>
  );
}
import { validatePartyDraft } from "../game/partyDraft";
import { formatFinanceMoney } from "./FinancePanel";
import { PartyMark } from "./PartyMark";

export interface PartyManagementPanelProps {
  management: PartyManagementView;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
}

export function PartyManagementPanel({ management, busy, onAction }: PartyManagementPanelProps) {
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [targetPartyId, setTargetPartyId] = useState("");
  const founding = management.founding;
  const trimmedName = name.trim();
  const trimmedAbbr = abbreviation.trim();
  const verdict = trimmedName || trimmedAbbr ? validatePartyDraft(management, trimmedName, trimmedAbbr) : null;
  const canSubmit = !busy && founding.available && verdict != null && verdict.ok;

  const submit = () => {
    if (!canSubmit) return;
    onAction("foundParty", { foundPartyName: trimmedName, foundPartyAbbr: trimmedAbbr });
  };

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">Start a party</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {management.partyCount} {management.partyCount === 1 ? "party" : "parties"} in {management.countryName}
          {management.foundedCount > 0 ? ` (${management.foundedCount} founded by players)` : ""}
        </p>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.2rem" }}>
          {management.playerPartyName ? `You belong to ${management.playerPartyName}.` : "You are independent."}
        </p>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Founding costs {founding.actionCost} actions and {formatFinanceMoney(founding.fundCost, management.currency)}.
          {founding.consequences.length > 0 ? ` Effects: ${founding.consequences.join(" · ")}.` : ""}
        </p>
      </div>

      <div className="ahd-card ahd-card-pad">
        <label className="ahd-field" style={{ maxWidth: "22rem" }}>
          <span className="ahd-label">Party name</span>
          <input className="ahd-input" aria-label="Party name" value={name}
            onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={80} />
        </label>
        <label className="ahd-field" style={{ maxWidth: "12rem", marginTop: "0.5rem" }}>
          <span className="ahd-label">Abbreviation</span>
          <input className="ahd-input" aria-label="Abbreviation" value={abbreviation}
            onChange={(e) => setAbbreviation(e.target.value)} disabled={busy} maxLength={12} />
        </label>
        {verdict && !verdict.ok ? <p className="ahd-help" role="note">{verdict.error}</p> : null}
        
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.55rem" }}>
          <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm"
            disabled={!canSubmit} aria-disabled={!canSubmit} aria-label="Found party"
            onClick={submit}>
            Found party
          </button>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
            {!founding.available ? (founding.disabledReason ?? "Unavailable")
              : `Cost ${founding.actionCost} actions and ${formatFinanceMoney(founding.fundCost, management.currency)}`}
          </span>
        </div>
      </div>

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Parties ({management.parties.length})</h2>
        {management.parties.length === 0 ? (
          <div className="ahd-empty">No parties recorded in {management.countryName} yet.</div>
        ) : (
          <ul aria-label="Parties" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {management.parties.map((party) => (
              <li key={party.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.45rem" }}>
                <PartyMark name={party.name} abbreviation={party.abbreviation} color={party.color} id={party.id} countryId={management.countryId} logoUrl={party.logoUrl} size={24} />
                <span style={{ minWidth: 0, flex: "1 1 auto", fontSize: "0.8rem" }}>
                  <span style={{ fontWeight: 650 }}>{party.name}</span>
                  <span className="ahd-muted"> ({party.abbreviation})</span>
                </span>
                <span className="ahd-muted" style={{ flex: "0 0 auto", fontSize: "0.72rem" }}>
                  {party.members.toLocaleString()} members{party.isPlayerParty ? " · yours" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {management.merger ? (
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Committee merger proposals</h2>
          <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
            Both parties vote separately. Each needs yes votes from at least 60% of its filled committee and national leadership positions; proposals close after 24 turns.
          </p>
          <MergerNppWarning />
          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.55rem" }}>
            <label className="ahd-field" style={{ maxWidth: "22rem" }}>
              <span className="ahd-label">Merge your party into</span>
              <select className="ahd-input" aria-label="Merger target party" value={targetPartyId}
                onChange={(event) => setTargetPartyId(event.target.value)} disabled={busy || !management.merger.available}>
                <option value="">Choose a party</option>
                {management.merger.targets.map((party) => <option key={party.id} value={party.id}>{party.name} ({party.abbreviation})</option>)}
              </select>
            </label>
            <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" disabled={busy || !management.merger.available || !targetPartyId}
              aria-label="Propose party merger" onClick={() => onAction("proposePartyMerger", { targetPartyId })}>
              Propose merger
            </button>
            {!management.merger.available ? <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{management.merger.disabledReason}</span> : null}
          </div>
          {management.merger.proposals.length === 0 ? <div className="ahd-empty" style={{ marginTop: "0.5rem" }}>No merger proposals in this country.</div> : (
            <ul aria-label="Party merger proposals" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {management.merger.proposals.map((proposal) => (
                <li key={proposal.id} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.45rem", fontSize: "0.8rem" }}>
                  <div><strong>{proposal.proposerPartyName}</strong> → {proposal.targetPartyName} · {proposal.status}</div>
                  <div className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                    Proposing side {proposal.proposingYes} yes / {proposal.proposingNo} no; target side {proposal.targetYes} yes / {proposal.targetNo} no.
                    {proposal.status === "open" ? ` Closes on turn ${proposal.expiresTurn}.` : ""}
                  </div>
                  {proposal.status === "open" ? <MergerNppWarning /> : null}
                  {proposal.canVote ? (
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem" }}>
                      <button type="button" className="ahd-btn ahd-btn-sm" disabled={busy} aria-label={`Vote yes on ${proposal.proposerPartyName} merger`}
                        onClick={() => onAction("votePartyMerger", { partyMergerProposalId: proposal.id, partyMergerVote: "yes" })}>Vote yes</button>
                      <button type="button" className="ahd-btn ahd-btn-sm" disabled={busy} aria-label={`Vote no on ${proposal.proposerPartyName} merger`}
                        onClick={() => onAction("votePartyMerger", { partyMergerProposalId: proposal.id, partyMergerVote: "no" })}>Vote no</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Charters ({management.charters.length})</h2>
        {management.charters.length === 0 ? (
          <div className="ahd-empty">No charters recorded in {management.countryName} yet.</div>
        ) : (
          <ul aria-label="Charters" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {management.charters.map((charter) => (
              <li key={charter.id} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.4rem", fontSize: "0.8rem" }}>
                <span style={{ fontWeight: 650 }}>{charter.partyName ?? "Unnamed party"}</span>
                <span className="ahd-muted"> · {charter.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PartyManagementPanel;
