import { describe, expect, it } from "vitest";
import { catalogPolicyOptionAnnualCost } from "../policyEffects/budget.js";
import { getLaw } from "./catalog.js";

const SOURCE_OPTIONS = [
  { id: "us_federal_education_funding", costClass: "perCapita", firstCostShare: 0.00449735, target: "education.educationSpending" },
  { id: "us_federal_healthcare_funding", costClass: "perCapita", firstCostShare: 0.0645021, target: "healthcare.uninsuredRate" },
  { id: "us_federal_science_funding", costClass: "gdpFraction", firstCostShare: 0.0045, target: "economic.rdIntensity" },
  { id: "us_federal_spending_stimulus", costClass: "gdpFraction", firstCostShare: 0.00129, target: "economic.unemploymentRate" },
] as const;

describe("source-classified US fiscal law records", () => {
  it("preserves exact source IDs, source option shapes, cost classes, and missing metric blockers", () => {
    const gdp = 27_000_000_000_000;
    const population = 330_000_000;

    for (const source of SOURCE_OPTIONS) {
      const law = getLaw(source.id);
      expect(law).not.toBeNull();
      expect(law).toMatchObject({
        id: source.id,
        countryId: "US",
        status: "unavailable",
        budgetCostClass: source.costClass,
        blockingSystem: expect.stringContaining(source.target),
        targets: expect.arrayContaining([expect.objectContaining({ metricId: source.target })]),
        levels: expect.arrayContaining([expect.objectContaining({ name: expect.any(String) })]),
      });
      expect(law!.levels).toHaveLength(7);
      expect(law!.optionEffectDirections).toEqual([1, 1, 1, 0, -1, -1, -1]);
      if (law!.policyOptionCosts) expect(law!.policyOptionCosts).toHaveLength(7);

      const cost = catalogPolicyOptionAnnualCost(
        law!,
        law!.policyOptionCosts ? `${source.id}_opt_0` : "l0",
        gdp,
        population,
        2023,
      );
      expect(cost).toBeCloseTo(gdp * source.firstCostShare, 2);
    }
  });
});
