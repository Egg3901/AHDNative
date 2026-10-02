import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { applyUnionLawProvision, lawAdjustedUnionizationThreshold } from "./unionLaws.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { labourFactorsForCorporation, loadCorporationLabourState, stepCorporateSectorStrikes } from "../corporation/corporationLabour.js";

describe("enacted union law state", () => {
  it("matches the source national strike-threshold shift for each bias direction", () => {
    expect(lawAdjustedUnionizationThreshold(undefined)).toBe(55);
    expect(lawAdjustedUnionizationThreshold(20)).toBe(51);
    expect(lawAdjustedUnionizationThreshold(-20)).toBe(59);
  });

  it("bans and repeals unions through the country budget while preserving the prior bias and union records", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "union-law-budget-state", playerName: "Alex" });
    const budget = world.budgets.US!;
    const union = world.unions["US-manufacturing"]!;
    budget.unionLawBias = 18;
    union.unionization = 42;
    union.treasury = 123_456;

    applyUnionLawProvision(world, "US", { type: "union_law", bias: 0, banAction: "ban" });

    expect(budget.unionsBanned).toBe(true);
    expect(budget.unionLawBias).toBe(18);
    expect(union.suspended).toBe(true);
    expect(union.unionization).toBe(42);
    expect(union.treasury).toBe(123_456);

    applyUnionLawProvision(world, "US", { type: "union_law", bias: 0, banAction: "repeal_ban" });

    expect(budget.unionsBanned).toBe(false);
    expect(budget.unionLawBias).toBe(18);
    expect(union.suspended).toBe(false);
    expect(union.unionization).toBe(42);
    expect(union.treasury).toBe(123_456);
  });

  it("clears cells on a fresh ban and converts half of underground strength on repeal", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "union-law-underground-repeal", playerName: "Alex" });
    const union = world.unions["US-manufacturing"]!;
    union.strength = 200;
    union.undergroundStrength = 100;
    union.heat = 72;
    union.exposedUntilTurn = 12;
    world.unionOrganizers = {
      "US-manufacturing:player": {
        id: "US-manufacturing:player", unionId: union.id, characterId: "player", strength: 30,
        organizeCount: 3, createdAtTurn: 1, updatedAtTurn: 1, undergroundStrength: 12,
        lastUndergroundDriveTurn: 2,
      },
    };

    applyUnionLawProvision(world, "US", { type: "union_law", banAction: "repeal_ban" });

    expect(union.strength).toBe(250);
    expect(union.suspended).toBe(false);
    expect(union.undergroundStrength).toBeUndefined();
    expect(union.heat).toBeUndefined();
    expect(world.unionOrganizers?.["US-manufacturing:player"]).not.toHaveProperty("undergroundStrength");
  });

  it("clamps bias laws and leaves a currently enacted ban untouched", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "union-law-bias-state", playerName: "Alex" });
    const budget = world.budgets.US!;
    const union = world.unions["US-manufacturing"]!;
    budget.unionsBanned = true;
    union.suspended = true;

    applyUnionLawProvision(world, "US", { type: "union_law", bias: 80 });

    expect(budget.unionLawBias).toBe(50);
    expect(budget.unionsBanned).toBe(true);
    expect(union.suspended).toBe(true);
  });

  it("does not apply a law to a different country budget", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "union-law-country-gate", playerName: "Alex" });
    const otherUnion = world.unions["UK-manufacturing"]!;
    applyUnionLawProvision(world, "UK", { type: "union_law", bias: 10, banAction: "ban" });
    expect(world.budgets.UK?.unionsBanned).toBe(true);
    expect(otherUnion.suspended).toBe(true);
    expect(world.budgets.US?.unionsBanned).not.toBe(true);
  });

  it("uses the public authorized bill action, survives save/reload, and feeds the corporation strike step", () => {
    const world = createWorld({ era: "1953", countryId: "US", mode: "hos", seed: "union-law-public-enactment", playerName: "Alex" });
    world.player.actions = 20;
    const union = world.unions["US-manufacturing"]!;
    const asset = Object.values(corporateSectorAssets(world)).find((row) => row.countryId === "US")!;
    asset.unionization = 20;
    asset.strikeStartedAtTurn = world.meta.turn;
    asset.workerExpectationIndex = 2;

    const ban = executeAction(world, "player", "sponsorBill", { catalogId: "labour.union_law", banAction: "ban" });
    expect(ban.ok).toBe(true);
    expect(world.budgets.US?.unionsBanned).toBe(true);
    expect(union.suspended).toBe(true);
    expect(labourFactorsForCorporation(world, asset.corporationId, loadCorporationLabourState(world, world.meta.turn))).toMatchObject({
      outputFactor: 1,
      strikeActive: false,
      marginModifierPP: 0,
    });
    expect(world.bills.at(-1)?.provisions[0]).toMatchObject({ type: "union_law", bias: 0, banAction: "ban" });

    const loaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(loaded.meta.schemaVersion).toBe(59);
    expect(loaded.budgets.US?.unionsBanned).toBe(true);
    expect(loaded.unions[union.id]?.suspended).toBe(true);
    const loadedAsset = Object.values(corporateSectorAssets(loaded)).find((row) => row.id === asset.id)!;
    const strikeResult = stepCorporateSectorStrikes(loaded, loaded.meta.turn + 1, loadCorporationLabourState(loaded, loaded.meta.turn + 1));
    expect(loadedAsset.unionization).toBe(17);
    expect(strikeResult.resolvedBanned).toBe(1);
    expect(loadedAsset.strikeStartedAtTurn).toBeNull();

    loaded.player.actions = 20;
    const repeal = executeAction(loaded, "player", "sponsorBill", { catalogId: "labour.union_law", banAction: "repeal_ban" });
    expect(repeal.ok).toBe(true);
    expect(loaded.budgets.US?.unionsBanned).toBe(false);
    expect(loaded.unions[union.id]?.suspended).toBe(false);
    expect(loadedAsset.unionization).toBe(17);
  });

  it("refuses a public union-law bill aimed at another country", () => {
    const world = createWorld({ era: "1953", countryId: "US", mode: "hos", seed: "union-law-public-country-gate", playerName: "Alex" });
    world.player.actions = 20;
    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "labour.union_law",
      banAction: "ban",
      sponsorCountryId: "UK",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/outside the player's country/);
    expect(world.budgets.US?.unionsBanned).not.toBe(true);
    expect(world.budgets.UK?.unionsBanned).not.toBe(true);
  });

  it("round-trips enacted ban state, refuses lossy v42 export, and leaves historical absence absent", () => {
    const world = createWorld({ era: "1953", countryId: "US", mode: "hos", seed: "union-law-save-boundary", playerName: "Alex" });
    world.player.actions = 20;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "labour.union_law", banAction: "ban" }).ok).toBe(true);
    const contents = serializeSave(world, "2026-10-02T00:00:00.000Z");
    expect(deserializeSave(contents).budgets.US?.unionsBanned).toBe(true);
    expect(projectSaveToV42(contents)).toMatchObject({ ok: false, error: expect.stringMatching(/union-law state/) });

    const invalidBudgetSave = JSON.parse(contents) as {
      world: { budgets: Record<string, Record<string, unknown>> };
    };
    invalidBudgetSave.world.budgets.US!.unionLawBias = 51;
    expect(() => deserializeSave(JSON.stringify(invalidBudgetSave))).toThrow(/unionLawBias/);
    const invalidProvisionSave = JSON.parse(contents) as {
      world: { bills: Array<{ provisions: Array<Record<string, unknown>> }> };
    };
    invalidProvisionSave.world.bills.at(-1)!.provisions[0]!.banAction = "lift-all-rules";
    expect(() => deserializeSave(JSON.stringify(invalidProvisionSave))).toThrow(/union-law provision/);

    const historic = createWorld({ era: "1953", countryId: "US", seed: "union-law-historical-absence", playerName: "Alex" });
    const parsed = JSON.parse(serializeSave(historic, "2026-10-02T00:00:00.000Z")) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; budgets: Record<string, Record<string, unknown>> };
    };
    parsed.schemaVersion = 58;
    parsed.world.meta.schemaVersion = 58;
    const migrated = deserializeSave(JSON.stringify(parsed));
    expect(migrated.meta.schemaVersion).toBe(59);
    expect(migrated.budgets.US?.unionsBanned).toBeUndefined();
    expect(migrated.budgets.US?.unionLawBias).toBeUndefined();
  });
});
