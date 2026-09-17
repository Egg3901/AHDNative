/**
 * #510 metrics/referendum capability-navigation signal.
 *
 * Reference (public Egg3901/AHDGame):
 * - `nationDetailsSections.ts` shows Political Metrics only for the
 *   playable pipeline and Referendums only with `hasActiveReferendumCampaign`;
 * - `GET /api/country/[code]/referendums/active` reports
 *   `status === "campaigning"` scoped to that country.
 *
 * Native consumes only existing-domain signals: the saved `metrics` feature
 * flag and the save's own referendum lifecycle records. Country names never
 * gate support (the UK-only request seam stays owned by
 * projectReferendumRequest), and pre-signal saves project undefined so the
 * drawer keeps today's rows.
 */
import { describe, expect, it } from "vitest";
import type { WorldState } from "@ahdclient/engine";
import { projectCapabilityNav } from "./capabilityNav";

function fakeWorld(overrides: {
  countryId?: string;
  metricsEnabled?: boolean | undefined;
  records?: { countryId: string; status: string }[] | undefined;
  omitFlags?: boolean;
  omitReferendums?: boolean;
}): WorldState {
  const world: Record<string, unknown> = {
    player: { countryId: overrides.countryId ?? "US" },
    referendums: overrides.records ?? [],
  };
  if (!overrides.omitFlags) {
    world["featureFlags"] = { metrics: overrides.metricsEnabled ?? true };
  }
  if (overrides.omitReferendums) {
    delete world["referendums"];
  }
  return world as unknown as WorldState;
}

describe("projectCapabilityNav", () => {
  it("reports full support with the flag on and a campaigning home record", () => {
    expect(
      projectCapabilityNav(
        fakeWorld({ records: [{ countryId: "US", status: "campaigning" }] }),
      ),
    ).toEqual({ metricsAvailable: true, referendumsAvailable: true });
  });

  it("reports no active campaign without records", () => {
    expect(projectCapabilityNav(fakeWorld({}))).toEqual({
      metricsAvailable: true,
      referendumsAvailable: false,
    });
  });

  it("keeps referendums discoverable where a UK request can start the campaign", () => {
    expect(projectCapabilityNav(fakeWorld({ countryId: "UK" }))).toEqual({
      metricsAvailable: true,
      referendumsAvailable: true,
    });
  });

  it("ignores non-campaigning and foreign records", () => {
    expect(
      projectCapabilityNav(
        fakeWorld({
          records: [
            { countryId: "US", status: "granted" },
            { countryId: "US", status: "polling" },
            { countryId: "US", status: "completed" },
            { countryId: "UK", status: "campaigning" },
          ],
        }),
      ),
    ).toEqual({ metricsAvailable: true, referendumsAvailable: false });
  });

  it("reports metrics unavailable when the saved flag is off", () => {
    expect(
      projectCapabilityNav(
        fakeWorld({
          metricsEnabled: false,
          records: [{ countryId: "US", status: "campaigning" }],
        }),
      ),
    ).toEqual({ metricsAvailable: false, referendumsAvailable: true });
  });

  it("projects undefined for pre-signal saves so the drawer keeps today's rows", () => {
    expect(projectCapabilityNav(fakeWorld({ omitFlags: true }))).toBeUndefined();
    expect(projectCapabilityNav(fakeWorld({ omitReferendums: true }))).toBeUndefined();
  });

  // Session wiring (`GameView.capabilityNav` in session projectWorld) is
  // covered at the shell boundary by MetricsReferendumGating510, which feeds
  // hand-built views through GameScreen. A live GameSession.create assertion
  // cannot run in this worktree: node_modules resolves @ahdclient/engine to
  // the main checkout's older engine (missing headOfStateOfficeForCountry),
  // so every session-level suite fails worktree-wide, including committed
  // politics.test.ts (29/29). Pre-existing env finding, also noted in #523.
});
