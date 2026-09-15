import { describe, expect, it } from "vitest";
import {
  compareDifferentialTraces,
  parseDifferentialTrace,
  serializeDifferentialTrace,
  type DifferentialTrace,
  type DifferentialToleranceRule,
} from "../index.js";

function trace(engine: "ahdgame" | "native", overrides: Partial<DifferentialTrace> = {}): DifferentialTrace {
  return {
    schemaVersion: 1,
    engine: { kind: engine, revision: engine === "ahdgame" ? "game-pin" : "native-pin" },
    input: {
      fixtureId: "1953-US-turn-1",
      era: "1953",
      countryId: "US",
      canonicalInputSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      source: {
        kind: engine === "ahdgame" ? "mongo" : "nativeSave",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
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
  it("round-trips independently authored Game and Native source shapes in deterministic key order", () => {
    const gameFixture: DifferentialTrace = {
      schemaVersion: 1,
      engine: { kind: "ahdgame", revision: "game-pin" },
      input: {
        fixtureId: "mongo-1953-us",
        era: "1953",
        countryId: "US",
        seed: "shared-seed",
        canonicalInputSha256: "1111111111111111111111111111111111111111111111111111111111111111",
        source: { kind: "mongo", sha256: "2222222222222222222222222222222222222222222222222222222222222222" },
      },
      adaptations: [],
      phases: [{
        index: 0,
        name: "resourceRefresh",
        rng: { before: [1, 2], after: [3, 4], draws: [0.25] },
        observations: { resources: { actions: 4 }, elections: [], budgets: {}, policies: [], playerConsequences: {} },
      }],
    };
    const nativeFixture: DifferentialTrace = {
      schemaVersion: 1,
      engine: { kind: "native", revision: "native-pin" },
      input: {
        fixtureId: "native-save-1953-us",
        era: "1953",
        countryId: "US",
        seed: "shared-seed",
        canonicalInputSha256: "1111111111111111111111111111111111111111111111111111111111111111",
        source: { kind: "nativeSave", sha256: "3333333333333333333333333333333333333333333333333333333333333333" },
      },
      adaptations: [],
      phases: [{
        index: 0,
        name: "resourceRefresh",
        rng: { before: [1, 2], after: [3, 4], draws: [0.25] },
        observations: { budgets: {}, elections: [], playerConsequences: {}, policies: [], resources: { actions: 4 } },
      }],
    };
    const one = serializeDifferentialTrace(gameFixture);
    const two = serializeDifferentialTrace(JSON.parse(one));

    expect(two).toBe(one);
    expect(parseDifferentialTrace(one)).toEqual(gameFixture);
    expect(compareDifferentialTraces(gameFixture, nativeFixture)).toEqual({ equal: true });
  });

  it("rejects malformed, non-JSON, duplicate, and unordered phase traces", () => {
    expect(() => parseDifferentialTrace({ ...trace("native"), schemaVersion: 2 })).toThrow("schemaVersion");
    expect(() => parseDifferentialTrace({ ...trace("native"), input: { ...trace("native").input, seed: 42 } })).toThrow("input.seed");
    expect(() => parseDifferentialTrace({ ...trace("native"), input: { ...trace("native").input, canonicalInputSha256: "not-a-hash" } })).toThrow("canonicalInputSha256");
    expect(() => parseDifferentialTrace({ ...trace("native"), input: {
      ...trace("native").input,
      source: { ...trace("native").input.source, sha256: "not-a-hash" },
    } })).toThrow("source.sha256");
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
    expect(() => parseDifferentialTrace({ ...trace("native"), phases: [{
      ...trace("native").phases[0],
      silentlyIgnoredLaterField: {},
    }] })).toThrow("unexpected field");
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
    const actual = trace("native", { input: {
      ...trace("native").input,
      canonicalInputSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    } });

    expect(compareDifferentialTraces(trace("ahdgame"), actual)).toMatchObject({
      equal: false,
      phase: null,
      path: "input.canonicalInputSha256",
      expected: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      actual: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });
  });

  it("refuses Native self-comparison as authority evidence", () => {
    expect(() => compareDifferentialTraces(trace("native"), trace("native")))
      .toThrow("authoritative AHDGame trace");
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
    const rule: DifferentialToleranceRule = {
      phase: "resourceRefresh",
      path: "observations.budgets.US.balance",
      absolute: 0.001,
      justification: "Measured platform rounding at the budget boundary.",
      evidence: "fixture budget-rounding-1 max delta 0.0004",
    };
    const rules: DifferentialToleranceRule[] = [rule];

    expect(compareDifferentialTraces(expected, actual, rules)).toEqual({ equal: true });
    expect(() => compareDifferentialTraces(expected, actual, [{ ...rule, justification: "" }])).toThrow("justification");
    expect(() => compareDifferentialTraces(expected, actual, [{ ...rule, path: "rng.after.0" }])).toThrow("RNG or identity");
    expect(() => compareDifferentialTraces(expected, actual, [{ ...rule, path: "observations.elections.0.id" }])).toThrow("RNG or identity");
    for (const identifier of [
      "candidateId",
      "characterId",
      "billIds",
      "nomineeID",
      "referendumId",
      "userId",
      "external_id",
      "coalition_IDS",
    ]) {
      expect(() => compareDifferentialTraces(expected, actual, [{
        ...rule,
        path: `observations.elections.0.${identifier}`,
      }])).toThrow("RNG or identity");
    }
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
