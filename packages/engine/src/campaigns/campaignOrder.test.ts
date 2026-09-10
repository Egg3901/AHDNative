import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";

/**
 * M04 campaign same-turn correction (source: AHDGame e364c0495).
 * turnPhaseNames.ts runs campaignTurn BEFORE voteAccumulation and
 * campaignSpendReset AFTER it, same turn. The tally therefore reads this
 * turn's spend (fundsByParty: spendStock + spendThisTurn) and this turn's
 * favorability-derived support. Native ran the whole campaign cluster at
 * the tail after electionResolution, so spend/support reached the tally
 * one turn late, and a race resolving this turn never saw its final tick
 * at all (resolution archives the campaign before the tail tick runs).
 *
 * Public-contract test only: createWorld, advanceTurn (with the
 * afterPhase observer), serialize/deserialize. RED until the registry
 * moves the source-backed causal edges.
 */

const OPTS = {
  seed: "campaign-order-depth",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

interface Fixture {
  electionId: string;
  campaignId: string;
  candidateId: string;
  generatedBefore: number;
}

/** One setup turn (timers spawn + fill candidates/campaigns), then force a final-turn race. */
function setupFinalTurnRace(): { world: ReturnType<typeof createWorld>; fix: Fixture } {
  const world = createWorld(OPTS);
  advanceTurn(world); // turn 1
  expect(world.meta.turn).toBe(1);

  const rec = world.elections
    .filter(
      (e) =>
        e.status === "active" &&
        e.countryId === "US" &&
        e.electionType === "house" &&
        e.state !== undefined &&
        e.candidates.length > 0,
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  expect(rec, "expected an active US house race after the first turn").toBeDefined();

  const camp = Object.values(world.campaigns)
    .filter((c) => c.electionId === rec!.id && c.candidateIsNPP && c.status === "active")
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  expect(camp, "expected an active NPP campaign in the race").toBeDefined();

  // Media lever on: guarantees nonzero maintenance (spend) and a positive
  // favorability tick (support). Starter-only stays solvent at house scale
  // (income 6000 anchor vs ~1800 maintenance), so no auto-downgrade noise.
  camp!.mediaSpendingTree = { starter: true, a: 0, b: 0, c: 0 };
  // Isolate same-turn visibility: drop any previous-turn spend carryover.
  camp!.spendThisTurn = 0;
  // Focused-fixture support row (generated challengers carry none; the
  // tally defaults a missing row to 50, same value seeded here).
  world.candidateSupports[camp!.candidateId] ??= {
    id: camp!.candidateId,
    partyId: camp!.partyId,
    countryId: camp!.countryId,
    support: 50,
    supportAccrual: [],
    status: "active",
  };
  world.candidateSupports[camp!.candidateId]!.support = 50;
  world.candidateSupports[camp!.candidateId]!.status = "active";

  // Observed advance (1 -> 2) is this race's final turn: tally accumulates
  // (2 > primaryEndTurn, 2 <= endTurn) then resolution fires (2 >= endTurn).
  rec!.primaryEndTurn = 0;
  rec!.endTurn = 2;

  return {
    world,
    fix: {
      electionId: rec!.id,
      campaignId: camp!.id,
      candidateId: camp!.candidateId,
      generatedBefore: camp!.totalFundsGenerated,
    },
  };
}

function observeTurn(world: ReturnType<typeof createWorld>, campaignId: string) {
  const seen: Record<string, { spend: number; support: number }> = {};
  advanceTurn(world, {
    afterPhase(name, w) {
      if (name === "supportAccrual" || name === "voteAccumulation") {
        seen[name] = {
          spend: w.campaigns[campaignId]!.spendThisTurn,
          support: w.candidateSupports[world.campaigns[campaignId]!.candidateId]!.support,
        };
      }
    },
  });
  return seen;
}

describe("campaign order depth (source-backed same-turn edges)", () => {
  it("tally reads this turn's campaign spend and media support, then reset clears the interval", () => {
    const { world, fix } = setupFinalTurnRace();
    const seen = observeTurn(world, fix.campaignId);

    // Spend accrued by this turn's campaign tick (maintenance + NPC
    // upgrade purchases) is what voteAccumulation's fundsByParty reads.
    expect(seen["voteAccumulation"]!.spend).toBeGreaterThan(0);
    // Media favorability tick lands in candidateSupports before the tally
    // reads it (nothing between supportAccrual and voteAccumulation writes
    // support; NPP campaign actions only queue next-turn accrual entries).
    expect(seen["voteAccumulation"]!.support).toBeGreaterThan(seen["supportAccrual"]!.support);
    // Reset runs after the tally, so the next interval starts fresh.
    expect(world.campaigns[fix.campaignId]!.spendThisTurn).toBe(0);
  });

  it("final-turn tick applies before resolution archives the campaign", () => {
    const { world, fix } = setupFinalTurnRace();
    observeTurn(world, fix.campaignId);

    const rec = world.elections.find((e) => e.id === fix.electionId)!;
    expect(rec.status).toBe("resolved");
    expect(world.campaigns[fix.campaignId]!.status).toBe("archived");
    // The archived campaign still earned this turn's income: its final tick
    // ran before the tally/resolution, as in mainline (campaignTurn precedes
    // voteAccumulation; resolution deletes the row afterwards).
    expect(world.campaigns[fix.campaignId]!.totalFundsGenerated).toBeGreaterThan(fix.generatedBefore);
  });

  it("corrected ordering survives a save/resume round trip mid-race", () => {
    const { world, fix } = setupFinalTurnRace();
    const seenLive = observeTurn(world, fix.campaignId);
    const liveJson = JSON.stringify(world);

    const { world: other, fix: otherFix } = setupFinalTurnRace();
    const reloaded = deserializeSave(serializeSave(other, "2026-09-10T00:00:00.000Z"));
    const seenResumed = observeTurn(reloaded, otherFix.campaignId);

    expect(seenResumed).toEqual(seenLive);
    expect(JSON.stringify(reloaded)).toBe(liveJson);
  });
});
