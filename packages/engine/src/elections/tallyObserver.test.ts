import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { serializeSave } from "../save.js";
import type { ElectionRecord } from "./types.js";
import { realAccumulate } from "./tallyAdapter.js";

describe("ephemeral tally input observer", () => {
  it("leaves the ordinary world and RNG byte-identical when observing one real district tally", () => {
    const source = createWorld({ seed: "tally-observer-parity", playerName: "Player", countryId: "US", era: "1953" });
    const partyId = Object.values(source.parties).find((party) => party.countryId === "US")!.id;
    source.player.partyId = partyId;
    const opponent = source.politicians.find((politician) => politician.countryId === "US" && politician.partyId === partyId)!;
    source.meta.turn = 2;
    source.meta.date = "1953-01-29";
    const race: ElectionRecord = {
      id: "house:US:NY:observer-parity",
      electionType: "house",
      countryId: "US",
      state: "NY",
      cycle: 1,
      status: "active",
      startTurn: 0,
      primaryEndTurn: 0,
      endTurn: 10,
      totalSeats: 1,
      chamberKey: "house",
      candidates: [
        { id: "player", name: source.player.name, partyId, isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId, isNPP: true, incumbent: true },
      ],
      tally: {},
      primaryResults: { recordedAt: "1953-01-01T00:00:00.000Z", byParty: {} },
    };
    source.elections = [race];
    const ordinary = structuredClone(source);
    const observed = structuredClone(source);
    const ordinaryRace = ordinary.elections[0]!;
    const observedRace = observed.elections[0]!;
    const ordinaryRng = rngFromSeed("observer-does-not-consume-rng");
    const observedRng = rngFromSeed("observer-does-not-consume-rng");
    const snapshots: unknown[] = [];

    expect(realAccumulate(ordinary, ordinaryRng, ordinaryRace)).toBe(true);
    expect(realAccumulate(observed, observedRng, observedRace, undefined, (snapshot) => snapshots.push(snapshot))).toBe(true);

    expect(snapshots).toHaveLength(1);
    expect(JSON.parse(serializeSave(observed, "1953-01-29T00:00:00.000Z")).world)
      .toEqual(JSON.parse(serializeSave(ordinary, "1953-01-29T00:00:00.000Z")).world);
    expect(observedRng.state()).toEqual(ordinaryRng.state());
  });
});
