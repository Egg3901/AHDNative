/**
 * Executive-control session slice (#65 / #93): HoS-only action availability,
 * costed queueing with transaction-safe rejection, turn-boundary phase-in,
 * and save/close/reload continuity through the public GameSession contract.
 */
import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const HOS = { era: "1953", countryId: "US", seed: "executive-controls-test", playerName: "Alex", mode: "hos" } as const;
const CAREER = { era: "1953", countryId: "US", seed: "executive-controls-test", playerName: "Alex" } as const;

describe("executive controls session slice (#65/#93)", () => {
  it("projects the executive actions only in Head of State mode", () => {
    const hos = new GameSession();
    const view = hos.create({ ...HOS });
    const executive = view.actions.filter((action) => action.category === "executive");
    expect(executive.map((action) => action.id).sort()).toEqual(["adjustBudgetSpending", "adjustTaxRate"]);
    for (const action of executive) {
      expect(action.available).toBe(true);
      expect(action.cost).toBeGreaterThan(0);
    }
    const tax = executive.find((action) => action.id === "adjustTaxRate")!;
    expect(tax.requires).toBe("taxRate");
    expect(tax.prerequisite).toMatch(/phase/i);

    const career = new GameSession();
    expect(career.create({ ...CAREER }).actions.some((action) => action.category === "executive")).toBe(false);
  });

  it("queues a costed tax direction without touching the live rate", () => {
    const session = new GameSession();
    const before = session.create({ ...HOS });
    const live = before.actions.find((action) => action.id === "adjustTaxRate")!;
    expect(live.available).toBe(true);
    const rate = (session as unknown as { requireWorld(): { budgets: { US: { taxRates: { incomeTax: number } } } } })
      .requireWorld().budgets.US.taxRates.incomeTax;
    const ap = session.view().player.actions;
    const result = session.act("adjustTaxRate", { taxField: "incomeTax", taxRate: Math.max(0, rate - 5) });
    expect(result.ok).toBe(true);
    const world = (session as unknown as { requireWorld(): { budgets: { US: { taxRates: { incomeTax: number } } }; pendingFiscalDirectives?: unknown[] } }).requireWorld();
    expect(world.budgets.US.taxRates.incomeTax).toBe(rate);
    expect(world.pendingFiscalDirectives).toHaveLength(1);
    expect(session.view().player.actions).toBe(ap - live.cost);
  });

  it("rejects invalid and unauthorized directives with state untouched (rollback)", () => {
    const session = new GameSession();
    session.create({ ...HOS });
    const snapshot = session.serialize("2026-09-18T00:00:00.000Z");
    const bad = session.act("adjustTaxRate", { taxField: "incomeTax", taxRate: 101 });
    expect(bad.ok).toBe(false);
    expect(session.serialize("2026-09-18T00:00:00.000Z")).toBe(snapshot);

    const career = new GameSession();
    career.create({ ...CAREER });
    const careerSnapshot = career.serialize("2026-09-18T00:00:00.000Z");
    const refused = career.act("adjustTaxRate", { taxField: "incomeTax", taxRate: 20 });
    expect(refused.ok).toBe(false);
    expect(career.serialize("2026-09-18T00:00:00.000Z")).toBe(careerSnapshot);
  });

  it("advances the queued direction through phase-in and survives save/close/reload", () => {
    const session = new GameSession();
    session.create({ ...HOS });
    const getRate = () => (session as unknown as { requireWorld(): { budgets: { US: { taxRates: { incomeTax: number }; taxRatePhaseIn?: { incomeTax?: number } } } } }).requireWorld().budgets.US;
    const before = getRate().taxRates.incomeTax;
    const target = Math.max(0, before - 5);
    expect(session.act("adjustTaxRate", { taxField: "incomeTax", taxRate: target }).ok).toBe(true);

    // Save with the directive still pending, close (drop the session), reload.
    const stamp = "2026-09-18T00:00:00.000Z";
    const saved = session.serialize(stamp);
    const reopened = new GameSession();
    reopened.load(saved);
    expect(reopened.view().actions.some((action) => action.id === "adjustTaxRate")).toBe(true);

    type BudgetProbe = { budgets: { US: { taxRates: { incomeTax: number }; taxRatePhaseIn?: { incomeTax?: number } } } };
    const readBudget = () => (reopened as unknown as { requireWorld(): BudgetProbe }).requireWorld().budgets.US;
    reopened.advance();
    // The session replaces its world object on every commit, so re-read after each turn.
    expect(Math.abs(readBudget().taxRates.incomeTax - target)).toBeLessThan(Math.abs(before - target));
    expect(readBudget().taxRatePhaseIn?.incomeTax).toBe(target);

    for (let turn = 0; turn < 8 && readBudget().taxRates.incomeTax !== target; turn++) reopened.advance();
    expect(readBudget().taxRates.incomeTax).toBe(target);
    // Reload again at the enacted state: the rate and cleared ramp persist.
    const done = new GameSession();
    done.load(reopened.serialize(stamp));
    const finalWorld = (done as unknown as { requireWorld(): { budgets: { US: { taxRates: { incomeTax: number }; taxRatePhaseIn?: { incomeTax?: number } } } } }).requireWorld().budgets.US;
    expect(finalWorld.taxRates.incomeTax).toBe(target);
    expect(finalWorld.taxRatePhaseIn?.incomeTax).toBeUndefined();
  });
});
