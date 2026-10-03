import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { advanceUkCommonsRecallPetitions, evaluateUkRecallTrigger, resolveUkRecallSupport, type UkCommonsRecallPetition } from "./ukCommonsRecall.js";
import { ukCommonsVacancyWatcherPhase } from "../government/phases.js";
import { rngFromState } from "../rng.js";

function recallWorld(): ReturnType<typeof createWorld> {
  const world = createWorld({ seed: "commons-recall-test", playerName: "Recall Fixture", countryId: "UK", era: "1991" });
  world.player.countryId = "UK";
  world.player.legislativeSeat = { countryId: "UK", chamberKey: "commons", regionId: "NIR", seatsHeld: 3 };
  return world;
}

function openPetition(turn = 0): UkCommonsRecallPetition {
  return {
    id: "commons-recall:player:0", countryId: "UK", regionId: "NIR", officialId: "player", targetName: "Fixture MP",
    status: "open", trigger: "infamy", lowStreak: 0, lastEvaluatedTurn: turn, openedTurn: turn,
    signatures: [], declarations: [], supportSamples: [],
  };
}

describe("UK Commons recall rules and persisted actions", () => {
  it("matches the pinned source thresholds and strict removal tie rule", () => {
    expect(evaluateUkRecallTrigger(69, 25, 2)).toEqual({ lowStreak: 3 });
    expect(evaluateUkRecallTrigger(70, 80, 0)).toEqual({ trigger: "infamy", lowStreak: 0 });
    expect(evaluateUkRecallTrigger(0, 25, 3)).toEqual({ trigger: "lowApproval", lowStreak: 4 });
    expect(resolveUkRecallSupport(2, 0, 50)).toBe("retained");
    expect(resolveUkRecallSupport(3, 0, 50)).toBe("vacated");
  });

  it("authorizes one current UK-character signature and a switchable check declaration", () => {
    const world = recallWorld();
    const petition = openPetition();
    world.ukCommonsRecallPetitions = [petition];
    expect(executeAction(world, "player", "signCommonsRecallPetition", { petitionId: petition.id }).ok).toBe(true);
    expect(executeAction(world, "player", "signCommonsRecallPetition", { petitionId: petition.id }).ok).toBe(true);
    expect(petition.signatures).toEqual([{ actorId: "player", turn: 0 }]);
    petition.status = "check";
    petition.checkStartTurn = 1;
    petition.checkEndTurn = 7;
    expect(executeAction(world, "player", "declareCommonsRecall", { petitionId: petition.id, recallSide: "remove" }).ok).toBe(true);
    expect(executeAction(world, "player", "declareCommonsRecall", { petitionId: petition.id, recallSide: "retain" }).ok).toBe(true);
    expect(petition.declarations).toEqual([{ actorId: "player", side: "retain", turn: 0 }]);
    const nonUk = recallWorld();
    nonUk.player.countryId = "US";
    nonUk.ukCommonsRecallPetitions = [openPetition()];
    expect(executeAction(nonUk, "player", "signCommonsRecallPetition", { petitionId: petition.id }).ok).toBe(false);
  });

  it("samples once on ordinary watcher turns, expires naturally, and round-trips strict ledger state", () => {
    const world = recallWorld();
    const petition = openPetition(0);
    world.ukCommonsRecallPetitions = [petition];
    world.meta.turn = 1;
    ukCommonsVacancyWatcherPhase.run(world, rngFromState(world.meta.rng));
    ukCommonsVacancyWatcherPhase.run(world, rngFromState(world.meta.rng));
    expect(petition.signatures).toHaveLength(0);
    expect(petition.status).toBe("open");
    expect(petition.lastEvaluatedTurn).toBe(1);
    const persisted = deserializeSave(serializeSave(world, "commons-recall-test"));
    expect(persisted.ukCommonsRecallPetitions).toEqual(world.ukCommonsRecallPetitions);
    persisted.meta.turn = 12;
    ukCommonsVacancyWatcherPhase.run(persisted, rngFromState(persisted.meta.rng));
    expect(persisted.ukCommonsRecallPetitions?.[0]?.status).toBe("expired");
    const invalid = JSON.parse(serializeSave(world, "commons-recall-invalid"));
    invalid.world.ukCommonsRecallPetitions[0].unrecognized = true;
    expect(() => deserializeSave(JSON.stringify(invalid))).toThrow(/UK Commons recall petition/);
  });

  it("consumes a fixture-seeded five-signature petition and creates a weighted vacancy only after the source six-turn check", () => {
    const world = recallWorld();
    const petition = openPetition();
    // Synthetic signer identities are fixture inputs to the source consumer rule only;
    // they are not presented as reachable Singleplayer signatures.
    petition.signatures = Array.from({ length: 5 }, (_, index) => ({ actorId: `fixture-signer-${index}`, turn: 0 }));
    world.ukCommonsRecallPetitions = [petition];
    world.meta.turn = 1;
    advanceUkCommonsRecallPetitions(world);
    expect(petition.status).toBe("check");
    expect(petition.checkEndTurn).toBe(7);
    expect(petition.supportSamples).toEqual([{ turn: 1, favorability: world.player.favorability }]);
    petition.declarations.push({ actorId: "fixture-declaration", side: "remove", turn: 1 });
    world.player.favorability = 0;
    world.meta.turn = 7;
    advanceUkCommonsRecallPetitions(world);
    expect(petition.status).toBe("vacated");
    expect(world.player.legislativeSeat).toBeNull();
    expect(world.ukCommonsVacancies?.[0]).toMatchObject({ reason: "recall", regionId: "NIR", seats: 3, status: "open" });
  });
});
