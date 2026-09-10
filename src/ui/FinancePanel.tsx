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
 */
import { useState } from "react";
import type { FinanceView, GameScreenProps } from "../game/types";

export interface FinancePanelProps {
  finance: FinanceView;
  section: "portfolio" | "banking";
  busy: boolean;
  onAction: GameScreenProps["onAction"];
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

function PortfolioSection({ finance }: { finance: FinanceView }) {
  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Portfolio</h2>
        <dl style={{ display: "flex", flexDirection: "column", gap: "0.35rem", margin: "0.5rem 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Cash</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700 }}>
              {formatFinanceMoney(finance.cash, finance.currency)}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Savings</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700 }}>
              {formatFinanceMoney(finance.savings, finance.currency)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="ahd-card ahd-card-pad">
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Stock holdings</h3>
        {finance.holdings.length === 0 ? (
          <div className="ahd-empty">No holdings.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {finance.holdings.map((h) => (
              <li
                key={h.id}
                style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.5rem", minWidth: 0 }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.84rem", overflowWrap: "anywhere" }}>
                  {h.name} <span className="ahd-muted">({h.ticker})</span>
                </div>
                <div className="ahd-muted ahd-mono" style={{ fontSize: "0.78rem", overflowWrap: "anywhere" }}>
                  {h.shares} shares · {formatFinanceMoney(h.price, h.currency)} per share ·{" "}
                  {formatFinanceMoney(h.shares * h.price, h.currency)} in {h.currency}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.55rem 0 0" }}>
          Values are shown in each holding&apos;s own currency.
        </p>
      </div>
    </div>
  );
}

function BankingSection({ finance, busy, onAction }: { finance: FinanceView; busy: boolean; onAction: GameScreenProps["onAction"] }) {
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
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Banking</h2>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.82rem" }}>Cash</div>
          <div className="ahd-mono" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
            {formatFinanceMoney(finance.cash, finance.currency)}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginTop: "0.25rem" }}>
          <div style={{ fontSize: "0.82rem" }}>Savings</div>
          <div className="ahd-mono" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
            {formatFinanceMoney(finance.savings, finance.currency)}
          </div>
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.4rem 0 0", overflowWrap: "anywhere" }}>
          {finance.savingsHolder}
        </p>
      </div>

      <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
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
    </div>
  );
}

export function FinancePanel({ finance, section, busy, onAction }: FinancePanelProps) {
  if (section === "banking") return <BankingSection finance={finance} busy={busy} onAction={onAction} />;
  return <PortfolioSection finance={finance} />;
}
