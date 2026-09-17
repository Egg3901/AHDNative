import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { calculateSectorWorkers, corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { GAME_DAYS_PER_YEAR } from "./services.js";
import { unionMembers } from "./dues.js";
import { unionsTurnPhase } from "./phases.js";
import {
  adoptUnrepresentedSectors,
  annualWageForCountry,
  representedSectorsForUnion,
  totalLaborForceForCountry,
} from "./sectorAggregation.js";

const WORLD = { era: "1953", countryId: "US", seed: "issue-320-aggregation", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";

describe("#320 deterministic sector-worker aggregation", () => {
  it("derives rows from the recorded #296 asset, not an invented table", () => {
    const world = createWorld(WORLD);
    const union = world.unions["US-manufacturing"]!;
    const rows = representedSectorsForUnion(world, union);
    const assets = corporateSectorAssets(world);
    const expected = Object.values(assets)
      .filter((asset) => asset.representingUnionId === union.id)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    expect(expected.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(rows[i]!.workers).toBe(expected[i]!.workers);
      expect(rows[i]!.workers).toBe(
        calculateSectorWorkers(world.corporations[expected[i]!.corporationId]!.revenue, null),
      );
      expect(rows[i]!.unionization).toBe(union.unionization);
    }
    // Independent restatement of the dues headcount through the verbatim helper.
    expect(unionMembers(rows)).toBe(
      Math.round(
        expected.reduce((sum, asset) => sum + asset.workers * (union.unionization / 100), 0),
      ),
    );
  });

  it("excludes unrepresented sectors from every union's rows", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const target = Object.values(assets).find((asset) => asset.corporationId === "US-manufacturing")!;
    const union = world.unions["US-manufacturing"]!;
    const before = representedSectorsForUnion(world, union);
    // Null means unrepresented (a valid state): the shop drops out of the
    // union's rows. Cross-pair pointers are #296 corruption, not a test input.
    target.representingUnionId = null;
    const after = representedSectorsForUnion(world, union);
    expect(after).toHaveLength(before.length - 1);
    expect(after.some((row) => row.workers === target.workers)).toBe(false);
    for (const other of Object.values(world.unions)) {
      if (other.id === union.id) continue;
      expect(
        representedSectorsForUnion(world, other).some((row) => row.workers === target.workers),
      ).toBe(false);
    }
  });

  it("verifies the wage side against current region labor and payroll inputs", () => {
    const world = createWorld(WORLD);
    // Region-labor oracle: the country total is exactly the recorded per-region
    // laborForces for regions in that country.
    const total = totalLaborForceForCountry(world, "US");
    let oracle = 0;
    for (const [rid, lf] of Object.entries(world.laborForces)) {
      if (world.regions[rid]?.countryId === "US") oracle += lf;
    }
    expect(oracle).toBeGreaterThan(0);
    expect(total).toBe(oracle);
    // Payroll oracle: recorded budget wagesAndSalaries spread over that labor.
    const payroll = world.budgets["US"]!.taxBases!.wagesAndSalaries!;
    expect(payroll).toBeGreaterThan(0);
    expect(annualWageForCountry(world, "US", total)).toBe(payroll / total);
    const rows = representedSectorsForUnion(world, world.unions["US-manufacturing"]!);
    for (const row of rows) expect(row.wagePerWorker).toBe(payroll / total / GAME_DAYS_PER_YEAR);
  });

  it("adopts null-pointer sectors into the seeded union without touching held shops", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const target = Object.values(assets).find((asset) => asset.corporationId === "US-manufacturing")!;
    const union = world.unions["US-manufacturing"]!;
    target.representingUnionId = null;
    expect(adoptUnrepresentedSectors(world)).toBe(1);
    expect(target.representingUnionId).toBe(union.id);
    // A present pointer is never overwritten (Native has one roster union per
    // pair, so the held case re-points at the same union; rival unions and
    // cross-pair pointers are future raid work, and #296 fails those closed).
    expect(adoptUnrepresentedSectors(world)).toBe(0);
    expect(target.representingUnionId).toBe(union.id);
    // No seeded union for the pair leaves the sector unrepresented.
    delete world.unions[union.id];
    target.representingUnionId = null;
    expect(adoptUnrepresentedSectors(world)).toBe(0);
    expect(target.representingUnionId).toBeNull();
  });

  it("leaves untouched saves lazy: no materialization when nothing is stored", () => {
    const world = createWorld(WORLD);
    expect(world.corporateSectors).toBeUndefined();
    expect(adoptUnrepresentedSectors(world)).toBe(0);
    expect(world.corporateSectors).toBeUndefined();
  });

  it("is deterministic across seeds, turns, and save/reload", () => {
    const first = representedSectorsForUnion(createWorld(WORLD), createWorld(WORLD).unions["US-manufacturing"]!);
    const world = createWorld(WORLD);
    expect(representedSectorsForUnion(world, world.unions["US-manufacturing"]!)).toEqual(first);
    const otherSeed = createWorld({ ...WORLD, seed: "issue-320-other-seed" });
    expect(representedSectorsForUnion(otherSeed, otherSeed.unions["US-manufacturing"]!)).toEqual(first);
    const restored = deserializeSave(serializeSave(createWorld(WORLD), SAVED_AT));
    expect(representedSectorsForUnion(restored, restored.unions["US-manufacturing"]!)).toEqual(first);
  });

  it("starves dues when the represented shop staffs nobody and feeds them when staffed", () => {
    const empty = createWorld(WORLD);
    const assets = corporateSectorAssets(empty);
    for (const asset of Object.values(assets)) {
      if (asset.representingUnionId === "US-manufacturing") asset.workers = 0;
    }
    const union = empty.unions["US-manufacturing"]!;
    union.duesPerWorkerAnnual = 5;
    expect(unionMembers(representedSectorsForUnion(empty, union))).toBe(0);
    const rng = { next: () => 0, int: () => 0, pick: <T>(items: T[]) => items[0]! };
    const treasuryBefore = union.treasury;
    unionsTurnPhase.run(empty, rng);
    expect(union.treasury).toBe(treasuryBefore);

    const staffed = createWorld(WORLD);
    const staffedUnion = staffed.unions["US-manufacturing"]!;
    staffedUnion.duesPerWorkerAnnual = 5;
    unionsTurnPhase.run(staffed, rng);
    expect(staffedUnion.treasury).toBeGreaterThan(treasuryBefore);
  });
});
