export type DifferentialJson = null | boolean | number | string | DifferentialJson[] | { [key: string]: DifferentialJson };

export interface DifferentialTraceSource {
  kind: "mongo" | "nativeSave";
  sha256: string;
}

export interface DifferentialTraceInput {
  fixtureId: string;
  era: string;
  countryId: string;
  seed?: string;
  /** Hash of the shared normalized comparison input, not either persistence envelope. */
  canonicalInputSha256: string;
  source: DifferentialTraceSource;
}

export interface DifferentialAdaptation {
  id: string;
  phase: string;
  paths: string[];
  rationale: string;
  source: string;
}

export const DIFFERENTIAL_OBSERVATION_DOMAINS = [
  "resources",
  "elections",
  "budgets",
  "policies",
  "playerConsequences",
] as const;

export type DifferentialObservationDomain = typeof DIFFERENTIAL_OBSERVATION_DOMAINS[number];
export type DifferentialObservations = { [Domain in DifferentialObservationDomain]: DifferentialJson };

export interface DifferentialPhaseTrace {
  index: number;
  name: string;
  rng: {
    before: DifferentialJson;
    after: DifferentialJson;
    draws: DifferentialJson[];
  };
  observations: DifferentialObservations;
}

export interface DifferentialTrace {
  schemaVersion: 1;
  engine: { kind: "ahdgame" | "native"; revision: string };
  input: DifferentialTraceInput;
  adaptations: DifferentialAdaptation[];
  phases: DifferentialPhaseTrace[];
}

export interface DifferentialToleranceRule {
  phase: string;
  path: string;
  absolute: number;
  justification: string;
  evidence: string;
}

export type DifferentialComparison =
  | { equal: true }
  | {
      equal: false;
      classification: "intentionalAdaptation" | "unexplained";
      phase: { index: number; expectedName: string; actualName: string } | null;
      path: string;
      expected: DifferentialJson | undefined;
      actual: DifferentialJson | undefined;
      adaptation?: DifferentialAdaptation;
    };

const DIFFERENTIAL_TRACE_FIELD_POLICY = {
  schemaVersion: "schema",
  engine: "provenance",
  input: "comparison",
  adaptations: "provenance",
  phases: "comparison",
} as const satisfies {
  [Field in keyof DifferentialTrace]: "schema" | "provenance" | "comparison";
};

function fail(path: string, message: string): never {
  throw new Error(`Invalid differential trace at ${path}: ${message}`);
}

function assertJsonSafe(value: unknown, path: string): asserts value is DifferentialJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "value must be JSON-safe");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, `${path}.${index}`));
    return;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(path, "value must be JSON-safe");
  }
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) fail(`${path}.${key}`, "value must be JSON-safe");
    assertJsonSafe(item, `${path}.${key}`);
  }
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object");
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(path, "expected a non-empty string");
  return value;
}

function assertExactFields(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) fail(`${path}.${key}`, "unexpected field for schema version 1");
  }
}

const DIFFERENTIAL_COMPARISON_POLICY = {
  input: {
    fixtureId: "provenanceOnly",
    era: "compare",
    countryId: "compare",
    seed: "compare",
    canonicalInputSha256: "compare",
    source: "provenanceOnly",
  },
  phase: {
    index: "identity",
    name: "identity",
    rng: "compare",
    observations: "compare",
  },
} as const satisfies {
  input: { [Field in keyof DifferentialTraceInput]: "compare" | "provenanceOnly" };
  phase: { [Field in keyof DifferentialPhaseTrace]: "identity" | "compare" };
};

const PROTECTED_TOLERANCE_PATH_POLICY = {
  prefixes: ["rng"],
  exactSegments: new Set(["id", "ids", "status"]),
} as const;

export function parseDifferentialTrace(input: unknown): DifferentialTrace {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  assertJsonSafe(value, "$trace");
  const root = objectAt(value, "$trace");
  assertExactFields(root, Object.keys(DIFFERENTIAL_TRACE_FIELD_POLICY), "$trace");
  if (root.schemaVersion !== 1) fail("schemaVersion", "expected 1");
  const engine = objectAt(root.engine, "engine");
  assertExactFields(engine, ["kind", "revision"], "engine");
  if (engine.kind !== "ahdgame" && engine.kind !== "native") fail("engine.kind", "expected ahdgame or native");
  stringAt(engine.revision, "engine.revision");
  const fixture = objectAt(root.input, "input");
  assertExactFields(fixture, ["fixtureId", "era", "countryId", "seed", "canonicalInputSha256", "source"], "input");
  stringAt(fixture.fixtureId, "input.fixtureId");
  stringAt(fixture.era, "input.era");
  stringAt(fixture.countryId, "input.countryId");
  if (fixture.seed !== undefined) stringAt(fixture.seed, "input.seed");
  stringAt(fixture.canonicalInputSha256, "input.canonicalInputSha256");
  const source = objectAt(fixture.source, "input.source");
  assertExactFields(source, ["kind", "sha256"], "input.source");
  if (source.kind !== "mongo" && source.kind !== "nativeSave") fail("input.source.kind", "expected mongo or nativeSave");
  if (engine.kind === "ahdgame" && source.kind !== "mongo") fail("input.source.kind", "AHDGame traces require Mongo provenance");
  if (engine.kind === "native" && source.kind !== "nativeSave") fail("input.source.kind", "Native traces require nativeSave provenance");
  stringAt(source.sha256, "input.source.sha256");
  if (!Array.isArray(root.adaptations)) fail("adaptations", "expected an array");
  for (const [index, raw] of root.adaptations.entries()) {
    const adaptation = objectAt(raw, `adaptations.${index}`);
    assertExactFields(adaptation, ["id", "phase", "paths", "rationale", "source"], `adaptations.${index}`);
    stringAt(adaptation.id, `adaptations.${index}.id`);
    stringAt(adaptation.phase, `adaptations.${index}.phase`);
    stringAt(adaptation.rationale, `adaptations.${index}.rationale`);
    stringAt(adaptation.source, `adaptations.${index}.source`);
    if (!Array.isArray(adaptation.paths) || adaptation.paths.length === 0) fail(`adaptations.${index}.paths`, "expected non-empty paths");
    adaptation.paths.forEach((path, pathIndex) => stringAt(path, `adaptations.${index}.paths.${pathIndex}`));
  }
  if (!Array.isArray(root.phases)) fail("phases", "expected an array");
  let previousIndex = -1;
  for (const [arrayIndex, raw] of root.phases.entries()) {
    const phase = objectAt(raw, `phases.${arrayIndex}`);
    assertExactFields(phase, Object.keys(DIFFERENTIAL_COMPARISON_POLICY.phase), `phases.${arrayIndex}`);
    if (!Number.isInteger(phase.index) || (phase.index as number) < 0) fail(`phases.${arrayIndex}.index`, "expected a non-negative integer");
    if ((phase.index as number) <= previousIndex) fail(`phases.${arrayIndex}.index`, "phase indexes must be strictly increasing");
    previousIndex = phase.index as number;
    stringAt(phase.name, `phases.${arrayIndex}.name`);
    const rng = objectAt(phase.rng, `phases.${arrayIndex}.rng`);
    assertExactFields(rng, ["before", "after", "draws"], `phases.${arrayIndex}.rng`);
    if (!("before" in rng) || !("after" in rng) || !Array.isArray(rng.draws)) fail(`phases.${arrayIndex}.rng`, "before, after, and draws are required");
    const observations = objectAt(phase.observations, `phases.${arrayIndex}.observations`);
    assertExactFields(observations, DIFFERENTIAL_OBSERVATION_DOMAINS, `phases.${arrayIndex}.observations`);
    for (const domain of DIFFERENTIAL_OBSERVATION_DOMAINS) {
      if (!(domain in observations)) fail(`phases.${arrayIndex}.observations.${domain}`, "domain is required");
    }
  }
  return value as DifferentialTrace;
}

function canonical(value: DifferentialJson): DifferentialJson {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key]!) ]));
  }
  return value;
}

export function serializeDifferentialTrace(trace: unknown): string {
  return JSON.stringify(canonical(parseDifferentialTrace(trace) as unknown as DifferentialJson));
}

function validateToleranceRules(rules: readonly DifferentialToleranceRule[]): void {
  for (const [index, rule] of rules.entries()) {
    if (!rule.justification.trim()) throw new Error(`Tolerance rule ${index} requires a justification`);
    if (!rule.evidence.trim()) throw new Error(`Tolerance rule ${index} requires measured evidence`);
    if (!Number.isFinite(rule.absolute) || rule.absolute < 0) throw new Error(`Tolerance rule ${index} requires a finite non-negative absolute tolerance`);
    const segments = rule.path.split(".");
    const protectedPath = PROTECTED_TOLERANCE_PATH_POLICY.prefixes.some((prefix) => rule.path === prefix || rule.path.startsWith(`${prefix}.`))
      || segments.some((part) => PROTECTED_TOLERANCE_PATH_POLICY.exactSegments.has(part));
    if (protectedPath) throw new Error(`Tolerance rule ${index} cannot target RNG or identity fields`);
  }
}

interface Difference {
  path: string;
  expected: DifferentialJson | undefined;
  actual: DifferentialJson | undefined;
}

function firstDifference(
  expected: DifferentialJson,
  actual: DifferentialJson,
  path: string,
  tolerances: readonly DifferentialToleranceRule[],
): Difference | null {
  const tolerance = tolerances.find((rule) => rule.path === path);
  if (
    typeof expected === "number" &&
    typeof actual === "number" &&
    tolerance?.path === path &&
    Math.abs(expected - actual) <= tolerance.absolute
  ) return null;
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index++) {
      if (index >= expected.length || index >= actual.length) return { path: `${path}.${index}`, expected: expected[index], actual: actual[index] };
      const difference = firstDifference(expected[index]!, actual[index]!, `${path}.${index}`, tolerances);
      if (difference) return difference;
    }
    return null;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) && !Array.isArray(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in expected) || !(key in actual)) return { path: childPath, expected: expected[key], actual: actual[key] };
      const difference = firstDifference(expected[key]!, actual[key]!, childPath, tolerances);
      if (difference) return difference;
    }
    return null;
  }
  return { path, expected, actual };
}

export function compareDifferentialTraces(
  expectedInput: unknown,
  actualInput: unknown,
  toleranceRules: readonly DifferentialToleranceRule[] = [],
): DifferentialComparison {
  const expected = parseDifferentialTrace(expectedInput);
  const actual = parseDifferentialTrace(actualInput);
  validateToleranceRules(toleranceRules);
  if (expected.engine.kind !== "ahdgame" || actual.engine.kind !== "native") {
    throw new Error("Differential comparison requires an authoritative AHDGame trace followed by a Native trace");
  }
  const comparableInputKeys = Object.entries(DIFFERENTIAL_COMPARISON_POLICY.input)
    .filter(([, policy]) => policy === "compare")
    .map(([field]) => field as keyof DifferentialTraceInput);
  for (const key of comparableInputKeys) {
    if (expected.input[key] !== actual.input[key]) {
      return {
        equal: false,
        classification: "unexplained",
        phase: null,
        path: `input.${key}`,
        expected: expected.input[key],
        actual: actual.input[key],
      };
    }
  }
  const phaseCount = Math.max(expected.phases.length, actual.phases.length);
  for (let offset = 0; offset < phaseCount; offset++) {
    const expectedPhase = expected.phases[offset];
    const actualPhase = actual.phases[offset];
    if (!expectedPhase || !actualPhase) {
      return {
        equal: false,
        classification: "unexplained",
        phase: null,
        path: "phases.length",
        expected: expected.phases.length,
        actual: actual.phases.length,
      };
    }
    const phase = { index: expectedPhase.index, expectedName: expectedPhase.name, actualName: actualPhase.name };
    if (expectedPhase.index !== actualPhase.index) {
      return { equal: false, classification: "unexplained", phase, path: "index", expected: expectedPhase.index, actual: actualPhase.index };
    }
    if (expectedPhase.name !== actualPhase.name) {
      return { equal: false, classification: "unexplained", phase, path: "name", expected: expectedPhase.name, actual: actualPhase.name };
    }
    const comparableFields = Object.entries(DIFFERENTIAL_COMPARISON_POLICY.phase)
      .filter(([, policy]) => policy === "compare")
      .map(([field]) => field as keyof DifferentialPhaseTrace);
    const comparableExpected = Object.fromEntries(comparableFields.map((field) => [field, expectedPhase[field]])) as DifferentialJson;
    const comparableActual = Object.fromEntries(comparableFields.map((field) => [field, actualPhase[field]])) as DifferentialJson;
    const matchingRules = toleranceRules.filter((rule) => rule.phase === expectedPhase.name);
    const difference = firstDifference(comparableExpected, comparableActual, "", matchingRules);
    if (!difference) continue;
    const adaptation = actual.adaptations.find((candidate) => candidate.phase === actualPhase.name && candidate.paths.includes(difference!.path));
    return {
      equal: false,
      classification: adaptation ? "intentionalAdaptation" : "unexplained",
      phase,
      path: difference.path,
      expected: difference.expected,
      actual: difference.actual,
      ...(adaptation ? { adaptation } : {}),
    };
  }
  return { equal: true };
}
