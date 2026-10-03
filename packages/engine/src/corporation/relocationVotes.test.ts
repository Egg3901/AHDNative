import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { resolveDueCorporateRelocationVotes, sourceRelocationVoteThreshold } from "./relocationVotes.js";

function publicIssuer() {
  const world = createWorld({ era: "1953", countryId: "US", seed: "corp-relocation-vote", playerName: "Alex" });
  const corporation = world.corporations["US-manufacturing"]!;
  corporation.ceoId = "player";
  corporation.ceoType = "player";
  corporation.ceoVacant = false;
  const playerShares = Math.floor(corporation.totalShares / 2);
  corporation.shareholders = [
    { holder: "player", shares: playerShares },
    { holder: "npc", shares: corporation.totalShares - playerShares },
  ];
  corporation.publicFloat = 0;
  return { world, corporation };
}

describe("source corporate relocation votes", () => {
  it("counts fund-held issued shares in the source vote denominator and supports a controlled fund instruction", () => {
    const { world, corporation } = publicIssuer();
    const fund = world.indexFundBook!.funds.us_top_25!;
    const fundShares = 2_000_000;
    corporation.shareholders = [
      { holder: "player", shares: 4_000_000 },
      { holder: "npc", shares: 4_000_000 },
    ];
    corporation.publicFloat = 0;
    fund.holdings[corporation.id] = { shares: fundShares, averageCostPerShare: 10, lastValueAnchor: fundShares * 10 };

    const opened = executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: "LON",
    });
    expect(opened.ok).toBe(true);
    expect(corporation.relocationVote?.eligibleSharesAtOpen).toBe(corporation.totalShares);
    const refused = executeAction(world, "player", "directIndexFundRelocationVote", {
      corporationId: corporation.id, fundSlug: fund.slug, relocationChoice: "yes",
    });
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/control enough units/i) });
    expect(corporation.relocationVote?.fundDirections).toBeUndefined();
  });

  it("persists a fund instruction and rechecks the director before it affects the shareholder vote", () => {
    const { world, corporation } = publicIssuer();
    const fund = world.indexFundBook!.funds.us_top_25!;
    const fundShares = 2_000_000;
    corporation.shareholders = [
      { holder: "player", shares: 4_000_000 },
      { holder: "npc", shares: 4_000_000 },
    ];
    corporation.publicFloat = fundShares;
    fund.holdings[corporation.id] = { shares: fundShares, averageCostPerShare: 10, lastValueAnchor: fundShares * 10 };
    world.player.cash = 50_000_000;
    expect(executeAction(world, "player", "subscribeIndexFund", { fundSlug: fund.slug, units: 500_000 }).ok).toBe(true);
    const purchaseCash = fundShares * 10;
    corporation.publicFloat -= fundShares;
    fund.cashAnchor -= purchaseCash;
    corporation.liquidCapital += purchaseCash;
    world.indexFundBook!.transactions.push({ id: "fund-governance-purchase", turn: world.meta.turn, fundSlug: fund.slug, kind: "floatPurchase", corporationId: corporation.id, units: fundShares, cashAnchor: purchaseCash });
    fund.quotedNav = (fund.cashAnchor + fundShares * 10) / fund.unitSupply;
    expect(executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: "LON",
    }).ok).toBe(true);
    expect(executeAction(world, "player", "directIndexFundRelocationVote", {
      corporationId: corporation.id, fundSlug: fund.slug, relocationChoice: "no",
    }).ok).toBe(true);
    expect(corporation.relocationVote?.fundDirections).toEqual([{ fundSlug: fund.slug, directorId: "player", choice: "no" }]);
    expect(executeAction(world, "player", "voteCorporateRelocation", {
      corporationId: corporation.id, relocationChoice: "yes",
    }).ok).toBe(true);
    expect(corporation.relocationVote?.status).toBe("open");

    const saved = serializeSave(world, "2026-10-03T00:00:00.000Z");
    const restored = deserializeSave(saved);
    expect(restored.corporations[corporation.id]?.relocationVote?.fundDirections).toEqual(corporation.relocationVote?.fundDirections);
    const corrupt = JSON.parse(saved);
    corrupt.world.corporations[corporation.id].relocationVote.fundDirections = [{ fundSlug: "us_top_25", directorId: "former-holder", choice: "yes" }];
    expect(() => deserializeSave(JSON.stringify(corrupt))).toThrow(/invalid fund vote direction/);
    const withdrawn = deserializeSave(saved);
    expect(executeAction(withdrawn, "player", "redeemIndexFund", { fundSlug: fund.slug, units: 1 }).ok).toBe(true);
    expect(executeAction(withdrawn, "player", "directIndexFundRelocationVote", {
      corporationId: corporation.id, fundSlug: fund.slug, relocationChoice: "withdraw",
    }).ok).toBe(true);
    expect(withdrawn.corporations[corporation.id]?.relocationVote?.fundDirections).toEqual([]);
    expect(executeAction(restored, "player", "redeemIndexFund", { fundSlug: fund.slug, units: 1 }).ok).toBe(true);
    expect(executeAction(restored, "player", "voteCorporateRelocation", {
      corporationId: corporation.id, relocationChoice: "yes",
    }).ok).toBe(true);
    expect(restored.corporations[corporation.id]?.relocationVote?.status).toBe("passed");
  });

  it("uses source country thresholds and applies a public headquarters move through actions and save", () => {
    expect(sourceRelocationVoteThreshold("UK")).toBe(0.4);
    expect(sourceRelocationVoteThreshold("US")).toBe(0.5);
    const { world, corporation } = publicIssuer();
    const opened = executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: "LON",
    });
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    expect(corporation.relocationVote).toMatchObject({ status: "open", destinationCountryId: "UK", deadlineTurn: world.meta.turn + 24 });

    const cast = executeAction(world, "player", "voteCorporateRelocation", {
      corporationId: corporation.id, relocationChoice: "yes",
    });
    expect(cast).toMatchObject({ ok: true });
    expect(corporation.relocationVote?.status).toBe("passed");
    expect(corporation).toMatchObject({ countryId: "UK", headquartersRegionId: "LON" });

    const restored = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(restored.corporations[corporation.id]?.relocationVote).toEqual(corporation.relocationVote);
    expect(restored.corporations[corporation.id]).toMatchObject({ countryId: "UK", headquartersRegionId: "LON" });
  });

  it("checks destination marketization at proposal and permits entry at the dual-track boundary", () => {
    const { world, corporation } = publicIssuer();
    const destination = Object.values(world.regions).find((region) => region.countryId === "RU")!;
    expect(destination).toBeDefined();
    world.commandEconomy.RU!.marketizationLevel = 29.99;
    expect(executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: destination.id,
    })).toMatchObject({ ok: false, error: expect.stringMatching(/command economy/i) });
    world.commandEconomy.RU!.marketizationLevel = 30;
    expect(executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
  });

  it("fails an unpassed ballot at the source 24-turn deadline on the next corporate phase", () => {
    const { world, corporation } = publicIssuer();
    expect(executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: "LON",
    }).ok).toBe(true);
    world.meta.turn = corporation.relocationVote!.deadlineTurn;
    resolveDueCorporateRelocationVotes(world);
    expect(corporation.relocationVote?.status).toBe("failed");
    expect(corporation.countryId).toBe("US");
    expect(corporation.headquartersRegionId).not.toBe("LON");
  });
});
