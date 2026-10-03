import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { serializeSave, deserializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS } from "./relocatePlayerWithCorporation.js";
import { ensureCampaign } from "../campaigns/lifecycle.js";

function relocationWorld() {
  const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "ceo-relocation-source", playerName: "Alex" });
  const corp = world.corporations["US-manufacturing"]!;
  corp.ceoId = "player";
  corp.ceoType = "player";
  corp.ceoVacant = false;
  corp.headquartersRegionId = "DC";
  corp.sharePrice = 12;
  corp.totalShares = 100_000;
  corp.liquidCapital = 100_000;
  const destination = Object.values(world.regions).find((region) => region.countryId === "US" && region.id !== "DC" && !region.corporationHeadquartersOnly)!;
  return { world, corp, destination };
}

describe("source CEO relocation with corporation", () => {
  it("moves player and headquarters together, charges 7% of local market cap, and saves the cooldown", () => {
    const { world, corp, destination } = relocationWorld();
    const beforeCash = corp.liquidCapital;
    const expectedCost = Math.round(corp.sharePrice * corp.totalShares * 0.07);
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
    expect(world.player.homeRegionId).toBe(destination.id);
    expect(corp.headquartersRegionId).toBe(destination.id);
    expect(corp.liquidCapital).toBe(beforeCash - expectedCost);
    expect(world.player.lastRelocatedTurn).toBe(world.meta.turn);

    const loaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(loaded.player.homeRegionId).toBe(destination.id);
    expect(loaded.player.lastRelocatedTurn).toBe(world.meta.turn);
    expect(loaded.corporations[corp.id]?.headquartersRegionId).toBe(destination.id);
    const returnRegion = Object.values(loaded.regions).find((region) => region.countryId === "US" && region.id !== destination.id && !region.corporationHeadquartersOnly)!;
    expect(executeAction(loaded, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: returnRegion.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("cooldown") });
  });

  it("refuses an unaffordable move without changing either residence or corporate cash", () => {
    const { world, corp, destination } = relocationWorld();
    corp.liquidCapital = 1;
    const before = serializeSave(world, "2026-10-02T00:00:00.000Z");
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("Insufficient corporate cash") });
    expect(serializeSave(world, "2026-10-02T00:00:00.000Z")).toBe(before);
  });

  it("uses the source 72-turn cooldown boundary", () => {
    const { world, corp, destination } = relocationWorld();
    world.player.lastRelocatedTurn = world.meta.turn - SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS + 1;
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("cooldown") });
    world.meta.turn += 1;
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
  });

  it("converts a cross-currency move through anchor, pays the source 0.5% spread, and cleans home-country political state", () => {
    const { world, corp } = relocationWorld();
    corp.liquidCapital = 500_000;
    corp.revenue = 100_000;
    corp.currentGrowthCost = 1_000;
    corp.foundingRevenue = 200_000;
    corp.ceoSalaryPerTurn = 1_000;
    corp.rdBudgetPerTurn = 2_000;
    corp.earningsHistory = [12_000];
    corp.priceHistory = [{ turn: 0, price: 20 }];
    const sector = Object.values(corporateSectorAssets(world)).find((asset) => asset.corporationId === corp.id)!;
    sector.revenue = 100_000;
    sector.realizedRevenue = 75_000;
    sector.plantsPnl = {
      turn: world.meta.turn, revenue: 75_000, inputs: 12_000, labour: 4_000, upkeep: 2_000,
      otherOpex: 3_000, otherOpexUncapped: 3_500, financialLegs: 700, compliance: 300,
      policyCredit: 200, growth: 1_000, operatingCost: 22_000, totalCost: 23_000, profit: 52_000,
    };
    const destination = Object.values(world.regions).find((region) => region.countryId === "UK" && region.id === "LON")!;
    const originalPartyMembers = world.parties.US_DEM!.memberCount;
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.memberCount += 1;
    world.player.currentOffice = { type: "president", countryId: "US" };
    world.player.legislativeSeat = { chamberKey: "house", countryId: "US", regionId: "AL" };
    world.player.politicalInfluence = 80;
    world.player.donorBaseLevel = 4;
    const race: (typeof world.elections)[number] = {
      id: "house:US:AL:c1", electionType: "house", countryId: "US", state: "AL", cycle: 1,
      status: "active", startTurn: world.meta.turn, primaryEndTurn: world.meta.turn + 1,
      endTurn: world.meta.turn + 2, totalSeats: 1, chamberKey: "house",
      candidates: [
        { id: "player", name: "Alex", partyId: "US_DEM", isNPP: false, incumbent: false, status: "active" as const },
        { id: "rival", name: "Rival", partyId: "US_REP", isNPP: false, incumbent: false, status: "active" as const },
      ],
      tally: { player: 100, rival: 80 },
      stateTallyStates: { AL: { totalVotes: { player: 100, rival: 80 } } },
    };
    world.elections.push(race);
    ensureCampaign(world, {
      electionId: race.id, candidateId: "player", candidateIsNPP: false,
      partyId: "US_DEM", countryId: "US", electionType: "house", turn: world.meta.turn,
    });
    const beforeForexRevenue = world.centralBanks.US!.forexRevenue ?? 0;
    const beforeReserve = world.centralBanks.UK!.spreadFeeReserveBalances?.USD ?? 0;
    const currencyScale = world.exchangeRates.UK!.rate / world.exchangeRates.US!.rate;
    const marketCapAnchor = (corp.sharePrice * corp.totalShares) / world.exchangeRates.US!.rate;
    const relocationAnchor = Math.round(marketCapAnchor * 0.07 * 2);
    const spreadAnchor = relocationAnchor * 0.005;
    const expectedCost = Math.round((relocationAnchor + spreadAnchor) * world.exchangeRates.UK!.rate);

    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
    expect(world.player).toMatchObject({ countryId: "UK", homeRegionId: "LON", currentOffice: null, legislativeSeat: null, politicalInfluence: 0, donorBaseLevel: 0 });
    expect(world.player.partyId).toBeNull();
    expect(world.parties.US_DEM!.memberCount).toBe(originalPartyMembers);
    const movedRace = world.elections.at(-1)!;
    expect(movedRace.candidates.find((candidate) => candidate.id === "player")?.status).toBe("withdrawn");
    expect(movedRace.candidates.find((candidate) => candidate.id === "rival")?.status).toBe("active");
    expect(movedRace.tally).toEqual({ rival: 80 });
    expect((movedRace.stateTallyStates?.AL as { totalVotes: Record<string, number> }).totalVotes).toEqual({ rival: 80 });
    expect(world.campaigns[`${movedRace.id}:player`]?.status).toBe("archived");
    expect(corp).toMatchObject({ countryId: "UK", headquartersRegionId: "LON", liquidCurrencyCode: "GBP", sharePrice: 4.284, revenue: 100_000, currentGrowthCost: 1_000, foundingRevenue: 200_000, ceoSalaryPerTurn: 357, rdBudgetPerTurn: 2_000 });
    expect(corp.liquidCapital).toBe(Math.round(500_000 * currencyScale * 100) / 100 - expectedCost);
    expect(corp.earningsHistory).toEqual([12_000]);
    expect(corp.priceHistory).toEqual([{ turn: 0, price: 20, currencyCode: "USD" }]);
    expect(sector.revenue).toBe(35_700);
    expect(sector.realizedRevenue).toBe(26_775);
    expect(sector.plantsPnl).toMatchObject({ revenue: 26_775, inputs: 4_284, labour: 1_428, upkeep: 714, otherOpex: 1_071, financialLegs: 249.9, profit: 18_564 });
    expect(world.centralBanks.US!.forexRevenue).toBe(beforeForexRevenue + Math.round(Math.round(spreadAnchor * world.exchangeRates.US!.rate) * 0.25));
    expect(world.centralBanks.UK!.spreadFeeReserveBalances?.USD).toBe(beforeReserve + Math.round(Math.round(spreadAnchor * world.exchangeRates.US!.rate) * 0.5));
    const loaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    const savedRace = loaded.elections.find((election) => election.id === movedRace.id)!;
    expect(savedRace.candidates.find((candidate) => candidate.id === "player")?.status).toBe("withdrawn");
    expect(savedRace.candidates.find((candidate) => candidate.id === "rival")?.status).toBe("active");
    expect(savedRace.tally).toEqual({ rival: 80 });
    expect((savedRace.stateTallyStates?.AL as { totalVotes: Record<string, number> }).totalVotes).toEqual({ rival: 80 });
    expect(loaded.campaigns[`${movedRace.id}:player`]?.status).toBe("archived");
  });
});
