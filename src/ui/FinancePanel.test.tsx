import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FinanceView } from "../game/types";

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 1250.5,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [
      { id: "h1", name: "Acme Steel", ticker: "ACME", shares: 10, price: 25, currency: "USD" },
      { id: "h2", name: "Yen Works", ticker: "YENW", shares: 5, price: 1000, currency: "JPY" },
    ],
    deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
    ...overrides,
  };
}

const renderPanel = async () => {
  const { FinancePanel } = await import("./FinancePanel");
  return FinancePanel;
};

describe("FinancePanel portfolio", () => {
  it("shows cash, savings, and per-holding currency/price/shares without a foreign aggregate total", async () => {
    const FinancePanel = await renderPanel();
    render(<FinancePanel finance={makeFinance()} section="portfolio" busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/cash/i).parentElement ?? screen.getByText(/cash/i)).toBeInTheDocument();
    expect(screen.getByText("Acme Steel")).toBeInTheDocument();
    expect(screen.getByText(/ACME/)).toBeInTheDocument();
    expect(screen.getByText(/10\s*shares/i)).toBeInTheDocument();
    expect(screen.getByText("Yen Works")).toBeInTheDocument();
    // Per-holding currencies shown, but no cross-currency aggregate valuation.
    expect(screen.queryByText(/total portfolio value/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/net worth/i)).not.toBeInTheDocument();
  });

  it("shows an empty state with no holdings", async () => {
    const FinancePanel = await renderPanel();
    render(<FinancePanel finance={makeFinance({ holdings: [] })} section="portfolio" busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/no holdings/i)).toBeInTheDocument();
  });

  it("falls back gracefully for an unknown currency code", async () => {
    const FinancePanel = await renderPanel();
    render(
      <FinancePanel
        finance={makeFinance({ currency: "XXQ", cash: 42, holdings: [] })}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/XXQ/).length).toBeGreaterThan(0);
  });
});

describe("FinancePanel banking", () => {
  it("shows balances and the savings holder", async () => {
    const FinancePanel = await renderPanel();
    render(<FinancePanel finance={makeFinance()} section="banking" busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("First National Bank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deposit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeInTheDocument();
  });

  it("rejects a non-positive amount without calling onAction", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const FinancePanel = await renderPanel();
    render(<FinancePanel finance={makeFinance()} section="banking" busy={false} onAction={onAction} />);
    await user.clear(screen.getByLabelText(/amount/i));
    await user.click(screen.getByRole("button", { name: /deposit/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("blocks deposit over cash and withdraw over savings", async () => {
    const user = userEvent.setup();
    const FinancePanel = await renderPanel();
    const onAction = vi.fn();
    render(<FinancePanel finance={makeFinance({ cash: 100, savings: 20 })} section="banking" busy={false} onAction={onAction} />);
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /deposit/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/exceeds/i);
    expect(onAction).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), "50");
    await user.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/exceeds/i);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("sends depositSavings/withdrawSavings with the amount on valid input", async () => {
    const user = userEvent.setup();
    const FinancePanel = await renderPanel();
    const onAction = vi.fn();
    render(<FinancePanel finance={makeFinance({ cash: 1000, savings: 500 })} section="banking" busy={false} onAction={onAction} />);
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), "200");
    await user.click(screen.getByRole("button", { name: /deposit/i }));
    expect(onAction).toHaveBeenCalledWith("depositSavings", { amount: 200 });
    await user.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(onAction).toHaveBeenCalledWith("withdrawSavings", { amount: 200 });
  });

  it("disables buttons when busy or the action is unavailable, showing the reason", async () => {
    const FinancePanel = await renderPanel();
    const { rerender } = render(
      <FinancePanel finance={makeFinance()} section="banking" busy={true} onAction={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /deposit/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeDisabled();
    rerender(
      <FinancePanel
        finance={makeFinance({ withdraw: { id: "withdrawSavings", name: "Withdraw", description: "W", cost: 1, available: false, disabledReason: "No open account" } })}
        section="banking"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeDisabled();
    expect(screen.getByText("No open account")).toBeInTheDocument();
  });
});
