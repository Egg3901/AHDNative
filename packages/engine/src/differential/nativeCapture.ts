import { advanceTurn } from "../engine.js";
import type { TurnReport } from "../phases/types.js";
import { rngFromState, type RngState } from "../rng.js";
import { serializeSave } from "../save.js";
import type { WorldState } from "../types.js";
import {
  DIFFERENTIAL_OBSERVATION_DOMAINS,
  parseDifferentialTrace,
  type DifferentialJson,
  type DifferentialObservationDomain,
  type DifferentialObservations,
  type DifferentialPhaseTrace,
  type DifferentialTrace,
} from "./trace.js";

export interface CaptureNativeTurnTraceOptions {
  fixtureId: string;
  /** Era label of the fixture input; worlds do not persist their creation era. */
  era: string;
  /** Pinned Native source revision that produced the trace. */
  revision: string;
  /** Pinned `savedAt` for the `serializeSave` envelope whose bytes are hashed as `input.source.sha256`. */
  savedAt: string;
  /** Upper bound on shared-stream draws replayed per phase; defaults to MAX_NATIVE_TRACE_DRAWS_PER_PHASE. */
  maxDrawsPerPhase?: number;
  /** Lowercase hex SHA-256 of UTF-8 text. Injected so the engine stays runtime-neutral. */
  sha256: (text: string) => string;
}

export interface NativeTurnTraceCapture {
  trace: DifferentialTrace;
  report: TurnReport;
}

type NativeObservation = { [Domain in DifferentialObservationDomain]: DifferentialJson };

/**
 * Same shape as the AHDGame exporter's mutations. `presence` is added only when
 * a key exists on one side, so an absent side is never conflated with `null`.
 */
type Mutation = {
  path: string;
  before: DifferentialJson;
  after: DifferentialJson;
  presence?: { before: boolean; after: boolean };
};

/**
 * Largest per-phase draw count the capture replays. A real 1953 US or 1979 UK
 * turn draws about 0.1M in total; a larger counter delta means a reset or
 * corrupt state, which fails closed before any draw array is allocated.
 */
export const MAX_NATIVE_TRACE_DRAWS_PER_PHASE = 1_000_000;

const SHARED_STREAM = "advanceTurn.shared";

/**
 * Phase-local generators never flow through the advanceTurn stream, so their
 * draws are declared unobserved instead of being reported as absent.
 */
const UNOBSERVED_RNG_STREAMS = {
  status: "unobserved-fail-closed",
  reason: "Phase-local generators derived inside phases are not part of the shared advanceTurn stream.",
  sources: [
    "packages/engine/src/intraparty/phases.ts forkRng (rngFromSeed)",
    "packages/engine/src/judiciary/scotusTurn.ts processScotusTurn (rngFromState(world.meta.rng))",
  ],
} as const;

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function json(value: unknown): DifferentialJson {
  return JSON.parse(JSON.stringify(value ?? null)) as DifferentialJson;
}

function canonical(value: DifferentialJson): DifferentialJson {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key]!)]));
  }
  return value;
}

function canonicalText(value: DifferentialJson): string {
  return JSON.stringify(canonical(value));
}

/**
 * Native-side domain selectors scoped to one country. They follow the domain
 * intent of the AHDGame exporter but keep Native field names; they are not a
 * canonical Mongo-to-Native field map.
 */
function observe(world: Readonly<WorldState>, countryId: string): NativeObservation {
  const inCountry = <T extends { countryId?: string }>(item: T) => item.countryId === countryId;
  const { cash, funds, actions } = world.player;
  return {
    resources: json({
      player: { countryId, cash, funds, actions },
      politicians: world.politicians
      .filter(inCountry)
      .map(({ id, countryId: country, actions, funds }) => ({ id, countryId: country, actions, funds }))
      .sort((a, b) => byCodeUnit(a.id, b.id)),
    }),
    elections: json(world.elections.filter(inCountry).sort((a, b) => byCodeUnit(a.id, b.id))),
    budgets: json({
      federal: world.budgets[countryId] ? [world.budgets[countryId]] : [],
      state: Object.values(world.regionalBudgets).filter(inCountry).sort((a, b) => byCodeUnit(a.regionId, b.regionId)),
    }),
    policies: json({ enactedLaws: world.enactedLaws.filter(inCountry).sort((a, b) => byCodeUnit(a.id, b.id)) }),
    playerConsequences: json({ news: world.news.filter(inCountry) }),
  };
}

function mutations(before: DifferentialJson, after: DifferentialJson, path = ""): Mutation[] {
  if (canonicalText(before) === canonicalText(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key): Mutation[] => {
      const child = path ? `${path}.${key}` : key;
      const inBefore = Object.hasOwn(before, key);
      const inAfter = Object.hasOwn(after, key);
      if (inBefore && inAfter) return mutations(before[key]!, after[key]!, child);
      return [{
        path: child,
        before: inBefore ? before[key]! : null,
        after: inAfter ? after[key]! : null,
        presence: { before: inBefore, after: inAfter },
      }];
    });
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    return before.flatMap((item, index) => mutations(item, after[index]!, path ? `${path}.${index}` : String(index)));
  }
  return [{ path, before, after }];
}

/** Replays the shared sfc32 stream; its fourth word counts every next() call. */
function drawsBetween(before: RngState, after: RngState, phase: string, bound: number): number[] {
  const count = (after[3] - before[3]) >>> 0;
  if (count > bound) {
    throw new Error(`Native RNG draws in phase ${phase} (${count}) exceed the capture bound of ${bound}`);
  }
  const replay = rngFromState([...before] as RngState);
  const draws = Array.from({ length: count }, () => replay.next());
  const replayed = replay.state();
  if (replayed.some((word, index) => word !== after[index])) {
    throw new Error(`Native RNG state after ${phase} is not reachable from its observed predecessor`);
  }
  return draws;
}

function observedRng(state: RngState, extra: Record<string, DifferentialJson> = {}): DifferentialJson {
  return { status: "observed", stream: SHARED_STREAM, state: [...state], ...extra };
}

/**
 * Advances one turn through the public advanceTurn boundary and records the
 * phases it actually ran, the shared RNG stream and per-domain mutations.
 * A capture failure throws mid-turn; the partially advanced world must be discarded.
 */
export function captureNativeTurnTrace(world: WorldState, options: CaptureNativeTurnTraceOptions): NativeTurnTraceCapture {
  const bound = options.maxDrawsPerPhase ?? MAX_NATIVE_TRACE_DRAWS_PER_PHASE;
  if (!Number.isSafeInteger(bound) || bound < 1) {
    throw new Error("maxDrawsPerPhase must be a positive safe integer");
  }
  const countryId = world.player.countryId;
  const sourceSha256 = options.sha256(serializeSave(world, options.savedAt));
  const initial = observe(world, countryId);
  let previousObservation = initial;
  let previousRng: RngState = [...world.meta.rng] as RngState;
  const phases: DifferentialPhaseTrace[] = [];
  const report = advanceTurn(world, {
    afterPhase(name, current, rng) {
      const rngAfter = [...rng] as RngState;
      const observation = observe(current, countryId);
      const observations = {} as DifferentialObservations;
      for (const domain of DIFFERENTIAL_OBSERVATION_DOMAINS) {
        observations[domain] = { mutations: mutations(previousObservation[domain], observation[domain]) };
      }
      phases.push({
        index: phases.length,
        name,
        rng: {
          before: observedRng(previousRng),
          after: observedRng(rngAfter, { unobservedStreams: json(UNOBSERVED_RNG_STREAMS) }),
          draws: drawsBetween(previousRng, rngAfter, name, bound),
        },
        observations,
      });
      previousObservation = observation;
      previousRng = rngAfter;
    },
  });
  const trace = parseDifferentialTrace({
    schemaVersion: 1,
    engine: { kind: "native", revision: options.revision },
    input: {
      fixtureId: options.fixtureId,
      era: options.era,
      countryId,
      seed: world.meta.seed,
      canonicalInputSha256: options.sha256(canonicalText(initial)),
      source: { kind: "nativeSave", sha256: sourceSha256 },
    },
    adaptations: [],
    phases,
  });
  return { trace, report };
}
