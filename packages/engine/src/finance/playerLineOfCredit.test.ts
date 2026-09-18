import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { TURN_PHASES } from "../phases/registry.js";
import { deserializeSave, serializeSave } from "../save.js";
import { playerLineOfCreditPhase } from "./playerLineOfCredit.js";

const OPTS = {
  seed: "loc-phase",
  playerName: "Borrower",
  countryId: "US",
  era: "1953",
} as const;
const RNG = {
  next: () => 0.5,
  int: () => 0,
  pick: <T>(items: T[]) => items[0]!,
};

function fundedWorld() {
  const world = createWorld(OPTS);
  world.player.cash = 10_000;
  world.player.savings = 0;
  world.player.savingsHolder = "centralBank";
  world.centralBanks.US!.primeRate = 5;
  world.player.lineOfCredit = {
    balance: 1000,
    denomination: "USD",
    arrears: 0,
    drawFrozen: false,
  };
  return world;
}

describe("playerLineOfCreditPhase", () => {
  it("accrues denomination-specific interest and pays the scheduled amount from cash", () => {
    const world = fundedWorld();
    playerLineOfCreditPhase.run(world, RNG);

    // Hand math: composite collapses to 0 (no income ledger, small net
    // worth, leverage penalty), so spread is exactly 5. Interest is
    // 1000 * (5 + 5) / 100 / 48 = 2.0833 -> 2.08; scheduled pi is
    // 1002.08 * 0.0040625 = 4.07095 -> 4.07, split 2.08 interest + 1.99
    // principal.
    expect(world.player.lineOfCredit!.arrears).toBe(0);
    expect(world.player.lineOfCredit!.balance).toBe(998.01);
    expect(world.player.cash).toBe(9995.93);
    expect(world.player.lineOfCredit!.drawFrozen).toBe(false);
  });

  it("routes the savings-backed slice through savings exactly once", () => {
    const world = fundedWorld();
    world.player.cash = 1;
    world.player.savings = 10_000;
    const fundsBefore = world.player.funds;

    playerLineOfCreditPhase.run(world, RNG);

    // Scheduled 4.07: 1 from cash, 3.07 overflow from savings. The combined
    // wallet delta equals the payment exactly, so savings is not double
    // counted against any second backing store; campaign funds untouched.
    expect(world.player.cash).toBe(0);
    expect(world.player.savings).toBe(9996.93);
    expect(1 + 10_000 - (world.player.cash + world.player.savings)).toBeCloseTo(
      4.07,
      10,
    );
    expect(world.player.funds).toBe(fundsBefore);
    expect(world.player.lineOfCredit!.balance).toBe(998.01);
  });

  it("grows arrears and freezes the line when the wallet cannot cover the payment", () => {
    const world = fundedWorld();
    world.player.cash = 0;
    world.player.savings = 0;

    playerLineOfCreditPhase.run(world, RNG);

    expect(world.player.lineOfCredit!.balance).toBe(1000);
    expect(world.player.lineOfCredit!.arrears).toBe(2.08);
    expect(world.player.lineOfCredit!.drawFrozen).toBe(true);
  });

  it("recovers and unfreezes once the wallet covers the scheduled payment", () => {
    const world = fundedWorld();
    world.player.cash = 0;
    world.player.savings = 0;
    playerLineOfCreditPhase.run(world, RNG);
    expect(world.player.lineOfCredit!.drawFrozen).toBe(true);

    world.player.cash = 10_000;
    playerLineOfCreditPhase.run(world, RNG);

    // Turn two accrues 2.09 on the 1002.08 obligation (arrears 4.17), then
    // the 4.08 scheduled payment clears all but 0.09 of it. The line is no
    // longer distressed, so it unfreezes even though arrears persist.
    expect(world.player.lineOfCredit!.drawFrozen).toBe(false);
    expect(world.player.lineOfCredit!.arrears).toBe(0.09);
    expect(world.player.lineOfCredit!.balance).toBe(1000);
  });

  it("pays arrears only in io mode with the 2-point surcharge, leaving principal flat", () => {
    const world = fundedWorld();
    world.player.lineOfCredit!.paymentMode = "io";

    playerLineOfCreditPhase.run(world, RNG);

    // Interest at prime 5 + spread 5 + io 2: 1000 * 12 / 100 / 48 = 2.5,
    // scheduled io is arrears only (2.5), so principal never moves.
    expect(world.player.lineOfCredit!.balance).toBe(1000);
    expect(world.player.lineOfCredit!.arrears).toBe(0);
    expect(world.player.cash).toBe(9997.5);
  });

  it("isolates denominations: a GBP line accrues at the GBP prime from the GBP wallet", () => {
    const world = createWorld(OPTS);
    world.player.cash = 10_000;
    world.centralBanks.US!.primeRate = 1;
    world.centralBanks.UK!.primeRate = 7;
    world.player.currencyBalances = { personal: { GBP: 10_000 } };
    world.player.lineOfCredit = {
      balance: 1000,
      denomination: "GBP",
      arrears: 0,
      drawFrozen: false,
    };

    playerLineOfCreditPhase.run(world, RNG);

    // GBP interest at prime 7 + spread 5: 1000 * 12 / 100 / 48 = 2.5.
    // A USD-prime move must not leak in, and the USD wallet is untouched.
    expect(world.player.lineOfCredit!.arrears).toBe(0);
    expect(world.player.currencyBalances!.personal.GBP).toBeLessThan(10_000);
    expect(world.player.cash).toBe(10_000);
    expect(world.player.savings).toBe(0);

    const gbpOnly = createWorld(OPTS);
    gbpOnly.player.cash = 10_000;
    gbpOnly.centralBanks.US!.primeRate = 9;
    gbpOnly.centralBanks.UK!.primeRate = 7;
    gbpOnly.player.currencyBalances = { personal: { GBP: 10_000 } };
    gbpOnly.player.lineOfCredit = {
      balance: 1000,
      denomination: "GBP",
      arrears: 0,
      drawFrozen: false,
    };
    playerLineOfCreditPhase.run(gbpOnly, RNG);
    expect(gbpOnly.player.currencyBalances!.personal.GBP).toBe(
      world.player.currencyBalances!.personal.GBP,
    );
  });

  it("is deterministic: the same input always produces the same output", () => {
    const first = fundedWorld();
    const second = structuredClone(first);
    playerLineOfCreditPhase.run(first, RNG);
    playerLineOfCreditPhase.run(second, RNG);
    expect(first.player).toEqual(second.player);
  });

  it("survives JSON reload with identical servicing", () => {
    const direct = fundedWorld();
    playerLineOfCreditPhase.run(direct, RNG);

    const reloaded = deserializeSave(serializeSave(fundedWorld()));
    playerLineOfCreditPhase.run(reloaded, RNG);

    expect(reloaded.player).toEqual(direct.player);
  });

  it("no-ops byte-identically on old saves with no line state", () => {
    const world = createWorld(OPTS);
    expect(world.player.lineOfCredit).toBeUndefined();
    const before = JSON.stringify(world.player);
    playerLineOfCreditPhase.run(world, RNG);
    expect(JSON.stringify(world.player)).toBe(before);
    expect(world.player.lineOfCredit).toBeUndefined();
  });

  it("keeps absent line state absent across a full turn", () => {
    const world = createWorld(OPTS);
    advanceTurn(world);
    expect(world.player.lineOfCredit).toBeUndefined();
  });

  it("unfreezes a frozen line with nothing owed, otherwise no-ops", () => {
    const world = createWorld(OPTS);
    world.player.lineOfCredit = {
      balance: 0,
      denomination: "USD",
      arrears: 0,
      drawFrozen: true,
    };
    playerLineOfCreditPhase.run(world, RNG);
    expect(world.player.lineOfCredit.drawFrozen).toBe(false);

    const before = JSON.stringify(world.player);
    playerLineOfCreditPhase.run(world, RNG);
    expect(JSON.stringify(world.player)).toBe(before);
  });

  it("refuses invalid state before mutating anything", () => {
    for (const lineOfCredit of [
      { balance: -1, denomination: "USD", arrears: 0, drawFrozen: false },
      { balance: 100, denomination: "", arrears: 0, drawFrozen: false },
      {
        balance: 100,
        denomination: "USD",
        arrears: Number.NaN,
        drawFrozen: false,
      },
      { balance: 100, denomination: "USD", arrears: 0, drawFrozen: "no" },
      {
        balance: 100,
        denomination: "USD",
        arrears: 0,
        drawFrozen: false,
        paymentMode: "x",
      },
    ]) {
      const world = fundedWorld();
      world.player.lineOfCredit = lineOfCredit as never;
      const before = serializeSave(world);
      expect(() => playerLineOfCreditPhase.run(world, RNG)).toThrow();
      expect(serializeSave(world)).toBe(before);
    }
  });

  it("rejects present-but-invalid line state at the save boundary", () => {
    const world = fundedWorld();
    world.player.lineOfCredit = {
      balance: 1,
      denomination: "USD",
      arrears: 0,
      drawFrozen: false,
    };
    expect(() => deserializeSave(serializeSave(world))).not.toThrow();

    const raw = JSON.parse(serializeSave(world)) as {
      world: { player: { lineOfCredit: { balance: number } } };
    };
    raw.world.player.lineOfCredit.balance = -5;
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow();
  });

  it("refuses at the advanceTurn seam when line state is invalid", () => {
    const world = fundedWorld();
    world.player.lineOfCredit = {
      balance: 100,
      denomination: "USD",
      arrears: 0,
      drawFrozen: false,
      paymentMode: "x",
    } as never;
    expect(() => advanceTurn(world)).toThrow();
  });

  it("services the line through a full advanceTurn", () => {
    const world = fundedWorld();
    advanceTurn(world);
    expect(world.player.lineOfCredit!.balance).toBeLessThan(1000);
    expect(world.player.cash).toBeLessThan(10_000);
  });

  it("runs after bankingTurn and before bankSolvencyTurn in the turn pipeline", () => {
    const names = TURN_PHASES.map((phase) => phase.name);
    expect(names).toContain("playerLineOfCredit");
    expect(names.indexOf("playerLineOfCredit")).toBeGreaterThan(
      names.indexOf("bankingTurn"),
    );
    expect(names.indexOf("playerLineOfCredit")).toBeLessThan(
      names.indexOf("bankSolvencyTurn"),
    );
  });
});
