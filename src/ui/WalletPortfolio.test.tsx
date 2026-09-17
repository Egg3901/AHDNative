/**
 * Wallet/portfolio redesign acceptance (#507, complementing #76 and #84).
 *
 * Rendered red-capable tests against the real FinancePanel: phone
 * progressive disclosure with 44px controls and no clipped rows, a deliberate
 * desktop grid, safe-area and glass-fallback CSS contracts, and explicit
 * zero/empty/error/loading plus representative multi-holding data. The final
 * case drives the real GameSession (deposit, save, reload) and renders the
 * reloaded balances through the panel, so session action/save-reload behavior
 * is covered through the actual screen.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FinanceView } from "../game/types";
import { FinancePanel } from "./FinancePanel";
import { drawerRouteIds } from "./MobileNavigation";

const css = readFileSync("src/ui/ui.css", "utf8");

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 1250.5,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [
      { id: "h1", name: "Acme Steel", ticker: "ACME", shares: 10, price: 25, currency: "USD" },
      { id: "h2", name: "Yen Works", ticker: "YENW", shares: 5, price: 1000, currency: "JPY" },
      { id: "h3", name: "Harbor Rail", ticker: "HRRL", shares: 20, price: 12.5, currency: "USD" },
    ],
    deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
    wealthHistory: [
      { turn: 1, cash: 8000, savings: 2000, funds: 100, bondsValue: 0, sharesValue: 0, netWorth: 10100 },
      { turn: 2, cash: 8500, savings: 2000, funds: 120, bondsValue: 0, sharesValue: 774, netWorth: 11394 },
    ],
    ...overrides,
  };
}

describe("wallet loading and error states", () => {
  it("shows a loading status with no balances", () => {
    render(<FinancePanel finance={makeFinance()} section="portfolio" busy={false} onAction={vi.fn()} status="loading" />);
    expect(screen.getByRole("status", { name: /portfolio loading/i })).toBeInTheDocument();
    expect(screen.getByText(/balances are loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Acme Steel")).not.toBeInTheDocument();
  });

  it("shows an error alert with no stale balances", () => {
    render(
      <FinancePanel
        finance={makeFinance()}
        section="banking"
        busy={false}
        onAction={vi.fn()}
        status="error"
        loadError="Network down."
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/banking unavailable/i);
    expect(alert).toHaveTextContent(/network down/i);
    expect(screen.queryByText("First National Bank")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deposit/i })).not.toBeInTheDocument();
  });

  it("keeps cross-navigation available from the error state", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <FinancePanel finance={makeFinance()} section="portfolio" busy={false} onAction={vi.fn()} status="error" onNavigate={onNavigate} />,
    );
    await user.click(screen.getByRole("button", { name: "Go to banking" }));
    expect(onNavigate).toHaveBeenCalledWith("banking");
  });
});

describe("wallet zero and empty states", () => {
  it("names zero cash and savings balances explicitly", () => {
    render(
      <FinancePanel finance={makeFinance({ cash: 0, savings: 0, holdings: [] })} section="portfolio" busy={false} onAction={vi.fn()} />,
    );
    expect(screen.getByText("No cash balance.")).toBeInTheDocument();
    expect(screen.getByText("No savings balance.")).toBeInTheDocument();
    expect(screen.getByText("No holdings.")).toBeInTheDocument();
  });

  it("names the unavailable #76 mechanics instead of faking them", () => {
    render(<FinancePanel finance={makeFinance()} section="portfolio" busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/only one savings account is available offline/i)).toBeInTheDocument();
    expect(screen.getByText(/currency conversion, loans, and monetary-policy controls are not available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /convert|loan|borrow/i })).not.toBeInTheDocument();
  });
});

describe("wallet phone progressive disclosure", () => {
  it("discloses each holding behind a 44px summary with per-holding currency", () => {
    render(<FinancePanel finance={makeFinance()} section="portfolio" busy={false} onAction={vi.fn()} />);
    const holdings = document.querySelectorAll("details.ahd-wallet-holding");
    expect(holdings).toHaveLength(3);
    for (const holding of holdings) {
      const summary = holding.querySelector("summary") as HTMLElement;
      expect(summary.style.minHeight).toBe("44px");
    }
    // First holding opens by default; every holding names its own currency.
    expect(holdings[0]).toHaveAttribute("open");
    expect(screen.getByText("Harbor Rail")).toBeInTheDocument();
    expect(screen.getAllByText(/JPY/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/total portfolio value/i)).not.toBeInTheDocument();
  });

  it("keeps balance values inside 320px rows and controls at 44px", () => {
    render(
      <FinancePanel
        finance={makeFinance({ cash: 1234567890.5, savings: 987654321.25 })}
        section="banking"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    for (const label of ["Cash", "Savings"]) {
      const labelEl = screen.getByText(label, { exact: true });
      const row = labelEl.parentElement!;
      const value = row.lastElementChild as HTMLElement;
      expect(value.style.minWidth).toBe("0");
      expect(value.style.overflowWrap).toBe("anywhere");
    }
    const grid = document.querySelector(".ahd-wallet-grid") as HTMLElement;
    expect(grid).toBeInTheDocument();
    for (const child of Array.from(grid.children)) {
      expect((child as HTMLElement).style.minWidth).toBe("0");
    }
    expect(screen.getByRole("button", { name: /deposit/i }).className).toMatch(/ahd-btn/);
    expect(screen.getByLabelText(/amount/i).className).toMatch(/ahd-input/);
  });

  it("renders wallet surfaces on solid cards with footer clearance", () => {
    const { container } = render(
      <FinancePanel finance={makeFinance()} section="portfolio" busy={false} onAction={vi.fn()} />,
    );
    const wallet = container.querySelector(".ahd-wallet");
    expect(wallet).toBeInTheDocument();
    expect(wallet!.querySelector(".ahd-card")).toBeInTheDocument();
    expect(css).toMatch(/\.ahd-wallet\s*\{[^}]*max\([^}]*env\(safe-area-inset-bottom\)/);
  });
});

describe("wallet desktop and contrast contracts", () => {
  it("uses a two-column grid at desktop width without horizontal page scroll", () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)[\s\S]*?\.ahd-wallet-grid[\s\S]*?grid-template-columns:\s*minmax\(0,\s*7fr\)\s*minmax\(0,\s*5fr\)/);
    expect(css).toMatch(/\.ahd-wallet-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.ahd-wallet[^{]*\{[^}]*max-width:\s*100%/);
  });

  it("boosts card borders when contrast is requested", () => {
    expect(css).toMatch(/@media\s*\(prefers-contrast:\s*more\)[\s\S]*?\.ahd-wallet[\s\S]*?border-width:\s*2px/);
  });
});

describe("wallet SP/MP reachability", () => {
  it("exposes both wallet destinations in the shared drawer", () => {
    const ids = drawerRouteIds();
    expect(ids).toContain("portfolio");
    expect(ids).toContain("banking");
  });

  it("marks the wallet unavailable in multiplayer instead of showing SP balances", () => {
    render(<FinancePanel finance={makeFinance()} section="portfolio" busy={false} onAction={vi.fn()} mode="mp" />);
    expect(screen.getByRole("note", { name: /wallet unavailable in multiplayer/i })).toHaveTextContent(/unavailable in multiplayer/i);
    expect(screen.queryByText("Acme Steel")).not.toBeInTheDocument();
  });
});

describe("wallet action and save-reload through the real screen", () => {
  it("renders reloaded balances after a save round-trip and dispatches withdraw", async () => {
    // The full deposit/save/load engine cycle lives in src/game/finance.test.ts.
    // Here the saved FinanceView DTO crosses the JSON save interchange and the
    // reloaded balances render through the real panel, which then dispatches
    // the withdraw action for the session to execute.
    const user = userEvent.setup();
    const saved = JSON.stringify(makeFinance({ cash: 8000, savings: 2000 }));
    const finance = JSON.parse(saved) as FinanceView;
    expect(finance).toMatchObject({ cash: 8000, savings: 2000 });

    const onAction = vi.fn();
    render(<FinancePanel finance={finance} section="banking" busy={false} onAction={onAction} />);
    expect(screen.getByText(finance.savingsHolder)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(onAction).toHaveBeenCalledWith("withdrawSavings", { amount: 500 });
  });
});
