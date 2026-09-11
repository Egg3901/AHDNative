/**
 * ActionsHub: categorized player Actions destination.
 *
 * Hierarchy ports AHDGame src/app/actions (actionsConstants.ts CATEGORY_LABELS:
 * influence = Influence, money = Fundraising, research = Intelligence) with
 * counts based on current eligibility. Every cost, cooldown, prerequisite and
 * unavailable reason renders from the GameSession projection, which mirrors
 * engine executeAction validation; executeAction remains authoritative.
 */
import { useState } from "react";
import type { ActionCategory, ActionView, GameScreenProps } from "../game/types";
import type { ActionHistoryEntry } from "../game/notifications";
import { formatFinanceMoney } from "./FinancePanel";

export type ActionsCategoryFilter = "all" | ActionCategory;

export const ACTION_HUB_CATEGORIES: { id: ActionsCategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "influence", label: "Influence" },
  { id: "fundraising", label: "Fundraising" },
  { id: "intelligence", label: "Intelligence" },
];

function formatFunds(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return formatFinanceMoney(amount, currency);
  }
}

function ActionCard({
  action,
  busy,
  currency,
  regions,
  parties,
  onAction,
}: {
  action: ActionView;
  busy: boolean;
  currency: string;
  regions: { id: string; name: string }[];
  parties: { id: string; name: string; abbreviation: string }[];
  onAction: GameScreenProps["onAction"];
}) {
  const [amount, setAmount] = useState("10");
  const [partyId, setPartyId] = useState(parties[0]?.id ?? "");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");

  const [amountError, setAmountError] = useState<string | null>(null);
  const disabled = busy || !action.available;
  const hint = !action.available ? action.disabledReason ?? "Unavailable" : `Cost ${action.cost} actions`;

  const handle = () => {
    if (disabled) return;
    const params: Record<string, string | number> = {};
    if (action.requires === "amount") {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        setAmountError("Enter a positive whole amount.");
        return;
      }
      setAmountError(null);
      params.amount = n;
    }
    if (action.requires === "party") {
      if (!partyId || !parties.some((pp) => pp.id === partyId)) {
        return;
      }
      params.partyId = partyId;
    }
    if (action.requires === "region") {
      if (!regionId || !regions.some((rr) => rr.id === regionId)) {
        return;
      }
      params.regionId = regionId;
    }
    onAction(action.id, Object.keys(params).length ? params : undefined);
  };

  const categoryLabel = ACTION_HUB_CATEGORIES.find((c) => c.id === action.category)?.label;
  const cooldown = action.cooldownTurns ?? 0;

  return (
    <article
      aria-label={action.name}
      className="ahd-card ahd-card-pad"
      style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
    >
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 750, fontSize: "0.86rem" }}>{action.name}</div>
          <div className="ahd-muted" style={{ fontSize: "0.76rem", lineHeight: 1.45 }}>{action.description}</div>
          {categoryLabel ? (
            <span className="ahd-badge" style={{ marginTop: "0.25rem" }}>{categoryLabel}</span>
          ) : null}
          <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.25rem" }}>
            Cost: {action.cost} AP
            {(action.fundCost ?? 0) > 0 ? ` · Funds: ${formatFunds(action.fundCost ?? 0, currency)}` : ""}
          </div>
          {action.fundsGain !== undefined ? <div className="ahd-help">Raises {action.fundsGain.toLocaleString()} campaign funds</div> : null}
          {cooldown > 0 ? (
            <div className="ahd-help">Cooldown: {cooldown} {cooldown === 1 ? "turn" : "turns"} left</div>
          ) : null}
          {action.prerequisite ? <div className="ahd-help">{action.prerequisite}</div> : null}
        </div>
        <span className="ahd-badge" style={{ flexShrink: 0, whiteSpace: "nowrap" }} aria-label={hint}>{action.available ? `${action.cost}` : "locked"}</span>
      </div>

      {action.requires === "amount" ? (
        <label className="ahd-field" style={{ maxWidth: "12rem" }}>
          <span className="ahd-label">Amount</span>
          <input className="ahd-input" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => { setAmount(e.target.value); if (amountError) setAmountError(null); }} disabled={busy} aria-label={`Amount for ${action.name}`} aria-invalid={!!amountError} aria-describedby={amountError ? `amount-error-${action.id}` : undefined} />
          {amountError ? <span id={`amount-error-${action.id}`} className="ahd-error-text" role="alert">{amountError}</span> : null}
        </label>
      ) : null}
      {action.requires === "party" ? (
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Party</span>
          <select className="ahd-select" value={partyId} onChange={(e) => setPartyId(e.target.value)} disabled={busy || parties.length === 0} aria-label={`Party for ${action.name}`}>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.abbreviation})</option>)}
            {parties.length === 0 ? <option value="">No parties</option> : null}
          </select>
        </label>
      ) : null}
      {action.requires === "region" ? (
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Region</span>
          <select className="ahd-select" value={regionId} onChange={(e) => setRegionId(e.target.value)} disabled={busy || regions.length === 0} aria-label={`Region for ${action.name}`}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            {regions.length === 0 ? <option value="">No regions</option> : null}
          </select>
        </label>
      ) : null}

      <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" onClick={handle} disabled={disabled} aria-disabled={disabled} aria-label={`${action.available ? "Take action" : "Unavailable"}: ${action.name}`}>
          {busy ? <span className="ahd-spinner" aria-hidden /> : null}
          {action.available ? `Take action: ${action.name}` : "Unavailable"}
        </button>
        {action.available && <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{hint}{action.requires ? ` · requires ${action.requires}` : ""}</span>}
      </div>
      {!action.available && action.disabledReason ? <p className="ahd-help" role="note">{action.disabledReason}</p> : null}
    </article>
  );
}

export function ActionsHub({
  actions,
  busy,
  currency,
  regions,
  parties,
  category,
  onCategoryChange,
  onAction,
  outcomes = [],
}: {
  actions: ActionView[];
  busy: boolean;
  currency: string;
  regions: { id: string; name: string }[];
  parties: { id: string; name: string; abbreviation: string }[];
  category: ActionsCategoryFilter;
  onCategoryChange: (next: ActionsCategoryFilter) => void;
  onAction: GameScreenProps["onAction"];
  outcomes?: ActionHistoryEntry[];
}) {
  const visible = category === "all" ? actions : actions.filter((a) => a.category === category);
  const countFor = (id: ActionsCategoryFilter) => {
    const inScope = id === "all" ? actions : actions.filter((a) => a.category === id);
    return { eligible: inScope.filter((a) => a.available).length, total: inScope.length };
  };

  return (
    <div className="ahd-stack">
      {outcomes.length ? (
        <section className="ahd-card ahd-card-pad" role="region" aria-label="Recent action results">
          <h3 className="ahd-h2">Recent results</h3>
          <div className="ahd-stack" style={{ marginTop: "0.55rem" }}>
            {outcomes.slice(0, 5).map(outcome => (
              <article key={outcome.id} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.5rem" }}>
                <strong>{outcome.title}</strong>
                {outcome.target ? <div className="ahd-help">Target: <span>{outcome.target.label}</span></div> : null}
                {outcome.changes.map(change => <div key={change.field} className="ahd-help">
                  {change.label}: {String(change.before)} to {String(change.after)}
                  {change.delta !== undefined ? ` (${change.delta > 0 ? "+" : ""}${Number(change.delta.toFixed(2))})` : ""}
                </div>)}
                {outcome.followUps.map(text => <div key={text} className="ahd-help">{text}</div>)}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <div role="tablist" aria-label="Filter actions by category" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        {ACTION_HUB_CATEGORIES.map((c) => {
          const { eligible, total } = countFor(c.id);
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${c.label}, ${eligible} of ${total} available`}
              className="ahd-btn ahd-btn-sm"
              data-active={active ? "true" : undefined}
              onClick={() => onCategoryChange(c.id)}
            >
              {c.label} <span className="ahd-badge" aria-hidden="true">{eligible}/{total}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="ahd-empty">No actions available.</div>
      ) : (
        <div className="ahd-stack">
          {visible.map((a) => (
            <ActionCard key={a.id} action={a} busy={busy} currency={currency} regions={regions} parties={parties} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}
