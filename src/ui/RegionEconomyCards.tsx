/**
 * RegionEconomyCards: the sector and macro half of the regional economy view.
 *
 * Both home-region surfaces (RegionsPanel detail and WorldPanel state section)
 * render these, so the two can never disagree. Macro reads Country.economy —
 * the engine keeps those five indicators once per country and records no
 * per-region growth/inflation/unemployment series, so the card says so.
 * Sectors read WorldState.corporations: Native seeds one corporation per
 * (country, sectorType) with no region id (corporation/types.ts), so the board
 * is the country's sector output and is labelled as such. Absent records render
 * an honest empty state, never an invented zero.
 */
import type { RegionBudgetView, RegionMacroView, RegionSectorView } from "../game/regionProfile";

function KeyValue({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ahd-kv">
      <dt>
        {label}
        {note ? <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem", fontWeight: 400 }}>{note}</span> : null}
      </dt>
      <dd className="ahd-mono" style={{ margin: 0, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

function number(value: number | null, maximumFractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function fractionPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return `${(value * 100).toFixed(1)}%`;
}

function pointsPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return `${value.toFixed(1)}%`;
}

function millions(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return currency ? `${number(value, 1)} million ${currency}` : `${number(value, 1)} million`;
}

function money(value: number, currency: string | null): string {
  if (!Number.isFinite(value)) return "Not recorded";
  if (!currency) return number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${number(value)} ${currency}`;
  }
}

/** Regional budget (WorldState.regionalBudgets), shared by both home-region surfaces. */
export function RegionBudgetCard({ budget, currency }: { budget: RegionBudgetView | null; currency: string | null }) {
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Regional budget</h2>
      {budget === null ? (
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No regional budget recorded.</div>
      ) : (
        <>
          <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
            <KeyValue label="Revenue total" value={money(budget.revenue.total, currency)} />
            <KeyValue label="Spending total" value={money(budget.spendingTotal, currency)} />
            <KeyValue label="Balance" value={money(budget.balance, currency)} />
            <KeyValue label="Consecutive deficits" value={number(budget.consecutiveDeficits)} />
          </dl>
          <details style={{ marginTop: "0.7rem" }}>
            <summary style={{ cursor: "pointer", minHeight: 44, paddingBlock: "0.65rem", boxSizing: "border-box" }}>
              Revenue and spending detail ({number(budget.spending.length)} categories)
            </summary>
            <div style={{ marginTop: "0.55rem" }}>
              <dl className="ahd-stack" style={{ gap: "0.42rem" }}>
                <KeyValue label="Council tax" value={money(budget.revenue.councilTax, currency)} />
                <KeyValue label="Business rates" value={money(budget.revenue.businessRates, currency)} />
                <KeyValue label="Grant" value={money(budget.revenue.grant, currency)} />
                {budget.revenue.stateTax !== undefined ? (
                  <KeyValue label="State tax" value={money(budget.revenue.stateTax, currency)} />
                ) : null}
              </dl>
              {budget.spending.length > 0 ? (
                <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.6rem" }}>
                  <h3 style={{ margin: 0, fontSize: "0.78rem" }}>Spending by category</h3>
                  <ul style={{ listStyle: "none", margin: "0.45rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {budget.spending.map((line) => (
                      <li key={line.id} className="ahd-kv">
                        <span>{line.label}</span>
                        <span className="ahd-mono">{money(line.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="ahd-empty" style={{ marginTop: "0.7rem" }}>No spending categories recorded.</div>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/** Country.economy macro indicators, shared by both home-region surfaces. */
export function RegionMacroCard({ macro, currency }: { macro: RegionMacroView | null; currency: string | null }) {
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">National macro</h2>
      <p className="ahd-muted" style={{ margin: "0.3rem 0 0", fontSize: "0.72rem" }}>
        Recorded once per country; Native keeps no per-region growth, inflation or unemployment series.
      </p>
      {macro === null ? (
        <div className="ahd-empty" style={{ marginTop: "0.6rem" }}>No national economy record.</div>
      ) : (
        <dl className="ahd-stack" style={{ marginTop: "0.6rem", gap: "0.42rem" }}>
          <KeyValue label="GDP" value={millions(macro.gdpMillions, currency)} note="millions" />
          <KeyValue label="GDP growth" value={fractionPercent(macro.growthRate)} note="annualized" />
          <KeyValue label="Inflation" value={fractionPercent(macro.inflationRate)} note="annualized" />
          <KeyValue label="Unemployment" value={fractionPercent(macro.unemploymentRate)} note="annualized" />
          <KeyValue label="Output gap" value={pointsPercent(macro.outputGap)} note="percentage points" />
        </dl>
      )}
    </div>
  );
}

/** Country sector output from WorldState.corporations, shared by both home-region surfaces. */
export function RegionSectorsCard({ sectors, currency }: { sectors: RegionSectorView[]; currency: string | null }) {
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Sectors</h2>
      <p className="ahd-muted" style={{ margin: "0.3rem 0 0", fontSize: "0.72rem" }}>
        Country sector output from recorded corporations. Native stores one corporation per country sector, so no per-region sector record exists.
      </p>
      {sectors.length === 0 ? (
        <div className="ahd-empty" style={{ marginTop: "0.6rem" }}>No sector output recorded for this country.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {sectors.map((sector) => (
            <li key={sector.sectorType} className="ahd-kv" style={{ alignItems: "flex-start" }}>
              <span>
                {sector.label}
                <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem" }}>
                  {number(sector.companyCount)} corp{sector.companyCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="ahd-mono" style={{ textAlign: "right" }}>
                <span style={{ display: "block" }}>{millions(sector.revenue, currency)} revenue</span>
                <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem", fontWeight: 400 }}>
                  Margin {sector.marginPct === null ? "not recorded" : pointsPercent(sector.marginPct)} · Growth {sector.growthPct === null ? "not recorded" : pointsPercent(sector.growthPct)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
