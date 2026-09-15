import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog.js";
import { UNAVAILABLE_LAW_INVENTORY, UNAVAILABLE_LAW_SOURCE_REVISION } from "./catalogUnavailableInventory.js";

describe("unavailable law source inventory", () => {
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
      expect(row.prerequisites.length, row.id).toBeGreaterThan(0);
      expect(row.targets.length, row.id).toBeGreaterThan(0);
      expect(row.blockingSystem, row.id).toBe(catalog.blockingSystem);
      expect(row.scope, row.id).toBe(catalog.allowedScope);
    }
  });
});
