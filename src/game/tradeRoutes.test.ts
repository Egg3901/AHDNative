import { describe, expect, it } from "vitest";
import {
  advanceTurn,
  createWorld,
  deserializeSave,
  executeAction,
  serializeSave,
} from "@ahdclient/engine";
import { projectMarkets } from "./markets";
import { projectTradeRoutes } from "./tradeRoutes";

const US = { era: "1953", countryId: "US", seed: "native-trade-routes-v1", playerName: "Alex" };

/** Independent restatement of the engine buyShares cash rounding. */
function expectedNotional(sharePrice: number, shares: number): number {
  return Math.round(shares * sharePrice * 100) / 100;
}

describe("projectTradeRoutes populated", () => {
  it("emits one row per listed country, home first, with recorded growth and FX", () => {
    const world = createWorld(US);
    const view = projectMarkets(world);
    const routes = projectTradeRoutes(world);

    expect(routes.length).toBe(view.countries.length);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]!.countryId).toBe("US");
    expect(view.tradeRoutes).toEqual(routes);

    // Routes agree with the market country list on identity, currency, and size.
    for (const route of routes) {
      const country = view.countries.find((c) => c.id === route.countryId)!;
      expect(country).toBeDefined();
      expect(route.countryName).toBe(country.name);
      expect(route.currency).toBe(country.currency);
      expect(route.listingCount).toBe(
        view.listings.filter((l) => l.countryId === route.countryId).length,
      );
      expect(route.listingCount).toBeGreaterThan(0);
    }

    // Trade growth mirrors the recorded budget factor; FX mirrors the recorded row.
    for (const route of routes) {
      expect(route.tradeGrowth).toBe(world.budgets[route.countryId]!.economicFactors.tradeGrowth);
      expect(Number.isFinite(route.tradeGrowth)).toBe(true);
      const row = world.exchangeRates[route.countryId]!;
      expect(row).toBeDefined();
      expect(route.fx).toMatchObject({
        available: true,
        rate: row.rate,
        baseRate: row.baseRate,
        regime: row.regime,
        updatedTurn: row.updatedTurn,
      });
    }
  });

  it("records no cross-currency totals and no invented quotes or spreads", () => {
    const routes = projectTradeRoutes(createWorld(US));
    const json = JSON.stringify(routes);
    expect(json).not.toMatch(/usdEquivalent|totalMarketCap|spread|bid|ask|quote|settle/i);
    for (const route of routes) {
      expect(Object.keys(route).sort()).toEqual(
        ["countryId", "countryName", "currency", "fx", "listingCount", "tradeGrowth"],
      );
    }
  });

  it("keeps routes and order flow across a turn and a save/reload", () => {
    const world = createWorld(US);
    advanceTurn(world);
    const routes = projectTradeRoutes(world);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(Number.isFinite(route.tradeGrowth)).toBe(true);
      expect(route.fx.available).toBe(true);
    }

    const loaded = deserializeSave(serializeSave(world, "2026-09-10T00:00:00.000Z"));
    expect(projectTradeRoutes(loaded)).toEqual(projectTradeRoutes(world));
  });
});

describe("orderFlow projection", () => {
  it("reads the seeded zero windows on a fresh world and the executed notional after a buy", () => {
    const world = createWorld(US);
    const fresh = projectMarkets(world).listings.find((l) => l.id === "US-media")!;
    expect(fresh.orderFlow).toEqual({
      buyWindow: 0,
      sellWindow: 0,
      flowMultiplier: 1,
      sentimentMultiplier: 1,
      insolventSinceTurn: null,
    });

    const notional = expectedNotional(fresh.sharePrice, 2);
    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares: 2 }).ok).toBe(true);
    const after = projectMarkets(world).listings.find((l) => l.id === "US-media")!;
    expect(after.orderFlow!.buyWindow).toBe(notional);
    expect(after.orderFlow!.sellWindow).toBe(0);

    // Existing behavior is untouched: cash, float, and holdings move as before.
    expect(after.playerShares).toBe(2);
    expect(after.sell.available).toBe(true);
  });

  it("survives save/reload with the executed window intact", () => {
    const world = createWorld(US);
    const price = world.corporations["US-media"]!.sharePrice;
    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    const loaded = deserializeSave(serializeSave(world, "2026-09-10T00:00:00.000Z"));
    expect(
      projectMarkets(loaded).listings.find((l) => l.id === "US-media")!.orderFlow!.buyWindow,
    ).toBe(expectedNotional(price, 1));
  });

  it("surfaces the recorded insolvency marker verbatim", () => {
    const world = createWorld(US);
    world.corporations["US-media"]!.insolventSinceTurn = 7;
    const listing = projectMarkets(world).listings.find((l) => l.id === "US-media")!;
    expect(listing.insolvent).toBe(true);
    expect(listing.orderFlow!.insolventSinceTurn).toBe(7);
  });
});

describe("projectTradeRoutes unavailable and empty", () => {
  it("marks FX unavailable when the engine records no rate row, without touching growth", () => {
    const world = createWorld(US);
    delete world.exchangeRates["US"];
    const route = projectTradeRoutes(world).find((r) => r.countryId === "US")!;
    expect(route.fx).toEqual({ available: false, rate: null, baseRate: null, regime: null, updatedTurn: null });
    expect(Number.isFinite(route.tradeGrowth)).toBe(true);
    expect(route.currency).toBe(world.budgets["US"]!.currencyCode);
  });

  it("marks trade growth unavailable when no budget is recorded, without inventing a rate", () => {
    const world = createWorld(US);
    delete world.budgets["UK"];
    const route = projectTradeRoutes(world).find((r) => r.countryId === "UK")!;
    expect(route).toBeDefined();
    expect(route.tradeGrowth).toBeNull();
    expect(route.fx.available).toBe(true);
    expect(route.fx.rate).toBe(world.exchangeRates["UK"]!.rate);
  });

  it("returns no routes when no corporations are recorded", () => {
    const world = createWorld(US);
    world.corporations = {};
    expect(projectTradeRoutes(world)).toEqual([]);
    expect(projectMarkets(world).tradeRoutes).toEqual([]);
  });
});
