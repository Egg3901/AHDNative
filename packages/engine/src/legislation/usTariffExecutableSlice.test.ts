import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { getLaw } from "./catalog.js";

describe("source US tariff law (#285)", () => {
  it("sponsors the authored tariff rate, phases the budget rate, and continues through save/reload", () => {
    const world = createWorld({ seed: "us-tariff-285", playerName: "Customs Chair", countryId: "US", era: "1953", mode: "hos" });
    world.nppAutonomyLevel = "off";
    world.player.actions = 100;
    world.player.nationalInfluence = 30;
    expect(world.player.currentOffice).toMatchObject({ countryId: "US" });

    const catalog = getLaw("us.tax.tariffs");
    expect(catalog).toMatchObject({
      countryId: "US", kind: "tax", title: "Tariff and Customs Act", status: "available",
      taxPolicy: { scope: "federal", taxType: "tariffs", minRate: 0, maxRate: 15, step: 0.5, baselineRate: 0 },
    });
    const result = executeAction(world, "player", "sponsorBill", { catalogId: "us.tax.tariffs", taxRate: 6 });
    expect(result.ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({
      countryId: "US", status: "signed", selectedRate: 6,
      provisions: [expect.objectContaining({ legislationTypeId: "us.tax.tariffs" })],
    });
    expect(world.budgets.US?.taxRates.tariffs).toBe(1);
    expect(world.budgets.US?.taxRatePhaseIn?.tariffs).toBe(6);

    const saved = deserializeSave(serializeSave(world, "1953-01-06T00:00:00.000Z"));
    expect(saved.budgets.US?.taxRatePhaseIn?.tariffs).toBe(6);
    advanceTurn(world);
    advanceTurn(saved);
    expect(saved.budgets.US?.taxRates.tariffs).toBe(world.budgets.US?.taxRates.tariffs);
    expect(saved.budgets.US?.taxRatePhaseIn).toEqual(world.budgets.US?.taxRatePhaseIn);
    expect(saved.bills.at(-1)?.status).toBe("signed");
  });
});
