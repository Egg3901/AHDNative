import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { runCorporationTurn } from "./corporationTurn.js";

describe("corporation CEO and dividend settlement", () => {
  it("pays capped per-turn CEO salary and source-rate dividends to the recorded player holder", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "ceo-compensation-51", playerName: "Alex" });
    const corp = world.corporations["US-media"]!;
    corp.revenue = 100_000;
    corp.profitMargin = 20;
    corp.effectiveProfitMargin = 20;
    corp.currentGrowthRate = 0;
    corp.targetGrowthRate = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 10_000;
    corp.totalShares = 10_000_000;
    corp.shareholders = [{ holder: "player", shares: 1_000_000 }];
    corp.ceoId = "player";
    corp.ceoType = "player";
    corp.ceoVacant = false;
    corp.ceoSalaryPerTurn = 1_000;
    corp.dividendRate = 25;
    const cashBefore = world.player.cash;

    runCorporationTurn(corp, 0, undefined, { player: world.player, currencyCode: "USD" });

    // AHDGame sectorCalculations.ts subtracts salary before tax, caps it at
    // 1.25x revenue, then pays at most 25% of positive after-tax income.
    // Here: 20,000 operating income − 1,000 salary = 19,000; 25% = 4,750;
    // the recorded 10% holding receives 475 in addition to the 1,000 salary.
    expect(corp.lastCeoSalaryPaid).toBe(1_000);
    expect(corp.lastDividendPoolPaid).toBe(4_750);
    expect(corp.lastPlayerDividendPaid).toBe(475);
    expect(world.player.cash - cashBefore).toBe(1_475);
    expect(corp.liquidCapital).toBe(24_250);
    expect(corp.earningsHistory.at(-1)).toBe(19_000 * 48);
  });

  it("clears unpaid compensation for a vacant CEO and never distributes dividends on a loss", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "ceo-vacancy-51", playerName: "Alex" });
    const corp = world.corporations["US-media"]!;
    corp.revenue = 100_000;
    corp.profitMargin = -10;
    corp.effectiveProfitMargin = -10;
    corp.currentGrowthRate = 0;
    corp.targetGrowthRate = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 10_000;
    corp.ceoId = "player";
    corp.ceoVacant = true;
    corp.ceoSalaryPerTurn = 1_000;
    corp.dividendRate = 25;
    const cashBefore = world.player.cash;

    runCorporationTurn(corp, 0, undefined, { player: world.player, currencyCode: "USD" });

    expect(corp.lastCeoSalaryPaid).toBe(0);
    expect(corp.lastDividendPoolPaid).toBe(0);
    expect(corp.lastPlayerDividendPaid).toBe(0);
    expect(world.player.cash).toBe(cashBefore);
  });

  it("caps salary at 1.25x gross revenue even when the company can afford more", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "ceo-salary-cap-51", playerName: "Alex" });
    const corp = world.corporations["US-media"]!;
    corp.revenue = 100_000;
    corp.profitMargin = 20;
    corp.currentGrowthRate = 0;
    corp.targetGrowthRate = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 1_000_000;
    corp.ceoId = "player";
    corp.ceoVacant = false;
    corp.ceoSalaryPerTurn = 500_000;
    const cashBefore = world.player.cash;

    runCorporationTurn(corp, 0, undefined, { player: world.player, currencyCode: "USD" });

    expect(corp.lastCeoSalaryPaid).toBe(125_000);
    expect(world.player.cash - cashBefore).toBe(125_000);
    expect(corp.lastDividendPoolPaid).toBe(0);
  });

  it("pays dividends independently of CEO status and clamps a legacy rate to 25%", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "dividend-cap-51", playerName: "Alex" });
    const corp = world.corporations["US-media"]!;
    corp.revenue = 100_000;
    corp.profitMargin = 20;
    corp.currentGrowthRate = 0;
    corp.targetGrowthRate = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 10_000;
    corp.totalShares = 10_000_000;
    corp.shareholders = [{ holder: "player", shares: 1_000_000 }];
    corp.dividendRate = 100;
    const cashBefore = world.player.cash;

    runCorporationTurn(corp, 0, undefined, { player: world.player, currencyCode: "USD" });

    expect(corp.lastCeoSalaryPaid).toBe(0);
    expect(corp.lastDividendPoolPaid).toBe(5_000);
    expect(corp.lastPlayerDividendPaid).toBe(500);
    expect(corp.lastUnpostedDividendPaid).toBe(4_500);
    expect(world.player.cash - cashBefore).toBe(500);
  });
});
