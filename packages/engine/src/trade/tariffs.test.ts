import { describe, expect, it } from "vitest";
import { importerTariffFraction, tariffAdjustedAffinity, type TradeTariffRecord } from "./tariffs.js";
import { createWorld } from "../world.js";
import { reconcileTradeTariffs } from "./tariffs.js";

const cnTariff: TradeTariffRecord = {
  id: "cn-economy-wide", countryId: "CN", scopeType: "economy_wide", rate: 25,
  sourceBillId: "cn-customs-bill", createdTurn: 4, updatedTurn: 4,
};

describe("source economy-wide tariff affinity", () => {
  it("applies importer rows only, clamps summed rate at 100%, and exempts an active FTA", () => {
    expect(importerTariffFraction([cnTariff], "CN", false)).toBe(0.25);
    expect(importerTariffFraction([cnTariff], "US", false)).toBe(0);
    expect(importerTariffFraction([cnTariff, { ...cnTariff, id: "second", rate: 90 }], "CN", false)).toBe(1);
    expect(importerTariffFraction([cnTariff], "CN", true)).toBe(0);
  });

  it("uses Game's 3x tariff drag in the affinity weight", () => {
    // Game cb66: scale=3 and drag=1/(1+scale*rateFraction).
    expect(tariffAdjustedAffinity(1.5, [cnTariff], "CN", false)).toBe(1.5 / (1 + 3 * 0.25));
    expect(tariffAdjustedAffinity(1.5, [cnTariff], "CN", true)).toBe(1.5);
  });

  it("bootstraps only Game's authored baseline countries and replays a signed trade-category CN tariff provision", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "tariff-reconcile-vector", playerName: "Player" });
    reconcileTradeTariffs(world);
    expect(world.tradeTariffs?.find((row) => row.countryId === "US")).toMatchObject({
      scopeType: "economy_wide", sourceBillId: "680bfd000000000000000001",
    });
    expect(world.tradeTariffs?.some((row) => row.countryId === "CN")).toBe(false);

    world.bills.push({
      id: "bill-cn-customs", title: "Customs tariff", summary: "", countryId: "CN", category: "trade",
      legislationTypeId: "trade.customs_tariff", effectDirection: 1,
      provisions: [{ type: "tariff", legislationTypeId: "trade.customs_tariff", effectDirection: 1, tariffScopeType: "economy_wide", tariffRate: 10 }],
      originChamber: "house", currentChamber: "house", status: "signed", sponsorId: "player", sponsorName: "Player",
      sponsorPartyId: null, votes: {}, votesFor: 1, votesAgainst: 0, votesAbstain: 0,
      proposedAtTurn: 1, enactedAtTurn: 2, filibusterInvocations: [], updatedAtTurn: 2, committeeId: null,
    });
    reconcileTradeTariffs(world);
    expect(world.tradeTariffs?.find((row) => row.countryId === "CN")).toMatchObject({
      rate: 10, sourceBillId: "bill-cn-customs",
    });
    world.tradeTariffs!.find((row) => row.countryId === "CN")!.rate = 1;
    reconcileTradeTariffs(world);
    expect(world.tradeTariffs?.find((row) => row.countryId === "CN")?.rate).toBe(10);
  });
});
