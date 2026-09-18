import { describe, expect, it, beforeEach } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { getTraceBonds, resetBondIdSequenceForTests } from "./bondTurn.js";
import { resolveBondCurrency } from "./denomination.js";
import { executeAction } from "../actions/execute.js";
import type { Bond } from "./types.js";

/**
 * #306: atomic foreign-currency sovereign bond trading.
 *
 * Pinned authority: AHDGame e364c04954ed628beef73a993a8e9e156650a31e
 *  - src/app/api/bonds/[bondId]/buy/route.ts (character path debits
 *    atomicallyDebitCharacterCash in bondCurrency; insufficient refuses 400;
 *    failed reserve refunds the debit)
 *  - src/app/api/bonds/[bondId]/sell/route.ts (credits buildPersonalBalanceInc
 *    in bondCurrency; proceeds/proceedsCurrency echoed in bondCurrency)
 *  - src/lib/bonds/bondHolderOps.ts reserveBondUnitsForHolder (float/holder
 *    move is one atomic update with a publicFloat >= units guard)
 *
 * Solo adaptation (no FX system, no market pool, no corp holders): the debit /
 * credit balance is named by resolveBondCurrency (explicit code, else issuing
 * country currency, else USD — same resolver as the #305 coupon/maturity
 * path). Home-currency bonds move player.cash; foreign bonds move
 * currencyBalances.personal[ccy]. Corporate lifecycle stays out of scope.
 */

const OPTS = { seed: "sovereign-forex-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

beforeEach(() => resetBondIdSequenceForTests());

function seedBond(id: string, overrides: Partial<Bond> = {}): Bond {
  return {
    id,
    issuerType: "sovereign",
    countryId: "UK",
    issuerName: "United Kingdom",
    faceValue: 1000,
    couponRate: 4,
    maturityTurns: 48,
    issuedAtTurn: 0,
    maturityTurn: 48,
    marketPrice: 1.0,
    totalIssued: 1_000_000,
    publicFloat: 990,
    holders: [],
    matured: false,
    defaulted: false,
    defaultedAtTurn: null,
    currencyCode: "GBP",
    createdAt: "1953-01-01T00:00:00.000Z",
    updatedAt: "1953-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function unitLedger(world: ReturnType<typeof createWorld>, bondId: string): number {
  const bond = world.bonds[bondId]!;
  return bond.holders.reduce((s, h) => s + h.units, 0) + bond.publicFloat;
}

describe("exact currency selection", () => {
  it("foreign buy debits the GBP balance and leaves home cash untouched", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 50_000;
    world.player.currencyBalances = { personal: { GBP: 10_000 } };
    world.bonds["fx-buy"] = seedBond("fx-buy", { marketPrice: 0.98 });

    const res = executeAction(world, "player", "buyBond", { bondId: "fx-buy", units: 5 });
    expect(res.ok).toBe(true);
    const notional = Math.round(5 * 1000 * 0.98 * 100) / 100;
    expect(world.player.cash).toBe(50_000);
    expect(world.player.currencyBalances?.personal.GBP).toBe(10_000 - notional);
    expect(world.bonds["fx-buy"]!.holders.find((h) => h.holderId === "player")!.units).toBe(5);
    expect(world.bonds["fx-buy"]!.publicFloat).toBe(985);
  });

  it("foreign sell credits the GBP balance and leaves home cash untouched", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 7_500;
    world.player.currencyBalances = { personal: { GBP: 1_000 } };
    world.bonds["fx-sell"] = seedBond("fx-sell", {
      marketPrice: 1.02,
      holders: [{ holderId: "player", units: 4 }],
      publicFloat: 996,
    });

    const res = executeAction(world, "player", "sellBond", { bondId: "fx-sell", units: 4 });
    expect(res.ok).toBe(true);
    const notional = Math.round(4 * 1000 * 1.02 * 100) / 100;
    expect(world.player.cash).toBe(7_500);
    expect(world.player.currencyBalances?.personal.GBP).toBe(1_000 + notional);
    expect(world.bonds["fx-sell"]!.holders.find((h) => h.holderId === "player")).toBeUndefined();
    expect(world.bonds["fx-sell"]!.publicFloat).toBe(1000);
  });

  it("plentiful home cash does not fund a foreign purchase", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 9_999_999;
    world.bonds["fx-cash"] = seedBond("fx-cash");
    const before = JSON.stringify({ cash: world.player.cash, balances: world.player.currencyBalances, bonds: world.bonds });

    const res = executeAction(world, "player", "buyBond", { bondId: "fx-cash", units: 1 });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/GBP/);
    expect(JSON.stringify({ cash: world.player.cash, balances: world.player.currencyBalances, bonds: world.bonds })).toBe(before);
  });

  it("domestic purchase still settles in home cash when a foreign balance exists", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 20_000;
    world.player.currencyBalances = { personal: { GBP: 3_000 } };
    world.bonds["us-buy"] = seedBond("us-buy", { countryId: "US", issuerName: "US", currencyCode: "USD", marketPrice: 1.0 });

    const res = executeAction(world, "player", "buyBond", { bondId: "us-buy", units: 2 });
    expect(res.ok).toBe(true);
    expect(world.player.cash).toBe(18_000);
    expect(world.player.currencyBalances?.personal.GBP).toBe(3_000);
  });

  it("legacy bond without an explicit code resolves to the issuing country currency", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 40_000;
    world.player.currencyBalances = { personal: { GBP: 2_500 } };
    world.bonds["fx-legacy"] = seedBond("fx-legacy", { currencyCode: "" });
    expect(resolveBondCurrency(world, world.bonds["fx-legacy"]!)).toBe("GBP");

    const res = executeAction(world, "player", "buyBond", { bondId: "fx-legacy", units: 1 });
    expect(res.ok).toBe(true);
    expect(world.player.cash).toBe(40_000);
    expect(world.player.currencyBalances?.personal.GBP).toBe(1_500);
  });
});

describe("insufficient denomination refusal", () => {
  it("refuses without changing cash, balances, holdings, or public float", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 60_000;
    world.player.currencyBalances = { personal: { GBP: 100 } };
    world.bonds["fx-poor"] = seedBond("fx-poor", { marketPrice: 1.0 });
    const before = JSON.stringify({ cash: world.player.cash, balances: world.player.currencyBalances, bonds: world.bonds });

    const res = executeAction(world, "player", "buyBond", { bondId: "fx-poor", units: 1 });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/Not enough GBP balance/);
    expect(JSON.stringify({ cash: world.player.cash, balances: world.player.currencyBalances, bonds: world.bonds })).toBe(before);
  });

  it("missing foreign balance refuses and does not create currencyBalances", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 60_000;
    world.bonds["fx-missing"] = seedBond("fx-missing", { marketPrice: 1.0 });

    const res = executeAction(world, "player", "buyBond", { bondId: "fx-missing", units: 1 });
    expect(res.ok).toBe(false);
    expect(world.player.cash).toBe(60_000);
    expect(world.player.currencyBalances).toBeUndefined();
    expect(world.bonds["fx-missing"]!.holders).toEqual([]);
    expect(world.bonds["fx-missing"]!.publicFloat).toBe(990);
  });

  it("repeated refusal is idempotent: same error, same untouched state", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 60_000;
    world.player.currencyBalances = { personal: { GBP: 50 } };
    world.bonds["fx-repeat"] = seedBond("fx-repeat", { marketPrice: 1.0 });
    const before = JSON.stringify({ cash: world.player.cash, balances: world.player.currencyBalances, bonds: world.bonds });

    const first = executeAction(world, "player", "buyBond", { bondId: "fx-repeat", units: 1 });
    const second = executeAction(world, "player", "buyBond", { bondId: "fx-repeat", units: 1 });
    expect(first.ok).toBe(false);
    expect(second).toEqual(first);
    expect(JSON.stringify({ cash: world.player.cash, balances: world.player.currencyBalances, bonds: world.bonds })).toBe(before);
  });

  it("overselling a foreign holding refuses without touching the balance or float", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.currencyBalances = { personal: { GBP: 200 } };
    world.bonds["fx-over"] = seedBond("fx-over", { holders: [{ holderId: "player", units: 1 }], publicFloat: 999 });
    const before = JSON.stringify({ balances: world.player.currencyBalances, bonds: world.bonds });

    const res = executeAction(world, "player", "sellBond", { bondId: "fx-over", units: 2 });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/only own 1/);
    expect(JSON.stringify({ balances: world.player.currencyBalances, bonds: world.bonds })).toBe(before);
  });
});

describe("rounding and conservation", () => {
  it("rounds the full order once and moves units float-to-holder exactly", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.currencyBalances = { personal: { GBP: 100_000 } };
    world.bonds["fx-round"] = seedBond("fx-round", { marketPrice: 1.0237, totalIssued: 1_000_000, publicFloat: 990 });
    const unitsBefore = unitLedger(world, "fx-round");

    const res = executeAction(world, "player", "buyBond", { bondId: "fx-round", units: 3 });
    expect(res.ok).toBe(true);
    // Single rounding of the whole order, not per-unit accumulation.
    const notional = Math.round(3 * 1000 * 1.0237 * 100) / 100;
    expect(notional).toBe(3071.1);
    expect(world.player.currencyBalances?.personal.GBP).toBeCloseTo(100_000 - notional, 8);
    expect(unitLedger(world, "fx-round")).toBe(unitsBefore);
    expect(getTraceBonds(world).find((t) => t.id === "fx-round")!.playerUnits).toBe(3);
  });

  it("buy then sell at the same price restores the exact starting balance", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    const cashBefore = world.player.cash;
    world.player.currencyBalances = { personal: { GBP: 25_000 } };
    world.bonds["fx-roundtrip"] = seedBond("fx-roundtrip", { marketPrice: 0.9973 });

    expect(executeAction(world, "player", "buyBond", { bondId: "fx-roundtrip", units: 6 }).ok).toBe(true);
    expect(executeAction(world, "player", "sellBond", { bondId: "fx-roundtrip", units: 6 }).ok).toBe(true);
    expect(world.player.currencyBalances?.personal.GBP).toBe(25_000);
    expect(world.player.cash).toBe(cashBefore);
    expect(world.bonds["fx-roundtrip"]!.holders.find((h) => h.holderId === "player")).toBeUndefined();
    expect(unitLedger(world, "fx-roundtrip")).toBe(990);
  });
});

describe("save and reload across foreign trades", () => {
  it("persists denomination balances and holdings through JSON save/reload and keeps trading", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 33_333;
    world.player.currencyBalances = { personal: { GBP: 12_000 } };
    world.bonds["fx-save"] = seedBond("fx-save", { marketPrice: 1.01 });

    expect(executeAction(world, "player", "buyBond", { bondId: "fx-save", units: 4 }).ok).toBe(true);
    const notional = Math.round(4 * 1000 * 1.01 * 100) / 100;
    const reloaded = deserializeSave(serializeSave(world));
    expect(reloaded.player.cash).toBe(33_333);
    expect(reloaded.player.currencyBalances?.personal.GBP).toBe(12_000 - notional);
    expect(reloaded.bonds["fx-save"]!.holders.find((h) => h.holderId === "player")!.units).toBe(4);

    reloaded.player.actions = 10;
    const sell = executeAction(reloaded, "player", "sellBond", { bondId: "fx-save", units: 1 });
    expect(sell.ok).toBe(true);
    const proceeds = Math.round(1 * 1000 * 1.01 * 100) / 100;
    expect(reloaded.player.currencyBalances?.personal.GBP).toBe(12_000 - notional + proceeds);
    expect(reloaded.player.cash).toBe(33_333);
    expect(reloaded.bonds["fx-save"]!.publicFloat).toBe(987);
  });

  it("an old save without currencyBalances still refuses foreign buys and trades domestic in cash", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world)) as { world: Record<string, unknown> };
    delete (raw.world["player"] as Record<string, unknown>)["currencyBalances"];
    const legacy = deserializeSave(JSON.stringify(raw));
    expect(legacy.player.currencyBalances).toBeUndefined();
    legacy.player.actions = 10;
    legacy.bonds["fx-old"] = seedBond("fx-old", { marketPrice: 1.0 });
    legacy.bonds["us-old"] = seedBond("us-old", { countryId: "US", issuerName: "US", currencyCode: "USD", marketPrice: 1.0 });

    const foreign = executeAction(legacy, "player", "buyBond", { bondId: "fx-old", units: 1 });
    expect(foreign.ok).toBe(false);
    expect(legacy.player.currencyBalances).toBeUndefined();

    const cashBefore = legacy.player.cash;
    const domestic = executeAction(legacy, "player", "buyBond", { bondId: "us-old", units: 1 });
    expect(domestic.ok).toBe(true);
    expect(legacy.player.cash).toBe(cashBefore - 1000);
  });
});
