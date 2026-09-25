import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("late-game public replay probe (#43/#44)", () => {
  it("measures a committed turn-95 save and reports deterministic continuation", () => {
    const result = spawnSync("npx", ["tsx", "scripts/benchmark-late-game.ts", "--samples=2", "--warmup=0"], {
      encoding: "utf8",
      timeout: 240_000,
    });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(report.fixture).toBe("career-current-distributor-t95-1953-US.save.json.gz");
    expect(report.samples).toBe(2);
    expect(report.deterministic).toBe(true);
    expect(report.turnOutputSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const key of ["deserializeMs", "turnMs", "serializeMs"]) {
      const metric = report[key] as { p50: number; p95: number; samples: number[] };
      expect(metric.samples).toHaveLength(2);
      expect(metric.p50).toBeGreaterThanOrEqual(0);
      expect(metric.p95).toBeGreaterThanOrEqual(metric.p50);
    }
  }, 250_000);
});
