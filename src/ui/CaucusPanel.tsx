/**
 * CaucusPanel: party-scoped caucus roster plus founding, join, leave and the
 * chair-only tax edit/disband.
 *
 * Layout hierarchy adapted from the public AHDGame reference at e364c0495:
 *   src/app/country/[code]/parties/[id]/components/CaucusesTab.tsx (party
 *   list, tax, founding) and
 *   src/app/country/[code]/parties/[id]/components/caucus/FoundCaucusForm.tsx
 *   (name plus 0-5 tax) plus SelectedCaucus.tsx join/leave/disband and
 *   caucus/ChairSubtab.tsx (chair tax + settings). No server or Next.js
 *   imports; props arrive through the CaucusManagementView DTO, so the engine
 *   package never enters the React bundle (type-only import below). Inline
 *   draft checks run synchronously from the DTO via caucusDraft, so typing
 *   never issues worker queries. Chair, vice-chair, roster and the player's
 *   recorded role render from the saved seats with explicit unknown copy when
 *   a legacy save never recorded them. Whip, health, recruitment, color,
 *   description, chair elections and NPP recruit are not persisted fields, so
 *   the panel names them as unrecorded instead of inventing values.
 *   Section navigation, the management query and action dispatch are owned by
 *   root.
 */
import { useState } from "react";
import type { GameScreenProps } from "../game/types";
import type { CaucusManagementView } from "../game/caucusManagement";
import { validateCaucusDraft } from "../game/caucusDraft";
import { formatFinanceMoney } from "./FinancePanel";

export interface CaucusPanelProps {
  management: CaucusManagementView;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
}

export function CaucusPanel({ management, busy, onAction }: CaucusPanelProps) {
  const [name, setName] = useState("");
  const [taxText, setTaxText] = useState("0");
  // Per-caucus chair tax draft, keyed by caucus id. A caucus the player chairs
  // seeds its input from the saved rate; unrelated caucuses are never shown one.
  const [chairTaxText, setChairTaxText] = useState<Record<string, string>>({});
  const create = management.create;
  const trimmedName = name.trim();
  const taxRate = Number(taxText);
  const verdict = trimmedName ? validateCaucusDraft(management, trimmedName, taxRate) : null;
  const canSubmit = !busy && create.available && verdict != null && verdict.ok;

  const submit = () => {
    if (!canSubmit) return;
    onAction("createCaucus", { caucusName: trimmedName, caucusTaxRate: taxRate });
  };

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">Caucuses</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {management.caucusCount} {management.caucusCount === 1 ? "caucus" : "caucuses"}
          {management.playerPartyName ? ` in ${management.playerPartyName}` : ` in ${management.countryName}`}
        </p>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.2rem" }}>
          {management.playerCaucusName
            ? `You belong to ${management.playerCaucusName}.`
            : management.playerPartyName
              ? "You are not in a caucus."
              : "You are independent."}
        </p>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Caucuses are opt-in sub-groups inside your party. Founding costs {create.actionCost} actions
          and {formatFinanceMoney(create.fundCost, management.currency)}. Tax ({create.taxMin}-{create.taxMax}%)
          is set when the caucus is created.
          {create.consequences.length > 0 ? ` Effects: ${create.consequences.join(" · ")}.` : ""}
        </p>
      </div>

      {!management.playerCaucusId && <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Found a caucus</h2>
        <label className="ahd-field" style={{ maxWidth: "22rem" }}>
          <span className="ahd-label">Caucus name</span>
          <input className="ahd-input" aria-label="Caucus name" value={name}
            onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={80} />
        </label>
        <label className="ahd-field" style={{ maxWidth: "12rem", marginTop: "0.5rem" }}>
          <span className="ahd-label">Tax rate ({create.taxMin}-{create.taxMax}%)</span>
          <input className="ahd-input" aria-label="Caucus tax" type="number"
            min={create.taxMin} max={create.taxMax} step={0.5}
            value={taxText} onChange={(e) => setTaxText(e.target.value)} disabled={busy} />
        </label>
        {verdict && !verdict.ok ? <p className="ahd-help" role="note">{verdict.error}</p> : null}

        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.55rem" }}>
          <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm"
            disabled={!canSubmit} aria-disabled={!canSubmit} aria-label="Found caucus"
            onClick={submit}>
            Found caucus
          </button>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
            {!create.available ? (create.disabledReason ?? "Unavailable")
              : `Cost ${create.actionCost} actions and ${formatFinanceMoney(create.fundCost, management.currency)}`}
          </span>
        </div>
      </div>}

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Roster ({management.caucuses.length})</h2>
        {!management.playerPartyId ? (
          <div className="ahd-empty">Join a party to found or join a caucus.</div>
        ) : management.caucuses.length === 0 ? (
          <div className="ahd-empty">No caucuses in {management.playerPartyName} yet.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {management.caucuses.map((caucus) => {
              const membership = caucus.isPlayerCaucus ? caucus.leave : caucus.join;
              const membershipKind = caucus.isPlayerCaucus ? "leave" : "join";
              const canAct = !busy && membership.available;
              return (
                <li key={caucus.id} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.45rem", fontSize: "0.8rem" }}>
                  <div style={{ display: "flex", gap: "0.45rem", alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 650 }}>{caucus.name}</span>
                    {caucus.isPlayerCaucus ? <span className="ahd-muted"> · yours</span> : null}
                  </div>
                  <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0 0" }}>
                    {caucus.memberCount} {caucus.memberCount === 1 ? "member" : "members"}
                    {" · "}Tax {caucus.taxRate}%
                    {" · "}{formatFinanceMoney(caucus.treasury, management.currency)}
                  </p>
                  <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.1rem 0 0" }}>
                    Chair: {caucus.chairState === "known" ? caucus.chairName
                      : caucus.chairState === "vacant" ? "vacant"
                      : "unknown (not recorded in this save)"}
                    {" · "}Vice-chair: {caucus.viceChairState === "known" ? caucus.viceChairName
                      : caucus.viceChairState === "vacant" ? "vacant"
                      : "unknown (not recorded in this save)"}
                    {" · "}Your role: {caucus.playerRole === "non-member" ? "not a member" : caucus.playerRole}
                  </p>
                  {caucus.memberNames.length > 0 ? (
                    <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.1rem 0 0" }}>
                      {caucus.memberNames.join(", ")}
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.4rem" }}>
                    <button type="button" className="ahd-btn ahd-btn-sm"
                      disabled={!canAct} aria-disabled={!canAct}
                      aria-label={caucus.isPlayerCaucus ? `Leave ${caucus.name}` : `Join ${caucus.name}`}
                      onClick={() => {
                        if (!canAct) return;
                        if (membershipKind === "join") onAction("joinCaucus", { caucusId: caucus.id });
                        else onAction("leaveCaucus");
                      }}>
                      {caucus.isPlayerCaucus ? "Leave caucus" : "Join caucus"}
                    </button>
                    <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                      {!membership.available ? (membership.disabledReason ?? "Unavailable")
                        : membership.cost > 0 ? `Cost ${membership.cost} actions` : "Free"}
                      {membership.available && membership.consequences && membership.consequences.length > 0
                        ? ` · ${membership.consequences.join(" · ")}` : ""}
                    </span>
                  </div>
                  {caucus.isPlayerChair ? (
                    <div style={{ display: "flex", gap: "0.45rem", alignItems: "flex-end", flexWrap: "wrap", marginTop: "0.5rem", borderTop: "1px dashed var(--ahd-border)", paddingTop: "0.45rem" }}>
                      <label className="ahd-field" style={{ maxWidth: "10rem" }}>
                        <span className="ahd-label">Tax rate ({create.taxMin}-{create.taxMax}%)</span>
                        <input className="ahd-input" type="number" min={create.taxMin} max={create.taxMax} step={0.5}
                          aria-label={`Caucus tax for ${caucus.name}`}
                          value={chairTaxText[caucus.id] ?? String(caucus.taxRate)}
                          onChange={(e) => setChairTaxText((prev) => ({ ...prev, [caucus.id]: e.target.value }))}
                          disabled={busy}
                          title={caucus.setTax.disabledReason} />
                      </label>
                      <button type="button" className="ahd-btn ahd-btn-sm"
                        disabled={busy || !caucus.setTax.available} aria-disabled={busy || !caucus.setTax.available}
                        aria-label={`Save ${caucus.name} tax`}
                        onClick={() => {
                          const rate = Number(chairTaxText[caucus.id] ?? caucus.taxRate);
                          if (!Number.isFinite(rate)) return;
                          onAction("setCaucusTaxRate", { caucusId: caucus.id, caucusTaxRate: rate });
                        }}>
                        Save tax
                      </button>
                      <button type="button" className="ahd-btn ahd-btn-sm"
                        disabled={busy || !caucus.disband.available} aria-disabled={busy || !caucus.disband.available}
                        aria-label={`Disband ${caucus.name}`}
                        title={caucus.disband.disabledReason}
                        onClick={() => {
                          if (!caucus.disband.available) return;
                          const membersLabel = `${caucus.memberCount} ${caucus.memberCount === 1 ? "membership" : "memberships"}`;
                          const warning = `Disband ${caucus.name}? All ${membersLabel} will be cleared and the chair seats vacated. This is free (no action-point or fund charge).`;
                          if (!window.confirm(warning)) return;
                          onAction("disbandCaucus", { caucusId: caucus.id });
                        }}>
                        Disband
                      </button>
                      <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                        {!caucus.setTax.available ? (caucus.setTax.disabledReason ?? "Unavailable")
                          : caucus.setTax.cost > 0 || (caucus.setTax.fundCost ?? 0) > 0
                            ? `Cost ${caucus.setTax.cost} actions`
                            : `Free · ${caucus.setTax.consequences?.[0] ?? "Chair controls"}`}
                      </span>
                      <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                        {!caucus.disband.available ? (caucus.disband.disabledReason ?? "Unavailable")
                          : caucus.disband.cost > 0 || (caucus.disband.fundCost ?? 0) > 0
                            ? `Cost ${caucus.disband.cost} actions`
                            : `Free · ${caucus.disband.consequences?.[0] ?? "Chair controls"}`}
                      </span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="ahd-help" role="note" style={{ marginTop: "0.45rem" }}>
          Health, whip, recruitment and elections are not recorded in this save, so the roster shows
          only the saved seats, members, tax and treasury.
        </p>
      </div>
    </div>
  );
}

export default CaucusPanel;
