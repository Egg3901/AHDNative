import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { SECTOR_SUBSIDIES_SPENDING_KEY, type Subsidy } from "./subsidyBudget.js";

const OPTS = { seed: "subsidy-cost-test", playerName: "Tester", countryId: "US", era: "1953" } as const;
const US_SUBSIDY: Subsidy = {
  id: "sub-us-wide", countryId: "US", scope: "national", scopeType: "economy_wide", domesticOnly: false, active: true,
};

function line(world: ReturnType<typeof createWorld>, countryId = "US"): number {
  return world.budgets[countryId]!.spending.byCategory[SECTOR_SUBSIDIES_SPENDING_KEY] ?? 0;
}

describe("subsidy cost from live corporations (#39)", () => {
  it("keeps the cost at zero without an active subsidy", () => {
    const world = createWorld(OPTS);
    advanceTurn(world);
    expect(line(world)).toBe(0);
  });

  it("charges the 1953 US budget from current corporation revenue", () => {
    const world = createWorld(OPTS);
    world.subsidies = [US_SUBSIDY];
    advanceTurn(world);
    const revenue = Object.values(world.corporations).filter((corp) => corp.countryId === "US").reduce((sum, corp) => sum + corp.revenue, 0);
    expect(line(world)).toBe(Math.round(revenue * 48 * 0.105));
    expect(line(world)).toBeGreaterThan(0);
  });

  it("honors sector targeting and country isolation", () => {
    const world = createWorld(OPTS);
    world.subsidies = [{ ...US_SUBSIDY, scopeType: "sector", targetSectorType: "energy" }];
    advanceTurn(world);
    const revenue = Object.values(world.corporations).filter((corp) => corp.countryId === "US" && corp.sectorType === "energy").reduce((sum, corp) => sum + corp.revenue, 0);
    expect(line(world)).toBe(Math.round(revenue * 48 * 0.105));
    expect(line(world, "UK")).toBe(0);
  });

  it("refuses lossy v42 projection with an active subsidy", () => {
    const world = createWorld(OPTS);
    world.subsidies = [US_SUBSIDY];
    const result = projectSaveToV42(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(result.ok).toBe(false);
  });

  it("persists subsidy state and its computed spending line", () => {
    const world = createWorld(OPTS);
    world.subsidies = [US_SUBSIDY];
    advanceTurn(world);
    const restored = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(restored.subsidies).toEqual([US_SUBSIDY]);
    expect(line(restored)).toBe(line(world));
  });
});
