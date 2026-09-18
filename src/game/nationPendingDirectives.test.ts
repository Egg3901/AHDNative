/**
 * Pending-directive policy projection (#65): costed HoS fiscal directives
 * queued through the executive actions are visible on the nation Policy
 * surface as pending (not yet enacted), survive save/close/reload, and clear
 * at the turn boundary when the engine enacts them. Career players queue
 * nothing and see nothing pending.
 */
import { describe, expect, it } from "vitest";
import type { WorldState } from "@ahdclient/engine";
import { createWorld } from "@ahdclient/engine";
import { projectNation } from "./nation";
import { GameSession } from "./session";

const HOS = { era: "1953", countryId: "US", seed: "policy-pending-test", playerName: "Alex", mode: "hos" } as const;
const CAREER = { era: "1953", countryId: "US", seed: "policy-pending-test", playerName: "Alex" } as const;
const STAMP = "2026-09-18T00:00:00.000Z";

function worldOf(session: GameSession): WorldState {
  return (session as unknown as { requireWorld(): WorldState }).requireWorld();
}

describe("pending directive policy projection (#65)", () => {
  it("projects a queued tax directive as pending without moving the live rate", () => {
    const session = new GameSession();
    session.create({ ...HOS });
    const before = worldOf(session).budgets.US.taxRates.incomeTax;
    const target = Math.max(0, before - 5);
    expect(session.act("adjustTaxRate", { taxField: "incomeTax", taxRate: target }).ok).toBe(true);

    const policy = projectNation(worldOf(session)).policy;
    expect(policy.pending).toHaveLength(1);
    expect(policy.pending![0]).toMatchObject({
      kind: "tax",
      field: "incomeTax",
      value: target,
      proposedTurn: worldOf(session).meta.turn,
    });
    expect(policy.pending![0].label).toMatch(/income/i);
    // Still pending: the live rate has not moved and the current-rate row agrees.
    expect(worldOf(session).budgets.US.taxRates.incomeTax).toBe(before);
    expect(policy.taxRates.find((tax) => tax.id === "incomeTax")?.ratePercent).toBe(before);
  });

  it("projects a queued spending directive as pending without moving live spending", () => {
    const session = new GameSession();
    session.create({ ...HOS });
    const total = worldOf(session).budgets.US.spending.total;
    const defense = worldOf(session).budgets.US.spending.byCategory.defense ?? 0;
    expect(session.act("adjustBudgetSpending", { budgetCategory: "defense", budgetAmount: defense + 1_000_000 }).ok).toBe(true);

    const policy = projectNation(worldOf(session)).policy;
    expect(policy.pending).toHaveLength(1);
    expect(policy.pending![0]).toMatchObject({ kind: "spending", field: "defense", value: defense + 1_000_000 });
    expect(policy.pending![0].label).toMatch(/defense/i);
    expect(worldOf(session).budgets.US.spending.total).toBe(total);
  });

  it("clears pending at the turn boundary as the engine enacts the directives", () => {
    const session = new GameSession();
    session.create({ ...HOS });
    const defense = worldOf(session).budgets.US.spending.byCategory.defense ?? 0;
    expect(session.act("adjustBudgetSpending", { budgetCategory: "defense", budgetAmount: defense + 1_000_000 }).ok).toBe(true);

    session.advance();
    const after = worldOf(session);
    expect(projectNation(after).policy.pending).toEqual([]);
    expect(after.budgets.US.spending.byCategory.defense).toBe(defense + 1_000_000);
  });

  it("preserves pending directives across save, close, and reload", () => {
    const session = new GameSession();
    session.create({ ...HOS });
    const before = worldOf(session).budgets.US.taxRates.incomeTax;
    const target = Math.max(0, before - 5);
    expect(session.act("adjustTaxRate", { taxField: "incomeTax", taxRate: target }).ok).toBe(true);

    const reopened = new GameSession();
    reopened.load(session.serialize(STAMP));
    const pending = projectNation(worldOf(reopened)).policy.pending!;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "tax", field: "incomeTax", value: target });
    expect(worldOf(reopened).budgets.US.taxRates.incomeTax).toBe(before);
  });

  it("shows no pending directives for career players", () => {
    const session = new GameSession();
    session.create({ ...CAREER });
    expect(session.act("adjustTaxRate", { taxField: "incomeTax", taxRate: 20 }).ok).toBe(false);
    expect(projectNation(worldOf(session)).policy.pending).toEqual([]);
  });

  it("drops foreign-country and malformed directive rows instead of rendering them", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "policy-pending-filter" });
    world.pendingFiscalDirectives = [
      { id: "keep-tax", countryId: "US", kind: "tax", field: "incomeTax", value: 20, proposedTurn: 3 },
      { id: "foreign", countryId: "UK", kind: "tax", field: "incomeTax", value: 20, proposedTurn: 3 },
      { id: "", countryId: "US", kind: "tax", field: "incomeTax", value: 20, proposedTurn: 3 },
      { id: "bad-value", countryId: "US", kind: "spending", field: "defense", value: Number.NaN, proposedTurn: 3 },
    ];
    const pending = projectNation(world).policy.pending!;
    expect(pending.map((directive) => directive.id)).toEqual(["keep-tax"]);
  });
});
