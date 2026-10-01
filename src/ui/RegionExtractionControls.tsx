import { useMemo, useState } from "react";
import type { RegionDetailView } from "../game/regions";
import type { GameScreenProps } from "../game/types";

export function RegionExtractionControls({ region, busy, onAction }: {
  region: RegionDetailView;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
}) {
  const extraction = region.extraction;
  const resources = extraction?.resources ?? [];
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [share, setShare] = useState("10");
  const [royalty, setRoyalty] = useState("1");
  const [term, setTerm] = useState("24");
  const [fee, setFee] = useState("100");
  const selected = useMemo(() => resources.find((resource) => resource.id === resourceId) ?? resources[0], [resources, resourceId]);
  if (!extraction) return null;
  const canOffer = extraction.issuerLevel !== null && extraction.hasExtractionOperator && !!selected;
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return <section className="ahd-card ahd-card-pad" aria-label={`${region.name} extraction contracts`}>
    <div className="ahd-row" style={{ alignItems: "start", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
      <div><h3 className="ahd-h3">Regional extraction</h3><p className="ahd-muted">Recorded deposits and government contracts for {region.name}.</p></div>
      <span className="ahd-badge">Authority: {extraction.authority === "both" ? "National and state" : extraction.authority}</span>
    </div>
    <dl className="ahd-kv-list">
      {selected ? <div className="ahd-kv"><dt>Selected resource capacity</dt><dd className="ahd-mono">{selected.capacity.toLocaleString()} {selected.id}/turn</dd></div> : null}
      <div className="ahd-kv"><dt>Regional extraction royalties</dt><dd className="ahd-mono">{extraction.resourceRoyalties.toLocaleString()}</dd></div>
    </dl>
    {resources.length === 0 ? <p className="ahd-empty" role="note">No source capacity is recorded in this region, so prospecting and contracts are unavailable.</p> : <>
      <label className="ahd-field"><span className="ahd-label">Resource</span><select className="ahd-select" value={selected?.id ?? ""} onChange={(event) => setResourceId(event.target.value)} disabled={busy} aria-label={`Extraction resource for ${region.name}`}>
        {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.id.replaceAll("_", " ")}</option>)}
      </select></label>
      {extraction.canProspectNational ? <button className="ahd-btn ahd-btn-sm" type="button" disabled={busy || !selected} onClick={() => onAction("launchProspect", { regionId: region.id, resource: selected!.id, issuerLevel: "national" })}>Commission national survey</button> : null}
      {extraction.canProspectState ? <button className="ahd-btn ahd-btn-sm" type="button" disabled={busy || !selected} onClick={() => onAction("launchProspect", { regionId: region.id, resource: selected!.id, issuerLevel: "state" })}>Commission regional survey</button> : null}
      {!extraction.hasExtractionOperator ? <div className="ahd-stack" style={{ marginTop: ".6rem" }}>
        <p className="ahd-help" role="note">No extraction corporation is recorded as operating in this region. Contracts require a regional corporate sector.</p>
        {extraction.canExpandExtractionOperations ? <button className="ahd-btn ahd-btn-sm" type="button" disabled={busy} onClick={() => onAction("expandRegionalExtraction", { regionId: region.id })}>Expand extraction operations</button> : null}
        {!extraction.canExpandExtractionOperations && resources.length > 0 ? <span className="ahd-muted">The active CEO of the regional extraction corporation must open this operation.</span> : null}
      </div> : null}
      {canOffer ? <div className="ahd-stack" style={{ marginTop: ".7rem" }}>
        <strong>Offer to {region.countryId} extraction corporation</strong>
        <div className="ahd-row" style={{ gap: ".5rem", flexWrap: "wrap" }}>
          <label className="ahd-field"><span className="ahd-label">Capacity share (%)</span><input className="ahd-input" type="number" min="1" max="75" step="1" value={share} onChange={e => setShare(e.target.value)} disabled={busy} /></label>
          <label className="ahd-field"><span className="ahd-label">Royalty per turn (%)</span><input className="ahd-input" type="number" min="0" max="2" step="0.1" value={royalty} onChange={e => setRoyalty(e.target.value)} disabled={busy} /></label>
          <label className="ahd-field"><span className="ahd-label">Term (turns)</span><input className="ahd-input" type="number" min="24" max="480" step="1" value={term} onChange={e => setTerm(e.target.value)} disabled={busy} /></label>
          <label className="ahd-field"><span className="ahd-label">Signing fee (anchor)</span><input className="ahd-input" type="number" min="0" value={fee} onChange={e => setFee(e.target.value)} disabled={busy} /></label>
        </div>
        <button className="ahd-btn ahd-btn-primary ahd-btn-sm" type="button" disabled={busy || !selected} onClick={() => onAction("issueExtractionContract", { regionId: region.id, resource: selected!.id, share: Number(share) / 100, royaltyRatePerTurn: Number(royalty) / 100, termTurns: Number(term), signingFeeAnchor: Number(fee) })}>Offer extraction contract</button>
      </div> : null}
      {extraction.issuerLevel === null && !extraction.canProspectNational && !extraction.canProspectState ? <p className="ahd-help" role="note">You do not currently hold an extraction-issuing national or regional office permitted by this authority.</p> : null}
    </>}
    {extraction.surveys.length ? <div className="ahd-stack" style={{ marginTop: ".75rem" }}><strong>Surveys</strong>{extraction.surveys.map(survey => <div className="ahd-help" key={survey.id}>{survey.resource}: {survey.status}; completes turn {survey.completesTurn}{survey.capacityGained === null ? "" : `; +${survey.capacityGained.toLocaleString()} capacity`}</div>)}</div> : null}
    {extraction.contracts.length ? <div className="ahd-stack" style={{ marginTop: ".75rem" }}><strong>Contracts</strong>{extraction.contracts.map(contract => <article className="ahd-card" style={{ padding: ".6rem" }} key={contract.id}>
      <div><strong>{contract.resource}</strong> · {percent(contract.share)} capacity · {percent(contract.royaltyRatePerTurn)} royalty · {contract.status}</div>
      <div className="ahd-muted">{contract.status === "offered" ? `Offer expires turn ${contract.offerExpiresTurn ?? "not recorded"}` : `Term ends turn ${contract.expiresTurn ?? "not recorded"}`}; signing fee {contract.signingFeeAnchor.toLocaleString()} anchor</div>
      <div className="ahd-row" style={{ gap: ".4rem", marginTop: ".45rem", flexWrap: "wrap" }}>
        {contract.canAccept ? <button className="ahd-btn ahd-btn-sm" type="button" disabled={busy} onClick={() => onAction("acceptExtractionContract", { contractId: contract.id })}>Accept</button> : null}
        {contract.canDecline ? <button className="ahd-btn ahd-btn-sm" type="button" disabled={busy} onClick={() => onAction("declineExtractionContract", { contractId: contract.id })}>Decline</button> : null}
        {contract.canRevoke ? <button className="ahd-btn ahd-btn-sm" type="button" disabled={busy} onClick={() => onAction("revokeExtractionContract", { contractId: contract.id })}>Revoke</button> : null}
      </div>
    </article>)}</div> : null}
  </section>;
}
