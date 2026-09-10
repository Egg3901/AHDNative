import type { NationMoneyLine, NationPolicySetting, NationView } from "../game/nation";

export interface NationPanelProps {
  nation: NationView;
  section: "economy" | "budget" | "policy";
}

function number(value: number, maximumFractionDigits = 0): string {
  if (!Number.isFinite(value)) return "Not recorded";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function fractionPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "Not recorded";
  return `${(value * 100).toFixed(digits)}%`;
}

function pointsPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "Not recorded";
  return `${value.toFixed(digits)}%`;
}

function money(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "Not recorded";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${number(value)} ${currency}`;
  }
}

function millions(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "Not recorded";
  return `${number(value, 1)} million ${currency}`;
}

function Layout({ nation, title, children }: { nation: NationView; title: string; children: React.ReactNode }) {
  return (
    <div className="ahd-stack" aria-label={`${nation.countryName} ${title}`}>
      <div className="ahd-card ahd-card-pad">
        <div className="ahd-eyebrow">{nation.countryName}</div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>{title}</h1>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.32rem 0 0" }}>
          {nation.countryId} · {nation.currency}
        </p>
      </div>
      {children}
    </div>
  );
}

function KeyValue({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ahd-kv">
      <dt>{label}{note ? <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem", fontWeight: 400 }}>{note}</span> : null}</dt>
      <dd className="ahd-mono" style={{ margin: 0, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

function MoneyLine({ line, currency }: { line: NationMoneyLine; currency: string }) {
  return (
    <li className="ahd-kv" style={{ alignItems: "flex-start", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.5rem" }}>
      <div style={{ minWidth: 0 }}>
        <span>{line.label}</span>
        {line.taxRatePercent !== undefined || line.taxBase !== undefined ? (
          <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem" }}>
            {line.taxRatePercent !== undefined ? `${line.taxRatePercent.toFixed(1)}% rate` : null}
            {line.taxRatePercent !== undefined && line.taxBase !== undefined ? " · " : null}
            {line.taxBase !== undefined ? `base ${money(line.taxBase, currency)}` : null}
          </span>
        ) : null}
      </div>
      <span className="ahd-mono" style={{ fontWeight: 650, textAlign: "right" }}>{money(line.amount, currency)}</span>
    </li>
  );
}

function EconomySection({ nation }: { nation: NationView }) {
  const { economy } = nation;
  const macroHistory = economy.macroHistory.slice(-8);
  const primeRateHistory = economy.primeRateHistory.slice(-8);

  return (
    <Layout nation={nation} title="Economy">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Current metrics</h2>
        <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
          <KeyValue label="GDP" value={millions(economy.gdpMillions, "USD")} note="comparable across nations" />
          <KeyValue label="GDP growth" value={fractionPercent(economy.growthRate)} note="annual rate" />
          <KeyValue label="Inflation" value={fractionPercent(economy.inflationRate)} note="annual rate" />
          <KeyValue label="Unemployment" value={fractionPercent(economy.unemploymentRate)} />
          <KeyValue label="Output gap" value={pointsPercent(economy.outputGap)} note="percentage points" />
          <KeyValue label="Prime rate" value={economy.primeRate === null ? "Not recorded" : pointsPercent(economy.primeRate, 2)} note="central-bank policy rate" />
        </dl>
      </div>

      <div className="ahd-card ahd-card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">Macro history</h2>
          <span className="ahd-muted" style={{ fontSize: "0.68rem" }}>recorded turns</span>
        </div>
        {macroHistory.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No macro history recorded.</div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.55rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem", minWidth: "32rem" }}>
              <caption className="ahd-muted" style={{ textAlign: "left", paddingBottom: "0.4rem" }}>
                GDP in millions of USD; rates in percent.
              </caption>
              <thead>
                <tr style={{ color: "var(--ahd-muted)", textAlign: "right" }}>
                  <th scope="col" style={{ textAlign: "left", padding: "0.25rem" }}>Turn</th>
                  <th scope="col" style={{ padding: "0.25rem" }}>GDP</th>
                  <th scope="col" style={{ padding: "0.25rem" }}>Growth</th>
                  <th scope="col" style={{ padding: "0.25rem" }}>Inflation</th>
                  <th scope="col" style={{ padding: "0.25rem" }}>Unemployment</th>
                  <th scope="col" style={{ padding: "0.25rem" }}>Output gap</th>
                </tr>
              </thead>
              <tbody>
                {macroHistory.map((point) => (
                  <tr key={point.turn} style={{ borderTop: "1px solid var(--ahd-border)", textAlign: "right" }}>
                    <th scope="row" style={{ textAlign: "left", padding: "0.35rem 0.25rem", fontWeight: 500 }}>Turn {point.turn}</th>
                    <td className="ahd-mono" style={{ padding: "0.35rem 0.25rem" }}>{number(point.gdpMillions, 1)}</td>
                    <td className="ahd-mono" style={{ padding: "0.35rem 0.25rem" }}>{fractionPercent(point.growthRate)}</td>
                    <td className="ahd-mono" style={{ padding: "0.35rem 0.25rem" }}>{fractionPercent(point.inflationRate)}</td>
                    <td className="ahd-mono" style={{ padding: "0.35rem 0.25rem" }}>{fractionPercent(point.unemploymentRate)}</td>
                    <td className="ahd-mono" style={{ padding: "0.35rem 0.25rem" }}>{pointsPercent(point.outputGap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ahd-card ahd-card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">Prime-rate history</h2>
          <span className="ahd-muted" style={{ fontSize: "0.68rem" }}>recorded turns</span>
        </div>
        {primeRateHistory.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No prime-rate history recorded.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {primeRateHistory.map((point) => (
              <li key={point.turn} className="ahd-kv">
                <span>Turn {point.turn}</span>
                <span className="ahd-mono">{pointsPercent(point.primeRate, 2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}

function BudgetSection({ nation }: { nation: NationView }) {
  const { budget } = nation;
  const budgetMoney = (value: number) => money(value, budget.currency);
  return (
    <Layout nation={nation} title="Budget">
      <div className="ahd-card ahd-card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">Fiscal position</h2>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Fiscal year {budget.fiscalYear}</span>
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.7rem", margin: "0.5rem 0 0" }}>
          Budget amounts are absolute {budget.currency} units.
        </p>
        <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
          <KeyValue label="Budget GDP" value={budgetMoney(budget.gdpAbsolute)} note="absolute local currency" />
          <KeyValue label="Population" value={number(budget.population)} />
          <KeyValue label="Surplus / deficit" value={budgetMoney(budget.surplus)} />
          <KeyValue label="Treasury balance" value={budgetMoney(budget.treasuryBalance)} />
        </dl>
      </div>

      <div className="ahd-grid ahd-grid-2">
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Revenue</h2>
          {budget.revenue.components.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No revenue components recorded.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {budget.revenue.components.map((line) => <MoneyLine key={line.id} line={line} currency={budget.currency} />)}
            </ul>
          )}
          <div className="ahd-divider" style={{ margin: "0.7rem 0 0.55rem" }} />
          <KeyValue label="Total revenue" value={budgetMoney(budget.revenue.total)} />
        </div>

        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Spending</h2>
          {budget.spending.categories.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No spending categories recorded.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {budget.spending.categories.map((line) => <MoneyLine key={line.id} line={line} currency={budget.currency} />)}
            </ul>
          )}
          <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
            <KeyValue label="State grants" value={budgetMoney(budget.spending.stateGrants)} />
            <KeyValue label="Debt interest" value={budgetMoney(budget.spending.debtInterest)} />
            <KeyValue label="Total spending" value={budgetMoney(budget.spending.total)} />
          </dl>
        </div>
      </div>

      <div className="ahd-card ahd-card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">Debt and credit</h2>
          <span className="ahd-badge">{budget.debt.creditRating}</span>
        </div>
        <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
          <KeyValue label="Debt principal" value={budgetMoney(budget.debt.principal)} />
          <KeyValue label="Debt-to-GDP" value={budget.debt.debtToGdpRatio === null ? "Not recorded" : fractionPercent(budget.debt.debtToGdpRatio)} note="share of annual GDP" />
          <KeyValue label="Interest rate" value={fractionPercent(budget.debt.interestRate, 2)} />
          <KeyValue label="Debt ceiling" value={budgetMoney(budget.debt.ceiling)} />
        </dl>
      </div>
    </Layout>
  );
}

function PolicyCard({ policy }: { policy: NationPolicySetting }) {
  return (
    <article className="ahd-card ahd-card-pad" aria-label={policy.title}>
      <div style={{ display: "flex", gap: "0.55rem", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "0.86rem" }}>{policy.title}</h3>
          <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.25rem" }}>
            {policy.category ?? "Category not recorded"} · {policy.scope}
          </div>
        </div>
        <span className="ahd-badge">Current</span>
      </div>
      <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
        <KeyValue label="Option" value={policy.optionName ?? (policy.level === null ? "Not recorded" : `Level ${policy.level}`)} />
        {policy.optionDescription ? <div className="ahd-muted" style={{ fontSize: "0.74rem", lineHeight: 1.4 }}>{policy.optionDescription}</div> : null}
        <KeyValue label="Enacted turn" value={number(policy.enactedTurn)} />
        {policy.enactedAt ? <KeyValue label="Enacted at" value={policy.enactedAt} /> : null}
      </dl>
    </article>
  );
}

function PolicySection({ nation }: { nation: NationView }) {
  const { policy } = nation;
  return (
    <Layout nation={nation} title="Policy">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Current tax settings</h2>
        {policy.taxRates.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No current tax settings recorded.</div>
        ) : (
          <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
            {policy.taxRates.map((tax) => <KeyValue key={tax.id} label={tax.label} value={`${tax.ratePercent.toFixed(1)}%`} note="current rate" />)}
          </dl>
        )}
      </div>

      <div className="ahd-stack">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">Enacted national policies</h2>
          <span className="ahd-muted" style={{ fontSize: "0.68rem" }}>read-only</span>
        </div>
        {policy.enacted.length === 0 ? (
          <div className="ahd-empty">No enacted national policies recorded.</div>
        ) : (
          policy.enacted.map((entry) => <PolicyCard key={entry.id} policy={entry} />)
        )}
      </div>
    </Layout>
  );
}

export function NationPanel({ nation, section }: NationPanelProps) {
  if (section === "economy") return <EconomySection nation={nation} />;
  if (section === "budget") return <BudgetSection nation={nation} />;
  return <PolicySection nation={nation} />;
}
