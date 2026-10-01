import { useEffect, useState } from "react";
import type { UnionManagementRow, UnionManagementView } from "../game/unionManagement";
import type { GameCommand } from "../game/protocol";

type UnionCommand = Extract<GameCommand, { type: "unionCommand" }>;

export function UnionManagementPanel({
  state,
  busy,
  onCommand,
}: {
  state: UnionManagementView;
  busy: boolean;
  onCommand: (command: UnionCommand) => void;
}) {
  const rows = state.unions;
  return (
    <section className="ahd-card ahd-card-pad" aria-label="Union organization">
      <h2 className="ahd-h2">Union organization</h2>
      <p className="ahd-muted" style={{ margin: "0.3rem 0 0", fontSize: "0.74rem" }}>
        Organizing strength follows recorded sector workers and opens a weighted leadership election at 100.
      </p>
      <ul style={{ listStyle: "none", margin: "0.65rem 0 0", padding: 0, display: "grid", gap: "0.65rem" }}>
        {rows.map((union) => <UnionRow key={union.id} union={union} playerActions={state.playerActions} busy={busy} onCommand={onCommand} />)}
      </ul>
      {rows.length === 0 ? <div className="ahd-empty">No unions are recorded in this country.</div> : null}
    </section>
  );
}

function UnionRow({ union, playerActions, busy, onCommand }: {
  union: UnionManagementRow;
  playerActions: number;
  busy: boolean;
  onCommand: (command: UnionCommand) => void;
}) {
  const [duesDraft, setDuesDraft] = useState(String(union.duesPerWorkerAnnual));
  useEffect(() => setDuesDraft(String(union.duesPerWorkerAnnual)), [union.duesPerWorkerAnnual]);
  const playerLeads = union.ownerType === "player" && union.ownerId === "player";
  const pendingForPlayer = union.pendingLeaderCharacterId === "player";
  const employerId = union.representedEmployerIds[0];
  const campaign = union.campaigns.find((row) => row.status === "negotiating" || row.status === "dispute");
  return (
    <li data-testid={`union-${union.id}`} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem", display: "grid", gap: "0.4rem", minWidth: 0 }}>
      <strong style={{ overflowWrap: "anywhere" }}>{union.name}</strong>
      <span className="ahd-muted" style={{ fontSize: "0.75rem" }}>
        {union.sectorType} · {Math.round(union.representedWorkers).toLocaleString()} represented workers · Organizing strength {union.strength.toFixed(1)} / 100
      </span>
      <span style={{ fontSize: "0.75rem" }}>
        President: {playerLeads ? "You" : union.ownerType === "npp" ? "National politician" : "Vacant"}
        {pendingForPlayer ? " · Presidency offered to you" : ""}
      </span>
      <span className="ahd-muted" style={{ fontSize: "0.73rem" }}>Union approval: {union.approval.toFixed(1)}%</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
        <button
          type="button"
          className="ahd-btn ahd-btn-sm"
          style={{ minHeight: 44 }}
          disabled={busy || playerActions < 5}
          onClick={() => onCommand({ type: "unionCommand", op: "organize", unionId: union.id })}
          aria-label={`Organize ${union.name}`}
        >
          Organize union (5 AP)
        </button>
        {union.electionOpen && union.playerOrganizerStrength > 0 && !playerLeads && !pendingForPlayer ? (
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            style={{ minHeight: 44 }}
            disabled={busy}
            onClick={() => onCommand({ type: "unionCommand", op: "vote", unionId: union.id })}
          >
            Vote to lead
          </button>
        ) : null}
        {pendingForPlayer ? (
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            style={{ minHeight: 44 }}
            disabled={busy}
            onClick={() => onCommand({ type: "unionCommand", op: "accept", unionId: union.id })}
          >
            Accept presidency
          </button>
        ) : null}
        {playerLeads ? (
          <>
            <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.72rem" }}>
              Annual dues per member
              <input
                type="number"
                min="0"
                max={union.maxDuesPerWorkerAnnual}
                step="0.01"
                value={duesDraft}
                onChange={(event) => setDuesDraft(event.currentTarget.value)}
                aria-label={`Annual dues per member for ${union.name}`}
              />
            </label>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: 44 }}
              disabled={busy || !Number.isFinite(Number(duesDraft)) || Number(duesDraft) < 0}
              onClick={() => onCommand({ type: "unionCommand", op: "dues", unionId: union.id, duesPerWorkerAnnual: Number(duesDraft) })}
            >
              Set annual dues
            </button>
          </>
        ) : null}
        {playerLeads ? union.sectors.map((sector) => (
          <button
            key={sector.id}
            type="button"
            className="ahd-btn ahd-btn-sm"
            style={{ minHeight: 44 }}
            disabled={busy || playerActions < 1 || union.treasury < sector.treasuryCost}
            onClick={() => onCommand({ type: "unionCommand", op: "organizeSector", unionId: union.id, assetId: sector.id })}
            aria-label={`Organize sector ${sector.corporationId}${sector.strikeStartedAtTurn != null ? ", currently on strike" : ""}`}
          >
            Organize {sector.corporationId} sector · {sector.unionization.toFixed(1)}% · {sector.treasuryCost.toLocaleString()} treasury{sector.strikeStartedAtTurn != null ? " · On strike" : ""}
          </button>
        )) : null}
        {playerLeads && campaign?.currentOfferBy === "employer" && campaign.ratification?.status !== "open" ? (
          <>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: 44 }}
              disabled={busy}
              onClick={() => onCommand({ type: "unionCommand", op: "move", campaignId: campaign.id, action: "accept" })}
            >
              Accept employer offer
            </button>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: 44 }}
              disabled={busy}
              onClick={() => onCommand({
                type: "unionCommand",
                op: "move",
                campaignId: campaign.id,
                action: "counter",
                terms: { wageLevel: Math.min(1.6, campaign.wageLevel + 0.05), agreementDurationTurns: campaign.agreementDurationTurns, noStrikeTurns: campaign.noStrikeTurns },
              })}
            >
              Counter employer offer
            </button>
          </>
        ) : null}
        {playerLeads && campaign?.ratification?.status === "open" ? (
          <>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: 44 }}
              disabled={busy || campaign.ratification.votedByPlayer}
              onClick={() => onCommand({ type: "unionCommand", op: "ratify", campaignId: campaign.id, vote: "ratify" })}
            >
              Vote to ratify offer
            </button>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: 44 }}
              disabled={busy || campaign.ratification.votedByPlayer}
              onClick={() => onCommand({ type: "unionCommand", op: "ratify", campaignId: campaign.id, vote: "reject" })}
            >
              Vote to reject offer
            </button>
          </>
        ) : null}
        {playerLeads && campaign && campaign.ratification?.status !== "open" ? (
          <>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: 44 }}
              disabled={busy}
              onClick={() => onCommand({ type: "unionCommand", op: "move", campaignId: campaign.id, action: "withdraw" })}
            >
              Withdraw bargaining
            </button>
            {campaign.status === "dispute" && campaign.nextEscalationLevel ? (
              <button
                type="button"
                className="ahd-btn ahd-btn-sm"
                style={{ minHeight: 44 }}
                disabled={busy || !campaign.canEscalate}
                title={campaign.canEscalate ? undefined : `Requires ${campaign.nextEscalationSupport} member support; mandate is ${campaign.support}.`}
                onClick={() => onCommand({ type: "unionCommand", op: "move", campaignId: campaign.id, action: "escalate" })}
              >
                Escalate to {campaign.nextEscalationLevel.replaceAll("_", " ")}
              </button>
            ) : null}
          </>
        ) : null}
        {playerLeads && !campaign && employerId ? (
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            style={{ minHeight: 44 }}
            disabled={busy}
            onClick={() => onCommand({
              type: "unionCommand",
              op: "call",
              unionId: union.id,
              employerId,
              terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
            })}
            aria-label={`Call ${employerId} to bargain`}
          >
            Call {employerId} to bargain
          </button>
        ) : null}
      </div>
      {campaign ? <span className="ahd-muted" style={{ fontSize: "0.73rem" }}>
        Bargaining: {campaign.status}; latest offer by {campaign.currentOfferBy} at {Math.round(campaign.wageLevel * 100)}% wage; industrial action {campaign.escalationLevel.replaceAll("_", " ")}; mandate support {campaign.support}%.
        {campaign.ratification?.status === "open" ? ` Ratification ballot open${campaign.ratification.votedByPlayer ? "; your vote is recorded." : "."}` : ""}
      </span> : null}
      {union.agreements.map((agreement) => <span key={agreement.id} className="ahd-muted" style={{ fontSize: "0.73rem" }}>
        Active agreement with {agreement.employerCorporationId}: wage floor {Math.round(agreement.wageLevel * 100)}%; turns {agreement.startsAtTurn} to {agreement.expiresAtTurn}.
      </span>)}
      {playerLeads ? <span className="ahd-muted" style={{ fontSize: "0.73rem" }}>
        Treasury {union.treasury.toLocaleString()} · dues cap {union.maxDuesPerWorkerAnnual.toFixed(2)} per member annually · projected dues {union.duesIncomePerTurn.toLocaleString()} per turn.
      </span> : null}
      {playerLeads && !employerId ? <span className="ahd-muted" style={{ fontSize: "0.73rem" }}>
        No represented employer has recorded a local for bargaining.
      </span> : null}
    </li>
  );
}
