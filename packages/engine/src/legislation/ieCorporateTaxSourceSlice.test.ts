import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { getLaw } from "./catalog.js";

describe("IE statutory corporation tax source row", () => {
  it("uses the authored tax option, domestic profit receipt base, and persists a public enactment", () => {
    const world = createWorld({ seed: "ie-corp-tax-285", playerName: "Policy Chair", countryId: "IE", era: "2019", mode: "hos" });
    world.nppAutonomyLevel = "off";
    world.player.actions = 100;
    world.player.nationalInfluence = 30;
    const law = getLaw("ie_corporate_tax_rate");
    expect(law).toMatchObject({ status: "available", kind: "tax", countryId: "IE" });
    expect(law?.taxPolicy?.options).toHaveLength(11);
    expect(law?.targets).toEqual([
      { metricId: "economic.gdpGrowth", weight: 1 },
      { metricId: "economic.unemploymentRate", weight: 0.4 },
      { metricId: "society.socialMobility", weight: -0.3 },
      { metricId: "governance.budgetBalance", weight: -0.4 },
    ]);
    const budget = world.budgets.IE!;
    expect(budget.taxRates.domesticCorporateTax).toBe(12.5);
    const sourceProfitBase = budget.taxBases.domesticCorporateProfits;
    expect(sourceProfitBase).toBe(82_500_000_000);
    expect(budget.revenue.domesticCorporateTax).toBe(Math.round(sourceProfitBase * 0.125));
    const growthBefore = world.nationalMetrics.IE?.["economic.gdpGrowth"]?.value;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_corporate_tax_rate", taxRate: 33 }).ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({ status: "signed", selectedRate: 33 });
    // Game's federal revenue contract is round(tax base × phased rate / 100).
    expect(budget.taxRates.domesticCorporateTax).toBe(13.5);
    expect(budget.revenue.domesticCorporateTax).toBe(Math.round(sourceProfitBase * 0.135));
    expect(budget.surplus).toBe(budget.revenue.total - budget.spending.total);

    const resumed = deserializeSave(serializeSave(world, "2019-01-06T00:00:00.000Z"));
    advanceTurn(world);
    advanceTurn(resumed);
    expect(resumed.budgets.IE?.taxRates).toEqual(world.budgets.IE?.taxRates);
    expect(resumed.budgets.IE?.revenue).toEqual(world.budgets.IE?.revenue);
    expect(resumed.policyLedger).toEqual(world.policyLedger);
    expect(resumed.nationalMetrics.IE?.["economic.gdpGrowth"]).toEqual(world.nationalMetrics.IE?.["economic.gdpGrowth"]);
    expect(world.nationalMetrics.IE?.["economic.gdpGrowth"]?.value).not.toBe(growthBefore);

    // A later enacted option replaces the active tax posture; it does not add
    // a second receipt line for the earlier target.
    const replacementProfitBase = world.budgets.IE!.taxBases.domesticCorporateProfits;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_corporate_tax_rate", taxRate: 15 }).ok).toBe(true);
    expect(world.budgets.IE?.taxRates.domesticCorporateTax).toBe(15);
    expect(world.budgets.IE?.taxRatePhaseIn?.domesticCorporateTax).toBeUndefined();
    expect(world.budgets.IE?.revenue.domesticCorporateTax).toBe(Math.round(replacementProfitBase * 0.15));
    expect(world.budgets.IE?.surplus).toBe(world.budgets.IE?.revenue.total! - world.budgets.IE?.spending.total!);
    const replaced = deserializeSave(serializeSave(world, "2019-01-06T00:00:00.000Z"));
    advanceTurn(world);
    advanceTurn(replaced);
    expect(replaced.budgets.IE?.revenue.domesticCorporateTax).toBe(world.budgets.IE?.revenue.domesticCorporateTax);
    expect(replaced.policyLedger).toEqual(world.policyLedger);
  });
});
