import { describe, expect, it } from "vitest";
import { tierFor } from "@/lib/world/eraRoster";
import {
  assessCountryReadiness,
  assertCanOpenCountryToPlayers,
} from "@/lib/world/countryReadinessContract";

describe("pinned AHDGame Japan player readiness", () => {
  it.each(["1991", "1999", "2007", "2019", "2023"] as const)(
    "passes the source tier and readiness API for %s",
    (year) => {
      const preset = `${year}-default`;
      expect(tierFor(preset, "JP"), preset).toBe("player");
      const report = assessCountryReadiness("JP", preset);
      expect(report.player, preset).toBe("ready");
      expect(report.hardBlockers, preset).toEqual([]);
      expect(() => assertCanOpenCountryToPlayers("JP", preset), preset).not.toThrow();
    },
  );

  it.each(["1953", "1979"] as const)("retains Japan's economy-only source tier in %s", (year) => {
    expect(tierFor(`${year}-default`, "JP"), year).toBe("econ");
  });
});
