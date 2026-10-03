import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { runCorporationTurn } from "../corporation/corporationTurn.js";
import { deserializeSave, serializeSave } from "../save.js";
import { subscribeIndexFund } from "./book.js";

describe("source index fund dividend custody", () => {
  it("routes the held-share fraction into fund cash and removes it from unposted issuer dividends", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "source-index-fund-dividend", playerName: "Alex" });
    const corporation = world.corporations["US-media"]!;
    const fund = world.indexFundBook!.funds.us_top_25!;
    const shares = 100_000;
    expect(corporation.publicFloat).toBeGreaterThan(shares);
    corporation.publicFloat -= shares;
    fund.holdings[corporation.id] = { shares, averageCostPerShare: 10, lastValueAnchor: shares * 10 };

    corporation.revenue = 100_000;
    corporation.profitMargin = 20;
    corporation.effectiveProfitMargin = 20;
    corporation.currentGrowthRate = 0;
    corporation.targetGrowthRate = 0;
    corporation.currentGrowthCost = 0;
    corporation.liquidCapital = 10_000;
    corporation.ceoVacant = true;
    corporation.ceoSalaryPerTurn = 0;
    corporation.rdBudgetPerTurn = 0;
    corporation.totalShares = 10_000_000;
    corporation.dividendRate = 25;
    const cashBefore = fund.cashAnchor;

    runCorporationTurn(corporation, 0, undefined, {
      player: world.player,
      currencyCode: "USD",
      indexFundBook: world.indexFundBook,
      corporationCurrencyCode: "USD",
      playerCurrencyCode: "USD",
      foreignExchangeEnabled: true,
      turn: world.meta.turn,
    });
    expect(corporation.lastDividendPoolPaid).toBe(5_000);
    expect(corporation.lastUnpostedDividendPaid).toBe(4_950);
    expect(fund.cashAnchor).toBe(cashBefore + 50);
    expect(world.indexFundBook!.transactions).toContainEqual(expect.objectContaining({
      kind: "dividendReceipt", corporationId: corporation.id, units: shares, cashAnchor: 50,
    }));
    fund.quotedNav = (fund.cashAnchor + Object.values(fund.holdings).reduce((sum, holding) => sum + holding.lastValueAnchor, 0)) / fund.unitSupply;
    const reloaded = deserializeSave(serializeSave(world, "2026-10-03T15:00:00.000Z"));
    expect(reloaded.indexFundBook!.funds.us_top_25!.cashAnchor).toBe(cashBefore + 50);
    expect(reloaded.indexFundBook!.transactions).toContainEqual(expect.objectContaining({
      kind: "dividendReceipt", corporationId: corporation.id, units: shares, cashAnchor: 50,
    }));
  });

  it("pays the source-rounded dividend share to a real subscribed player position", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "source-index-fund-holder-dividend", playerName: "Alex" });
    const corporation = world.corporations["US-media"]!;
    const fund = world.indexFundBook!.funds.us_top_25!;
    expect(subscribeIndexFund(world, fund.slug, 1).ok).toBe(true);
    const shares = 1_000;
    expect(corporation.publicFloat).toBeGreaterThan(shares);
    corporation.publicFloat -= shares;
    fund.holdings[corporation.id] = { shares, averageCostPerShare: 10, lastValueAnchor: shares * 10 };
    corporation.revenue = 2_500_000_000;
    corporation.profitMargin = 40;
    corporation.effectiveProfitMargin = 40;
    corporation.currentGrowthRate = 0;
    corporation.targetGrowthRate = 0;
    corporation.currentGrowthCost = 0;
    corporation.liquidCapital = 10_000;
    corporation.ceoVacant = true;
    corporation.ceoSalaryPerTurn = 0;
    corporation.rdBudgetPerTurn = 0;
    corporation.totalShares = 10_000_000;
    corporation.dividendRate = 25;
    const fundCashBefore = fund.cashAnchor;
    const playerCashBefore = world.player.cash;

    runCorporationTurn(corporation, 0, undefined, {
      player: world.player,
      currencyCode: "USD",
      indexFundBook: world.indexFundBook,
      corporationCurrencyCode: "USD",
      playerCurrencyCode: "USD",
      foreignExchangeEnabled: true,
      turn: world.meta.turn,
    });

    const grossFundDividend = corporation.lastDividendPoolPaid * shares / corporation.totalShares;
    const sourcePassThrough = grossFundDividend * 0.25;
    const sourcePlayerPayout = Math.floor((sourcePassThrough / fund.unitSupply) * 100) / 100;
    expect(sourcePlayerPayout).toBeGreaterThan(0);
    expect(world.player.cash).toBe(playerCashBefore + sourcePlayerPayout);
    expect(fund.cashAnchor).toBe(fundCashBefore + grossFundDividend - sourcePlayerPayout);
    expect(world.indexFundBook!.transactions).toContainEqual(expect.objectContaining({
      kind: "dividendPayout", corporationId: corporation.id, units: 1, cashAnchor: sourcePlayerPayout,
    }));
    fund.quotedNav = (fund.cashAnchor + Object.values(fund.holdings).reduce((sum, holding) => sum + holding.lastValueAnchor, 0)) / fund.unitSupply;
    const reloaded = deserializeSave(serializeSave(world, "2026-10-03T15:00:00.000Z"));
    expect(reloaded.player.cash).toBe(playerCashBefore + sourcePlayerPayout);
    expect(reloaded.indexFundBook!.transactions).toContainEqual(expect.objectContaining({
      kind: "dividendPayout", corporationId: corporation.id, units: 1, cashAnchor: sourcePlayerPayout,
    }));
  });
});
