import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { recordCorporateTradeSnapshot } from "./corporateTrade.js";
import { rebuildCorporatePlantInputDemand } from "../corporation/plantDemand.js";
import { COMMODITY_BASE_PRICES } from "../commodity/constants.js";

describe("corporate-only country trade receipts", () => {
  it("clears measured output against country input and values exports at the source national price", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "corporate-trade-vector", playerName: "Player" });
    world.countries = { US: world.countries.US!, UK: world.countries.UK! };
    world.commodityPrices.electronics!.globalPrice = 7.5;
    world.plantMarketDemand = {
      external: {},
      corporateInputs: {},
      corporateOutputSupplyByCountry: { US: { electronics: 100 } },
      corporateInputsByCountry: { UK: { electronics: 50 } },
    };

    recordCorporateTradeSnapshot(world);

    // Independent Game vector: national prices use the source 500-unit
    // stabilizer and logarithmic price formula. US (S=100,D=0) produces
    // 7.5 / (1 + .7*|ln(500/600)|) = 6.65. The sole importer is short 50,
    // and source trade valuation uses the exporter national price.
    expect(world.corporateTradeSnapshot!.priceByCommodity.electronics!.US).toBe(6.65);
    expect(world.corporateTradeSnapshot!.flow.US!.UK).toBe(332.5);
    expect(world.corporateTradeSnapshot!.byCountry.US).toEqual({
      exports: 332.5, imports: 0, net: 332.5, topPartner: "UK",
    });
    expect(world.corporateTradeSnapshot!.byCountry.UK).toEqual({
      exports: 0, imports: 332.5, net: -332.5, topPartner: "US",
    });
    expect(world.corporateTradeSnapshot!.byCountry.US!.net + world.corporateTradeSnapshot!.byCountry.UK!.net).toBe(0);
  });

  it("keeps an embargoed bilateral corporate flow uncleared", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "corporate-trade-embargo", playerName: "Player" });
    world.countries = { US: world.countries.US!, UK: world.countries.UK! };
    world.internationalOrgs = {
      test: {
        id: "test", name: "Test", foundedYear: 1950, members: ["US", "UK"],
        embargoes: [{ sourceCountry: "US", targetCountry: "UK", commodity: "electronics", direction: "both", mode: "block", origin: "organization", createdTurn: 0, sourceResolutionId: "test" }],
      },
    };
    world.plantMarketDemand = {
      external: {}, corporateInputs: {},
      corporateOutputSupplyByCountry: { US: { electronics: 100 } },
      corporateInputsByCountry: { UK: { electronics: 50 } },
    };

    recordCorporateTradeSnapshot(world);
    expect(world.corporateTradeSnapshot!.flow.US!.UK).toBeUndefined();
    expect(world.corporateTradeSnapshot!.byCountry.US!.exports).toBe(0);
    expect(world.corporateTradeSnapshot!.byCountry.UK!.imports).toBe(0);
  });

  it("keeps planned and market economies behind the source trade curtain, with YU exempt", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "corporate-trade-curtain", playerName: "Player" });
    world.countries = { US: world.countries.US!, RU: world.countries.RU!, YU: world.countries.YU! };
    world.plantMarketDemand = {
      external: {}, corporateInputs: {},
      corporateOutputSupplyByCountry: { RU: { electronics: 100 }, YU: { electronics: 100 } },
      corporateInputsByCountry: { US: { electronics: 50 } },
    };

    recordCorporateTradeSnapshot(world);
    expect(world.corporateTradeSnapshot!.flow.RU!.US).toBeUndefined();
    expect(world.corporateTradeSnapshot!.flow.YU!.US).toBeGreaterThan(0);
    expect(world.corporateTradeSnapshot!.byCountry.US!.topPartner).toBe("YU");
  });

  it("uses the source administered/dual-track national price for planned countries", () => {
    const world = createWorld({ era: "1953", countryId: "RU", seed: "planned-country-trade-price", playerName: "Player" });
    world.countries = { RU: world.countries.RU! };
    world.commandEconomy.RU!.marketizationLevel = 10;
    world.commodityPrices.electronics!.globalPrice = 10;
    world.plantMarketDemand = {
      external: {}, corporateInputs: {},
      corporateOutputSupplyByCountry: { RU: { electronics: 100 } },
    };

    recordCorporateTradeSnapshot(world);

    // Source vector: market price = round(10 / (1 + .7*ln(600/500)), 2) =
    // 8.87; administered = 10*1.12; plan share at level 10 is 6/7.
    expect(world.corporateTradeSnapshot!.priceByCommodity.electronics!.RU).toBeCloseTo(
      (10 * 1.12) * (6 / 7) + 8.87 * (1 / 7), 5,
    );
  });

  it("records source federal healthcare demand by country and GDP-weighted real region", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "government-demand-vector", playerName: "Player" });
    const region = Object.values(world.regions).find(row => row.countryId === "US" && !row.corporationHeadquartersOnly && (row.gdp ?? 0) > 0)!;
    world.regions = { [region.id]: region };
    world.corporations = {};
    world.corporateSectors = {};
    world.exchangeRates.US!.rate = 1;
    world.budgets.US!.spending.byCategory = { healthcare: 480_000_000 };
    world.commodityPrices.healthcare_services!.basePrice = 100;

    rebuildCorporatePlantInputDemand(world);

    // Independent Game demandLegs vector: annual local spend / FX / 48 turns
    // / base price × healthcare rate (0.015), then a one-state GDP allocation.
    expect(world.plantMarketDemand!.governmentDemandByCountry!.US!.healthcare_services).toBe(1_500);
    expect(world.plantMarketDemand!.governmentDemandByState![region.id]!.healthcare_services).toBe(1_500);
  });

  it("records education media demand only for a source-planned economy", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "planned-media-demand-vector", playerName: "Player" });
    world.corporations = {};
    world.corporateSectors = {};
    world.exchangeRates.RU!.rate = 2;
    world.budgets.RU!.spending.byCategory = { education: 1_200_000_000 };
    world.commandEconomy.RU!.marketizationLevel = 50;
    world.commodityPrices.entertainment_services!.basePrice = 10;

    rebuildCorporatePlantInputDemand(world);

    // Game's planned-only education buyer: spend / FX / 48 / price × 0.09.
    expect(world.plantMarketDemand!.governmentDemandByCountry!.RU!.entertainment_services).toBe(112_500);
    world.commandEconomy.RU!.marketizationLevel = 100;
    rebuildCorporatePlantInputDemand(world);
    expect(world.plantMarketDemand!.governmentDemandByCountry!.RU?.entertainment_services).toBeUndefined();
  });

  it("builds household basket demand from real region population and GDP with neutral missing signals", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "household-demand-vector", playerName: "Player" });
    const region = Object.values(world.regions).find(row => row.countryId === "US" && !row.corporationHeadquartersOnly &&
      (row.population ?? 0) > 0 && (row.gdp ?? 0) > 0)!;
    world.regions = { [region.id]: region };
    world.corporations = {};
    world.corporateSectors = {};
    for (const row of Object.values(world.commodityPrices)) row.globalSupply = 1e12;
    world.commodityPrices.food!.globalPrice = world.commodityPrices.food!.basePrice;

    rebuildCorporatePlantInputDemand(world);

    // Independent current-Game householdConsumption vector with the seeded
    // region's actual population/GDP, source basket and neutral absent signals.
    // Era deflation cancels in the unit count.
    const wealth = Math.max(0.5, Math.min(2, Math.sqrt((region.gdp! / region.population!) / 0.03)));
    const authoredWeights: Array<[number, number]> = [
      [0.2, -0.35], [0.08, -0.2], [0.1, -0.1], [0.06, 0.2], [0.05, 0.25], [0.03, 0],
      [0.09, 0.15], [0.1, 0.2], [0.05, 0.3], [0.05, 0], [0.05, 0.3], [0.03, 0.25],
      [0.03, 0], [0.02, 0], [0.02, 0], [0.02, 0], [0.01, 0], [0.01, 0],
    ];
    const weightTotal = authoredWeights.reduce((sum, [weight, slope]) => sum + Math.max(0, weight * (1 + slope * (wealth - 1))), 0);
    const foodWeight = Math.max(0, 0.2 * (1 - 0.35 * (wealth - 1)));
    const expectedFood = (region.population! * 0.002 * 3000 * foodWeight) / (weightTotal * COMMODITY_BASE_PRICES.food);
    expect(world.plantMarketDemand!.householdDemandByState![region.id]!.food).toBeCloseTo(expectedFood, 8);
    expect(world.plantMarketDemand!.householdDemandByCountry!.US!.food).toBeCloseTo(expectedFood, 8);
  });
});
