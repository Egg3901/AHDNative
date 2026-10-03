import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import type { Bill } from "../legislation/types.js";
import { nppBehaviorPhase } from "../npp/nppBehavior.js";
import { hardNppWhipSuccessChance } from "../npp/partyWhipSuccess.js";
import { resolveNppBillVote } from "../npp/voteDecision.js";
import { rngFromSeed, rngFromState } from "../rng.js";
import { effectivePlayerStats } from "../stats/allocation.js";
import { NEUTRAL_STAT, statMultiplier } from "../stats/characterStats.js";
import { projectPlayerPartyInfluence } from "../party/playerInfluence.js";
import { GameSession } from "../../../../src/game/session.js";
import { partyInfluenceTurnPhase } from "../party/phases.js";
import { accelerateNationalPartyElections, resolveNationalPartyElections } from "./nationalPartyElections.js";
import { createCoalition, joinCoalition, initiateDisbandVote } from "./coalitions.js";

const OPTIONS = { seed: "leadership-acceptance", playerName: "Player", countryId: "US", era: "1953" } as const;

function activeBill(id: string, chamber = "house"): Bill {
  return {
    id,
    title: "Party discipline test",
    summary: "Test bill",
    countryId: "US",
    category: "economy",
    provisions: [],
    originChamber: chamber,
    currentChamber: chamber,
    status: "active",
    sponsorId: null,
    sponsorName: "Test sponsor",
    sponsorPartyId: "US_DEM",
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: 0,
    filibusterInvocations: [],
    updatedAtTurn: 0,
  };
}

describe("issue 102 leadership acceptance", () => {
  it("requires state-party candidates and voters to be resident in the race region", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.player.partyJoinedTurn = null;
    world.player.actions = 100;
    advanceTurn(world);

    const homeRegion = world.player.homeRegionId!;
    const otherRegion = Object.values(world.regions).find((region) => region.countryId === "US" && region.id !== homeRegion)!;
    const race = world.statePartyElections.find((election) =>
      election.status === "voting" && election.partyId === "US_DEM" && election.regionId === otherRegion.id,
    )!;
    race.candidateIds = race.candidateIds.filter((candidateId) => candidateId !== "player");

    const before = world.player.actions;
    const denied = executeAction(world, "player", "contestPartyLeadership", {
      intrapartyElectionId: race.id,
      position: race.position,
    });
    expect(denied).toMatchObject({ ok: false, error: expect.stringMatching(/residence/i) });
    expect(world.player.actions).toBe(before);
  });

  it("limits committee-method national leadership voting to committee or officers", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.player.partyJoinedTurn = 0;
    world.meta.turn = 24;
    world.player.actions = 100;
    world.parties.US_DEM!.leadershipElectionMethod = "committee";
    world.parties.US_DEM!.committeeIds = [];
    advanceTurn(world);

    const election = world.nationalPartyElections.find((candidate) =>
      candidate.status === "voting" && candidate.partyId === "US_DEM" && candidate.position === "chair",
    )!;
    const contest = executeAction(world, "player", "contestPartyLeadership", {
      intrapartyElectionId: election.id,
      position: "chair",
    });
    expect(contest.ok).toBe(true);

    const before = world.player.actions;
    const denied = executeAction(world, "player", "votePartyLeadership", {
      intrapartyElectionId: election.id,
      candidateId: "player",
    });
    expect(denied).toMatchObject({ ok: false, error: expect.stringMatching(/committee|different party/i) });
    expect(world.player.actions).toBe(before);

    world.parties.US_DEM!.committeeIds = ["player"];
    expect(executeAction(world, "player", "votePartyLeadership", {
      intrapartyElectionId: election.id,
      candidateId: "player",
    }).ok).toBe(true);
  });

  it("uses the founding election duration and lets the founder enter immediately", () => {
    const world = createWorld(OPTIONS);
    world.player.actions = 100;
    world.player.funds = 100_000;
    expect(executeAction(world, "player", "foundParty", {
      foundPartyName: "New Native Party",
      foundPartyAbbr: "NNP",
    }).ok).toBe(true);
    const partyId = world.player.partyId!;
    advanceTurn(world);
    const election = world.nationalPartyElections.find((candidate) =>
      candidate.status === "voting" && candidate.partyId === partyId && candidate.position === "chair",
    )!;
    expect(election.founding).toBe(true);
    expect(election.durationTurns).toBe(12);
    expect(executeAction(world, "player", "contestPartyLeadership", {
      intrapartyElectionId: election.id,
      position: "chair",
    }).ok).toBe(true);
  });

  it("accelerates a vacant-chair race after a majority of eligible voters have participated", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    advanceTurn(world);
    const election = world.nationalPartyElections.find((candidate) =>
      candidate.status === "voting" && candidate.partyId === "US_DEM" && candidate.position === "chair",
    )!;
    election.candidateIds = ["player"];
    election.votes = Object.fromEntries([
      ...world.politicians.filter((politician) => politician.partyId === "US_DEM").map((politician) => [politician.id, "player"]),
      ["player", "player"],
    ]);
    election.endTurn = 200;
    expect(accelerateNationalPartyElections(world)).toBe(1);
    expect(election.endTurn).toBe(world.meta.turn + 36);
  });

  it("assigns a national chair and synchronizes the coalition chair", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    const coalition = createCoalition(world, {
      countryId: "US",
      name: "Leadership Coalition",
      abbreviation: "LC",
      founderPartyId: "US_DEM",
      actorId: "player",
    });
    world.parties.US_DEM!.chairId = null;
    advanceTurn(world);
    const election = world.nationalPartyElections.find((candidate) =>
      candidate.status === "voting" && candidate.partyId === "US_DEM" && candidate.position === "chair",
    )!;
    election.candidateIds = ["player"];
    election.votes = { player: "player" };
    election.endTurn = world.meta.turn;

    expect(resolveNationalPartyElections(world, rngFromSeed("leadership-resolution"))).toBe(1);
    expect(world.parties.US_DEM!.chairId).toBe("player");
    expect(world.coalitions.find((candidate) => candidate.id === coalition.id)!.chairCharacterId).toBe("player");
  });

  it("feeds party leadership into party influence and the next party phase", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.player.policies = { economic: 0, social: 0 };
    world.parties.US_DEM!.chairId = null;
    const withoutOffice = projectPlayerPartyInfluence(world)!;
    world.parties.US_DEM!.chairId = "player";
    const withOffice = projectPlayerPartyInfluence(world)!;
    expect(withOffice.leadership).toBe(withoutOffice.leadership + 5);
    const before = world.player.partyInfluence ?? 0;
    partyInfluenceTurnPhase.run(world, rngFromSeed("party-influence"));
    expect(world.player.partyInfluence).toBeGreaterThan(before);
  });

  it("rejects coalition creation, joining, and disband initiation without national authority", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.player.actions = 100;
    const deniedCreate = executeAction(world, "player", "createCoalition", {
      coalitionName: "Denied",
      coalitionAbbr: "D",
      countryId: "US",
    });
    expect(deniedCreate).toMatchObject({ ok: false, error: expect.stringMatching(/chair|vice/i) });

    world.parties.US_DEM!.chairId = "player";
    const coalition = createCoalition(world, {
      countryId: "US",
      name: "Authorized",
      abbreviation: "AUTH",
      founderPartyId: "US_DEM",
      actorId: "player",
    });
    world.parties.US_REP!.chairId = "rep-chair";
    expect(() => joinCoalition(world, coalition.id, "US_REP", "not-the-chair")).toThrow(/chair|vice/i);
    joinCoalition(world, coalition.id, "US_REP", "rep-chair");
    world.parties.US_DEM!.chairId = null;
    expect(() => initiateDisbandVote(world, coalition.id, "US_DEM", "player")).toThrow(/chair|vice/i);
  });

  it("applies a hard whip with the source per-NPP chance and saved world RNG", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    world.player.actions = 100;
    for (const politician of world.politicians.filter((candidate) => candidate.partyId === "US_DEM")) {
      politician.chamberKey = "senate";
    }
    const demPoliticians = world.politicians.filter((politician) => politician.partyId === "US_DEM").slice(0, 3);
    for (const politician of demPoliticians) {
      politician.chamberKey = "house";
      politician.personality = { loyalty: 0, ambition: 50, stubbornness: 100 };
      politician.ideology = { economic: 5, social: 0 };
    }
    const bill = activeBill("bill-hard-whip");
    bill.provisions = [{ type: "policy", legislationTypeId: "test.policy", effectDirection: 1, economic: 5, social: 0 }];
    world.bills.push(bill);

    // Source formula for this declared vector is 55 + round(0 * .35)
    // - round(100 * .18) + 15 hard = 52%; neutral statecraft adds zero.
    expect(hardNppWhipSuccessChance(demPoliticians[0]!.personality, 0)).toBe(52);
    const expectedRng = rngFromState(world.meta.rng);
    const expectedVotes = demPoliticians.map(() => expectedRng.int(1, 100) <= 52 ? "against" : "for");

    const issued = executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-hard-whip",
      whipDirection: "against",
      whipMode: "hard",
    });
    expect(issued.ok).toBe(true);
    expect(world.partyWhips).toHaveLength(1);
    expect(demPoliticians.map((politician) => bill.votes[politician.id])).toEqual(expectedVotes);
    expect(world.meta.rng).toEqual(expectedRng.state());

    const raw = JSON.parse(serializeSave(world, "2026-09-11T00:00:00.000Z")) as { world: Record<string, unknown> };
    delete raw.world.partyWhips;
    expect(deserializeSave(JSON.stringify(raw)).partyWhips).toBeUndefined();
    const restored = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(restored.partyWhips).toEqual(world.partyWhips);
    expect(restored.bills[0]!.votes).toEqual(bill.votes);
    expect(restored.meta.rng).toEqual(world.meta.rng);
    for (let turn = 0; turn < 20; turn++) {
      restored.meta.turn = turn;
      nppBehaviorPhase.run(restored, rngFromSeed(`whip-${turn}`));
    }
    expect(demPoliticians.map((politician) => restored.bills[0]!.votes[politician.id])).toEqual(expectedVotes);

    advanceTurn(restored);
    expect(restored.partyWhips).toHaveLength(1);
  });

  it("matches source whip authority and leaves AP untouched", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "other-chair";
    world.parties.US_DEM!.viceChairId = "player";
    world.player.actions = 1;
    world.bills.push(activeBill("bill-vice-whip"));

    const result = executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-vice-whip",
      whipDirection: "for",
      whipMode: "soft",
    });

    expect(result.ok).toBe(true);
    expect(world.player.actions).toBe(1);
    expect(world.partyWhips).toMatchObject([{ issuerRole: "viceChair", attemptNumber: 1 }]);
  });

  it("checks custom-party NPP controls against observed wall time, not game turns", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.player.partyJoinedTurn = 21;
    world.parties.US_DEM!.isDefault = false;
    world.parties.US_DEM!.chairId = "player";
    world.parties.US_DEM!.nppControlCreatedAt = "2026-10-03T00:00:00.000Z";
    world.player.partyJoinedAt = "2026-10-01T00:00:00.000Z";
    world.player.lastPartySwitchAt = "2026-10-01T00:00:00.000Z";
    world.charters.push({
      id: "custom-party-charter",
      countryId: "US",
      partyId: "US_DEM",
      founderId: "player",
      foundedAtTurn: 20,
      status: "ratified",
      expiresOnTurn: null,
      expiresAt: null,
      founderReplacementDeadlineTurn: null,
      founderReplacementDeadline: null,
      proposedName: "Custom Democrats",
      proposedAbbr: "DEM",
      founderIds: ["player"],
      signatures: [{ founderId: "player", signedAtTurn: 20 }],
      platform: { economic: 0, social: 0 },
      createdAtTurn: 20,
      ratifiedAtTurn: 20,
    });
    world.meta.turn = 5000;
    world.bills.push(activeBill("bill-custom-whip"));
    let now = new Date("2026-10-04T23:59:00.000Z");
    const session = new GameSession(() => new Date(now));
    session.load(serializeSave(world, "2026-10-04T23:59:00.000Z"));
    const tooEarly = session.act("issuePartyWhip", {
      billId: "bill-custom-whip",
      whipDirection: "for",
      whipMode: "soft",
    });
    expect(tooEarly).toMatchObject({ ok: false, error: expect.stringMatching(/48 hours/i) });
    expect(JSON.parse(session.serialize("2026-10-04T23:59:00.000Z")).world.partyWhips).toBeUndefined();

    world.parties.US_DEM!.nppControlCreatedAt = "2026-10-01T00:00:00.000Z";
    world.player.partyJoinedAt = "2026-10-03T00:00:00.000Z";
    world.player.lastPartySwitchAt = "2026-10-03T00:00:00.000Z";
    session.load(serializeSave(world, "2026-10-04T23:59:00.000Z"));
    const memberTenureTooEarly = session.act("issuePartyWhip", {
      billId: "bill-custom-whip",
      whipDirection: "for",
      whipMode: "soft",
    });
    expect(memberTenureTooEarly).toMatchObject({ ok: false, error: expect.stringMatching(/stable membership/i) });

    now = new Date("2026-10-05T00:00:00.000Z");
    const ready = session.act("issuePartyWhip", {
      billId: "bill-custom-whip",
      whipDirection: "for",
      whipMode: "soft",
    });
    expect(ready.ok).toBe(true);
    const restored = new GameSession(() => new Date(now));
    restored.load(session.serialize("2026-10-05T00:00:00.000Z"));
    const serializedWorld = JSON.parse(restored.serialize("2026-10-05T00:00:00.000Z")).world;
    expect(serializedWorld.partyWhips).toMatchObject([{ attemptNumber: 1 }]);
    expect(serializedWorld.parties.US_DEM.nppControlCreatedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(serializedWorld.player.partyJoinedAt).toBe("2026-10-03T00:00:00.000Z");
    expect(serializedWorld.player.lastPartySwitchAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("retains two independent attempts and refuses a third for one bill chamber", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    world.player.actions = 0;
    world.bills.push(activeBill("bill-whip-cap"));

    const first = executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-whip-cap",
      whipDirection: "for",
      whipMode: "soft",
    });
    const second = executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-whip-cap",
      whipDirection: "against",
      whipMode: "soft",
    });
    const third = executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-whip-cap",
      whipDirection: "for",
      whipMode: "soft",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third).toMatchObject({ ok: false, error: expect.stringMatching(/maximum.*2|two.*whip/i) });
    expect(world.partyWhips).toMatchObject([
      { attemptNumber: 1, direction: "for" },
      { attemptNumber: 2, direction: "against" },
    ]);
    expect(world.partyWhips?.map((whip) => whip.direction)).toEqual(["for", "against"]);
    const restored = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(restored.partyWhips).toEqual(world.partyWhips);
    const malformed = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z")) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; partyWhips: Array<{ attemptNumber?: number }> };
    };
    malformed.world.partyWhips[1]!.attemptNumber = 1;
    expect(() => deserializeSave(JSON.stringify(malformed))).toThrow(/attempt sequence/i);
    const afterReload = executeAction(restored, "player", "issuePartyWhip", {
      billId: "bill-whip-cap",
      whipDirection: "against",
      whipMode: "hard",
    });
    expect(afterReload).toMatchObject({ ok: false, error: expect.stringMatching(/maximum.*2|two.*whip/i) });
  });

  it("starts a new two-attempt hard-whip window only at a source veto-override boundary", () => {
    const world = createWorld(OPTIONS);
    world.meta.turn = 5;
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    const bill = activeBill("bill-whip-override");
    bill.status = "veto_override";
    bill.overrideVotingStartedAtTurn = 5;
    bill.vetoOverrideVotes = {};
    bill.votes = { "passage-ballot": "for" };
    world.bills.push(bill);
    world.partyWhips = [1, 2].map((attemptNumber) => ({
      id: `bill-whip-override-US_DEM-ordinary-${attemptNumber}`,
      billId: bill.id,
      partyId: "US_DEM",
      countryId: "US",
      chamber: "house",
      direction: attemptNumber === 1 ? "for" as const : "against" as const,
      mode: "soft" as const,
      attemptNumber: attemptNumber as 1 | 2,
      issuedAtTurn: attemptNumber,
      issuerId: "player",
      issuerRole: "chair" as const,
    }));
    const voter = world.politicians.find((candidate) => candidate.partyId === "US_DEM")!;
    for (const politician of world.politicians.filter((candidate) => candidate.partyId === "US_DEM")) {
      politician.chamberKey = "senate";
    }
    voter.chamberKey = "house";
    voter.personality = { loyalty: 0, ambition: 50, stubbornness: 100 };
    voter.ideology = { economic: 5, social: 0 };
    const expectedRng = rngFromState(world.meta.rng);
    const statecraft = effectivePlayerStats(world)?.statecraft ?? NEUTRAL_STAT;
    const statecraftBonus = Math.round((statMultiplier(statecraft) - 1) * 50);
    const obeys = expectedRng.int(1, 100) <= hardNppWhipSuccessChance(voter.personality, statecraftBonus);
    const expectedOverrideVote = obeys
      ? "against"
      : resolveNppBillVote(world, bill, voter, { direction: "against", mode: "hard" });

    const first = executeAction(world, "player", "issuePartyWhip", {
      billId: bill.id, whipDirection: "against", whipMode: "hard",
    });
    const second = executeAction(world, "player", "issuePartyWhip", {
      billId: bill.id, whipDirection: "for", whipMode: "soft",
    });
    const third = executeAction(world, "player", "issuePartyWhip", {
      billId: bill.id, whipDirection: "against", whipMode: "soft",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third).toMatchObject({ ok: false, error: expect.stringMatching(/maximum.*2|two.*whip/i) });
    expect(bill.votes).toEqual({ "passage-ballot": "for" });
    expect(bill.vetoOverrideVotes?.[voter.id]).toBe(expectedOverrideVote);
    expect(bill.vetoOverrideVotesAgainst).toBe(expectedOverrideVote === "against" ? 1 : 0);
    expect(bill.vetoOverrideVotesFor).toBe(expectedOverrideVote === "for" ? 1 : 0);
    expect(world.meta.rng).toEqual(expectedRng.state());
    expect(world.partyWhips?.map((whip) => whip.attemptNumber)).toEqual([1, 2, 1, 2]);
    expect(new Set(world.partyWhips?.map((whip) => whip.id)).size).toBe(4);
    const restored = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(restored.partyWhips).toEqual(world.partyWhips);
    expect(restored.bills[0]?.overrideVotingStartedAtTurn).toBe(5);

    const legacyWindow = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    legacyWindow.bills[0]!.overrideVotingStartedAtTurn = undefined;
    expect(executeAction(legacyWindow, "player", "issuePartyWhip", {
      billId: bill.id, whipDirection: "for", whipMode: "soft",
    })).toMatchObject({ ok: false, error: expect.stringMatching(/maximum.*2|two.*whip/i) });
  });

  it("preserves a legacy single whip as one attempt when reading the previous schema", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    world.bills.push(activeBill("bill-legacy-whip"));
    expect(executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-legacy-whip",
      whipDirection: "for",
      whipMode: "soft",
    }).ok).toBe(true);
    const raw = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z")) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; partyWhips: Array<Record<string, unknown>> };
    };
    raw.schemaVersion = 70;
    raw.world.meta.schemaVersion = 70;
    delete raw.world.partyWhips[0]!.attemptNumber;
    const restored = deserializeSave(JSON.stringify(raw));
    expect(restored.partyWhips?.[0]?.attemptNumber).toBeUndefined();
    const second = executeAction(restored, "player", "issuePartyWhip", {
      billId: "bill-legacy-whip",
      whipDirection: "against",
      whipMode: "soft",
    });
    expect(second.ok).toBe(true);
    expect(restored.partyWhips?.map((whip) => whip.attemptNumber)).toEqual([undefined, 2]);
  });

  it("does not let a head-of-state title substitute for source party membership or allow abstain", () => {
    const world = createWorld(OPTIONS);
    world.player.mode = "hos";
    world.player.partyId = null;
    world.player.hosPartyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    world.bills.push(activeBill("bill-hos-whip"));

    const denied = executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-hos-whip",
      whipDirection: "for",
      whipMode: "soft",
    });
    expect(denied).toMatchObject({ ok: false, error: expect.stringMatching(/membership/i) });
    world.player.mode = "career";
    world.player.partyId = "US_DEM";
    world.partyWhips = [];
    const abstain = executeAction(world, "player", "issuePartyWhip", JSON.parse(
      '{"billId":"bill-hos-whip","whipDirection":"abstain","whipMode":"soft"}',
    ));
    expect(abstain).toMatchObject({ ok: false, error: expect.stringMatching(/for or against/i) });
    expect(world.partyWhips).toHaveLength(0);
  });

  it("keeps a soft whip advisory without changing ballots or consuming RNG", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    world.player.actions = 100;
    const politician = world.politicians.find((candidate) => candidate.partyId === "US_DEM")!;
    politician.chamberKey = "house";
    const bill = activeBill("bill-soft-whip");
    bill.votes[politician.id] = "for";
    bill.votesFor = 1;
    world.bills.push(bill);
    const rngBefore = [...world.meta.rng];

    const issued = executeAction(world, "player", "issuePartyWhip", {
      billId: bill.id,
      whipDirection: "against",
      whipMode: "soft",
    });

    expect(issued.ok).toBe(true);
    expect(bill.votes[politician.id]).toBe("for");
    expect(world.meta.rng).toEqual(rngBefore);
  });
});
