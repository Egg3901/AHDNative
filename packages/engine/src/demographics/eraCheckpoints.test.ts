import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { dateForTurn } from "../calendar.js";
import { deserializeSave, serializeSave } from "../save.js";
import { sourceElectionClockForWorld } from "../elections/sourceElectionClock.js";
import { processEraCheckpointsTurn } from "./eraCheckpoints.js";
import { TURN_PHASES } from "../phases/registry.js";

function seedAtNativeTurn(turn: number) {
  const world = createWorld({ seed: "source-era-checkpoint-road", playerName: "Ada", countryId: "US", era: "1953", homeRegionId: "NY" });
  world.meta.turn = turn;
  world.meta.date = dateForTurn(turn);
  // Source's documented missing/undecided trigger branch falls back to the
  // checkpoint's authored turn. This fixture isolates that source branch.
  world.docketCases = [];
  return world;
}

describe("source US era-checkpoint producer and saved Layer-1 consumer", () => {
  it("matches the source fallback and first-turn bucket deltas", () => {
    const world = seedAtNativeTurn(192);
    expect(sourceElectionClockForWorld(world)).toEqual({ startingYear: 1953, calendarTurn: 193, currentYear: 1957 });
    expect(processEraCheckpointsTurn(world)).toEqual({ checkpointsActive: 1, statesUpdated: 50 });
    expect(world.baselineDemographics.NY!.layer1PositionOverrides).toMatchObject({
      race: { black: { economicLean: -1 / 192, socialLean: -0.5 / 192 } },
      education: { no_college: { economicLean: -0.75 / 192 } },
      wealth: { middle: { economicLean: 0.6 / 192 } },
    });
    expect(world.baselineDemographics.NY!.layer1TurnoutOverrides).toEqual({ race: { black: 5 / 192 } });
  });

  it("uses the affirmed docket decision turn and falls back after divergence", () => {
    const affirmed = seedAtNativeTurn(54);
    affirmed.docketCases = [{
      id: "brown", countryId: "US", caseKey: "brown-v-board-1954", title: "Brown v. Board", axis: "social",
      historicalMajorityDirection: 1, decisionYear: 1954, status: "decided", outcome: "affirmed", decidedAtTurn: 54,
    }];
    expect(sourceElectionClockForWorld(affirmed)?.calendarTurn).toBe(55);
    expect(processEraCheckpointsTurn(affirmed).checkpointsActive).toBe(1);
    expect(affirmed.baselineDemographics.AL!.layer1PositionOverrides?.race?.white?.economicLean).toBeCloseTo(6.8 / 720, 12);

    const diverged = seedAtNativeTurn(54);
    diverged.docketCases = [{
      id: "brown", countryId: "US", caseKey: "brown-v-board-1954", title: "Brown v. Board", axis: "social",
      historicalMajorityDirection: 1, decisionYear: 1954, status: "decided", outcome: "diverged", decidedAtTurn: 54,
    }];
    expect(processEraCheckpointsTurn(diverged).checkpointsActive).toBe(0);
    diverged.meta.turn = 576;
    expect(sourceElectionClockForWorld(diverged)?.calendarTurn).toBe(577);
    expect(processEraCheckpointsTurn(diverged).checkpointsActive).toBeGreaterThan(0);
  });

  it("nets supported active legislation against opposing source checkpoint pull", () => {
    const world = seedAtNativeTurn(192);
    world.policyLedger["test-counter-policy"] = {
      id: "test-counter-policy", legislationTypeId: "test-counter", policyOptionId: "test",
      effectDirection: 1, scope: "national", countryId: "US", enactedTurn: 0, enactedAt: world.meta.date,
    };
    const lookup = (id: string) => id === "test-counter"
      ? { demographicEffects: [{ groupId: "rural_traditionalists", target: "economicLean" as const, direction: 1 as const, magnitude: 1 }] }
      : null;
    processEraCheckpointsTurn(world, lookup);
    const expected = -0.75 / 192 + (0.5 * 0.035 / 50);
    expect(world.baselineDemographics.NY!.layer1PositionOverrides?.education?.no_college?.economicLean).toBeCloseTo(expected, 12);
  });

  it("runs after the public SCOTUS phase and continues the source 48-turn overlay across save/reload", () => {
    const names = TURN_PHASES.map((phase) => phase.name);
    expect(names.indexOf("eraCheckpoints")).toBeGreaterThan(names.indexOf("scotusTurn"));
    const world = seedAtNativeTurn(191);
    advanceTurn(world);
    expect(world.meta.turn).toBe(192);
    expect(sourceElectionClockForWorld(world)?.calendarTurn).toBe(193);
    const first = world.baselineDemographics.NY!.layer1PositionOverrides?.education?.no_college?.economicLean;
    expect(first).toBeCloseTo(-0.75 / 192, 12);
    expect(world.baselineDemographics.NY!.layer1TurnoutOverrides?.race?.black).toBeCloseTo(5 / 192, 12);

    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(loaded.baselineDemographics.NY!.layer1PositionOverrides).toEqual(world.baselineDemographics.NY!.layer1PositionOverrides);
    advanceTurn(loaded);
    expect(sourceElectionClockForWorld(loaded)?.calendarTurn).toBe(194);
    expect(loaded.baselineDemographics.NY!.layer1PositionOverrides?.education?.no_college?.economicLean).toBeCloseTo(2 * (-0.75 / 192), 12);
    expect(loaded.baselineDemographics.NY!.layer1TurnoutOverrides?.race?.black).toBeCloseTo(2 * (5 / 192), 12);
  }, 180_000);

  it("resolves a source-year SCOTUS trigger and starts its checkpoint on the same current-source turn", () => {
    const world = seedAtNativeTurn(47);
    world.docketCases = [{
      id: "brown-source-clock", countryId: "US", caseKey: "brown-v-board-1954", title: "Brown v. Board",
      axis: "social", historicalMajorityDirection: 1, historicalOutcomeLocked: true, decisionYear: 1954,
      status: "pending",
    }];
    advanceTurn(world);
    expect(sourceElectionClockForWorld(world)?.calendarTurn).toBe(49);
    expect(world.docketCases[0]).toMatchObject({ status: "decided", outcome: "affirmed", decidedAtTurn: 48 });
    expect(world.baselineDemographics.AL!.layer1PositionOverrides?.race?.white?.economicLean).toBeCloseTo(6.8 / 720, 12);
  }, 180_000);

  it("keeps legacy absence untouched and does not run checkpoints without the source 1953 clock", () => {
    const world = createWorld({ seed: "source-era-checkpoint-legacy", playerName: "Ada", countryId: "US", era: "1953", homeRegionId: "NY" });
    world.meta.turn = 192;
    delete world.meta.startingYear;
    expect(processEraCheckpointsTurn(world)).toEqual({ checkpointsActive: 0, statesUpdated: 0 });
    expect(world.baselineDemographics.NY!.layer1PositionOverrides).toBeUndefined();
  });
});
