import { describe, expect, it } from "vitest";
import { createWorld, deserializeSave, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

describe("corporate commodity trade through the saved player session", () => {
  it("records real country flows after a turn and projects them after save/reload", () => {
    const world = createWorld({
      era: "1953",
      countryId: "US",
      seed: "corporate-trade-session-receipt",
      playerName: "Player",
    });
    const seededCorporation = world.corporations["US-manufacturing"]!;
    const usTechnology = { ...seededCorporation, id: "US-technology", countryId: "US", sectorType: "technology" as const };
    const ukManufacturing = { ...seededCorporation, id: "UK-manufacturing", countryId: "UK", sectorType: "manufacturing" as const };
    world.corporations = {
      [usTechnology.id]: usTechnology,
      [ukManufacturing.id]: ukManufacturing,
    };
    world.corporateSectors = {
      "source-trade:US:technology": {
        id: "source-trade:US:technology",
        corporationId: usTechnology.id,
        countryId: "US",
        stateId: null,
        sectorType: "technology",
        capitalStock: 1_000_000,
        workers: 1,
        representingUnionId: null,
        forSale: null,
        owner: "corporation",
      },
      "source-trade:UK:manufacturing": {
        id: "source-trade:UK:manufacturing",
        corporationId: ukManufacturing.id,
        countryId: "UK",
        stateId: null,
        sectorType: "manufacturing",
        capitalStock: 1_000_000,
        workers: 1,
        representingUnionId: null,
        forSale: null,
        owner: "corporation",
      },
    };

    const session = new GameSession();
    session.load(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    session.advance();

    const routes = session.markets().tradeRoutes ?? [];
    const exporter = routes.find((route) => route.countryId === "US");
    const importer = routes.find((route) => route.countryId === "UK");
    expect(exporter).toHaveProperty("corporateTrade.exports", expect.any(Number));
    expect(importer).toHaveProperty("corporateTrade.imports", expect.any(Number));
    expect(exporter).toHaveProperty("corporateTrade.topPartner", "UK");
    expect(importer).toHaveProperty("corporateTrade.topPartner", "US");
    expect(exporter!.corporateTrade!.exports).toBeGreaterThan(0);
    const savedWorld = deserializeSave(session.serialize("2026-10-01T00:01:00.000Z"));
    const flow = savedWorld.corporateTradeSnapshot!.flow;
    const sourcePrices = savedWorld.corporateTradeSnapshot!.priceByCommodity!;
    const exportedLeg = exporter!.corporateTrade!.commodityFlows[0]!;
    const importingRoute = routes.find(route => route.countryId === exportedLeg.partner)!;
    const importedLeg = importingRoute.corporateTrade!.commodityFlows.find(
      row => row.commodity === exportedLeg.commodity && row.partner === "US" && row.direction === "imports",
    );
    expect(importedLeg).toMatchObject({
      commodity: exportedLeg.commodity,
      units: exportedLeg.units,
      value: exportedLeg.value,
      pricePerUnit: sourcePrices[exportedLeg.commodity]!.US,
    });
    const countryExports = Object.fromEntries(Object.entries(flow).map(([country, destinations]) => [
      country, Object.values(destinations).reduce((sum, value) => sum + value, 0),
    ]));
    const countryImports = Object.fromEntries(Object.keys(flow).map(country => [
      country, Object.values(flow).reduce((sum, destinations) => sum + (destinations[country] ?? 0), 0),
    ]));
    expect(exporter!.corporateTrade!.exports).toBe(countryExports.US);
    expect(importer!.corporateTrade!.imports).toBe(countryImports.UK);
    expect(Object.values(countryExports).reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      Object.values(countryImports).reduce((sum, value) => sum + value, 0), 6,
    );
    for (const [commodity, byExporter] of Object.entries(savedWorld.corporateTradeSnapshot!.byCommodity)) {
      for (const [country, byImporter] of Object.entries(byExporter)) {
        for (const row of Object.values(byImporter)) {
          expect(row.value).toBeCloseTo(row.units * sourcePrices[commodity]![country]!, 8);
        }
      }
    }

    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:01:00.000Z"));
    expect(resumed.markets().tradeRoutes).toEqual(routes);
    expect(deserializeSave(resumed.serialize("2026-10-01T00:02:00.000Z")).corporateTradeSnapshot).toEqual(
      savedWorld.corporateTradeSnapshot,
    );
  });
});
