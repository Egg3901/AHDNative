import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices } from "./plantCapacity.js";
import { applyNppCapacityReplacement, applyNppSourceFounding, findSourceNppEntryCandidate, sourceExpansionFrontierStates, sourceUnownedHeadroomUnits } from "./nppCapacityReinvestment.js";
import { validateCorporateCashLedger } from "./corporateCashLedger.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { CEO_ARCHETYPE_MODIFIERS } from "./constants.js";

describe("source NPP capacity replacement", () => {
  it("founds one located source-sized plant, debits cash and draws only that pool", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-source-founding", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.headquartersRegionId = "DC";
    corp.liquidCapital = 100_000_000;
    corp.profitMargin = 35;
    corp.effectiveProfitMargin = 35;
    world.centralBanks.US!.primeRate = 4;
    world.regionalMetrics.VA ??= {};
    world.regionalMetrics.VA!["economic.costOfLiving"] = { value: 120 };
    world.unownedSectors["US:VA:manufacturing"] = { countryId: "US", sectorType: "manufacturing", regionId: "VA", revenue: 50_000_000 };
    const poolBefore = world.unownedSectors["US:VA:manufacturing"]!.revenue;
    const headroomBefore = sourceUnownedHeadroomUnits(world, world.unownedSectors["US:VA:manufacturing"]!);
    const cashBefore = corp.liquidCapital;
    const pricingAssets = Object.values(corporateSectorAssets(world)).filter((asset) => asset.countryId === "US" && asset.sectorType === "manufacturing" && asset.stateId !== null);
    const nationalOwned = pricingAssets.reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0);
    const issuerOwned = pricingAssets.filter((asset) => asset.corporationId === corp.id).reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0);
    const nationalShare = nationalOwned > 0 ? issuerOwned / nationalOwned * 100 : 0;
    const nationalDominance = nationalShare <= 30 ? 1 : 1 + 2 * ((nationalShare - 30) / 70) ** 2;
    applyNppSourceFounding(world);
    const assetId = `corporate-sector:US:manufacturing:${corp.id}:VA`;
    const asset = world.corporateSectors?.[assetId];
    expect(asset).toMatchObject({ countryId: "US", stateId: "VA", sectorType: "manufacturing", owner: "corporation" });
    expect(asset?.buildQueue?.[0]?.unitsOrdered).toBeGreaterThanOrEqual(25);
    expect(asset?.buildQueue?.[0]?.onlineTurn).toBeGreaterThan(world.meta.turn);
    expect(world.unownedSectors["US:VA:manufacturing"]!.revenue).toBeLessThan(poolBefore);
    expect(corp.liquidCapital).toBeLessThan(cashBefore);
    expect(world.corporateCashLedger?.[0]).toMatchObject({
      type: "corp_sector_founding", corporationId: corp.id,
      amount: corp.liquidCapital - cashBefore,
      meta: { ledgerKey: world.corporateCashLedger?.[0]?.id, sectorId: assetId, sectorType: "manufacturing", entryFeeAnchor: expect.any(Number) },
    });
    const row = world.corporateCashLedger?.[0];
    const scale = getEraNominalScale(world.meta.era);
    const feeAnchor = Math.round(100_000 * scale);
    const unitCost = capacityPricePerUnitAnchor("manufacturing", corporateSectorBasePrices(world), null, Number(world.meta.date.slice(0, 4))) * nationalDominance * 1.4 * 1.2 * 0.9;
    const cashFloorAnchor = Math.max(Math.max(1, Math.round(125_000 * scale)), Math.round(250_000 * scale * CEO_ARCHETYPE_MODIFIERS[corp.archetype].cashFloorMult));
    const deployBudget = Math.max(0, (cashBefore - cashFloorAnchor - feeAnchor) * 0.6);
    const affordableUnits = Math.floor(deployBudget / unitCost);
    const expectedUnits = Math.max(25, Math.floor(Math.min(headroomBefore * 0.5, affordableUnits, 10_000_000)));
    expect(row?.meta.units).toBe(expectedUnits);
    expect(row?.meta.costAnchor).toBeCloseTo(expectedUnits * unitCost, 6);
    expect(row?.meta.entryFeeAnchor).toBe(feeAnchor);
    validateCorporateCashLedger(world.corporateCashLedger);
    applyNppSourceFounding(world);
    expect(world.corporateCashLedger).toHaveLength(1);
    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    applyNppSourceFounding(resumed);
    expect(resumed.corporateCashLedger).toEqual(world.corporateCashLedger);
    expect(resumed.unownedSectors["US:VA:manufacturing"]).toEqual(world.unownedSectors["US:VA:manufacturing"]);
    expect(resumed.corporateSectors?.[assetId]).toEqual(world.corporateSectors?.[assetId]);
  });

  it("converts local unowned revenue into source standard-mix headroom units", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-headroom-fx", playerName: "Alex" });
    world.exchangeRates!["US"]!.rate = 2;
    const pool = { countryId: "US", sectorType: "manufacturing" as const, revenue: 2_000_000 };
    // Independent Game formula: anchor revenue × Σ(default supply / modern base price) × eraUnitScale.
    const sourceUnits = 1_000_000 * (0.4 / 800 + 0.2 / 400) * 69.76744186046511;
    expect(sourceUnownedHeadroomUnits(world, pool)).toBeCloseTo(sourceUnits, 6);
  });

  it("selects an actual source-authored frontier pool using headroom and shortage rank", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-entry-frontier", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    corp.headquartersRegionId = "DC";
    const frontier = sourceExpansionFrontierStates(corp, []);
    expect([...frontier].sort()).toEqual(["MD", "VA"]);
    world.unownedSectors = {
      ...world.unownedSectors,
      "US:VA:manufacturing": { countryId: "US", sectorType: "manufacturing", regionId: "VA", revenue: 2_000_000 },
      "US:MD:manufacturing": { countryId: "US", sectorType: "manufacturing", regionId: "MD", revenue: 1_000_000 },
      "US:CA:manufacturing": { countryId: "US", sectorType: "manufacturing", regionId: "CA", revenue: 20_000_000 },
    };
    const candidate = findSourceNppEntryCandidate(world, corp);
    expect(candidate?.pool.regionId).toBe("VA");
    expect(candidate?.headroomUnits).toBeGreaterThan(0);
    expect(candidate?.shortageScore).toBeCloseTo(1, 8);
    world.unownedSectors["US:MD:logistics"] = { countryId: "US", sectorType: "logistics", regionId: "MD", revenue: 2_000_000 };
    world.commodityPrices.freight!.globalPrice = world.commodityPrices.freight!.basePrice * 2;
    const shortageCandidate = findSourceNppEntryCandidate(world, corp);
    expect(shortageCandidate?.pool).toMatchObject({ regionId: "MD", sectorType: "logistics" });
    expect(shortageCandidate?.peakShortageScore).toBe(2);
  });

  it("writes a source-sized replacement order with the matching cash debit and resumes identically", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-capacity-replacement", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    const assetId = "corporate-sector:US:manufacturing:US-manufacturing";
    corp.liquidCapital = 10_000_000;
    world.corporateSectors = { [assetId]: {
      id: assetId, corporationId: corp.id, countryId: "US", stateId: null,
      sectorType: "manufacturing", capitalStock: 1_000, producedUnits: 800,
      soldUnits: 760, workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
    } };
    const asset = world.corporateSectors[assetId]!;
    const cashBefore = corp.liquidCapital;
    const listPrice = capacityPricePerUnitAnchor("manufacturing", corporateSectorBasePrices(world), undefined, 1953);

    // Game reinvest.test vector: 1,000 nameplate, 800 produced, 95% sell-through,
    // one-turn accrual. Source: runUnits * 0.0005 * accrual * fillScale.
    const expectedUnits = 1_000 * 0.8 * 0.0005 * (0.5 + 0.5 * ((0.95 - 0.85) / 0.15));
    const expectedAnchorCost = expectedUnits * listPrice;
    applyNppCapacityReplacement(world);

    expect(asset.buildQueue).toHaveLength(1);
    expect(asset.buildQueue?.[0]).toMatchObject({ unitsOrdered: expectedUnits, costPaidAnchor: expectedAnchorCost, startTurn: world.meta.turn });
    expect(asset.constructionInProgressAnchor).toBe(Math.round(expectedAnchorCost));
    expect(corp.liquidCapital).toBeLessThan(cashBefore);
    const row = world.corporateCashLedger?.[0];
    expect(row).toMatchObject({
      type: "corp_capacity_build", corporationId: corp.id, amount: corp.liquidCapital - cashBefore,
      meta: { ledgerKey: row?.id, sectorId: assetId, sectorType: "manufacturing", units: expectedUnits, costAnchor: expectedAnchorCost },
    });
    validateCorporateCashLedger(world.corporateCashLedger);

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    resumed.meta.turn += 1;
    world.meta.turn += 1;
    applyNppCapacityReplacement(world);
    applyNppCapacityReplacement(resumed);
    expect(resumed.corporateSectors?.[assetId]?.buildQueue).toEqual(world.corporateSectors?.[assetId]?.buildQueue);
    expect(resumed.corporateSectors?.[assetId]?.constructionInProgressAnchor).toBe(world.corporateSectors?.[assetId]?.constructionInProgressAnchor);
    expect(resumed.corporations[corp.id]?.liquidCapital).toBe(world.corporations[corp.id]?.liquidCapital);
    expect(resumed.corporateCashLedger).toEqual(world.corporateCashLedger);
  });

  it("does not replace an underfilled, state-owned, or doubly queued asset", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-capacity-replacement-gates", playerName: "Alex" });
    const corp = world.corporations["US-energy"]!;
    const assetId = "corporate-sector:US:energy:US-energy";
    corp.liquidCapital = 10_000_000;
    const base = { id: assetId, corporationId: corp.id, countryId: "US", stateId: null, sectorType: "energy" as const, capitalStock: 1_000, producedUnits: 800, soldUnits: 600, workers: 1, representingUnionId: null, forSale: null, owner: "corporation" as const };
    world.corporateSectors = { [assetId]: base };
    applyNppCapacityReplacement(world);
    expect(world.corporateSectors[assetId]?.buildQueue).toBeUndefined();
    base.soldUnits = 800;
    corp.ownershipState = "stateOwned";
    applyNppCapacityReplacement(world);
    expect(world.corporateSectors[assetId]?.buildQueue).toBeUndefined();
  });
});
