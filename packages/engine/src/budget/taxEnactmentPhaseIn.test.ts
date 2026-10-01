import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { fiscalBaseGrowthPhase } from "./phases.js";
import { advanceCalendarPhase } from "../phases/advanceCalendar.js";
import { applyBillEffects } from "../legislation/billLifecycle.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { createWorld } from "../world.js";

describe("federal tax enactment phase-in uses one source step per turn", () => {
  it("steps at signing, skips the same-turn fiscal tail, then resumes after save/reload", () => {
    const world = createWorld({ seed: "ie-tax-phase-order", playerName: "P", countryId: "IE", era: "1991" });
    world.governments.IE!.status = "formed";
    world.player.mode = "hos";
    world.player.actions = 100;
    world.player.nationalInfluence = 5;
    expect(world.budgets.IE?.taxRates.salesTax).toBe(21);
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 25 }).ok).toBe(true);

    // AHDGame 01797b2708 `billEnactment.ts:194-195` calls stepTaxRate and
    // `:241-242` stores the target. For 21→25 the independent source witness is
    // therefore rate22 with target25 at signing, before the next treasury turn.
    applyBillEffects(world, world.bills.at(-1)!);
    expect(world.budgets.IE?.taxRates.salesTax).toBe(22);
    expect(world.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(25);

    const rng = rngFromSeed("ie-tax-phase-order");
    fiscalBaseGrowthPhase.run(world, rng);
    expect(world.budgets.IE?.taxRates.salesTax).toBe(22);
    expect(world.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(25);

    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    advanceCalendarPhase.run(restored, rng);
    fiscalBaseGrowthPhase.run(restored, rng);
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(23);
    expect(restored.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(25);
    advanceCalendarPhase.run(restored, rng);
    fiscalBaseGrowthPhase.run(restored, rng);
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(24);
    expect(restored.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(25);
    advanceCalendarPhase.run(restored, rng);
    fiscalBaseGrowthPhase.run(restored, rng);
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(25);
    expect(restored.budgets.IE?.taxRatePhaseIn?.salesTax).toBeUndefined();
  });
});
