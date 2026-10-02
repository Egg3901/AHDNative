import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { validateCorporateCashLedger } from "./corporateCashLedger.js";
import { anchorToLocal, getRateForCountry } from "../forex/conversion.js";
import { corporateSectorBasePrices, capacityPricePerUnitAnchor, SOURCE_DEFAULT_OPERATING_SUPPLY } from "./plantCapacity.js";
import { getSectorTechEffects } from "./techTree/selectors.js";
import { NEUTRAL_STAT } from "../stats/characterStats.js";

describe("source player greenfield sector expansion", () => {
  it("founding abroad charges and routes the source sector FX spread", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "player-sector-fx", playerName: "Alex" });
    world.player.cash = 1_000_000;
    const startingCapital = Math.round(20_000_000 * getEraNominalScale(world.meta.era));
    expect(executeAction(world, "player", "foundCorporation", {
      corporationName: "Atlantic Industries", tickerSymbol: "ATLN", sectorType: "manufacturing", startingCapital,
    }).ok).toBe(true);
    const corporation = Object.values(world.corporations).find((row) => row.tickerSymbol === "ATLN")!;
    const host = Object.values(world.regions).find((region) => region.countryId === "UK" && !region.corporationHeadquartersOnly)!;
    world.unownedSectors[`${host.countryId}:${host.id}:manufacturing`] = {
      countryId: host.countryId, sectorType: "manufacturing", regionId: host.id, revenue: 50_000_000,
    };
    const beforeCash = corporation.liquidCapital;
    const beforeUsRevenue = world.centralBanks.US!.forexRevenue ?? 0;
    const beforeUkReserve = world.centralBanks.UK!.spreadFeeReserveBalances?.USD ?? 0;
    const result = executeAction(world, "player", "expandCorporationSector", {
      corporationId: corporation.id, regionId: host.id, sectorType: "manufacturing",
    });
    expect(result.ok).toBe(true);
    const row = world.corporateCashLedger!.find((item) => item.corporationId === corporation.id)!;
    const spreadAnchor = ((row.meta.entryFeeAnchor ?? 0) + (row.meta.costAnchor ?? 0)) * 0.005;
    expect(row.meta.fxSpreadAnchor).toBeCloseTo(spreadAnchor, 6);
    const spreadLocal = anchorToLocal(spreadAnchor, getRateForCountry(world, "US"));
    expect(corporation.liquidCapital).toBeCloseTo(beforeCash - anchorToLocal((row.meta.entryFeeAnchor ?? 0) + (row.meta.costAnchor ?? 0) + spreadAnchor, getRateForCountry(world, "US")), 6);
    expect(world.centralBanks.US!.forexRevenue).toBe(beforeUsRevenue + Math.round(spreadLocal * 0.25));
    expect(world.centralBanks.UK!.spreadFeeReserveBalances?.USD).toBe(beforeUkReserve + Math.round(Math.round(spreadLocal) * 0.5));
    expect(world.corporateSectors?.[`corporate-sector:UK:manufacturing:${corporation.id}:${host.id}`]?.countryId).toBe("UK");
    const reloaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(reloaded.centralBanks.US?.forexRevenue).toBe(world.centralBanks.US?.forexRevenue);
    expect(reloaded.centralBanks.UK?.spreadFeeReserveBalances).toEqual(world.centralBanks.UK?.spreadFeeReserveBalances);
    expect(reloaded.corporateCashLedger).toEqual(world.corporateCashLedger);
  });

  it("pays fee and priced first facility, writes a regional asset and draws its actual pool", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "player-sector-expansion", playerName: "Alex" });
    world.player.cash = 1_000_000;
    const startingCapital = Math.round(20_000_000 * getEraNominalScale(world.meta.era));
    const found = executeAction(world, "player", "foundCorporation", {
      corporationName: "Northstar Industries", tickerSymbol: "NSTR", sectorType: "manufacturing", startingCapital,
    });
    expect(found.ok).toBe(true);
    const corporation = Object.values(world.corporations).find((row) => row.tickerSymbol === "NSTR")!;
    world.unownedSectors["US:VA:manufacturing"] = {
      countryId: "US", sectorType: "manufacturing", regionId: "VA", revenue: 50_000_000,
    };
    const cashBefore = corporation.liquidCapital;
    const poolBefore = world.unownedSectors["US:VA:manufacturing"]!.revenue;
    const result = executeAction(world, "player", "expandCorporationSector", {
      corporationId: corporation.id, regionId: "VA", sectorType: "manufacturing",
    });
    expect(result.ok).toBe(true);
    const assetId = `corporate-sector:US:manufacturing:${corporation.id}:VA`;
    const asset = world.corporateSectors?.[assetId];
    expect(asset).toMatchObject({ countryId: "US", stateId: "VA", sectorType: "manufacturing", workers: 500, owner: "corporation" });
    expect(asset?.buildQueue?.[0]?.unitsOrdered).toBe(25);
    expect(asset?.buildQueue?.[0]?.onlineTurn).toBe(world.meta.turn + 36);
    expect(world.unownedSectors["US:VA:manufacturing"]!.revenue).toBeLessThan(poolBefore);
    expect(corporation.liquidCapital).toBeLessThan(cashBefore);
    const tech = getSectorTechEffects({ type: corporation.sectorType, ...corporation }, "manufacturing");
    const listPrice = capacityPricePerUnitAnchor("manufacturing", corporateSectorBasePrices(world), null, Number(world.meta.date.slice(0, 4)));
    const primeRate = world.centralBanks.US!.primeRate;
    const acumen = world.player.stats?.businessAcumen ?? NEUTRAL_STAT;
    const rateMultiplierForPlayer = Math.max(0.5, 1 + (primeRate / 10) * Math.max(0, 1 - (acumen - 5.5) * 0.06));
    const acumenMultiplier = Math.max(0.5, 1 - (acumen - 5.5) * 0.03);
    const hostCostOfLiving = world.regionalMetrics.VA?.["economic.costOfLiving"]?.value ?? 100;
    const expectedBuild = 25 * listPrice * rateMultiplierForPlayer * acumenMultiplier * tech.growthCostMultiplier * Math.min(1.6, Math.max(0.6, hostCostOfLiving / 100)) * 0.9;
    const expectedFee = Math.round(Math.round(100_000 * getEraNominalScale(world.meta.era)) * (1 - tech.expansionDiscount));
    expect(world.corporateCashLedger?.[0]?.meta.costAnchor).toBeCloseTo(expectedBuild, 6);
    expect(world.corporateCashLedger?.[0]?.meta.entryFeeAnchor).toBe(expectedFee);
    const supply = SOURCE_DEFAULT_OPERATING_SUPPLY.manufacturing;
    const unitYield = Object.entries(supply).reduce((sum, [commodity, quantity]) => sum + (quantity ?? 0) / world.commodityPrices[commodity as keyof typeof world.commodityPrices]!.basePrice, 0);
    const expectedNameplate = Math.round(anchorToLocal(25 / (unitYield / getEraNominalScale(world.meta.era)), getRateForCountry(world, "US")));
    expect(asset?.revenue).toBe(expectedNameplate);
    expect(world.corporateCashLedger?.[0]).toMatchObject({
      type: "corp_sector_founding", corporationId: corporation.id,
      amount: corporation.liquidCapital - cashBefore,
      meta: { sectorId: assetId, sectorType: "manufacturing", units: 25, entryFeeAnchor: expect.any(Number) },
    });
    validateCorporateCashLedger(world.corporateCashLedger);
    const duplicateRegion = executeAction(world, "player", "expandCorporationSector", {
      corporationId: corporation.id, regionId: "VA", sectorType: "manufacturing",
    });
    expect(duplicateRegion).toMatchObject({ ok: false, error: "This corporation already operates in the selected region and sector" });
    const reloaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(reloaded.corporateSectors?.[assetId]).toEqual(asset);
    expect(reloaded.unownedSectors["US:VA:manufacturing"]).toEqual(world.unownedSectors["US:VA:manufacturing"]);
    expect(reloaded.corporateCashLedger).toEqual(world.corporateCashLedger);
  });
});
