import { describe, expect, it } from "vitest";
import { INDEX_FUND_DEFINITIONS, seedIndexFundBook } from "./book.js";

describe("source-seeded index-fund catalog", () => {
  it("contains the 46 immutable AHDGame definitions and no invented holdings", () => {
    expect(INDEX_FUND_DEFINITIONS).toHaveLength(46);
    expect(new Set(INDEX_FUND_DEFINITIONS.map((fund) => fund.slug)).size).toBe(46);
    expect(INDEX_FUND_DEFINITIONS.filter((fund) => fund.kind === "broad")).toHaveLength(17);
    expect(INDEX_FUND_DEFINITIONS.filter((fund) => fund.kind === "sector")).toHaveLength(17);
    expect(INDEX_FUND_DEFINITIONS.filter((fund) => fund.kind === "bond")).toHaveLength(12);

    const book = seedIndexFundBook();
    expect(Object.keys(book.funds)).toHaveLength(46);
    expect(book.positions).toHaveLength(46);
    for (const fund of Object.values(book.funds)) {
      expect(fund.quotedNav).toBe(100);
      expect(fund.unitSupply).toBe(500_000);
      expect(fund.reserveUnits).toBe(500_000);
      expect(fund.cashAnchor).toBe(50_000_000);
      expect(fund.targetConstituents).toEqual([]);
      expect(fund.holdings).toEqual({});
    }
  });
});
