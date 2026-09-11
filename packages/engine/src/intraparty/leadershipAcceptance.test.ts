import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import type { Bill } from "../legislation/types.js";
import { nppBehaviorPhase } from "../npp/nppBehavior.js";
import { rngFromSeed } from "../rng.js";
import { projectPlayerPartyInfluence } from "../party/playerInfluence.js";
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

  it("persists a party whip and makes NPP bill voting follow a hard direction", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.parties.US_DEM!.chairId = "player";
    world.player.actions = 100;
    const demPoliticians = world.politicians.filter((politician) => politician.partyId === "US_DEM").slice(0, 3);
    for (const politician of demPoliticians) politician.chamberKey = "house";
    world.bills.push(activeBill("bill-hard-whip"));

    const issued = executeAction(world, "player", "issuePartyWhip", {
      billId: "bill-hard-whip",
      whipDirection: "against",
      whipMode: "hard",
    });
    expect(issued.ok).toBe(true);
    expect(world.partyWhips).toHaveLength(1);

    const raw = JSON.parse(serializeSave(world, "2026-09-11T00:00:00.000Z")) as { world: Record<string, unknown> };
    delete raw.world.partyWhips;
    expect(deserializeSave(JSON.stringify(raw)).partyWhips).toBeUndefined();
    const restored = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(restored.partyWhips).toEqual(world.partyWhips);
    for (let turn = 0; turn < 20; turn++) {
      restored.meta.turn = turn;
      nppBehaviorPhase.run(restored, rngFromSeed(`whip-${turn}`));
    }
    const demVotes = Object.entries(restored.bills[0]!.votes)
      .filter(([politicianId]) => restored.politicians.find((politician) => politician.id === politicianId)?.partyId === "US_DEM")
      .map(([, vote]) => vote);
    expect(demVotes.length).toBeGreaterThan(0);
    expect(new Set(demVotes)).toEqual(new Set(["against"]));

    advanceTurn(restored);
    expect(restored.partyWhips).toHaveLength(1);
  });
});
