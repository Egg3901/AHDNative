import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../save.js";
import { SCHEMA_VERSION, createWorld } from "../world.js";
import {
  backfillSectorWorkforce,
  calculateSectorWorkers,
  corporateSectorAssets,
  initialRepresentingUnionId,
  validateSectorUnionReference,
  validateSectorWorkers,
} from "./corporateSectorAssets.js";

const WORLD = { era: "1953", countryId: "US", seed: "issue-296-workforce", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";

describe("#296 corporate-sector workers and union representation", () => {
  it("derives headcount from recorded revenue through the source formula", () => {
    // Reference anchor (lib/constants/corporations.ts): $1M at neutral skill
    // staffs exactly 500 (DEFAULT_SECTOR_STARTING_WORKERS).
    expect(calculateSectorWorkers(1_000_000, null)).toBe(500);
    expect(calculateSectorWorkers(1_000_000, 50)).toBe(500);
    expect(calculateSectorWorkers(1_000_000, undefined)).toBe(500);
    // Skill band: +-30% at the extremes, neutral at 50.
    expect(calculateSectorWorkers(1_000_000, 100)).toBe(350);
    expect(calculateSectorWorkers(1_000_000, 0)).toBe(650);
    // Integer floor of 1: degenerate revenue never staffs zero-or-negative
    // through the formula, and fractional revenue rounds to whole people.
    expect(calculateSectorWorkers(0, null)).toBe(1);
    expect(calculateSectorWorkers(-5000, null)).toBe(1);
    expect(calculateSectorWorkers(Number.NaN, null)).toBe(1);
    expect(calculateSectorWorkers(2100, null)).toBe(1);
    expect(calculateSectorWorkers(3000, null)).toBe(2);
  });

  it("seeds grounded workforce state: derived headcount, adopted seeded union", () => {
    const world = createWorld(WORLD);
    expect(world.corporateSectors).toBeUndefined();
    const assets = corporateSectorAssets(world);
    expect(Object.keys(assets)).toHaveLength(Object.keys(world.corporations).length);
    for (const asset of Object.values(assets)) {
      const corporation = world.corporations[asset.corporationId]!;
      // Independent restatement of the initialization formula.
      expect(asset.workers).toBe(Math.max(1, Math.round(corporation.revenue / 2000)));
      expect(asset.workers).toBe(calculateSectorWorkers(corporation.revenue, null));
      expect(Number.isInteger(asset.workers)).toBe(true);
      expect(asset.workers).toBeGreaterThan(0);
      // 1953 pairs all carry a seeded union, so every asset is represented.
      expect(asset.representingUnionId).toBe(`${asset.countryId}-${asset.sectorType}`);
      const union = world.unions[asset.representingUnionId!]!;
      expect(union).toBeDefined();
      expect(union.countryId).toBe(asset.countryId);
      expect(union.sectorType).toBe(asset.sectorType);
    }
  });

  it("pins the US-manufacturing headcount against the recorded 1953 revenue", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const asset = Object.values(assets).find((candidate) => candidate.corporationId === "US-manufacturing")!;
    const corporation = world.corporations["US-manufacturing"]!;
    expect(asset.workers).toBe(Math.max(1, Math.round(corporation.revenue / 2000)));
    expect(asset.representingUnionId).toBe("US-manufacturing");
    expect(world.unions["US-manufacturing"]!.name).toBe("United Steelworkers");
  });

  it("is deterministic: no RNG, stable across seeds and save/reload", () => {
    const first = corporateSectorAssets(createWorld(WORLD));
    const otherSeed = corporateSectorAssets(
      createWorld({ era: "1953", countryId: "US", seed: "issue-296-other-seed", playerName: "Alex" }),
    );
    // Revenue, weights, and union roster are seed-independent, so the whole
    // workforce substrate is identical under a different world seed.
    expect(otherSeed).toEqual(first);
    expect(corporateSectorAssets(createWorld(WORLD))).toEqual(first);
    const restored = deserializeSave(serializeSave(createWorld(WORLD), SAVED_AT));
    expect(corporateSectorAssets(restored)).toEqual(first);
    // Deterministic ids are untouched by this slice.
    for (const asset of Object.values(first)) {
      expect(asset.id).toBe(`corporate-sector:${asset.countryId}:${asset.sectorType}:${asset.corporationId}`);
    }
  });

  it("leaves unrepresented pairs null instead of inventing a union", () => {
    const world = createWorld(WORLD);
    expect(initialRepresentingUnionId(world, "US", "media")).toBe("US-media");
    expect(initialRepresentingUnionId(world, "XX", "media")).toBeNull();
    const assets = corporateSectorAssets(world);
    const asset = Object.values(assets)[0]!;
    delete world.unions[asset.representingUnionId!];
    expect(initialRepresentingUnionId(world, asset.countryId, asset.sectorType)).toBeNull();
  });

  it("rejects invalid headcount and union references, accepts null representation", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const asset = Object.values(assets).find((candidate) => candidate.corporationId === "US-media")!;
    expect(() => validateSectorWorkers({ ...asset, workers: 0 })).not.toThrow();
    expect(() => validateSectorWorkers(asset)).not.toThrow();
    for (const workers of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, "100", undefined, null]) {
      expect(() => validateSectorWorkers({ ...asset, workers: workers as never })).toThrow(
        /invalid worker headcount/i,
      );
    }
    expect(() => validateSectorUnionReference(world, asset)).not.toThrow();
    expect(() => validateSectorUnionReference(world, { ...asset, representingUnionId: null })).not.toThrow();
    const otherPair = Object.values(assets).find((candidate) => candidate.corporationId === "US-energy")!;
    for (const representingUnionId of [
      undefined,
      "",
      42,
      "US-nonexistent",
      // Same country, wrong industry.
      otherPair.representingUnionId,
      // Right industry, wrong country.
      "UK-media",
    ]) {
      expect(() =>
        validateSectorUnionReference(world, { ...asset, representingUnionId: representingUnionId as never }),
      ).toThrow(/invalid representing union/i);
    }
  });

  it("backfills missing fields and leaves recorded values for validation", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const asset = Object.values(assets)[0]!;
    const records = { [asset.id]: { ...asset } } as Record<string, (typeof asset & { workers?: unknown })>;
    delete records[asset.id]!.workers;
    (records[asset.id]! as { representingUnionId?: unknown }).representingUnionId = undefined;
    backfillSectorWorkforce(world, records as never);
    expect(records[asset.id]!.workers).toBe(calculateSectorWorkers(world.corporations[asset.corporationId]!.revenue, null));
    expect(records[asset.id]!.representingUnionId).toBe(`${asset.countryId}-${asset.sectorType}`);
    // Present-but-invalid is left for the strict validators to fail closed on.
    const invalid = { [asset.id]: { ...asset, workers: -5 } };
    backfillSectorWorkforce(world, invalid as never);
    expect(invalid[asset.id]!.workers).toBe(-5);
    expect(() => validateSectorWorkers(invalid[asset.id]!)).toThrow(/invalid worker headcount/i);
  });

  it("migrates pre-#296 saves to grounded workforce state at schema 47", () => {
    const world = createWorld(WORLD);
    corporateSectorAssets(world);
    const raw = JSON.parse(serializeSave(world, SAVED_AT)) as any;
    // Reconstruct a pre-#296 document: placeholder workforce rows at schema 46.
    for (const asset of Object.values(raw.world.corporateSectors) as any[]) {
      asset.workers = 0;
      asset.representingUnionId = null;
    }
    raw.schemaVersion = 46;
    raw.world.meta.schemaVersion = 46;
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(47);
    const assets = corporateSectorAssets(migrated);
    for (const asset of Object.values(assets)) {
      const corporation = migrated.corporations[asset.corporationId]!;
      expect(asset.workers).toBe(calculateSectorWorkers(corporation.revenue, null));
      expect(asset.workers).toBeGreaterThan(0);
      expect(asset.representingUnionId).toBe(`${asset.countryId}-${asset.sectorType}`);
    }
    // A present pointer survives migration untouched (raid preservation: the
    // adoption branch only fires on null/undefined).
    const rawKept = JSON.parse(serializeSave(world, SAVED_AT)) as any;
    const keptKey = Object.values(rawKept.world.corporateSectors as Record<string, any>).find(
      (asset) => asset.corporationId === "US-media",
    )!.id as string;
    for (const asset of Object.values(rawKept.world.corporateSectors) as any[]) {
      asset.workers = 0;
    }
    expect(rawKept.world.corporateSectors[keptKey].representingUnionId).toBe("US-media");
    rawKept.schemaVersion = 46;
    rawKept.world.meta.schemaVersion = 46;
    const migratedKept = deserializeSave(JSON.stringify(rawKept));
    expect(migratedKept.corporateSectors![keptKey]!.representingUnionId).toBe("US-media");
    expect(migratedKept.corporateSectors![keptKey]!.workers).toBeGreaterThan(0);
  });

  it("loads pre-#296 saves without materialized sectors and keeps them lazy", () => {
    const raw = JSON.parse(serializeSave(createWorld(WORLD), SAVED_AT)) as any;
    expect(raw.world.corporateSectors).toBeUndefined();
    raw.schemaVersion = 46;
    raw.world.meta.schemaVersion = 46;
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    // Untouched saves keep their serialized shape until first access.
    expect(migrated.corporateSectors).toBeUndefined();
    const assets = corporateSectorAssets(migrated);
    expect(Object.values(assets).every((asset) => asset.workers > 0)).toBe(true);
  });

  it("refuses corrupt workforce state at the save boundary", () => {
    const world = createWorld(WORLD);
    corporateSectorAssets(world);
    const raw = JSON.parse(serializeSave(world, SAVED_AT)) as any;
    const key = Object.keys(raw.world.corporateSectors)[0]!;
    const corruptions = [
      (save: any) => { save.world.corporateSectors[key].workers = -1; },
      (save: any) => { save.world.corporateSectors[key].workers = 1.5; },
      (save: any) => { save.world.corporateSectors[key].workers = "100"; },
      (save: any) => { delete save.world.corporateSectors[key].workers; },
      (save: any) => { save.world.corporateSectors[key].representingUnionId = "US-nonexistent"; },
      (save: any) => { save.world.corporateSectors[key].representingUnionId = "UK-media"; },
      (save: any) => { delete save.world.corporateSectors[key].representingUnionId; },
    ];
    for (const corrupt of corruptions) {
      const candidate = structuredClone(raw);
      corrupt(candidate);
      expect(() => deserializeSave(JSON.stringify(candidate))).toThrow(
        /Corporate sector|Duplicate corporate sector/,
      );
    }
  });
});
