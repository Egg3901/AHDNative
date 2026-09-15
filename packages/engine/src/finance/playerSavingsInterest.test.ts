import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { playerSavingsInterestPhase } from "./playerSavingsInterest.js";

const OPTS = { seed: "savings-phase", playerName: "Saver", countryId: "US", era: "1953" } as const;
const RNG = { next: () => 0.5, int: () => 0, pick: <T>(items: T[]) => items[0]! };

describe("playerSavingsInterestPhase", () => {
  it("accrues central-bank interest each turn and credits it on turn 12", () => {
    const world = createWorld(OPTS);
    world.player.savings = 48_000;
    world.player.savingsHolder = "centralBank";
    world.centralBanks.US!.primeRate = 5;
    world.countries.US!.economy.inflationRate = 0.02;

    world.meta.turn = 11;
    playerSavingsInterestPhase.run(world, RNG);
    expect(world.player.savings).toBe(48_000);
    expect(world.player.pendingSavingsInterest).toBe(15);

    world.meta.turn = 12;
    playerSavingsInterestPhase.run(world, RNG);
    expect(world.player.savings).toBe(48_030);
    expect(world.player.pendingSavingsInterest).toBe(0);
    expect(world.player.savingsInterestEarnedLifetime).toBe(30);
  });

  it("does not double-credit savings held by a private bank", () => {
    const world = createWorld(OPTS);
    world.player.savings = 48_000;
    world.player.savingsHolder = "US-bank";
    world.meta.turn = 12;

    playerSavingsInterestPhase.run(world, RNG);

    expect(world.player.savings).toBe(48_000);
    expect(world.player.pendingSavingsInterest).toBeUndefined();
  });

  it("preserves pending accrual across JSON reload", () => {
    const world = createWorld(OPTS);
    world.player.savings = 48_000;
    world.player.savingsHolder = "centralBank";
    world.centralBanks.US!.primeRate = 5;
    world.countries.US!.economy.inflationRate = 0.02;
    world.meta.turn = 5;
    playerSavingsInterestPhase.run(world, RNG);

    const loaded = deserializeSave(serializeSave(world));

    expect(loaded.player.pendingSavingsInterest).toBe(15);
    expect(loaded.player.savings).toBe(48_000);
  });
});
