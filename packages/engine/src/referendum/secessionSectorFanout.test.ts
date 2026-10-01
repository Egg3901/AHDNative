import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { applyReferendumActuation } from "./actuation.js";
import { serializeSave, deserializeSave } from "../save.js";
import { runReferendumLifecycle } from "./lifecycle.js";
import { corporationTurnPhase } from "../corporation/corporationTurn.js";

describe("referendum secession sector fan-out", () => {
  it("materializes the source parent-sector rows before the independence event", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", playerName: "Tester", seed: "pre-secession-materializer" });
    const assets = Object.values(corporateSectorAssets(world));
    const regionalAssets = assets.filter((asset) => asset.countryId === "UK" && (asset.stateId === "SCO" || asset.stateId === "WAL"));
    const unowned = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK" && pool.regionId);
    expect(regionalAssets.length).toBeGreaterThan(0);
    expect(unowned.length).toBeGreaterThan(0);
    expect(regionalAssets.every((asset) => world.regions[asset.stateId!]?.countryId === "UK")).toBe(true);
    expect(unowned.every((pool) => world.regions[pool.regionId!]?.countryId === "UK")).toBe(true);
    for (const corporation of Object.values(world.corporations).filter((corp) => corp.countryId === "UK")) {
      const issuerAssets = assets.filter((asset) => asset.corporationId === corporation.id);
      expect(issuerAssets.reduce((sum, asset) => sum + asset.revenue!, 0)).toBeCloseTo(corporation.revenue, 6);
      expect(issuerAssets.reduce((sum, asset) => sum + asset.workers, 0)).toBe(Math.max(1, Math.round(corporation.revenue / 2000)));
    }
    const manufacturer = world.corporations["UK-manufacturing"]!;
    const walManufacturing = assets.find((asset) => asset.corporationId === manufacturer.id && asset.stateId === "WAL")!;
    const walReceiptShare = walManufacturing.revenue! / manufacturer.revenue;
    corporationTurnPhase.run(world);
    const updatedManufacturer = world.corporations["UK-manufacturing"]!;
    const updatedIssuerAssets = Object.values(world.corporateSectors!).filter((asset) => asset.corporationId === updatedManufacturer.id);
    expect(updatedIssuerAssets.reduce((sum, asset) => sum + asset.revenue!, 0)).toBeCloseTo(updatedManufacturer.revenue, 6);
    expect(walManufacturing.revenue! / updatedManufacturer.revenue).toBeCloseTo(walReceiptShare, 9);
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00Z"));
    expect(Object.values(corporateSectorAssets(restored)).filter((asset) => asset.countryId === "UK" && asset.stateId === "WAL")).toHaveLength(regionalAssets.filter((asset) => asset.stateId === "WAL").length);
  });

  it("expands Scotland from the source seed and independently conserves corporate assets and unowned pools across save/reload", () => {
    const world = createWorld({ era: "1953", countryId: "UK", playerName: "Tester", seed: "secession-fanout" });
    world.player.name = "Player One";
    const assets = corporateSectorAssets(world);
    const departing = Object.values(assets).filter((asset) => asset.countryId === "UK" && asset.stateId === "SCO");
    const preexistingUkAssets = Object.values(assets).filter((asset) => world.corporations[asset.corporationId]?.countryId === "UK");
    const corporateBefore = departing.map((asset) => ({
      id: asset.id,
      owner: asset.owner,
      workers: asset.workers,
      revenue: world.corporations[asset.corporationId]!.revenue,
    }));
    expect(departing.length).toBeGreaterThan(0);

    // The corporate rows were source-parent-scoped by the world seed before
    // this referendum. Replace only the headroom fixture to isolate the
    // separate source pool partition and conservation path.
    world.unownedSectors = {
      "UK:SCO:energy": { countryId: "UK", sectorType: "energy", regionId: "SCO", revenue: 90_000 },
      "UK:SCO:technology": { countryId: "UK", sectorType: "technology", regionId: "SCO", revenue: 60_000 },
      "UK:media": { countryId: "UK", sectorType: "media", revenue: 9_000_000 },
    };
    const unownedTotalBefore = Object.values(world.unownedSectors).reduce((sum, pool) => sum + pool.revenue, 0);

    const result = applyReferendumActuation(world, {
      id: "scotland-passed-referendum",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "actuating",
      yesShare: 55,
      requestedTurn: 0,
      grantedTurn: 0,
    });

    expect(result).toMatchObject({ ok: true, targetCountryId: "SCO" });
    expect(Object.values(world.regions).filter((region) => region.countryId === "SCO").map((region) => region.id))
      .toEqual(["GLA", "LOT", "HIG", "GRA", "TAY", "STH", "CSC"]);
    expect(Object.values(world.regions).filter((region) => region.countryId === "SCO").reduce((sum, region) => sum + region.population!, 0))
      .toBe(5_440_000);
    expect(Object.values(world.regions).filter((region) => region.countryId === "SCO").reduce((sum, region) => sum + region.gdp!, 0))
      .toBe(163_000);

    const moved = Object.values(corporateSectorAssets(world)).filter((asset) => ["GLA", "LOT", "HIG", "GRA", "TAY", "STH", "CSC"].includes(asset.stateId ?? ""));
    const movedExplicit = moved.filter((asset) => departing.some((old) => old.id === asset.id));
    expect(movedExplicit).toHaveLength(departing.length);
    expect(movedExplicit.map((asset) => [asset.id, asset.countryId, asset.owner, asset.workers]).sort())
      .toEqual(corporateBefore.map((item) => [item.id, "SCO", item.owner, item.workers]).sort());
    const ukRevenueBefore = preexistingUkAssets.reduce((sum, asset) => sum + (asset.revenue ?? world.corporations[asset.corporationId]!.revenue), 0);
    const ukAndScoRevenueAfter = Object.values(world.corporateSectors!).filter((asset) => preexistingUkAssets.some((old) => old.corporationId === asset.corporationId)).reduce((sum, asset) => sum + (asset.revenue ?? world.corporations[asset.corporationId]!.revenue), 0);
    expect(ukAndScoRevenueAfter).toBeCloseTo(ukRevenueBefore, 3);

    const regionalPools = Object.values(world.unownedSectors).filter((pool) => pool.regionId);
    expect(regionalPools.length).toBeGreaterThanOrEqual(2);
    expect(regionalPools.every((pool) => pool.countryId === "SCO" && ["GLA", "LOT", "HIG", "GRA", "TAY", "STH", "CSC"].includes(pool.regionId!))).toBe(true);
    expect(regionalPools.find((pool) => pool.sectorType === "energy" && pool.revenue === 90_000)?.regionId).toBe("LOT");
    expect(regionalPools.find((pool) => pool.sectorType === "technology" && pool.revenue === 60_000)?.regionId).toBe("GLA");
    expect(Object.values(world.unownedSectors).reduce((sum, pool) => sum + pool.revenue, 0)).toBe(unownedTotalBefore);
    expect(world.unownedSectors["UK:media"]?.revenue).toBeGreaterThan(0);

    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00Z"));
    expect(restored.regions.GLA).toMatchObject({ countryId: "SCO", name: "Greater Glasgow", population: 1_160_000, gdp: 35_000 });
    expect(Object.values(corporateSectorAssets(restored)).filter((asset) => ["GLA", "LOT", "HIG", "GRA", "TAY", "STH", "CSC"].includes(asset.stateId ?? "")).length).toBeGreaterThanOrEqual(4);
    expect(Object.values(restored.unownedSectors).reduce((sum, pool) => sum + pool.revenue, 0)).toBe(unownedTotalBefore);
  });

  it("expands Wales with its independent source population and GDP vectors", () => {
    const world = createWorld({ era: "1953", countryId: "UK", playerName: "Tester", seed: "wales-fanout" });
    world.player.name = "Player One";
    const sourceCorporateRevenue = Object.values(world.corporations).filter((corp) => corp.countryId === "UK").reduce((sum, corp) => sum + corp.revenue, 0);
    const sourceUnownedRevenue = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK").reduce((sum, pool) => sum + pool.revenue, 0);
    const sourceCountryGdp = world.countries.UK!.economy.gdp;
    const sourceParentGdp = world.regions.WAL!.gdp!;
    const sourceParentCapitalStock = world.capitalStock.WAL!;
    expect(sourceParentGdp).toBe(630);
    expect(sourceCountryGdp).toBe(40_336);
    const sourceParentAssets = Object.values(corporateSectorAssets(world)).filter((asset) => asset.countryId === "UK" && asset.stateId === "WAL");
    const sourceParentAssetIds = sourceParentAssets.map((asset) => asset.id).sort();
    const sourceParentCorporateReceipts = sourceParentAssets.reduce((sum, asset) => sum + asset.revenue!, 0);
    const sourceParentUnowned = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK" && pool.regionId === "WAL").reduce((sum, pool) => sum + pool.revenue, 0);
    const sourceUnownedBySector = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK").reduce<Record<string, number>>((bySector, pool) => {
      bySector[pool.sectorType] = (bySector[pool.sectorType] ?? 0) + pool.revenue;
      return bySector;
    }, {});
    const sourceCorporateBySector = Object.fromEntries(Object.values(world.corporations).filter((corp) => corp.countryId === "UK").map((corp) => [corp.sectorType, corp.revenue]));
    const result = applyReferendumActuation(world, {
      id: "wales-passed-referendum",
      countryId: "UK",
      regionId: "WAL",
      kind: "independence",
      status: "actuating",
      yesShare: 55,
      requestedTurn: 0,
      grantedTurn: 0,
    });
    expect(result).toMatchObject({ ok: true, targetCountryId: "WAL" });
    const welsh = Object.values(world.regions).filter((region) => region.countryId === "WAL");
    expect(welsh.map((region) => region.id)).toEqual(["CDF", "SWA", "VAL", "MWA", "NWW", "NEW"]);
    expect(welsh.reduce((sum, region) => sum + region.population!, 0)).toBe(3_170_000);
    expect(welsh.reduce((sum, region) => sum + region.gdp!, 0)).toBe(74_000);
    expect(welsh.reduce((sum, region) => sum + world.capitalStock[region.id]!, 0)).toBeCloseTo(sourceParentCapitalStock, 6);
    const regionalAssets = Object.values(corporateSectorAssets(world)).filter((asset) => asset.countryId === "WAL" && asset.stateId !== null);
    expect(regionalAssets.length).toBeGreaterThan(0);
    // The Native adapter materializes source market receipts before the vote.
    // Game's runtime then partitions those rows among authored leaf GDP
    // targets; it never cuts a share from the national aggregate at actuation.
    // The 74,000 child sum is intentionally checked separately from parent GDP.
    const actualWelshCorporateReceipts = regionalAssets.reduce((sum, asset) => sum + (asset.revenue ?? world.corporations[asset.corporationId]!.revenue), 0);
    expect(actualWelshCorporateReceipts).toBeCloseTo(sourceParentCorporateReceipts, 3);
    const actualWelshUnownedReceipts = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "WAL").reduce((sum, pool) => sum + pool.revenue, 0);
    expect(actualWelshUnownedReceipts).toBeCloseTo(sourceParentUnowned, 3);
    expect(regionalAssets.map((asset) => asset.id).sort()).toEqual(sourceParentAssetIds);
    expect(actualWelshCorporateReceipts).toBeGreaterThan(0);
    // Independent source receipt vectors from Game's pinned
    // computeUnownedSeedRevenue, evaluated across all 12 UK 1953 regions:
    // WAL manufacturing=274510/8512171, extraction=205882/1331720.
    for (const [sectorType, [parentReceipt, nationalReceipt]] of Object.entries({
      manufacturing: [274_510, 8_512_171],
      extraction: [205_882, 1_331_720],
    }) as Array<[string, [number, number]]>) {
      const actual = regionalAssets.filter((asset) => asset.sectorType === sectorType).reduce((sum, asset) => sum + asset.revenue!, 0);
      expect(actual).toBeCloseTo(sourceCorporateBySector[sectorType]! * parentReceipt / nationalReceipt, 6);
      const unowned = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "WAL" && pool.sectorType === sectorType).reduce((sum, pool) => sum + pool.revenue, 0);
      expect(unowned).toBeCloseTo(sourceUnownedBySector[sectorType]! * parentReceipt / nationalReceipt, 6);
    }
    const ukPlusWalesCorporateRevenue = Object.values(world.corporateSectors!).filter((asset) =>
      world.corporations[asset.corporationId]?.countryId === "UK" &&
      (asset.countryId === "UK" || asset.countryId === "WAL"),
    ).reduce((sum, asset) => sum + (asset.revenue ?? world.corporations[asset.corporationId]!.revenue), 0);
    expect(ukPlusWalesCorporateRevenue).toBeCloseTo(sourceCorporateRevenue, 6);
    const ukPlusWalesUnownedRevenue = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK" || pool.countryId === "WAL").reduce((sum, pool) => sum + pool.revenue, 0);
    expect(ukPlusWalesUnownedRevenue).toBeCloseTo(sourceUnownedRevenue, 3);
  });

  it("runs the passed referendum and signed-consent player journey through persisted regional ownership", () => {
    const world = createWorld({ era: "2019", countryId: "UK", homeRegionId: "SCO", playerName: "Tester", seed: "public-secession-flow" });
    const sourceCorporateRevenue = Object.values(world.corporations).filter((corp) => corp.countryId === "UK").reduce((sum, corp) => sum + corp.revenue, 0);
    const sourceUnownedRevenue = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK").reduce((sum, pool) => sum + pool.revenue, 0);
    const sourceScoAssets = Object.values(corporateSectorAssets(world)).filter((row) => row.countryId === "UK" && row.stateId === "SCO");
    const sourceScoAssetIds = sourceScoAssets.map((row) => row.id).sort();
    const sourceScoCorporateRevenue = sourceScoAssets.reduce((sum, row) => sum + row.revenue!, 0);
    const sourceScoUnownedRevenue = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK" && pool.regionId === "SCO").reduce((sum, pool) => sum + pool.revenue, 0);
    // The current Game receipt vector is 9,421,101 / 24,876,801 for UK:SCO
    // extraction in the 2019-default UK seed (all 12 live state rows).
    expect(sourceScoAssets.filter((row) => row.sectorType === "extraction").reduce((sum, row) => sum + row.revenue!, 0)).toBeCloseTo(
      world.corporations["UK-extraction"]!.revenue * 9_421_101 / 24_876_801,
      6,
    );
    world.referendums.push({
      id: "referendum-SCO-player-flow",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      yesShare: 90,
      requestedTurn: 0,
      grantedTurn: 0,
    });

    runReferendumLifecycle(world);
    const referendum = world.referendums[0]!;
    expect(referendum.status).toBe("actuating");
    world.bills.find((bill) => bill.id === referendum.westminsterBillId)!.status = "signed";
    runReferendumLifecycle(world);

    expect(referendum.status).toBe("completed");
    expect(world.player.countryId).toBe("SCO");
    expect(world.player.homeRegionId).toBe("LOT");
    const regionalAssets = Object.values(world.corporateSectors ?? {}).filter((row) => row.countryId === "SCO" && row.stateId !== null);
    expect(regionalAssets.length).toBeGreaterThan(0);
    expect(regionalAssets.every((row) => row.owner === "corporation" && world.regions[row.stateId!]?.countryId === "SCO")).toBe(true);
    expect(regionalAssets.map((row) => row.id).sort()).toEqual(sourceScoAssetIds);
    expect(regionalAssets.reduce((sum, row) => sum + row.revenue!, 0)).toBeCloseTo(sourceScoCorporateRevenue, 3);
    expect(Object.values(world.unownedSectors).filter((pool) => pool.countryId === "SCO").reduce((sum, pool) => sum + pool.revenue, 0)).toBeCloseTo(sourceScoUnownedRevenue, 3);
    const conservedCorporateRevenue = Object.values(world.corporateSectors ?? {}).filter((row) => world.corporations[row.corporationId]?.countryId === "UK").reduce((sum, row) => sum + (row.revenue ?? world.corporations[row.corporationId]!.revenue), 0);
    expect(conservedCorporateRevenue).toBeCloseTo(sourceCorporateRevenue, 3);
    const conservedUnownedRevenue = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK" || pool.countryId === "SCO").reduce((sum, pool) => sum + pool.revenue, 0);
    expect(conservedUnownedRevenue).toBeCloseTo(sourceUnownedRevenue, 3);

    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00Z"));
    expect(restored.referendums[0]?.status).toBe("completed");
    expect(restored.player.homeRegionId).toBe("LOT");
    expect(Object.values(corporateSectorAssets(restored)).filter((row) => row.countryId === "SCO" && row.stateId !== null).length).toBe(regionalAssets.length);
    expect(Object.values(restored.unownedSectors).filter((pool) => pool.countryId === "UK" || pool.countryId === "SCO").reduce((sum, pool) => sum + pool.revenue, 0)).toBeCloseTo(sourceUnownedRevenue, 3);
  });
});
