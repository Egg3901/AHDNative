/**
 * FinancePanel: portfolio balances/holdings and savings deposit/withdraw.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/app/portfolio/PortfolioClient.tsx (rail sections: overview/cash/
 *   stocks with per-holding rows) and
 *   src/components/portfolio/HoldingsTables.tsx (per-holding currency, price,
 *   shares; no fabricated cross-currency aggregate) plus
 *   src/components/forex/SavingsWalletBlock.tsx (savings balance header with
 *   deposit/withdraw amount panels). No server or Next.js imports; props
 *   arrive through the FinanceView DTO. Section navigation is owned by root.
 *
 * Presentation redesign (#507, complementing mechanics #76 and navigation
 * #84): touch-first phone information hierarchy with progressive disclosure
 * and 44px controls, plus a deliberate two-column desktop grid. Surfaces are
 * solid .ahd-card (no backdrop-filter), so there is no Liquid Glass
 * transparency to fall back from; see the prefers-contrast rule in ui.css.
 * Multi-currency conversion, loans, and monetary-policy controls are #76
 * mechanics and stay explicit unavailable text here, never fake controls.
 */
import { useState } from "react";
import type { FinanceView, GameScreenProps } from "../game/types";
import { RouteHero, bankingHero, bankingHeroAlt } from "./RouteHero";
import { TrendChart } from "./TrendChart";

export type WalletLoadStatus = "ready" | "loading" | "error";

export interface FinancePanelProps {
  finance: FinanceView;
  section: "portfolio" | "banking";
  busy: boolean;
  onAction: GameScreenProps["onAction"];
  /** Cross-links the two real finance destinations (wallet/portfolio and banking). */
  onNavigate?: (route: "portfolio" | "banking") => void;
  /**
   * Opens a holding's company in the stock-market detail. The holding id is
   * the corporation id shared with market listings, so the reference
   * per-holding corporation link (HoldingsTables stock rows to
   * /corporation/[id]) resolves through the Native markets drill. Absent
   * means no link renders: unsupported navigation stays absent, not inert.
   */
  onOpenCompany?: (holdingId: string) => void;
  /** Native country id; selects the offline central-bank hero (unknown ids take the Actions fallback). */
  countryId?: string;
  /** Loading/error replace balances so stale values are never shown as current. Defaults to "ready". */
  status?: WalletLoadStatus;
  /** Error detail shown with the error state. */
  loadError?: string | null;
  /**
   * Session mode. The local SP engine projects finance; the MP surface never
   * touches it (MpModeScreen owns MP reads), so "mp" renders the explicit
   * unavailable state instead of balances. The note names the missing bridge
   * read, points at the MP Wallet section for live cash on hand, and keeps
   * the portfolio/banking cross-link when onNavigate is provided.
   * Defaults to "sp".
   */
  mode?: "sp" | "mp";
}

export function formatFinanceMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
    return `${plain} ${currency}`;
  }
}

function AvailabilityHint({ cost, available, disabledReason }: { cost: number; available: boolean; disabledReason?: string }) {
  if (!available) return <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>{disabledReason ?? "Unavailable"}</span>;
  if (cost > 0) return <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>Cost {cost} actions</span>;
  return null;
}

/** Cash/Savings balance row. Inline shrink/wrap styles keep 320px values inside the row (no layout in jsdom). */
function BalanceRow({ label, amount, currency }: { label: string; amount: number; currency: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", minWidth: 0, flexWrap: "wrap" }}>
      <dt style={{ fontSize: "0.82rem", flexShrink: 0 }}>{label}</dt>
      <dd className="ahd-mono" style={{ margin: 0, minWidth: 0, fontSize: "0.82rem", fontWeight: 700, textAlign: "right", overflowWrap: "anywhere" }}>
        {formatFinanceMoney(amount, currency)}
      </dd>
    </div>
  );
}

/** #76 interim safeguard: names the missing mechanics instead of faking them. */
function CapabilityNote() {
  return (
    <div className="ahd-card ahd-card-pad">
      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>More accounts</h3>
      <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.4rem 0 0" }}>
        Only one savings account is available offline. Currency conversion, loans, and
        monetary-policy controls are not available in this build.
      </p>
    </div>
  );
}

/** A non-finite price (missing market data, or NaN/null across the save
 * interchange) must read as unknown, never as a $0.00 value: shares * null
 * coerces to 0, which would misreport the holding as worthless. */
function holdingPriceKnown(price: number): boolean {
  return typeof price === "number" && Number.isFinite(price);
}

function HoldingSummaryValue({ name, ticker, shares, price, currency, layout = "row" }: { name: string; ticker: string; shares: number; price: number; currency: string; layout?: "row" | "stack" }) {
  const known = holdingPriceKnown(price);
  const value = known
    ? <span className="ahd-muted ahd-mono" style={{ fontSize: "0.78rem", flexShrink: 0, overflowWrap: "anywhere", ...(layout === "row" ? { marginLeft: "auto" } : null) }}>
      {formatFinanceMoney(shares * price, currency)}
    </span>
    : <span className="ahd-muted" style={{ fontSize: "0.78rem", flexShrink: 0, ...(layout === "row" ? { marginLeft: "auto" } : null) }}>
      Price unavailable
    </span>;
  if (layout === "stack") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.84rem", overflowWrap: "anywhere" }}>
          {name} <span className="ahd-muted">({ticker})</span>
        </div>
        {value}
      </div>
    );
  }
  return (
    <>
      <span style={{ fontWeight: 700, fontSize: "0.84rem", overflowWrap: "anywhere", minWidth: 0 }}>
        {name} <span className="ahd-muted">({ticker})</span>
      </span>
      {value}
    </>
  );
}

function HoldingDetail({ shares, price, currency }: { shares: number; price: number; currency: string }) {
  if (!holdingPriceKnown(price)) {
    return (
      <div className="ahd-muted ahd-mono" style={{ fontSize: "0.78rem", overflowWrap: "anywhere", marginTop: "0.25rem" }}>
        {shares} shares · market price unavailable in {currency}
      </div>
    );
  }
  return (
    <div className="ahd-muted ahd-mono" style={{ fontSize: "0.78rem", overflowWrap: "anywhere", marginTop: "0.25rem" }}>
      {shares} shares · {formatFinanceMoney(price, currency)} per share ·{" "}
      {formatFinanceMoney(shares * price, currency)} in {currency}
    </div>
  );
}

/** Per-holding link into the stock-market company detail. A native button
 * (keyboard-focusable, 44px touch floor) kept out of the summary row so the
 * disclosure toggle stays a single control. Renders nothing without a handler. */
function HoldingCompanyLink({ id, name, onOpenCompany }: { id: string; name: string; onOpenCompany?: (holdingId: string) => void }) {
  if (!onOpenCompany) return null;
  return (
    <button
      type="button"
      className="ahd-btn ahd-btn-sm"
      style={{ minHeight: 44, marginTop: "0.4rem" }}
      onClick={() => onOpenCompany(id)}
      aria-label={`View ${name} company`}
    >
      View company
    </button>
  );
}

function PortfolioSection({ finance, onNavigate, onOpenCompany }: { finance: FinanceView; onNavigate?: (route: "portfolio" | "banking") => void; onOpenCompany?: (holdingId: string) => void }) {
  const multiHolding = finance.holdings.length > 1;
  return (
    <div className="ahd-wallet-grid">
      <div className="ahd-stack" style={{ minWidth: 0 }}>
        <div className="ahd-card ahd-card-pad ahd-hero">
          <h2 className="ahd-h2">Portfolio</h2>
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.3rem 0 0" }}>
            Wallet balances and recorded stock holdings.
            {onNavigate ? (
              <>
                {" "}
                <button type="button" className="ahd-profile-link" onClick={() => onNavigate("banking")} aria-label="Go to banking">
                  Go to Banking
                </button>
              </>
            ) : null}
          </p>
          <dl style={{ display: "flex", flexDirection: "column", gap: "0.35rem", margin: "0.5rem 0 0" }}>
            <BalanceRow label="Cash" amount={finance.cash} currency={finance.currency} />
            <BalanceRow label="Savings" amount={finance.savings} currency={finance.currency} />
          </dl>
          {finance.cash === 0 ? (
            <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.4rem 0 0" }}>No cash balance.</p>
          ) : null}
          {finance.savings === 0 ? (
            <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.15rem 0 0" }}>No savings balance.</p>
          ) : null}
        </div>

        <div className="ahd-card ahd-card-pad">
          <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Stock holdings</h3>
          {finance.holdings.length === 0 ? (
            <div className="ahd-empty">No holdings.</div>
          ) : multiHolding ? (
            <div className="ahd-stack" style={{ marginTop: "0.55rem", gap: "0.4rem" }}>
              {finance.holdings.map((h, index) => (
                <details
                  key={h.id}
                  className="ahd-wallet-holding"
                  open={index === 0}
                  style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.4rem", minWidth: 0, maxWidth: "100%" }}
                >
                  <summary
                    className="ahd-wallet-disclosure"
                    style={{ minHeight: "44px", display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", minWidth: 0 }}
                  >
                    <HoldingSummaryValue name={h.name} ticker={h.ticker} shares={h.shares} price={h.price} currency={h.currency} />
                  </summary>
                  <HoldingDetail shares={h.shares} price={h.price} currency={h.currency} />
                  <HoldingCompanyLink id={h.id} name={h.name} onOpenCompany={onOpenCompany} />
                </details>
              ))}
            </div>
          ) : (
            <ul className="ahd-grid ahd-grid-2" style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0 }}>
              {finance.holdings.map((h) => (
                <li
                  key={h.id}
                  style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.5rem", minWidth: 0 }}
                >
                  <HoldingSummaryValue name={h.name} ticker={h.ticker} shares={h.shares} price={h.price} currency={h.currency} layout="stack" />
                  <HoldingDetail shares={h.shares} price={h.price} currency={h.currency} />
                  <HoldingCompanyLink id={h.id} name={h.name} onOpenCompany={onOpenCompany} />
                </li>
              ))}
            </ul>
          )}
          <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.55rem 0 0" }}>
            Values are shown in each holding&apos;s own currency.
          </p>
        </div>
      </div>

      <div className="ahd-stack" style={{ minWidth: 0 }}>
        <div className="ahd-card ahd-card-pad">
          <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Portfolio trend</h3>
          {(finance.wealthHistory ?? []).length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.45rem" }}>
              No portfolio history recorded yet. History appears after completing a turn.
            </div>
          ) : (
            <div style={{ marginTop: "0.45rem", minWidth: 0, maxWidth: "100%" }}>
              <TrendChart
                id="portfolio-trend"
                title="Portfolio trend"
                defaultSeriesId="netWorth"
                emptyMessage="No portfolio history recorded yet."
                series={[
                  {
                    id: "netWorth",
                    label: "Net worth",
                    points: finance.wealthHistory!.map((p) => ({ turn: p.turn, value: p.netWorth })),
                    format: (v) => formatFinanceMoney(v, finance.currency),
                  },
                  {
                    id: "cash",
                    label: "Cash",
                    points: finance.wealthHistory!.map((p) => ({ turn: p.turn, value: p.cash })),
                    format: (v) => formatFinanceMoney(v, finance.currency),
                  },
                  {
                    id: "savings",
                    label: "Savings",
                    points: finance.wealthHistory!.map((p) => ({ turn: p.turn, value: p.savings })),
                    format: (v) => formatFinanceMoney(v, finance.currency),
                  },
                  {
                    id: "shares",
                    label: "Shares value",
                    points: finance.wealthHistory!.map((p) => ({ turn: p.turn, value: p.sharesValue })),
                    format: (v) => formatFinanceMoney(v, finance.currency),
                  },
                  {
                    id: "bonds",
                    label: "Bonds value",
                    points: finance.wealthHistory!.map((p) => ({ turn: p.turn, value: p.bondsValue })),
                    format: (v) => formatFinanceMoney(v, finance.currency),
                  },
                  {
                    id: "funds",
                    label: "Funds",
                    points: finance.wealthHistory!.map((p) => ({ turn: p.turn, value: p.funds })),
                    format: (v) => formatFinanceMoney(v, finance.currency),
                  },
                ]}
              />
            </div>
          )}
        </div>
        <CapabilityNote />
      </div>
    </div>
  );
}

function BankingSection({ finance, busy, onAction, onNavigate, countryId = "" }: { finance: FinanceView; busy: boolean; onAction: GameScreenProps["onAction"]; onNavigate?: (route: "portfolio" | "banking") => void; countryId?: string }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parse = (): number | null => {
    const n = Number(amount.replace(/,/g, "").trim());
    if (amount.trim() === "" || !Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const submit = (kind: "deposit" | "withdraw") => {
    const n = parse();
    if (n === null) {
      setError("Enter a positive amount.");
      return;
    }
    if (kind === "deposit" && n > finance.cash) {
      setError(`Amount exceeds cash balance of ${formatFinanceMoney(finance.cash, finance.currency)}.`);
      return;
    }
    if (kind === "withdraw" && n > finance.savings) {
      setError(`Amount exceeds savings balance of ${formatFinanceMoney(finance.savings, finance.currency)}.`);
      return;
    }
    setError(null);
    if (kind === "deposit") onAction(finance.deposit.id, { amount: n });
    else onAction(finance.withdraw.id, { amount: n });
  };

  const depositDisabled = busy || !finance.deposit.available;
  const withdrawDisabled = busy || !finance.withdraw.available;

  return (
    <div className="ahd-wallet-grid">
      <div className="ahd-stack" style={{ minWidth: 0 }}>
        <RouteHero image={bankingHero(countryId)} alt={bankingHeroAlt(countryId)} eyebrow="Banking" title="Banking">
          {onNavigate ? (
            <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.3rem 0 0" }}>
              Savings deposits and withdrawals.{" "}
              <button type="button" className="ahd-profile-link" onClick={() => onNavigate("portfolio")} aria-label="Go to portfolio">
                Go to Portfolio
              </button>
            </p>
          ) : null}
          <dl style={{ display: "flex", flexDirection: "column", gap: "0.25rem", margin: "0.5rem 0 0" }}>
            <BalanceRow label="Cash" amount={finance.cash} currency={finance.currency} />
            <BalanceRow label="Savings" amount={finance.savings} currency={finance.currency} />
          </dl>
          {finance.savings === 0 ? (
            <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.4rem 0 0" }}>No savings balance.</p>
          ) : null}
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.4rem 0 0" }}>
            Savings holder · {finance.currency}
          </p>
          <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.15rem 0 0", overflowWrap: "anywhere" }}>
            {finance.savingsHolder}
          </p>
        </RouteHero>
      </div>

      <div className="ahd-stack" style={{ minWidth: 0 }}>
        <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem", minWidth: 0 }}>
          <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Move money</h3>
          <label className="ahd-field" style={{ maxWidth: "16rem" }}>
            <span className="ahd-label">Amount</span>
            <input
              className="ahd-input"
              type="number"
              inputMode="decimal"
              min={0}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (error) setError(null);
              }}
              disabled={busy}
              aria-label="Amount"
              aria-invalid={!!error}
              aria-describedby={error ? "finance-amount-error" : undefined}
            />
            {error ? (
              <span id="finance-amount-error" className="ahd-error-text" role="alert">
                {error}
              </span>
            ) : null}
          </label>

          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <button
                type="button"
                className="ahd-btn ahd-btn-primary ahd-btn-sm"
                onClick={() => submit("deposit")}
                disabled={depositDisabled}
                aria-disabled={depositDisabled}
                aria-label={`Deposit: ${finance.deposit.name}`}
              >
                Deposit
              </button>
              <AvailabilityHint cost={finance.deposit.cost} available={finance.deposit.available} disabledReason={finance.deposit.disabledReason} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <button
                type="button"
                className="ahd-btn ahd-btn-sm"
                onClick={() => submit("withdraw")}
                disabled={withdrawDisabled}
                aria-disabled={withdrawDisabled}
                aria-label={`Withdraw: ${finance.withdraw.name}`}
              >
                Withdraw
              </button>
              <AvailabilityHint cost={finance.withdraw.cost} available={finance.withdraw.available} disabledReason={finance.withdraw.disabledReason} />
            </div>
          </div>
        </div>
        <CapabilityNote />
      </div>
    </div>
  );
}

function WalletLoading({ section }: { section: "portfolio" | "banking" }) {
  return (
    <div className="ahd-stack" role="status" aria-label={section === "portfolio" ? "Portfolio loading" : "Banking loading"}>
      <div className="ahd-card ahd-card-pad" aria-hidden="true">
        <div style={{ height: "1.2rem", width: "40%", borderRadius: "0.35rem", background: "var(--ahd-border)" }} />
        <div style={{ height: "0.9rem", width: "70%", marginTop: "0.5rem", borderRadius: "0.35rem", background: "var(--ahd-border)" }} />
      </div>
      <div className="ahd-card ahd-card-pad" aria-hidden="true">
        <div style={{ height: "0.9rem", width: "55%", borderRadius: "0.35rem", background: "var(--ahd-border)" }} />
      </div>
      <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: 0 }}>Balances are loading.</p>
    </div>
  );
}

function WalletError({ section, loadError, onNavigate }: { section: "portfolio" | "banking"; loadError?: string | null; onNavigate?: (route: "portfolio" | "banking") => void }) {
  const other = section === "portfolio" ? "banking" : "portfolio";
  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad" role="alert">
        <h2 className="ahd-h2">{section === "portfolio" ? "Portfolio" : "Banking"} unavailable</h2>
        <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.4rem 0 0" }}>
          {loadError ?? "Balances could not be loaded."} No balances are shown; stale values are hidden until the next load.
        </p>
      </div>
      {onNavigate ? (
        <div className="ahd-card ahd-card-pad">
          <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onNavigate(other)} aria-label={other === "banking" ? "Go to banking" : "Go to portfolio"}>
            {other === "banking" ? "Go to Banking" : "Go to Portfolio"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function FinancePanel({ finance, section, busy, onAction, onNavigate, onOpenCompany, countryId, status = "ready", loadError = null, mode = "sp" }: FinancePanelProps) {
  if (mode === "mp") {
    const other = section === "portfolio" ? "banking" : "portfolio";
    return (
      <div className="ahd-wallet">
        <div className="ahd-card ahd-card-pad" role="note" aria-label="Wallet unavailable in multiplayer">
          <h2 className="ahd-h2">{section === "portfolio" ? "Portfolio" : "Banking"}</h2>
          <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.4rem 0 0" }}>
            Wallet and portfolio balances are unavailable in multiplayer in this build:
            the bridge has no allowlisted portfolio or banking read, so no balances
            are shown here. Your live cash on hand is in the multiplayer Wallet
            section, from your character record.
          </p>
          {onNavigate ? (
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ marginTop: "0.55rem" }}
              onClick={() => onNavigate(other)}
              aria-label={other === "banking" ? "Go to banking" : "Go to portfolio"}
            >
              {other === "banking" ? "Go to Banking" : "Go to Portfolio"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  if (status === "loading") {
    return (
      <div className="ahd-wallet">
        <WalletLoading section={section} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="ahd-wallet">
        <WalletError section={section} loadError={loadError} onNavigate={onNavigate} />
      </div>
    );
  }
  return (
    <div className="ahd-wallet">
      {section === "banking"
        ? <BankingSection finance={finance} busy={busy} onAction={onAction} onNavigate={onNavigate} countryId={countryId} />
        : <PortfolioSection finance={finance} onNavigate={onNavigate} onOpenCompany={onOpenCompany} />}
    </div>
  );
}
