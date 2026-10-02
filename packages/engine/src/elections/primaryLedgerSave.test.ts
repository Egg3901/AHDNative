import { describe, expect, it } from "vitest";
import { createWorld, deserializeSave, serializeSave, SCHEMA_VERSION } from "../index.js";
import { PRIMARY_WAVES } from "./data/usPrimaryCalendar.js";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

function savedRaceDoc() {
  const world = createWorld({ era: "2019", countryId: "US", seed: "primary-ledger-save", playerName: "Alex" });
  const partyId = Object.keys(world.parties)[0]!;
  const candidateId = "primary-ledger-candidate";
  const stateId = PRIMARY_WAVES[0]!.states[0]!;
  world.elections.push({
    id: "president:US:-:c1",
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 5,
    endTurn: 10,
    totalSeats: 1,
    chamberKey: "president",
    candidates: [{ id: candidateId, partyId, name: "Candidate", status: "active" }],
    tally: {},
    primaryRulesetVersion: 3,
    primaryStateVotes: { [partyId]: { [stateId]: { [candidateId]: 5 } } },
    primaryDelegates: { [partyId]: { [candidateId]: 3 } },
    primaryDelegatesByState: { [partyId]: { [stateId]: { [candidateId]: 3 } } },
    primaryAllocationByState: { [partyId]: { [stateId]: "PR" } },
    primaryWaveHistory: [{ wave: 0, turnsRemaining: 40, statesVoted: [...PRIMARY_WAVES[0]!.states], turn: 0 }],
    primaryStaggerWavesRun: 1,
  });
  return JSON.parse(serializeSave(world, SAVED_AT)) as { world: Record<string, unknown> };
}

describe("presidential primary ledger save validation", () => {
  it("advances the preceding schema without inventing primary history", () => {
    const world = createWorld({ era: "2019", countryId: "US", seed: "primary-ledger-legacy", playerName: "Alex" });
    world.elections = [];
    const doc = JSON.parse(serializeSave(world, SAVED_AT)) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; elections: unknown[] };
    };
    doc.schemaVersion = 54;
    doc.world.meta.schemaVersion = 54;

    const loaded = deserializeSave(JSON.stringify(doc));

    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.elections).toEqual([]);
  });

  it("refuses a primary save from a newer ruleset", () => {
    const doc = savedRaceDoc() as { schemaVersion: number; world: { meta: { schemaVersion: number } } };
    doc.schemaVersion = SCHEMA_VERSION + 1;
    doc.world.meta.schemaVersion = SCHEMA_VERSION + 1;
    expect(() => deserializeSave(JSON.stringify(doc))).toThrow(/newer version/i);
  });
  it("round-trips a source-scheduled wave and its candidate/state ledgers", () => {
    const doc = savedRaceDoc();
    const loaded = deserializeSave(JSON.stringify(doc));
    expect(loaded.elections[0]?.primaryWaveHistory).toEqual([
      { wave: 0, turnsRemaining: 40, statesVoted: [...PRIMARY_WAVES[0]!.states], turn: 0 },
    ]);
    expect(loaded.elections[0]?.primaryDelegatesByState).toEqual(
      (doc.world["elections"] as Array<Record<string, unknown>>)[0]?.["primaryDelegatesByState"],
    );
  });

  it.each([
    ["future wave turn", (race: Record<string, unknown>) => {
      race["primaryWaveHistory"] = [{ wave: 0, turnsRemaining: 40, statesVoted: ["IA"], turn: 1 }];
    }],
    ["unknown candidate in ledger", (race: Record<string, unknown>) => {
      race["primaryStateVotes"] = { [Object.keys((race["primaryStateVotes"] as object))[0]!]: { IA: { missing: 1 } } };
    }],
    ["unknown party in ledger", (race: Record<string, unknown>) => {
      race["primaryDelegates"] = { missing: { "primary-ledger-candidate": 3 } };
    }],
  ])("rejects %s", (_label, mutate) => {
    const doc = savedRaceDoc();
    const race = (doc.world["elections"] as Array<Record<string, unknown>>)[0]!;
    mutate(race);
    expect(() => deserializeSave(JSON.stringify(doc))).toThrow(/presidential primary/i);
  });
});
