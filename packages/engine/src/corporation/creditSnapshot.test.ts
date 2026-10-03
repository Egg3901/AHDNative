import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { advanceTurn } from "../engine.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { calculateSourceCorporateCreditScore } from "../bonds/corporateCredit.js";
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import { TURNS_PER_DAY } from "./constants.js";
import { refreshNativeCorporateCreditSnapshots } from "./creditSnapshot.js";

describe("source issuer credit snapshots", () => {
  it("normalizes a foreign-hosted asset in its GBP issuer currency before source NPV annualization", () => {
    const world = createWorld({ era: "1953", countryId: "UK", seed: "credit-snapshot-multicountry", playerName: "Alex" });
    const issuer = world.corporations["UK-manufacturing"]!;
    const asset = Object.values(world.corporateSectors ?? {}).find((row) => row.corporationId === issuer.id)!;
    issuer.liquidCurrencyCode = "GBP";
    asset.countryId = "US";
    asset.realizedRevenue = 70_000;
    asset.effectiveProfitMargin = 40;
    asset.constructionInProgressAnchor = 0;
    const gbpRate = Object.values(world.exchangeRates).find((row) => row.currencyCode === "GBP")!.rate;
    const usdRate = Object.values(world.exchangeRates).find((row) => row.currencyCode === "USD")!.rate;
    expect(gbpRate).not.toBe(usdRate);

    refreshNativeCorporateCreditSnapshots(world);

    // Source sectorDailyProfitAnchor reads GBP issuer-denominated revenue,
    // despite the sector's foreign countryId, then source bondTurn applies
    // dailyProfit / TURNS_PER_DAY * TURNS_PER_YEAR for sector NPV.
    const sourceDailyProfitAnchor = asset.realizedRevenue * TURNS_PER_DAY / gbpRate * 0.4;
    const sourceSectorNpv = sourceDailyProfitAnchor / TURNS_PER_DAY * TURNS_PER_YEAR / 0.15;
    const liquidCapitalAnchor = issuer.liquidCapital / gbpRate;
    const expected = calculateSourceCorporateCreditScore({
      liquidCapitalAnchor,
      totalDebtAnchor: 0,
      annualIncomeAnchor: issuer.earningsHistory.at(-1) ?? 0,
      annualInterestAnchor: 0,
      totalEquityAnchor: liquidCapitalAnchor + sourceSectorNpv,
    });
    expect(issuer.creditRatingComponents).toEqual(expected.components);
    expect(issuer.creditCompositeSnapshot).toBe(expected.compositeScore);
    expect(issuer.creditRatingSnapshot).toBe(expected.rating);
  });

  it("writes rating components in an ordinary turn and resumes the next snapshot deterministically", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "credit-snapshot-writer", playerName: "Alex" });
    advanceTurn(world);

    const issuer = world.corporations["US-manufacturing"]!;
    expect(issuer.creditSnapshotTurn).toBe(world.meta.turn);
    expect(issuer.creditRatingSnapshot).toMatch(/^(AAA|AA|A|BBB|BB|B|CCC)$/);
    expect(issuer.creditCompositeSnapshot).toBeGreaterThanOrEqual(0);
    expect(issuer.creditCompositeSnapshot).toBeLessThanOrEqual(100);
    expect(Object.keys(issuer.creditRatingComponents ?? {}).sort()).toEqual([
      "debtToEquity", "interestCoverage", "liquidity", "profitability",
    ]);

    const raw = serializeSave(world, "2026-10-03T00:00:00.000Z");
    const resumed = deserializeSave(raw);
    expect(resumed.corporations[issuer.id]).toMatchObject({
      creditRatingSnapshot: issuer.creditRatingSnapshot,
      creditCompositeSnapshot: issuer.creditCompositeSnapshot,
      creditSnapshotTurn: issuer.creditSnapshotTurn,
      creditRatingComponents: issuer.creditRatingComponents,
    });
    const uninterrupted = deserializeSave(raw);
    advanceTurn(resumed);
    advanceTurn(uninterrupted);
    expect(resumed.corporations[issuer.id]).toMatchObject({
      creditRatingSnapshot: uninterrupted.corporations[issuer.id]!.creditRatingSnapshot,
      creditCompositeSnapshot: uninterrupted.corporations[issuer.id]!.creditCompositeSnapshot,
      creditSnapshotTurn: uninterrupted.corporations[issuer.id]!.creditSnapshotTurn,
      creditRatingComponents: uninterrupted.corporations[issuer.id]!.creditRatingComponents,
    });
    expect(projectSaveToV42(raw).ok).toBe(false);
  });

  it("rejects malformed persisted component snapshots", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "credit-snapshot-validator", playerName: "Alex" });
    const corporation = world.corporations["US-manufacturing"]!;
    corporation.creditCompositeSnapshot = 50;
    corporation.creditSnapshotTurn = world.meta.turn;
    corporation.creditRatingComponents = { debtToEquity: 50, interestCoverage: 50, profitability: 50, liquidity: 50 };
    const legacy = deserializeSave(gunzipSync(readFileSync(new URL("../../../../fixtures/v42-1953-US.save.json.gz", import.meta.url))).toString("utf8"));
    const legacyIssuer = Object.values(legacy.corporations)[0]!;
    legacyIssuer.creditCompositeSnapshot = 50;
    legacyIssuer.creditSnapshotTurn = legacy.meta.turn;
    legacyIssuer.creditRatingComponents = { debtToEquity: 50, interestCoverage: 50, profitability: 50, liquidity: 50 };
    const projected = projectSaveToV42(serializeSave(legacy, "2026-10-03T00:00:00.000Z"));
    expect(projected).toMatchObject({
      ok: false,
      error: expect.stringContaining("source credit continuation state"),
    });
    const malformed = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    malformed.world.corporations[corporation.id].creditRatingComponents.liquidity = 50.5;
    expect(() => deserializeSave(JSON.stringify(malformed))).toThrow(/invalid issuer credit-rating components/);
  });
});
