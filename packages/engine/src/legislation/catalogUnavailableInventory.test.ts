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
