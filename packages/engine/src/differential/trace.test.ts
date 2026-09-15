import { describe, expect, it } from "vitest";
import {
  compareDifferentialTraces,
  parseDifferentialTrace,
  serializeDifferentialTrace,
  type DifferentialTrace,
} from "../index.js";

function trace(engine: "ahdgame" | "native", overrides: Partial<DifferentialTrace> = {}): DifferentialTrace {
  return {
    schemaVersion: 1,
    engine: { kind: engine, revision: engine === "ahdgame" ? "game-pin" : "native-pin" },
    input: {
      fixtureId: "1953-US-turn-1",
      era: "1953",
      countryId: "US",
      source: { kind: engine === "ahdgame" ? "mongo" : "nativeSave", sha256: "abc123" },
    },
    adaptations: [],
    phases: [{
      index: 0,
      name: "resourceRefresh",
      rng: { before: [1, 2, 3, 4], after: [1, 2, 3, 4], draws: [] },
      observations: {
        resources: {
          before: { player: { actions: 3, funds: 90 } },
          mutations: [{ path: "player.actions", delta: 1 }, { path: "player.funds", delta: 10 }],
          after: { player: { actions: 4, funds: 100 } },
        },
        elections: [],
        budgets: { US: { balance: 5 } },
        policies: [],
        playerConsequences: { notifications: [] },
      },
    }],
    ...overrides,
  };
}

describe("#279 differential trace contract", () => {
  it("round-trips a JSON-safe trace in deterministic key order", () => {
    const source = trace("ahdgame");
    const one = serializeDifferentialTrace(source);
    const two = serializeDifferentialTrace(JSON.parse(one));

    expect(two).toBe(one);
    expect(parseDifferentialTrace(one)).toEqual(source);
  });

  it("rejects malformed, non-JSON, duplicate, and unordered phase traces", () => {
    expect(() => parseDifferentialTrace({ ...trace("native"), schemaVersion: 2 })).toThrow("schemaVersion");
    expect(() => parseDifferentialTrace({ ...trace("native"), phases: [
      trace("native").phases[0],
      { ...trace("native").phases[0], index: 0, name: "duplicate" },
    ] })).toThrow("strictly increasing");
    expect(() => parseDifferentialTrace({ ...trace("native"), phases: [
      { ...trace("native").phases[0], index: 1 },
      { ...trace("native").phases[0], index: 0 },
    ] })).toThrow("strictly increasing");
    expect(() => parseDifferentialTrace({ ...trace("native"), phases: [{
      ...trace("native").phases[0],
      observations: { ...trace("native").phases[0]!.observations, budgets: { bad: Number.NaN } },
    }] })).toThrow("JSON-safe");
  });

  it("reports the first divergent phase and exact field without hiding later differences", () => {
    const expected = trace("ahdgame");
    const actual = trace("native", { phases: [{
      ...trace("native").phases[0]!,
      observations: {
        ...trace("native").phases[0]!.observations,
        resources: {
          before: { player: { actions: 3, funds: 90 } },
          mutations: [{ path: "player.actions", delta: 0 }, { path: "player.funds", delta: 0 }],
          after: { player: { actions: 3, funds: 90 } },
        },
      },
    }] });

    expect(compareDifferentialTraces(expected, actual)).toEqual({
      equal: false,
      classification: "unexplained",
      phase: { index: 0, expectedName: "resourceRefresh", actualName: "resourceRefresh" },
      path: "observations.resources.after.player.actions",
      expected: 4,
      actual: 3,
    });
  });

  it("refuses to compare traces for different normalized inputs", () => {
    const actual = trace("native", { input: { ...trace("native").input, countryId: "UK" } });

    expect(compareDifferentialTraces(trace("ahdgame"), actual)).toMatchObject({
      equal: false,
      phase: null,
      path: "input.countryId",
      expected: "US",
      actual: "UK",
    });
  });

  it("applies only justified per-field numeric tolerance and never tolerates RNG or ids", () => {
    const expected = trace("ahdgame");
    const actual = trace("native", { phases: [{
      ...trace("native").phases[0]!,
      observations: {
        ...trace("native").phases[0]!.observations,
        budgets: { US: { balance: 5.0004 } },
      },
    }] });
    const rules = [{
      phase: "resourceRefresh",
      path: "observations.budgets.US.balance",
      absolute: 0.001,
      justification: "Measured platform rounding at the budget boundary.",
      evidence: "fixture budget-rounding-1 max delta 0.0004",
    }];

    expect(compareDifferentialTraces(expected, actual, rules)).toEqual({ equal: true });
    expect(() => compareDifferentialTraces(expected, actual, [{ ...rules[0], justification: "" }])).toThrow("justification");
    expect(() => compareDifferentialTraces(expected, actual, [{ ...rules[0], path: "rng.after.0" }])).toThrow("RNG or identity");
    expect(() => compareDifferentialTraces(expected, actual, [{ ...rules[0], path: "observations.elections.0.id" }])).toThrow("RNG or identity");
  });

  it("labels a declared Native adaptation separately without treating it as equality", () => {
    const expected = trace("ahdgame");
    const actual = trace("native", {
      adaptations: [{
        id: "native-offline-refresh",
        phase: "resourceRefresh",
        paths: ["observations.resources.after.player.actions"],
        rationale: "Native uses its documented offline turn clock.",
        source: "docs/ENGINE-ADAPTATIONS.md#offline-refresh",
      }],
      phases: [{
        ...trace("native").phases[0]!,
        observations: {
          ...trace("native").phases[0]!.observations,
          resources: {
            before: { player: { actions: 3, funds: 90 } },
            mutations: [{ path: "player.actions", delta: 0 }, { path: "player.funds", delta: 10 }],
            after: { player: { actions: 3, funds: 100 } },
          },
        },
      }],
    });

    expect(compareDifferentialTraces(expected, actual)).toMatchObject({
      equal: false,
      classification: "intentionalAdaptation",
      path: "observations.resources.after.player.actions",
      adaptation: { id: "native-offline-refresh" },
    });
  });
});
