import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { mandateFromLocals } from "./actions.js";

describe("bargaining law support input", () => {
  it("feeds the enacted country-budget union-law bias into the led union's mandate", () => {
    const world = createWorld({
      era: "1953",
      countryId: "US",
      seed: "union-bargaining-law-support-source-contract",
      playerName: "Union Leader",
    });
    const union = world.unions["US-manufacturing"]!;
    union.ownerType = "player";
    union.ownerId = "player";
    const locals = Object.values(corporateSectorAssets(world)).filter(
      (asset) => asset.representingUnionId === union.id,
    );
    expect(locals.length).toBeGreaterThan(0);

    // Game's FederalBudget.unionLawBias is read directly by
    // commands/bargaining.ts:bargainingMacroInputs; undefined means neutral.
    world.budgets.US!.unionLawBias = 25;
    const mandate = mandateFromLocals(world, union, locals, union.treasury);
    expect(mandate.lawSupport).toBe(75);

    delete world.budgets.US!.unionLawBias;
    expect(mandateFromLocals(world, union, locals, union.treasury).lawSupport).toBe(50);
  });
});
