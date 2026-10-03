import { describe, expect, it } from "vitest";
import { computeVolumePressure, currencyVolumesForLookback, effectiveTraderCount, liquidityFeeMultiplier, sizeFeeRate } from "./trade.js";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";

describe("source-sized currency trade fees and volume pressure", () => {
  it("matches source fee curve anchors and neutral/missing liquidity behavior", () => {
    expect(sizeFeeRate(10_000_000_000)).toBeCloseTo(0.2 * (1 - Math.log(2)), 12);
    expect(liquidityFeeMultiplier(100_000_000)).toBe(1);
    expect(liquidityFeeMultiplier(undefined)).toBe(1);
    expect(liquidityFeeMultiplier(0)).toBe(1.5);
  });

  it("normalizes gross traded amounts to anchor and weights only aligned trader breadth", () => {
    const world = createWorld({ era: "1979", countryId: "US", seed: "fx-volume-vector", playerName: "Alex" });
    world.meta.turn = 25;
    world.exchangeRates.UK!.rate = 0.357;
    world.forexTradeHistory = [
      { id: "a", turn: 25, traderId: "A", fromCurrency: "GBP", toCurrency: "USD", amount: 357, anchorAmount: 1_000, spread: 0, source: "manual" },
      { id: "b", turn: 25, traderId: "B", fromCurrency: "GBP", toCurrency: "USD", amount: 357, anchorAmount: 1_000, spread: 0, source: "manual" },
      { id: "c", turn: 25, traderId: "C", fromCurrency: "GBP", toCurrency: "USD", amount: 357, anchorAmount: 1_000, spread: 0, source: "manual" },
      { id: "d", turn: 25, traderId: "D", fromCurrency: "GBP", toCurrency: "USD", amount: 357, anchorAmount: 1_000, spread: 0, source: "manual" },
      { id: "e", turn: 25, traderId: "E", fromCurrency: "GBP", toCurrency: "USD", amount: 357, anchorAmount: 1_000, spread: 0, source: "manual" },
      { id: "old", turn: 0, traderId: "old", fromCurrency: "GBP", toCurrency: "USD", amount: 999_999, anchorAmount: 999_999, spread: 0, source: "manual" },
    ];
    const volumes = currencyVolumesForLookback(world);
    expect(volumes.GBP).toMatchObject({ sellVolume24: 5_000, effectiveTraders: 5 });
    expect(volumes.USD).toMatchObject({ buyVolume24: 5_000, effectiveTraders: 5 });
    expect(effectiveTraderCount([100, -20, -20])).toBeCloseTo(1);
    expect(computeVolumePressure({ buyVolume24: 1_000_000_000, sellVolume24: 0, effectiveTraders: 5 })).toBeCloseTo(0.00125);
    expect(computeVolumePressure({ buyVolume24: 1_000_000_000, sellVolume24: 0, effectiveTraders: 1 })).toBeCloseTo(0.00025);
  });

  it("round-trips stamped trades in the current schema and rejects malformed history", () => {
    const world = createWorld({ era: "1979", countryId: "US", seed: "fx-save-vector", playerName: "Alex" });
    world.forexTradeHistory!.push({
      id: "fx-0-1", turn: 0, traderId: "player", fromCurrency: "USD", toCurrency: "GBP",
      amount: 100, anchorAmount: 100, spread: 1, source: "manual",
    });
    const raw = serializeSave(world, "2026-10-03T07:00:00.000Z");
    expect(JSON.parse(raw).schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(66);
    expect(deserializeSave(raw).forexTradeHistory).toEqual(world.forexTradeHistory);
    const malformed = JSON.parse(raw);
    malformed.world.forexTradeHistory[0].spread = -1;
    expect(() => deserializeSave(JSON.stringify(malformed))).toThrow("invalid forex trade history row");

    for (const [key, value] of [
      ["fromCurrency", "ZZZ"],
      ["traderId", "npc"],
      ["id", "invented"],
      ["turn", 1],
      ["amount", null],
    ] as const) {
      const invalid = JSON.parse(raw);
      invalid.world.forexTradeHistory[0][key] = value;
      expect(() => deserializeSave(JSON.stringify(invalid))).toThrow("invalid forex trade history row");
    }
  });
});
