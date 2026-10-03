import { describe, expect, it } from "vitest";
import { advanceTurn, createWorld, deserializeSave, serializeSave } from "../index.js";
import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";

// Game 093daeae, commonsByElections.ts: commonsByElectionGate and watcher.
// Held offices and existing races are explicit fixtures. Scheduling, claims,
// deadlines and continuation are produced by ordinary public engine turns.
function worldWithVacancy(seed: string): WorldState {
  const world = createWorld({ seed, playerName: "Commons player", countryId: "UK", era: "2019" });
  world.ukCommonsVacancies = [{
    id: "vacancy-first", countryId: "UK", regionId: "LON", formerHolderId: "former-first",
    seats: 3, reason: "resignation", vacatedTurn: 0, status: "open",
  }];
  return world;
}

function fixtureRace(overrides: Partial<ElectionRecord>): ElectionRecord {
  return {
    id: "fixture-regular", electionType: "commons", countryId: "UK", state: "LON",
    cycle: 0, status: "active", startTurn: 0, primaryEndTurn: 24, endTurn: 50,
    totalSeats: 73, chamberKey: "commons", candidates: [], tally: {}, ...overrides,
  };
}

describe("source Commons vacancy scheduling through ordinary turns", () => {
  it("keeps a live special's claims and electorate fixed when another weighted office becomes vacant", () => {
    const world = worldWithVacancy("commons-fixed-live-special");
    advanceTurn(world);
    const special = world.elections.find((race) => race.electionType === "special_commons" && race.state === "LON")!;
    expect(special).toMatchObject({ totalSeats: 3, vacancyIds: ["vacancy-first"] });
    const originalCarve = special.byElectionCarve;
    world.ukCommonsVacancies!.push({
      id: "vacancy-later", countryId: "UK", regionId: "LON", formerHolderId: "former-later",
      seats: 2, reason: "retirement", vacatedTurn: world.meta.turn, status: "open",
    });
    const resumed = deserializeSave(serializeSave(world, "commons-fixed-live-special"));
    advanceTurn(world);
    advanceTurn(resumed);
    expect(special).toMatchObject({ totalSeats: 3, vacancyIds: ["vacancy-first"], byElectionCarve: originalCarve });
    expect(world.ukCommonsVacancies!.find((vacancy) => vacancy.id === "vacancy-later")).toMatchObject({ status: "open" });
    expect(world.elections.filter((race) => race.electionType === "special_commons" && race.state === "LON")).toHaveLength(1);
    expect(resumed).toEqual(world);
  });

  it("spawns before a general that closes one turn after the new special, without an extra boundary turn", () => {
    const world = worldWithVacancy("commons-general-boundary");
    world.elections.push(fixtureRace({}));
    advanceTurn(world);
    expect(world.meta.turn).toBe(1);
    expect(world.elections.find((race) => race.electionType === "special_commons" && race.state === "LON"))
      .toMatchObject({ startTurn: 1, primaryEndTurn: 25, endTurn: 49, totalSeats: 3 });
    expect(deserializeSave(serializeSave(world, "commons-general-boundary")).ukCommonsVacancies)
      .toEqual(world.ukCommonsVacancies);
  });

  it("honors a cancelled special's recorded end-turn cooldown across save and ordinary continuation", () => {
    const world = worldWithVacancy("commons-cancelled-cooldown");
    world.elections.push(fixtureRace({
      id: "fixture-cancelled-special", electionType: "special_commons", status: "cancelled",
      startTurn: 0, primaryEndTurn: 0, endTurn: 0, totalSeats: 1,
    }));
    const resumed = deserializeSave(serializeSave(world, "commons-cancelled-cooldown"));
    advanceTurn(world);
    advanceTurn(resumed);
    expect(world.ukCommonsVacancies![0]).toMatchObject({ status: "open" });
    expect(world.elections.filter((race) => race.electionType === "special_commons" && race.status !== "cancelled")).toEqual([]);
    expect(resumed).toEqual(world);
  });
});
