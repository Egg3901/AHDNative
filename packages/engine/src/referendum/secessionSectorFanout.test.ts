import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { applyReferendumActuation } from "./actuation.js";
import { serializeSave, deserializeSave } from "../save.js";
import { runReferendumLifecycle } from "./lifecycle.js";
import { corporationTurnPhase } from "../corporation/corporationTurn.js";
import { materializeSourceParentSectorRows } from "../corporation/sourceRegionalSectorSeed.js";
import { CORPORATION_TYPES } from "../corporation/types.js";

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
    const assetsBeforeRepeat = structuredClone(world.corporateSectors);
    const unownedBeforeRepeat = structuredClone(world.unownedSectors);
    materializeSourceParentSectorRows(world);
    expect(world.corporateSectors).toEqual(assetsBeforeRepeat);
    expect(world.unownedSectors).toEqual(unownedBeforeRepeat);
    for (const corporation of Object.values(world.corporations).filter((corp) => corp.countryId === "UK")) {
      const issuerAssets = assets.filter((asset) => asset.corporationId === corporation.id);
      expect(issuerAssets.reduce((sum, asset) => sum + asset.revenue!, 0)).toBeCloseTo(corporation.revenue, 6);
      expect(issuerAssets.reduce((sum, asset) => sum + asset.workers, 0)).toBe(Math.max(1, Math.round(corporation.revenue / 2000)));
    }
    const manufacturer = world.corporations["UK-manufacturing"]!;
    const walManufacturing = assets.find((asset) => asset.corporationId === manufacturer.id && asset.stateId === "WAL")!;
    // The source receipt share defines opening physical stock. Actual later
    // sales are computed per plant and need not preserve that opening ratio.
    expect(walManufacturing.revenue! / manufacturer.revenue).toBeCloseTo(274_510 / 8_512_171, 9);
    corporationTurnPhase.run(world);
    const updatedManufacturer = world.corporations["UK-manufacturing"]!;
    const updatedIssuerAssets = Object.values(world.corporateSectors!).filter((asset) => asset.corporationId === updatedManufacturer.id);
    expect(updatedIssuerAssets.reduce((sum, asset) => sum + asset.revenue!, 0)).toBeCloseTo(updatedManufacturer.revenue, 6);
    // Autonomous greenfield entry may add another industry to the issuer.
    // Compare the source opening manufacturing shares within those same
    // manufacturing assets, while the all-industry receipt sum above remains
    // the consolidated issuer invariant.
    const updatedManufacturingAssets = updatedIssuerAssets.filter((asset) => asset.sectorType === "manufacturing");
    const openingManufacturingAssets = assets.filter((asset) => asset.corporationId === manufacturer.id);
    expect(updatedManufacturingAssets.map((asset) => asset.id)).toEqual(expect.arrayContaining(openingManufacturingAssets.map((asset) => asset.id)));
    expect(updatedManufacturingAssets.some((asset) => asset.stateId === "NWE" && !openingManufacturingAssets.some((opening) => opening.id === asset.id))).toBe(true);
    const retainedManufacturingReceipts = updatedManufacturingAssets
      .filter((asset) => openingManufacturingAssets.some((opening) => opening.id === asset.id))
      .reduce((sum, asset) => sum + asset.revenue!, 0);
    expect(retainedManufacturingReceipts).toBeGreaterThan(0);
    expect(walManufacturing.revenue! / retainedManufacturingReceipts).toBeCloseTo(274_510 / 8_512_171, 9);
    const newManufacturingAsset = updatedManufacturingAssets.find((asset) => !openingManufacturingAssets.some((opening) => opening.id === asset.id));
    const founding = world.corporateCashLedger?.find((row) => row.corporationId === manufacturer.id && row.type === "corp_sector_founding" && row.meta?.sectorId === newManufacturingAsset?.id);
    expect(founding?.meta?.sectorType).toBe("manufacturing");
    expect(newManufacturingAsset).toMatchObject({ stateId: "NWE", capitalStock: 0, realizedRevenue: 0 });
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00Z"));
    expect(Object.values(corporateSectorAssets(restored)).filter((asset) => asset.countryId === "UK" && asset.stateId === "WAL")).toHaveLength(regionalAssets.filter((asset) => asset.stateId === "WAL").length);
  });

  it("divides existing physical plant and commodity sales totals by source parent receipts", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", playerName: "Tester", seed: "plant-parent-split" });
    const original = Object.values(world.corporateSectors!).find((asset) => asset.corporationId === "UK-manufacturing" && asset.stateId === null)!;
    const national = structuredClone(original);
    national.revenue = undefined;
    national.stateId = null;
    national.capitalStock = 1_000;
    national.capacityBookAnchor = 40_000;
    national.producedUnits = 800;
    national.soldUnits = 520;
    national.soldFraction = 0.65;
    national.realizedRevenue = 12_000;
    national.soldByCommodity = { textiles: 0.5, steel: 0.8 };
    const nationalPlantTotals = {
      capitalStock: national.capitalStock,
      capacityBookAnchor: national.capacityBookAnchor,
      producedUnits: national.producedUnits,
      soldUnits: national.soldUnits,
      realizedRevenue: national.realizedRevenue,
      soldByCommodity: structuredClone(national.soldByCommodity),
    };
    world.corporateSectors = { [national.id]: national };

    materializeSourceParentSectorRows(world);

    const slices = Object.values(world.corporateSectors!).filter((asset) => asset.corporationId === national.corporationId);
    for (const field of ["capitalStock", "capacityBookAnchor", "producedUnits", "soldUnits", "realizedRevenue"] as const) {
      expect(slices.reduce((sum, asset) => sum + (asset[field] ?? 0), 0)).toBeCloseTo(nationalPlantTotals[field]!, 9);
    }
    const wal = slices.find((asset) => asset.stateId === "WAL")!;
    expect(wal.capitalStock).toBeCloseTo(1_000 * 274_510 / 8_512_171, 9);
    expect(wal.soldFraction).toBe(0.65);
    expect(wal.soldByCommodity).toEqual({ textiles: 0.5, steel: 0.8 });
    for (const commodity of ["textiles", "steel"] as const) {
      expect(slices.reduce((sum, asset) => sum + (asset.producedUnits ?? 0) * (asset.soldByCommodity?.[commodity] ?? 0), 0))
        .toBeCloseTo(nationalPlantTotals.producedUnits! * nationalPlantTotals.soldByCommodity![commodity]!, 9);
    }
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
      capitalStock: asset.capitalStock,
      capacityBookAnchor: asset.capacityBookAnchor,
      producedUnits: asset.producedUnits,
      soldUnits: asset.soldUnits,
      realizedRevenue: asset.realizedRevenue,
      soldFraction: asset.soldFraction,
      soldByCommodity: asset.soldByCommodity,
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
    expect(Object.fromEntries(["GLA", "LOT", "HIG", "GRA", "TAY", "STH", "CSC"].map((regionId) => [
      regionId,
      moved.filter((asset) => asset.stateId === regionId).map((asset) => asset.sectorType).sort(),
    ]))).toEqual({
      GLA: ["energy", "extraction", "media", "real_estate"],
      LOT: ["manufacturing"],
      HIG: ["financial", "logistics"],
      GRA: ["agriculture", "automobiles", "retail"],
      TAY: ["construction", "telecommunications"],
      STH: ["defense", "entertainment"],
      CSC: ["chemical_industries", "healthcare"],
    });
    const movedExplicit = moved.filter((asset) => departing.some((old) => old.id === asset.id));
    expect(movedExplicit).toHaveLength(departing.length);
    expect(movedExplicit.map((asset) => [asset.id, asset.countryId, asset.owner, asset.workers]).sort())
      .toEqual(corporateBefore.map((item) => [item.id, "SCO", item.owner, item.workers]).sort());
    for (const field of ["capitalStock", "capacityBookAnchor", "producedUnits", "soldUnits", "realizedRevenue"] as const) {
      expect(movedExplicit.reduce((sum, asset) => sum + (asset[field] ?? 0), 0))
        .toBeCloseTo(corporateBefore.reduce((sum, item) => sum + (item[field] ?? 0), 0), 9);
    }
    for (const item of corporateBefore) {
      const movedAsset = movedExplicit.find((asset) => asset.id === item.id);
      expect(movedAsset?.soldFraction).toBe(item.soldFraction);
      expect(movedAsset?.soldByCommodity).toEqual(item.soldByCommodity);
    }
    const ukRevenueBefore = preexistingUkAssets.reduce((sum, asset) => sum + (asset.revenue ?? world.corporations[asset.corporationId]!.revenue), 0);
    const ukAndScoRevenueAfter = Object.values(world.corporateSectors!).filter((asset) => preexistingUkAssets.some((old) => old.corporationId === asset.corporationId)).reduce((sum, asset) => sum + (asset.revenue ?? world.corporations[asset.corporationId]!.revenue), 0);
    expect(ukAndScoRevenueAfter).toBeCloseTo(ukRevenueBefore, 3);

    const regionalPools = Object.values(world.unownedSectors).filter((pool) => pool.regionId);
    expect(regionalPools.length).toBeGreaterThanOrEqual(2);
    expect(regionalPools.every((pool) => pool.countryId === "SCO" && ["GLA", "LOT", "HIG", "GRA", "TAY", "STH", "CSC"].includes(pool.regionId!))).toBe(true);
    expect(regionalPools.find((pool) => pool.sectorType === "energy" && pool.revenue === 90_000)?.regionId).toBe("LOT");
    expect(regionalPools.find((pool) => pool.sectorType === "technology" && pool.revenue === 60_000)?.regionId).toBe("GLA");
    expect(world.unownedSectors["SCO:GLA:technology"]?.revenue).toBe(60_000);
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
    const sourceParentUnownedBySector = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK" && pool.regionId === "WAL").reduce<Record<string, number>>((bySector, pool) => {
      bySector[pool.sectorType] = pool.revenue;
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
    expect(Object.fromEntries(welsh.map((region) => [
      region.id,
      regionalAssets.filter((asset) => asset.stateId === region.id).map((asset) => asset.sectorType).sort(),
    ]))).toEqual({
      CDF: ["agriculture", "entertainment", "manufacturing"],
      SWA: ["defense", "energy", "financial", "healthcare"],
      VAL: ["extraction", "media", "telecommunications"],
      MWA: ["logistics", "retail"],
      NWW: ["automobiles", "construction"],
      NEW: ["chemical_industries", "real_estate"],
    });
    expect(actualWelshCorporateReceipts).toBeCloseTo(sourceParentCorporateReceipts, 3);
    const actualWelshUnownedReceipts = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "WAL").reduce((sum, pool) => sum + pool.revenue, 0);
    const assignedWelshPoolByRegion = Object.fromEntries(welsh.map((region) => [
      region.id,
      Object.fromEntries(Object.values(world.unownedSectors)
        .filter((pool) => pool.countryId === "WAL" && pool.regionId === region.id)
        .map((pool) => [pool.sectorType, pool.revenue])),
    ]));
    // Independently replayed Game 611ad251's actual secede/apportion.ts
    // partitionByGdp over the exact generated WAL parent receipts. See the
    // private source oracle for the retained input and full per-row output.
    expect(assignedWelshPoolByRegion).toEqual({
      CDF: { manufacturing: 98_000, defense: 7_000, telecommunications: 5_355 },
      SWA: { extraction: 73_500 },
      VAL: { energy: 17_500, agriculture: 10_500, real_estate: 7_000, automobiles: 5_355 },
      MWA: { financial: 8_750, media: 5_355, entertainment: 5_355 },
      NWW: { construction: 14_000, retail: 8_750, healthcare: 5_355 },
      NEW: { chemical_industries: 10_500, logistics: 8_750, technology: 5_355 },
    });
    expect(actualWelshUnownedReceipts).toBeCloseTo(sourceParentUnowned, 3);
    expect(regionalAssets.map((asset) => asset.id).sort()).toEqual(sourceParentAssetIds);
    expect(actualWelshCorporateReceipts).toBeGreaterThan(0);
    // Independent source receipt vectors for corporate asset opening shares
    // from Game's pinned computeUnownedSeedRevenue across UK 1953 regions.
    // Unowned market pools use the separately generated exact local-currency
    // seed rows, preserved by source GDP fan-out below.
    for (const [sectorType, [parentReceipt, nationalReceipt]] of Object.entries({
      manufacturing: [274_510, 8_512_171],
      extraction: [205_882, 1_331_720],
    }) as Array<[string, [number, number]]>) {
      const actual = regionalAssets.filter((asset) => asset.sectorType === sectorType).reduce((sum, asset) => sum + asset.revenue!, 0);
      expect(actual).toBeCloseTo(sourceCorporateBySector[sectorType]! * parentReceipt / nationalReceipt, 6);
    }
    for (const sectorType of CORPORATION_TYPES) {
      const unowned = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "WAL" && pool.sectorType === sectorType).reduce((sum, pool) => sum + pool.revenue, 0);
      expect(unowned).toBe(sourceParentUnownedBySector[sectorType]);
    }
    const ukPlusWalesCorporateRevenue = Object.values(world.corporateSectors!).filter((asset) =>
      world.corporations[asset.corporationId]?.countryId === "UK" &&
      (asset.countryId === "UK" || asset.countryId === "WAL"),
    ).reduce((sum, asset) => sum + (asset.revenue ?? world.corporations[asset.corporationId]!.revenue), 0);
    expect(ukPlusWalesCorporateRevenue).toBeCloseTo(sourceCorporateRevenue, 6);
    const ukPlusWalesUnownedRevenue = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK" || pool.countryId === "WAL").reduce((sum, pool) => sum + pool.revenue, 0);
    expect(ukPlusWalesUnownedRevenue).toBeCloseTo(sourceUnownedRevenue, 3);
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00Z"));
    const restoredWalesAssets = Object.values(restored.corporateSectors!).filter((asset) => asset.countryId === "WAL" && asset.stateId !== null);
    expect(restoredWalesAssets.map((asset) => asset.id).sort()).toEqual(regionalAssets.map((asset) => asset.id).sort());
    expect(restoredWalesAssets.reduce((sum, asset) => sum + (asset.revenue ?? 0), 0)).toBeCloseTo(actualWelshCorporateReceipts, 3);
    expect(Object.values(restored.unownedSectors).filter((pool) => pool.countryId === "WAL").reduce((sum, pool) => sum + pool.revenue, 0))
      .toBeCloseTo(actualWelshUnownedReceipts, 3);
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
