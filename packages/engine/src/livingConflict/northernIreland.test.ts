import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { advanceTurn } from "../engine.js";
import { advanceNorthernIrelandLivingConflict, campaignNorthernIrelandPeacePoll, chooseNorthernIrelandLivingConflictOption } from "./northernIreland.js";

describe("Northern Ireland living-conflict continuation", () => {
  it("matches the source fresh-world opening in the 1991 and 2019 packs", () => {
    const historical = createWorld({ seed: "ni-1991", playerName: "Prime Minister", countryId: "UK", era: "1991", mode: "hos" });
    const modern = createWorld({ seed: "ni-2019", playerName: "Prime Minister", countryId: "UK", era: "2019", mode: "hos" });
    expect(historical.northernIrelandConflict).toMatchObject({ phase: "armed_stalemate", phaseLevel: 1, status: "active" });
    expect(modern.northernIrelandConflict).toMatchObject({ phase: "armed_stalemate", phaseLevel: 1, status: "active" });
    expect(historical.conflicts).toEqual([]);
    expect(modern.conflicts).toEqual([]);
  });

  it("opens a separate agreement ballot only after current, signed UK and Ireland bills exist", () => {
    const world = createWorld({ seed: "ni-peace-ballot", playerName: "Prime Minister", countryId: "UK", era: "1991", mode: "hos" });
    const conflict = world.northernIrelandConflict!;
    conflict.phase = "agreement";
    conflict.phaseLevel = 5;
    conflict.status = "negotiating";
    conflict.tracks.settlementMomentum = 80;
    conflict.tracks.legitimacy = 60;
    conflict.tracks.unionistConsent = 65;
    conflict.tracks.nationalistConsent = 65;
    conflict.tracks.decommissioning = 65;
    conflict.tracks.institutionalStability = 60;
    conflict.tracks.domesticConsent = 65;
    delete conflict.lastRejectedPollTurn;
    const pushSignedBill = (id: string, countryId: "UK" | "IE") => world.bills.push({
      id, title: id, summary: id, countryId, category: "northern_ireland_peace", provisions: [],
      originChamber: "commons", currentChamber: "commons", status: "signed", sponsorId: "fixture",
      sponsorName: "fixture", sponsorPartyId: null, votes: {}, votesFor: 0, votesAgainst: 0,
      votesAbstain: 0, proposedAtTurn: world.meta.turn, enactedAtTurn: world.meta.turn,
      updatedAtTurn: world.meta.turn, filibusterInvocations: [], enactedLevel: 1,
    });
    pushSignedBill("uk-peace", "UK");
    advanceNorthernIrelandLivingConflict(world);
    expect(world.northernIrelandPeacePoll).toBeUndefined();
    pushSignedBill("ie-peace", "IE");
    world.meta.turn += 1;
    advanceNorthernIrelandLivingConflict(world);
    expect(world.northernIrelandPeacePoll).toMatchObject({ kind: "peace_agreement", status: "campaigning", agreementKey: "uk-peace:ie-peace" });
    expect(world.referendums).toHaveLength(0);

    expect(campaignNorthernIrelandPeacePoll(world, "yes", 100).ok).toBe(true);
    const poll = world.northernIrelandPeacePoll!;
    world.meta.turn = poll.closesTurn;
    advanceNorthernIrelandLivingConflict(world);
    expect(world.northernIrelandPeacePoll).toMatchObject({ kind: "peace_agreement", status: "completed", passed: true });
    expect(world.northernIrelandConflict?.tracks.referendumRatification).toBe(1);
    expect(world.referendums).toHaveLength(0);
    expect(world.regions.NIR?.countryId).toBe("UK");
    expect(world.conflicts).toEqual([]);
    const restored = deserializeSave(serializeSave(world, "ni-peace-ballot"));
    expect(restored.northernIrelandConflict).toEqual(world.northernIrelandConflict);
    expect(restored.northernIrelandPeacePoll).toEqual(world.northernIrelandPeacePoll);
  });

  it("keeps ratification bill sponsorship country-bound in the one-player save model", () => {
    const world = createWorld({ seed: "ni-one-player-bilateral", playerName: "Prime Minister", countryId: "UK", era: "2019", mode: "hos" });
    world.player.nationalInfluence = 50;
    const conflict = world.northernIrelandConflict!;
    conflict.phase = "agreement";
    conflict.phaseLevel = 5;
    conflict.status = "negotiating";
    const ukProposal = executeAction(world, "player", "sponsorBill", { catalogId: "uk_northern_ireland_peace", policyOptionId: "l1" });
    expect(ukProposal.ok, ukProposal.ok ? "" : ukProposal.error).toBe(true);
    const IrishProposal = executeAction(world, "player", "sponsorBill", { catalogId: "ie_northern_ireland_peace", policyOptionId: "l1" });
    expect(IrishProposal.ok).toBe(false);
    expect(IrishProposal.ok ? "" : IrishProposal.error).toContain("belongs to IE, not UK");
    expect(world.northernIrelandPeacePoll).toBeUndefined();
  });

  it("reserves unionist and nationalist decisions for the source party-leader role", () => {
    const world = createWorld({ seed: "ni-party-leader-gate", playerName: "Prime Minister", countryId: "UK", era: "1991", mode: "hos" });
    const conflict = world.northernIrelandConflict!;
    conflict.decision = { interaction: "peace_initiative", nodeId: "unionist_position", nodeIndex: 2, openedTurn: world.meta.turn, deadlineTurn: world.meta.turn + 6 };
    const sourceParty = Object.values(world.parties).find((candidate) => candidate.countryId === "UK");
    expect(sourceParty).toBeDefined();
    const party = { ...sourceParty!, id: "UK_DUP", abbreviation: "DUP", chairId: null };
    world.parties.UK_DUP = party;
    const ukMember = world.politicians.find((politician) => politician.countryId === "UK");
    expect(ukMember).toBeDefined();
    const leaderId = "UK_DUP-test-leader";
    world.politicians.push({ ...ukMember!, id: leaderId, partyId: "UK_DUP", chamberKey: "commons" });
    party.chairId = leaderId;
    const ordinaryMemberId = "UK_DUP-ordinary-member";
    world.politicians.push({ ...ukMember!, id: ordinaryMemberId, partyId: "UK_DUP", chamberKey: "commons" });

    expect(chooseNorthernIrelandLivingConflictOption(world, ordinaryMemberId, "unionist_join").ok).toBe(false);
    const autonomyBefore = world.regionalMetrics.NIR?.["governance.localAutonomy"]?.value;
    expect(chooseNorthernIrelandLivingConflictOption(world, leaderId, "unionist_join").ok).toBe(true);
    expect(conflict.tracks.settlementMomentum).toBe(26);
    expect(world.regionalMetrics.NIR?.["governance.localAutonomy"]?.value).toBe(autonomyBefore === undefined ? undefined : autonomyBefore + 2);
  });

  it("reaches the party-leader role through public UK party-election actions and a normal turn", () => {
    const world = createWorld({ seed: "ni-reachable-party-leader", playerName: "Unionist Leader", countryId: "UK", era: "1991", mode: "hos", partyId: "UK_DUP", homeRegionId: "NIR" });
    world.player.partyJoinedTurn = 0;
    world.meta.turn = 24;
    advanceTurn(world);
    const leadership = world.nationalPartyElections.find((election) => election.partyId === "UK_DUP" && election.position === "chair" && election.status === "voting");
    expect(leadership).toBeDefined();
    world.player.actions = 100;
    expect(executeAction(world, "player", "contestPartyLeadership", { intrapartyElectionId: leadership!.id, position: "chair" }).ok).toBe(true);
    expect(executeAction(world, "player", "votePartyLeadership", { intrapartyElectionId: leadership!.id, candidateId: "player" }).ok).toBe(true);
    leadership!.endTurn = world.meta.turn + 1;
    advanceTurn(world);
    expect(world.parties.UK_DUP?.chairId).toBe("player");

    const conflict = world.northernIrelandConflict!;
    conflict.decision = { interaction: "peace_initiative", nodeId: "unionist_position", nodeIndex: 2, openedTurn: world.meta.turn, deadlineTurn: world.meta.turn + 24 };
    expect(executeAction(world, "player", "chooseNorthernIrelandConflictOption", { niOptionId: "unionist_join" }).ok).toBe(true);
    expect(conflict.tracks.settlementMomentum).toBe(26);
    const restored = deserializeSave(serializeSave(world, "ni-reachable-party-leader"));
    expect(restored.parties.UK_DUP?.chairId).toBe("player");
    expect(restored.northernIrelandConflict).toEqual(world.northernIrelandConflict);
  });

  it("uses the source eight-turn negotiation window and authored withhold expiry through ordinary turns", () => {
    const world = createWorld({ seed: "ni-authored-expiry", playerName: "Prime Minister", countryId: "UK", era: "1991", mode: "hos" });
    advanceTurn(world);
    const conflict = world.northernIrelandConflict!;
    expect(conflict.decision).toMatchObject({ interaction: "peace_initiative", nodeId: "uk_position", deadlineTurn: conflict.decision!.openedTurn + 8 });
    const deadline = conflict.decision!.deadlineTurn;
    while (world.meta.turn < deadline) advanceTurn(world);
    expect(conflict.decision).toMatchObject({ interaction: "peace_initiative", nodeId: "irish_position", openedTurn: deadline, deadlineTurn: deadline + 8 });
    expect(conflict.tracks).toMatchObject({ settlementMomentum: 13, violence: 77, legitimacy: 32 });
    const restored = deserializeSave(serializeSave(world, "ni-authored-expiry"));
    expect(restored.northernIrelandConflict).toEqual(world.northernIrelandConflict);
  });

  it("suspends and restores NIR institutions across ordinary turns and preserves both postures in saves", () => {
    const world = createWorld({ seed: "ni-suspension-restoration", playerName: "Prime Minister", countryId: "UK", era: "2019", mode: "hos" });
    const conflict = world.northernIrelandConflict!;
    conflict.phase = "power_sharing";
    conflict.phaseLevel = 6;
    conflict.status = "settled";
    conflict.tracks.ratificationAuthorization = 2;
    conflict.tracks.referendumRatification = 1;
    conflict.tracks.violence = 90;
    conflict.tracks.institutionalStability = 20;

    advanceTurn(world);
    expect(world.northernIrelandConflict?.phase).toBe("fragile_settlement");
    expect(world.ukDevolution?.northernIrelandPeace?.posture).toBe("suspended");
    expect(world.ukDevolution?.regions.NIR?.active).toBe(false);
    const suspendedSave = deserializeSave(serializeSave(world, "ni-suspension-restoration"));
    expect(suspendedSave.northernIrelandConflict).toEqual(world.northernIrelandConflict);
    expect(suspendedSave.ukDevolution).toEqual(world.ukDevolution);

    conflict.tracks.violence = 20;
    conflict.tracks.institutionalStability = 60;
    conflict.tracks.domesticConsent = 65;
    advanceTurn(world);
    expect(world.northernIrelandConflict?.phase).toBe("power_sharing");
    expect(world.ukDevolution?.northernIrelandPeace?.posture).toBe("power_sharing");
    const nextCycle = world.elections.filter((election) => election.countryId === "UK" && election.state === "NIR" && election.electionType === "governor").reduce((max, election) => Math.max(max, election.cycle), 0) + 1;
    expect(world.ukDevolution?.regions.NIR).toMatchObject({ active: true, firstCycle: nextCycle, firstElectionEndTurn: world.meta.turn + 72 });
    const restored = deserializeSave(serializeSave(world, "ni-suspension-restoration"));
    expect(restored.ukDevolution).toEqual(world.ukDevolution);
    expect(restored.northernIrelandConflict).toEqual(world.northernIrelandConflict);
  });
});
