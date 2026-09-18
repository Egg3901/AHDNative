/**
 * MP wallet/portfolio reachability slice (#507, #84).
 *
 * The bridge contract has no allowlisted portfolio or banking read (finance
 * surfaces are deliberately absent in src/mp/endpoints.ts), so the only
 * source-backed MP money figure is character-me `cashOnHand`. These tests
 * pin the honest slice through the real MpModeScreen: a reachable Wallet
 * section projecting that authoritative figure at 390px and 1280px, an
 * explicit unknown (never $0) when the server omits it, a working
 * section/return path, and no SP balances, holdings, or money controls.
 * FinancePanel mode="mp" keeps the matching unavailable reason with its
 * cross-navigation intact.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import { FinancePanel } from "./FinancePanel";
import type { FinanceView } from "../game/types";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const capabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterCountryId: "US",
  characterName: "Ada",
  unreadMailCount: 0,
});
const inbox = JSON.stringify({
  notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});
const emptyMail = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptySent = JSON.stringify({ mails: [], total: 0, hasMore: false });

function meWithCash(cashOnHand: number | null | undefined): string {
  const character: Record<string, unknown> = { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", actions: 3, countryId: "US" };
  if (cashOnHand !== undefined) character.cashOnHand = cashOnHand;
  return JSON.stringify({ character, corporation: null });
}

function readyHost(cashOnHand: number | null | undefined = 1000): MpBridgeHost {
  return {
    fetch: async (op: string) => {
      if (op === "auth-session") return probe;
      if (op === "character-me") return meWithCash(cashOnHand);
      if (op === "turn-status") return turn;
      if (op === "client-nav") return capabilities;
      if (op === "notifications") return inbox;
      if (op === "mail-inbox") return emptyMail;
      if (op === "mail-sent") return emptySent;
      throw new Error(`unexpected fetch ${op}`);
    },
    mutate: async () => {
      throw new Error("unexpected mutate");
    },
    beginSignIn: async () => {},
  };
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  setViewport(1024, 768);
  window.location.hash = "";
  vi.restoreAllMocks();
});

async function renderReadyWallet(width: number, height: number, cashOnHand?: number | null) {
  setViewport(width, height);
  render(<MpModeScreen host={readyHost(cashOnHand)} onExit={() => {}} />);
  return screen.findByRole("region", { name: "Wallet" });
}

function financeFixture(): FinanceView {
  return {
    cash: 1250.5,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [{ id: "h1", name: "Acme Steel", ticker: "ACME", shares: 10, price: 25, currency: "USD" }],
    deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
  };
}

describe("MP wallet reachability at 390px", () => {
  it("projects the authoritative cash figure with section navigation and return", async () => {
    const user = userEvent.setup();
    const wallet = await renderReadyWallet(390, 844);
    const queries = within(wallet as HTMLElement);

    // The server-backed figure renders; no SP balances, holdings, or money
    // controls leak into the MP surface.
    expect(queries.getByText("Cash on hand")).toBeInTheDocument();
    expect(queries.getByText("1000")).toBeInTheDocument();
    expect(queries.queryByText("Acme Steel")).not.toBeInTheDocument();
    expect(queries.queryByRole("button", { name: /deposit|withdraw/i })).not.toBeInTheDocument();
    expect(queries.getByText(/no multiplayer read in this build/i)).toBeInTheDocument();

    // Sections nav reaches the wallet; the section returns to the list.
    const sections = screen.getByRole("navigation", { name: "Multiplayer sections" });
    await user.click(within(sections).getByRole("button", { name: "Wallet" }));
    expect(window.location.hash).toBe("#mp-wallet");
    const backRow = (wallet as HTMLElement).nextElementSibling as HTMLElement;
    await user.click(within(backRow).getByRole("button", { name: "Back to sections" }));
    expect(window.location.hash).toBe("#mp-top");
  });
});

describe("MP wallet reachability at 1280px", () => {
  it("renders the same wallet content without phone-only affordances", async () => {
    const wallet = await renderReadyWallet(1280, 800);
    const queries = within(wallet as HTMLElement);
    expect(screen.getByRole("heading", { name: "Wallet" })).toBeInTheDocument();
    expect(queries.getByText("1000")).toBeInTheDocument();
    expect(queries.getByText(/savings, stock holdings, portfolio trends/i)).toBeInTheDocument();
    expect(queries.queryByRole("button", { name: /deposit|withdraw/i })).not.toBeInTheDocument();
    const sections = screen.getByRole("navigation", { name: "Multiplayer sections" });
    expect(within(sections).getByRole("button", { name: "Wallet" })).toBeInTheDocument();
  });
});

describe("MP wallet unknown cash", () => {
  it("names an unreported balance instead of $0", async () => {
    const wallet = await renderReadyWallet(390, 844, null);
    const queries = within(wallet as HTMLElement);
    expect(queries.getByText(/not reported by the server/i)).toBeInTheDocument();
    expect(queries.queryByText("$0.00")).not.toBeInTheDocument();
    expect(queries.queryByText("0", { exact: true })).not.toBeInTheDocument();
  });
});

describe("FinancePanel MP unavailable state", () => {
  it.each(["portfolio", "banking"] as const)(
    "explains the missing bridge read and keeps cross-navigation from %s",
    async (section) => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(
        <FinancePanel
          finance={financeFixture()}
          section={section}
          busy={false}
          onAction={vi.fn()}
          onNavigate={onNavigate}
          mode="mp"
        />,
      );
      const note = screen.getByRole("note", { name: /wallet unavailable in multiplayer/i });
      expect(note).toHaveTextContent(/no allowlisted portfolio or banking read/i);
      expect(note).toHaveTextContent(/multiplayer wallet section/i);
      // No SP balances or holdings leak through the unavailable state.
      expect(screen.queryByText("Acme Steel")).not.toBeInTheDocument();
      expect(screen.queryByText("First National Bank")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /deposit/i })).not.toBeInTheDocument();
      const other = section === "portfolio" ? "banking" : "portfolio";
      await user.click(screen.getByRole("button", { name: other === "banking" ? "Go to banking" : "Go to portfolio" }));
      expect(onNavigate).toHaveBeenCalledWith(other);
    },
  );
});
