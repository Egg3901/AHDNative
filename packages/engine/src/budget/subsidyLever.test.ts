import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { SECTOR_SUBSIDIES_SPENDING_KEY } from "./subsidyBudget.js";

const HOS_OPTS = { seed: "subsidy-lever-test", playerName: "Tester", countryId: "US", era: "1953", mode: "hos" } as const;

function line(world: ReturnType<typeof createWorld>, countryId = "US"): number {
  return world.budgets[countryId]!.spending.byCategory[SECTOR_SUBSIDIES_SPENDING_KEY] ?? 0;
}

function liveRevenue(world: ReturnType<typeof createWorld>, countryId = "US", sector?: string): number {
  return Object.values(world.corporations)
    .filter((corp) => corp.countryId === countryId && (!sector || corp.sectorType === sector))
    .reduce((sum, corp) => sum + corp.revenue, 0);
}

function expectedCost(world: ReturnType<typeof createWorld>, countryId = "US", sector?: string): number {
  return Math.round(liveRevenue(world, countryId, sector) * 48 * 0.105);
}

describe("setSubsidyRate national enact/end lifecycle (#94)", () => {
  it("HoS enact charges the next-turn budget line from live corporation revenue", () => {
    const world = createWorld(HOS_OPTS);
    expect(line(world)).toBe(0);
    const res = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" });
    expect(res.ok).toBe(true);
    expect(world.subsidies).toHaveLength(1);
    expect(world.subsidies[0]).toMatchObject({
      countryId: "US",
      scope: "national",
      scopeType: "economy_wide",
      active: true,
    });
    // Record lands immediately; the cost follows at the turn boundary.
    expect(line(world)).toBe(0);
    advanceTurn(world);
    expect(line(world)).toBe(expectedCost(world));
    expect(line(world)).toBeGreaterThan(0);
    const budget = world.budgets["US"]!;
    expect(budget.surplus).toBe(budget.revenue.total - budget.spending.total);
  });

  it("duplicate enact upserts instead of double-charging", () => {
    const world = createWorld(HOS_OPTS);
    expect(executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" }).ok).toBe(true);
    const second = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.message).toMatch(/already active/);
    expect(world.subsidies).toHaveLength(1);
    advanceTurn(world);
    expect(line(world)).toBe(expectedCost(world));
  });

  it("sector enactment bills only the targeted sector", () => {
    const world = createWorld(HOS_OPTS);
    const res = executeAction(world, "player", "setSubsidyRate", {
      subsidyOp: "enact",
      subsidyScopeType: "sector",
      sectorType: "energy",
    });
    expect(res.ok).toBe(true);
    advanceTurn(world);
    expect(line(world)).toBe(expectedCost(world, "US", "energy"));
  });

  it("unknown sector fails closed with no record and no AP charged", () => {
    const world = createWorld(HOS_OPTS);
    const before = world.player.actions;
    const res = executeAction(world, "player", "setSubsidyRate", {
      subsidyOp: "enact",
      subsidyScopeType: "sector",
      sectorType: "mithril",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/unknown targetSectorType/);
    expect(world.subsidies).toEqual([]);
    expect(world.player.actions).toBe(before);
  });

  it("sector scope without a sector fails closed", () => {
    const world = createWorld(HOS_OPTS);
    const res = executeAction(world, "player", "setSubsidyRate", {
      subsidyOp: "enact",
      subsidyScopeType: "sector",
    });
    expect(res.ok).toBe(false);
    expect(world.subsidies).toEqual([]);
  });

  it("state scope is rejected with the named blocker", () => {
    const world = createWorld(HOS_OPTS);
    const res = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact", subsidyScope: "state" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/national scope only/);
    expect(world.subsidies).toEqual([]);
  });

  it("end deactivates the record and clears the line next turn; ending nothing fails closed", () => {
    const world = createWorld(HOS_OPTS);
    const emptyEnd = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "end" });
    expect(emptyEnd.ok).toBe(false);
    if (!emptyEnd.ok) expect(emptyEnd.error).toMatch(/no active national subsidy/);
    expect(executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" }).ok).toBe(true);
    advanceTurn(world);
    expect(line(world)).toBeGreaterThan(0);
    const end = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "end" });
    expect(end.ok).toBe(true);
    expect(world.subsidies).toHaveLength(1);
    expect(world.subsidies[0]!.active).toBe(false);
    advanceTurn(world);
    expect(line(world)).toBe(0);
    const reactivated = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" });
    expect(reactivated.ok).toBe(true);
    if (reactivated.ok) expect(reactivated.message).toMatch(/Reactivated/);
    expect(world.subsidies).toHaveLength(1);
    advanceTurn(world);
    expect(line(world)).toBe(expectedCost(world));
  });

  it("enactment for another budget country isolates the charge", () => {
    const world = createWorld(HOS_OPTS);
    const res = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact", budgetCountryId: "UK" });
    expect(res.ok).toBe(true);
    expect(world.subsidies[0]).toMatchObject({ countryId: "UK" });
    advanceTurn(world);
    expect(line(world, "US")).toBe(0);
  });

  it("persists the enacted record and its computed line across save/reload", () => {
    const world = createWorld(HOS_OPTS);
    expect(executeAction(world, "player", "setSubsidyRate", {
      subsidyOp: "enact",
      subsidyScopeType: "sector",
      sectorType: "energy",
      domesticOnly: true,
    }).ok).toBe(true);
    advanceTurn(world);
    const restored = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(restored.subsidies).toEqual(world.subsidies);
    expect(restored.subsidies[0]).toMatchObject({ scopeType: "sector", targetSectorType: "energy", domesticOnly: true });
    expect(line(restored)).toBe(line(world));
    advanceTurn(restored);
    expect(line(restored)).toBe(expectedCost(restored, "US", "energy"));
  });
});
