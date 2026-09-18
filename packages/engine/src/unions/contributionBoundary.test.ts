/**
 * #114 treasury-preserving contribution boundary at the public turn seam.
 *
 * Pinned source: AHDGame e364c04954ed628beef73a993a8e9e156650a31e,
 *   src/lib/turn/unions/index.ts processUnionsTurn:
 *     "Only debit what we can actually pay out. A union with a rate set but
 *      no organizers of any strength keeps the surplus in the treasury."
 *
 * #319 implemented the boundary; the phase-level tests in
 * contributions.test.ts drive unionsTurnPhase directly. Every test below
 * drives the PUBLIC boundary (`advanceTurn`, which runs TURN_PHASES in
 * registry order, plus `serializeSave`/`deserializeSave`) and derives
 * expectations from the pinned rule plus twin-world differencing, never
 * from the implementation under test:
 *
 * - A union with a contribution rate set but no payable organizers keeps
 *   the full requested pool in treasury every turn: its treasury is exactly
 *   equal to a twin whose rate is 0, no ledger materializes, twin
 *   campaign-funds balances agree exactly, and corporation revenue is
 *   identical (the union pass writes no economic state).
 * - Approval still reflects the configured policy (the #319 policy/cash
 *   distinction): the contributing twin trends below the zero-rate twin.
 * - Ghost-only organizer state (banked strength with no recipient record)
 *   fails closed the same way across turns and through a mid-sequence
 *   save/reload: retained, ledger-free, resumable.
 * - A stripped save carrying no sector-worker, organizer, bargaining, or
 *   ledger state advances without throwing and invents no payouts.
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createUnionOrganizer } from "./organizers.js";
import { unionContributionLedger } from "./contributions.js";

const OPTS = { seed: "union-no-organizer-boundary", playerName: "Tester", countryId: "US", era: "1953" } as const;
const STAMP = "2026-01-01T00:00:00Z";
const UNION = "US-manufacturing";
const EMPLOYER = "US-manufacturing";
const TURNS = 6;

type World = ReturnType<typeof createWorld>;

/** Contribution policy set, treasury topped so services stay funded: dues and services identical across twins. */
function policyWorld(pct: number): World {
  const world = createWorld(OPTS);
  const union = world.unions[UNION]!;
  union.treasury = 5000;
  union.duesPerWorkerAnnual = 5;
  union.politicalContributionPct = pct;
  return world;
}

function fundsSnapshot(world: World): { politicians: number[]; player: number } {
  return { politicians: world.politicians.map((p) => p.funds), player: world.player.funds };
}

describe("#114 no-organizer contribution boundary at the public seam", () => {
  it("retains the full requested pool every turn: treasury matches the zero-rate twin exactly", () => {
    const contributing = policyWorld(0.5);
    const baseline = policyWorld(0);
    // Absent stays absent until first ledger access (the accessor below
    // materializes absent-means-empty, so undefined is only asserted here).
    expect(contributing.unionContributionLedger).toBeUndefined();

    for (let turn = 0; turn < TURNS; turn++) {
      advanceTurn(contributing);
      advanceTurn(baseline);
      // The requested pool is never debited: the contributing treasury is
      // exactly the zero-rate treasury, turn after turn.
      expect(contributing.unions[UNION]!.treasury).toBe(baseline.unions[UNION]!.treasury);
      // No organizer state, no ledger rows, ever.
      expect(unionContributionLedger(contributing)).toEqual([]);
      // The union pass writes no campaign-funds state: both twins agree
      // exactly (non-union phases move player funds identically in each).
      expect(fundsSnapshot(contributing)).toEqual(fundsSnapshot(baseline));
      // The union pass writes no economic state: corporation output is
      // identical to the twin that never configured a contribution rate.
      expect(contributing.corporations[EMPLOYER]!.revenue).toBe(
        baseline.corporations[EMPLOYER]!.revenue,
      );
      // Policy still bites without cash moving: the contributing approval
      // never exceeds the zero-rate twin's.
      expect(contributing.unions[UNION]!.approval).toBeLessThanOrEqual(
        baseline.unions[UNION]!.approval,
      );
    }
    // After enough turns the 5-point policy penalty (0.5 rate at the cap)
    // separates approval while treasury stays identical: policy without
    // payout, exactly the #319 distinction.
    expect(contributing.unions[UNION]!.approval).toBeLessThan(
      baseline.unions[UNION]!.approval,
    );
    expect(contributing.unions[UNION]!.treasury).toBe(baseline.unions[UNION]!.treasury);
  });

  it("a mid-sequence save/reload twin resumes the retained boundary identically", () => {
    const live = policyWorld(0.5);
    for (let i = 0; i < 2; i++) advanceTurn(live);
    const resumed = deserializeSave(serializeSave(live, STAMP));
    // The reload itself carries no ledger: absent stays absent through the save.
    expect(resumed.unionContributionLedger).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      advanceTurn(live);
      advanceTurn(resumed);
    }
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(live));
    expect(resumed.unionContributionLedger).toBeUndefined();
  });

  it("ghost-only organizers fail closed across turns and reload: retained, ledger-free, resumable", () => {
    const world = policyWorld(0.5);
    // Banked strength with no recipient record: stale pointer, skipped not paid.
    world.unionOrganizers = {
      "US-manufacturing:ghost": {
        ...createUnionOrganizer(UNION, "ghost", 0),
        strength: 50,
        organizeCount: 3,
      },
    };
    const baseline = policyWorld(0.5);
    const treasuryBefore = baseline.unions[UNION]!.treasury;

    for (let i = 0; i < 2; i++) {
      advanceTurn(world);
      advanceTurn(baseline);
      // Ghost strength buys no debit: treasury tracks the organizer-free twin.
      expect(world.unions[UNION]!.treasury).toBe(baseline.unions[UNION]!.treasury);
      expect(world.unions[UNION]!.treasury).toBeGreaterThanOrEqual(treasuryBefore);
      expect(world.unionContributionLedger).toBeUndefined();
      expect(fundsSnapshot(world)).toEqual(fundsSnapshot(baseline));
    }

    const resumed = deserializeSave(serializeSave(world, STAMP));
    for (let i = 0; i < 2; i++) {
      advanceTurn(world);
      advanceTurn(resumed);
    }
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(world));
    expect(resumed.unionContributionLedger).toBeUndefined();
  });

  it("a stripped save without sector, organizer, bargaining, or ledger state advances without inventing payouts", () => {
    const world = policyWorld(0.5);
    const raw = JSON.parse(serializeSave(world, STAMP)) as {
      world: Record<string, unknown>;
    };
    for (const key of [
      "corporateSectors",
      "unionOrganizers",
      "unionContributionLedger",
      "bargainingCampaigns",
      "collectiveAgreements",
    ]) {
      delete raw.world[key];
    }
    const loaded = deserializeSave(JSON.stringify(raw));
    const treasuryBefore = loaded.unions[UNION]!.treasury;
    expect(() => advanceTurn(loaded)).not.toThrow();
    expect(loaded.meta.turn).toBe(world.meta.turn + 1);
    // Sector state self-heals through the recorded assets (no per-sector
    // data invented: dues price against the re-derived rows), so dues still
    // credit; with no organizers the contribution pool stays in treasury and
    // no ledger or campaign-funds write appears.
    expect(loaded.unions[UNION]!.treasury).toBeGreaterThanOrEqual(treasuryBefore);
    // No payout invented: the ledger stays absent/empty. Campaign-funds and
    // roster movement is out of scope here: advanceTurn spawns candidates
    // through non-union phases, so only the union ledger is asserted.
    expect(loaded.unionContributionLedger).toBeUndefined();
    expect(unionContributionLedger(loaded)).toEqual([]);
    expect(Number.isFinite(loaded.corporations[EMPLOYER]!.revenue)).toBe(true);
  });
});
