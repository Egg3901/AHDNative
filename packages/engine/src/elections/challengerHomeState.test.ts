import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { fillCandidates } from "./orchestration.js";
import type { ElectionRecord } from "./types.js";

function race(countryId: string, electionType: string, state?: string): ElectionRecord {
  return {
    id: `${electionType}:${countryId}:${state ?? "-"}:challenger-home-state`,
    electionType,
    countryId,
    ...(state ? { state } : {}),
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 0,
    endTurn: 10,
    totalSeats: 1,
    chamberKey: electionType === "governor" ? "governor" : "president",
    candidates: [],
    tally: {},
  };
}

describe("source NPP challenger home-state assignment", () => {
  it("records the state passed to a state-specific source election", () => {
    const world = createWorld({ seed: "source-state-challenger", playerName: "Player", countryId: "US", era: "1953" });
    const election = race("US", "governor", "IA");

    fillCandidates(world, rngFromSeed("source-state-challenger-rng"), election);

    const challengers = election.candidates.filter((candidate) => candidate.isNPP);
    expect(challengers.length).toBeGreaterThan(0);
    for (const candidate of challengers) {
      expect(world.politicians.find((politician) => politician.id === candidate.id)?.homeState).toBe("IA");
    }
    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    for (const candidate of challengers) {
      expect(resumed.politicians.find((politician) => politician.id === candidate.id)?.homeState).toBe("IA");
    }
  });

  it("leaves national challengers without an invented home state", () => {
    const world = createWorld({ seed: "source-national-challenger", playerName: "Player", countryId: "US", era: "1953" });
    const election = race("US", "president");

    fillCandidates(world, rngFromSeed("source-national-challenger-rng"), election);

    const challengers = election.candidates.filter((candidate) => candidate.isNPP);
    expect(challengers.length).toBeGreaterThan(0);
    for (const candidate of challengers) {
      expect(world.politicians.find((politician) => politician.id === candidate.id)?.homeState).toBeUndefined();
    }
  });
});
