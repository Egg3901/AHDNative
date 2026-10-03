import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { executeAction, type ExecuteActionParams } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { SECTOR_SUBSIDIES_SPENDING_KEY } from "./subsidyBudget.js";

// The 1953 HoS seat and its source party are both US_REP. Supplying the
// character's actual party affiliation gives policyless bills the source
// party-line input; without it every NPC correctly abstains.
const HOS_OPTS = { seed: "subsidy-bill-test", playerName: "Tester", countryId: "US", era: "1953", mode: "hos", partyId: "US_REP" } as const;
function line(world: ReturnType<typeof createWorld>, countryId = "US"): number {
  return world.budgets[countryId]!.spending.byCategory[SECTOR_SUBSIDIES_SPENDING_KEY] ?? 0;
}
function liveRevenue(world: ReturnType<typeof createWorld>, countryId = "US", sector?: string): number {
  return Object.values(world.corporations).filter((corp) => corp.countryId === countryId && (!sector || corp.sectorType === sector)).reduce((sum, corp) => sum + corp.revenue, 0);
}
function expectedCost(world: ReturnType<typeof createWorld>, countryId = "US", sector?: string): number {
  return Math.round(liveRevenue(world, countryId, sector) * 48 * 0.105);
}
function resolve(world: ReturnType<typeof createWorld>, billId: string) {
  const bill = world.bills.find((candidate) => candidate.id === billId)!;
  for (let i = 0; i < 12 && bill.status !== "signed" && bill.status !== "failed"; i++) advanceTurn(world);
  return bill;
}

describe("setSubsidyRate proposal and enactment lifecycle (#94)", () => {
  it("proposes a source subsidy provision for 10 AP and enacts it only after votes and executive signing", () => {
    const world = createWorld(HOS_OPTS);
    const control = createWorld(HOS_OPTS);
    world.nppAutonomyLevel = "off";
    control.nppAutonomyLevel = "off";
    world.player.actions = 100;
    const before = world.player.actions;
    expect(line(world)).toBe(0);
    const result = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact", subsidyScopeType: "sector", sectorType: "energy", domesticOnly: true });
    expect(result.ok).toBe(true);
    expect(world.player.actions).toBe(before - 10);
    expect(world.subsidies).toEqual([]);
    const bill = world.bills.at(-1)!;
    const currentStatus = () => bill.status;
    expect(bill).toMatchObject({ status: "proposed", category: "industry", provisions: [{ type: "subsidy", subsidyScopeType: "sector", targetSectorType: "energy", domesticOnly: true }] });
    for (let i = 0; i < 12 && bill.status !== "signed" && bill.status !== "failed"; i++) {
      advanceTurn(world);
      advanceTurn(control);
      if (currentStatus() !== "signed") expect(world.subsidies).toEqual([]);
    }
    const signed = bill;
    expect(signed.status).toBe("signed");
    expect(signed.voteSnapshot).toMatchObject({ for: expect.any(Number), against: expect.any(Number) });
    expect(world.subsidies).toMatchObject([{ countryId: "US", scope: "national", scopeType: "sector", targetSectorType: "energy", domesticOnly: true, active: true }]);
    // The corporation phase runs before bill signing; its production benefit
    // first appears at the following turn boundary.
    advanceTurn(world);
    advanceTurn(control);
    expect(line(world)).toBeGreaterThan(0);
    expect(line(world)).toBe(expectedCost(world, "US", "energy"));
    const energy = Object.values(world.corporations).find((corp) => corp.countryId === "US" && corp.sectorType === "energy")!;
    const controlEnergy = control.corporations[energy.id]!;
    expect(energy.effectiveProfitMargin - controlEnergy.effectiveProfitMargin).toBeCloseTo(7.5, 10);
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(restored.bills.find((entry) => entry.id === bill.id)?.status).toBe("signed");
    expect(restored.subsidies).toEqual(world.subsidies);
    expect(line(restored)).toBe(line(world));
    advanceTurn(restored);
    advanceTurn(world);
    expect(restored.budgets.US?.spending.byCategory[SECTOR_SUBSIDIES_SPENDING_KEY]).toBe(world.budgets.US?.spending.byCategory[SECTOR_SUBSIDIES_SPENDING_KEY]);
  });

  it("charges only the selected sector and rejects unavailable/foreign targets without a bill", () => {
    const world = createWorld(HOS_OPTS);
    world.nppAutonomyLevel = "off";
    world.player.actions = 100;
    const invalidParams: ExecuteActionParams = { subsidyOp: "enact", subsidyScopeType: "sector", sectorType: "energy" };
    Reflect.set(invalidParams, "sectorType", "mithril");
    const invalid = executeAction(world, "player", "setSubsidyRate", invalidParams);
    expect(invalid).toMatchObject({ ok: false, error: expect.stringContaining("present in the player's country") });
    expect(world.bills).toHaveLength(0);
    expect(world.player.actions).toBe(100);
    const country = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact", budgetCountryId: "UK" });
    expect(country.ok).toBe(false);
    expect(world.bills).toHaveLength(0);
    expect(executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact", subsidyScope: "state" }).ok).toBe(false);
    const proposal = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact", subsidyScopeType: "sector", sectorType: "energy" });
    expect(proposal.ok).toBe(true);
    const bill = resolve(world, world.bills.at(-1)!.id);
    expect(bill.status).toBe("signed");
    expect(line(world)).toBe(expectedCost(world, "US", "energy"));
  });

  it("allows a same-country legislative seat and rejects a foreign seat", () => {
    const world = createWorld({ ...HOS_OPTS, mode: "career" });
    world.player.actions = 100;
    expect(executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" }).ok).toBe(false);
    expect(world.bills).toHaveLength(0);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house" };
    const proposal = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" });
    expect(proposal.ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({ originChamber: "house", sponsorId: "player" });
    const foreignSeatWorld = createWorld({ ...HOS_OPTS, mode: "career" });
    foreignSeatWorld.player.actions = 100;
    foreignSeatWorld.player.legislativeSeat = { countryId: "UK", chamberKey: "commons" };
    expect(executeAction(foreignSeatWorld, "player", "setSubsidyRate", { subsidyOp: "enact" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("legislative seat in the player's country"),
    });
  });

  it("ends an active subsidy through an end_subsidy bill and retains the inactive record", () => {
    const world = createWorld(HOS_OPTS);
    world.nppAutonomyLevel = "off";
    world.player.actions = 100;
    expect(executeAction(world, "player", "setSubsidyRate", { subsidyOp: "enact" }).ok).toBe(true);
    const first = resolve(world, world.bills.at(-1)!.id);
    expect(first.status).toBe("signed");
    expect(line(world)).toBeGreaterThan(0);
    const beforeEnd = world.player.actions;
    expect(executeAction(world, "player", "setSubsidyRate", { subsidyOp: "end" }).ok).toBe(true);
    expect(world.player.actions).toBe(beforeEnd - 10);
    expect(world.subsidies[0]?.active).toBe(true);
    const endBill = world.bills.at(-1)!;
    expect(endBill.provisions[0]).toMatchObject({ type: "end_subsidy", subsidyScopeType: "economy_wide" });
    expect(resolve(world, endBill.id).status).toBe("signed");
    expect(world.subsidies).toHaveLength(1);
    expect(world.subsidies[0]?.active).toBe(false);
    expect(line(world)).toBe(0);
    const noOp = executeAction(world, "player", "setSubsidyRate", { subsidyOp: "end" });
    expect(noOp).toMatchObject({ ok: false, error: expect.stringContaining("No active national subsidy") });
  });
});
