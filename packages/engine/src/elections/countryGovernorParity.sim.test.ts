import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { cycleContextForWorld, electionSeriesForWorld } from "./orchestration.js";
import { getCycleAnchors } from "../electionEngine/resolution/cycleAnchorContext.js";
import { getUkCommonsSeats } from "../electionEngine/resolution/constants.js";

describe("source country governor election families", () => {
  it("spawns source-sized UK Commons races per region and preserves them through save/reload", () => {
    for (const era of ["1953", "1979", "1991", "2019"] as const) {
      const world = createWorld({ seed: `uk-commons-${era}`, playerName: "Tester", countryId: "UK", era });
      const seats = getUkCommonsSeats(`${era}-default`);
      const specs = electionSeriesForWorld(world).filter((spec) => spec.countryId === "UK" && spec.electionType === "commons");
      expect(specs.map((spec) => [spec.state, spec.totalSeats]).sort()).toEqual(Object.entries(seats).sort());
      expect(specs.reduce((sum, spec) => sum + spec.totalSeats, 0)).toBe(era === "1953" ? 625 : 650);
      advanceTurn(world);
      const races = world.elections.filter((election) => election.countryId === "UK" && election.electionType === "commons");
      expect(races).toHaveLength(12);
      expect(races.every((race) => race.state && race.totalSeats === seats[race.state])).toBe(true);
      expect(races.some((race) => race.state === undefined)).toBe(false);
      if (era === "1953") {
        for (const race of races) {
          race.tally = Object.fromEntries(race.candidates.map((candidate, index) => [candidate.id, index === 0 ? 100 : 10]));
        }
        world.meta.turn = races[0]!.endTurn - 1;
        advanceTurn(world);
        const resolved = world.elections.filter((election) => election.countryId === "UK" && election.electionType === "commons" && election.status === "resolved");
        expect(resolved).toHaveLength(12);
        expect(resolved.reduce((sum, race) => sum + race.totalSeats, 0)).toBe(625);
        expect(world.politicians.filter((politician) => politician.countryId === "UK" && politician.chamberKey === "commons" && politician.electedState !== undefined).length).toBeGreaterThan(0);
        const restored = deserializeSave(serializeSave(world, `uk-commons-${era}`));
        for (const race of resolved) {
          expect(restored.elections.find((saved) => saved.id === race.id)).toEqual(JSON.parse(JSON.stringify(race)));
        }
        expect(restored.politicians.filter((politician) => politician.countryId === "UK" && politician.chamberKey === "commons" && politician.electedState !== undefined)).toEqual(
          JSON.parse(JSON.stringify(world.politicians.filter((politician) => politician.countryId === "UK" && politician.chamberKey === "commons" && politician.electedState !== undefined))),
        );
      } else {
        const restored = deserializeSave(serializeSave(world, `uk-commons-${era}`));
        expect(restored.elections.filter((election) => election.countryId === "UK" && election.electionType === "commons")).toEqual(JSON.parse(JSON.stringify(races)));
      }
    }
  });

  it("spawns only the source-initialized UK devolved executives and persists their result", () => {
    const world = createWorld({ seed: "uk-executives", playerName: "Tester", countryId: "UK", era: "2019" });
    const endTurn = getCycleAnchors(cycleContextForWorld(world)).governorStateSenate;

    advanceTurn(world);
    const initialRaces = world.elections.filter((election) => election.countryId === "UK" && election.electionType === "governor");
    expect(initialRaces.map((election) => election.state).sort()).toEqual(["LON", "NIR", "SCO", "WAL"]);
    for (const race of initialRaces) {
      expect(race.endTurn).toBe(endTurn);
      race.tally = Object.fromEntries(race.candidates.map((candidate, index) => [candidate.id, index === 0 ? 100 : 10]));
    }

    world.meta.turn = endTurn - 1;
    advanceTurn(world);
    const resolved = world.elections.filter(
      (election) => election.countryId === "UK" && election.electionType === "governor" && election.status === "resolved",
    );
    expect(resolved.map((election) => election.state).sort()).toEqual(["LON", "NIR", "SCO", "WAL"]);
    for (const race of resolved) expect(world.governors[race.state!]!.governorId).toBe(race.winners[0]);

    const restored = deserializeSave(serializeSave(world, "uk-executive-parity"));
    for (const race of resolved) {
      expect(restored.elections.find((saved) => saved.id === race.id)).toEqual(JSON.parse(JSON.stringify(race)));
      expect(restored.governors[race.state!]!.governorId).toBe(world.governors[race.state!]!.governorId);
    }
  });

  it("runs and persists RU and DD First Secretary elections through the normal turn loop", () => {
    const world = createWorld({ seed: "country-governors", playerName: "Tester", countryId: "US", era: "1953" });
    const commonsAnchor = getCycleAnchors(cycleContextForWorld(world)).ukCommons;
    const ukCouncilSeries = electionSeriesForWorld(world).filter(
      (spec) => spec.countryId === "UK" && spec.electionType === "regionalCouncil",
    );
    expect(ukCouncilSeries.find((spec) => spec.state === "SCO")?.customCycle1EndTurn).toBe(commonsAnchor + 48);
    expect(ukCouncilSeries.find((spec) => spec.state === "NIR")?.customCycle1EndTurn).toBe(commonsAnchor + 96);
    expect(ukCouncilSeries.find((spec) => spec.state === "EMI")?.customCycle1EndTurn).toBe(commonsAnchor + 240);
    expect(electionSeriesForWorld({ ...world, meta: { ...world.meta, era: "1953" } }).some(
      (spec) => spec.countryId === "UK" && spec.electionType === "governor",
    )).toBe(false);

    // The first real turn spawns the cycle-1 races. Jump the deterministic
    // fixture clock to the source end-turn boundary instead of simulating
    // decades of unrelated country systems. Seed the preceding accumulated
    // ballots as an in-flight save would contain when reloaded on that edge.
    advanceTurn(world);
    expect(world.elections.find((election) => election.id === "regionalCouncil:UK:SCO:c1")?.endTurn).toBe(commonsAnchor + 48);
    expect(world.elections.find((election) => election.id === "regionalCouncil:UK:NIR:c1")?.endTurn).toBe(commonsAnchor + 96);
    expect(world.elections.find((election) => election.id === "regionalCouncil:UK:EMI:c1")?.endTurn).toBe(commonsAnchor + 240);
    for (const election of world.elections) {
      if ((election.countryId === "RU" || election.countryId === "DD") && election.electionType === "governor") {
        election.tally = Object.fromEntries(election.candidates.map((candidate, index) => [candidate.id, index === 0 ? 100 : 10]));
      }
    }
    world.meta.turn = 143;
    advanceTurn(world);

    for (const countryId of ["RU", "DD"] as const) {
      expect(Object.values(world.governors).some((office) => office.countryId === countryId), `${countryId} has seeded offices`).toBe(true);
      const race = world.elections.find(
        (election) => election.countryId === countryId && election.electionType === "governor" && election.status === "resolved",
      );
      expect(
        race,
        `${countryId} should resolve its first regional executive race; observed ${JSON.stringify(world.elections.filter((election) => election.countryId === countryId && election.electionType === "governor").map(({ id, state, cycle, status, startTurn, endTurn }) => ({ id, state, cycle, status, startTurn, endTurn })))}`,
      ).toBeDefined();
      expect(race!.state).toBeTruthy();
      expect(race!.winners).toHaveLength(1);
      expect(world.governors[race!.state!]!.governorId).toBe(race!.winners[0]);
    }

    const restored = deserializeSave(serializeSave(world, "country-governor-parity"));
    for (const countryId of ["RU", "DD"] as const) {
      const race = world.elections.find(
        (election) => election.countryId === countryId && election.electionType === "governor" && election.status === "resolved",
      )!;
      expect(restored.elections.find((saved) => saved.id === race.id)).toEqual(JSON.parse(JSON.stringify(race)));
      expect(restored.governors[race.state!]!.governorId).toBe(world.governors[race.state!]!.governorId);
    }
  });
});
