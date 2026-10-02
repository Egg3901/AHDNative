import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { billLifecyclePhase } from "../phases/billLifecyclePhase.js";
import type { WorldRng } from "../rng.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";

describe("source NPP federal vote consumer", () => {
  it("suppresses a national whip when the voter's home-region party has leadership", () => {
    const makeWhipWorld = (stateLeader: boolean, includeStateWhip: boolean) => {
      let world = createWorld({ seed: "source-home-region-whip", playerName: "Player", countryId: "US", era: "2019" });
      world.player.countryId = "US";
      world.nppAutonomyLevel = "v0";
      const voter = world.politicians.find((politician) => politician.countryId === "CN" && politician.chamberKey === "npc")!;
      voter.partyId = "CN_CDL";
      voter.ideology = { economic: 0, social: 0 };
      voter.donorBaseLevel = 0;
      voter.personality = { loyalty: 100, ambition: 50, stubbornness: 0 };
      const homeRegion = voter.homeState!;
      expect(world.regions[homeRegion]?.countryId).toBe("CN");
      world.partyRegions[`${homeRegion}:CN_CDL`]!.chairId = stateLeader ? "regional-chair" : null;
      world.politicians = [voter];
      world.bills.push({
        id: "source-home-region-whip-bill",
        title: "Neutral bill",
        summary: "Home-region whip precedence",
        countryId: "CN",
        category: "economic",
        originChamber: "npc",
        currentChamber: "npc",
        status: "active",
        provisions: [],
        sponsorId: "player",
        sponsorName: "Player",
        sponsorPartyId: "CN_CCP",
        votes: {},
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        proposedAtTurn: world.meta.turn,
        votingEndsOnTurn: world.meta.turn + 3,
        filibusterInvocations: [],
        updatedAtTurn: world.meta.turn,
      });
      world.partyWhips = [{
        id: "national-whip",
        billId: "source-home-region-whip-bill",
        partyId: "CN_CDL",
        countryId: "CN",
        chamber: "npc",
        direction: "for",
        mode: "hard",
        issuedAtTurn: world.meta.turn,
        issuerId: "player",
        issuerRole: "chair",
      }];
      if (includeStateWhip) {
        world.partyWhips.push({
          id: "home-region-whip",
          billId: "source-home-region-whip-bill",
          partyId: "CN_CDL",
          countryId: "CN",
          stateId: homeRegion,
          chamber: "npc",
          direction: "against",
          mode: "hard",
          issuedAtTurn: world.meta.turn,
          issuerId: "regional-chair",
          issuerRole: "chair",
        });
      }
      world = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
      return { world, voterId: voter.id, homeState: homeRegion };
    };

    // Game resolveWhipForNPP skips the national whip while this home-state
    // party has a chair. With no other force, the source verdict abstains.
    const suppressed = makeWhipWorld(true, false);
    advanceTurn(suppressed.world);
    expect(suppressed.world.bills[0]!.votes[suppressed.voterId]).toBe("abstain");
    expect(suppressed.world.politicians.find((politician) => politician.id === suppressed.voterId)?.homeState).toBe(suppressed.homeState);

    // Without state leadership, the same recorded national whip applies.
    const national = makeWhipWorld(false, false);
    advanceTurn(national.world);
    expect(national.world.bills[0]!.votes[national.voterId]).toBe("for");
    expect(national.world.politicians.find((politician) => politician.id === national.voterId)?.homeState).toBe(national.homeState);

    // A recorded home-region whip outranks the national instruction.
    const local = makeWhipWorld(true, true);
    advanceTurn(local.world);
    expect(local.world.bills[0]!.votes[local.voterId]).toBe("against");
    expect(local.world.politicians.find((politician) => politician.id === local.voterId)?.homeState).toBe(local.homeState);
  });

  it("uses source cross-pressure for open bills in lifecycle catch-up", () => {
    const world = createWorld({ seed: "source-catchup-vote", playerName: "Player", countryId: "CN", era: "2019" });
    const sourceVoter = world.politicians.find((politician) => politician.countryId === "CN" && politician.chamberKey === "npc")!;
    sourceVoter.id = "source-cross-pressure-voter";
    sourceVoter.partyId = "CN_CDL";
    sourceVoter.ideology = { economic: -3, social: 0 };
    sourceVoter.donorBaseLevel = 3;
    sourceVoter.personality = { loyalty: 80, ambition: 50, stubbornness: 20 };
    world.politicians = [sourceVoter];
    delete world.governments.CN;
    world.bills.push({
      id: "source-cross-pressure-catchup",
      title: "11% VAT",
      summary: "Source-vector lifecycle catch-up regression",
      countryId: "CN",
      category: "economic",
      legislationTypeId: "cn_value_added_tax",
      effectDirection: -1,
      selectedRate: 11,
      provisions: [{
        type: "policy",
        legislationTypeId: "cn_value_added_tax",
        policyOptionId: "cn_value_added_tax_opt_4",
        effectDirection: -1,
        economic: -1,
        social: 0,
      }],
      originChamber: "npc",
      currentChamber: "npc",
      status: "active",
      sponsorId: "player",
      sponsorName: "Player",
      sponsorPartyId: "CN_CCP",
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      proposedAtTurn: world.meta.turn,
      votingEndsOnTurn: world.meta.turn + 5,
      filibusterInvocations: [],
      updatedAtTurn: world.meta.turn,
    });

    // Independent Game cb66acdf calculation: for the selected policy vector
    // (-1, 0), voter (-3, 0), and donor level 3, forces are +60 ideology,
    // 0 whip, 0 district, +36 donors; the source verdict is FOR. The former
    // lifecycle ideologyVote returns AGAINST for this deterministic .99 draw.
    const deterministicRng: WorldRng = {
      next: () => 0.99,
      int: (min) => min,
      pick: (items) => items[0]!,
      state: () => [0, 0, 0, 0],
    };
    billLifecyclePhase.run(world, deterministicRng);

    expect(world.bills[0]!.votes[sourceVoter.id]).toBe("for");

    // The source opposition bloc is selected from live chamber seats, not a
    // stored stale seat snapshot. With two CDL seats versus one CCP and one
    // CNDCA seat, a formed CCP government adds the source -16 opposition
    // force for a neutral CDL voter; absent that government, the same neutral
    // bill is an abstention.
    const bill = world.bills[0]!;
    const otherCdl = { ...sourceVoter, id: "source-cross-pressure-voter-2" };
    const ccp = { ...sourceVoter, id: "source-ccp-seat", partyId: "CN_CCP" };
    const cndca = { ...sourceVoter, id: "source-cndca-seat", partyId: "CN_CNDCA" };
    const bannedCndca = { ...cndca, id: "source-banned-party-seat" };
    const retiredCndca = [
      { ...cndca, id: "retired-cndca-seat-1", retiredAt: "1952-01-01" },
      { ...cndca, id: "retired-cndca-seat-2", retiredAt: "1952-01-01" },
    ];
    sourceVoter.ideology = { economic: 0, social: 0 };
    world.nppAutonomyLevel = "v1";
    // The source suppresses v1 opposition coordination in the player country;
    // this scenario exercises the same CN government as a non-player country.
    world.player.countryId = "US";
    sourceVoter.donorBaseLevel = 0;
    world.politicians = [sourceVoter, otherCdl, ccp, cndca, bannedCndca, ...retiredCndca];
    expect(world.parties.CN_CNDCA).toBeDefined();
    world.parties.CN_CNDCA!.regimeStatus = "banned";
    world.governments.CN = {
      countryId: "CN",
      chamberKey: "npc",
      status: "formed",
      formationType: "majority",
      governingPartyId: "CN_CCP",
      coalitionPartyIds: null,
      pmPoliticianId: "source-ccp-seat",
      totalSeatsSupporting: 1,
      majorityThreshold: 3,
      totalSeats: 4,
      seatsByParty: { CN_CCP: 1, CN_CDL: 2, CN_CNDCA: 1 },
      lostMajority: false,
      formedTurn: world.meta.turn,
      snapElectionsUsed: 0,
      lastSnapElectionTurn: null,
      pmVacancyDeadlineTurn: null,
      confidence: 75,
    };
    bill.votes = {};
    billLifecyclePhase.run(world, deterministicRng);
    expect(bill.votes[sourceVoter.id]).toBe("against");
    expect(bill.votes[bannedCndca.id]).toBeUndefined();
    expect(bill.votes[retiredCndca[0]!.id]).toBeUndefined();

    delete bill.votes[sourceVoter.id];
    delete world.governments.CN;
    billLifecyclePhase.run(world, deterministicRng);
    expect(bill.votes[sourceVoter.id]).toBe("abstain");

    bill.status = "veto_override";
    bill.overrideVotingEndsOnTurn = world.meta.turn + 5;
    bill.vetoOverrideVotes = {};
    billLifecyclePhase.run(world, deterministicRng);
    expect(bill.vetoOverrideVotes[sourceVoter.id]).toBe("against");
    bill.status = "active";

    bill.sponsorPartyId = "CN_CDL";
    delete bill.votes[sourceVoter.id];
    billLifecyclePhase.run(world, deterministicRng);
    expect(bill.votes[sourceVoter.id]).toBe("for"); // source co-party line = +16
    bill.sponsorPartyId = "CN_CCP";

    world.governments.CN = {
      countryId: "CN",
      chamberKey: "npc",
      status: "formed",
      formationType: "minority",
      governingPartyId: "CN_CCP",
      coalitionPartyIds: null,
      pmPoliticianId: "source-ccp-seat",
      totalSeatsSupporting: 1,
      majorityThreshold: 3,
      totalSeats: 4,
      seatsByParty: { CN_CCP: 1, CN_CDL: 2, CN_CNDCA: 1 },
      lostMajority: false,
      formedTurn: world.meta.turn,
      snapElectionsUsed: 0,
      lastSnapElectionTurn: null,
      pmVacancyDeadlineTurn: null,
      confidence: 75,
    };
    sourceVoter.ideology = { economic: -0.7, social: 0 };
    world.difficulty = "easy";
    delete bill.votes[sourceVoter.id];
    billLifecyclePhase.run(world, deterministicRng);
    expect(bill.votes[sourceVoter.id]).toBe("abstain"); // +14 ideology - 9.6 coordination

    world.difficulty = "hard";
    delete bill.votes[sourceVoter.id];
    billLifecyclePhase.run(world, deterministicRng);
    expect(bill.votes[sourceVoter.id]).toBe("against"); // +14 ideology - 21.6 coordination

    bill.status = "active";
    bill.votingEndsOnTurn = world.meta.turn;
    bill.votes = {};
    billLifecyclePhase.run(world, deterministicRng);
    expect(bill.votes[sourceVoter.id]).toBeUndefined();
  });
});
