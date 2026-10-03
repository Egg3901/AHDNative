import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";

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

    const saved = serializeSave(world, "2026-10-04T00:00:00.000Z");
    const restored = deserializeSave(saved);
    expect(restored.sourceStateBudgets).toEqual(world.sourceStateBudgets);
    expect(projectSaveToV42(saved)).toMatchObject({ ok: false, error: expect.stringContaining("Source StateBudget snapshots") });

    const malformed = JSON.parse(saved) as { world: { sourceStateBudgets: Record<string, { revenue: { total: number } }> } };
    malformed.world.sourceStateBudgets.NORTH_WEST!.revenue.total += 1;
    expect(() => deserializeSave(JSON.stringify(malformed))).toThrow(/invalid source StateBudget snapshot NORTH_WEST/);

    advanceTurn(restored);
    const continued = deserializeSave(serializeSave(restored, "2026-10-04T00:01:00.000Z"));
    expect(continued.sourceStateBudgets).toEqual(world.sourceStateBudgets);
  });
});
