import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-finance-v1", playerName: "Alex" };
const SAVED_AT = "2026-09-10T00:00:00.000Z";

describe("session finance view", () => {
  it("exposes cash, savings, home currency, holder and savings actions on create", () => {
    const session = new GameSession();
    const view = session.create(options);
    expect(view.finance.cash).toBe(view.player.cash);
    expect(view.finance).toMatchObject({
      savings: 0, currency: "USD", holdings: [],
      deposit: { id: "depositSavings", requires: "amount", available: true },
      withdraw: { id: "withdrawSavings", requires: "amount" },
    });
    expect(view.finance.savingsHolder).toMatch(/central bank/i);
  });

  it("moves cash to savings and back through deposit/withdraw", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("depositSavings", { amount: 2000 }).ok).toBe(true);
    expect(session.view().finance).toMatchObject({ cash: 8000, savings: 2000 });
    expect(session.act("withdrawSavings", { amount: 500 }).ok).toBe(true);
    expect(session.view().finance).toMatchObject({ cash: 8500, savings: 1500 });
  });

  it("leaves balances untouched when a savings move is rejected", () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize(SAVED_AT);
    expect(session.act("depositSavings", { amount: 999999 }).ok).toBe(false);
    expect(session.act("withdrawSavings", { amount: 1 }).ok).toBe(false);
    expect(session.act("depositSavings", { amount: -50 }).ok).toBe(false);
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("preserves finance balances through save/load", () => {
    const session = new GameSession();
    session.create(options);
    session.act("depositSavings", { amount: 2000 });
    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    expect(loaded.view().finance).toMatchObject({ cash: 8000, savings: 2000, currency: "USD" });
  });

  it("preserves local currency savings in a non-US world", () => {
    const session = new GameSession();
    const created = session.create({ ...options, countryId: "UK" });
    expect(created.finance.currency).toBe("GBP");
    expect(session.act("depositSavings", { amount: 1000 }).ok).toBe(true);
    const loaded = new GameSession();
    expect(loaded.load(session.serialize(SAVED_AT)).finance).toMatchObject({
      cash: 9000, savings: 1000, currency: "GBP",
    });
  });

  it("lists player share holdings in each corporation home currency", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    const holding = session.view().finance.holdings.find((h) => h.id === "US-media");
    expect(holding).toMatchObject({ name: "US-media", ticker: "US.MEDI", shares: 1, price: 774, currency: "USD" });
  });
});
