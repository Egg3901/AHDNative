import { describe, it, expect } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { ACTION_CATALOG } from "./catalog.js";
import { executeAction } from "./execute.js";
import { evaluateAchievements } from "../achievements/evaluate.js";
import { statMultiplier } from "../stats/characterStats.js";
import type { WorldState } from "../types.js";
import type { ElectionRecord } from "../elections/types.js";

/**
 * Issue #38: poll / pollLarge through the real Native public engine action
 * contract. Authority: AHDGame src/lib/actions.ts (ACTIONS.poll / pollLarge:
 * 2 AP / $25k, 6 AP / $75k), src/app/api/actions/poll/route.ts (commission +
 * store lastPoll / lastPollLarge), src/lib/actions/pollCalculations.ts
 * (computePollData result fields) and every helper it calls. Where Native's
 * shared helpers are calibrated differently from that revision
 * (approvalScalar power curve), the poll calls the same local
 * helpers as Native's own tally so the poll predicts its own election.
 * Reference revision: e364c04954ed628beef73a993a8e9e156650a31e.
 */

const OPTS = { seed: "issue38-poll-seed", playerName: "Poll Tester", countryId: "US", era: "1953" } as const;

function readyWorld(): WorldState {
  const world = createWorld(OPTS);
  world.player.actions = 50;
  world.player.funds = 1_000_000;
  world.player.homeRegionId = world.player.homeRegionId ?? "CA";
  return world;
}

function homeRegion(world: WorldState): string {
  const id = world.player.homeRegionId;
  if (!id) throw new Error("test world has no home region");
  return id;
}

/** Plant a general-phase race in the home region: player vs one NPP opponent. */
function plantRace(world: WorldState, opponentId: string): string {
  const state = homeRegion(world);
  const opp = world.politicians.find((p) => p.id === opponentId) ?? world.politicians[0]!;
  const rec: ElectionRecord = {
    id: `house:US:${state}:c1-test`,
    electionType: "house",
    countryId: "US",
    state,
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 0,
    endTurn: 100,
    totalSeats: 1,
    chamberKey: "house",
    candidates: [
      { id: "player", name: world.player.name, partyId: world.player.partyId ?? "DEM", isNPP: false, incumbent: false },
      { id: opp.id, name: opp.name, partyId: "REP", isNPP: true, incumbent: false },
    ],
    tally: {},
  };
  world.elections.push(rec);
  return opp.id;
}

describe("issue #38 poll catalog", () => {
  it("marks poll and pollLarge available with authoritative costs", () => {
    expect(ACTION_CATALOG.poll.status).toBe("available");
    expect(ACTION_CATALOG.poll.baseCost).toBe(2);
    expect(ACTION_CATALOG.poll.fundCost).toBe(25_000);
    expect(ACTION_CATALOG.pollLarge.status).toBe("available");
    expect(ACTION_CATALOG.pollLarge.baseCost).toBe(6);
    expect(ACTION_CATALOG.pollLarge.fundCost).toBe(75_000);
  });
});

describe("issue #38 quick poll execution", () => {
  it("commissions a quick poll: charges 2 AP + $25k and stores lastPoll without categories", () => {
    const world = readyWorld();
    const res = executeAction(world, "player", "poll");
    expect(res.ok).toBe(true);
    expect(world.player.actions).toBe(48);
    expect(world.player.funds).toBe(1_000_000 - 25_000);
    const snap = world.player.lastPoll;
    expect(snap).toBeDefined();
    expect(typeof snap!.overallAppeal).toBe("number");
    expect(typeof snap!.totalEstimatedVoters).toBe("number");
    expect(typeof snap!.totalPotentialVoters).toBe("number");
    expect(snap!.topGroups).toHaveLength(5);
    expect(snap!.bottomGroups).toHaveLength(5);
    expect("categories" in snap!).toBe(false);
    expect("inRaceVoteShare" in snap!).toBe(false);
    expect(snap!.granular?.dims).toEqual(["voterGroups"]);
    expect(snap!.granular?.cells.length).toBeGreaterThan(0);
    expect(Object.keys(snap!.granular?.candidateShares ?? {})).toHaveLength(snap!.granular!.cells.length);
  });

  it("full poll stores the category breakdown without a polling cooldown", () => {
    const world = readyWorld();
    const res = executeAction(world, "player", "pollLarge");
    expect(res.ok).toBe(true);
    expect(world.player.actions).toBe(44);
    expect(world.player.funds).toBe(1_000_000 - 75_000);
    const snap = world.player.lastPollLarge;
    expect(snap).toBeDefined();
    expect(Array.isArray(snap!.categories)).toBe(true);
    expect(snap!.categories!.length).toBeGreaterThan(0);
    const groupCount = snap!.categories!.reduce((n, c) => n + c.groups.length, 0);
    expect(groupCount).toBeGreaterThanOrEqual(snap!.topGroups.length);
    expect(ACTION_CATALOG.pollLarge.cooldown).toBe(0);
    world.player.actions = 50;
    world.player.funds = 1_000_000;
    const again = executeAction(world, "player", "pollLarge");
    expect(again.ok).toBe(true);
  });

  it("applies Intellect and frozen campaign FX to poll costs", () => {
    const world = createWorld({ ...OPTS, countryId: "UK" });
    world.player.actions = 50;
    world.player.funds = 1_000_000;
    world.player.stats = { ...world.player.stats, intellect: 10 };
    const expected = Math.round(Math.round(25_000 / statMultiplier(10)) * 0.75);
    expect(executeAction(world, "player", "poll").ok).toBe(true);
    expect(world.player.funds).toBe(1_000_000 - expected);
  });

  it("matches a hand-computed single-group vector", () => {
    // Independent vector, no implementation calls in the expectation path:
    // one group, full population, neutral leans, full turnout, VEP 1000.
    // positionRaw = 50 -> positionScore = 25*(50/50)^1.5 + 0.5 = 25.5,
    // no directional bonus on neutral leans, no influence in appeal (state
    // path) => appeal = overallAppeal = 25.5. PI 100 -> reach 1, fav 100 ->
    // approval 1: rawPotential = round(1000 * 25.5/50) = 510.
    // Differential evidence: the same fixture through the pinned AHDGame
    // computePollData (e364c049, unmodified sources, no-opponent path) prints
    // 25.5 / 1000 / 510, byte-identical on this path. At fav 80 the same
    // oracle prints 408 (510 x 0.8 linear) while Native prints 427
    // (510 x 0.8^0.8): the only delta is the shared approvalScalar
    // calibration Native's own tally also uses, so the poll agrees with the
    // election it predicts (see polling.ts module doc).
    const world = readyWorld();
    const state = homeRegion(world);
    world.player.policies = { economic: 0, social: 0 };
    world.player.politicalInfluence = 100;
    world.player.favorability = 100;
    world.player.infamy = 0;
    world.regions[state]!.population = 1000;
    world.regions[state]!.votingEligiblePopulation = 1000;
    world.stateDemographics[state] = {
      _id: state,
      countryId: "US",
      categoryWeights: { voterGroups: 100 },
      groups: { moderates: { population: 100, economicLean: 0, socialLean: 0, turnout: 100 } },
      lastUpdated: "1953-01-01",
    };
    world.demographicCategories["US"] = [
      {
        _id: "voterGroups",
        name: "Voter Groups",
        groups: [
          { id: "moderates", name: "Moderates", defaultEconomicLean: 0, defaultSocialLean: 0, defaultTurnout: 100 },
        ],
        defaultWeight: 100,
      },
    ];
    const res = executeAction(world, "player", "poll");
    expect(res.ok).toBe(true);
    const snap = world.player.lastPoll!;
    expect(snap.overallAppeal).toBe(25.5);
    expect(snap.totalEstimatedVoters).toBe(1000);
    expect(snap.totalPotentialVoters).toBe(510);
    expect(snap.topGroups[0]!.id).toBe("moderates");
    expect(snap.topGroups[0]!.weightedPotential).toBe(510);
    expect(snap.topGroups[0]!.appeal).toBe(25.5);
  });

  it("pins the documented approval-calibration delta at favorability 80", () => {
    const world = readyWorld();
    const state = homeRegion(world);
    world.player.policies = { economic: 0, social: 0 };
    world.player.politicalInfluence = 100;
    world.player.favorability = 80;
    world.player.infamy = 0;
    world.regions[state]!.population = 1000;
    world.regions[state]!.votingEligiblePopulation = 1000;
    world.stateDemographics[state] = {
      _id: state,
      countryId: "US",
      categoryWeights: { voterGroups: 100 },
      groups: { moderates: { population: 100, economicLean: 0, socialLean: 0, turnout: 100 } },
      lastUpdated: "1953-01-01",
    };
    world.demographicCategories["US"] = [
      {
        _id: "voterGroups",
        name: "Voter Groups",
        groups: [
          { id: "moderates", name: "Moderates", defaultEconomicLean: 0, defaultSocialLean: 0, defaultTurnout: 100 },
        ],
        defaultWeight: 100,
      },
    ];
    expect(executeAction(world, "player", "poll").ok).toBe(true);
    // 510 x approvalScalar(80): Native power curve gives 427 where the
    // checked-out AHDGame's linear scalar gives 408 (observed oracle).
    expect(world.player.lastPoll!.totalPotentialVoters).toBe(427);
  });

  it("reads same-turn tally inputs: GOTV modifiers move poll turnout", () => {
    const world = readyWorld();
    const state = homeRegion(world);
    const first = executeAction(world, "player", "poll");
    expect(first.ok).toBe(true);
    const groupId = world.player.lastPoll!.topGroups[0]!.id;
    const before = world.player.lastPoll!.topGroups[0]!.turnoutPct;
    world.player.actionCooldowns["poll"] = 0;
    world.player.actions = 50;
    world.player.funds = 1_000_000;
    const rt = world.regionTurnouts[state]!;
    rt.modifiers["voterGroups"] = { ...(rt.modifiers["voterGroups"] ?? {}), [groupId]: 5 };
    const second = executeAction(world, "player", "poll");
    expect(second.ok).toBe(true);
    const after = world.player.lastPoll!.topGroups.find((g) => g.id === groupId)!.turnoutPct;
    expect(after - before).toBeCloseTo(5, 5);
  });

  it("sees an in-race share only with a general-phase race and opponents", () => {
    const world = readyWorld();
    world.player.policies = { economic: -2, social: -2 };
    const oppId = plantRace(world, world.politicians[0]!.id);
    void oppId;
    const res = executeAction(world, "player", "poll");
    expect(res.ok).toBe(true);
    const share = world.player.lastPoll!.inRaceVoteShare;
    expect(share).toBeDefined();
    expect(share!.myVotes).toBeGreaterThan(0);
    const oppVotes = Object.values(share!.opponentVotes);
    expect(oppVotes).toHaveLength(1);
    expect(oppVotes[0]).toBeGreaterThan(0);
    // Group-level competitive allocation conserves the estimated pool.
    const pool = world.player.lastPoll!.totalEstimatedVoters;
    expect(share!.myVotes + oppVotes[0]!).toBeLessThanOrEqual(Math.ceil(pool * 1.02));
    // Groups carry per-group competitive shares in a race.
    expect(typeof world.player.lastPoll!.topGroups[0]!.estimatedSharePct).toBe("number");
  });

  it("fails closed without charging when inputs are missing", () => {
    const noHome = readyWorld();
    noHome.player.homeRegionId = null;
    const r1 = executeAction(noHome, "player", "poll");
    expect(r1.ok).toBe(false);
    expect((r1 as { error: string }).error).toMatch(/home region/i);
    expect(noHome.player.actions).toBe(50);
    expect(noHome.player.funds).toBe(1_000_000);

    const noDemo = readyWorld();
    delete noDemo.stateDemographics[homeRegion(noDemo)];
    const r2 = executeAction(noDemo, "player", "poll");
    expect(r2.ok).toBe(false);
    expect((r2 as { error: string }).error).toMatch(/Demographic data not found/);
    expect(noDemo.player.actions).toBe(50);

    const noCats = readyWorld();
    noCats.demographicCategories["US"] = [];
    const r3 = executeAction(noCats, "player", "pollLarge");
    expect(r3.ok).toBe(false);
    expect((r3 as { error: string }).error).toMatch(/Demographic categories not configured/);
    expect(noCats.player.actions).toBe(50);
  });

  it("rejects insufficient resources through the standard gates", () => {
    const poor = readyWorld();
    poor.player.funds = 100;
    const r1 = executeAction(poor, "player", "poll");
    expect(r1.ok).toBe(false);
    expect((r1 as { error: string }).error).toMatch(/Not enough funds/);

    const tired = readyWorld();
    tired.player.actions = 1;
    const r2 = executeAction(tired, "player", "poll");
    expect(r2.ok).toBe(false);
    expect((r2 as { error: string }).error).toMatch(/Not enough action points/);
  });

  it("never routes polls through the unknown-action fallback", () => {
    const world = readyWorld();
    const res = executeAction(world, "player", "poll");
    expect(res.ok).toBe(true);
    expect((res as { message: string }).message ?? "").not.toMatch(/No effect for/);
  });

  it("is deterministic: identical worlds produce identical snapshots", () => {
    const a = readyWorld();
    const b = readyWorld();
    expect(executeAction(a, "player", "poll").ok).toBe(true);
    expect(executeAction(b, "player", "poll").ok).toBe(true);
    expect(a.player.lastPoll).toEqual(b.player.lastPoll);
  });

  it("counts real commissions toward the pollster achievement", () => {
    const world = readyWorld();
    for (let i = 0; i < 4; i++) {
      expect(executeAction(world, "player", "poll").ok).toBe(true);
    }
    expect(evaluateAchievements(world)).not.toContain("pollster");
    expect(executeAction(world, "player", "poll").ok).toBe(true);
    expect(evaluateAchievements(world)).toContain("pollster");
  });

  it("survives save and reload", () => {
    const world = readyWorld();
    expect(executeAction(world, "player", "poll").ok).toBe(true);
    expect(executeAction(world, "player", "pollLarge").ok).toBe(true);
    const snap = world.player.lastPoll;
    const snapLarge = world.player.lastPollLarge;
    const restored = deserializeSave(serializeSave(world, "2026-09-11T00:00:00Z"));
    expect(restored.player.lastPoll).toEqual(snap);
    expect(restored.player.lastPollLarge).toEqual(snapLarge);
  });
});
