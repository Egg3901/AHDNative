import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { ElectionRecord } from "./types.js";
import type { Politician } from "../types.js";

function setupRace(): { world: ReturnType<typeof createWorld>; race: ElectionRecord } {
  const world = createWorld({ seed: "primary-scheduler", playerName: "Player", countryId: "US", era: "1953" });
  world.player.partyId = "US_DEM";
  world.player.policies = { economic: 0, social: 0 };
  world.player.favorability = 70;
  world.player.politicalInfluence = 70;

  const opponent = {
    id: "primary-scheduler-opponent",
    name: "Opponent",
    countryId: "US",
    partyId: "US_DEM",
    ideology: { economic: 0, social: 0 },
    favorability: 40,
    politicalInfluence: 40,
    infamy: 0,
  } as Politician;
  world.politicians.push(opponent);

  const race: ElectionRecord = {
    id: "house:US:CA:c-primary-scheduler",
    electionType: "house",
    countryId: "US",
    state: "CA",
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 12,
    endTurn: 20,
    totalSeats: 1,
    chamberKey: "house",
    candidates: [
      { id: "player", name: "Player", partyId: "US_DEM", isNPP: false, incumbent: false },
      { id: opponent.id, name: opponent.name, partyId: "US_DEM", isNPP: false, incumbent: false },
    ],
    tally: {},
  };
  world.elections = [race];

  const partyRegion = Object.values(world.partyRegions).find(
    (entry) => entry.regionId === race.state && entry.partyId === "US_DEM",
  );
  if (!partyRegion) throw new Error("US_DEM registration for CA was not seeded");
  partyRegion.registration = 60;

  return { world, race };
}

describe("primary ballot scheduler", () => {
  it("resolves a non-US parliamentary nominee set before general tally and preserves it on resume", () => {
    const world = createWorld({ seed: "source-ie-primary-advance", playerName: "Player", countryId: "IE", era: "1991" });
    world.meta.turn = 10;
    world.meta.date = "1991-06-12";
    world.player.partyId = "FF";
    world.player.policies = { economic: 0, social: 0 };
    const candidates = ["player", "candidate-2", "candidate-3", "candidate-4"].map((id, index) => {
      if (id !== "player") {
        world.politicians.push({
          id, name: id, gender: "male", countryId: "IE", partyId: "FF", chamberKey: "",
          ideology: { economic: 0, social: 0 }, age: 45, partyInfluence: 0, bonusActions: 0,
          actions: 4, funds: 0, donorBaseLevel: 0, favorability: 80 - index * 10,
          politicalInfluence: 40, infamy: 0, actionCooldowns: {},
          personality: { loyalty: 50, ambition: 50, stubbornness: 50 }, cash: 0,
        } as Politician);
      }
      return { id, name: id, partyId: "FF", isNPP: false, incumbent: false };
    });
    const state = Object.values(world.regions).find((region) => region.countryId === "IE")?.id;
    const race: ElectionRecord = {
      id: "dail:IE:DN:c-primary-save",
      electionType: "dail",
      countryId: "IE",
      ...(state ? { state } : {}),
      cycle: 1,
      status: "active",
      startTurn: 0,
      primaryEndTurn: 10,
      endTurn: 20,
      totalSeats: 4,
      chamberKey: "dail",
      candidates,
      tally: {},
    };
    world.elections = [race];

    advanceTurn(world);
    expect(race.primaryResults?.byParty.FF?.filter((entry) => entry.won)).toHaveLength(3);
    expect(race.candidates).toHaveLength(3);

    const resumed = deserializeSave(serializeSave(world, "2026-09-11T00:00:00Z"));
    const resumedRace = resumed.elections[0]!;
    advanceTurn(resumed);
    expect(resumedRace.primaryResults).toEqual(race.primaryResults);
    expect(resumedRace.candidates.map((candidate) => candidate.id)).toEqual(race.candidates.map((candidate) => candidate.id));
  });

  it("accrues closing-window ballots and preserves snapshots through save reload", () => {
    const { world, race } = setupRace();

    for (let turn = 0; turn < 3; turn += 1) advanceTurn(world);
    expect(race.primaryVotes).toBeUndefined();
    for (let turn = 3; turn < race.primaryEndTurn; turn += 1) advanceTurn(world);

    expect(race.primaryVotes).toBeDefined();
    expect(Object.values(race.primaryVotes ?? {}).some((votes) => votes > 0)).toBe(true);
    expect(race.primarySnapshots?.map((snapshot) => snapshot.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(race.tally).toEqual({});

    const reloaded = deserializeSave(serializeSave(world, "2026-09-11T00:00:00Z"));
    const restoredRace = reloaded.elections[0]!;
    expect(restoredRace.primaryVotes).toEqual(race.primaryVotes);
    expect(restoredRace.primarySnapshots).toEqual(race.primarySnapshots);
  });

  it("uses the persisted primary ballot ledger when the primary resolves", () => {
    const { world, race } = setupRace();
    const opponentId = race.candidates[1]!.id;

    for (let turn = 0; turn < race.primaryEndTurn; turn += 1) advanceTurn(world);
    race.primaryVotes = { player: 1, [opponentId]: 1_000 };

    advanceTurn(world);

    expect(race.primaryResults?.byParty.US_DEM?.[0]?.candidateId).toBe(opponentId);
    expect(race.candidates.map((candidate) => candidate.id)).toEqual([opponentId]);
  });

  it("records presidential state votes and delegates by source wave, then resolves after a save continuation", () => {
    const world = createWorld({ seed: "source-presidential-primary-waves", playerName: "Player", countryId: "US", era: "1953" });
    world.player.partyId = "US_DEM";
    world.player.policies = { economic: -1, social: -1 };
    world.player.favorability = 70;
    world.player.politicalInfluence = 50;
    const opponent: Politician = {
      id: "pres-primary-opponent", name: "Opponent", countryId: "US", partyId: "US_DEM",
      ideology: { economic: 0, social: 0 }, gender: "male", chamberKey: "", age: 45,
      partyInfluence: 0, bonusActions: 0, actions: 4, funds: 0, donorBaseLevel: 0,
      favorability: 30, politicalInfluence: 25, infamy: 0, actionCooldowns: {},
      personality: { loyalty: 50, ambition: 50, stubbornness: 50 }, cash: 0,
    };
    world.politicians.push(opponent);
    const race: ElectionRecord = {
      id: "president:US:-:c-presidential-primary-waves", electionType: "president", countryId: "US",
      cycle: 1, status: "active", startTurn: 0, primaryEndTurn: 6, endTurn: 10,
      totalSeats: 1, chamberKey: "president", candidates: [
        { id: "player", name: "Player", partyId: "US_DEM", isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId: "US_DEM", isNPP: false, incumbent: false },
      ], tally: {},
    };
    world.elections = [race];
    for (const row of Object.values(world.partyRegions)) {
      if (row.countryId === "US" && row.partyId === "US_DEM") row.registration = 60;
    }

    // Resume after two missed turns. Game catches up every outstanding due
    // wave in source-calendar order instead of requiring exact-turn equality.
    world.meta.turn = 2;
    advanceTurn(world);
    expect(race.primaryWaveHistory?.map((entry) => entry.wave)).toEqual([0, 1, 2]);
    expect(Object.keys(race.primaryStateVotes?.US_DEM ?? {})).toEqual(["IA", "NH", "NV", "SC"]);
    expect(Object.values(race.primaryDelegates?.US_DEM ?? {}).reduce((sum, delegates) => sum + delegates, 0)).toBeGreaterThan(0);

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00Z"));
    const resumedRace = resumed.elections[0]!;
    for (let turn = 3; turn < 7; turn += 1) advanceTurn(resumed);
    expect(resumedRace.primaryWaveHistory?.map((entry) => entry.wave)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(resumedRace.primaryResults?.byParty.US_DEM).toHaveLength(2);
    expect(resumedRace.candidates.map((candidate) => candidate.id)).toHaveLength(1);
    expect(race.primaryResults).toBeUndefined();
  });
});
