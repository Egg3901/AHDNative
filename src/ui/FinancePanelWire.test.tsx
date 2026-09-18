import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FinanceView, WireView } from "../game/types";

function makeWire(overrides: Partial<WireView> = {}): WireView {
  return {
    action: { id: "wireTransfer", name: "Wire Transfer", description: "Wire funds.", cost: 1, available: true },
    forexEnabled: true,
    quotaRemainingAnchor: 50_000_000,
    balances: [{ currency: "USD", balance: 9000, home: true }],
    recipients: [
      { id: "p-dom", name: "Sam Domestic", countryId: "US", countryName: "United States", crossBorder: false },
      { id: "p-for", name: "Ama Foreign", countryId: "UK", countryName: "United Kingdom", crossBorder: true },
    ],
    ...overrides,
  };
}

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 9000,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [],
    deposit: { id: "depositSavings", name: "Deposit", description: "", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "", cost: 0, available: true },
    wire: makeWire(),
    ...overrides,
  };
}

async function renderBanking(finance: FinanceView, onAction = vi.fn()) {
  const { FinancePanel } = await import("./FinancePanel");
  const user = userEvent.setup();
  render(<FinancePanel finance={finance} section="banking" busy={false} onAction={onAction} />);
  return { onAction, user };
}

describe("FinancePanel wire settlement", () => {
  it("shows recorded balances, quota, and recipients without quoting a conversion", async () => {
    await renderBanking(makeFinance());
    expect(screen.getByRole("heading", { name: /wire funds/i })).toBeInTheDocument();
    expect(screen.getByText(/no conversion is applied/i)).toBeInTheDocument();
    expect(screen.getByText(/daily quota remaining/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /wire recipient/i })).toBeInTheDocument();
    expect(screen.getByText(/sam domestic/i)).toBeInTheDocument();
    expect(screen.queryByText(/exchange rate|estimated received|converted total/i)).not.toBeInTheDocument();
  });

  it("sends a home-currency wire without a currency param", async () => {
    const { onAction, user } = await renderBanking(makeFinance());
    await user.selectOptions(screen.getByRole("combobox", { name: /wire recipient/i }), "p-dom");
    await user.type(screen.getByRole("spinbutton", { name: /wire amount/i }), "1000");
    await user.click(screen.getByRole("button", { name: /send wire/i }));
    expect(onAction).toHaveBeenCalledWith("wireTransfer", { targetPoliticianId: "p-dom", amount: 1000 });
  });

  it("sends a foreign denomination with the currency param", async () => {
    const finance = makeFinance({
      wire: makeWire({ balances: [
        { currency: "USD", balance: 9000, home: true },
        { currency: "DDM", balance: 5000, home: false },
      ] }),
    });
    const { onAction, user } = await renderBanking(finance);
    await user.selectOptions(screen.getByRole("combobox", { name: /wire recipient/i }), "p-for");
    await user.selectOptions(screen.getByRole("combobox", { name: /wire currency/i }), "DDM");
    await user.type(screen.getByRole("spinbutton", { name: /wire amount/i }), "500");
    await user.click(screen.getByRole("button", { name: /send wire/i }));
    expect(onAction).toHaveBeenCalledWith("wireTransfer", { targetPoliticianId: "p-for", amount: 500, currency: "DDM" });
  });

  it("rejects bad input locally and never calls onAction", async () => {
    const { onAction, user } = await renderBanking(makeFinance());
    await user.click(screen.getByRole("button", { name: /send wire/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/choose a recipient/i);
    await user.selectOptions(screen.getByRole("combobox", { name: /wire recipient/i }), "p-dom");
    await user.type(screen.getByRole("spinbutton", { name: /wire amount/i }), "99999");
    await user.click(screen.getByRole("button", { name: /send wire/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/exceeds the recorded usd balance/i);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows an empty state when no recipients are recorded", async () => {
    await renderBanking(makeFinance({ wire: makeWire({ recipients: [] }) }));
    expect(screen.getByText(/no recorded politicians/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send wire/i })).not.toBeInTheDocument();
  });

  it("disables cross-border recipients while foreign exchange is off", async () => {
    const { onAction } = await renderBanking(
      makeFinance({ wire: makeWire({ forexEnabled: false }) }),
    );
    const foreign = screen.getByRole("option", { name: /ama foreign/i }) as HTMLOptionElement;
    const domestic = screen.getByRole("option", { name: /sam domestic/i }) as HTMLOptionElement;
    expect(foreign.disabled).toBe(true);
    expect(domestic.disabled).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows unavailable text when the projection omits the wire surface", async () => {
    const { wire: _omit, ...rest } = makeFinance();
    void _omit;
    await renderBanking(rest);
    expect(screen.getByLabelText(/wire transfers unavailable/i)).toBeInTheDocument();
  });

  it("hides balances behind loading and error states", async () => {
    const { FinancePanel } = await import("./FinancePanel");
    const { unmount } = render(
      <FinancePanel finance={makeFinance()} section="banking" busy={false} onAction={vi.fn()} status="loading" />,
    );
    expect(screen.getByRole("status", { name: /banking loading/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /wire funds/i })).not.toBeInTheDocument();
    unmount();
    render(
      <FinancePanel finance={makeFinance()} section="banking" busy={false} onAction={vi.fn()} status="error" loadError="Offline store unreachable." />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/offline store unreachable/i);
    expect(screen.queryByRole("heading", { name: /wire funds/i })).not.toBeInTheDocument();
  });
});
