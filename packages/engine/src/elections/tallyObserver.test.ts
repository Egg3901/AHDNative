import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { serializeSave } from "../save.js";
import type { ElectionRecord } from "./types.js";
import { realAccumulate } from "./tallyAdapter.js";
import { campaignKey, ensureCampaignsForElection } from "../campaigns/lifecycle.js";
import { executeAction } from "../actions/execute.js";
import { quoteTargetedAds } from "../actions/campaignTargetedAd.js";
import { hasSource1953DemographicShape, campaignCellsForRegion, targetedAdBonuses } from "../campaigns/targetedAds.js";

describe("ephemeral tally input observer", () => {
  it("keeps an unsupported synthetic one-axis fixture on its legacy targeted-ad path", () => {
    const world = createWorld({ seed: "tally-standing-ad-policy-axes", playerName: "Player", countryId: "US", era: "1953" });
    const partyId = Object.values(world.parties).find((party) => party.countryId === "US")!.id;
    const opponent = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === partyId)!;
    world.player.partyId = partyId;
    world.player.policies = { economic: -1, social: 0.2 };
    world.player.targetedAds = [{ stateId: "NY", dimension: "voterGroups", bucket: "progressive", bonus: 0.12, lastPurchaseTurn: 10 }];
    world.meta.turn = 16;
    world.meta.date = "1953-06-25";
    world.demographicCategories.US = [{
      _id: "voterGroups", name: "Voter Groups", defaultWeight: 100,
      groups: [
        { id: "progressive", name: "Progressive", defaultEconomicLean: -2, defaultSocialLean: 0, defaultTurnout: 60 },
        { id: "moderate", name: "Moderate", defaultEconomicLean: 2, defaultSocialLean: 1, defaultTurnout: 40 },
      ],
    }];
    world.stateDemographics.NY = {
      _id: "NY", countryId: "US", categoryWeights: { voterGroups: 100 },
      groups: {
        progressive: { population: 35, economicLean: -2, socialLean: 0, turnout: 60 },
        moderate: { population: 65, economicLean: 2, socialLean: 1, turnout: 40 },
      },
      lastUpdated: world.meta.date,
    };
    const race: ElectionRecord = {
      id: "house:US:NY:standing-ad-policy-axes", electionType: "house", countryId: "US", state: "NY", cycle: 1,
      status: "active", startTurn: 0, primaryEndTurn: 0, endTurn: 30, totalSeats: 1, chamberKey: "house",
      candidates: [
        { id: "player", name: world.player.name, partyId, isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId, isNPP: true, incumbent: true },
      ],
      tally: {},
    };
    world.elections = [race];
    ensureCampaignsForElection(world, race);
    world.campaigns[campaignKey(race.id, "player")]!.targetedAdModifiers = { "voterGroups:progressive": 0.12 };
    const snapshots: import("../electionEngine/tally/types.js").VoteDistributionDiagnosticSnapshot[] = [];

    expect(realAccumulate(world, rngFromSeed("standing-ad-policy-axes"), race, undefined, (snapshot) => snapshots.push(snapshot))).toBe(true);

    // This deliberately replaces the actual source-shaped voter groups with
    // two synthetic labels, so the source Layer-1 adapter must fail closed and
    // retain the old campaign-scoped bonus path.
    const playerInput = snapshots[0]!.candidates.find((candidate) => candidate.candidateId === "player")!;
    expect(playerInput.targetedAdBonuses).toEqual({ progressive: 0.12 });
  });

  it("attaches a public source-dimension purchase to the counted Layer-1 units", () => {
    const world = createWorld({ seed: "source-unit-standing-ad", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "NY" });
    const partyId = Object.values(world.parties).find((party) => party.countryId === "US")!.id;
    const opponent = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === partyId)!;
    world.player.partyId = partyId;
    world.meta.turn = 16;
    world.meta.date = "1953-06-25";
    world.player.actions = 5;
    world.player.funds = 500;
    const race: ElectionRecord = {
      id: "house:US:NY:source-ad-units", electionType: "house", countryId: "US", state: "NY", cycle: 1,
      status: "active", startTurn: 0, primaryEndTurn: 0, endTurn: 30, totalSeats: 1, chamberKey: "house",
      candidates: [
        { id: "player", name: world.player.name, partyId, isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId, isNPP: true, incumbent: true },
      ],
      tally: {},
    };
    world.elections = [race];
    ensureCampaignsForElection(world, race);
    const quote = quoteTargetedAds(world, 3)!;
    expect(hasSource1953DemographicShape(world, "NY")).toBe(true);
    expect(executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id, regionId: "NY", demographicCategory: "race", demographicGroup: "white",
      count: 3, expectedRevision: quote.revision, expectedTurn: quote.turn, expectedCost: quote.cost,
    }).ok).toBe(true);
    expect(world.player.targetedAds).toHaveLength(1);
    const cells = campaignCellsForRegion(world, "NY");
    const direct = targetedAdBonuses(cells, { economicLean: world.player.policies?.economic ?? 0, socialLean: world.player.policies?.social ?? 0 }, world.player.targetedAds!, "NY", world.meta.turn);
    expect(Object.values(direct).some((bonus) => bonus > 0)).toBe(true);
    const snapshots: import("../electionEngine/tally/types.js").VoteDistributionDiagnosticSnapshot[] = [];
    expect(realAccumulate(world, rngFromSeed("source-unit-standing-ad"), race, undefined, (snapshot) => snapshots.push(snapshot))).toBe(true);
    const playerInput = snapshots[0]!.candidates.find((candidate) => candidate.candidateId === "player")!;
    expect(snapshots[0]!.categories[0]?._id).toBe("granularCells");
    expect(Object.keys(playerInput.targetedAdBonuses ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(playerInput.targetedAdBonuses ?? {}).length).toBeLessThanOrEqual(28);
    expect(Object.keys(playerInput.targetedAdBonuses ?? {}).every((id) => id.startsWith("gcell_"))).toBe(true);
    expect(Object.values(playerInput.targetedAdBonuses ?? {}).some((bonus) => bonus > 0)).toBe(true);
  });

  it("leaves the ordinary world and RNG byte-identical when observing one real district tally", () => {
    const source = createWorld({ seed: "tally-observer-parity", playerName: "Player", countryId: "US", era: "1953" });
    const partyId = Object.values(source.parties).find((party) => party.countryId === "US")!.id;
    source.player.partyId = partyId;
    const opponent = source.politicians.find((politician) => politician.countryId === "US" && politician.partyId === partyId)!;
    source.meta.turn = 2;
    source.meta.date = "1953-01-29";
    const race: ElectionRecord = {
      id: "house:US:NY:observer-parity",
      electionType: "house",
      countryId: "US",
      state: "NY",
      cycle: 1,
      status: "active",
      startTurn: 0,
      primaryEndTurn: 0,
      endTurn: 10,
      totalSeats: 1,
      chamberKey: "house",
      candidates: [
        { id: "player", name: source.player.name, partyId, isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId, isNPP: true, incumbent: true },
      ],
      tally: {},
      primaryResults: { recordedAt: "1953-01-01T00:00:00.000Z", byParty: {} },
    };
    source.elections = [race];
    const ordinary = structuredClone(source);
    const observed = structuredClone(source);
    const ordinaryRace = ordinary.elections[0]!;
    const observedRace = observed.elections[0]!;
    const ordinaryRng = rngFromSeed("observer-does-not-consume-rng");
    const observedRng = rngFromSeed("observer-does-not-consume-rng");
    const snapshots: unknown[] = [];

    expect(realAccumulate(ordinary, ordinaryRng, ordinaryRace)).toBe(true);
    expect(realAccumulate(observed, observedRng, observedRace, undefined, (snapshot) => snapshots.push(snapshot))).toBe(true);

    expect(snapshots).toHaveLength(1);
    expect(JSON.parse(serializeSave(observed, "1953-01-29T00:00:00.000Z")).world)
      .toEqual(JSON.parse(serializeSave(ordinary, "1953-01-29T00:00:00.000Z")).world);
    expect(observedRng.state()).toEqual(ordinaryRng.state());
  });
});
