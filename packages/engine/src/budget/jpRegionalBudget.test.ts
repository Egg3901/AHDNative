import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { calculateJPRegionalBudget, processJPRegionalBudget } from "./jpRegionalBudget.js";
import { regionalBudgetProcessingPhase } from "./phases.js";
import { setJPRegionalBudgetAllocation } from "./jpAllocation.js";
import { getPackByEra } from "@ahdclient/content";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { JP_REGIONAL_POLICY_CATALOG } from "./jpRegionalPolicyCatalog.js";
import { calculateStateSubsidyCostForRegion } from "./subsidyBudget.js";

describe("Japan regional budget source formula", () => {
  const sourceInput = {
    residentTaxRate: 0.1,
    fixedAssetTaxRate: 0.014,
    nationalGrantPerCapita: 170_000,
    regionPopulation: 5_200_000,
    medianIncome: 3_500_000,
    propertyValueBase: 8_000_000,
    nationalPopulation: 126_000_000,
    ministerAllocation: null,
  } as const;

  it("matches the independently executed Game Hokkaido source vector", () => {
    expect(calculateJPRegionalBudget(sourceInput)).toEqual({
      residentTaxRevenue: 1_820_000_000_000,
      fixedAssetTaxRevenue: 582_400_000_000,
      nationalGrant: 2_677_500_000_000,
      totalBudget: 5_079_900_000_000,
    });
  });

  it("uses an explicit minister allocation in place of the equal eighth", () => {
    expect(calculateJPRegionalBudget({
      ...sourceInput,
      ministerAllocation: 5_000_000_000_000,
    })).toEqual({
      residentTaxRevenue: 1_820_000_000_000,
      fixedAssetTaxRevenue: 582_400_000_000,
      nationalGrant: 5_000_000_000_000,
      totalBudget: 7_402_400_000_000,
    });
  });

  it("seeds source JP fiscal rows without manufacturing electoral regions", () => {
    for (const era of ["1953", "1979", "1991", "2019", "1999", "2007", "2023"] as const) {
      const world = createWorld({ seed: `jp-budget-${era}`, playerName: "Tester", countryId: "US", era });
      const pack = getPackByEra(era)!;
      const sourceIds = [...(pack.states ?? []), ...(pack.economyRegions ?? [])]
        .filter((region) => region.countryId === "JP")
        .map((region) => region.id)
        .sort();
      const jpBudgets = Object.values(world.regionalBudgets).filter((row) => row.countryId === "JP");
      expect(jpBudgets, `${era} JP source budget rows`).toHaveLength(8);
      expect(jpBudgets.map((row) => row.regionId).sort(), `${era} exact source geography`).toEqual(sourceIds);
      expect(Object.values(world.regions).some((region) => region.countryId === "JP"), `${era} electoral JP regions`).toBe(false);
      expect(world.budgets.JP, `${era} national JP budget`).toBeDefined();
      expect(jpBudgets.every((row) => row.jpNationalGrantPerCapita === 128_000)).toBe(true);
      expect(jpBudgets.every((row) => row.taxRates?.fixedAssetTax === 1.4)).toBe(true);
      expect(jpBudgets.every((row) => row.taxRates?.residentTax === (era === "1953" || era === "1979" ? 8 : 10))).toBe(true);
      expect(jpBudgets.every((row) => row.jpRegionalPolicies?.length === 14)).toBe(true);
      const packRegions = [...(pack.states ?? []), ...(pack.economyRegions ?? [])];
      for (const row of jpBudgets) {
        const region = packRegions.find((state) => state.id === row.regionId);
        expect(region, `${era}/${row.regionId} source population`).toBeDefined();
        expect(row.jpEnactedPolicyCosts).toBe(100_000 * region!.population);
      }
    }
  });

  it("uses source regional policy ladder costs and saves their option identities", () => {
    const world = createWorld({ seed: "jp-budget-policy-ladder", playerName: "Tester", countryId: "US", era: "2019" });
    const hokkaido = world.regionalBudgets.HOK!;
    expect(JP_REGIONAL_POLICY_CATALOG.map(({ id }) => id)).toEqual([
      "jp_resident_tax", "jp_fixed_asset_tax", "jp_regional_health", "jp_regional_education", "jp_regional_skills",
      "jp_regional_economic_development", "jp_regional_transport", "jp_regional_utilities",
      "jp_regional_environment", "jp_regional_social_services", "jp_regional_agriculture",
      "jp_regional_autonomy", "jp_regional_governance", "jp_regional_policing",
    ]);
    expect(hokkaido.jpRegionalPolicies?.find((law) => law.legislationTypeId === "jp_regional_education"))
      .toMatchObject({ policyOptionId: "jp_regional_education_opt_3", policyOptionIndex: 3, economic: 0, social: 0 });
    expect(hokkaido.jpRegionalPolicies?.filter((law) => law.legislationTypeId.endsWith("_tax")))
      .toMatchObject([
        { legislationTypeId: "jp_resident_tax", policyOptionId: "jp_resident_tax_opt_5", policyOptionIndex: 5 },
        { legislationTypeId: "jp_fixed_asset_tax", policyOptionId: "jp_fixed_asset_tax_opt_5", policyOptionIndex: 5 },
      ]);
    expect(hokkaido.jpEnactedPolicyCosts).toBe(520_000_000_000);
    const restored = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
    expect(restored.regionalBudgets.HOK?.jpRegionalPolicies).toEqual(hokkaido.jpRegionalPolicies);
  });

  it("applies the source two-deficit austerity write to the highest-cost regional law", () => {
    const world = createWorld({ seed: "jp-budget-austerity", playerName: "Tester", countryId: "US", era: "2019" });
    const hokkaido = world.regionalBudgets.HOK!;
    hokkaido.jpNationalGrantPerCapita = 0;
    hokkaido.taxRates = { residentTax: 0, fixedAssetTax: 0 };
    world.regionalMetrics.HOK = { "economic.medianIncome": { value: 0 } };
    const education = hokkaido.jpRegionalPolicies!.find((law) => law.legislationTypeId === "jp_regional_education")!;

    processJPRegionalBudget(world, "HOK");
    expect(hokkaido.consecutiveDeficits).toBe(1);
    expect(education.policyOptionIndex).toBe(3);
    processJPRegionalBudget(world, "HOK");
    expect(hokkaido.consecutiveDeficits).toBe(2);
    expect(education).toMatchObject({
      policyOptionId: "jp_regional_education_opt_2",
      policyOptionIndex: 2,
      economic: -1,
      social: -1,
      effectDirection: 1,
    });
    expect(hokkaido.jpEnactedPolicyCosts).toBe(520_000_000_000);
  });

  it("charges only source-qualified active regional subsidies to the matching JP budget", () => {
    const cost = calculateStateSubsidyCostForRegion(
      [
        { corporationId: "corp-a", countryId: "JP", stateId: "HOK", sectorType: "energy", revenue: 1_000 },
        { corporationId: "corp-a", countryId: "JP", stateId: "TOK", sectorType: "energy", revenue: 2_000 },
        { corporationId: "corp-b", countryId: "JP", stateId: "HOK", sectorType: "agriculture", revenue: 3_000 },
      ],
      [
        { id: "corp-a", countryId: "JP", headquartersRegionId: "HOK" },
        { id: "corp-b", countryId: "JP", headquartersRegionId: "TOK" },
      ],
      [
        { id: "hoka-energy", countryId: "JP", scope: "state", scopeType: "sector", targetSectorType: "energy", stateId: "HOK", domesticOnly: true, active: true },
        { id: "inactive", countryId: "JP", scope: "state", scopeType: "economy_wide", stateId: "HOK", domesticOnly: false, active: false },
        { id: "national", countryId: "JP", scope: "national", scopeType: "economy_wide", domesticOnly: false, active: true },
      ],
      "JP",
      "HOK",
    );
    expect(cost).toBe(5_040);
  });

  it("runs the source grant and tax formula in the ordinary regional-budget phase", () => {
    const world = createWorld({ seed: "jp-budget-phase", playerName: "Tester", countryId: "US", era: "2019" });
    const hok = world.regionalBudgets.HOK!;
    expect(hok.countryId).toBe("JP");
    hok.jpNationalGrantPerCapita = 170_000;
    hok.taxRates = { residentTax: 10, fixedAssetTax: 1.4 };
    world.regionalMetrics.HOK = { "economic.medianIncome": { value: 3_500_000 } };

    regionalBudgetProcessingPhase.run(world, null as never);

    expect(hok.revenue).toMatchObject({
      jpResidentTax: 1_820_000_000_000,
      jpFixedAssetTax: 582_400_000_000,
      grant: 2_677_500_000_000,
      total: 5_079_900_000_000,
    });
  });

  it("uses persisted current JP populations and preserves the source regional property base", () => {
    const world = createWorld({ seed: "jp-budget-current-base", playerName: "Tester", countryId: "US", era: "2019" });
    for (const row of Object.values(world.regionalBudgets)) {
      if (row.countryId === "JP") row.jpPopulation = 1_000_000;
    }
    const hokkaido = world.regionalBudgets.HOK!;
    hokkaido.jpPropertyValuePerCapita = 12_000_000;
    hokkaido.jpPropertyValueBaseline = 9_000_000;
    world.regionalMetrics.HOK = { "economic.medianIncome": { value: 2_000_000 } };

    processJPRegionalBudget(world, "HOK");

    expect(hokkaido.revenue).toMatchObject({
      jpResidentTax: 200_000_000_000,
      jpFixedAssetTax: 168_000_000_000,
      grant: 128_000_000_000,
      total: 496_000_000_000,
    });
    expect(hokkaido).toMatchObject({
      jpPopulation: 1_000_000,
      jpPropertyValuePerCapita: 12_000_000,
      jpPropertyValueBaseline: 9_000_000,
    });
  });

  it("rebuilds only immutable missing JP budget rows on a legacy turn", () => {
    const world = createWorld({ seed: "jp-budget-legacy-phase", playerName: "Tester", countryId: "US", era: "2019" });
    for (const [regionId, row] of Object.entries(world.regionalBudgets)) {
      if (row.countryId === "JP") delete world.regionalBudgets[regionId];
    }
    delete world.jpRegionalBudgetAllocation;

    regionalBudgetProcessingPhase.run(world, null as never);

    expect(Object.values(world.regionalBudgets).filter((row) => row.countryId === "JP")).toHaveLength(8);
    expect(world.jpRegionalBudgetAllocation).toBeUndefined();
  });

  it("refuses lossy v42 export of schema70 Japan budget rows", () => {
    const world = createWorld({ seed: "jp-budget-v42", playerName: "Tester", countryId: "US", era: "2019" });
    const result = projectSaveToV42(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Japan regional budget state") });
  });

  it("applies the Internal Affairs allocation from the public command state", () => {
    const world = createWorld({ seed: "jp-budget-minister", playerName: "Tester", countryId: "US", era: "2019" });
    world.player.countryId = "JP";
    world.cabinetMembers.push({
      countryId: "JP",
      positionId: "JP_internal_affairs_minister",
      characterId: "player",
      characterName: "Tester",
      partyId: null,
      appointedBy: null,
      appointedAtTurn: world.meta.turn,
      confirmedAtTurn: world.meta.turn,
    } as (typeof world.cabinetMembers)[number]);
    const shares = Object.fromEntries(Object.keys(world.regionalBudgets).filter((id) => world.regionalBudgets[id]?.countryId === "JP").map((id) => [id, id === "HOK" ? 30 : 10]));
    expect(setJPRegionalBudgetAllocation(world, shares)).toEqual({ ok: true });
    expect(world.jpRegionalBudgetAllocation?.allocationPercents).toEqual(shares);
    expect(setJPRegionalBudgetAllocation(world, shares)).toMatchObject({ ok: false, error: expect.stringContaining("once per turn") });

    const foreign = createWorld({ seed: "jp-budget-foreign", playerName: "Tester", countryId: "US", era: "2019" });
    foreign.cabinetMembers.push({
      countryId: "JP",
      positionId: "JP_internal_affairs_minister",
      characterId: "player",
      characterName: "Tester",
      partyId: null,
      appointedBy: null,
      appointedAtTurn: foreign.meta.turn,
      confirmedAtTurn: foreign.meta.turn,
    });
    const untouched = structuredClone(foreign);
    expect(setJPRegionalBudgetAllocation(foreign, shares)).toMatchObject({ ok: false });
    expect(foreign).toEqual(untouched);
  });
});
