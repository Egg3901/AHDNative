import { describe, expect, it } from "vitest";
import { BUDGETS_1991 } from "../../../content/src/packs/budgets1991.js";
import { BUDGETS_2019 } from "../../../content/src/packs/budgets2019.js";
import { calculateBudgetRevenue } from "./revenue.js";
import { createWorld } from "../world.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";

describe("German solidarity surcharge budget line", () => {
  it("uses the source income-tax-receipt basis and preserves total revenue", () => {
    const seed = BUDGETS_2019.find((budget) => budget.countryId === "DE")!;
    const taxableIncome = seed.gdp * seed.taxBaseRatios.taxableIncome;
    const bases = {
      taxableIncome,
      domesticCorporateProfits: seed.gdp * seed.taxBaseRatios.corporateProfits * 0.75,
      foreignCorporateProfits: seed.gdp * seed.taxBaseRatios.corporateProfits * 0.25,
      wagesAndSalaries: seed.gdp * seed.taxBaseRatios.wagesAndSalaries,
      importValue: seed.gdp * seed.taxBaseRatios.importValue,
      taxableSales: seed.gdp * seed.taxBaseRatios.taxableSales,
    };
    const revenue = calculateBudgetRevenue(seed.taxRates, bases, seed.otherRevenue);

    // Independently executed AHDGame cb66acdf's calculateFederalRevenue with
    // this exact source seed vector: income tax 869.4bn EUR, 5.5% Soli =
    // 47.817bn EUR; total receipts 1,904.967bn EUR.
    expect(revenue.incomeTax).toBe(869_400_000_000);
    expect(revenue.solidaritySurcharge).toBe(47_817_000_000);
    expect(revenue.total).toBe(1_904_967_000_000);
  });

  it("seeds authored 1991 and 2019 DE rates and refuses old-reader projection after a real change", () => {
    expect(BUDGETS_1991.find((budget) => budget.countryId === "DE")?.taxRates.solidaritySurcharge).toBe(2);
    expect(BUDGETS_2019.find((budget) => budget.countryId === "DE")?.taxRates.solidaritySurcharge).toBe(5.5);
    expect(BUDGETS_2019.find((budget) => budget.countryId === "US")?.taxRates.solidaritySurcharge).toBeUndefined();

    const world = createWorld({ seed: "de-soli-v42-guard", playerName: "P", countryId: "DE", era: "2019", mode: "hos" });
    const before = world.budgets.DE!.revenue.total;
    expect(world.budgets.DE!.revenue.solidaritySurcharge).toBe(47_817_000_000);
    expect(world.budgets.DE!.revenue.total).toBe(before);
    const projected = projectSaveToV42(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(projected.ok).toBe(false);
    if (projected.ok) throw new Error("An active solidarity surcharge must refuse historical export");
    expect(projected.error).toContain("solidarity surcharge");
    const roundtrip = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(roundtrip.budgets.DE?.taxRates.solidaritySurcharge).toBe(5.5);
    expect(roundtrip.budgets.DE?.revenue.solidaritySurcharge).toBe(47_817_000_000);
  });
});
