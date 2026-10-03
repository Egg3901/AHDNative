import { describe, expect, it } from "vitest";
import { calculateJPRegionalBudget } from "./jpRegionalBudget.js";

describe("Japan regional budget source formula", () => {
  const sourceInput = {
    residentTaxRate: 0.1,
    fixedAssetTaxRate: 0.014,
    nationalGrantPerCapita: 170_000,
    regionPopulation: 5_200_000,
    medianIncome: 3_500_000,
    propertyValueBase: 8_000_000,
    nationalPopulation: 126_000_000,
    ministerAllocation: null,
  } as const;

  it("matches the independently executed Game Hokkaido source vector", () => {
    expect(calculateJPRegionalBudget(sourceInput)).toEqual({
      residentTaxRevenue: 1_820_000_000_000,
      fixedAssetTaxRevenue: 582_400_000_000,
      nationalGrant: 2_677_500_000_000,
      totalBudget: 5_079_900_000_000,
    });
  });

  it("uses an explicit minister allocation in place of the equal eighth", () => {
    expect(calculateJPRegionalBudget({
      ...sourceInput,
      ministerAllocation: 5_000_000_000_000,
    })).toEqual({
      residentTaxRevenue: 1_820_000_000_000,
      fixedAssetTaxRevenue: 582_400_000_000,
      nationalGrant: 5_000_000_000_000,
      totalBudget: 7_402_400_000_000,
    });
  });
});
