import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { promoteSecededBudget } from "./promoteSecededBudget.js";

describe("source secession national budget promotion", () => {
  it("uses post-fanout country GDP weights, conserves magnitudes, and is idempotent", () => {
    const world = createWorld({ era: "1953", countryId: "UK", playerName: "Tester", seed: "secession-budget-promotion" });
    const remainder = Object.values(world.regions).find((region) => region.countryId === "UK")!;
    world.regions = {
      [remainder.id]: { ...remainder, gdp: 80 },
      SCO: { id: "SCO", countryId: "SCO", name: "Scotland", population: 20, gdp: 20, houseSeats: 1, senateSeats: 0 },
    };
    const sourceBefore = structuredClone(world.budgets.UK!);
    const scaled = <T extends object>(record: T, weight: number) => Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, value * weight]),
    );

    promoteSecededBudget(world, "UK", "SCO");

    expect(world.budgets.SCO).toMatchObject({
      countryId: "SCO",
      gdp: sourceBefore.gdp * 0.2,
      population: sourceBefore.population,
      currencyCode: sourceBefore.currencyCode,
      taxRates: sourceBefore.taxRates,
      economicFactors: sourceBefore.economicFactors,
      debt: { ...sourceBefore.debt, principal: sourceBefore.debt.principal * 0.2 },
      revenue: scaled(sourceBefore.revenue, 0.2),
      taxBases: scaled(sourceBefore.taxBases, 0.2),
      spending: {
        ...sourceBefore.spending,
        byCategory: Object.fromEntries(Object.entries(sourceBefore.spending.byCategory).map(([key, value]) => [key, value * 0.2])),
        stateGrants: sourceBefore.spending.stateGrants * 0.2,
        debtInterest: sourceBefore.spending.debtInterest * 0.2,
        total: sourceBefore.spending.total * 0.2,
      },
    });
    expect(world.budgets.UK!.gdp).toBeCloseTo(sourceBefore.gdp * 0.8, 8);
    expect(world.budgets.UK!.revenue.total).toBeCloseTo(sourceBefore.revenue.total * 0.8, 8);
    expect(world.budgets.SCO!.gdp + world.budgets.UK!.gdp).toBeCloseTo(sourceBefore.gdp, 8);
    expect(world.budgets.SCO!.revenue.total + world.budgets.UK!.revenue.total).toBeCloseTo(sourceBefore.revenue.total, 8);

    const afterFirst = structuredClone(world.budgets);
    promoteSecededBudget(world, "UK", "SCO");
    expect(world.budgets).toEqual(afterFirst);
  });
});
