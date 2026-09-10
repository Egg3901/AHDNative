import type { GameView } from "../game/types";
import type { DrawerRouteId } from "./MobileNavigation";
import "./overview.css";

export interface OverviewPanelProps {
  world: Pick<GameView, "turn" | "date" | "era" | "countryName" | "player" | "metrics"> & {
    finance: Pick<GameView["finance"], "currency">;
    legislature: Pick<GameView["legislature"], "office">;
  };
  onNavigate: (route: DrawerRouteId) => void;
}

function formatMoney(amount: number, currency: string, maximumFractionDigits = 2): string {
  if (!Number.isFinite(amount)) return "Not recorded";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits }).format(amount);
  } catch {
    const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(amount);
    return `${plain} ${currency}`;
  }
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "Not recorded";
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatMetric(value: number, format: GameView["metrics"][number]["format"]): string {
  if (!Number.isFinite(value)) return "Not recorded";
  if (format === "money") {
    // Country.economy.gdp is in millions of in-game dollars, unlike player balances.
    return formatMoney(value, "USD", 0);
  }
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return new Intl.NumberFormat(undefined).format(value);
}

function compactDollars(value: number): string {
  if (!Number.isFinite(value)) return "Not recorded";
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1,
  }).format(value);
}

const SHORTCUTS: { id: DrawerRouteId; label: string }[] = [
  { id: "actions", label: "Take an action" },
  { id: "elections", label: "View elections" },
  { id: "economy", label: "View economy" },
  { id: "regions", label: "Browse regions" },
];

export function OverviewPanel({ world, onNavigate }: OverviewPanelProps) {
  const party = world.player.partyName || "Independent";
  const office = world.legislature.office ?? "No legislative seat";
  const currency = world.finance.currency;
  const resources = [
    { label: "Cash", value: formatMoney(world.player.cash, currency), exact: String(world.player.cash) },
    { label: "Campaign funds", value: formatMoney(world.player.funds, currency), exact: String(world.player.funds) },
    { label: "Influence", value: formatCount(world.player.influence), exact: String(world.player.influence) },
    { label: "Favorability", value: formatCount(world.player.favorability), exact: String(world.player.favorability) },
  ];
  return (
    <div className="ov-stack">
      <section className="ahd-card ahd-card-pad" aria-label="Player overview">
        <div className="ahd-eyebrow">{world.countryName} · {world.era}</div>
        <h2 className="ov-name">{world.player.name}</h2>
        <p className="ahd-muted ov-sub"><span>{party}</span> · <span>{office}</span></p>
        <p className="ahd-muted ov-sub">Turn {world.turn} · {world.date}</p>
        <dl className="ov-resources">
          {resources.map((row) => (
            <div className="ov-resource" key={row.label}>
              <dt>{row.label}</dt>
              <dd className="ahd-mono" title={row.exact}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ahd-card ahd-card-pad" aria-label="Nation metrics">
        <h2 className="ahd-h2">Nation</h2>
        {world.metrics.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No metrics for this world.</div>
        ) : (
          <ul className="ov-metrics">
            {world.metrics.map((metric) => (
              <li className="ov-metric" key={metric.id}>
                <div className="ov-metric-label">{metric.label}</div>
                <div className="ahd-mono ov-metric-value" aria-hidden={metric.format === "money" ? true : undefined}>
                  {metric.format === "money" ? compactDollars(metric.value) : formatMetric(metric.value, metric.format)}
                </div>
                {metric.format === "money" && <div className="ahd-mono ahd-muted ov-metric-exact">
                  {formatMetric(metric.value, metric.format)}
                </div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="ov-shortcuts" aria-label="Continue to">
        {SHORTCUTS.map((shortcut) => (
          <button
            key={shortcut.id}
            type="button"
            className="ahd-btn ov-shortcut"
            onClick={() => onNavigate(shortcut.id)}
          >
            {shortcut.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
