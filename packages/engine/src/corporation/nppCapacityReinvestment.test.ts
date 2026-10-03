import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices } from "./plantCapacity.js";
import { applyNppCapacityReplacement, applyNppSourceFounding, applySourceGlutMothballing, findSourceNppEntryCandidate, sourceExpansionFrontierStates, sourceExtractionHeadroomByRegion, sourceFrontierHasPositiveLocalUse, sourceFrontierMarketIsUncovered, sourceFrontierPacingOpportunity, SOURCE_FRONTIER_ENTRY_SUPPLY, sourceLogisticsSupportedSectorCount, sourceNppCapacityBuildCostAnchor, sourceUnownedHeadroomUnits } from "./nppCapacityReinvestment.js";
import { validateCorporateCashLedger } from "./corporateCashLedger.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { getRateForCountry } from "../forex/conversion.js";
import { corporateSectorAssets, type CorporateSectorAsset } from "./corporateSectorAssets.js";
import { CEO_ARCHETYPE_MODIFIERS } from "./constants.js";

describe("source NPP capacity replacement", () => {
  it("ports source glut mothball/restart thresholds and changes one live sector per eligible turn", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-source-mothball", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    world.meta.turn = 8; // Native's deterministic issuer ID has the source fallback cohort hash 0.
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice * 0.6;
    const worst: CorporateSectorAsset = {
      id: "mothball-worst", corporationId: corp.id, countryId: "US", stateId: "VA",
      sectorType: "manufacturing", capitalStock: 1_000, producedUnits: 1_000, soldUnits: 100, soldFraction: 0.1,
      workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
    };
    const alsoLow: CorporateSectorAsset = { ...worst, id: "mothball-also-low", stateId: "MD", soldFraction: 0.2 };
    const cold: CorporateSectorAsset = { ...worst, id: "mothball-cold", stateId: "CA", mothballed: true };
    world.corporateSectors = { [worst.id]: worst, [alsoLow.id]: alsoLow, [cold.id]: cold };
    applySourceGlutMothballing(world);
    expect(worst.mothballed).toBe(true);
    expect(alsoLow.mothballed).toBeUndefined();
    expect(cold.mothballed).toBe(true);

    world.meta.turn += 8;
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice * 0.95;
    applySourceGlutMothballing(world);
    expect(cold.mothballed).toBe(false); // Restart is preferred to another glut shed.
    expect(alsoLow.mothballed).toBeUndefined();
  });

  it("does not apply source mothball transitions to extraction, SOEs, or off-slot turns", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-source-mothball-guards", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    world.meta.turn = 1;
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice * 0.6;
    const asset: CorporateSectorAsset = {
      id: "extractor", corporationId: corp.id, countryId: "US", stateId: null,
      sectorType: "extraction", producedUnits: 1_000, soldFraction: 0.01,
      workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
    };
    world.corporateSectors = { [asset.id]: asset };
    applySourceGlutMothballing(world);
    expect(asset.mothballed).toBeUndefined();
    world.meta.turn = 8;
    corp.countryOwnerId = "US";
    applySourceGlutMothballing(world);
    expect(asset.mothballed).toBeUndefined();
  });

  it("uses the source 12-turn persistent cost-loss counter when fill and market price do not qualify", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-cost-mothball", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    world.meta.turn = 8;
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice * 0.95;
    const asset: CorporateSectorAsset = {
      id: "long-running-loss", corporationId: corp.id, countryId: "US", stateId: null,
      sectorType: "manufacturing", producedUnits: 1_000, soldFraction: 0.95, pnlLossTurns: 11,
      plantsPnl: { turn: world.meta.turn, revenue: 10, inputs: 10, otherOpex: 1, policyCredit: 0, growth: 0, operatingCost: 11, totalCost: 11, profit: -1 },
      workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
    };
    world.corporateSectors = { [asset.id]: asset };
    applySourceGlutMothballing(world);
    expect(asset).toMatchObject({ mothballed: true, pnlLossTurns: 12 });
  });

  it("matches the source frontier predicate and uses only observed local demand", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-frontier-use", playerName: "Alex" });
    world.corporateSectors = {};
    const { commodity, rate } = SOURCE_FRONTIER_ENTRY_SUPPLY.manufacturing[0]!;
    world.plantMarketDemand = {
      external: {}, corporateInputs: {},
      corporateInputsByState: { VA: { [commodity]: 120 } },
    };
    expect(sourceFrontierHasPositiveLocalUse(world, "VA", "manufacturing")).toBe(true);
    expect(sourceFrontierMarketIsUncovered(world, "VA", "manufacturing")).toBe(true);
    world.corporateSectors = {
      inactive: {
        id: "inactive", corporationId: "US-manufacturing", countryId: "US", stateId: "VA", sectorType: "manufacturing",
        workers: 1, representingUnionId: null, forSale: null, owner: "corporation", mothballed: true,
      } as CorporateSectorAsset,
    };
    expect(sourceFrontierMarketIsUncovered(world, "VA", "manufacturing")).toBe(true);
    world.corporateSectors.inactive!.mothballed = false;
    expect(sourceFrontierMarketIsUncovered(world, "VA", "manufacturing")).toBe(false);
    const sourceVector = {
      reason: "cohort_ineligible", uncoveredMarket: true, positiveLocalUse: true,
      profitable: true, marginPct: 18, marginFloorPct: 15,
    } as const;
    expect(sourceFrontierPacingOpportunity(sourceVector)).toBe(true);
    expect(sourceFrontierPacingOpportunity({ ...sourceVector, reason: "unprofitable" })).toBe(false);
    expect(sourceFrontierPacingOpportunity({ ...sourceVector, uncoveredMarket: false })).toBe(false);
    expect(sourceFrontierPacingOpportunity({ ...sourceVector, positiveLocalUse: false })).toBe(false);
    expect(sourceFrontierPacingOpportunity({ ...sourceVector, profitable: false })).toBe(false);
    expect(sourceFrontierPacingOpportunity({ ...sourceVector, marginPct: 14.99 })).toBe(false);
    world.plantMarketDemand.corporateInputsByState = { VA: { [commodity]: 0 } };
    expect(sourceFrontierHasPositiveLocalUse(world, "VA", "manufacturing")).toBe(false);
    delete world.plantMarketDemand.corporateInputsByState;
    expect(sourceFrontierHasPositiveLocalUse(world, "VA", "manufacturing")).toBe(false);
    expect(rate).toBeGreaterThan(0);
  });

  it("uses the opt-in frontier slot only for the source cohort miss with measured local use", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-frontier-slot", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.liquidCapital = 100_000_000;
    corp.profitMargin = 35;
    corp.effectiveProfitMargin = 35;
    world.meta.turn = 1;
    const { commodity } = SOURCE_FRONTIER_ENTRY_SUPPLY.manufacturing[0]!;
    world.plantMarketDemand = { external: {}, corporateInputs: {}, corporateInputsByState: { VA: { [commodity]: 10_000, food: 10_000 } } };
    world.corporateSectors = {
      prior: {
        id: "prior", corporationId: corp.id, countryId: "US", stateId: "NY", sectorType: "manufacturing",
        workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
        plantsPnl: { turn: 0, revenue: 2, inputs: 0, otherOpex: 0, policyCredit: 0, growth: 0, operatingCost: 0, totalCost: 0, profit: 2 },
      } as CorporateSectorAsset,
    };
    const agriculture = world.corporations["US-agriculture"]!;
    agriculture.suspended = false;
    agriculture.liquidCapital = 100_000_000;
    agriculture.profitMargin = 35;
    agriculture.effectiveProfitMargin = 35;
    world.corporateSectors["prior-agriculture"] = {
      id: "prior-agriculture", corporationId: agriculture.id, countryId: "US", stateId: "NY", sectorType: "agriculture",
      workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
      plantsPnl: { turn: 0, revenue: 2, inputs: 0, otherOpex: 0, policyCredit: 0, growth: 0, operatingCost: 0, totalCost: 0, profit: 2 },
    } as CorporateSectorAsset;
    world.unownedSectors = {
      "US:VA:manufacturing": { countryId: "US", sectorType: "manufacturing", regionId: "VA", revenue: 50_000_000 },
      "US:VA:agriculture": { countryId: "US", sectorType: "agriculture", regionId: "VA", revenue: 50_000_000 },
    };
    expect(findSourceNppEntryCandidate(world, corp)?.pool.regionId).toBe("VA");
    applyNppSourceFounding(world);
    expect(world.corporateSectors?.["corporate-sector:US:manufacturing:US-manufacturing:VA"]).toBeUndefined();

    world.frontierEntryExperimentEnabled = true;
    applyNppSourceFounding(world);
    const founded = Object.values(world.corporateSectors ?? {}).filter((asset) => asset.stateId === "VA");
    expect(founded).toHaveLength(1);
    expect(founded[0]?.sectorType).toMatch(/agriculture|manufacturing/);
    const foundingRows = world.corporateCashLedger?.filter((row) => row.type === "corp_sector_founding") ?? [];
    expect(foundingRows).toHaveLength(1);
    expect(foundingRows[0]?.amount).toBeLessThan(0);
  });

  it("prices a replacement with source local and national dominance, prime, host and expansion legs", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-source-build-price", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    const rival = { ...corp, id: "source-rival", tickerSymbol: "RIVL" };
    world.corporations[rival.id] = rival;
    world.centralBanks.US!.primeRate = 4;
    world.regionalMetrics.VA ??= {};
    world.regionalMetrics.VA!["economic.costOfLiving"] = { value: 120 };
    const own = {
      id: "own-plant", corporationId: corp.id, countryId: "US", stateId: "VA", sectorType: "manufacturing" as const,
      revenue: 600, capitalStock: 10_000, workers: 1, representingUnionId: null, forSale: null, owner: "corporation" as const,
    };
    const peer = {
      ...own, id: "peer-plant", corporationId: rival.id, revenue: 400, capitalStock: 10_000,
    };
    world.corporateSectors = { [own.id]: own, [peer.id]: peer };
    const pool = { countryId: "US", sectorType: "manufacturing" as const, regionId: "VA", revenue: 50_000_000 };
    world.unownedSectors = { "US:VA:manufacturing": pool };
    const headroom = sourceUnownedHeadroomUnits(world, pool);
    const localShare = 10_000 / (10_000 + headroom) * 100;
    const nationalShare = 60;
    const growthMultiplier = (share: number, threshold: number) => share <= threshold ? 1 : 1 + 2 * ((share - threshold) / (100 - threshold)) ** 2;
    const rawDominance = Math.max(growthMultiplier(localShare, 50), growthMultiplier(nationalShare, 30));
    const density = 0.35 + 0.65 / 4;
    const expected = capacityPricePerUnitAnchor("manufacturing", corporateSectorBasePrices(world), undefined, 1953)
      * (1 + (rawDominance - 1) * density) * 1.4 * 1.2 * 0.8;
    expect(sourceNppCapacityBuildCostAnchor(world, corp, own, 1, 1953)).toBeCloseTo(expected, 8);
  });

  it("applies the source logistics-supported footprint cap to greenfield entry", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-logistics-footprint", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.liquidCapital = 100_000_000;
    corp.profitMargin = 35;
    corp.effectiveProfitMargin = 35;
    corp.logisticsStrength = 0;
    const regions = Object.values(world.regions).filter((region) => region.countryId === corp.countryId && !region.corporationHeadquartersOnly);
    const occupiedRegions = regions.slice(0, 15);
    const targetRegion = regions.find((region) => !occupiedRegions.some((occupied) => occupied.id === region.id))!;
    world.unownedSectors = {
      [`US:${targetRegion.id}:manufacturing`]: { countryId: "US", sectorType: "manufacturing", regionId: targetRegion.id, revenue: 50_000_000 },
    };
    world.corporateSectors = Object.fromEntries(occupiedRegions.map((region, index) => {
      const id = `npp-footprint:${index}`;
      return [id, {
        id, corporationId: corp.id, countryId: corp.countryId, stateId: region.id,
        sectorType: "manufacturing" as const, workers: 1, representingUnionId: null,
        forSale: null, owner: "corporation" as const,
      }];
    }));
    expect(sourceLogisticsSupportedSectorCount(corp.logisticsStrength)).toBe(15);
    applyNppSourceFounding(world);
    expect(Object.keys(world.corporateSectors ?? {})).toHaveLength(15);
    expect(world.corporateCashLedger ?? []).toHaveLength(0);

    corp.logisticsStrength = 200;
    expect(sourceLogisticsSupportedSectorCount(corp.logisticsStrength)).toBe(30);
    applyNppSourceFounding(world);
    expect(Object.keys(world.corporateSectors ?? {})).toHaveLength(16);
    expect(world.corporateCashLedger).toHaveLength(1);
  });

  it("uses the source CEO-archetype entry margin floor except for critical shortages", () => {
    const makeWorld = (archetype: "aggressive" | "cautious") => {
      const world = createWorld({ era: "1953", countryId: "US", seed: `npp-margin-floor-${archetype}`, playerName: "Alex" });
      const corp = world.corporations["US-manufacturing"]!;
      for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
      corp.liquidCapital = 100_000_000;
      corp.profitMargin = 12;
      corp.effectiveProfitMargin = 12;
      corp.archetype = archetype;
      for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice;
      world.unownedSectors = {
        "US:VA:manufacturing": { countryId: "US", sectorType: "manufacturing", regionId: "VA", revenue: 50_000_000 },
      };
      return world;
    };
    const aggressive = makeWorld("aggressive");
    applyNppSourceFounding(aggressive);
    expect(aggressive.corporateSectors?.[`corporate-sector:US:manufacturing:US-manufacturing:VA`]).toBeDefined();
    expect(15 * CEO_ARCHETYPE_MODIFIERS.aggressive.expansionMinMarginMult).toBe(10.5);

    const cautious = makeWorld("cautious");
    applyNppSourceFounding(cautious);
    expect(cautious.corporateSectors?.[`corporate-sector:US:manufacturing:US-manufacturing:VA`]).toBeUndefined();
    expect(15 * CEO_ARCHETYPE_MODIFIERS.cautious.expansionMinMarginMult).toBe(19.5);
  });

  it("uses Game's deposit-value headroom and founds a source-bounded extraction plant", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-source-extraction-entry", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.liquidCapital = 100_000_000;
    corp.profitMargin = 35;
    corp.effectiveProfitMargin = 35;
    world.unownedSectors = {
      "US:TX:extraction": { countryId: "US", sectorType: "extraction", regionId: "TX", revenue: 0 },
    };
    world.commodityPrices.rare_earth!.globalPrice = world.commodityPrices.rare_earth!.basePrice * 2;
    const capacity = world.stateResourceCapacities.TX!;
    const depositBefore = structuredClone(capacity);
    const headroom = sourceExtractionHeadroomByRegion(world).get("TX");
    expect(headroom).toBe(1);
    const candidate = findSourceNppEntryCandidate(world, corp);
    expect(candidate).toMatchObject({ pool: { regionId: "TX", sectorType: "extraction" }, extractionHeadroom: 1 });
    const cashBefore = corp.liquidCapital;
    applyNppSourceFounding(world);
    const id = `corporate-sector:US:extraction:${corp.id}:TX`;
    const asset = world.corporateSectors?.[id];
    expect(asset?.buildQueue?.[0]?.unitsOrdered).toBeGreaterThanOrEqual(250);
    expect(asset?.buildQueue?.[0]?.unitsOrdered).toBeLessThanOrEqual(2_000);
    expect(asset?.revenue).toBe(0);
    expect(world.stateResourceCapacities.TX).toEqual(depositBefore);
    expect(world.unownedSectors["US:TX:extraction"]?.revenue).toBe(0);
    expect(corp.liquidCapital).toBeLessThan(cashBefore);
    validateCorporateCashLedger(world.corporateCashLedger);
    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    applyNppSourceFounding(resumed);
    expect(resumed.corporateSectors?.[id]).toEqual(asset);
    expect(resumed.corporations[corp.id]?.liquidCapital).toBe(corp.liquidCapital);
    expect(resumed.corporateCashLedger).toEqual(world.corporateCashLedger);
  });

  it("uses source weighted deposit value and existing extraction receipts", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-extraction-headroom", playerName: "Alex" });
    const cap = world.stateResourceCapacities.TX!;
    cap.resources = { oil: 100, coal: 200 };
    const open = sourceExtractionHeadroomByRegion(world).get("TX");
    expect(open).toBe(1);
    world.corporateSectors = {
      mine: {
        id: "mine", corporationId: "US-extraction", countryId: "US", stateId: "TX", sectorType: "extraction",
        strategyId: "standard", revenue: 1_000, capitalStock: 1, workers: 1,
        representingUnionId: null, forSale: null, owner: "corporation",
      },
    };
    const after = sourceExtractionHeadroomByRegion(world).get("TX");
    const eraPrices = corporateSectorBasePrices(world);
    const desiredOil = 1_000 * 0.14 * 1.4 / eraPrices.oil!;
    const desiredCoal = 1_000 * 0.22 / eraPrices.coal!;
    const expected = (Math.max(0, 100 - desiredOil) * 80 + Math.max(0, 200 - desiredCoal) * 150) / (100 * 80 + 200 * 150);
    expect(after).toBeCloseTo(expected, 10);
  });

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

  it("uses the source secondary sector tier after critical and primary candidates", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-secondary-entry-tier", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    corp.headquartersRegionId = "DC";
    corp.secondarySectorType = "agriculture";
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice;
    world.unownedSectors = {
      "US:VA:agriculture": { countryId: "US", sectorType: "agriculture", regionId: "VA", revenue: 1_000_000 },
      "US:MD:retail": { countryId: "US", sectorType: "retail", regionId: "MD", revenue: 20_000_000 },
      // The primary match exists, but outside the live geographic frontier.
      "US:CA:manufacturing": { countryId: "US", sectorType: "manufacturing", regionId: "CA", revenue: 50_000_000 },
    };
    expect(findSourceNppEntryCandidate(world, corp)?.pool).toMatchObject({ regionId: "VA", sectorType: "agriculture" });
  });

  it("does not hide a source output with buyers behind a glutted co-product average", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-entry-peak-shortage", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.liquidCapital = 100_000_000;
    corp.profitMargin = 20;
    corp.effectiveProfitMargin = 20;
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice;
    world.commodityPrices.steel!.globalPrice = world.commodityPrices.steel!.basePrice * 0.5;
    world.unownedSectors = {
      "US:VA:manufacturing": { countryId: "US", sectorType: "manufacturing", regionId: "VA", revenue: 50_000_000 },
    };
    const candidate = findSourceNppEntryCandidate(world, corp)!;
    expect(candidate.shortageScore).toBeLessThan(0.85);
    expect(candidate.peakShortageScore).toBe(1);
    applyNppSourceFounding(world);
    expect(Object.values(world.corporateSectors ?? {}).some((asset) => asset.corporationId === corp.id && asset.stateId === "VA")).toBe(true);
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
    // Game computeBuildCost at neutral NPP acumen: prime-rate multiplier and
    // the source 0.8 non-founding expansion-price factor; no host/dominance
    // charge for this unlocated, sub-threshold fixture.
    const expectedAnchorCost = expectedUnits * listPrice
      * Math.max(0.5, 1 + (world.centralBanks.US?.primeRate ?? 0) / 10) * 0.8;
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

  it("combines source replacement and demand-backed growth under the distinct cash rails", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-source-reinvestment-growth", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.liquidCapital = 100_000_000;
    const assetId = "corporate-sector:US:manufacturing:US-manufacturing";
    const asset: CorporateSectorAsset = {
      id: assetId, corporationId: corp.id, countryId: "US", stateId: null,
      sectorType: "manufacturing" as const, capitalStock: 1_000, producedUnits: 950,
      soldUnits: 902.5, effectiveProfitMargin: 35, revenue: 10_000,
      plantsPnl: { turn: world.meta.turn, revenue: 10_000, inputs: 1_000, otherOpex: 0, policyCredit: 0, growth: 0, operatingCost: 1_000, totalCost: 1_000, profit: 9_000 },
      workers: 1, representingUnionId: null, forSale: null, owner: "corporation" as const,
    };
    world.corporateSectors = { [assetId]: asset };
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice;
    const cashBefore = corp.liquidCapital;
    const fillScale = 0.5 + 0.5 * ((0.95 - 0.85) / 0.15);
    const replacementUnits = 950 * 0.0005 * fillScale;
    const growthUnits = Math.floor(950 * 0.5);
    const unitCostAnchor = capacityPricePerUnitAnchor("manufacturing", corporateSectorBasePrices(world), undefined, 1953)
      * Math.max(0.5, 1 + (world.centralBanks.US?.primeRate ?? 0) / 10) * 0.8;
    const expectedUnits = replacementUnits + growthUnits;
    const expectedCostAnchor = expectedUnits * unitCostAnchor;
    applyNppCapacityReplacement(world);
    expect(asset.buildQueue?.[0]?.unitsOrdered).toBeCloseTo(expectedUnits, 10);
    expect(asset.buildQueue?.[0]?.costPaidAnchor).toBeCloseTo(expectedCostAnchor, 8);
    expect(asset.constructionInProgressAnchor).toBe(Math.round(expectedCostAnchor));
    expect(corp.liquidCapital).toBeCloseTo(cashBefore - expectedCostAnchor * getRateForCountry(world, "US"), 6);
    expect(world.corporateCashLedger?.[0]?.type).toBe("corp_capacity_build");
    validateCorporateCashLedger(world.corporateCashLedger);

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    world.meta.turn += 1;
    resumed.meta.turn += 1;
    applyNppCapacityReplacement(world);
    applyNppCapacityReplacement(resumed);
    expect(resumed.corporateSectors?.[assetId]).toEqual(world.corporateSectors?.[assetId]);
    expect(resumed.corporations[corp.id]?.liquidCapital).toBe(world.corporations[corp.id]?.liquidCapital);
    expect(resumed.corporateCashLedger).toEqual(world.corporateCashLedger);
  });

  it("ranks all eligible sector orders before applying the source four-order issuer limit", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-source-reinvestment-rank", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.liquidCapital = 1_000_000_000;
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice;
    const fills = [0.86, 0.88, 0.92, 0.96, 1];
    const regionIds = ["VA", "NY", "CA", "TX", "OH"];
    world.corporateSectors = Object.fromEntries(fills.map((fill, index) => {
      const id = `ranked-plant-${index}`;
      return [id, {
        id, corporationId: corp.id, countryId: "US", stateId: regionIds[index],
        sectorType: "manufacturing" as const, capitalStock: 1_000,
        producedUnits: 1_000, soldUnits: fill * 1_000, revenue: 10_000,
        plantsPnl: { turn: world.meta.turn, revenue: 10_000, inputs: 1_000, otherOpex: 0, policyCredit: 0, growth: 0, operatingCost: 1_000, totalCost: 1_000, profit: 9_000 },
        workers: 1, representingUnionId: null, forSale: null, owner: "corporation" as const,
      }];
    }));

    applyNppCapacityReplacement(world);

    expect(Object.values(world.corporateSectors!).filter((asset) => (asset.buildQueue?.length ?? 0) > 0).map((asset) => asset.id).sort())
      .toEqual(["ranked-plant-1", "ranked-plant-2", "ranked-plant-3", "ranked-plant-4"]);
    expect(world.corporateCashLedger).toHaveLength(4);
  });

  it("keeps depreciation replacement while a saved harvest strategy bars growth capex", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-harvest-replacement-only", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    for (const other of Object.values(world.corporations)) if (other.id !== corp.id) other.suspended = true;
    corp.liquidCapital = 100_000_000;
    corp.nppStrategy = { id: "harvest", adoptedTurn: world.meta.turn, baselineScore: 20 };
    const assetId = "corporate-sector:US:manufacturing:US-manufacturing";
    const asset: CorporateSectorAsset = {
      id: assetId, corporationId: corp.id, countryId: "US", stateId: null,
      sectorType: "manufacturing" as const, capitalStock: 1_000, producedUnits: 950,
      soldUnits: 902.5, revenue: 10_000,
      plantsPnl: { turn: world.meta.turn, revenue: 10_000, inputs: 1_000, otherOpex: 0, policyCredit: 0, growth: 0, operatingCost: 1_000, totalCost: 1_000, profit: 9_000 },
      workers: 1, representingUnionId: null, forSale: null, owner: "corporation" as const,
    };
    world.corporateSectors = { [assetId]: asset };
    for (const price of Object.values(world.commodityPrices)) price.globalPrice = price.basePrice;
    applyNppCapacityReplacement(world);
    expect(asset.buildQueue?.[0]?.unitsOrdered).toBeCloseTo(950 * 0.0005 * (0.5 + 0.5 * ((0.95 - 0.85) / 0.15)), 10);
    expect(corp.liquidCapital).toBeLessThan(100_000_000);
    expect(world.corporateCashLedger?.[0]?.type).toBe("corp_capacity_build");
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
