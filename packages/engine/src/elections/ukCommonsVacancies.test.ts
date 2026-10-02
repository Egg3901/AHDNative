import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { runElectionResolution, runVoteAccumulation } from "./orchestration.js";
import { scheduleUkCommonsByElections } from "./ukCommonsVacancies.js";
import { seatHolders } from "./orchestration.js";

describe("UK Commons vacancy plumbing", () => {
  it("does not invent a held regional Commons office for an unelected player", () => {
    const world = createWorld({ seed: "commons-no-held-seat", playerName: "UK MP", countryId: "UK", era: "2019" });
    const result = executeAction(world, "player", "resignCommonsSeat", {});
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("do not hold a UK Commons seat");
    expect(world.ukCommonsVacancies).toBeUndefined();
  });

  it("schedules a grouped regional vacancy with the source carve and leaves other regional MPs seated", () => {
    const world = createWorld({ seed: "commons-regional-vacancy-reader", playerName: "UK MP", countryId: "UK", era: "2019" });
    const holder = world.politicians.find((politician) => politician.countryId === "UK" && politician.chamberKey === "commons")!;
    holder.electedState = "LON";
    world.ukCommonsVacancies = [
      { id: "vacancy-a", countryId: "UK", regionId: "LON", formerHolderId: "former-a", reason: "resignation", vacatedTurn: 0, status: "open" },
      { id: "vacancy-b", countryId: "UK", regionId: "LON", formerHolderId: "former-b", reason: "resignation", vacatedTurn: 0, status: "open" },
    ];

    scheduleUkCommonsByElections(world);

    const special = world.elections.find((election) => election.electionType === "special_commons");
    expect(special).toMatchObject({ countryId: "UK", state: "LON", totalSeats: 2, startTurn: world.meta.turn, primaryEndTurn: world.meta.turn + 24, endTurn: world.meta.turn + 48, byElectionCarve: expect.any(Number), vacancyIds: ["vacancy-a", "vacancy-b"] });
    expect(world.ukCommonsVacancies?.every((vacancy) => vacancy.status === "scheduled" && vacancy.electionId === special!.id)).toBe(true);
    expect(seatHolders(world, special!)).toEqual([]);
    expect(holder.chamberKey).toBe("commons");
    const restored = deserializeSave(serializeSave(world, "commons-regional-vacancy-reader"));
    expect(restored.ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
    expect(restored.elections.find((election) => election.id === special!.id)).toEqual(JSON.parse(JSON.stringify(special)));
  });

  it("carries a public LON candidate through real tally, resignation, special resolution, and save", () => {
    const world = createWorld({
      seed: "commons-public-player-office-probe",
      playerName: "UK MP",
      countryId: "UK",
      era: "2019",
      partyId: "UK_LAB",
      homeRegionId: "LON",
      policies: { economic: -2, social: -3 },
      wealth: "high",
      stats: { charisma: 10, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 3 },
    });
    advanceTurn(world);
    const regular = world.elections.find((election) => election.countryId === "UK" && election.electionType === "commons" && election.state === "LON");
    expect(regular).toBeDefined();
    expect(executeAction(world, "player", "declareCandidacy", { electionId: regular!.id }).ok).toBe(true);
    expect(executeAction(world, "player", "convertCash", { amount: world.player.cash }).ok).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(executeAction(world, "player", "advertise", {}).ok).toBe(true);
      if (i < 2) {
        advanceTurn(world);
        advanceTurn(world);
      }
    }
    regular!.primaryEndTurn = world.meta.turn;
    world.meta.turn = regular!.primaryEndTurn + 1;
    runVoteAccumulation(world, rngFromSeed("commons-public-player-office-tally"));
    world.meta.turn = regular!.endTurn;
    runElectionResolution(world);
    expect(world.player.legislativeSeat).toMatchObject({ countryId: "UK", chamberKey: "commons", regionId: "LON" });
    expect(executeAction(world, "player", "resignCommonsSeat", {}).ok).toBe(true);
    expect(world.ukCommonsVacancies).toMatchObject([expect.objectContaining({ regionId: "LON", formerHolderId: "player", status: "open" })]);

    advanceTurn(world);
    const special = world.elections.find((election) => election.countryId === "UK" && election.electionType === "special_commons" && election.state === "LON");
    expect(special, JSON.stringify({ turn: world.meta.turn, preIteration: world.meta.preIteration, vacancy: world.ukCommonsVacancies, ukRaces: world.elections.filter((election) => election.countryId === "UK" && election.state === "LON").map(({ electionType, status, startTurn, primaryEndTurn, endTurn, cycle }) => ({ electionType, status, startTurn, primaryEndTurn, endTurn, cycle })) })).toMatchObject({ totalSeats: 1, byElectionCarve: expect.any(Number), vacancyIds: [world.ukCommonsVacancies![0]!.id] });
    expect(executeAction(world, "player", "declareCandidacy", { electionId: special!.id }).ok).toBe(true);
    special!.primaryEndTurn = world.meta.turn;
    world.meta.turn = special!.primaryEndTurn + 1;
    runVoteAccumulation(world, rngFromSeed("commons-public-special-ballot"));
    special!.endTurn = world.meta.turn + 1;
    world.meta.turn = special!.endTurn;
    runElectionResolution(world);
    expect(special!.status).toBe("resolved");
    expect(world.ukCommonsVacancies).toMatchObject([expect.objectContaining({ status: "filled", filledById: "player" })]);
    expect(world.player.legislativeSeat).toMatchObject({ countryId: "UK", chamberKey: "commons", regionId: "LON" });
    const restored = deserializeSave(serializeSave(world, "commons-public-player-office-probe"));
    expect(restored.ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
    expect(restored.player.legislativeSeat).toEqual(world.player.legislativeSeat);
    expect(restored.elections.find((election) => election.id === special!.id)).toEqual(JSON.parse(JSON.stringify(special)));
  });
});
