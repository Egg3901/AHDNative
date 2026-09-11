import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { resolvePrimaries } from "./primaryResolution.js";
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
  it("persists the nominee snapshot, removes and archives the loser, and resets primary tally state", () => {
    const { world, rec, npc } = fixture();

    resolvePrimaries(world);

    expect(rec.candidates.map((candidate) => candidate.id)).toEqual(["player"]);
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
    expect(rec.candidates.map((candidate) => candidate.id)).toEqual(["player"]);
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
    rec.candidates.push({ id: "withdrawn", name: "Withdrawn", partyId: "DEM", isNPP: true, incumbent: false });
    rec.candidates = rec.candidates.filter((candidate) => candidate.id !== "withdrawn");

    resolvePrimaries(world);

    expect(rec.primaryResults?.byParty.DEM?.some((entry) => entry.candidateId === "withdrawn")).toBe(false);
    expect(rec.primaryResults?.byParty.DEM?.find((entry) => entry.candidateId === npc.id)?.won).toBe(true);
    expect(rec.primaryResults?.byParty.DEM?.find((entry) => entry.candidateId === "player")?.won).toBe(false);
    expect(rec.candidates.map((candidate) => candidate.id)).toEqual([npc.id]);
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
