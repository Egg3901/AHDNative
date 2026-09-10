/**
 * LegislationDetailsPanel: chamber-specific bill lists plus catalog proposal details.
 *
 * Detached companion to LegislaturePanel. Receives only the bounded
 * LegislationDetailsQuery DTO, busy, and onAction(id, params). Every control
 * either fires a real engine-supported action (sponsor with the supported
 * tax rate for tax entries; vote with billId/vote) or navigates details
 * already in the DTO. Legal options are reference only: no option control
 * is offered. Bill detail fetching is caller-driven through onSelectBill:
 * expanding a card reports its id, collapsing reports null, and the fetched
 * selectedBill detail renders only while its card stays expanded, so a stale
 * selection can never display the wrong bill. No App imports and no engine
 * catalog calls on this path.
 */
import { useEffect, useRef, useState } from "react";
import {
  type LegislationBillMeta,
  type LegislationDetailsQuery,
  type LegislationProposalDetails,
} from "../game/legislationDetails";

import { snapTaxRate } from "../game/taxRate";

type Vote = "for" | "against" | "abstain";

const VOTE_LABELS: { id: Vote; label: string }[] = [
  { id: "for", label: "For" },
  { id: "against", label: "Against" },
  { id: "abstain", label: "Abstain" },
];

const ECONOMY_LABELS: Record<string, string> = {
  gdp: "GDP",
  growthRate: "Growth rate",
  inflationRate: "Inflation rate",
  unemploymentRate: "Unemployment rate",
  outputGap: "Output gap",
};

const SUPPORT_LABELS: Record<string, string> = {
  registrationDelta: "Registration",
  organizationDelta: "Organization",
  pressureDelta: "Pressure",
  supportDelta: "Support",
};

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function humanScope(scope: string): string {
  if (scope === "both") return "National and local";
  return capitalize(scope);
}

function formatPercentFraction(value: number): string {
  const rounded = Number((value * 100).toFixed(2));
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function levelCostParts(level: {
  gdpCostFraction?: number;
  incomeCostFraction?: number;
  gdpRevenueFraction?: number;
}): string[] {
  const parts: string[] = [];
  if (level.gdpCostFraction !== undefined) parts.push(`GDP cost ${formatPercentFraction(level.gdpCostFraction)}`);
  if (level.incomeCostFraction !== undefined) {
    parts.push(`Income cost ${formatPercentFraction(level.incomeCostFraction)}`);
  }
  if (level.gdpRevenueFraction !== undefined) {
    parts.push(`GDP revenue ${formatPercentFraction(level.gdpRevenueFraction)}`);
  }
  return parts;
}

/**
 * Sponsor params built from the already supplied proposal DTO plus the pure
 * snapTaxRate helper. Never touches the engine catalog, so the UI bundle
 * stays off the large catalog source.
 */
export function sponsorParamsForProposal(
  proposal: LegislationProposalDetails,
  rate?: number,
): { catalogId: string; taxRate?: number } {
  if (proposal.taxPolicy) {
    return { catalogId: proposal.id, taxRate: snapTaxRate(proposal.taxPolicy, rate) };
  }
  return { catalogId: proposal.id };
}

export interface LegislationDetailsPanelProps {
  query: LegislationDetailsQuery;
  busy: boolean;
  onAction: (id: string, params?: Record<string, string | number>) => void;
  onSelectBill?: (id: string | null) => void;
}

function BillCard({
  bill,
  busy,
  expanded,
  onToggle,
  onAction,
}: {
  bill: LegislationBillMeta;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAction: LegislationDetailsPanelProps["onAction"];
}) {
  const voteDisabled = busy || !bill.votingAvailable;
  return (
    <article aria-label={bill.title} className="ahd-card ahd-card-pad">
      <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{bill.title}</div>
      <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>
        {bill.status} · Sponsored by {bill.sponsorName}
      </div>
      <div style={{ fontSize: "0.78rem", marginTop: "0.3rem" }}>
        {bill.votesFor} for · {bill.votesAgainst} against · {bill.votesAbstain} abstain
      </div>
      <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="ahd-btn ahd-btn-sm"
          onClick={onToggle}
          disabled={busy}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} details for ${bill.title}`}
        >
          {expanded ? "Hide details" : "Details"}
        </button>
      </div>
      {expanded ? (
        <dl style={{ fontSize: "0.78rem", margin: "0.5rem 0 0", display: "grid", gap: "0.2rem" }}>
          <div><dt style={{ display: "inline", fontWeight: 700 }}>Status: </dt><dd style={{ display: "inline", margin: 0 }}>{bill.status}</dd></div>
          <div><dt style={{ display: "inline", fontWeight: 700 }}>Chamber: </dt><dd style={{ display: "inline", margin: 0 }}>{bill.chamberName}</dd></div>
          <div><dt style={{ display: "inline", fontWeight: 700 }}>Sponsor: </dt><dd style={{ display: "inline", margin: 0 }}>{bill.sponsorName}</dd></div>
          <div><dt style={{ display: "inline", fontWeight: 700 }}>Your vote: </dt><dd style={{ display: "inline", margin: 0 }}>{bill.playerVote ?? (bill.votingOpen ? "Not yet voted" : "No recorded vote")}</dd></div>
          {!bill.votingAvailable && bill.voteDisabledReason ? (
            <div className="ahd-muted"><dt style={{ display: "inline", fontWeight: 700 }}>Voting: </dt><dd style={{ display: "inline", margin: 0 }}>{bill.voteDisabledReason}</dd></div>
          ) : null}
        </dl>
      ) : null}
      {bill.votingOpen ? (
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
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
        </div>
      ) : null}
    </article>
  );
}

export function LegislationDetailsPanel({ query, busy, onAction, onSelectBill }: LegislationDetailsPanelProps) {
  const [chamberKey, setChamberKey] = useState(query.selectedBill?.chamberKey ?? query.playerChamberKey ?? query.chambers[0]?.chamberKey ?? "");
  const [expandedBillId, setExpandedBillId] = useState<string | null>(query.selectedBill?.id ?? null);
  const [catalogId, setCatalogId] = useState(
    query.selectedProposal?.id ?? query.proposals[0]?.id ?? "",
  );
  const [taxRate, setTaxRate] = useState<string>("");

  const lastSelectedBillId = useRef<string | null>(query.selectedBill?.id ?? null);
  const lastExternalProposalId = useRef<string | null>(query.selectedProposal?.id ?? null);

  useEffect(() => {
    if (!query.chambers.some((c) => c.chamberKey === chamberKey)) {
      setChamberKey(query.chambers[0]?.chamberKey ?? "");
    }
  }, [query.chambers, chamberKey]);

  useEffect(() => {
    const incoming = query.selectedBill?.id ?? null;
    if (incoming !== lastSelectedBillId.current) {
      lastSelectedBillId.current = incoming;
      setExpandedBillId(incoming);
    }
  }, [query.selectedBill]);

  useEffect(() => {
    const externalId = query.selectedProposal?.id ?? null;
    if (externalId !== lastExternalProposalId.current) {
      lastExternalProposalId.current = externalId;
      if (externalId) {
        setCatalogId(externalId);
        return;
      }
    }
    setCatalogId((cur) => {
      if (query.proposals.some((p) => p.id === cur)) return cur;
      if (externalId && query.proposals.some((p) => p.id === externalId)) return externalId;
      return query.proposals[0]?.id ?? "";
    });
  }, [query.proposals, query.selectedProposal]);

  const handleToggle = (billId: string) => {
    const next = expandedBillId === billId ? null : billId;
    setExpandedBillId(next);
    onSelectBill?.(next);
  };

  const chamber = query.chambers.find((c) => c.chamberKey === chamberKey) ?? query.chambers[0] ?? null;
  const proposal = query.proposals.find((p) => p.id === catalogId) ?? query.selectedProposal ?? null;
  const sponsorDisabled = busy || !proposal || !proposal.sponsorAvailable;
  const selected = query.selectedBill && expandedBillId === query.selectedBill.id ? query.selectedBill : null;
  const baselineName =
    proposal && proposal.baselineLevel !== undefined
      ? (proposal.levels?.find((l) => l.index === proposal.baselineLevel)?.name ?? String(proposal.baselineLevel))
      : null;

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Legislature detail</h2>
        {query.office ? (
          <p style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>{query.office}</p>
        ) : (
          <p className="ahd-muted" style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>No legislative seat</p>
        )}
      </div>

      <div className="ahd-card ahd-card-pad">
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Bills by chamber</h3>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.5rem" }} role="group" aria-label="Chamber">
          {query.chambers.map((c) => (
            <button
              key={c.chamberKey}
              type="button"
              className="ahd-btn ahd-btn-sm"
              onClick={() => setChamberKey(c.chamberKey)}
              disabled={busy}
              aria-pressed={c.chamberKey === chamber?.chamberKey}
              aria-label={`Show ${c.chamberName} bills`}
            >
              {c.chamberName} ({c.active.length + c.completed.length})
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="ahd-card ahd-card-pad">
          <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Bill details: {selected.title}</h3>
          <p className="ahd-muted" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>{selected.summary}</p>
          <div style={{ fontSize: "0.78rem", display: "grid", gap: "0.2rem" }}>
            <div>Category: {capitalize(selected.category)}</div>
            {selected.selectedRate !== undefined ? <div>Selected rate: {selected.selectedRate}%</div> : null}
            <div>Proposed at turn {selected.proposedAtTurn}</div>
          </div>
          {selected.catalogLevels && selected.catalogLevels.length > 0 ? (
            <div style={{ marginTop: "0.5rem" }}>
              <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.3rem" }}>
                Legal options (reference only)
              </h4>
              <ul style={{ fontSize: "0.78rem", margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" }}>
                {selected.catalogLevels.map((level) => (
                  <li key={level.index}>
                    <strong>{level.name}</strong>: {level.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {chamber ? (
        <>
          <div className="ahd-card ahd-card-pad">
            <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>
              {chamber.chamberName}: active ({chamber.active.length})
            </h3>
          </div>
          {chamber.active.length === 0 ? (
            <div className="ahd-empty">No active bills in this chamber.</div>
          ) : (
            <div className="ahd-stack">
              {chamber.active.map((bill) => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  busy={busy}
                  expanded={expandedBillId === bill.id}
                  onToggle={() => handleToggle(bill.id)}
                  onAction={onAction}
                />
              ))}
            </div>
          )}
          <div className="ahd-card ahd-card-pad">
            <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>
              {chamber.chamberName}: completed ({chamber.completed.length})
            </h3>
          </div>
          {chamber.completed.length === 0 ? (
            <div className="ahd-empty">No completed bills in this chamber.</div>
          ) : (
            <div className="ahd-stack">
              {chamber.completed.map((bill) => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  busy={busy}
                  expanded={expandedBillId === bill.id}
                  onToggle={() => handleToggle(bill.id)}
                  onAction={onAction}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="ahd-empty">No chambers in this legislature.</div>
      )}



      <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Available legislation</h3>
        {query.proposals.length === 0 ? (
          <div className="ahd-empty">No proposals available.</div>
        ) : (
          <label className="ahd-field" style={{ maxWidth: "20rem" }}>
            <span className="ahd-label">Legislation</span>
            <select
              className="ahd-select"
              aria-label="Available legislation"
              value={proposal?.id ?? ""}
              onChange={(e) => setCatalogId(e.target.value)}
              disabled={busy}
            >
              {query.proposals.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
        )}
        {proposal ? (
          <>
            <p className="ahd-muted" style={{ fontSize: "0.78rem", lineHeight: 1.5, margin: 0 }}>{proposal.description}</p>
            <div style={{ fontSize: "0.78rem", display: "grid", gap: "0.2rem" }}>
              <div>Category: {capitalize(proposal.category)} · Scope: {humanScope(proposal.allowedScope)}</div>
              {baselineName !== null ? <div>Starting option: {baselineName}</div> : null}
              {proposal.effect?.economy ? (
                <div>
                  Expected economic effects:{" "}
                  {Object.entries(proposal.effect.economy)
                    .map(([key, value]) => `${ECONOMY_LABELS[key] ?? capitalize(key)} ${formatPercentFraction(value)}`)
                    .join("; ")}
                </div>
              ) : null}
              {proposal.effect?.partySupport ? (
                <div>
                  Expected political effects:{" "}
                  {Object.entries(proposal.effect.partySupport)
                    .map(([key, value]) => `${SUPPORT_LABELS[key] ?? capitalize(key)} ${formatSigned(value)}`)
                    .join("; ")}
                </div>
              ) : null}
            </div>
            {proposal.levels && proposal.levels.length > 0 ? (
              <div>
                <h4 style={{ fontSize: "0.78rem", fontWeight: 750, margin: "0 0 0.3rem" }}>
                  Legal options (reference only)
                </h4>
                <ul style={{ fontSize: "0.78rem", margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" }}>
                  {proposal.levels.map((level) => (
                    <li key={level.index}>
                      <strong>{level.name}</strong>: {level.description}
                      {levelCostParts(level).length > 0 ? ` (${levelCostParts(level).join(", ")})` : null}
                    </li>
                  ))}
                </ul>
                <p className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.3rem" }}>{query.levelChoiceNote}</p>
              </div>
            ) : null}
            {proposal.taxPolicy ? (
              <label className="ahd-field" style={{ maxWidth: "12rem" }}>
                <span className="ahd-label">
                  Tax rate ({proposal.taxPolicy.minRate}% to {proposal.taxPolicy.maxRate}%, step {proposal.taxPolicy.step}%)
                </span>
                <input
                  className="ahd-input"
                  aria-label="Tax rate"
                  type="number"
                  min={proposal.taxPolicy.minRate}
                  max={proposal.taxPolicy.maxRate}
                  step={proposal.taxPolicy.step}
                  placeholder={String(proposal.taxPolicy.baselineRate)}
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : null}
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="ahd-btn ahd-btn-primary ahd-btn-sm"
                onClick={() => {
                  if (sponsorDisabled || !proposal) return;
                  const rate = taxRate.trim() === "" ? undefined : Number(taxRate);
                  onAction(
                    "sponsorBill",
                    sponsorParamsForProposal(proposal, rate === undefined || Number.isNaN(rate) ? undefined : rate),
                  );
                }}
                disabled={sponsorDisabled}
                aria-disabled={sponsorDisabled}
                aria-label="Sponsor bill"
              >
                Sponsor bill
              </button>
              <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
                {!proposal.sponsorAvailable
                  ? (proposal.sponsorDisabledReason ?? "Unavailable")
                  : proposal.sponsorCost > 0
                    ? `Cost ${proposal.sponsorCost} actions`
                    : "Free"}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default LegislationDetailsPanel;
