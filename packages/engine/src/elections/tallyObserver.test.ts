import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { serializeSave } from "../save.js";
import type { ElectionRecord } from "./types.js";
import { realAccumulate } from "./tallyAdapter.js";

describe("ephemeral tally input observer", () => {
  it("feeds player economic/social policies into the non-president general ad consumer", () => {
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
    const snapshots: import("../electionEngine/tally/types.js").VoteDistributionDiagnosticSnapshot[] = [];

    expect(realAccumulate(world, rngFromSeed("standing-ad-policy-axes"), race, undefined, (snapshot) => snapshots.push(snapshot))).toBe(true);

    // Independently executed Game 0538 campaignTargeting/rules.ts source vector:
    // candidate (-1, .2), NY .35/.65 cells, and a .12 progressive flight at turn 16.
    const playerInput = snapshots[0]!.candidates.find((candidate) => candidate.candidateId === "player")!;
    expect(playerInput.targetedAdBonuses).toEqual({ progressive: 0.09636249097584279, moderate: 0 });
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
