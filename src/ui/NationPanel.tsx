import type {
  NationDestination,
  NationLinkView,
  NationMetricView,
  NationMoneyLine,
  NationPolicySetting,
  NationView,
} from "../game/nation";
import { formatGameDate, type GameClock } from "../game/gameDate";
import { RouteHero, nationOverviewHero } from "./RouteHero";

export interface NationPanelProps {
  nation: NationView;
  section: "economy" | "budget" | "policy" | "metrics";
  /** World clock used to render enacted-policy dates on the reference calendar (#226). */
  clock: GameClock;
  /** Opens a linked consequence destination. Omitted in read-only renders. */
  onNavigate?: (route: NationDestination, detailId?: string) => void;
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
      <RouteHero
        image={nationOverviewHero(nation.countryId)}
        alt={`${nation.countryName} national overview`}
        eyebrow={nation.countryName}
        title={title}
      >
        <p style={{ fontSize: "0.76rem", margin: "0.32rem 0 0", opacity: 0.85 }}>
          {nation.countryId} · {nation.currency}
        </p>
      </RouteHero>
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

/** Deep links out of a nation surface to the destination that realizes it. */
function Links({
  links,
  onNavigate,
  ariaLabel,
}: {
  links: NationLinkView[];
  onNavigate?: NationPanelProps["onNavigate"];
  ariaLabel: string;
}) {
  if (links.length === 0) return null;
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.7rem" }}>
      {links.map((link) => (
        <button
          key={`${link.route}:${link.label}`}
          type="button"
          className="ahd-btn ahd-btn-ghost ahd-btn-sm"
          onClick={() => onNavigate?.(link.route)}
        >
          {link.label}
        </button>
      ))}
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

function metricValue(metric: NationMetricView): string {
  return metric.format === "percent" ? pointsPercent(metric.value, 2) : number(metric.value, 1);
}

const METRIC_HISTORY_SHOWN = 12;

function MetricCard({ metric, onNavigate }: { metric: NationMetricView; onNavigate?: NationPanelProps["onNavigate"] }) {
  const history = metric.history.slice(-METRIC_HISTORY_SHOWN);
  // Recorded-trend treatment (reference MetricCard): the signed change against
  // the previous recorded point and a sparkline of the recorded history. Both
  // come only from points the save actually holds — nothing is interpolated and
  // no national-average comparison is drawn where the engine records none.
  const latest = history[history.length - 1];
  const prior = history[history.length - 2];
  const trend = latest && prior ? latest.value - prior.value : null;
  const trendText = trend === null
    ? null
    : `${trend > 0 ? "+" : ""}${metric.format === "percent" ? trend.toFixed(2) : trend.toFixed(1)}`
      + (metric.format === "percent" ? "pt" : "");
  const sparkValues = history.map((point) => point.value);
  const sparkMin = sparkValues.length ? Math.min(...sparkValues) : 0;
  const sparkMax = sparkValues.length ? Math.max(...sparkValues) : 0;
  const sparkSpan = sparkMax - sparkMin || 1;
  return (
    <article className="ahd-card ahd-card-pad" aria-label={metric.label}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: "0.86rem" }}>{metric.label}</h3>
        <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "baseline" }}>
          <span className="ahd-mono" style={{ fontWeight: 650 }}>{metricValue(metric)}</span>
          {trend !== null && trendText !== null ? (
            <span
              className={`ahd-trend ${trend > 0 ? "ahd-trend-up" : trend < 0 ? "ahd-trend-down" : "ahd-trend-flat"}`}
              aria-label={`Change since turn ${prior!.turn}: ${trendText}`}
            >
              {`${trend > 0 ? "▲" : trend < 0 ? "▼" : "–"} ${trendText}`}
            </span>
          ) : null}
        </span>
      </div>
      <div className="ahd-muted" style={{ fontSize: "0.68rem", marginTop: "0.2rem" }}>{metric.id} · {metric.category}</div>
      {history.length >= 2 ? (
        <div className="ahd-spark" aria-hidden="true">
          {history.map((point) => (
            <span
              key={point.turn}
              className="ahd-spark-bar"
              style={{ height: `${15 + 85 * ((point.value - sparkMin) / sparkSpan)}%` }}
            />
          ))}
        </div>
      ) : null}
      <details style={{ marginTop: "0.5rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.74rem" }}>Details</summary>
        <dl className="ahd-stack" style={{ marginTop: "0.45rem", gap: "0.35rem" }}>
          <KeyValue label="Registry key" value={metric.id} />
          <KeyValue label="Format" value={metric.format === "percent" ? "percent" : "index (0–100)"} />
        </dl>
        <div style={{ marginTop: "0.55rem" }}>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
            Recorded history{metric.history.length > history.length ? ` (last ${history.length} of ${metric.history.length})` : ""}
          </span>
          {history.length === 0 ? (
            <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.25rem" }}>No history recorded.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {history.map((point) => (
                <li key={point.turn} className="ahd-kv">
                  <span>Turn {point.turn}</span>
                  <span className="ahd-mono">{metric.format === "percent" ? pointsPercent(point.value, 2) : number(point.value, 1)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ marginTop: "0.55rem" }}>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Recorded modifiers</span>
          {metric.modifiers.length === 0 ? (
            <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.25rem" }}>No modifiers recorded.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {metric.modifiers.map((modifier) => (
                <li key={modifier.id} className="ahd-kv">
                  <span>{modifier.label}<span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem" }}>{modifier.source} · {modifier.effectType}</span></span>
                  <span className="ahd-mono">{modifier.effect > 0 ? `+${modifier.effect}` : modifier.effect}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Links links={metric.links} onNavigate={onNavigate} ariaLabel={`${metric.label} destinations`} />
      </details>
    </article>
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
        <dl className="ahd-kv-grid" style={{ marginTop: "0.65rem" }}>
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

function BudgetSection({ nation, onNavigate }: { nation: NationView; onNavigate?: NationPanelProps["onNavigate"] }) {
  const { budget } = nation;
  const { labels } = budget;
  const budgetMoney = (value: number) => money(value, budget.currency);
  return (
    <Layout nation={nation} title="Budget">
      <div className="ahd-card ahd-card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">{labels.title}</h2>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Fiscal year {budget.fiscalYear}</span>
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.7rem", margin: "0.5rem 0 0" }}>
          Budget amounts are absolute {budget.currency} units.
        </p>
        <dl className="ahd-kv-grid" style={{ marginTop: "0.65rem" }}>
          <KeyValue label="Budget GDP" value={budgetMoney(budget.gdpAbsolute)} note="absolute local currency" />
          <KeyValue label="Population" value={number(budget.population)} />
          <KeyValue label="Surplus / deficit" value={budgetMoney(budget.surplus)} />
          <KeyValue label="Treasury balance" value={budgetMoney(budget.treasuryBalance)} />
        </dl>
        <Links links={budget.links} onNavigate={onNavigate} ariaLabel="Budget destinations" />
      </div>

      <div className="ahd-grid ahd-grid-2">
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">{labels.revenueTitle}</h2>
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
          <h2 className="ahd-h2">{labels.spendingTitle}</h2>
          {budget.spending.categories.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No spending categories recorded.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {budget.spending.categories.map((line) => <MoneyLine key={line.id} line={line} currency={budget.currency} />)}
            </ul>
          )}
          <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
            <KeyValue label={labels.transferLabel} value={budgetMoney(budget.spending.stateGrants)} note="intergovernmental transfers" />
            <KeyValue label={labels.debtServiceLabel} value={budgetMoney(budget.spending.debtInterest)} note="debt interest" />
            <KeyValue label="Total spending" value={budgetMoney(budget.spending.total)} />
          </dl>
          {budget.spending.transfers.length > 0 ? (
            <div style={{ marginTop: "0.6rem" }}>
              <span className="ahd-muted" style={{ fontSize: "0.7rem" }}>Recorded transfer recipients</span>
              <ul style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {budget.spending.transfers.map((transfer) => (
                  <li key={transfer.id} className="ahd-kv">
                    <span>{transfer.name}</span>
                    <span className="ahd-mono">{budgetMoney(transfer.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ahd-card ahd-card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">{labels.debtTitle}</h2>
          <span className="ahd-badge">{budget.debt.creditRating}</span>
        </div>
        <dl className="ahd-kv-grid" style={{ marginTop: "0.65rem" }}>
          <KeyValue label="Debt principal" value={budgetMoney(budget.debt.principal)} />
          <KeyValue label="Debt-to-GDP" value={budget.debt.debtToGdpRatio === null ? "Not recorded" : fractionPercent(budget.debt.debtToGdpRatio)} note="share of annual GDP" />
          <KeyValue label="Interest rate" value={fractionPercent(budget.debt.interestRate, 2)} />
          <KeyValue label={labels.ceilingLabel} value={budgetMoney(budget.debt.ceiling)} />
        </dl>
      </div>
    </Layout>
  );
}

/** Exported so the political-metrics view (#69) renders the same registry Native already projects. */
export function MetricsSection({ nation, onNavigate }: { nation: NationView; onNavigate?: NationPanelProps["onNavigate"] }) {
  const { metrics } = nation;
  return (
    <Layout nation={nation} title="Metrics">
      <div className="ahd-card ahd-card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
          <h2 className="ahd-h2">National metrics registry</h2>
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{metrics.total} recorded</span>
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.7rem", margin: "0.5rem 0 0" }}>
          Every metric row the save records, with its recorded history and modifiers. Empty families are not shown.
        </p>
      </div>
      {metrics.categories.length === 0 ? (
        <div className="ahd-empty">No national metrics recorded.</div>
      ) : (
        metrics.categories.map((category) => (
          <div className="ahd-stack" key={category.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
              <h2 className="ahd-h2">{category.label}</h2>
              <span className="ahd-muted" style={{ fontSize: "0.68rem" }}>{category.metrics.length} metric{category.metrics.length === 1 ? "" : "s"}</span>
            </div>
            <div className="ahd-grid ahd-grid-3">
              {category.metrics.map((metric) => (
                <MetricCard key={metric.id} metric={metric} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))
      )}
    </Layout>
  );
}

function PolicyCard({ policy, clock }: { policy: NationPolicySetting; clock: GameClock }) {
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
        {policy.enactedAt ? <KeyValue label="Enacted at" value={formatGameDate(policy.enactedAt, clock) || "Not recorded"} /> : null}
      </dl>
    </article>
  );
}

function PolicySection({ nation, clock }: { nation: NationView; clock: GameClock }) {
  const { policy } = nation;
  return (
    <Layout nation={nation} title="Policy">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Current tax settings</h2>
        {policy.taxRates.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No current tax settings recorded.</div>
        ) : (
          <dl className="ahd-kv-grid" style={{ marginTop: "0.65rem" }}>
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
          <div className="ahd-grid ahd-grid-3">
            {policy.enacted.map((entry) => <PolicyCard key={entry.id} policy={entry} clock={clock} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}

export function NationPanel({ nation, section, clock, onNavigate }: NationPanelProps) {
  if (section === "economy") return <EconomySection nation={nation} />;
  if (section === "budget") return <BudgetSection nation={nation} onNavigate={onNavigate} />;
  if (section === "metrics") return <MetricsSection nation={nation} onNavigate={onNavigate} />;
  return <PolicySection nation={nation} clock={clock} />;
}
