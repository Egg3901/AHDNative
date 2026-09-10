import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { serializeSave, deserializeSave } from "../save.js";
import { CAMPAIGN_WINDOW_TURNS } from "./lifecycle.js";
import type { ReferendumRecord } from "./types.js";

const OPTS = { seed: "referendum-campaign", playerName: "Tester", countryId: "US", era: "1953" } as const;

function granted(id: string, yesShare = 60, closeTurn: number | null = CAMPAIGN_WINDOW_TURNS): ReferendumRecord {
  return {
    id,
    countryId: "UK",
    regionId: "SCO",
    kind: "independence",
    status: "granted",
    yesShare,
    requestedTurn: 0,
    grantedTurn: 0,
    campaignOpenTurn: 0,
    campaignCloseTurn: closeTurn,
    campaignBaseYesShare: yesShare,
  };
}

function campaigning(id: string, closeTurn: number | null, yesShare = 60): ReferendumRecord {
  return { ...granted(id, yesShare, closeTurn), status: "campaigning" as const };
}

describe("referendum campaign window (M02, timer + cohort snapshot edges)", () => {
  it("ports CAMPAIGN_WINDOW_TURNS verbatim from AHDGame", () => {
    expect(CAMPAIGN_WINDOW_TURNS).toBe(48);
  });

  it("granted advances to campaigning on the next advanceTurn with a baseline snapshot and opening poll", () => {
    const w = createWorld(OPTS);
    w.referendums.push(granted("ref-grant-1"));
    advanceTurn(w);
    const ref = w.referendums[0]!;
    expect(ref.status).toBe("campaigning");
    expect(ref.cohortBaseline).toEqual([{ groupId: "_all", share: 1, turnout: 60, yesLean: 60 }]);
    expect(ref.pollHistory).toEqual([{ turn: 0, yesShare: 60 }]);
  });

  it("campaigning stays campaigning before the close turn while tracking the canonical share", () => {
    const w = createWorld(OPTS);
    // Phase sees turn 1 after one advanceTurn; close at 48 keeps it campaigning.
    w.referendums.push(campaigning("ref-camp-1", CAMPAIGN_WINDOW_TURNS));
    advanceTurn(w);
    const ref = w.referendums[0]!;
    expect(ref.status).toBe("campaigning");
    expect(ref.yesShare).toBeCloseTo(60, 10);
    expect(ref.pollHistory!.map((p) => p.turn)).toEqual([0, 1]);
  });

  it("campaigning advances to polling once the close turn is reached", () => {
    const w = createWorld(OPTS);
    // Phase sees turn 1 after one advanceTurn.
    w.referendums.push(campaigning("ref-camp-2", 1));
    advanceTurn(w);
    expect(w.referendums[0]!.status).toBe("polling");
  });

  it("advances at most one edge per turn: a granted record with an already-closed window still stops at campaigning", () => {
    const w = createWorld(OPTS);
    w.referendums.push(granted("ref-one-edge", 60, 1));
    advanceTurn(w);
    // Turn 1 >= close 1, but the record must not fall through to polling.
    expect(w.referendums[0]!.status).toBe("campaigning");
    advanceTurn(w);
    expect(w.referendums[0]!.status).toBe("polling");
  });

  it("a null or missing close turn never fires, but the baseline is still live-seeded", () => {
    for (const close of ["null", "missing"] as const) {
      const w = createWorld(OPTS);
      const rec = campaigning("ref-null-close", null, 60);
      if (close === "missing") delete rec.campaignCloseTurn;
      delete rec.cohortBaseline;
      w.referendums.push(rec);
      advanceTurn(w);
      advanceTurn(w);
      const ref = w.referendums[0]!;
      expect(ref.status).toBe("campaigning");
      expect(ref.cohortBaseline).toEqual([{ groupId: "_all", share: 1, turnout: 60, yesLean: 60 }]);
      expect(ref.yesShare).toBeCloseTo(60, 10);
    }
  });

  it("full chain advances one edge per turn from grant to resolution (close on turn 3, resolved on turn 4)", () => {
    const w = createWorld(OPTS);
    // 90 stays above 50 under any ±4 variance roll, so resolution always passes.
    w.referendums.push(granted("ref-chain-1", 90, 3));
    advanceTurn(w);
    expect(w.referendums[0]!.status).toBe("campaigning");
    advanceTurn(w);
    expect(w.referendums[0]!.status).toBe("campaigning");
    advanceTurn(w);
    expect(w.referendums[0]!.status).toBe("polling");
    advanceTurn(w);
    const ref = w.referendums[0]!;
    expect(ref.status).toBe("actuating");
    expect(ref.passed).toBe(true);
    expect(ref.resolvedTurn).toBe(4);
    expect(ref.finalYesShare).toBeGreaterThan(50);
  });

  it("polling resolves on the canonical aggregate, never the stale stored scalar", () => {
    const staleLow: ReferendumRecord = {
      ...campaigning("ref-stale-low", 1, 70),
      status: "polling" as const,
      yesShare: 10, // stale display scalar; baseline says 70 (min 66 after variance)
      cohortBaseline: [{ groupId: "_all", share: 1, turnout: 60, yesLean: 70 }],
    };
    const staleHigh: ReferendumRecord = {
      ...campaigning("ref-stale-high", 1, 30),
      status: "polling" as const,
      yesShare: 90, // stale display scalar; baseline says 30 (max 34 after variance)
      cohortBaseline: [{ groupId: "_all", share: 1, turnout: 60, yesLean: 30 }],
    };
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    a.referendums.push(staleLow);
    b.referendums.push(staleHigh);
    advanceTurn(a);
    advanceTurn(b);
    expect(a.referendums[0]!.status).toBe("actuating");
    expect(b.referendums[0]!.status).toBe("settled");
  });

  it("the complete world replays identically from campaign save through resolution", () => {
    const w = createWorld(OPTS);
    w.referendums.push(granted("ref-chain-2", 90, 3));
    advanceTurn(w);
    expect(w.referendums[0]!.status).toBe("campaigning");
    const saved = serializeSave(w, new Date(0).toISOString());
    const revived = deserializeSave(saved);
    expect(JSON.stringify(revived.referendums)).toBe(JSON.stringify(w.referendums));
    for (let turn = 2; turn <= 4; turn++) {
      advanceTurn(w);
      advanceTurn(revived);
      expect(serializeSave(revived, new Date(0).toISOString())).toBe(serializeSave(w, new Date(0).toISOString()));
    }
    expect(revived.referendums[0]!.status).toBe("actuating");
  });
});
