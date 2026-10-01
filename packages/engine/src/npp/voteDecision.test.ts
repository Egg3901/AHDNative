import { describe, expect, it } from "vitest";
import { billLifecyclePhase } from "../phases/billLifecyclePhase.js";
import type { WorldRng } from "../rng.js";
import { createWorld } from "../world.js";

describe("source NPP federal vote consumer", () => {
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
