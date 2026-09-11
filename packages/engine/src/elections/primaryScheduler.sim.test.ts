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
});
