import { describe, expect, it } from "vitest";
import {
  createWorld,
  deserializeSave,
  executeAction,
  serializeSave,
  type WorldState,
} from "@ahdclient/engine";
import {
  CROSS_CURRENCY_UNAVAILABLE,
  evaluateShareTrade,
  parseShareCount,
  projectMarkets,
  shareNotional,
  type MarketActionHint,
  type MarketListing,
} from "./markets";

const US = { era: "1953", countryId: "US", seed: "native-markets-v1", playerName: "Alex" };
const UK = { era: "1953", countryId: "UK", seed: "native-markets-uk-v1", playerName: "Alex" };
const SAVED_AT = "2026-09-10T00:00:00.000Z";

/** Independent restatement of execute.ts buyShares/sellShares cash rounding. */
function expectedNotional(sharePrice: number, shares: number): number {
  return Math.round(shares * sharePrice * 100) / 100;
}

describe("parseShareCount", () => {
  it("accepts positive digit strings and rejects decimals, signs, and scientific notation", () => {
    expect(parseShareCount("1")).toBe(1);
    expect(parseShareCount("250")).toBe(250);
    expect(parseShareCount(" 12 ")).toBe(12);
    expect(parseShareCount("")).toBeNull();
    expect(parseShareCount("0")).toBeNull();
    expect(parseShareCount("-1")).toBeNull();
    expect(parseShareCount("1.5")).toBeNull();
    expect(parseShareCount("1e2")).toBeNull();
    expect(parseShareCount("01")).toBeNull();
    expect(parseShareCount("2.0")).toBeNull();
  });
});

describe("projectMarkets", () => {
  it("lists seeded public corporations with recorded price, currency, float, and zero player holdings", () => {
    const world = createWorld(US);
    const view = projectMarkets(world);
    expect(view.playerCountryId).toBe("US");
    expect(view.playerCurrency).toBe("USD");
    expect(view.playerCash).toBe(world.player.cash);
    expect(view.listings.length).toBe(Object.keys(world.corporations).length);
    expect(view.listings.length).toBeGreaterThan(0);

    const media = view.listings.find((l) => l.id === "US-media");
    expect(media).toMatchObject({
      id: "US-media",
      ticker: world.corporations["US-media"]!.tickerSymbol,
      name: "US-media",
      countryId: "US",
      currency: "USD",
      cashCurrencyMatches: true,
      sharePrice: world.corporations["US-media"]!.sharePrice,
      publicFloat: world.corporations["US-media"]!.publicFloat,
      playerShares: 0,
      priceHistory: [],
    });
    expect(media?.buy.id).toBe("buyShares");
    expect(media?.sell.id).toBe("sellShares");
    expect(media?.sell.available).toBe(false);
    expect(media?.sell.disabledReason).toMatch(/You only own 0 shares of /);

    const dtoBytes = Buffer.byteLength(JSON.stringify(view), "utf8");
    expect(dtoBytes).toBeGreaterThan(0);
    expect(dtoBytes).toBeLessThan(200_000);
  });

  it("does not invent player holdings or a cross-currency market-cap total", () => {
    const view = projectMarkets(createWorld(US));
    expect(view.listings.every((l) => l.playerShares === 0)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/marketCapUsd|totalMarketCap|usdEquivalent/i);
  });

  it("keeps each listing in its own recorded currency with no USD conversion", () => {
    const view = projectMarkets(createWorld(US));
    const uk = view.listings.find((l) => l.countryId === "UK");
    expect(uk?.currency).toBe("GBP");
    expect(uk?.cashCurrencyMatches).toBe(false);
    expect(view.playerCurrency).toBe("USD");
    expect(uk?.buy.available).toBe(false);
    expect(uk?.sell.available).toBe(false);
    expect(uk?.buy.disabledReason).toBe(CROSS_CURRENCY_UNAVAILABLE);
    expect(uk?.sell.disabledReason).toBe(CROSS_CURRENCY_UNAVAILABLE);
  });

  it("trims recorded earningsHistory to the last 52 entries and keeps price history separate", () => {
    const world = createWorld(US);
    const corp = world.corporations["US-media"]!;
    corp.earningsHistory = Array.from({ length: 60 }, (_, i) => i + 1);
    const listing = projectMarkets(world).listings.find((l) => l.id === "US-media");
    expect(listing?.earningsHistory).toEqual(Array.from({ length: 52 }, (_, i) => i + 9));
    expect(listing?.priceHistory).toEqual([]);
  });

  it("projects the engine's recorded live price history", () => {
    const world = createWorld(US);
    world.corporations["US-media"]!.priceHistory = [
      { turn: 1, price: 12.34 },
      { turn: 2, price: 13.45 },
    ];

    const listing = projectMarkets(world).listings.find((l) => l.id === "US-media");
    expect(listing?.priceHistory).toEqual([
      { turn: 1, price: 12.34 },
      { turn: 2, price: 13.45 },
    ]);
  });

  it("uses GBP cash and prices in a UK world", () => {
    const world = createWorld(UK);
    const view = projectMarkets(world);
    expect(view.playerCurrency).toBe("GBP");
    const home = view.listings.find((l) => l.countryId === "UK");
    expect(home?.currency).toBe("GBP");
    expect(home?.cashCurrencyMatches).toBe(true);
  });
});

describe("buyShares / sellShares through executeAction", () => {
  it("debits cash and credits holdings using the recorded sharePrice rounding formula", () => {
    const world = createWorld(US);
    const corp = world.corporations["US-media"]!;
    const shares = 1;
    const notional = expectedNotional(corp.sharePrice, shares);
    expect(shareNotional(corp.sharePrice, shares)).toBe(notional);
    const cashBefore = world.player.cash;
    const floatBefore = corp.publicFloat;
    const liquidBefore = corp.liquidCapital;

    const result = executeAction(world, "player", "buyShares", { corpId: "US-media", shares });
    expect(result).toEqual({ ok: true, message: `Bought ${shares} shares of ${corp.tickerSymbol} for ${notional}` });
    expect(world.player.cash).toBe(cashBefore - notional);
    expect(corp.publicFloat).toBe(floatBefore - shares);
    expect(corp.liquidCapital).toBe(liquidBefore + notional);
    expect(corp.shareholders.find((s) => s.holder === "player")?.shares).toBe(shares);

    const view = projectMarkets(world);
    const listing = view.listings.find((l) => l.id === "US-media");
    expect(listing).toMatchObject({
      playerShares: shares,
      playerAvgCostPerShare: corp.sharePrice,
      sharePrice: corp.sharePrice,
      currency: "USD",
    });
    expect(view.playerCash).toBe(world.player.cash);
    expect(listing?.sell.available).toBe(true);
  });

  it("sells back through the same formula and restores cash, float, and empty player holding", () => {
    const world = createWorld(US);
    const corp = world.corporations["US-media"]!;
    const shares = 1;
    const notional = expectedNotional(corp.sharePrice, shares);
    const cashBefore = world.player.cash;
    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares }).ok).toBe(true);
    const sale = executeAction(world, "player", "sellShares", { corpId: "US-media", shares });
    expect(sale.ok).toBe(true);
    expect(world.player.cash).toBe(cashBefore);
    expect(corp.shareholders.find((s) => s.holder === "player")).toBeUndefined();
    expect(projectMarkets(world).listings.find((l) => l.id === "US-media")?.playerShares).toBe(0);
    expect(shareNotional(corp.sharePrice, shares)).toBe(notional);
  });

  it("preserves ownership and cash through serializeSave / deserializeSave", () => {
    const world = createWorld(US);
    const corp = world.corporations["US-media"]!;
    const shares = 1;
    const notional = expectedNotional(corp.sharePrice, shares);
    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares }).ok).toBe(true);
    const loaded = deserializeSave(serializeSave(world, SAVED_AT));
    expect(loaded.player.cash).toBe(10_000 - notional);
    expect(loaded.corporations["US-media"]!.shareholders.find((s) => s.holder === "player")?.shares).toBe(shares);
    const view = projectMarkets(loaded);
    expect(view.playerCash).toBe(loaded.player.cash);
    expect(view.listings.find((l) => l.id === "US-media")?.playerShares).toBe(shares);
  });

  it("rejects non-integer shares, missing cash, missing float, missing holdings, and unknown corps without mutating cash", () => {
    const world = createWorld(US);
    const before = world.player.cash;
    const corp = world.corporations["US-media"]!;

    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares: 1.5 }).ok).toBe(false);
    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares: 0 }).ok).toBe(false);
    expect(executeAction(world, "player", "buyShares", { corpId: "NOPE", shares: 1 }).ok).toBe(false);
    expect(executeAction(world, "player", "sellShares", { corpId: "US-media", shares: 1 }).ok).toBe(false);

    world.player.cash = 1;
    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(false);
    world.player.cash = before;

    const overFloat = executeAction(world, "player", "buyShares", { corpId: "US-media", shares: corp.publicFloat + 1 });
    expect(overFloat.ok).toBe(false);
    expect(world.player.cash).toBe(before);
    expect(corp.shareholders.find((s) => s.holder === "player")).toBeUndefined();
  });

  it("still executes buyShares when economy and markets feature flags are off", () => {
    const world = createWorld({ ...US, featureFlags: { economy: false, markets: false } });
    expect(world.featureFlags.economy).toBe(false);
    expect(world.featureFlags.markets).toBe(false);
    const view = projectMarkets(world);
    expect(view.economyPhaseEnabled).toBe(false);
    expect(view.marketsPhaseEnabled).toBe(false);
    const media = view.listings.find((l) => l.id === "US-media");
    expect(media?.buy.available).toBe(true);
    expect(executeAction(world, "player", "buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(projectMarkets(world).listings.find((l) => l.id === "US-media")?.playerShares).toBe(1);
  });
});

describe("evaluateShareTrade", () => {
  const home: Pick<MarketListing, "ticker" | "sharePrice" | "publicFloat" | "liquidCapital" | "playerShares" | "cashCurrencyMatches"> = {
    ticker: "US.MEDI",
    sharePrice: 100,
    publicFloat: 1_000,
    liquidCapital: 50_000,
    playerShares: 20,
    cashCurrencyMatches: true,
  };
  const view = { playerCash: 10_000 };
  const openBuy: MarketActionHint = { id: "buyShares", name: "Buy Shares", cost: 0, available: true };
  const openSell: MarketActionHint = { id: "sellShares", name: "Sell Shares", cost: 0, available: true };

  it("blocks any positive size when the unit-share hint is unavailable", () => {
    const blocked: MarketActionHint = {
      id: "buyShares",
      name: "Buy Shares",
      cost: 1,
      available: false,
      disabledReason: "Not enough action points.",
    };
    expect(evaluateShareTrade("buy", home, 1, view, blocked)).toMatchObject({
      available: false,
      disabledReason: "Not enough action points.",
    });
    expect(evaluateShareTrade("buy", home, 40, view, blocked)).toMatchObject({
      available: false,
      disabledReason: "Not enough action points.",
    });
  });

  it("rejects non-positive, non-integer shares and non-finite notionals", () => {
    expect(evaluateShareTrade("buy", home, 0, view, openBuy)).toMatchObject({
      available: false,
      disabledReason: "Enter a positive whole number of shares.",
      notional: 0,
    });
    expect(evaluateShareTrade("buy", home, 1.5, view, openBuy)).toMatchObject({
      available: false,
      disabledReason: "Enter a positive whole number of shares.",
      notional: 0,
    });
    expect(evaluateShareTrade("buy", home, Number.MAX_SAFE_INTEGER + 1, view, openBuy)).toMatchObject({
      available: false,
      notional: 0,
    });
    expect(evaluateShareTrade("buy", { ...home, sharePrice: Number.POSITIVE_INFINITY }, 1, view, openBuy)).toMatchObject({
      available: false,
      disabledReason: "Enter a positive whole number of shares.",
      notional: 0,
    });
  });

  it("holds a foreign quote even when the catalog hint is open", () => {
    const foreign = { ...home, cashCurrencyMatches: false };
    expect(evaluateShareTrade("buy", foreign, 1, view, openBuy)).toMatchObject({
      available: false,
      disabledReason: CROSS_CURRENCY_UNAVAILABLE,
    });
    expect(evaluateShareTrade("sell", foreign, 1, view, openSell)).toMatchObject({
      available: false,
      disabledReason: CROSS_CURRENCY_UNAVAILABLE,
    });
  });
});

describe("engine cross-currency characterization", () => {
  it("buyShares still mixes foreign quote units into home cash; this is not FX settlement", () => {
    const world = createWorld(US);
    const foreign = Object.values(world.corporations).find((corp) => corp.countryId !== "US");
    expect(foreign).toBeDefined();
    const quoteCurrency = world.budgets[foreign!.countryId]?.currencyCode
      ?? world.exchangeRates[foreign!.countryId]?.currencyCode;
    expect(quoteCurrency).not.toBe("USD");
    const notional = expectedNotional(foreign!.sharePrice, 1);
    world.player.cash = Math.max(world.player.cash, notional);
    const cashBefore = world.player.cash;
    const result = executeAction(world, "player", "buyShares", { corpId: foreign!.id, shares: 1 });
    expect(result.ok).toBe(true);
    expect(world.player.cash).toBe(cashBefore - notional);
    const dto = projectMarkets(createWorld(US)).listings.find((l) => l.id === foreign!.id);
    expect(dto?.cashCurrencyMatches).toBe(false);
    expect(dto?.buy.available).toBe(false);
    expect(dto?.sell.available).toBe(false);
  });
});

describe("seeded corporation surface", () => {
  it("projects every corporation createWorld actually seeded and no extras", () => {
    const world = createWorld(US);
    const ids = new Set(Object.keys(world.corporations));
    const view = projectMarkets(world);
    expect(new Set(view.listings.map((l) => l.id))).toEqual(ids);
    expect(ids.has("US-media")).toBe(true);
    expect(ids.has("US-manufacturing")).toBe(true);
  });
});

describe("DTO size", () => {
  it("reports a compact query compared with the live world document", () => {
    const world = createWorld(US) as WorldState;
    const view = projectMarkets(world);
    const dtoBytes = Buffer.byteLength(JSON.stringify(view), "utf8");
    const worldBytes = Buffer.byteLength(JSON.stringify(world), "utf8");
    expect(dtoBytes).toBeLessThan(worldBytes);
    expect(dtoBytes).toBeLessThan(100_000);
    expect(view.listings.length).toBeGreaterThan(10);
    console.info(
      `projectMarkets DTO ${dtoBytes} bytes, world JSON ${worldBytes} bytes, ${view.listings.length} listings, ${view.countries.length} countries`,
    );
  });
});

describe("sector directory projection", () => {
  it("groups every listed corporation into its recorded sector with per-currency values", () => {
    const view = projectMarkets(createWorld(US));
    expect(view.sectors.length).toBeGreaterThan(0);

    expect(new Set(view.sectors.map((s) => s.sectorType))).toEqual(new Set(view.listings.map((l) => l.sectorType)));
    expect(view.sectors.reduce((sum, sector) => sum + sector.companyCount, 0)).toBe(view.listings.length);

    for (const sector of view.sectors) {
      const members = view.listings.filter((l) => l.sectorType === sector.sectorType);
      expect(sector.companyCount).toBe(members.length);
      expect(new Set(sector.companyIds)).toEqual(new Set(members.map((l) => l.id)));

      const currencies = [...new Set(members.map((l) => l.currency))].sort((a, b) => a.localeCompare(b));
      expect(sector.values.map((v) => v.currency)).toEqual(currencies);
      for (const value of sector.values) {
        const inCurrency = members.filter((l) => l.currency === value.currency);
        expect(value.companyCount).toBe(inCurrency.length);
        const expected = Math.round(inCurrency.reduce((sum, l) => sum + l.sharePrice * l.totalShares, 0) * 100) / 100;
        expect(value.marketValue).toBeCloseTo(expected, 2);
      }
    }
  });

  it("sorts sectors by label and keeps values split per currency, never a cross-currency total", () => {
    const view = projectMarkets(createWorld(US));
    const labels = view.sectors.map((s) => s.sectorLabel);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(JSON.stringify(view)).not.toMatch(/marketCapUsd|totalMarketCap|usdEquivalent|totalMarketValue/i);

    // A US-world still seeds foreign corporations, so some sectors span currencies.
    const multi = view.sectors.find((s) => s.values.length > 1);
    expect(multi).toBeDefined();
    for (const sector of view.sectors) {
      expect(sector.values.length).toBeLessThanOrEqual(new Set(sector.companyIds).size);
    }
  });

  it("points each sector entry at listings present in the same projection", () => {
    const view = projectMarkets(createWorld(US));
    const ids = new Set(view.listings.map((l) => l.id));
    for (const sector of view.sectors) {
      for (const id of sector.companyIds) expect(ids.has(id)).toBe(true);
    }

    const media = view.sectors.find((s) => s.sectorType === "media");
    expect(media?.sectorLabel).toBe("media");
    expect(media!.companyCount).toBeGreaterThan(0);
    const mediaListingIds = view.listings.filter((l) => l.sectorType === "media").map((l) => l.id);
    expect(new Set(media!.companyIds)).toEqual(new Set(mediaListingIds));
    for (const value of media!.values) expect(value.marketValue).toBeGreaterThan(0);
  });
});

describe("recorded ownership projection", () => {
  it("surfaces each corporation's recorded shareholders and controlling holder verbatim", () => {
    const world = createWorld(US);
    const corp = world.corporations["US-media"]!;
    const media = projectMarkets(world).listings.find((l) => l.id === "US-media")!;
    expect(media.shareholders).toEqual([{ holder: "npc", shares: corp.shareholders[0]!.shares, avgCostPerShare: null }]);
    expect(media.controllingHolder).toBe("npc");
    for (const shareholder of media.shareholders) {
      // Only recorded fields are projected — no owner name or id is fabricated.
      expect(Object.keys(shareholder).sort()).toEqual(["avgCostPerShare", "holder", "shares"]);
    }
  });

  it("follows the player into ownership once shares are bought, without inventing a name", () => {
    const world = createWorld(US);
    executeAction(world, "player", "buyShares", { corpId: "US-media", shares: 10 });
    const media = projectMarkets(world).listings.find((l) => l.id === "US-media")!;
    const player = media.shareholders.find((s) => s.holder === "player")!;
    expect(player.shares).toBe(10);
    expect(player.avgCostPerShare).toBe(world.corporations["US-media"]!.sharePrice);
    expect(media.shareholders.every((s) => s.holder === "npc" || s.holder === "player")).toBe(true);
    expect(media.controllingHolder).toBe("npc");
  });

  it("reads the controlling holder from recorded shares and returns null on a tie or no holders", () => {
    const world = createWorld(US);
    const corp = world.corporations["US-media"]!;

    corp.shareholders = [
      { holder: "npc", shares: 4 },
      { holder: "player", shares: 6, avgCostPerShare: 3 },
    ];
    expect(projectMarkets(world).listings.find((l) => l.id === "US-media")!.controllingHolder).toBe("player");

    corp.shareholders = [
      { holder: "npc", shares: 5 },
      { holder: "player", shares: 5, avgCostPerShare: 3 },
    ];
    expect(projectMarkets(world).listings.find((l) => l.id === "US-media")!.controllingHolder).toBeNull();

    corp.shareholders = [];
    const empty = projectMarkets(world).listings.find((l) => l.id === "US-media")!;
    expect(empty.controllingHolder).toBeNull();
    expect(empty.shareholders).toEqual([]);
  });
});
