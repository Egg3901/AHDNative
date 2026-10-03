import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { ensureCampaign } from "../campaigns/lifecycle.js";
import { expirePartyMergerProposals } from "./mergerProposals.js";

describe("party merger committee proposal actions", () => {
  it("requires authorized proposal authority, then passes only after both 60% committee thresholds", () => {
    const world = createWorld({ seed: "party-merger-dual-ballot", playerName: "Chair", countryId: "US", era: "1953" });
    const proposing = world.parties.US_DEM!;
    const target = world.parties.US_REP!;
    proposing.id = "US_MRG";
    proposing.name = "Merger Party";
    proposing.isDefault = false;
    proposing.memberCount = 1;
    proposing.treasury = 125_000;
    world.parties.US_MRG = proposing;
    delete world.parties.US_DEM;
    world.player.partyId = proposing.id;
    world.player.partyInfluence = 80;
    world.partyRegions["CA:US_MRG"] = { regionId: "CA", partyId: "US_MRG", countryId: "US", organization: 40, registration: 7 };
    world.partyRegions["CA:US_REP"] = { regionId: "CA", partyId: "US_REP", countryId: "US", organization: 20, registration: 25 };
    const initialUnregistered = world.electoratePools.CA!.unregistered;
    const initialTargetTreasury = target.treasury;
    proposing.chairId = "player";
    const targetMembers = world.politicians.filter((politician) => politician.countryId === "US" && politician.id !== "player").slice(0, 5);
    target.chairId = targetMembers[0]!.id;
    target.viceChairId = targetMembers[1]!.id;
    target.treasurerId = targetMembers[2]!.id;
    target.committeeIds = [targetMembers[3]!.id, targetMembers[4]!.id];
    for (const member of targetMembers) member.partyId = target.id;
    const incomingPolitician = {
      ...targetMembers[4]!,
      id: "US-MERGER-NPP",
      name: "Incoming Merger NPP",
      partyId: proposing.id,
      chamberKey: "",
      homeState: undefined,
      electedState: undefined,
      retiredAt: null,
    };
    world.politicians.push(incomingPolitician);
    const election = {
      id: "president:US:-:merger-test",
      electionType: "president",
      countryId: "US",
      cycle: 1,
      status: "active" as const,
      startTurn: 0,
      primaryEndTurn: 24,
      endTurn: 48,
      totalSeats: 1,
      chamberKey: "president",
      candidates: [] as Array<{ id: string; name: string; partyId: string; isNPP: boolean; incumbent: boolean; status?: "active" | "withdrawn" }>,
      tally: {} as Record<string, number>,
    };
    world.elections.push(election);
    election.candidates.push(
      { id: "player", name: world.player.name, partyId: proposing.id, isNPP: false, incumbent: false },
      { id: incomingPolitician.id, name: incomingPolitician.name, partyId: proposing.id, isNPP: true, incumbent: false, status: "active" },
      { id: incomingPolitician.id, name: incomingPolitician.name, partyId: proposing.id, isNPP: true, incumbent: false, status: "withdrawn" },
    );
    ensureCampaign(world, { electionId: election.id, candidateId: "player", candidateIsNPP: false, partyId: proposing.id, countryId: "US", electionType: election.electionType, turn: world.meta.turn });
    ensureCampaign(world, { electionId: election.id, candidateId: incomingPolitician.id, candidateIsNPP: true, partyId: proposing.id, countryId: "US", electionType: election.electionType, turn: world.meta.turn });

    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: target.id }).ok).toBe(true);
    const proposal = world.partyMergerProposals![0]!;
    expect(proposal.expiresTurn - proposal.createdTurn).toBe(24);
    const restored = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(restored.partyMergerProposals).toEqual(world.partyMergerProposals);
    expect(executeAction(world, "player", "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "yes",
    }).ok).toBe(true);
    expect(proposal.status).toBe("open");

    const outsider = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === target.id && !targetMembers.includes(politician));
    if (outsider) {
      const rejectedVote = executeAction(world, outsider.id, "votePartyMerger", {
        partyMergerProposalId: proposal.id,
        partyMergerVote: "yes",
      });
      expect(rejectedVote.ok).toBe(false);
    }
    expect(executeAction(world, targetMembers[0]!.id, "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "yes",
    }).ok).toBe(true);
    expect(executeAction(world, targetMembers[0]!.id, "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "no",
    }).ok).toBe(true);
    expect(proposal.status).toBe("open");
    expect(proposal.targetVotes).toMatchObject([{ voterId: targetMembers[0]!.id, vote: "no" }]);
    expect(executeAction(world, targetMembers[0]!.id, "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "yes",
    }).ok).toBe(true);
    expect(executeAction(world, targetMembers[1]!.id, "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "yes",
    }).ok).toBe(true);
    expect(proposal.status).toBe("open");
    expect(executeAction(world, targetMembers[2]!.id, "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "yes",
    }).ok).toBe(true);
    expect(proposal.status).toBe("passed");
    expect(world.parties.US_MRG!.mergedIntoPartyId).toBe("US_REP");
    expect(world.player.partyId).toBe("US_REP");
    expect(world.player.partyInfluence).toBe(40);
    expect(world.parties.US_REP!.treasury).toBe(initialTargetTreasury + 125_000);
    expect(world.partyRegions["CA:US_REP"]!.organization).toBe(40);
    expect(world.partyRegions["CA:US_REP"]!.registration).toBe(25);
    expect(world.electoratePools.CA!.unregistered).toBe(initialUnregistered + 7);
    expect(world.partyRegions["CA:US_MRG"]).toBeUndefined();
    expect(election.candidates.find((candidate) => candidate.id === "player" && candidate.status !== "withdrawn")!.partyId).toBe("US_REP");
    expect(election.candidates.find((candidate) => candidate.id === incomingPolitician.id && candidate.status === "active")!.partyId).toBe("US_REP");
    expect(election.candidates.find((candidate) => candidate.id === incomingPolitician.id && candidate.status === "withdrawn")!.partyId).toBe("US_MRG");
    expect(world.campaigns[`${election.id}:player`]!.partyId).toBe("US_REP");
    expect(world.campaigns[`${election.id}:${incomingPolitician.id}`]!.partyId).toBe("US_REP");
  });

  it("rejects self, cross-country, unauthorized and duplicate-open proposals without mutating the save", () => {
    const world = createWorld({ seed: "party-merger-invalid-proposals", playerName: "Member", countryId: "US", era: "1953" });
    const proposer = world.parties.US_DEM!;
    proposer.chairId = "player";
    world.player.partyId = proposer.id;
    const before = JSON.stringify(world);
    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: proposer.id }).ok).toBe(false);
    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: "UK_LAB" }).ok).toBe(false);
    expect(JSON.stringify(world)).toBe(before);
    const member = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === proposer.id)!;
    member.partyId = proposer.id;
    const beforeUnauthorized = JSON.stringify(world);
    expect(executeAction(world, member.id, "proposePartyMerger", { targetPartyId: "US_REP" }).ok).toBe(false);
    expect(JSON.stringify(world)).toBe(beforeUnauthorized);

    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: "US_REP" }).ok).toBe(true);
    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: "US_REP" }).ok).toBe(false);
  });

  it("treats abstentions as no when the saved proposal reaches its 24-turn expiry", () => {
    const world = createWorld({ seed: "party-merger-expiry", playerName: "Chair", countryId: "US", era: "1953" });
    world.parties.US_DEM!.chairId = "player";
    world.player.partyId = "US_DEM";
    world.parties.US_REP!.chairId = world.politicians.find((politician) => politician.countryId === "US")!.id;
    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: "US_REP" }).ok).toBe(true);
    const proposal = world.partyMergerProposals![0]!;
    world.meta.turn = proposal.expiresTurn;
    expect(expirePartyMergerProposals(world)).toBe(1);
    expect(proposal.status).toBe("rejected");
  });
});
