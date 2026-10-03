import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { worldBankDeposits } from "./worldDeposits.js";

const OPTS = { seed: "world-deposits", playerName: "P", countryId: "US", era: "1953" };

describe("worldBankDeposits", () => {
  it("keeps legacy pointer balances out of liabilities until their currency read cohort is authoritative", () => {
    const world = createWorld(OPTS);
    const bank = world.corporations["US-financial"]!;
    bank.bankCharter!.npcDeposits = 200;
    world.player.savings = 100;
    world.player.savingsHolder = bank.id;

    expect(worldBankDeposits(world, bank)).toEqual({
      playerDeposits: 100,
      authoritativePlayerDeposits: 0,
      cashBackedDeposits: 200,
    });

    world.savingsAccountsPolicy = { mode: "authoritative", readCurrencies: ["EUR"] };
    expect(worldBankDeposits(world, bank).cashBackedDeposits).toBe(200);
    world.savingsAccountsPolicy.readCurrencies = ["USD"];
    expect(worldBankDeposits(world, bank)).toEqual({
      playerDeposits: 100,
      authoritativePlayerDeposits: 100,
      cashBackedDeposits: 300,
    });

    world.player.savingsHolder = "centralBank";
    expect(worldBankDeposits(world, bank)).toEqual({
      playerDeposits: 0,
      authoritativePlayerDeposits: 0,
      cashBackedDeposits: 200,
    });
  });
});
