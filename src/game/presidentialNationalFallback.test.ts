import { describe, expect, it } from "vitest";
import { createWorld, serializeSave, type ElectionRecord, type WorldState } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-04T00:00:00.000Z";

function savedWorld(session: GameSession): WorldState {
  return (JSON.parse(session.serialize(SAVED_AT)) as { world: WorldState }).world;
}

describe("recorded national-only presidential save continuation", () => {
  it("resolves the source 1953 tied national tally as 266/265 electoral votes and retains it on reload", () => {
    // Recorded consumer fixture, not an authentic historical writer or an
    // earned candidacy. The expired race prevents new vote accumulation.
    const world = createWorld({
      seed: "source-national-ec-fallback",
      playerName: "Fallback Player",
      countryId: "US",
      era: "1953",
    });
    world.player.partyId = "US_DEM";
    world.meta.turn = 192;
    world.meta.date = "1957-01-01";
    const opponent = world.politicians.find((politician) =>
      politician.countryId === "US" && politician.partyId === "US_REP",
    )!;
    const race: ElectionRecord = {
      id: "president:US:-:national-only-consumer",
      electionType: "president",
      countryId: "US",
      cycle: 1,
      status: "active",
      startTurn: 1,
      primaryEndTurn: 100,
      endTurn: 191,
      totalSeats: 1,
      chamberKey: "president",
      candidates: [
        { id: "player", name: world.player.name, partyId: "US_DEM", isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId: "US_REP", isNPP: true, incumbent: false },
      ],
      tally: { player: 100, [opponent.id]: 100 },
    };
    world.elections.push(race);

    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(savedWorld(session).elections.find((record) => record.id === race.id)?.stateTallyStates).toBeUndefined();
    session.advance();

    const resolved = savedWorld(session).elections.find((record) => record.id === race.id)!;
    // Literal witness from actual Game computeElectoralVotes at bfe655d5:
    // an equal national tally in the 531-EV college allocates 266 to the
    // first entry and the remaining 265 to the second entry.
    expect(resolved.electoralCollegeResult).toEqual({
      stateWinners: {},
      evByCandidate: { player: 266, [opponent.id]: 265 },
      totalEv: 531,
      resolutionMode: "majority",
    });
    expect(resolved.winners).toEqual(["player"]);
    expect(resolved.status).toBe("resolved");
    expect(savedWorld(session).executives.US?.presidentId).toBe("player");
    expect(resolved.stateTallyStates).toBeUndefined();

    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(savedWorld(resumed).elections.find((record) => record.id === race.id)).toEqual(resolved);
    expect(savedWorld(resumed).executives.US).toEqual(savedWorld(session).executives.US);
  });
});
