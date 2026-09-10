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
import { validatePartyDraft } from "../game/partyDraft";
import { formatFinanceMoney } from "./FinancePanel";

export interface PartyManagementPanelProps {
  management: PartyManagementView;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
}

export function PartyManagementPanel({ management, busy, onAction }: PartyManagementPanelProps) {
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
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
      <div className="ahd-card ahd-card-pad">
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
          You join the new party at once and must wait before switching again.
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
        <h2 className="ahd-h2">Charters ({management.charters.length})</h2>
        {management.charters.length === 0 ? (
          <div className="ahd-empty">No charters recorded in {management.countryName} yet.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
