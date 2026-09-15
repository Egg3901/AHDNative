import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog.js";
import { UNAVAILABLE_LAW_INVENTORY, UNAVAILABLE_LAW_SOURCE_REVISION } from "./catalogUnavailableInventory.js";

describe("unavailable law source inventory", () => {
  it("matches the pinned source vector independently of the Native catalog", () => {
    expect(UNAVAILABLE_LAW_INVENTORY).toHaveLength(269);
    expect(Object.fromEntries(["JP", "DE", "IE", "CN", "BR", "US", "UK", "RU", "DD"].map((countryId) => [
      countryId,
      UNAVAILABLE_LAW_INVENTORY.filter((row) => row.countryId === countryId).length,
    ]))).toEqual({ JP: 63, DE: 60, IE: 58, CN: 62, BR: 14, US: 9, UK: 1, RU: 1, DD: 1 });
    for (const id of ["de_trade_tax", "cn_provincial_resource_tax", "jp_resident_tax", "jp_fixed_asset_tax"]) {
      expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === id), id).toMatchObject({
        nativeScope: "regional",
        sourceScope: "state",
        taxRateChange: { scope: "state" },
        blockingSystem: "budget/taxRateLadder",
      });
    }
    expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === "de_trade_tax")?.authoredRateOptions.map((option) => option.rate)).toEqual([200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600]);
    expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === "cn_provincial_resource_tax")?.authoredRateOptions.map((option) => option.rate)).toEqual([0, 1, 2, 4, 5, 6, 8, 10, 12, 16, 20]);
    const taxes = UNAVAILABLE_LAW_INVENTORY.filter((row) => row.taxRateChange !== null);
    expect(taxes).toHaveLength(41);
    for (const tax of taxes) {
      expect(tax.authoredRateOptions.length, tax.id).toBeGreaterThan(1);
      expect(tax.blockingSystem, tax.id).toBe("budget/taxRateLadder");
    }
  });

  it("accounts for every unavailable player catalog row exactly once", () => {
    const expected = CATALOG.filter((entry) => entry.status === "unavailable").map((entry) => entry.id).sort();
    const actual = UNAVAILABLE_LAW_INVENTORY.map((entry) => entry.id).slice().sort();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it("names source provenance, eligibility prerequisites, effects, and the real blocker", () => {
    expect(UNAVAILABLE_LAW_SOURCE_REVISION).toBe("e364c04954ed628beef73a993a8e9e156650a31e");
    for (const row of UNAVAILABLE_LAW_INVENTORY) {
      const catalog = CATALOG.find((entry) => entry.id === row.id)!;
      expect(row.sourcePath, row.id).toMatch(/^(src\/lib\/(seeds|politicalLegislation\/laws)\/|NO_AHDGAME_SOURCE_MATCH$)/);
      expect(row.nativeScope, row.id).toBe(catalog.allowedScope);
      expect(row.blockingSystem, row.id).toBe(catalog.blockingSystem);
      if (row.sourceMatch === "matched") {
        expect(row.sourcePath, row.id).not.toBe("NO_AHDGAME_SOURCE_MATCH");
        expect(row.sourceScope, row.id).not.toBeNull();
        expect(row.prerequisites.length, row.id).toBeGreaterThan(0);
        expect(row.authoredTargets.length, row.id).toBeGreaterThan(0);
      } else {
        expect(row.sourcePath, row.id).toBe("NO_AHDGAME_SOURCE_MATCH");
        expect(row.sourceScope, row.id).toBeNull();
        expect(row.authoredTargets, row.id).toEqual([]);
        expect(row.prerequisites, row.id).toEqual([]);
      }
    }
    const unmatched = UNAVAILABLE_LAW_INVENTORY.filter((row) => row.sourceMatch === "unmatched");
    expect(unmatched).toHaveLength(5);
    expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === "dd.economy.workerSecurity.primary")).toMatchObject({
      nativeScope: "national",
      sourceScope: "both",
    });
  });
});
