/**
 * CabinetOfficePanel: ministerial order issuance for the player's nation.
 *
 * Read-only state arrives through the CabinetOfficeView DTO (positions with
 * holders and eligibility, classified orders with engine refusal reasons,
 * live active orders, target-region options); issuing goes through the
 * `onIssue` session command, never the generic action catalog. The notice
 * prop carries the command refusal/result text. Layout follows the stacked
 * ahd-card pattern used by the other nation surfaces so it stays usable at
 * 320px widths: one select per row, full-width controls, no side columns.
 */
import { useState } from "react";
import type { CabinetOfficeView } from "../game/cabinetOffice";
import type { IssueCabinetOrderInput } from "../game/cabinetOffice";
import { RouteHero, executiveHero } from "./RouteHero";

export interface CabinetOfficeNotice {
  kind: "ok" | "error";
  text: string;
}

export interface CabinetOfficePanelProps {
  office: CabinetOfficeView;
  busy: boolean;
  notice: CabinetOfficeNotice | null;
  onIssue: (input: IssueCabinetOrderInput) => void;
}

function effectLabel(metric: string, modifier: number): string {
  const sign = modifier >= 0 ? "+" : "";
  return `${metric} ${sign}${modifier}`;
}

export function CabinetOfficePanel({ office, busy, notice, onIssue }: CabinetOfficePanelProps) {
  const positions = office.positions;
  const [positionId, setPositionId] = useState(positions[0]?.id ?? "");
  const position = positions.find((candidate) => candidate.id === positionId) ?? positions[0];
  const [orderId, setOrderId] = useState<string | undefined>(undefined);
  const order = position?.orders.find((candidate) => candidate.id === orderId) ?? position?.orders[0];
  const [targetRegionId, setTargetRegionId] = useState(office.regions[0]?.id ?? "");

  const needsTarget = order?.targetsRegion === true && order.available && !order.alreadyActive;
  const canSubmit = !busy
    && position !== undefined
    && order !== undefined
    && position.canIssue
    && order.available
    && (!needsTarget || targetRegionId !== "");

  const submit = () => {
    if (!canSubmit || !position || !order) return;
    onIssue({
      positionId: position.id,
      orderId: order.id,
      ...(needsTarget && targetRegionId ? { targetRegionId } : {}),
    });
  };

  return (
    <div className="ahd-stack">
      <RouteHero
        image={executiveHero(office.countryId)}
        alt={`${office.countryName} cabinet office`}
        eyebrow={office.countryName}
        title="Cabinet office"
      >
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.32rem 0 0" }}>
          {office.isExecutive
            ? "You hold the presidency, so you may issue orders for any held portfolio."
            : "Only an office holder, or the sitting executive for another portfolio, may issue orders."}
        </p>
      </RouteHero>

      {notice ? (
        <div className={notice.kind === "ok" ? "ahd-notice" : "ahd-alert"} role={notice.kind === "ok" ? "status" : "alert"}>
          {notice.text}
        </div>
      ) : null}

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Issue a ministerial order</h2>
        {positions.length === 0 ? (
          <p className="ahd-muted" style={{ fontSize: "0.78rem" }}>No cabinet offices are recorded for this country.</p>
        ) : (
          <>
            <label className="ahd-field" style={{ maxWidth: "24rem" }}>
              <span className="ahd-label">Office</span>
              <select
                className="ahd-input"
                aria-label="Cabinet office"
                value={position?.id ?? ""}
                disabled={busy}
                onChange={(event) => { setPositionId(event.target.value); setOrderId(undefined); }}
              >
                {positions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}{entry.isVacant ? " (vacant)" : ` (${entry.holderName})`}
                  </option>
                ))}
              </select>
            </label>
            {position ? (
              <p className="ahd-help" role="note" style={{ marginTop: "0.35rem" }}>
                {position.isVacant
                  ? "This office is vacant: no order can be issued for it."
                  : `${position.holderName}${position.isPlayerHolder ? " (you)" : ""} · ${position.actionsRemaining ?? 0} ministerial actions remaining.`}
                {position.eligibilityReason && !position.isVacant ? ` ${position.eligibilityReason}` : ""}
                {position.eligibilityReason && position.isVacant ? ` ${position.eligibilityReason}` : ""}
              </p>
            ) : null}

            {position && position.orders.length === 0 ? (
              <p className="ahd-muted" style={{ fontSize: "0.78rem", marginTop: "0.4rem" }}>
                This office advertises no ministerial orders.
              </p>
            ) : null}
            {position && position.orders.length > 0 ? (
              <label className="ahd-field" style={{ maxWidth: "24rem", marginTop: "0.5rem" }}>
                <span className="ahd-label">Order</span>
                <select
                  className="ahd-input"
                  aria-label="Ministerial order"
                  value={order?.id ?? ""}
                  disabled={busy}
                  onChange={(event) => setOrderId(event.target.value)}
                >
                  {position.orders.map((entry) => (
                    <option key={entry.id} value={entry.id} disabled={!entry.available}>
                      {entry.name}{!entry.available ? ` (${entry.disabledReason ?? "unavailable"})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {order ? (
              <div style={{ marginTop: "0.35rem" }}>
                <p className="ahd-muted" style={{ fontSize: "0.78rem" }}>{order.description}</p>
                <p className="ahd-muted" style={{ fontSize: "0.74rem" }}>
                  Duration {order.duration} turns · Effects: {order.effects.map((effect) => effectLabel(effect.metric, effect.modifier)).join("; ") || "none recorded"}
                </p>
                {order.alreadyActive ? <p className="ahd-help" role="note">This order is already active for this position.</p> : null}
                {!order.available && !order.alreadyActive ? <p className="ahd-help" role="note">{order.disabledReason}</p> : null}
              </div>
            ) : null}

            {needsTarget ? (
              <label className="ahd-field" style={{ maxWidth: "24rem", marginTop: "0.5rem" }}>
                <span className="ahd-label">Target region</span>
                <select
                  className="ahd-input"
                  aria-label="Target region"
                  value={targetRegionId}
                  disabled={busy}
                  onChange={(event) => setTargetRegionId(event.target.value)}
                >
                  {office.regions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.55rem" }}>
              <button
                type="button"
                className="ahd-btn ahd-btn-primary ahd-btn-sm"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                aria-label="Issue ministerial order"
                onClick={submit}
              >
                Issue order
              </button>
              {!position?.canIssue && position && !position.isVacant ? (
                <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{position.eligibilityReason}</span>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Active orders</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {office.activeOrders.length} {office.activeOrders.length === 1 ? "order" : "orders"} in force
        </p>
        {office.activeOrders.length === 0 ? (
          <p className="ahd-muted" style={{ fontSize: "0.78rem" }}>No ministerial orders are currently in force.</p>
        ) : (
          <dl style={{ margin: "0.4rem 0 0", display: "grid", gap: "0.45rem" }}>
            {office.activeOrders.map((entry) => (
              <div key={entry.id} className="ahd-kv">
                <dt>
                  {entry.orderName}
                  <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem", fontWeight: 400 }}>
                    {entry.positionName}
                    {entry.targetRegionName ? ` · ${entry.targetRegionName}` : ""} · expires turn {entry.expiresTurn} ({entry.turnsRemaining} {entry.turnsRemaining === 1 ? "turn" : "turns"} left)
                  </span>
                </dt>
                <dd className="ahd-mono" style={{ margin: 0, textAlign: "right", fontSize: "0.72rem" }}>
                  {entry.effects.map((effect) => effectLabel(effect.metric, effect.modifier)).join("; ")}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
