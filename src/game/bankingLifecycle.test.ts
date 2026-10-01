/** #109 public session acceptance. Setup uses real engine-built saves, not a
 * mocked engine. Expected facility/rate amounts are literal current-reference
 * vectors documented in docs/BANKING-LIFECYCLE.md.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, deserializeSave, projectSaveToV42, serializeSave } from "@ahdclient/engine";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { WorldState } from "@ahdclient/engine";
import { GameSession } from "./session";

const STAMP = "2026-10-01T00:00:00.000Z";
let seed: WorldState;
interface RawBankSave {
  world: { bankPropTradingEnabled?: unknown; bankingLaws?: unknown;
    corporations: Record<string, { bankCharter: Record<string, unknown> }>;
    centralBanks: Record<string, Record<string, unknown>> };
}
beforeAll(() => {
  seed = createWorld({ era: "1953", countryId: "US", seed: "banking-109", playerName: "Alex" });
  for (const flag of Object.keys(seed.featureFlags) as (keyof typeof seed.featureFlags)[]) seed.featureFlags[flag] = flag === "banking";
  seed.centralBanks.US!.primeRate = 5;
});
function setup() {
  const world = structuredClone(seed);
  const charter = world.corporations["US-financial"]!.bankCharter!;
  charter.cashReserves = 1_000_000;
  charter.npcDeposits = 1_000_000;
  charter.totalLoans = 0;
  const session = new GameSession();
  session.load(serializeSave(world, STAMP));
  return session;
}
function saved(session: GameSession): WorldState { return JSON.parse(session.serialize(STAMP)).world; }

describe("banking lifecycle through GameSession", () => {
  it("sets historical rate corridor edges together and refuses an invalid pair without a partial write", () => {
    const session = setup();
    expect(session.setBankRates("US-financial", -4, 6).ok).toBe(true);
    expect(saved(session).corporations["US-financial"]!.bankCharter).toMatchObject({ depositOffset: -4, lendingOffset: 6 });
    const before = session.serialize(STAMP);
    expect(session.setBankRates("US-financial", -0.49, 0.5).ok).toBe(false);
    expect(session.serialize(STAMP)).toBe(before);
    const resumed = new GameSession();
    resumed.load(before);
    expect(resumed.serialize(STAMP)).toBe(before);
  });
  it("draws only against marked collateral including arrears, services the CB counterparty, and resumes repayment", () => {
    const world = saved(setup());
    const charter = world.corporations["US-financial"]!.bankCharter!;
    const target = Object.values(world.corporations).find(c => c.id !== "US-financial" && c.countryId === "US")!;
    target.sharePrice = 100;
    charter.charterType = "investment";
    charter.npcDeposits = 0;
    charter.propBook = [{ asset: "equity", ref: target.id, units: 960, costBasis: 96_000, markValue: 96_000 }];
    charter.propBookMarkValue = 96_000;
    charter.cbMarginArrears = 1_000;
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    expect(session.drawCbMargin("US-financial", 47_000).ok).toBe(true);
    expect(saved(session).centralBanks.US!.netMoneyCreatedLifetime).toBe(47_000);
    const before = session.serialize(STAMP);
    expect(session.drawCbMargin("US-financial", 0.01).ok).toBe(false);
    expect(session.serialize(STAMP)).toBe(before);
    session.advance();
    const after = saved(session);
    expect(after.corporations["US-financial"]!.bankCharter).toMatchObject({ npcDeposits: 0, cbMarginDebt: 47_000, cbMarginArrears: 1_000, lastCbMarginTurn: 1 });
    // Independent reference: 47,000 × 6.5% / 48; facility interest is not rounded.
    expect(after.centralBanks.US!.reserveBalance).toBeCloseTo(63.645833333333336, 10);
    expect(after.corporations["US-financial"]!.bankCharter!.cashReserves).toBeCloseTo(1_046_936.3541666666, 8);
    const resumed = new GameSession();
    resumed.load(session.serialize(STAMP));
    expect(resumed.repayCbMargin("US-financial", 100_000).ok).toBe(true);
    expect(saved(resumed).centralBanks.US!.netMoneyCreatedLifetime).toBe(0);
    expect(saved(resumed).corporations["US-financial"]!.bankCharter).toMatchObject({ cbMarginDebt: 0, cbMarginArrears: 1_000 });
  });
  it("draws and repays the window with CB creation accounting, and pays exact interest while the prop switch is off", () => {
    const session = setup();
    const world = saved(session);
    world.bankPropTradingEnabled = false;
    session.load(serializeSave(world, STAMP));
    expect(session.drawDiscountWindow("US-financial", 100_001).ok).toBe(true);
    expect(saved(session).centralBanks.US!.netMoneyCreatedLifetime).toBe(100_001);
    const before = session.serialize(STAMP);
    expect(session.drawDiscountWindow("US-financial", 150_000).ok).toBe(false);
    expect(session.serialize(STAMP)).toBe(before);
    session.advance();
    // Source leaves interest unrounded: 100,001 × 8% / 48.
    expect(saved(session).centralBanks.US!.reserveBalance).toBeCloseTo(166.66833333333335, 10);
    const resumed = new GameSession();
    resumed.load(session.serialize(STAMP));
    expect(resumed.repayDiscountWindow("US-financial", 200_000).ok).toBe(true);
    expect(saved(resumed).centralBanks.US!.netMoneyCreatedLifetime).toBe(0);
    expect(saved(resumed).corporations["US-financial"]!.bankCharter!.discountWindowDebt).toBe(0);
  });
  it("resolves margin and a legacy window claim together, burning only recovered estate cash", () => {
    const world = saved(setup());
    const charter = world.corporations["US-financial"]!.bankCharter!;
    const target = Object.values(world.corporations).find(c => c.id !== "US-financial" && c.countryId === "US")!;
    target.sharePrice = 100;
    // Older Native allowed a window draw on an investment charter. Recover
    // that real save shape without making a fresh investment draw legal.
    Object.assign(charter, { charterType: "investment", cashReserves: 400, npcDeposits: 0, totalLoans: 0, panicTurns: 4,
      cbMarginDebt: 900, discountWindowDebt: 100, lastCbMarginTurn: 1, lastDiscountWindowTurn: 1 });
    charter.propBook = [{ asset: "equity", ref: target.id, units: 1, costBasis: 1_800 }];
    charter.propBookMarkValue = 100;
    world.centralBanks.US!.externalBroadMoney = 0;
    world.centralBanks.US!.netMoneyCreatedLifetime = 1_000;
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    session.advance();
    const after = saved(session);
    expect(after.corporations["US-financial"]!.bankCharter).toMatchObject({ status: "failed", cashReserves: 0,
      cbMarginDebt: 0, cbMarginArrears: 0, discountWindowDebt: 0, discountWindowArrears: 0, depositorsResolvedTurn: 1 });
    expect(after.centralBanks.US!.netMoneyCreatedLifetime).toBe(500);
    const resumed = new GameSession();
    resumed.load(session.serialize(STAMP));
    resumed.advance();
    expect(saved(resumed).centralBanks.US!.netMoneyCreatedLifetime).toBe(500);
  });
  it("matches interbank currencies across countries and freezes interbank commands with the prop switch", () => {
    const world = saved(setup());
    world.corporations["UK-financial"]!.bankCharter!.charterType = "investment";
    world.budgets.UK!.currencyCode = "USD";
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    expect(session.lendInterbank("US-financial", "UK-financial", 100_000, 4.8).ok).toBe(true);
    const paused = saved(session);
    paused.bankPropTradingEnabled = false;
    session.load(serializeSave(paused, STAMP));
    const before = session.serialize(STAMP);
    const loanId = paused.interbankLoans[0]!.id;
    expect(session.lendInterbank("US-financial", "UK-financial", 1_000, 4.8).ok).toBe(false);
    expect(session.repayInterbank(loanId, 1_000).ok).toBe(false);
    expect(session.interbankQuote("US-financial").max).toBe(0);
    expect(session.serialize(STAMP)).toBe(before);
    session.advance();
    expect(saved(session).interbankLoans[0]!.lastProcessedTurn).toBeNull();
  });
  it("rejects malformed banking control, debt, ledger, stamp and corridor saves before replacing the live session", () => {
    const session = setup();
    const before = session.serialize(STAMP);
    const corruptions = [
      (raw: RawBankSave) => { raw.world.bankPropTradingEnabled = "false"; },
      (raw: RawBankSave) => { raw.world.corporations["US-financial"]!.bankCharter.cashReserves = null; },
      (raw: RawBankSave) => { raw.world.bankingLaws = { US: { depositCorridor: { minOffset: 2, maxOffset: 1 } } }; },
      (raw: RawBankSave) => { raw.world.corporations["US-financial"]!.bankCharter.cbMarginDebt = -1; },
      (raw: RawBankSave) => { raw.world.corporations["US-financial"]!.bankCharter.lastCbMarginTurn = 0.5; },
      (raw: RawBankSave) => { raw.world.centralBanks.US!.reserveBalance = "cash"; },
      (raw: RawBankSave) => { raw.world.centralBanks.US!.netMoneyCreatedLifetime = null; },
    ];
    for (const corrupt of corruptions) {
      const raw = JSON.parse(before);
      corrupt(raw);
      expect(() => session.load(JSON.stringify(raw))).toThrow();
      expect(session.serialize(STAMP)).toBe(before);
    }
  });
  it("continues a combined deposit, interbank, window, prop and margin book byte-identically after reload", () => {
    const world = saved(setup());
    const lender = world.corporations["US-financial"]!;
    lender.bankCharter!.cashReserves = 2_000_000;
    lender.bankCharter!.depositCeiling = 10_000_000;
    lender.bankCharter!.totalDeposits = 1_000_000;
    const peer = Object.values(world.corporations).find(c => c.countryId === "US" && c.id !== lender.id && !c.bankCharter)!;
    peer.bankCharter = { ...structuredClone(lender.bankCharter!), charterType: "investment", npcDeposits: 0,
      totalDeposits: 0, cashReserves: 200_000, postedCapital: 200_000 };
    const target = Object.values(world.corporations).find(c => c.countryId === "US" && c.id !== lender.id && c.id !== peer.id)!;
    target.sharePrice = 100;
    world.centralBanks.US!.externalBroadMoney = 0;
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    expect(session.act("depositSavings", { amount: 500 }).ok).toBe(true);
    expect(session.act("moveSavings", { holder: lender.id }).ok).toBe(true);
    expect(session.setBankRates(lender.id, -0.5, 0.5).ok).toBe(true);
    expect(session.drawDiscountWindow(lender.id, 100_000).ok).toBe(true);
    expect(session.lendInterbank(lender.id, peer.id, 96_000, 4.8).ok).toBe(true);
    expect(session.openBankPosition(peer.id, "equity", target.id, 960).ok).toBe(true);
    expect(session.drawCbMargin(peer.id, 48_000).ok).toBe(true);
    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize(STAMP));
    for (let i = 0; i < 2; i++) {
      session.advance(); resumed.advance();
      expect(resumed.serialize(STAMP)).toBe(session.serialize(STAMP));
    }
    expect(resumed.closeBankPosition(peer.id, "equity", target.id, 960).ok).toBe(true);
    expect(resumed.repayCbMargin(peer.id, 48_000).ok).toBe(true);
    expect(resumed.repayInterbank(saved(resumed).interbankLoans[0]!.id, 96_000).ok).toBe(true);
    expect(resumed.repayDiscountWindow(lender.id, 100_000).ok).toBe(true);
    const final = saved(resumed);
    expect(final.interbankLoans[0]!.status).toBe("repaid");
    expect(final.corporations[peer.id]!.bankCharter).toMatchObject({ propBook: [], cbMarginDebt: 0, interbankDebt: 0 });
    expect(final.centralBanks.US!.netMoneyCreatedLifetime).toBe(0);
  });
  it("refuses historical projection of banking policies and facility accounting the old reader cannot execute", () => {
    // Isolate the banking guard from the fresh-world SOE and TFP export refusals.
    const world = deserializeSave(gunzipSync(readFileSync(new URL("../../fixtures/v42-1953-US.save.json.gz", import.meta.url))).toString("utf8"));
    for (const key of Object.keys(world.featureFlags) as (keyof typeof world.featureFlags)[]) world.featureFlags[key] = true;
    expect(projectSaveToV42(serializeSave(world, STAMP)).ok).toBe(true);
    for (const edit of [
      (w: WorldState) => { w.bankPropTradingEnabled = false; },
      (w: WorldState) => { w.bankingLaws = { US: { depositCorridor: { minOffset: -3, maxOffset: -1 } } }; },
      (w: WorldState) => { w.centralBanks.US!.reserveBalance = 1; },
      (w: WorldState) => { w.corporations["US-financial"]!.bankCharter!.lastCbMarginTurn = 0; },
    ]) {
      const candidate = structuredClone(world);
      edit(candidate);
      expect(projectSaveToV42(serializeSave(candidate, STAMP)).ok).toBe(false);
    }
  });
  it("excludes investment and foreign-currency charters from savings choices and refuses direct selection atomically", () => {
    const world = saved(setup());
    world.corporations["US-financial"]!.bankCharter!.charterType = "investment";
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    const options = session.view().finance.banks!.map(bank => bank.id);
    expect(options).not.toContain("US-financial");
    expect(options).not.toContain("UK-financial");
    const before = session.serialize(STAMP);
    expect(session.act("moveSavings", { holder: "US-financial" }).ok).toBe(false);
    expect(session.act("moveSavings", { holder: "UK-financial" }).ok).toBe(false);
    expect(session.serialize(STAMP)).toBe(before);
  });
  it("uses modern corridors in a real 1979 world and honors saved country overrides independently", () => {
    const world = createWorld({ era: "1979", countryId: "US", seed: "bank-rates-1979", playerName: "Alex" });
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    expect(session.setBankRates("US-financial", 0.5, 8).ok).toBe(true);
    expect(session.setBankRates("US-financial", 0.51, 8).ok).toBe(false);
    const regulated = saved(session);
    regulated.bankingLaws = { US: { depositCorridor: { minOffset: -3, maxOffset: -1 } } };
    session.load(serializeSave(regulated, STAMP));
    expect(session.setBankRates("US-financial", -1, 0.25).ok).toBe(true);
    const before = session.serialize(STAMP);
    expect(session.setBankRates("US-financial", -0.99, 0.25).ok).toBe(false);
    expect(session.setBankRates("US-financial", -1, 0.24).ok).toBe(false);
    expect(session.setBankRates("US-financial", NaN, 0.25).ok).toBe(false);
    expect(session.serialize(STAMP)).toBe(before);
    const resumed = new GameSession();
    resumed.load(before);
    expect(resumed.serialize(STAMP)).toBe(before);
  });
  it("pays margin before window under liquidity stress and freezes both liabilities when banking is disabled", () => {
    const world = saved(setup());
    const target = Object.values(world.corporations).find(c => c.id !== "US-financial" && c.countryId === "US")!;
    target.sharePrice = 100;
    const charter = world.corporations["US-financial"]!.bankCharter!;
    Object.assign(charter, { charterType: "universal", npcDeposits: 0, cashReserves: 40,
      cbMarginDebt: 100_000, discountWindowDebt: 100_001, propBookMarkValue: 1_000_000 });
    charter.propBook = [{ asset: "equity", ref: target.id, units: 10_000, costBasis: 1_000_000 }];
    world.centralBanks.US!.externalBroadMoney = 0;
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    session.advance();
    const charged = saved(session);
    expect(charged.centralBanks.US!.reserveBalance).toBe(40);
    expect(charged.corporations["US-financial"]!.bankCharter!.cbMarginArrears).toBeCloseTo(95.41666666666666, 10);
    expect(charged.corporations["US-financial"]!.bankCharter!.discountWindowArrears).toBeCloseTo(166.66833333333332, 10);
    charged.featureFlags.banking = false;
    session.load(serializeSave(charged, STAMP));
    const before = session.serialize(STAMP);
    expect(session.setBankRates("US-financial", -1, 1).ok).toBe(false);
    expect(session.drawDiscountWindow("US-financial", 1).ok).toBe(false);
    expect(session.repayDiscountWindow("US-financial", 1).ok).toBe(false);
    expect(session.drawCbMargin("US-financial", 1).ok).toBe(false);
    expect(session.repayCbMargin("US-financial", 1).ok).toBe(false);
    expect(session.openBankPosition("US-financial", "equity", target.id, 1).ok).toBe(false);
    expect(session.serialize(STAMP)).toBe(before);
    session.advance();
    const frozen = saved(session);
    expect(frozen.corporations["US-financial"]!.bankCharter).toEqual(charged.corporations["US-financial"]!.bankCharter);
    expect(frozen.centralBanks.US!.reserveBalance).toBe(40);
  });
});
