import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { representedSectorsForUnion } from "./sectorAggregation.js";
import { averageAnnualWage, duesIncomePerTurn, maxDuesForWage, unionMembers } from "./dues.js";
import { setUnionDuesAction } from "./duesActions.js";
import { setUnionPoliticalContributionsAction } from "./contributionActions.js";
import { unionsTurnPhase } from "./phases.js";

describe("player union dues action", () => {
  it("requires the seated president and clamps dues to ten percent of represented wages", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "dues-player-action", playerName: "Alex" });
    const union = world.unions["US-manufacturing"]!;
    expect(setUnionDuesAction(world, union.id, 1)).toEqual({ ok: false, reason: "not-president" });

    union.ownerType = "player";
    union.ownerId = "player";
    const sectors = representedSectorsForUnion(world, union);
    const max = maxDuesForWage(averageAnnualWage(sectors));
    const result = setUnionDuesAction(world, union.id, max * 5);
    expect(result).toMatchObject({ ok: true, duesPerWorkerAnnual: max, maxDuesPerWorkerAnnual: max, members: unionMembers(sectors) });
    expect(union.duesPerWorkerAnnual).toBe(max);
  });

  it("credits the quoted represented-worker dues once through the normal union turn", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "dues-player-turn", playerName: "Alex" });
    const union = world.unions["US-manufacturing"]!;
    union.ownerType = "player";
    union.ownerId = "player";
    const sectors = representedSectorsForUnion(world, union);
    const rate = maxDuesForWage(averageAnnualWage(sectors));
    const configured = setUnionDuesAction(world, union.id, rate);
    expect(configured.ok).toBe(true);
    if (!configured.ok) throw new Error(configured.reason);
    const expectedIncome = duesIncomePerTurn(unionMembers(sectors), rate);
    const before = union.treasury;
    unionsTurnPhase.run(world);
    expect(union.treasury).toBeCloseTo(before + expectedIncome, 2);
    expect(union.duesPerWorkerAnnual).toBe(rate);
  });
});

describe("player union political contribution action", () => {
  it("requires the seated president, rejects non-finite rates, and clamps to the source 50% cap", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "union-contribution-player-action", playerName: "Alex" });
    const union = world.unions["US-manufacturing"]!;
    expect(setUnionPoliticalContributionsAction(world, union.id, 0.25)).toEqual({ ok: false, reason: "not-president" });

    union.ownerType = "player";
    union.ownerId = "player";
    expect(setUnionPoliticalContributionsAction(world, union.id, Number.NaN)).toEqual({ ok: false, reason: "invalid-rate" });
    expect(setUnionPoliticalContributionsAction(world, union.id, 4)).toEqual({ ok: true, politicalContributionPct: 0.5 });
    expect(union.politicalContributionPct).toBe(0.5);
    expect(union.updatedAtTurn).toBe(world.meta.turn);
  });

  it("refuses contributions while the source union-ban state suspends the union", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "union-contribution-suspended", playerName: "Alex" });
    const union = world.unions["US-manufacturing"]!;
    union.ownerType = "player";
    union.ownerId = "player";
    union.suspended = true;
    expect(setUnionPoliticalContributionsAction(world, union.id, 0.2)).toEqual({ ok: false, reason: "suspended" });
    expect(union.politicalContributionPct).toBe(0);
  });
});
