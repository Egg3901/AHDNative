import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { applySourceStateCorporateTaxBaseUpdate } from "./sourceStateBudget.js";
import { projectHistoricalConsumer } from "../testing/historicalProjection.js";

describe("source StateBudget snapshots", () => {
  it("retains Game's literal GDP basis and budget lines through save and ordinary-turn continuation", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", playerName: "Tester", seed: "ng-source-budget" });
    const initial = world.sourceStateBudgets?.NORTH_WEST;
    expect(initial).toMatchObject({
      source: "AHDGame.generateStateBudgets",
      fiscalYear: 1953,
      sourceFiscalYear: 1953,
      stateGdp: 979_000_000,
      gdpInput: { amount: 979, currencyCode: "USD", unit: "millions" },
      amountBasis: "literal-state-gdp-times-one-million-no-fx",
      revenue: { federalGrants: 11_748_000, total: 95_256_700 },
      balance: 0,
      surplus: 0,
    });
    expect(initial?.spending.byCategory).toEqual({
      education: 33_339_844.999999996,
      healthcare: 23_814_175,
      transportation: 14_288_505,
      publicSafety: 11_430_804,
      other: 12_383_371,
    });

    const updated = applySourceStateCorporateTaxBaseUpdate(initial!, {
      turn: 0,
      domesticAnnualIncomeLocal: 9_600,
      foreignAnnualIncomeLocal: 4_800,
    });
    expect(updated.taxBases.domesticCorporateProfits).toBe(979_000_000 * 0.06 * 0.75 + 9_600 * 0.25);
    expect(updated.taxBases.foreignCorporateProfits).toBe(979_000_000 * 0.02 * 0.75 + 4_800 * 0.25);
    expect(updated.taxBases.taxableIncome).toBe(initial!.taxBases.taxableIncome);
    world.sourceStateBudgets!.NORTH_WEST = updated;

    const saved = serializeSave(world, "2026-10-04T00:00:00.000Z");
    const restored = deserializeSave(saved);
    expect(restored.sourceStateBudgets).toEqual(world.sourceStateBudgets);
    expect(projectHistoricalConsumer(world, ["sourceStateBudgets"])).toMatchObject({
      ok: false,
      error: expect.stringContaining("Source StateBudget snapshots"),
    });

    const malformed = JSON.parse(saved) as { world: { sourceStateBudgets: Record<string, { revenue: { total: number } }> } };
    malformed.world.sourceStateBudgets.NORTH_WEST!.revenue.total += 1;
    expect(() => deserializeSave(JSON.stringify(malformed))).toThrow(/invalid source StateBudget snapshot NORTH_WEST/);

    const corruptUpdate = JSON.parse(saved) as { world: { sourceStateBudgets: Record<string, { corporateTaxBaseUpdate?: { domesticAnnualIncomeLocal: number } }> } };
    corruptUpdate.world.sourceStateBudgets.NORTH_WEST!.corporateTaxBaseUpdate = {
      domesticAnnualIncomeLocal: 9_600,
    };
    expect(() => deserializeSave(JSON.stringify(corruptUpdate))).toThrow(/invalid source StateBudget update NORTH_WEST/);

    for (let turn = 0; turn < 3; turn += 1) advanceTurn(restored);
    expect(Object.values(restored.sourceStateBudgets ?? {}).some((row) => row.corporateTaxBaseUpdate !== undefined)).toBe(true);
    const afterTurn = structuredClone(restored.sourceStateBudgets);
    const continued = deserializeSave(serializeSave(restored, "2026-10-04T00:01:00.000Z"));
    expect(continued.sourceStateBudgets).toEqual(afterTurn);
  });
});
