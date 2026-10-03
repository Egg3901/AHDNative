import { describe, expect, it } from "vitest";
import { getPackByEra } from "@ahdclient/content";
import { advanceTurn } from "../engine.js";
import { createWorld, listPlayableCountries } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { electionSeriesForWorld } from "./orchestration.js";

const SATELLITES = ["PL", "CS", "HU", "RO", "BG", "YU"];
const REPUBLICS = ["UKR", "BLR", "BAL"];
const SOURCE_SEATS: Record<string, Record<string, number>> = {
  "1953": { PL: 425, CS: 200, HU: 298, RO: 358, BG: 384, YU: 298, UKR: 435, BLR: 360, BAL: 300 },
  "1979": { PL: 460, CS: 200, HU: 352, RO: 369, BG: 400, YU: 308, UKR: 435, BLR: 360, BAL: 300 },
};

describe("source Eastern Bloc background election systems", () => {
  it.each(["1953", "1979"] as const)("keeps %s election systems outside character selection", (era) => {
    const pack = getPackByEra(era)!;
    const world = createWorld({ seed: `eastern-background-${era}`, playerName: "Player", countryId: "US", era });
    for (const country of pack.countries.filter((entry) => [...SATELLITES, ...REPUBLICS].includes(entry.id))) {
      expect(country.playable, `${era}:${country.id} remains unavailable for player creation`).toBe(false);
    }
    expect(pack.backgroundElections?.map((entry) => entry.countryId)).toEqual(expect.arrayContaining([...SATELLITES, ...REPUBLICS]));
    for (const countryId of [...SATELLITES, ...REPUBLICS]) {
      expect(world.countries[countryId]?.playable).not.toBe(true);
      expect(world.legislatures[countryId]).toBeDefined();
      expect(listPlayableCountries(era).some((country) => country.id === countryId)).toBe(false);
      const chamber = world.legislatures[countryId]!.chambers[0]!;
      expect(chamber.seats, `${era}:${countryId} source seat count`).toBe(SOURCE_SEATS[era]![countryId]);
    }
    expect(() => createWorld({ seed: `unavailable-${era}`, playerName: "Player", countryId: "PL", era })).toThrow(/not playable|Unknown country/);
    expect(world.regions.PL_MAZ?.houseSeats).toBe(era === "1953" ? 60 : 63);
    expect(world.regions.UKR_KYI?.houseSeats).toBe(85);
    expect(world.politicians.some((politician) => [...SATELLITES, ...REPUBLICS].includes(politician.countryId))).toBe(false);

    const historical = createWorld({ seed: `eastern-historical-${era}`, playerName: "Player", countryId: "US", era, initialization: "historical" });
    expect(historical.politicians.filter((politician) => politician.countryId === "PL" && politician.electedState === "PL_MAZ")).toHaveLength(1);
    expect(historical.politicians.find((politician) => politician.electedState === "PL_MAZ")?.seatsHeld).toBe(era === "1953" ? 60 : 63);
    for (const countryId of SATELLITES) {
      const chamber = historical.legislatures[countryId]!.chambers[0]!;
      expect(chamber.composition.seatsByParty[historical.politicians.find((politician) => politician.countryId === countryId)!.partyId]).toBe(SOURCE_SEATS[era]![countryId]);
      expect(chamber.composition.vacancies).toBe(0);
    }
  });

  it("spawns beta-country polls on the source calendar, gates latent republics at NPP v1, and saves the first public turn", () => {
    const world = createWorld({ seed: "eastern-background-gate", playerName: "Player", countryId: "US", era: "1953", autonomyLevel: "off" });
    const before = electionSeriesForWorld(world);
    expect(before.filter((series) => SATELLITES.includes(series.countryId))).toHaveLength(8 + 4 + 6 + 7 + 5 + 8);
    expect(before.some((series) => REPUBLICS.includes(series.countryId))).toBe(false);

    advanceTurn(world);
    const sourceRows = world.elections.filter((election) => SATELLITES.includes(election.countryId));
    expect(sourceRows).toHaveLength(38);
    expect(sourceRows.every((election) => election.startTurn > 0 && election.endTurn > election.startTurn)).toBe(true);
    expect(sourceRows.every((election) => election.endTurn === 96)).toBe(true);
    const resumed = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
    expect(resumed.elections.filter((election) => SATELLITES.includes(election.countryId))).toEqual(sourceRows);

    const latent = createWorld({ seed: "eastern-background-npp-v1", playerName: "Player", countryId: "US", era: "1953", autonomyLevel: "v1" });
    const enabled = electionSeriesForWorld(latent);
    expect(enabled.filter((series) => REPUBLICS.includes(series.countryId))).toHaveLength(6 + 6 + 3);
    advanceTurn(latent);
    const unionPolls = latent.elections.filter((election) => REPUBLICS.includes(election.countryId));
    expect(unionPolls).toHaveLength(15);
    expect(unionPolls.every((election) => election.endTurn === 144)).toBe(true);
  });

  it("runs the 1979 beta roster through the ordinary turn and preserves it on save reload", () => {
    const world = createWorld({ seed: "eastern-background-1979-turn", playerName: "Player", countryId: "US", era: "1979", autonomyLevel: "off" });
    advanceTurn(world);
    const rows = world.elections.filter((election) => SATELLITES.includes(election.countryId));
    expect(rows).toHaveLength(38);
    expect(rows.every((election) => election.startTurn > 0 && election.endTurn > election.startTurn)).toBe(true);
    expect(rows.every((election) => election.endTurn === 144)).toBe(true);
    expect(world.elections.some((election) => REPUBLICS.includes(election.countryId))).toBe(false);
    const resumed = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
    expect(resumed.elections.filter((election) => SATELLITES.includes(election.countryId))).toEqual(rows);
  });
});

  it("resolves a source-calendar background poll into persisted regional seat holders", () => {
    const world = createWorld({ seed: "eastern-background-resolution", playerName: "Player", countryId: "US", era: "1953", autonomyLevel: "off" });
    for (let turn = 0; turn < 96; turn++) advanceTurn(world);
    const poland = world.elections.filter((election) => election.countryId === "PL");
    expect(poland).toHaveLength(8);
    expect(poland.every((election) => election.status === "resolved")).toBe(true);
    const seated = world.politicians.filter((politician) => politician.countryId === "PL" && politician.chamberKey === "sejm" && politician.electedState);
    expect(seated).toHaveLength(8);
    for (const election of poland) {
      const winner = election.winnerId && world.politicians.find((politician) => politician.id === election.winnerId);
      expect(winner).toBeDefined();
      expect(winner?.countryId).toBe("PL");
      expect(winner?.electedState).toBe(election.state);
      expect(winner?.seatsHeld).toBeGreaterThan(0);
    }
    const resumed = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
    expect(resumed.elections.filter((election) => election.countryId === "PL")).toEqual(poland);
    expect(resumed.politicians.filter((politician) => politician.countryId === "PL" && politician.chamberKey === "sejm" && politician.electedState)).toEqual(seated);
  });
