/**
 * HoS tax directives use the persisted phase-in path (issue #93).
 *
 * Source-backed: the tax branch of fiscalDirectivesPhase mirrors the federal
 * branch of applyBillEffects (legislation/billLifecycle.ts) through
 * budget/taxRatePhaseIn.ts. A directive steps the rate by at most 1pp at the
 * turn boundary and queues the remainder on budget.taxRatePhaseIn for
 * fiscalBaseGrowthPhase to walk each turn; a fresh directive replaces a
 * running ramp. Spending directives still enact in full at the boundary.
 *
 * The seeded US 1953 incomeTax rate is read from the world, never hardcoded,
 * so pack reseedings cannot silently invalidate these trajectories.
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";

const HOS_OPTS = { seed: "fiscal-directive-test", playerName: "Tester", countryId: "US", era: "1953", mode: "hos" } as const;

function seedRate() {
  return createWorld(HOS_OPTS).budgets["US"]!.taxRates.incomeTax;
}

describe("HoS tax directives phase in like enacted tax law (#93)", () => {
  it("a large tax move steps toward the target and queues the remainder", () => {
    const before = seedRate();
    const target = before - 5;
    const world = createWorld(HOS_OPTS);
    const res = executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: target });
    expect(res.ok).toBe(true);
    // Queued, not applied: the live rate is untouched until the turn boundary.
    expect(world.budgets["US"]!.taxRates.incomeTax).toBe(before);
    expect(world.pendingFiscalDirectives).toHaveLength(1);
    advanceTurn(world);
    const budget = world.budgets["US"]!;
    // fiscalDirectivesPhase steps once and fiscalBaseGrowthPhase walks the
    // queued ramp once more in the same tail: the same double step an enacted
    // bill takes when billLifecyclePhase runs ahead of the fiscal tail in one
    // turn. The remainder stays queued.
    expect(budget.taxRates.incomeTax).toBe(before - 2);
    expect(budget.taxRatePhaseIn?.incomeTax).toBe(target);
    expect(budget.surplus).toBe(budget.revenue.total - budget.spending.total);
    expect(world.pendingFiscalDirectives).toEqual([]);
  });

  it("the ramp converges to the target over later turns and then clears", () => {
    const before = seedRate();
    const target = before - 5;
    const world = createWorld(HOS_OPTS);
    expect(executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: target }).ok).toBe(true);
    for (let turn = 0; turn < 6 && world.budgets["US"]!.taxRates.incomeTax !== target; turn++) advanceTurn(world);
    const budget = world.budgets["US"]!;
    expect(budget.taxRates.incomeTax).toBe(target);
    expect(budget.taxRatePhaseIn?.incomeTax).toBeUndefined();
    expect(budget.surplus).toBe(budget.revenue.total - budget.spending.total);
  });

  it("a fresh directive on the same tax replaces the running ramp", () => {
    const before = seedRate();
    const world = createWorld(HOS_OPTS);
    expect(executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: before - 5 }).ok).toBe(true);
    advanceTurn(world);
    expect(world.budgets["US"]!.taxRatePhaseIn?.incomeTax).toBe(before - 5);
    const mid = world.budgets["US"]!.taxRates.incomeTax;
    expect(executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: before - 10 }).ok).toBe(true);
    advanceTurn(world);
    const budget = world.budgets["US"]!;
    expect(budget.taxRatePhaseIn?.incomeTax).toBe(before - 10);
    expect(budget.taxRates.incomeTax).toBeLessThan(mid);
  });

  it("a small move within one point lands exactly with no pending ramp", () => {
    const before = seedRate();
    const target = before - 1;
    const world = createWorld(HOS_OPTS);
    expect(executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: target }).ok).toBe(true);
    advanceTurn(world);
    const budget = world.budgets["US"]!;
    expect(budget.taxRates.incomeTax).toBe(target);
    expect(budget.taxRatePhaseIn?.incomeTax).toBeUndefined();
  });

  it("an unknown tax field never creates a rate", () => {
    const world = createWorld(HOS_OPTS);
    world.pendingFiscalDirectives = [
      ...(world.pendingFiscalDirectives ?? []),
      { id: "fiscal-0-probe", countryId: "US", kind: "tax", field: "notATax", value: 50, proposedTurn: 0 },
    ];
    advanceTurn(world);
    expect((world.budgets["US"]!.taxRates as Record<string, unknown>)["notATax"]).toBeUndefined();
    expect(world.pendingFiscalDirectives).toEqual([]);
  });

  it("spending directives still enact in full at the boundary", () => {
    const world = createWorld(HOS_OPTS);
    expect(
      executeAction(world, "player", "adjustBudgetSpending", { budgetCategory: "defense", budgetAmount: 1_000_000 }).ok,
    ).toBe(true);
    advanceTurn(world);
    expect(world.budgets["US"]!.spending.byCategory["defense"]).toBe(1_000_000);
  });

  it("rejected directives refund action points and queue nothing", () => {
    const world = createWorld(HOS_OPTS);
    const ap = world.player.actions;
    const bad = executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: 101 });
    expect(bad.ok).toBe(false);
    expect(world.player.actions).toBe(ap);
    expect(world.pendingFiscalDirectives ?? []).toEqual([]);
    const career = createWorld({ seed: "fiscal-directive-test", playerName: "Tester", countryId: "US", era: "1953" });
    const careerAp = career.player.actions;
    const refused = executeAction(career, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: 20 });
    expect(refused.ok).toBe(false);
    expect(career.player.actions).toBe(careerAp);
  });

  it("the queued ramp and pending directive survive save and reload", () => {
    const before = seedRate();
    const target = before - 5;
    const world = createWorld(HOS_OPTS);
    expect(executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: target }).ok).toBe(true);
    const reloaded = deserializeSave(serializeSave(world, "2026-09-18T00:00:00.000Z"));
    expect(reloaded.pendingFiscalDirectives).toHaveLength(1);
    advanceTurn(reloaded);
    expect(reloaded.budgets["US"]!.taxRatePhaseIn?.incomeTax).toBe(target);
    const rereloaded = deserializeSave(serializeSave(reloaded, "2026-09-18T00:00:00.000Z"));
    for (let turn = 0; turn < 6 && rereloaded.budgets["US"]!.taxRates.incomeTax !== target; turn++) {
      advanceTurn(rereloaded);
    }
    expect(rereloaded.budgets["US"]!.taxRates.incomeTax).toBe(target);
  });
});
