import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { advanceNorthernIrelandLivingConflict, campaignNorthernIrelandPeacePoll, chooseNorthernIrelandLivingConflictOption } from "./northernIreland.js";

describe("Northern Ireland living-conflict continuation", () => {
  it("opens in the 1991 armed-stalemate phase and seeds later supported packs from the settled historical outcome", () => {
    const historical = createWorld({ seed: "ni-1991", playerName: "Prime Minister", countryId: "UK", era: "1991", mode: "hos" });
    const modern = createWorld({ seed: "ni-2019", playerName: "Prime Minister", countryId: "UK", era: "2019", mode: "hos" });
    expect(historical.northernIrelandConflict).toMatchObject({ phase: "armed_stalemate", phaseLevel: 1, status: "active" });
    expect(modern.northernIrelandConflict).toMatchObject({ phase: "power_sharing", phaseLevel: 6, status: "settled", tracks: { ratificationAuthorization: 2, referendumRatification: 1 } });
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
    expect(chooseNorthernIrelandLivingConflictOption(world, leaderId, "unionist_join").ok).toBe(true);
    expect(conflict.tracks.settlementMomentum).toBe(26);
  });
});
