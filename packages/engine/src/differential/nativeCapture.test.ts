import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  advanceTurn,
  captureNativeTurnTrace,
  compareDifferentialTraces,
  createWorld,
  deserializeSave,
  MAX_NATIVE_TRACE_DRAWS_PER_PHASE,
  parseDifferentialTrace,
  rngFromState,
  serializeDifferentialTrace,
  serializeSave,
  type RngState,
} from "../index.js";
import { AHDGAME_TRACE_FIXTURES } from "./authoritativeTraceFixtures.js";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const NATIVE_REVISION = "native-test-revision";

function fixture(file: string) {
  const path = fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url));
  return parseDifferentialTrace(readFileSync(path, "utf8"));
}

function worldFor(era: string, countryId: string, seed: string) {
  return createWorld({ seed, playerName: "Trace", countryId, era });
}

interface TraceMutation {
  path: string;
  before: unknown;
  after: unknown;
  presence?: { before: boolean; after: boolean };
}

function domainMutations(phase: { observations: Record<string, unknown> }, domain: string): TraceMutation[] {
  return (phase.observations[domain] as { mutations: TraceMutation[] }).mutations;
}

interface ObservedRng {
  status: string;
  stream: string;
  state: RngState;
}

describe("#281 Native turn trace capture through public advanceTurn", () => {
  const authority = fixture(AHDGAME_TRACE_FIXTURES[0].file);
  const { era, countryId, seed } = authority.input;
  const options = { fixtureId: "native-1953-US-turn-1", era, revision: NATIVE_REVISION, savedAt: "2026-01-01T00:00:00.000Z", sha256 };

  it("captures a schema-valid Native trace without changing the turn outcome", () => {
    const plain = worldFor(era, countryId, seed!);
    const captured = worldFor(era, countryId, seed!);
    const initialSave = serializeSave(captured, options.savedAt);
    const plainReport = advanceTurn(plain);
    const { trace, report } = captureNativeTurnTrace(captured, options);

    expect(report).toEqual(plainReport);
    expect(serializeSave(captured, "fixed")).toBe(serializeSave(plain, "fixed"));
    expect(parseDifferentialTrace(trace)).toEqual(trace);
    expect(trace.engine).toEqual({ kind: "native", revision: NATIVE_REVISION });
    expect(trace.input).toMatchObject({ fixtureId: options.fixtureId, era, countryId, seed });
    expect(trace.input.source.kind).toBe("nativeSave");
    expect(trace.input.source.sha256).toBe(sha256(initialSave));
    expect(deserializeSave(initialSave)).toBeTruthy();
    expect(trace.adaptations).toEqual([]);
    expect(trace.phases.map((phase) => phase.name)).toEqual(plainReport.phaseTimings.map((phase) => phase.name));
    expect(trace.phases.map((phase) => phase.index)).toEqual(trace.phases.map((_, index) => index));
  });

  it("records observed shared-stream RNG states and the exact draws between them", () => {
    const world = worldFor(era, countryId, seed!);
    const initialRng = [...world.meta.rng];
    const { trace } = captureNativeTurnTrace(world, options);
    let previous: RngState = initialRng as RngState;
    let totalDraws = 0;
    for (const phase of trace.phases) {
      const before = phase.rng.before as unknown as ObservedRng;
      const after = phase.rng.after as unknown as ObservedRng & { unobservedStreams: unknown };
      expect(before).toMatchObject({ status: "observed", stream: "advanceTurn.shared", state: previous });
      expect(after).toMatchObject({ status: "observed", stream: "advanceTurn.shared" });
      expect(after.unobservedStreams).toBeTruthy();
      const replay = rngFromState(before.state);
      const draws = phase.rng.draws.map(() => replay.next());
      expect(phase.rng.draws).toEqual(draws);
      expect(replay.state()).toEqual(after.state);
      totalDraws += draws.length;
      previous = after.state;
    }
    expect(previous).toEqual(world.meta.rng);
    expect(totalDraws).toBeGreaterThan(0);
  });

  it("records per-phase domain mutations that agree with independently observed world state", () => {
    const before = worldFor(era, countryId, seed!);
    const world = structuredClone(before);
    const { trace } = captureNativeTurnTrace(world, options);
    const ids = before.politicians.filter((p) => p.countryId === countryId).map((p) => p.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const initialFunds = new Map(before.politicians.map((p) => [p.id, p.funds]));
    const finalFunds = new Map(world.politicians.map((p) => [p.id, p.funds]));
    const fundMutations = trace.phases.flatMap((phase) => (
      (phase.observations.resources as { mutations: Array<{ path: string; before: unknown; after: unknown }> }).mutations
    )).filter((mutation) => mutation.path.endsWith(".funds"));
    expect(fundMutations.length).toBeGreaterThan(0);
    const changed = ids.filter((id) => initialFunds.get(id) !== finalFunds.get(id));
    expect(changed.length).toBeGreaterThan(0);
    for (const id of changed) {
      const path = `politicians.${ids.indexOf(id)}.funds`;
      const forPath = fundMutations.filter((mutation) => mutation.path === path);
      expect(forPath[0]?.before).toBe(initialFunds.get(id));
      expect(forPath.at(-1)?.after).toBe(finalFunds.get(id));
    }
    for (const phase of trace.phases) {
      for (const domain of Object.values(phase.observations)) {
        expect(Object.keys(domain as object)).toEqual(["mutations"]);
      }
    }
  });

  it("observes the human player's cash, funds and actions in the resources domain", () => {
    const world = worldFor(era, countryId, seed!);
    world.player.actions = 0;
    const { trace } = captureNativeTurnTrace(world, options);
    const actionMutations = trace.phases.flatMap((phase) => (
      domainMutations(phase, "resources").map((mutation) => ({ phase: phase.name, ...mutation }))
    )).filter((mutation) => mutation.path === "player.actions");
    expect(world.player.actions).toBeGreaterThan(0);
    expect(actionMutations[0]).toMatchObject({ before: 0 });
    expect(actionMutations.at(-1)?.after).toBe(world.player.actions);
    const playerPaths = trace.phases.flatMap((phase) => domainMutations(phase, "resources"))
      .map((mutation) => mutation.path).filter((path) => path.startsWith("player."));
    expect(new Set(playerPaths)).toContain("player.actions");
  });

  it("records a field that disappears while holding null as a presence transition, not an empty diff", () => {
    const world = worldFor(era, countryId, seed!);
    const budget = world.budgets[countryId]!;
    const rates = budget.taxRates as unknown as Record<string, unknown>;
    const key = Object.keys(rates).find((name) => typeof rates[name] === "number")!;
    (budget as unknown as { taxRatePhaseIn: Record<string, null> }).taxRatePhaseIn = { [key]: null };
    world.pendingFiscalDirectives = [
      { id: "trace-null-presence", countryId, kind: "tax", field: key, value: rates[key] as number, proposedTurn: 0 },
    ];
    const { trace } = captureNativeTurnTrace(world, options);
    const phase = trace.phases.find((candidate) => candidate.name === "fiscalDirectives")!;
    expect(domainMutations(phase, "budgets")).toContainEqual({
      path: `federal.0.taxRatePhaseIn.${key}`,
      before: null,
      after: null,
      presence: { before: true, after: false },
    });
    expect(parseDifferentialTrace(serializeDifferentialTrace(trace))).toEqual(trace);
  });

  it("fails closed before allocating draws when a phase exceeds the documented draw bound", () => {
    expect(MAX_NATIVE_TRACE_DRAWS_PER_PHASE).toBe(1_000_000);
    const world = worldFor(era, countryId, seed!);
    expect(() => captureNativeTurnTrace(world, { ...options, maxDrawsPerPhase: 1 }))
      .toThrow(/draws in phase .+ exceed the capture bound of 1/);
    const fresh = worldFor(era, countryId, seed!);
    expect(() => captureNativeTurnTrace(fresh, { ...options, maxDrawsPerPhase: 0 }))
      .toThrow(/maxDrawsPerPhase/);
  });

  it("produces the identical trace after a save and reload of the input world", () => {
    const original = worldFor(era, countryId, seed!);
    const reloaded = deserializeSave(serializeSave(original, options.savedAt));
    const a = captureNativeTurnTrace(original, options).trace;
    const b = captureNativeTurnTrace(reloaded, options).trace;
    expect(serializeDifferentialTrace(b)).toBe(serializeDifferentialTrace(a));
    expect(compareDifferentialTraces(authority, b)).toEqual(compareDifferentialTraces(authority, a));
  });

  it("fails closed at the input boundary against authoritative AHDGame traces until normalized inputs align", () => {
    for (const descriptor of AHDGAME_TRACE_FIXTURES) {
      const expected = fixture(descriptor.file);
      const world = worldFor(expected.input.era, expected.input.countryId, expected.input.seed!);
      const { trace } = captureNativeTurnTrace(world, { ...options, era: expected.input.era, fixtureId: `native-${expected.input.fixtureId}` });
      expect(compareDifferentialTraces(expected, trace)).toMatchObject({
        equal: false,
        classification: "unexplained",
        phase: null,
        path: "input.canonicalInputSha256",
      });
    }
  });
});
