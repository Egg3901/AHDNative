import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { ensureCampaign } from "../campaigns/lifecycle.js";
import { expirePartyMergerProposals } from "./mergerProposals.js";
import { castPartyMergerVote } from "./mergerProposals.js";
import { isPartyPlayerActive } from "./activity.js";

describe("party merger committee proposal actions", () => {
  it("applies the source national five-per-active-member limit after regional culls", () => {
    const world = createWorld({ seed: "party-merger-national-cap", playerName: "Chair", countryId: "US", era: "1953" });
    const observedAtMs = Date.parse("2026-10-03T11:00:00.000Z");
    expect(executeAction(world, "player", "fundraise", {}, { observedAtMs }).ok).toBe(true);
    expect(isPartyPlayerActive(world, observedAtMs)).toBe(false);
    advanceTurn(world, { activityTimestampMs: observedAtMs });
    expect(world.player.partyActivitySummaries).toEqual([{ timestampMs: observedAtMs, actionCount: 1 }]);
    expect(isPartyPlayerActive(world, observedAtMs)).toBe(false);
    expect(executeAction(world, "player", "fundraise", {}, { observedAtMs }).ok).toBe(true);
    advanceTurn(world, { activityTimestampMs: observedAtMs });
    expect(world.player.partyActivitySummaries).toEqual([
      { timestampMs: observedAtMs, actionCount: 1 },
      { timestampMs: observedAtMs, actionCount: 1 },
    ]);
    expect(isPartyPlayerActive(world, observedAtMs)).toBe(true);

    const absorbed = world.parties.US_DEM!;
    const survivor = world.parties.US_REP!;
    absorbed.id = "US_MRG";
    absorbed.name = "Merger Party";
    absorbed.isDefault = false;
    world.parties.US_MRG = absorbed;
    delete world.parties.US_DEM;
    world.player.partyId = absorbed.id;
    absorbed.chairId = "player";

    const targetRoster = world.politicians.filter((politician) => politician.countryId === "US" && politician.partyId === survivor.id);
    for (const member of targetRoster) {
      member.homeState = undefined;
      member.electedState = undefined;
    }
    const targetCommittee = targetRoster.slice(0, 5);
    // These retired source politicians retain committee office for this
    // declared ballot fixture without consuming the active-NPP capacity.
    for (const member of targetRoster) member.retiredAt = 1;
    survivor.chairId = targetCommittee[0]!.id;
    survivor.viceChairId = targetCommittee[1]!.id;
    survivor.treasurerId = targetCommittee[2]!.id;
    survivor.committeeIds = [targetCommittee[3]!.id, targetCommittee[4]!.id];

    const states = ["CA", "NY", "TX", "CA", "NY", "TX"];
    for (let index = 0; index < states.length; index++) {
      const template = world.politicians.find((politician) => politician.countryId === "US")!;
      world.politicians.push({
        ...template,
        id: `US-MERGER-CAP-${index + 1}`,
        name: `Incoming NPP ${index + 1}`,
        partyId: absorbed.id,
        politicalInfluence: 60 + index,
        favorability: 50,
        homeState: states[index],
        electedState: undefined,
        retiredAt: null,
      });
    }
    for (const stateId of ["CA", "NY", "TX"]) {
      world.partyRegions[`${stateId}:${absorbed.id}`] = {
        regionId: stateId,
        partyId: absorbed.id,
        countryId: "US",
        organization: 100,
        registration: 0,
      };
      delete world.partyRegions[`${stateId}:${survivor.id}`];
    }

    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: survivor.id }, { observedAtMs }).ok).toBe(true);
    const proposal = world.partyMergerProposals![0]!;
    expect(executeAction(world, "player", "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "yes",
    }, { observedAtMs }).ok).toBe(true);
    for (const voter of targetCommittee.slice(0, 3)) {
      expect(castPartyMergerVote(world, voter.id, proposal.id, "yes", observedAtMs).ok).toBe(true);
    }

    expect(proposal.status).toBe("passed");
    expect(world.politicians.filter((politician) => politician.id.startsWith("US-MERGER-CAP-") && politician.partyId === survivor.id)).toHaveLength(5);
    expect(world.politicians.some((politician) => politician.id === "US-MERGER-CAP-1")).toBe(false);
  });

  it("requires authorized proposal authority, then passes only after both 60% committee thresholds", () => {
    const world = createWorld({ seed: "party-merger-dual-ballot", playerName: "Chair", countryId: "US", era: "1953" });
    const proposing = world.parties.US_DEM!;
    const target = { ...world.parties.US_REP!, id: "US_SURV", name: "Surviving Civic Party", abbreviation: "CIV" };
    world.parties.US_SURV = target;
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
    world.partyRegions["CA:US_SURV"] = { regionId: "CA", partyId: "US_SURV", countryId: "US", organization: 20, registration: 25 };
    proposing.chairId = "player";
    const targetMembers = world.politicians.filter((politician) => politician.countryId === "US" && politician.id !== "player").slice(0, 5);
    target.chairId = targetMembers[0]!.id;
    target.viceChairId = targetMembers[1]!.id;
    target.treasurerId = targetMembers[2]!.id;
    target.committeeIds = [targetMembers[3]!.id, targetMembers[4]!.id];
    for (const member of world.politicians.filter((politician) => politician.countryId === "US" && politician.partyId === target.id)) {
      member.retiredAt = 1;
    }
    for (const member of targetMembers) {
      member.partyId = target.id;
      member.retiredAt = 1;
    }
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

    const observedAtMs = Date.parse("2026-10-03T11:00:00.000Z");
    expect(executeAction(world, "player", "fundraise", {}, { observedAtMs }).ok).toBe(true);
    expect(executeAction(world, "player", "fundraise", {}, { observedAtMs }).ok).toBe(true);
    advanceTurn(world, { activityTimestampMs: observedAtMs });
    expect(isPartyPlayerActive(world, observedAtMs)).toBe(true);
    // The ordinary turn creates source background office candidates. Restrict
    // this explicit candidate-continuity fixture to its declared participants.
    const fixturePoliticianIds = new Set([...targetMembers.map((member) => member.id), incomingPolitician.id]);
    world.politicians = world.politicians.filter((politician) =>
      politician.countryId !== "US" || fixturePoliticianIds.has(politician.id)
    );
    for (const member of targetMembers) {
      member.partyId = target.id;
      member.retiredAt = 1;
    }
    incomingPolitician.partyId = proposing.id;
    incomingPolitician.retiredAt = null;
    const targetTreasuryAtResolution = target.treasury;
    const absorbedTreasuryAtResolution = proposing.treasury;
    const targetOrgAtResolution = world.partyRegions["CA:US_SURV"]!.organization;
    const absorbedOrgAtResolution = world.partyRegions["CA:US_MRG"]!.organization;
    const absorbedRegistrationAtResolution = world.partyRegions["CA:US_MRG"]!.registration;
    const targetRegistrationAtResolution = world.partyRegions["CA:US_SURV"]!.registration;
    const unregisteredAtResolution = world.electoratePools.CA!.unregistered;
    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: target.id }, { observedAtMs }).ok).toBe(true);
    const influenceAtResolution = world.player.partyInfluence;
    const proposal = world.partyMergerProposals![0]!;
    expect(proposal.expiresTurn - proposal.createdTurn).toBe(24);
    const restored = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(restored.partyMergerProposals).toEqual(world.partyMergerProposals);
    expect(executeAction(world, "player", "votePartyMerger", {
      partyMergerProposalId: proposal.id,
      partyMergerVote: "yes",
    }, { observedAtMs }).ok).toBe(true);
    expect(proposal.status).toBe("open");

    const outsider = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === target.id && !targetMembers.includes(politician));
    if (outsider) {
      const rejectedVote = executeAction(world, outsider.id, "votePartyMerger", {
        partyMergerProposalId: proposal.id,
        partyMergerVote: "yes",
      });
      expect(rejectedVote.ok).toBe(false);
    }
    expect(castPartyMergerVote(world, targetMembers[0]!.id, proposal.id, "yes", observedAtMs).ok).toBe(true);
    expect(castPartyMergerVote(world, targetMembers[0]!.id, proposal.id, "no", observedAtMs).ok).toBe(true);
    expect(proposal.status).toBe("open");
    expect(proposal.targetVotes).toMatchObject([{ voterId: targetMembers[0]!.id, vote: "no" }]);
    expect(castPartyMergerVote(world, targetMembers[0]!.id, proposal.id, "yes", observedAtMs).ok).toBe(true);
    expect(castPartyMergerVote(world, targetMembers[1]!.id, proposal.id, "yes", observedAtMs).ok).toBe(true);
    expect(proposal.status).toBe("open");
    expect(castPartyMergerVote(world, targetMembers[2]!.id, proposal.id, "yes", observedAtMs).ok).toBe(true);
    expect(proposal.status).toBe("passed");
    expect(world.parties.US_MRG!.mergedIntoPartyId).toBe("US_SURV");
    expect(world.player.partyId).toBe("US_SURV");
    expect(world.player.partyInfluence).toBe(Math.floor(influenceAtResolution! * 0.5));
    expect(world.parties.US_SURV!.treasury).toBe(targetTreasuryAtResolution + absorbedTreasuryAtResolution);
    expect(world.partyRegions["CA:US_SURV"]!.organization).toBe(targetOrgAtResolution + Math.floor(absorbedOrgAtResolution * 0.5));
    expect(world.partyRegions["CA:US_SURV"]!.registration).toBe(targetRegistrationAtResolution);
    expect(world.electoratePools.CA!.unregistered).toBe(unregisteredAtResolution + absorbedRegistrationAtResolution);
    expect(world.partyRegions["CA:US_MRG"]).toBeUndefined();
    expect(election.candidates.find((candidate) => candidate.id === "player" && candidate.status !== "withdrawn")!.partyId).toBe("US_SURV");
    expect(election.candidates.find((candidate) => candidate.id === incomingPolitician.id && candidate.status === "active")!.partyId).toBe("US_SURV");
    expect(election.candidates.find((candidate) => candidate.id === incomingPolitician.id && candidate.status === "withdrawn")!.partyId).toBe("US_MRG");
    expect(world.campaigns[`${election.id}:player`]!.partyId).toBe("US_SURV");
    expect(world.campaigns[`${election.id}:${incomingPolitician.id}`]!.partyId).toBe("US_SURV");
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

  it("strictly validates merger continuation and preserves true activity absence when migrating schema 69", () => {
    const world = createWorld({ seed: "party-merger-strict-save", playerName: "Chair", countryId: "US", era: "1953" });
    world.parties.US_DEM!.chairId = "player";
    world.player.partyId = "US_DEM";
    expect(executeAction(world, "player", "proposePartyMerger", { targetPartyId: "US_REP" }).ok).toBe(true);
    const malformed = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z")) as {
      world: { partyMergerProposals: Array<Record<string, unknown>> };
    };
    malformed.world.partyMergerProposals[0]!.unexpectedField = true;
    expect(() => deserializeSave(JSON.stringify(malformed))).toThrow("invalid party merger proposal fields");

    const historical = createWorld({ seed: "party-merger-legacy-absence", playerName: "Alex", countryId: "US", era: "1953" });
    const prior = JSON.parse(serializeSave(historical, "2026-10-03T00:00:00.000Z")) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; player: Record<string, unknown>; partyMergerProposals?: unknown };
    };
    prior.schemaVersion = 69;
    prior.world.meta.schemaVersion = 69;
    delete prior.world.partyMergerProposals;
    delete prior.world.player.partyActivityPendingByTurn;
    delete prior.world.player.partyActivitySummaries;
    const migrated = deserializeSave(JSON.stringify(prior));
    expect(migrated.meta.schemaVersion).toBe(70);
    expect(migrated.partyMergerProposals).toBeUndefined();
    expect(migrated.player.partyActivityPendingByTurn).toBeUndefined();
    expect(migrated.player.partyActivitySummaries).toBeUndefined();
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
