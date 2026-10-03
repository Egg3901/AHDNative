import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import {
  allocateElectoralVotes,
  electoralMajorityFor,
  electoralVoteUnitsForWorld,
  electoralVotesByState,
} from "./presidentialElectoralCollege.js";
import { electoralVotesFromSeats } from "../electionEngine/resolution/apportionment.js";
import { eraToPreset } from "../electionEngine/resolution/constants.js";
import { serializeSave, deserializeSave } from "../save.js";
import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";
import { electionSeriesForWorld } from "./orchestration.js";

const OPTS = { seed: "ec-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

function baseRecord(overrides: Partial<ElectionRecord> = {}): ElectionRecord {
  return {
    id: "president:US:-:c1",
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: 1,
    primaryEndTurn: 100,
    endTurn: 192,
    totalSeats: 1,
    chamberKey: "president",
    candidates: [],
    tally: {},
    ...overrides,
  };
}

/** Mainline HOUSE_SEATS_1953 sum (83rd-87th Congress, 1953 census apportionment). */
const HOUSE_SEATS_1953: Record<string, number> = {
  AL: 9, AZ: 2, AR: 6, CA: 30, CO: 4, CT: 6, DE: 1, FL: 8, GA: 10, ID: 2,
  IL: 25, IN: 11, IA: 8, KS: 6, KY: 8, LA: 8, ME: 3, MD: 7, MA: 14, MI: 18,
  MN: 9, MS: 6, MO: 11, MT: 2, NE: 4, NV: 1, NH: 2, NJ: 14, NM: 2, NY: 43,
  NC: 12, ND: 2, OH: 23, OK: 6, OR: 4, PA: 30, RI: 2, SC: 6, SD: 2, TN: 9,
  TX: 22, UT: 2, VT: 1, VA: 10, WA: 7, WV: 6, WI: 10, WY: 1,
};

describe("electoralVotesByState — EV apportionment (1953)", () => {
  it("matches mainline HOUSE_SEATS_1953 + 2 senators per state, 48 states, no DC/AK/HI", () => {
    const world = createWorld(OPTS);
    const ev = electoralVotesByState(world, "US");
    expect(world.regions.DC?.corporationHeadquartersOnly).toBe(true);
    expect(Object.keys(ev).sort()).toEqual(Object.keys(HOUSE_SEATS_1953).sort());
    for (const [stateId, seats] of Object.entries(HOUSE_SEATS_1953)) {
      expect(ev[stateId]).toBe(seats + 2);
    }
    expect(ev["DC"]).toBeUndefined();
    expect(ev["AK"]).toBeUndefined();
    expect(ev["HI"]).toBeUndefined();
  });

  it("sums to 531 (435 house seats + 2×48 senators) — mainline's ELECTORAL_VOTES_1953 total", () => {
    const world = createWorld(OPTS);
    const ev = electoralVotesByState(world, "US");
    const total = Object.values(ev).reduce((a, b) => a + b, 0);
    expect(total).toBe(531);
    const houseSeatSum = Object.values(HOUSE_SEATS_1953).reduce((a, b) => a + b, 0);
    expect(houseSeatSum).toBe(435);
  });
});

describe("electoralVotesByState — 1979 supported pack", () => {
  it("uses the source 1970-census 50-state map, DC, and then-current district law", () => {
    const world = createWorld({ ...OPTS, era: "1979" });
    const ev = electoralVotesByState(world, "US");
    expect(Object.keys(ev)).toHaveLength(51);
    expect(Object.values(ev).reduce((sum, value) => sum + value, 0)).toBe(538);
    expect(ev).toMatchObject({ AK: 3, HI: 4, CA: 45, NY: 41, ME: 4, NE: 5, DC: 3 });
    expect(electoralVoteUnitsForWorld(world, "US").some((unit) => unit.unitId === "ME_CD1")).toBe(true);
    expect(electoralVoteUnitsForWorld(world, "US").some((unit) => unit.unitId === "NE_CD1")).toBe(false);
  });
});

describe("electoralMajorityFor", () => {
  it("computes the era's real majority (266 for a 531-EV college), not a hardcoded 270", () => {
    expect(electoralMajorityFor(531)).toBe(266);
  });
  it("floor(total/2)+1 for an even college too", () => {
    expect(electoralMajorityFor(530)).toBe(266);
  });
  it("returns 0 for a non-positive/invalid total", () => {
    expect(electoralMajorityFor(0)).toBe(0);
    expect(electoralMajorityFor(-5)).toBe(0);
    expect(electoralMajorityFor(NaN)).toBe(0);
  });
});

describe("allocateElectoralVotes — winner-take-all goldens", () => {
  it("returns null when no per-state tallies exist (accumulation never ran)", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord();
    expect(allocateElectoralVotes(world, rec)).toBeNull();
  });

  it("awards each state's full EV block to its plurality winner (constructed 3-state outcome)", () => {
    const world = createWorld(OPTS);
    // CA=32 EV (30 house + 2), TX=24 EV (22 house + 2), WY=3 EV (1 house + 2).
    const rec = baseRecord({
      stateTallyStates: {
        CA: { totalVotes: { A: 5_000_000, B: 4_000_000 } },
        TX: { totalVotes: { A: 1_000_000, B: 2_000_000 } },
        WY: { totalVotes: { A: 50_000, B: 40_000 } },
      },
    });
    const result = allocateElectoralVotes(world, rec);
    expect(result).not.toBeNull();
    expect(result!.stateWinners).toEqual({ CA: "A", TX: "B", WY: "A" });
    expect(result!.evByCandidate).toEqual({ A: 32 + 3, B: 24 });
    expect(result!.totalEv).toBe(32 + 24 + 3);
  });

  it("breaks an exact intra-state tie by first-seen order, matching mainline electoralVoteService.ts (stable votes-descending sort, no secondary key)", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({
      stateTallyStates: { WY: { totalVotes: { Zed: 100, Alpha: 100 } } },
    });
    const result = allocateElectoralVotes(world, rec);
    expect(result!.stateWinners["WY"]).toBe("Zed");
  });

  it("resolves the same exact tie the other way when insertion order flips (order-dependent, not alphabetical)", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({
      stateTallyStates: { WY: { totalVotes: { Alpha: 100, Zed: 100 } } },
    });
    const result = allocateElectoralVotes(world, rec);
    expect(result!.stateWinners["WY"]).toBe("Alpha");
  });

  it("keeps the exact-tie winner across a JSON save/reload round trip (string-key order preserved)", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({
      stateTallyStates: { WY: { totalVotes: { Zed: 100, Alpha: 100 } } },
    });
    const reloaded = baseRecord(JSON.parse(JSON.stringify({ stateTallyStates: rec.stateTallyStates })));
    const result = allocateElectoralVotes(world, reloaded);
    expect(result!.stateWinners["WY"]).toBe("Zed");
    expect(result!.evByCandidate).toEqual({ Zed: 3 });
    expect(result!.totalEv).toBe(3);
  });

  it("skips a state with zero votes cast and still allocates the rest", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({
      stateTallyStates: {
        CA: { totalVotes: { A: 100 } },
        WY: { totalVotes: {} },
      },
    });
    const result = allocateElectoralVotes(world, rec);
    expect(result!.stateWinners).toEqual({ CA: "A" });
    expect(result!.totalEv).toBe(32);
  });

  it("uses the source Maine at-large and district winners in the 1991/2019-era live college", () => {
    const world = createWorld({ ...OPTS, era: "2019" });
    const rec = baseRecord({
      stateTallyStates: {
        ME: { totalVotes: { A: 60, B: 40 } },
        ME_CD1: { totalVotes: { A: 40, B: 60 } },
        ME_CD2: { totalVotes: { A: 20, B: 10 } },
        NE: { totalVotes: { A: 40, B: 60 } },
        NE_CD1: { totalVotes: { A: 60, B: 40 } },
        NE_CD2: { totalVotes: { A: 40, B: 60 } },
        NE_CD3: { totalVotes: { A: 60, B: 40 } },
      },
    });

    const result = allocateElectoralVotes(world, rec);
    expect(result).not.toBeNull();
    expect(result!.stateWinners).toEqual({
      ME: "A", ME_CD1: "B", ME_CD2: "A",
      NE: "B", NE_CD1: "A", NE_CD2: "B", NE_CD3: "A",
    });
    expect(result!.evByCandidate).toEqual({ A: 5, B: 4 });
    expect(result!.totalEv).toBe(9);
  });

  it("keeps the 1991 live year at Maine district-split rules and Nebraska winner-take-all", () => {
    const world = createWorld({ ...OPTS, era: "1991" });
    const rec = baseRecord({
      stateTallyStates: {
        ME: { totalVotes: { A: 60, B: 40 } },
        ME_CD1: { totalVotes: { A: 40, B: 60 } },
        ME_CD2: { totalVotes: { A: 20, B: 10 } },
        NE: { totalVotes: { A: 40, B: 60 } },
        NE_CD1: { totalVotes: { A: 60, B: 40 } },
        NE_CD2: { totalVotes: { A: 40, B: 60 } },
        NE_CD3: { totalVotes: { A: 60, B: 40 } },
      },
    });

    const result = allocateElectoralVotes(world, rec);
    expect(result).not.toBeNull();
    expect(result!.stateWinners).toEqual({ ME: "A", ME_CD1: "B", ME_CD2: "A", NE: "B" });
    expect(result!.evByCandidate).toEqual({ A: 3, B: 6 });
    expect(result!.totalEv).toBe(9);
  });

  it("preserves unit ballots and resolved EV totals through a real save/reload", () => {
    const world = createWorld({ ...OPTS, era: "2019" });
    const rec = baseRecord({
      stateTallyStates: {
        ME: { totalVotes: { A: 60, B: 40 } },
        ME_CD1: { totalVotes: { A: 40, B: 60 } },
        ME_CD2: { totalVotes: { A: 20, B: 10 } },
        NE: { totalVotes: { A: 40, B: 60 } },
        NE_CD1: { totalVotes: { A: 60, B: 40 } },
        NE_CD2: { totalVotes: { A: 40, B: 60 } },
        NE_CD3: { totalVotes: { A: 60, B: 40 } },
      },
    });
    world.elections = [rec];
    const before = allocateElectoralVotes(world, rec);
    const resumed = deserializeSave(serializeSave(world, new Date(0).toISOString()));
    const resumedRace = resumed.elections[0]!;

    expect(allocateElectoralVotes(resumed, resumedRace)).toEqual(before);
  });
});

/** Live seats map backing `electoralVotesByState`, for helper-equivalence checks. */
function liveSeats(world: WorldState, countryId = "US"): Record<string, number> {
  const seats: Record<string, number> = {};
  for (const region of Object.values(world.regions)) {
    if (region.countryId !== countryId || region.corporationHeadquartersOnly === true) continue;
    if (typeof region.houseSeats === "number" && region.houseSeats > 0) seats[region.id] = region.houseSeats;
  }
  return seats;
}

describe("electoralVotesByState — live apportionment-helper wiring (#98)", () => {
  it("1953: deep-equals the ported helper over live regions (era gates inert)", () => {
    const world = createWorld(OPTS);
    const seats = liveSeats(world);
    const raw = electoralVotesFromSeats(seats, {
      preset: eraToPreset(world.meta.era),
      year: Number(world.meta.date.slice(0, 4)),
    });
    const liveOnly = Object.fromEntries(Object.entries(raw).filter(([id]) => id in seats));
    expect(electoralVotesByState(world, "US")).toEqual(liveOnly);
  });

  it("2019: includes source DC electors without adding it to regional House-seat apportionment", () => {
    const world = createWorld({ ...OPTS, era: "2019" });
    const ev = electoralVotesByState(world, "US");
    expect(ev["AK"]).toBe(3); // 1 house seat + 2 senators
    expect(ev["HI"]).toBe(4); // 2 house seats + 2 senators
    expect(ev["CA"]).toBe(54);
    expect(ev["TX"]).toBe(40);
    expect(ev["DC"]).toBe(3);
    const seats = liveSeats(world);
    expect(Object.keys(seats)).toHaveLength(50);
    expect(Object.keys(ev).sort()).toEqual([...Object.keys(seats), "DC"].sort());
    const total = Object.values(ev).reduce((a, b) => a + b, 0);
    const houseSum = Object.values(seats).reduce((a, b) => a + b, 0);
    expect(houseSum).toBe(435);
    expect(total).toBe(538);
    expect(total).toBe(houseSum + 2 * Object.keys(seats).length + 3);
    expect(electoralMajorityFor(total)).toBe(270);
  });

  it("2023: keeps the source district's electors and excludes state offices across a full save", () => {
    const world = createWorld({ ...OPTS, era: "2023" });
    const ev = electoralVotesByState(world, "US");
    expect({
      population: world.regions.DC?.population,
      houseSeats: world.regions.DC?.houseSeats,
      senateSeats: world.regions.DC?.senateSeats,
      districtElectors: ev.DC,
      totalElectors: Object.values(ev).reduce((sum, votes) => sum + votes, 0),
      governor: world.governors.DC,
      stateRaces: electionSeriesForWorld(world).filter((race) => race.state === "DC"),
    }).toEqual({ population: 678972, houseSeats: 0, senateSeats: 0, districtElectors: 3, totalElectors: 538, governor: undefined, stateRaces: [] });
    const restored = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(electoralVotesByState(restored, "US")).toEqual(ev);
    expect(restored.governors.DC).toBeUndefined();
    expect(electionSeriesForWorld(restored).filter((race) => race.state === "DC")).toEqual([]);
  });

  it("adds the source DC unit once the live year passes the 1961 gate", () => {
    const world = createWorld(OPTS);
    world.meta.date = "1970-01-06";
    const raw = electoralVotesFromSeats(liveSeats(world), {
      preset: eraToPreset(world.meta.era),
      year: 1970,
    });
    expect(raw["DC"]).toBe(3); // the 23rd-Amendment gate itself fires...
    expect(electoralVotesByState(world, "US")["DC"]).toBe(3);
    expect(electoralVoteUnitsForWorld(world, "US").some((unit) => unit.unitId === "DC")).toBe(true);
  });

  it("survives a JSON save/reload round trip with identical totals", () => {
    const world = createWorld({ ...OPTS, era: "2019" });
    const ev = electoralVotesByState(world, "US");
    const reloaded: Record<string, number> = JSON.parse(JSON.stringify(ev));
    expect(reloaded).toEqual(ev);
    expect(Object.values(reloaded).reduce((a, b) => a + b, 0)).toBe(538);
  });
});
