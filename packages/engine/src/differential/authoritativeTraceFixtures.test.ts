import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDifferentialTrace } from "./trace.js";
import {
  AHDGAME_TRACE_FIXTURES,
  AHDGAME_TRACE_SOURCE_REVISION,
} from "./authoritativeTraceFixtures.js";

describe("#280 authoritative AHDGame trace fixtures", () => {
  it("preserves representative source-owned traces at the pinned exporter revision", () => {
    const coverage = new Set<string>();
    for (const descriptor of AHDGAME_TRACE_FIXTURES) {
      const path = fileURLToPath(new URL(`./fixtures/${descriptor.file}`, import.meta.url));
      const bytes = readFileSync(path);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(descriptor.sha256);
      const trace = parseDifferentialTrace(bytes.toString("utf8"));
      expect(trace.engine).toEqual({ kind: "ahdgame", revision: AHDGAME_TRACE_SOURCE_REVISION });
      expect(trace.input.source.kind).toBe("mongo");
      expect(trace.phases.length).toBeGreaterThan(100);
      expect(trace.phases.every((phase) => (
        (phase.rng.before as { status?: string }).status === "unobservable-fail-closed"
        && (phase.rng.after as { status?: string }).status === "unobservable-fail-closed"
        && phase.rng.draws.length === 0
      ))).toBe(true);
      coverage.add(`${trace.input.era}:${trace.input.countryId}`);
    }
    expect(coverage).toEqual(new Set(["1953:US", "1979:UK"]));
  });
});
