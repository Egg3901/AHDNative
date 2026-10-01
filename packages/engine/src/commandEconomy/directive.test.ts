import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";

const OPTIONS = { seed: "command-directive-public-flow", playerName: "P", countryId: "RU", era: "1953", mode: "hos" } as const;

describe("command-economy Gosbank directive player flow (#94)", () => {
  it("queues a country-scoped directive, persists it, then changes marketization through the source policy stance", () => {
    const controlled = createWorld(OPTIONS);
    const baseline = createWorld(OPTIONS);
    const before = controlled.commandEconomy.RU!;
    const actionPointsBefore = controlled.player.actions;

    const result = executeAction(controlled, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.1,
      budgetSoftness: 0.1,
    });

    expect(result.ok).toBe(true);
    expect(controlled.player.actions).toBe(actionPointsBefore);
    expect(before.creditAggressiveness).toBe(0.55);
    expect(before.budgetSoftness).toBe(0.85);
    expect(before.pendingDirectives).toEqual([
      expect.objectContaining({
        countryId: "RU",
        creditAggressiveness: 0.1,
        budgetSoftness: 0.1,
        proposedTurn: 0,
        effectiveTurn: 1,
      }),
    ]);

    const resumed = deserializeSave(serializeSave(controlled, "2026-10-01T00:00:00.000Z"));
    advanceTurn(resumed);
    advanceTurn(baseline);

    expect(resumed.commandEconomy.RU!.pendingDirectives).toEqual([]);
    expect(resumed.commandEconomy.RU!.creditAggressiveness).toBe(0.1);
    expect(resumed.commandEconomy.RU!.budgetSoftness).toBe(0.1);
    // Source policy stance weights Gosbank posture 0.4 and marketization drift
    // weights policy stance 0.12. Moving both controls from (.55,.85) to
    // (.1,.1) changes the stance by +0.48, hence this turn's drift by +0.0576.
    expect(resumed.commandEconomy.RU!.marketizationLevel - baseline.commandEconomy.RU!.marketizationLevel).toBeCloseTo(0.0576, 10);
  });

  it("rejects command directives for a market country and invalid Gosbank ranges", () => {
    const market = createWorld({ ...OPTIONS, countryId: "US" });
    expect(executeAction(market, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.5,
    }).ok).toBe(false);

    const command = createWorld(OPTIONS);
    const before = JSON.stringify(command.commandEconomy.RU);
    const rejected = executeAction(command, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 1.1,
    });
    expect(rejected.ok).toBe(false);
    expect(JSON.stringify(command.commandEconomy.RU)).toBe(before);

    const career = createWorld({ ...OPTIONS, mode: "career" });
    const careerActions = career.player.actions;
    expect(executeAction(career, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.5,
    }).ok).toBe(false);
    expect(career.player.actions).toBe(careerActions);
  });

  it("expires a queued posture if the country leaves the planned regime before it resolves", () => {
    const world = createWorld(OPTIONS);
    expect(executeAction(world, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.1,
    }).ok).toBe(true);
    world.commandEconomy.RU!.marketizationLevel = 70;

    advanceTurn(world);

    expect(world.commandEconomy.RU!.pendingDirectives).toEqual([]);
    expect(world.commandEconomy.RU!.creditAggressiveness).toBe(0.55);
  });
});
