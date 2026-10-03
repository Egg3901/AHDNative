import { describe, expect, it } from "vitest";
import { createWorld, serializeSave, type ElectionRecord, type WorldState } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-04T00:00:00.000Z";

function savedWorld(session: GameSession): WorldState {
  return (JSON.parse(session.serialize(SAVED_AT)) as { world: WorldState }).world;
}

describe("recorded presidential save with no recoverable unit votes", () => {
  it("vacates the source presidency instead of seating a national-vote winner and retains it on reload", () => {
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
    // Game turn/election/presidentResolution.ts at c0f39acd vacates when
    // neither unit votes nor recoverable unit snapshots exist. The national
    // proportional fallback in electoralVoteService.ts is display-only.
    expect(resolved.electoralCollegeResult).toBeUndefined();
    expect(resolved.winners).toEqual([]);
    expect(resolved.status).toBe("resolved");
    expect(savedWorld(session).executives.US).toMatchObject({
      presidentId: null,
      presidentParty: null,
      termStartTurn: null,
      vicePresidentId: null,
      vicePresidentParty: null,
    });
    expect(resolved.stateTallyStates).toBeUndefined();

    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(savedWorld(resumed).elections.find((record) => record.id === race.id)).toEqual(resolved);
    expect(savedWorld(resumed).executives.US).toEqual(savedWorld(session).executives.US);
  });
});

describe("recorded presidential unit tie", () => {
  it("resolves the source hashed winner through an ordinary turn and reload despite reversed unit key order", () => {
    const world = createWorld({
      seed: "source-national-ec-fallback",
      playerName: "Tie Player",
      countryId: "US",
      era: "1953",
    });
    world.player.partyId = "US_DEM";
    world.meta.turn = 192;
    world.meta.date = "1957-01-01";
    const opponent = world.politicians.find((politician) =>
      politician.countryId === "US" && politician.partyId === "US_REP",
    )!;
    expect(opponent.id).toBe("US-214");
    const race: ElectionRecord = {
      id: "president:US:-:unit-tie-consumer",
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
      // Recorded consumer input, not an earned race or historical writer.
      // Actual Game electionCalculations.ts at c0f39acd allocates WY's 3
      // electors to player for this pair, with either insertion order.
      stateTallyStates: { WY: { totalVotes: { [opponent.id]: 100, player: 100 } } },
    };
    world.elections.push(race);
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(Object.keys((savedWorld(session).elections.find((record) => record.id === race.id)!
      .stateTallyStates!.WY as { totalVotes: Record<string, number> }).totalVotes)).toEqual(["US-214", "player"]);

    session.advance();

    const resolved = savedWorld(session).elections.find((record) => record.id === race.id)!;
    expect(resolved.electoralCollegeResult).toMatchObject({
      stateWinners: { WY: "player" },
      evByCandidate: { player: 3 },
      totalEv: 3,
      resolutionMode: "majority",
    });
    expect(resolved.winners).toEqual(["player"]);
    expect(savedWorld(session).executives.US?.presidentId).toBe("player");
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(savedWorld(resumed).elections.find((record) => record.id === race.id)).toEqual(resolved);
    expect(savedWorld(resumed).executives.US).toEqual(savedWorld(session).executives.US);
  });
});

describe("recorded presidential unit snapshots", () => {
  it("recovers the last active-candidate votes through a saved ordinary turn without rewriting the recorded history", () => {
    const world = createWorld({
      seed: "source-national-ec-fallback",
      playerName: "Recovered Player",
      countryId: "US",
      era: "1953",
    });
    world.player.partyId = "US_DEM";
    world.meta.turn = 192;
    world.meta.date = "1957-01-01";
    const opponent = world.politicians.find((politician) =>
      politician.countryId === "US" && politician.partyId === "US_REP",
    )!;
    expect(opponent.id).toBe("US-214");
    const history = { WY: {
      totalVotes: {},
      turnSnapshots: [
        { turn: 190, recordedAt: "1956-12-01T00:00:00.000Z", cumulativeVotes: { player: 1, "US-214": 100 } },
        { turn: 191, recordedAt: "1956-12-08T00:00:00.000Z", cumulativeVotes: { player: 100, "US-214": 1, withdrawn: 1000 } },
      ],
    } };
    const race: ElectionRecord = {
      id: "president:US:-:snapshot-recovery-consumer",
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
        { id: "withdrawn", name: "Withdrawn candidate", partyId: "US_DEM", isNPP: true, incumbent: false, status: "withdrawn" },
      ],
      tally: { player: 100, [opponent.id]: 1, withdrawn: 1000 },
      stateTallyStates: history,
    };
    // Recorded consumer input, not a historical writer or earned candidacy.
    // Executed Game presidentResolution recovery/filter helpers at c0f39acd
    // use only the last snapshot and exclude withdrawn1000; actual source
    // allocation awards player Wyoming's3 electors.
    world.elections.push(race);
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(savedWorld(session).elections.find((record) => record.id === race.id)?.stateTallyStates).toEqual(history);

    session.advance();

    const resolved = savedWorld(session).elections.find((record) => record.id === race.id)!;
    expect(resolved.electoralCollegeResult).toMatchObject({
      stateWinners: { WY: "player" },
      evByCandidate: { player: 3 },
      totalEv: 3,
      resolutionMode: "majority",
    });
    expect(resolved.winners).toEqual(["player"]);
    expect(resolved.stateTallyStates).toEqual(history);
    expect(savedWorld(session).executives.US?.presidentId).toBe("player");
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(savedWorld(resumed).elections.find((record) => record.id === race.id)).toEqual(resolved);
    expect(savedWorld(resumed).executives.US).toEqual(savedWorld(session).executives.US);
  });
});
