import { describe, expect, it } from "vitest";
import { createWorld } from "../../world.js";
import { advanceTurn } from "../../engine.js";
import { deserializeSave, serializeSave } from "../../save.js";
import { corporatePlantProductionPhase, sourceCorpDailyGrossRevenueLocal, technologyOutputUnitsMultiplier } from "../plantProduction.js";
import { corporateSectorBasePrices, SOURCE_DEFAULT_OPERATING_SUPPLY } from "../plantCapacity.js";
import { getSectorTechEffects, getTreeForType } from "./selectors.js";
import { foundingTechState, unlockNppCorporationTech } from "./nppUnlock.js";
import { validateCorporateCashLedger } from "../corporateCashLedger.js";

describe("source corporate technology state", () => {
  it("uses the source decade tree, cost, prerequisites and deterministic NPP lane pick", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-tech-unlock", playerName: "Alex" });
    const corp = world.corporations["US-energy"]!;
    corp.revenue = 7_000;
    corp.liquidCapital = 100_000;
    corp.rdScore = 100;
    corp.unlockedTechNodeIds = foundingTechState("energy", 1953).unlockedTechNodeIds;
    const cashBefore = corp.liquidCapital;
    const rdBefore = corp.rdScore;
    const eligible = getTreeForType("energy").find((node) => node.id === "energy-1950-1")!;
    expect(eligible.effects).toContainEqual({ kind: "unlockStrategy", strategyId: "nuclear" });

    const unlocked = unlockNppCorporationTech(world, corp, 1953);
    expect(unlocked).toBe("energy-1950-1");
    expect(corp.unlockedTechNodeIds).toContain(unlocked);
    expect(world.corporateCashLedger?.[0]?.amount).toBe(corp.liquidCapital - cashBefore);
    expect(world.corporateCashLedger?.[0]?.meta.rdCost).toBe(rdBefore! - corp.rdScore!);
    expect(corp.techDecadeLane).toEqual({ "1950": "sector" });
    expect(corp.techDecadeChosenTurn).toEqual({ "1950": world.meta.turn });
    expect(corp.rdScore).toBe(92);
    expect(corp.liquidCapital).toBe(99_850); // round((7000 / 7) * 0.15)
    expect(getSectorTechEffects({ type: "energy", ...corp }, "energy").marginBonusPp).toBeGreaterThan(0);
  });

  it("preserves the source NPP cash floor when selecting an affordable technology", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-tech-cash-floor", playerName: "Alex" });
    const corp = world.corporations["US-energy"]!;
    corp.revenue = 7_000;
    corp.liquidCapital = 100_000;
    corp.rdScore = 100;
    corp.unlockedTechNodeIds = foundingTechState("energy", 1953).unlockedTechNodeIds;

    expect(unlockNppCorporationTech(world, corp, 1953, 99_900)).toBeUndefined();
    expect(corp.liquidCapital).toBe(100_000);
    expect(corp.rdScore).toBe(100);
    expect(corp.unlockedTechNodeIds).not.toContain("energy-1950-1");
  });

  it("prices NPP technology from source daily receipts with the owned-capacity floor", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-tech-daily-gross", playerName: "Alex" });
    const corporation = world.corporations["US-energy"]!;
    corporation.revenue = 7_000;
    const assetId = "corporate-sector:US:energy:US-energy";
    world.corporateSectors = { [assetId]: {
      id: assetId, corporationId: corporation.id, countryId: "US", stateId: null,
      sectorType: "energy", capitalStock: 0, realizedRevenue: 7_000, workers: 1,
      representingUnionId: null, forSale: null, owner: "corporation",
    } };
    expect(sourceCorpDailyGrossRevenueLocal(world, corporation.id)).toBe(1_000);

    world.corporateSectors[assetId]!.capitalStock = 10_000;
    const prices = corporateSectorBasePrices(world);
    const capacityBasis = 10_000 / Object.entries(SOURCE_DEFAULT_OPERATING_SUPPLY.energy)
      .reduce((sum, [commodity, rate]) => sum + rate! / prices[commodity as keyof typeof prices]!, 0);
    expect(sourceCorpDailyGrossRevenueLocal(world, corporation.id)).toBeCloseTo(Math.max(1_000, capacityBasis), 8);
  });

  it("applies a researched output-rate effect to physical supply and resumes identically", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-tech-output", playerName: "Alex" });
    const corporation = world.corporations["US-energy"]!;
    const assetId = "corporate-sector:US:energy:US-energy";
    const outputNode = getTreeForType("energy").find((node) =>
      node.decadeId === "1950" && node.effects.some((effect) => effect.kind === "outputRate" && effect.commodity === "energy"),
    )!;
    corporation.unlockedTechNodeIds = [...(corporation.unlockedTechNodeIds ?? []), outputNode.id];
    world.corporateSectors = { [assetId]: {
      id: assetId, corporationId: corporation.id, countryId: "US", stateId: null,
      sectorType: "energy", capitalStock: 100_000, workers: 1,
      representingUnionId: null, forSale: null, owner: "corporation",
    } };
    for (const row of Object.values(world.commodityPrices)) {
      row.globalSupply = 0;
      row.globalDemand = 1_000_000_000;
      row.globalPrice = row.basePrice;
    }
    world.commodityPrices.energy!.globalPrice = world.commodityPrices.energy!.basePrice * 1.4;
    const direct = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    const resumed = direct;
    const unteched = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    unteched.corporations[corporation.id]!.unlockedTechNodeIds = (unteched.corporations[corporation.id]!.unlockedTechNodeIds ?? [])
      .filter((id) => id !== outputNode.id);
    corporatePlantProductionPhase.run(world);
    corporatePlantProductionPhase.run(resumed);
    corporatePlantProductionPhase.run(unteched);

    const sourceEffects = getSectorTechEffects({ type: "energy", ...corporation }, "energy");
    const sourceMultiplier = technologyOutputUnitsMultiplier(
      SOURCE_DEFAULT_OPERATING_SUPPLY.energy,
      sourceEffects.outputRateMult,
      corporateSectorBasePrices(world),
    );
    const untechedEffects = getSectorTechEffects(
      { type: "energy", ...unteched.corporations[corporation.id]! },
      "energy",
    );
    const untechedMultiplier = technologyOutputUnitsMultiplier(
      SOURCE_DEFAULT_OPERATING_SUPPLY.energy,
      untechedEffects.outputRateMult,
      corporateSectorBasePrices(world),
    );
    const directAsset = world.corporateSectors[assetId]!;
    const resumedAsset = resumed.corporateSectors[assetId]!;
    expect(sourceMultiplier).toBeGreaterThan(1);
    expect(directAsset.producedUnits).toBe(resumedAsset.producedUnits);
    expect(directAsset.producedUnits).toBeCloseTo(
      unteched.corporateSectors[assetId]!.producedUnits! * sourceMultiplier / untechedMultiplier,
      7,
    );
    expect(world.plantMarketDemand!.corporateOutputSupply!.energy).not.toBe(
      unteched.plantMarketDemand!.corporateOutputSupply!.energy,
    );
    expect(directAsset.realizedRevenue).not.toBe(unteched.corporateSectors[assetId]!.realizedRevenue);
    expect(directAsset.producedUnits).toBeGreaterThan((directAsset.capitalStock ?? 0) * 0.999);
    expect(resumedAsset.producedUnits).toBe(directAsset.producedUnits);
    expect(resumedAsset.plantsPnl).toEqual(directAsset.plantsPnl);
    expect(resumed.corporations[corporation.id]!.unlockedTechNodeIds).toEqual(
      world.corporations[corporation.id]!.unlockedTechNodeIds,
    );
  });

  it("leaves old technology history absent on schema migration", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-tech-migration", playerName: "Alex" });
    const raw = JSON.parse(serializeSave(world, "2026-10-02T00:00:00.000Z")) as Record<string, unknown>;
    raw.schemaVersion = 57;
    const oldWorld = raw.world as { meta: { schemaVersion: number }; corporations: Record<string, Record<string, unknown>> };
    oldWorld.meta.schemaVersion = 57;
    for (const corp of Object.values(oldWorld.corporations)) {
      delete corp.unlockedTechNodeIds;
      delete corp.techDecadeLane;
      delete corp.techDecadeChosenTurn;
    }
    const restored = deserializeSave(JSON.stringify(raw));
    expect(restored.meta.schemaVersion).toBe(62);
    expect(restored.corporations["US-energy"]!.unlockedTechNodeIds).toBeUndefined();
    expect(restored.corporations["US-energy"]!.techDecadeLane).toBeUndefined();
    expect(restored.corporateCashLedger).toBeUndefined();
  });

  it("buys one NPP node after settlement and resumes the next public turn identically", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-tech-public-turn", playerName: "Alex" });
    const corp = world.corporations["US-energy"]!;
    const assetId = "corporate-sector:US:energy:US-energy";
    const priorIds = [...(corp.unlockedTechNodeIds ?? [])];
    corp.revenue = 7_000;
    corp.liquidCapital = 100_000;
    corp.rdScore = 100;
    corp.rdBudgetPerTurn = 0;
    world.corporateSectors = { [assetId]: {
      id: assetId, corporationId: corp.id, countryId: "US", stateId: null,
      sectorType: "energy", capitalStock: 100_000, workers: 1,
      representingUnionId: null, forSale: null, owner: "corporation",
    } };
    for (const row of Object.values(world.commodityPrices)) row.globalDemand = 1_000_000_000;

    advanceTurn(world);
    const acquired = (corp.unlockedTechNodeIds ?? []).filter((id) => !priorIds.includes(id));
    expect(acquired).toHaveLength(1);
    expect(acquired[0]).toBe("energy-1950-1");
    const cashRows = world.corporateCashLedger ?? [];
    expect(cashRows).toHaveLength(1);
    expect(cashRows[0]).toMatchObject({
      id: `tech-unlock:${corp.id}:energy-1950-1:t${world.meta.turn}`,
      type: "corp_tech_unlock",
      turn: world.meta.turn,
      corporationId: corp.id,
      amount: expect.any(Number),
      currencyCode: "USD",
      meta: { ledgerKey: cashRows[0]!.id, nodeId: "energy-1950-1", rdCost: expect.any(Number) },
    });
    expect(cashRows[0]!.amount).toBeLessThan(0);
    validateCorporateCashLedger(cashRows);
    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(resumed.corporateCashLedger).toEqual(cashRows);
    const corrupted = JSON.parse(serializeSave(world, "2026-10-02T00:00:00.000Z")) as {
      world: { corporateCashLedger: Array<{ amount: number }> };
    };
    corrupted.world.corporateCashLedger[0]!.amount *= -1;
    expect(() => deserializeSave(JSON.stringify(corrupted))).toThrow(/Invalid corporate cash ledger amount/);
    advanceTurn(world);
    advanceTurn(resumed);
    expect(resumed.corporateSectors?.[assetId]?.plantsPnl).toEqual(world.corporateSectors?.[assetId]?.plantsPnl);
    expect(resumed.corporateSectors?.[assetId]?.producedUnits).toBe(world.corporateSectors?.[assetId]?.producedUnits);
    expect(resumed.corporations[corp.id]?.unlockedTechNodeIds).toEqual(corp.unlockedTechNodeIds);
    expect(resumed.corporations[corp.id]?.liquidCapital).toBe(corp.liquidCapital);
    expect(resumed.corporations[corp.id]?.rdScore).toBe(corp.rdScore);
    expect(resumed.corporateCashLedger).toEqual(world.corporateCashLedger);
  });
});
