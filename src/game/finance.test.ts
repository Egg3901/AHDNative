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

  it("applies source central-bank savings and LOC phase-in across public save/reload turns", () => {
    const savedWorld = new GameSession();
    savedWorld.create(options);
    const raw = JSON.parse(savedWorld.serialize(SAVED_AT)) as {
      world: {
        meta: { turn: number };
        featureFlags: { centralBanks: boolean; economy: boolean; metrics: boolean };
        player: { cash: number; savings: number; savingsHolder: string; lineOfCredit?: unknown };
        centralBanks: Record<string, { primeRate?: number }>;
        countries: Record<string, { economy: { inflationRate: number } }>;
        budgets: Record<string, { economicFactors: { inflationRate: number } }>;
        centralBankPricingPhaseIn?: { startedTurn: number };
      };
    };
    raw.world.meta.turn = 3;
    // Hold the source-vector inputs constant through the complete public turn;
    // the finance phases under test remain enabled.
    raw.world.featureFlags.centralBanks = false;
    raw.world.featureFlags.economy = false;
    raw.world.featureFlags.metrics = false;
    raw.world.centralBankPricingPhaseIn = { startedTurn: 0 };
    raw.world.player.cash = 10_000;
    raw.world.player.savings = 48_000;
    raw.world.player.savingsHolder = "centralBank";
    raw.world.centralBanks.US!.primeRate = 5;
    raw.world.budgets.US!.economicFactors.inflationRate = 2;
    raw.world.countries.US!.economy.inflationRate = 0.02;
    const continued = new GameSession();
    continued.load(JSON.stringify(raw));
    continued.advance();
    const afterTurnFour = JSON.parse(continued.serialize(SAVED_AT)).world as {
      meta: { turn: number };
      player: { pendingSavingsInterest?: number };
    };
    expect(afterTurnFour.meta.turn).toBe(4);
    // Source Game 01797b2 independently yields a 0.125 rollout fraction,
    // +0.125 pp deposit APY and $16.25 on $48,000 at this vector.
    expect(afterTurnFour.player.pendingSavingsInterest).toBe(16.25);

    const replay = new GameSession();
    replay.load(continued.serialize(SAVED_AT));
    replay.advance();
    continued.advance();
    expect(replay.serialize(SAVED_AT)).toBe(continued.serialize(SAVED_AT));
  });

  it("adds the source LOC phase-in spread to a serviced public obligation", () => {
    const seeded = new GameSession();
    seeded.create(options);
    const raw = JSON.parse(seeded.serialize(SAVED_AT)) as {
      world: {
        meta: { turn: number };
        featureFlags: { centralBanks: boolean; economy: boolean; metrics: boolean };
        player: { cash: number; savings: number; savingsHolder: string; lineOfCredit?: unknown };
        centralBanks: Record<string, { primeRate?: number }>;
        centralBankPricingPhaseIn?: { startedTurn: number };
      };
    };
    raw.world.meta.turn = 3;
    raw.world.featureFlags.centralBanks = false;
    raw.world.featureFlags.economy = false;
    raw.world.featureFlags.metrics = false;
    raw.world.centralBankPricingPhaseIn = { startedTurn: 0 };
    raw.world.player.cash = 10_000;
    raw.world.player.savings = 0;
    raw.world.player.savingsHolder = "centralBank";
    raw.world.player.lineOfCredit = {
      balance: 1_000, arrears: 0, denomination: "USD", drawFrozen: false,
    };
    raw.world.centralBanks.US!.primeRate = 5;
    const session = new GameSession();
    session.load(JSON.stringify(raw));
    session.advance();
    const after = JSON.parse(session.serialize(SAVED_AT)).world as {
      player: { lineOfCredit?: { balance: number; arrears: number } };
    };
    // Game 01797b2 gives $2.29 interest at turn 4 (prime 5 + borrower spread
    // 5 + source phase-in 1); source PI payment then reduces principal $1.78.
    expect(after.player.lineOfCredit).toMatchObject({ balance: 998.22, arrears: 0 });
  });

  it("lists player share holdings in each corporation home currency", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    const holding = session.view().finance.holdings.find((h) => h.id === "US-media");
    expect(holding).toMatchObject({ name: "US-media", ticker: "US.MEDI", shares: 1, price: 774, currency: "USD" });
  });
});

describe("session finance wealth history", () => {
  it("projects empty wealth history before any turn and recorded points after", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.view().finance.wealthHistory).toEqual([]);
    session.advance();
    const finance = session.view().finance;
    expect(finance.wealthHistory).toHaveLength(1);
    expect(finance.wealthHistory?.[0]).toMatchObject({
      turn: 1,
      cash: finance.cash,
      savings: finance.savings,
    });
    expect(finance.wealthHistory?.[0]?.netWorth).toBeGreaterThanOrEqual(0);
  });
});
