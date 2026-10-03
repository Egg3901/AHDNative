import { describe, expect, it } from "vitest";
import { PACKS } from "./packs/index.js";

describe("Japan consumption tax source baselines", () => {
  it("matches the pinned Game policy outputs and declared preset fallback lanes", () => {
    // Current Game bfe655d5 source basePolicies: 1953/1979 are zero;
    // 1991 is 3%; 1999/2007 use the 1991 policy lane; 2019/2023 are 10%.
    // The later fallbacks are explicit source preset behavior, not interpolation.
    const expectedByEra = new Map([
      ["1953", 0],
      ["1979", 0],
      ["1991", 3],
      ["1999", 3],
      ["2007", 3],
      ["2019", 10],
      ["2023", 10],
    ]);

    for (const pack of PACKS) {
      const budget = pack.budgets?.find((row) => row.countryId === "JP");
      expect(budget, `${pack.era.id} Japan budget`).toBeDefined();
      expect(budget?.taxRates.salesTax, `${pack.era.id} Japan consumption tax`).toBe(expectedByEra.get(pack.era.id));
    }
  });
});
