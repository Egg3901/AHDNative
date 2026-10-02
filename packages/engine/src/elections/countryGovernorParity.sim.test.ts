import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { cycleContextForWorld, electionSeriesForWorld } from "./orchestration.js";
import { getCycleAnchors } from "../electionEngine/resolution/cycleAnchorContext.js";
import { getUkCommonsSeats } from "../electionEngine/resolution/constants.js";
import { executeAction } from "../actions/execute.js";
import { rngFromSeed } from "../rng.js";
import { runVoteAccumulation } from "./orchestration.js";
import { applyUKDevolutionPolicy, initialUKDevolutionState } from "../devolution/ukInstitutions.js";

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
        // Verify the real UK regional demographic tally path, then use a
        // deterministic fixture tally to make the downstream winner and seat
        // assertions stable across unrelated vote-model changes.
        world.meta.turn = races[0]!.primaryEndTurn + 1;
        runVoteAccumulation(world, rngFromSeed("uk-commons-real-tally"));
        expect(races.every((race) => Object.values(race.tally).some((votes) => votes > 0))).toBe(true);
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

  it("matches source RU/DD beta-or-NPP election liveness against pack status", () => {
    const playable = createWorld({ seed: "ru-dd-gate-playable", playerName: "Tester", countryId: "US", era: "1953" });
    playable.nppAutonomyLevel = "off";
    // The 1953/1979 Native packs explicitly mark RU and DD playable; that
    // maps to source beta/active and remains live even with global NPP off.
    expect(playable.countries.RU?.playable).toBe(true);
    expect(playable.countries.DD?.playable).toBe(true);
    expect(electionSeriesForWorld(playable).some((spec) => spec.countryId === "RU")).toBe(true);
    expect(electionSeriesForWorld(playable).some((spec) => spec.countryId === "DD")).toBe(true);

    // For an authored non-playable country, Native preserves the source
    // coming-soon gate and only runs it when NPP governance is at least v1.
    const comingSoon = {
      ...playable,
      countries: {
        ...playable.countries,
        RU: { ...playable.countries.RU!, playable: false },
        DD: { ...playable.countries.DD!, playable: false },
      },
    };
    expect(electionSeriesForWorld(comingSoon).some((spec) => spec.countryId === "RU" || spec.countryId === "DD")).toBe(false);
    const nppGoverned = { ...comingSoon, nppAutonomyLevel: "v1" as const };
    expect(electionSeriesForWorld(nppGoverned).some((spec) => spec.countryId === "RU")).toBe(true);
    expect(electionSeriesForWorld(nppGoverned).some((spec) => spec.countryId === "DD")).toBe(true);
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

  it("applies UK devolution settlement through the public bill action and ordinary turn", () => {
    const world = createWorld({ seed: "uk-devolution-policy", playerName: "Prime Minister", countryId: "UK", era: "2019", mode: "hos" });
    world.player.nationalInfluence = 50;
    advanceTurn(world);
    const initialRace = world.elections.find((election) => election.countryId === "UK" && election.electionType === "governor" && election.state === "SCO");
    expect(initialRace?.status).toBe("active");
    world.governors.SCO!.governorId = initialRace!.candidates[0]!.id;

    const abolition = executeAction(world, "player", "sponsorBill", {
      catalogId: "uk_devolution_local_powers",
      policyOptionId: "l6",
    });
    expect(abolition.ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({ status: "signed", enactedLevel: 6 });
    advanceTurn(world);
    expect(world.ukDevolution?.regions.SCO?.active).toBe(false);
    expect(world.governors.SCO?.governorId).toBeNull();
    expect(world.elections.find((election) => election.id === initialRace!.id)?.status).toBe("cancelled");

    const restoration = executeAction(world, "player", "sponsorBill", {
      catalogId: "uk_devolution_local_powers",
      policyOptionId: "l1",
    });
    expect(restoration.ok).toBe(true);
    const enactmentTurn = world.meta.turn;
    advanceTurn(world);
    expect(world.ukDevolution?.regions.SCO).toEqual({ active: true, firstCycle: 1, firstElectionEndTurn: enactmentTurn + 72 });
    expect(electionSeriesForWorld(world).find((spec) => spec.countryId === "UK" && spec.electionType === "governor" && spec.state === "SCO")).toMatchObject({
      firstCycle: 1,
      customCycle1EndTurn: enactmentTurn + 72,
    });
    const restoredRace = world.elections.find(
      (election) => election.countryId === "UK" && election.electionType === "governor" && election.state === "SCO" && election.status === "active",
    );
    expect(restoredRace, JSON.stringify({ turn: world.meta.turn, preIteration: world.meta.preIteration, rows: world.elections.filter((election) => election.countryId === "UK" && election.state === "SCO" && election.electionType === "governor").map(({ id, cycle, status, startTurn, endTurn }) => ({ id, cycle, status, startTurn, endTurn })), spec: electionSeriesForWorld(world).find((spec) => spec.countryId === "UK" && spec.electionType === "governor" && spec.state === "SCO") })).toBeDefined();
    expect(restoredRace!.id).not.toBe(initialRace!.id);
    expect(restoredRace!.cycle).toBe(1);
    expect(restoredRace!.endTurn).toBe(enactmentTurn + 72);

    const saved = deserializeSave(serializeSave(world, "uk-devolution-policy"));
    expect(saved.ukDevolution).toEqual(JSON.parse(JSON.stringify(world.ukDevolution)));
    expect(saved.elections.find((election) => election.id === restoredRace!.id)).toEqual(JSON.parse(JSON.stringify(restoredRace)));
  });

  it("keeps the source Northern Ireland peace gate distinct from general devolution policy", () => {
    const base = initialUKDevolutionState(1991);
    base.northernIrelandPeace = { posture: "unsettled", changedTurn: 12 };
    const blocked = applyUKDevolutionPolicy(base, { billId: "uk-policy-1", optionIndex: 1, enactedTurn: 20 }, {}, 72);
    expect(blocked.regions.SCO.active).toBe(true);
    expect(blocked.regions.NIR.active).toBe(false);
    expect(blocked.northernIrelandPeace).toEqual(base.northernIrelandPeace);

    const sharing = { ...base, northernIrelandPeace: { posture: "power_sharing" as const, changedTurn: 30 } };
    const restored = applyUKDevolutionPolicy(sharing, { billId: "uk-policy-2", optionIndex: 1, enactedTurn: 31 }, {}, 72);
    expect(restored.regions.NIR).toEqual({ active: true, firstCycle: 1, firstElectionEndTurn: 103 });
    expect(restored.northernIrelandPeace).toEqual(sharing.northernIrelandPeace);
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
