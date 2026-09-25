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

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

interface ObservedRng {
  status: string;
  stream: string;
  state: RngState;
}

describe("#281 Native turn trace capture through public advanceTurn", () => {
  const authority = fixture(AHDGAME_TRACE_FIXTURES[0].file);
  const { era, countryId, seed } = authority.input;
  const options = { fixtureId: "native-1953-US-turn-1", era, revision: NATIVE_REVISION, sha256 };

  it("captures a schema-valid Native trace without changing the turn outcome", () => {
    const plain = worldFor(era, countryId, seed!);
    const captured = worldFor(era, countryId, seed!);
    const initialSaveWorld = JSON.parse(serializeSave(captured, "fixed")).world;
    const plainReport = advanceTurn(plain);
    const { trace, report } = captureNativeTurnTrace(captured, options);

    expect(report).toEqual(plainReport);
    expect(serializeSave(captured, "fixed")).toBe(serializeSave(plain, "fixed"));
    expect(parseDifferentialTrace(trace)).toEqual(trace);
    expect(trace.engine).toEqual({ kind: "native", revision: NATIVE_REVISION });
    expect(trace.input).toMatchObject({ fixtureId: options.fixtureId, era, countryId, seed });
    expect(trace.input.source.kind).toBe("nativeSave");
    expect(trace.input.source.sha256).toBe(sha256(JSON.stringify(sortedKeys(initialSaveWorld))));
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
      const path = `${ids.indexOf(id)}.funds`;
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

  it("produces the identical trace after a save and reload of the input world", () => {
    const original = worldFor(era, countryId, seed!);
    const reloaded = deserializeSave(serializeSave(original, "before-reload"));
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
