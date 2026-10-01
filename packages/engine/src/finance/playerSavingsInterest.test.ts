import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { advanceTurn } from "../engine.js";
import { playerSavingsInterestPhase } from "./playerSavingsInterest.js";

const OPTS = {
  seed: "savings-phase",
  playerName: "Saver",
  countryId: "US",
  era: "1953",
} as const;
const RNG = {
  next: () => 0.5,
  int: () => 0,
  pick: <T>(items: T[]) => items[0]!,
};

describe("playerSavingsInterestPhase", () => {
  it("accrues central-bank interest each turn and credits it on turn 12", () => {
    const world = createWorld(OPTS);
    world.player.savings = 48_000;
    world.player.savingsHolder = "centralBank";
    world.centralBanks.US!.primeRate = 5;
    world.budgets.US!.economicFactors.inflationRate = 2;
    world.countries.US!.economy.inflationRate = 0.02;

    world.meta.turn = 11;
    playerSavingsInterestPhase.run(world, RNG);
    expect(world.player.savings).toBe(48_000);
    expect(world.player.pendingSavingsInterest).toBe(15.31);

    world.meta.turn = 12;
    playerSavingsInterestPhase.run(world, RNG);
    expect(world.player.savings).toBe(48_019.22);
    expect(world.player.pendingSavingsInterest).toBe(0);
    expect(world.player.savingsInterestEarnedLifetime).toBe(19.22);
    expect(world.centralBanks.US!.nationalSavingsBalance).toBe(48_000);

    const loaded = deserializeSave(serializeSave(world));
    expect(loaded.player.pendingSavingsInterest).toBe(0);
    expect(loaded.player.savingsInterestEarnedLifetime).toBe(19.22);
    expect(loaded.centralBanks.US!.nationalSavingsBalance).toBe(48_000);
  });

  it("limits the next turn to one quarter of the persisted prior national pool", () => {
    const world = createWorld(OPTS);
    world.player.savings = 48_000;
    world.player.savingsHolder = "centralBank";
    world.centralBanks.US!.nationalSavingsBalance = 48_000;
    world.centralBanks.US!.primeRate = 5;
    world.budgets.US!.economicFactors.inflationRate = 2;
    world.meta.turn = 11;

    playerSavingsInterestPhase.run(world, RNG);

    // Game interestEligibleBalance(48,000, 48,000) is capped at 12,000.
    // Native source-priced deposit bonus makes the APR 1.53125%; eligible
    // $12,000 / 48 turns rounds to $3.83.
    expect(world.player.pendingSavingsInterest).toBe(3.83);
    expect(world.centralBanks.US!.nationalSavingsBalance).toBe(48_000);

    const loaded = deserializeSave(serializeSave(world));
    expect(loaded.centralBanks.US!.nationalSavingsBalance).toBe(48_000);
    loaded.meta.turn = 12;
    playerSavingsInterestPhase.run(loaded, RNG);
    expect(loaded.player.savings).toBe(48_007.74);
    expect(loaded.centralBanks.US!.nationalSavingsBalance).toBe(48_000);
  });

  it("uses a persisted prior pool after a public turn and save reload", () => {
    const world = createWorld(OPTS);
    world.meta.turn = 10;
    world.centralBankPricingPhaseIn = { startedTurn: 10 };
    world.player.savings = 48_000;
    world.player.savingsHolder = "centralBank";
    world.centralBanks.US!.primeRate = 5;
    world.budgets.US!.economicFactors.inflationRate = 2;
    world.centralBanks.US!.nationalSavingsBalance = 48_000;

    advanceTurn(world);
    expect(world.player.pendingSavingsInterest).toBe(3.83);
    expect(world.centralBanks.US!.nationalSavingsBalance).toBe(48_000);

    const resumed = deserializeSave(serializeSave(world));
    resumed.centralBanks.US!.primeRate = 5;
    resumed.budgets.US!.economicFactors.inflationRate = 2;
    advanceTurn(resumed);
    // Source bonus at turn 12 is .0625pp: eligible $12,000 earns $3.91;
    // the quarterly boundary credits both turns, total $7.74.
    expect(resumed.player.savings).toBe(48_007.74);
    expect(resumed.player.pendingSavingsInterest).toBe(0);
    expect(resumed.centralBanks.US!.nationalSavingsBalance).toBe(48_000);
  });

  it("refuses to project an active pool into the historical reader", () => {
    const world = createWorld(OPTS);
    world.centralBanks.US!.nationalSavingsBalance = 48_000;
    expect(
      projectSaveToV42(serializeSave(world, "2026-10-01T00:00:00.000Z")),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("national savings pool state"),
    });
  });

  it("refuses malformed prior-pool state before the turn phase mutates pricing", () => {
    const world = createWorld(OPTS);
    world.centralBanks.US!.nationalSavingsBalance = Number.NaN;
    const before = JSON.stringify(world);
    expect(() => playerSavingsInterestPhase.run(world, RNG)).toThrow(
      "Invalid national savings pool",
    );
    expect(JSON.stringify(world)).toBe(before);
    expect(() => deserializeSave(serializeSave(world))).toThrow(
      "Invalid national savings pool",
    );
  });

  it("flushes existing pending interest when the boundary accrual rounds to zero", () => {
    const world = createWorld(OPTS);
    world.player.savings = 1;
    world.player.savingsHolder = "centralBank";
    world.player.pendingSavingsInterest = 7;
    world.meta.turn = 12;

    playerSavingsInterestPhase.run(world, RNG);

    expect(world.player.savings).toBe(8);
    expect(world.player.pendingSavingsInterest).toBe(0);
    expect(world.player.savingsInterestEarnedLifetime).toBe(7);
  });

  it("does not accrue central-bank base on an authoritative private-bank account", () => {
    const world = createWorld(OPTS);
    world.player.savings = 48_000;
    world.player.savingsHolder = "US-bank";
    world.meta.turn = 12;
    world.savingsAccountsPolicy = {
      mode: "authoritative",
      readCurrencies: ["USD"],
    };

    playerSavingsInterestPhase.run(world, RNG);

    expect(world.player.savings).toBe(48_000);
    expect(world.player.pendingSavingsInterest).toBeUndefined();
  });

  it("preserves pending accrual across JSON reload", () => {
    const world = createWorld(OPTS);
    world.player.savings = 48_000;
    world.player.savingsHolder = "centralBank";
    world.centralBanks.US!.primeRate = 5;
    world.budgets.US!.economicFactors.inflationRate = 2;
    world.countries.US!.economy.inflationRate = 0.02;
    world.meta.turn = 5;
    playerSavingsInterestPhase.run(world, RNG);

    const loaded = deserializeSave(serializeSave(world));

    expect(loaded.player.pendingSavingsInterest).toBe(15.31);
    expect(loaded.player.savings).toBe(48_000);
  });
});
