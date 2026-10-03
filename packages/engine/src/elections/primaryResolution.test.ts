import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { primaryWinnersForElection, recordPrimarySnapshots, resolvePrimaries } from "./primaryResolution.js";
import { runVoteAccumulation } from "./orchestration.js";
import { campaignKey, ensureCampaignsForElection } from "../campaigns/lifecycle.js";
import type { ElectionCandidate, ElectionRecord } from "./types.js";
import type { Politician } from "../types.js";

function fixture() {
  const world = createWorld({ seed: "primary-resolution", playerName: "Player", countryId: "US", era: "1953" });
  world.meta.turn = 11;
  world.meta.date = "1953-03-12";
  world.player.partyId = "DEM";
  world.player.policies = { economic: 0, social: 0 };
  world.player.favorability = 80;
  world.player.politicalInfluence = 80;
  const npc = {
    id: "npc-incumbent",
    name: "Incumbent",
    countryId: "US",
    partyId: "DEM",
    ideology: { economic: 0, social: 0 },
    favorability: 20,
    politicalInfluence: 0,
    infamy: 0,
  } as Politician;
  world.politicians.push(npc);
  const candidates: ElectionCandidate[] = [
    { id: "player", name: "Player", partyId: "DEM", isNPP: false, incumbent: false },
    { id: npc.id, name: npc.name, partyId: "DEM", isNPP: true, incumbent: true },
  ];
  const rec: ElectionRecord = {
    id: "house:US:NY:c1",
    electionType: "house",
    countryId: "US",
    state: "NY",
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 10,
    endTurn: 20,
    totalSeats: 1,
    chamberKey: "house",
    candidates,
    tally: { player: 123, [npc.id]: 456 },
    tallyState: { stale: true },
  };
  world.elections = [rec];
  ensureCampaignsForElection(world, rec);
  return { world, rec, npc };
}

describe("resolvePrimaries", () => {
  it("uses the source country government cap and single-executive exception", () => {
    expect(primaryWinnersForElection("DE", "bundestag")).toBe(3);
    expect(primaryWinnersForElection("CN", "npcDelegate")).toBe(7);
    expect(primaryWinnersForElection("IT", "chamberOfDeputies")).toBe(3);
    expect(primaryWinnersForElection("HU", "nationalAssembly")).toBe(7);
    expect(primaryWinnersForElection("BR", "nationalCongress")).toBe(1);
    expect(primaryWinnersForElection("DE", "ministerPresident")).toBe(1);
    expect(primaryWinnersForElection("unknown", "assembly")).toBe(1);
  });

  it("uses the source state-plus-party primary score when both cached state leans exist", () => {
    const { world, rec } = fixture();
    const party = Object.values(world.parties).find((entry) => entry.countryId === "US")!;
    world.player.policies = { economic: -2, social: 1 };
    world.player.favorability = 80;
    world.player.politicalInfluence = 25;
    world.player.infamy = 20;
    party.economicPosition = 0;
    party.socialPosition = 0;
    world.player.partyId = party.id;
    world.stateDemographics.NY = {
      _id: "NY", countryId: "US", categoryWeights: {}, groups: {},
      cachedEconomicLean: -1, cachedSocialLean: 0, lastUpdated: "1953-03-12",
    };
    rec.candidates = [{ id: "player", name: "Player", partyId: party.id, isNPP: false, incumbent: false }];

    resolvePrimaries(world);

    // Independent Game calcPrimaryScore vector: alignment 22.5+12.75,
    // favorability 28, sqrt(25/100)*25 = 12.5, infamy multiplier .99;
    // source rounds to one decimal, yielding 75.0.
    expect(rec.primaryResults?.byParty[party.id]?.[0]?.score).toBe(75);
  });

  it("uses the source presidential primary score for the national candidate snapshot", () => {
    const { world, rec } = fixture();
    const party = Object.values(world.parties).find((entry) => entry.countryId === "US")!;
    rec.electionType = "president";
    rec.state = undefined;
    rec.chamberKey = "president";
    rec.primaryEndTurn = 20;
    rec.candidates = [{ id: "player", name: "Player", partyId: party.id, isNPP: false, incumbent: false }];
    world.player.partyId = party.id;
    world.player.policies = { economic: 0, social: 0 };
    world.player.favorability = 80;
    world.player.nationalInfluence = 45;
    world.player.partyInfluence = 75;
    // Pin the same zero-axis platform used by the independent source vector:
    // calcPresidentPrimaryScore receives the live party position as an input.
    party.economicPosition = 0;
    party.socialPosition = 0;

    recordPrimarySnapshots(world);

    // Immutable Game calcPresidentPrimaryScore: alignment 40, party clout
    // 75/150*20=10, national reach (1-exp(-45/45))*15=9.4818, favorability
    // 80/100*25=20. Rounded to the source's one decimal: 79.5.
    expect(rec.primarySnapshots?.[0]?.byParty[party.id]?.[0]?.score).toBe(79.5);
  });

  it("advances the source top three per party in parliamentary systems", () => {
    const { world, rec } = fixture();
    rec.countryId = "DE";
    rec.id = "bundestag:DE:BE:c1";
    rec.chamberKey = "bundestag";
    for (const [id, favorability] of [["candidate-2", 60], ["candidate-3", 40], ["candidate-4", 20]] as const) {
      world.politicians.push({
        id, name: id, countryId: "DE", partyId: "DEM", ideology: { economic: 0, social: 0 },
        favorability, politicalInfluence: 20, infamy: 0,
      } as Politician);
      rec.candidates.push({ id, name: id, partyId: "DEM", isNPP: false, incumbent: false });
    }
    rec.candidates[0]!.partyId = "DEM";
    rec.candidates[1]!.partyId = "DEM";
    expect(rec.candidates).toHaveLength(5);

    resolvePrimaries(world);

    const result = rec.primaryResults?.byParty.DEM ?? [];
    expect(result.filter((entry) => entry.won)).toHaveLength(3);
    expect(rec.candidates.filter((candidate) => candidate.status !== "withdrawn")).toHaveLength(3);
    expect(rec.candidates.filter((candidate) => candidate.status === "withdrawn")).toHaveLength(2);
  });

  it("persists the nominee snapshot and withdrawn loser rows, archives the loser, and resets primary tally state", () => {
    const { world, rec, npc } = fixture();

    resolvePrimaries(world);

    expect(rec.candidates.find((candidate) => candidate.id === "player")).toMatchObject({ status: "active" });
    expect(rec.candidates.find((candidate) => candidate.id === npc.id)).toMatchObject({ status: "withdrawn" });
    expect(rec.primaryResults?.byParty.DEM?.map((entry) => [entry.candidateId, entry.won])).toEqual([
      ["player", true],
      [npc.id, false],
    ]);
    expect(rec.primaryResolvedTurn).toBe(11);
    expect(rec.tally).toEqual({});
    expect(rec.tallyState).toBeUndefined();
    expect(world.campaigns[campaignKey(rec.id, npc.id)]?.status).toBe("archived");
  });

  it("uses stable candidate order to break an exact score tie", () => {
    const { world, rec, npc } = fixture();
    world.player.favorability = npc.favorability;
    world.player.politicalInfluence = npc.politicalInfluence;
    rec.candidates[1] = { ...rec.candidates[1]!, isNPP: false };

    resolvePrimaries(world);

    expect(rec.primaryResults?.byParty.DEM?.[0]?.candidateId).toBe("player");
    expect(rec.candidates.filter((candidate) => candidate.status !== "withdrawn").map((candidate) => candidate.id)).toEqual(["player"]);
  });

  it("keeps source candidate order when primary ballots tie despite different score standings", () => {
    const { world, rec, npc } = fixture();
    // Independent AHDGame comparator: once cumulative ballots exist it sorts
    // by ballot totals only; stable sort retains candidate-query order on a
    // tie. A score fallback here would incorrectly move the NPC ahead.
    world.player.favorability = 0;
    world.player.politicalInfluence = 0;
    npc.favorability = 100;
    npc.politicalInfluence = 100;
    rec.primaryVotes = { player: 500, [npc.id]: 500 };

    resolvePrimaries(world);

    expect(rec.primaryResults?.byParty.DEM?.map((entry) => [entry.candidateId, entry.won])).toEqual([
      ["player", true],
      [npc.id, false],
    ]);
    expect(rec.primaryResults?.byParty.DEM?.map((entry) => entry.sharePct)).toEqual([50, 50]);
  });

  it("excludes a withdrawn candidate and records an incumbent primary loss", () => {
    const { world, rec, npc } = fixture();
    rec.candidates = [rec.candidates[1]!, rec.candidates[0]!];
    rec.candidates[0]!.incumbent = false;
    rec.candidates[1]!.incumbent = true;
    npc.favorability = 100;
    npc.politicalInfluence = 100;
    world.player.favorability = 0;
    world.player.politicalInfluence = 0;
    rec.candidates.push({ id: "withdrawn", name: "Withdrawn", partyId: "DEM", isNPP: true, incumbent: false, status: "withdrawn" });

    resolvePrimaries(world);

    expect(rec.primaryResults?.byParty.DEM?.some((entry) => entry.candidateId === "withdrawn")).toBe(false);
    expect(rec.primaryResults?.byParty.DEM?.find((entry) => entry.candidateId === npc.id)?.won).toBe(true);
    expect(rec.primaryResults?.byParty.DEM?.find((entry) => entry.candidateId === "player")?.won).toBe(false);
    expect(rec.candidates.find((candidate) => candidate.id === npc.id)).toMatchObject({ status: "active" });
    expect(rec.candidates.find((candidate) => candidate.id === "player")).toMatchObject({ status: "withdrawn" });
    expect(rec.candidates.find((candidate) => candidate.id === "withdrawn")).toMatchObject({ status: "withdrawn" });
  });

  it("survives save/reload and is retained when the next general tally starts", () => {
    const { world } = fixture();
    resolvePrimaries(world);
    const loaded = deserializeSave(serializeSave(world, "2026-09-11T00:00:00Z"));
    const rec = loaded.elections[0]!;
    loaded.meta.turn = 12;

    runVoteAccumulation(loaded, rngFromSeed("primary-general"));

    expect(rec.primaryResults?.byParty.DEM?.[0]?.candidateId).toBe("player");
    expect((rec.tallyState as { primaryResults?: unknown } | undefined)?.primaryResults).toEqual(rec.primaryResults);
  });

  it("does not resolve early or rerun an already stamped primary", () => {
    const { world, rec } = fixture();
    world.meta.turn = 10;
    resolvePrimaries(world);
    expect(rec.primaryResults).toBeUndefined();
    world.meta.turn = 11;
    resolvePrimaries(world);
    const first = rec.primaryResults;
    resolvePrimaries(world);
    expect(rec.primaryResults).toBe(first);
  });
});
