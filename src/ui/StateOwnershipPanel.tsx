import type { StateOwnershipView } from "../game/stateOwnership";
import { formatFinanceMoney } from "./FinancePanel";

/** Source country-wide Register entry, reached from the national budget. */
export function StateOwnershipPanel({ ownership, onOpenCompany }: {
  ownership: StateOwnershipView;
  onOpenCompany: (id: string) => void;
}) {
  const money = (amount: number) => formatFinanceMoney(amount, ownership.currency);
  return <div className="ahd-stack">
    <header>
      <h2 className="ahd-h2">State ownership register</h2>
      <p className="ahd-muted">{ownership.countryName}</p>
    </header>
    <dl className="ahd-grid ahd-grid-2" aria-label="State ownership totals">
      {[
        ["Firms absorbed", String(ownership.totals.firmsAbsorbed)],
        ["Compensation paid", money(ownership.totals.compensationLocal)],
        ["Debt assumed", money(ownership.totals.debtLocal)],
        ["Shareholders settled", ownership.totals.shareholdersSettled.toLocaleString()],
      ].map(([label, value]) => <div key={label} className="ahd-card ahd-card-pad">
        <dt className="ahd-muted">{label}</dt><dd style={{ margin: "0.3rem 0 0", fontWeight: 700 }}>{value}</dd>
      </div>)}
    </dl>
    <section aria-label="State ownership actions" className="ahd-stack">
      {ownership.rows.length === 0 ? <p className="ahd-muted">
        {ownership.historyRecorded ? "No state-ownership actions." : "No state-ownership action history has been recorded for this country."}
      </p> : ownership.rows.map(row => <article key={row.id} className="ahd-card ahd-card-pad">
        <h3 style={{ margin: 0 }}>{row.firm}</h3>
        <p className="ahd-muted">Turn {row.turn} · {row.sectorTypes.join(", ")}</p>
        <dl className="ahd-kv-grid">
          <div><dt>Trigger</dt><dd>{row.triggerLabel}</dd></div>
          <div><dt>Method</dt><dd>{row.pathLabel}</dd></div>
          <div><dt>Compensation tier</dt><dd>{row.tierLabel}</dd></div>
          <div><dt>Compensation</dt><dd>{row.compensationLocal === null ? "None" : money(row.compensationLocal)}</dd></div>
          <div><dt>Debt assumed</dt><dd>{money(row.debtLocal)}</dd></div>
          <div><dt>Shareholders settled</dt><dd>{row.shareholdersSettled.toLocaleString()}</dd></div>
        </dl>
      </article>)}
    </section>
    <section aria-label="State holdings" className="ahd-card ahd-card-pad">
      <h3 style={{ marginTop: 0 }}>State holdings</h3>
      {ownership.holdings.length === 0 ? <p className="ahd-muted">No recorded state holdings.</p> : <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.65rem" }}>
        {ownership.holdings.map(holding => <li key={holding.corporationId}>
          <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={() => onOpenCompany(holding.corporationId)}>{holding.name}</button>
          <p className="ahd-muted" style={{ margin: "0.3rem 0 0" }}>
            {holding.assets.length} asset{holding.assets.length === 1 ? "" : "s"} · {holding.assets.reduce((total, asset) => total + asset.workers, 0).toLocaleString()} workers
          </p>
        </li>)}
      </ul>}
    </section>
  </div>;
}
