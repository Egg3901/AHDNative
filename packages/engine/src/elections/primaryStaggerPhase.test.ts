import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { processPresidentialPrimaryWave } from "./primaryStaggerPhase.js";
import type { ElectionRecord } from "./types.js";
import { ensureCampaignsForElection, campaignKey } from "../campaigns/lifecycle.js";
import { executeAction } from "../actions/execute.js";

describe("source presidential stagger voter", () => {
  it("allocates the authored group electorate through the source 13% wave pool", () => {
    const world = createWorld({ seed: "source-primary-group-votes", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "CA" });
    world.meta.turn = 1;
    const party = world.parties.US_DEM!;
    world.player.partyId = party.id;
    world.player.policies = { economic: party.economicPosition, social: party.socialPosition };
    world.player.nationalInfluence = 0;
    const statePopulation = world.regions.IA!.population!;
    world.demographicCategories.US = [{
      _id: "single-voter-group",
      name: "Single voter group",
      defaultWeight: 100,
      groups: [{ id: "aligned-workers", name: "Aligned workers", defaultEconomicLean: party.economicPosition, defaultSocialLean: party.socialPosition, defaultTurnout: 100 }],
    }];
    const priorDemographics = world.stateDemographics.IA!;
    world.stateDemographics.IA = {
      ...priorDemographics,
      categoryWeights: { "single-voter-group": 100 },
      groups: {
        "aligned-workers": {
          population: 30,
          economicLean: party.economicPosition,
          socialLean: party.socialPosition,
          turnout: 100,
        },
      },
    };
    const race: ElectionRecord = {
      id: "president:US:-:c-primary-source-voter",
      electionType: "president",
      countryId: "US",
      cycle: 1,
      status: "active",
      startTurn: 0,
      primaryEndTurn: 6,
      endTurn: 10,
      totalSeats: 1,
      chamberKey: "president",
      candidates: [{ id: "player", name: "Player", partyId: party.id, isNPP: false, incumbent: false }],
      tally: {},
    };

    expect(processPresidentialPrimaryWave(world, race)).toBe(true);
    // Source vector: the general primary-eligible pool is 30% of population;
    // the wave receives the source 13% share of that pool.
    expect(race.primaryStateVotes?.US_DEM?.IA?.player).toBe(Math.round(statePopulation * 0.3 * 0.13));
  });

  it("applies the source NPP home-state bonus to its recorded candidate homeState", () => {
    function run(homeState: string | undefined) {
      const world = createWorld({ seed: "source-primary-npp-home", playerName: "Observer", countryId: "US", era: "1953", homeRegionId: null });
      world.meta.turn = 1;
      const party = world.parties.US_DEM!;
      const statePopulation = world.regions.IA!.population!;
      world.demographicCategories.US = [{
        _id: "single-voter-group",
        name: "Single voter group",
        defaultWeight: 100,
        groups: [{ id: "aligned-workers", name: "Aligned workers", defaultEconomicLean: party.economicPosition, defaultSocialLean: party.socialPosition, defaultTurnout: 100 }],
      }];
      world.stateDemographics.IA = {
        ...world.stateDemographics.IA!,
        categoryWeights: { "single-voter-group": 100 },
        groups: {
          "aligned-workers": {
            population: 30,
            economicLean: party.economicPosition,
            socialLean: party.socialPosition,
            turnout: 100,
          },
        },
      };
      const candidates = world.politicians.filter((row) => row.countryId === "US").slice(0, 2);
      const candidate = candidates[0]!;
      for (const politician of candidates) {
        politician.partyId = party.id;
        politician.ideology = { economic: party.economicPosition, social: party.socialPosition };
        politician.favorability = 50;
        politician.politicalInfluence = 0;
      }
      candidate.homeState = homeState;
      const race: ElectionRecord = {
        id: "president:US:-:c-primary-npp-home",
        electionType: "president",
        countryId: "US",
        cycle: 1,
        status: "active",
        startTurn: 0,
        primaryEndTurn: 6,
        endTurn: 10,
        totalSeats: 1,
        chamberKey: "president",
        candidates: candidates.map((politician) => ({ id: politician.id, name: politician.name, partyId: party.id, isNPP: true, incumbent: false })),
        tally: {},
      };
      expect(processPresidentialPrimaryWave(world, race)).toBe(true);
      return {
        population: statePopulation,
        votes: race.primaryStateVotes?.[party.id]?.IA?.[candidate.id] ?? 0,
      };
    }

    const away = run(undefined);
    const home = run("IA");
    const unboostedSourcePool = Math.round(away.population * 0.3 * 0.13);

    expect(away.votes).toBe(Math.round(unboostedSourcePool / 2));
    // A home-state multiplier changes relative candidate weight, not the size
    // of the state ballot pool: 1.1 / (1.1 + 1.0) of the source ballots.
    expect(home.votes).toBe(Math.round(unboostedSourcePool * (1.1 / 2.1)));
  });

  it("applies a player-built state presence to the next source primary wave", () => {
    function run(withPresence: boolean, withSurge = false) {
      const world = createWorld({ seed: "source-primary-presence-consumer", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "IA" });
      world.meta.turn = 1;
      const party = world.parties.US_DEM!;
      world.player.partyId = party.id;
      world.player.policies = { economic: party.economicPosition, social: party.socialPosition };
      world.player.favorability = 50;
      world.player.politicalInfluence = 50;
      world.player.nationalInfluence = 50;
      const opponent = world.politicians.find((row) => row.countryId === "US")!;
      opponent.partyId = party.id;
      opponent.ideology = { economic: party.economicPosition, social: party.socialPosition };
      opponent.favorability = 50;
      opponent.politicalInfluence = 50;
      opponent.nationalInfluence = 50;
      const race: ElectionRecord = {
        id: "president:US:-:c-primary-presence-consumer",
        electionType: "president",
        countryId: "US",
        cycle: 1,
        status: "active",
        startTurn: 0,
        primaryEndTurn: 6,
        endTurn: 10,
        totalSeats: 1,
        chamberKey: "president",
        candidates: [
          { id: "player", name: "Player", partyId: party.id, isNPP: false, incumbent: false },
          { id: opponent.id, name: opponent.name, partyId: party.id, isNPP: true, incumbent: false },
        ],
        tally: {},
      };
      world.elections = [race];
      ensureCampaignsForElection(world, race);
      const campaign = world.campaigns[campaignKey(race.id, "player")]!;
      campaign.actions = 10;
      campaign.funds = 1_000_000;
      world.player.actions = 4;
      world.player.funds = 100_000;
      if (withPresence) {
        expect(executeAction(world, "player", "buildStatePresence", { regionId: "IA" }).ok).toBe(true);
      }
      if (withSurge) {
        expect(executeAction(world, "player", "usePrimaryHomeStateSurge", { electionId: race.id }).ok).toBe(true);
      }
      expect(processPresidentialPrimaryWave(world, race)).toBe(true);
      const votes = race.primaryStateVotes?.[party.id]?.IA;
      return (votes?.player ?? 0) / Object.values(votes ?? {}).reduce((sum, count) => sum + count, 0);
    }

    const baselineShare = run(false);
    const builtShare = run(true);
    const surgeShare = run(false, true);

    expect(builtShare).toBeGreaterThan(baselineShare);
    expect(surgeShare).toBeGreaterThan(baselineShare);
  });
});
