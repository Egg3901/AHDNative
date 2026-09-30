import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MpModeScreen } from "./MpModeScreen";
import { openMpDestination } from "./mpNavigation.test-helpers";
import userEvent from "@testing-library/user-event";
import type { MpBridgeHost } from "../mp/bridge";

// Reference: AHDGame 6ed11a3d, character/me and FinancialStrip. Campaign
// funds have home-currency face value; personal/savings retain denominations.
function hostFor(character: Record<string, unknown>): MpBridgeHost {
  const reads: Record<string, unknown> = {
    "auth-session": { active: true, sub: "507f1f77bcf86cd799439011", username: "Ada" },
    "character-me": { character: { _id: "c1", name: "Ada", cashOnHand: 500, ...character } },
    "client-nav": { user: null, hasCharacter: false },
    "turn-status": { currentTurn: 12, currentYear: 1953 },
    notifications: { notifications: [], unreadCount: 0, total: 0, hasMore: false },
    "mail-inbox": { mails: [], unreadCount: 0, total: 0, hasMore: false },
    "mail-sent": { mails: [], total: 0, hasMore: false },
  };
  return {
    fetch: async (op) => {
      if (!(op in reads)) throw new Error(`Unexpected read: ${op}`);
      return JSON.stringify(reads[op]);
    },
    mutate: async () => { throw new Error("No mutation expected"); },
    beginSignIn: async () => {},
  };
}

describe("authoritative MP wallet", () => {
  it("opens currency balances from the drawer without converting or combining currencies", async () => {
    render(<MpModeScreen host={hostFor({
      countryId: "UK", homeCurrency: "GBP",
      currencyBalances: { campaign: 1250, personal: { GBP: 300, USD: 200 }, savings: { GBP: 40, JPY: 900 } },
    })} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    await openMpDestination("Wallet");
    const wallet = screen.getByRole("region", { name: "Wallet" });
    expect(within(wallet).getByText("Campaign funds (GBP)")).toBeVisible();
    expect(within(wallet).getByText("1,250")).toBeVisible();
    const balances = within(wallet).getByRole("table", { name: "Currency balances" });
    expect(within(balances).getByRole("row", { name: "GBP 300 40" })).toBeVisible();
    expect(within(balances).getByRole("row", { name: "USD 200 0" })).toBeVisible();
    expect(within(balances).getByRole("row", { name: "JPY 0 900" })).toBeVisible();
  });

  it("uses the server portrait on Profile before opening the wallet", async () => {
    render(<MpModeScreen host={hostFor({ avatarUrl: "https://cdn.example.test/ada.png" })} onExit={() => {}} />);
    const portrait = await screen.findByRole("img", { name: "Ada profile picture" });
    expect(portrait).toHaveAttribute("src", "https://cdn.example.test/ada.png");
  });

  it("opens savings and deposits from Wallet, then returns to Profile with the updated cash", async () => {
    let cash = 300;
    let saved = 0;
    let opened = false;
    const base = hostFor({});
    const host: MpBridgeHost = {
      ...base,
      fetch: async op => {
        if (op === "character-me") return JSON.stringify({ character: {
          _id: "c1", name: "Ada", cashOnHand: cash, homeCurrency: "GBP",
          currencyBalances: { campaign: 1250, personal: { GBP: cash }, savings: { GBP: saved } },
        } });
        if (op === "savings-accounts") return JSON.stringify({ apyByCurrency: { GBP: 0.025 }, savingsAccountsOpened: { GBP: opened }, savingsBalances: { GBP: saved }, interestEarned: {}, pendingInterest: {}, turnsUntilCredit: 3 });
        return base.fetch(op);
      },
      mutate: async (op, payload) => {
        if (op === "savings-open") opened = true;
        else if (op === "savings-deposit") { cash -= 25; saved += 25; }
        else throw new Error(`Unexpected mutation: ${op}`);
        return JSON.stringify({ success: true, currency: "GBP", ...(op === "savings-open" ? {} : { amount: 25 }) });
      },
    };
    const user = userEvent.setup();
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    await openMpDestination("Wallet");
    await user.click(screen.getByRole("button", { name: "Savings accounts" }));
    expect(await screen.findByText("2.5% APY")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open savings account" }));
    await screen.findByText("Savings account opened (GBP).");
    await user.type(screen.getByRole("spinbutton", { name: "Savings amount" }), "25");
    await user.click(screen.getByRole("button", { name: "Deposit" }));
    expect(await screen.findByText("Deposited 25 GBP.")).toBeVisible();
    expect(screen.getByRole("row", { name: "GBP 275 25" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to profile" }));
    expect(screen.getByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cash on hand: 275" })).toBeVisible();
  });
});
