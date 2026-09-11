import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { createWorld } from "./world.js";
import { serializeSave, deserializeSave } from "./save.js";

const OPTIONS = {
  seed: "uk-career-depth",
  playerName: "Alex",
  countryId: "UK",
  era: "1953",
} as const;

describe("UK career initialization", () => {
  it("starts the historical world with the source-backed Commons roster and forms a government", () => {
    const world = createWorld({ ...OPTIONS, initialization: "historical" });
    const commons = world.legislatures.UK?.chambers.find((chamber) => chamber.key === "commons");

    expect(commons?.composition).toEqual({
      seatsByParty: {
        UK_LAB: 141,
        UK_CON: 138,
        UK_SNP: 90,
        UK_PC: 87,
        UK_SF: 86,
        UK_LIB: 83,
      },
      vacancies: 0,
    });

    const chair = world.politicians.find(
      (politician) => politician.countryId === "UK" && politician.partyId === "UK_LAB" && politician.chamberKey === "commons",
    );
    expect(chair).toBeDefined();
    world.parties["UK_LAB"]!.chairId = chair!.id;

    advanceTurn(world);

    expect(world.governments.UK?.status).toBe("formed");
    expect(world.governments.UK?.pmPoliticianId).toEqual(expect.any(String));
    expect(world.governments.UK?.pmVacancyDeadlineTurn).toBeNull();
    const commonsElection = world.elections.find(
      (election) => election.countryId === "UK" && election.chamberKey === "commons",
    );
    expect(commonsElection?.electionType).toBe("commons");
    expect(commonsElection?.status).toBe("active");
    expect(world.elections.some((election) => election.electionType === "snap_commons")).toBe(false);
  });

  it("keeps the authored empty-seat world when founding initialization is explicit", () => {
    const world = createWorld({ ...OPTIONS, seed: "uk-founding-depth", initialization: "founding" });
    const commons = world.legislatures.UK?.chambers.find((chamber) => chamber.key === "commons");

    expect(commons?.composition).toEqual({ seatsByParty: {}, vacancies: 625 });
    expect(world.politicians.filter((politician) => politician.countryId === "UK" && politician.chamberKey === "commons")).toHaveLength(0);

    advanceTurn(world);

    expect(world.governments.UK?.status).toBe("pending");
    expect(world.elections.find((election) => election.countryId === "UK" && election.chamberKey === "commons")?.status).toBe("active");
    expect(world.elections.some((election) => election.electionType === "snap_commons")).toBe(false);
  });

  it("scales the 1979 regional apportionment to the configured 650 Commons seats", () => {
    const world = createWorld({ ...OPTIONS, era: "1979", seed: "uk-1979-depth", initialization: "historical" });
    const commons = world.legislatures.UK?.chambers.find((chamber) => chamber.key === "commons");

    expect(commons?.composition).toEqual({
      seatsByParty: {
        UK_LAB: 116,
        UK_CON: 112,
        UK_LD: 74,
        UK_SNP: 71,
        UK_PC: 70,
        UK_GRN: 69,
        UK_DUP: 69,
        UK_SF: 69,
      },
      vacancies: 0,
    });
  });

  it("keeps the existing founding baseline when initialization is omitted", () => {
    const omitted = createWorld({ ...OPTIONS, seed: "uk-default-depth" });
    const explicit = createWorld({ ...OPTIONS, seed: "uk-default-depth", initialization: "founding" });

    const savedAt = "2026-09-10T00:00:00.000Z";
    expect(serializeSave(omitted, savedAt)).toBe(serializeSave(explicit, savedAt));
    const historical = createWorld({ ...OPTIONS, initialization: "historical" });
    const loaded = deserializeSave(serializeSave(historical, savedAt));
    expect(serializeSave(loaded, savedAt)).toBe(serializeSave(historical, savedAt));
  });
});
