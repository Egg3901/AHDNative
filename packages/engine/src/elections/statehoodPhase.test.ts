import { describe, expect, it } from "vitest";
import { admissionHazard, admissionRoll, TERRITORY_ADMISSIONS } from "../electionEngine/resolution/statehoodAdmission.js";
import { deserializeSave, serializeSave } from "../save.js";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { processStatehoodAdmission } from "./statehoodPhase.js";

function seedWithAdmission(stateId: string, year: number): string {
  const territory = TERRITORY_ADMISSIONS.find((entry) => entry.stateId === stateId)!;
  const hazard = admissionHazard(territory, year);
  for (let index = 0; index < 100_000; index += 1) {
    const seed = `statehood-source-${stateId}-${year}-${index}`;
    if (admissionRoll(stateId, year, seed) < hazard) return seed;
  }
  throw new Error(`No deterministic source admission seed found for ${stateId} in ${year}`);
}

describe("ordinary-turn statehood admission", () => {
  it("matches current AHDGame SHA-256 roll vectors using the same iteration key", () => {
    // Reference: Egg3901/AHDGame e6803596 src/lib/elections/statehoodAdmission.ts
    // delegates to src/lib/events/substrate/rng.ts hashToUint32 (SHA-256,
    // first big-endian uint32). Native singleplayer maps its persisted seed to
    // that source iteration string without rewriting the roll input.
    expect(admissionRoll("AK", 1953, "default")).toBe(3_830_337_530 / 0x1_0000_0000);
    expect(admissionRoll("HI", 1964, "singleplayer-42")).toBe(125_721_670 / 0x1_0000_0000);
    expect(admissionRoll("AK", 1953, "statehood-source-AK-1953-0")).toBe(3_543_982_334 / 0x1_0000_0000);
  });

  it("seats the initial federal senators in states rather than unadmitted territories", () => {
    const world = createWorld({ seed: "federal-seat-statehood-boundary", playerName: "Tester", countryId: "US", era: "1953" });
    const senators = world.politicians.filter((politician) => politician.countryId === "US" && politician.chamberKey === "senate");
    // Source 1953 Alaska and Hawaii have no federal representation. Their
    // recorded geography must not consume the sorted incumbent seat slots.
    expect(world.regions.AK?.houseSeats).toBe(0);
    expect(world.regions.HI?.houseSeats).toBe(0);
    expect(senators).toHaveLength(95);
    expect(senators.every((politician) => {
      const state = world.regions[politician.electedState ?? ""];
      return state !== undefined && (state.houseSeats ?? 0) > 0;
    })).toBe(true);
    const saved = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
    expect(saved.politicians.filter((politician) => politician.countryId === "US" && politician.chamberKey === "senate"))
      .toEqual(JSON.parse(JSON.stringify(senators)));
  });

  it("admits a source 1953 territory through the registered turn phase and saves the annual guard", () => {
    const year = 1953;
    const seed = seedWithAdmission("AK", year);
    const world = createWorld({ seed, playerName: "Tester", countryId: "US", era: "1953" });
    const alaska = world.regions.AK;

    expect(alaska).toMatchObject({ id: "AK", countryId: "US", houseSeats: 0, population: 128_643, gdp: 450 });
    expect(alaska?.admittedYear).toBeUndefined();

    advanceTurn(world);

    expect(world.statehood?.lastEvaluatedYear).toBe(year);
    expect(world.regions.AK).toMatchObject({ admittedYear: year, houseSeats: 1, senateClasses: [2, 3] });
    expect(world.news.some((item) => item.headline.includes("Alaska is admitted to the Union"))).toBe(true);
    expect(world.partyRegions["AK:US_DEM"]).toMatchObject({ organization: 22, registration: 32 });
    expect(world.partyRegions["AK:US_REP"]).toMatchObject({ organization: 22, registration: 30 });
    expect(world.electoratePools.AK).toMatchObject({ independent: 24, unregistered: 14 });
    expect(world.elections.some((race) => race.countryId === "US" && race.state === "AK" && race.electionType === "house")).toBe(true);
    expect(world.elections.some((race) => race.countryId === "US" && race.state === "AK" && race.electionType === "senate")).toBe(true);

    const save = serializeSave(world, "2026-10-02T00:00:00Z");
    expect(JSON.parse(save).schemaVersion).toBe(65);
    const resumed = deserializeSave(save);
    const previousNewsCount = resumed.news.filter((item) => item.headline.includes("admitted to the Union")).length;
    advanceTurn(resumed);

    expect(resumed.statehood?.lastEvaluatedYear).toBe(year);
    expect(resumed.regions.AK).toMatchObject({ admittedYear: year, houseSeats: 1 });
    expect(resumed.news.filter((item) => item.headline.includes("admitted to the Union"))).toHaveLength(previousNewsCount);
  });

  it("keeps the source starting-preset eligibility after the visible era advances", () => {
    const world = createWorld({ seed: "statehood-preset-drift", playerName: "Tester", countryId: "US", era: "1953" });
    world.meta.era = "1979";
    world.meta.date = "1970-01-01";
    world.statehood!.lastEvaluatedYear = 1969;
    processStatehoodAdmission(world);

    expect(world.statehood).toMatchObject({ startingPreset: "1953-default", lastEvaluatedYear: 1970 });
    expect(world.regions.AK).toMatchObject({ admittedYear: 1970, houseSeats: 1 });
    expect(world.regions.HI).toMatchObject({ admittedYear: 1970, houseSeats: 1 });
  });

  it("backfills an old 1953 territory save to the source starting preset", () => {
    const world = createWorld({ seed: "statehood-legacy-preset", playerName: "Tester", countryId: "US", era: "1953" });
    world.meta.era = "1979";
    const legacy = JSON.parse(serializeSave(world, "2026-10-02T00:00:00Z"));
    legacy.schemaVersion = 63;
    legacy.world.meta.schemaVersion = 63;
    delete legacy.world.statehood;

    const resumed = deserializeSave(JSON.stringify(legacy));
    expect(resumed.statehood?.startingPreset).toBe("1953-default");
  });
});
