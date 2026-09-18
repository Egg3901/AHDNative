import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { ensureCampaignsForElection } from "../campaigns/lifecycle.js";
import { runVoteAccumulation } from "./orchestration.js";
import type { ElectionRecord } from "./types.js";
import type { WorldState } from "../types.js";

/**
 * #141: the presidential per-state tally must honor the same canvass/GOTV
 * turnout modifiers the down-ballot path already threads through. Reference:
 * AHDGame `src/lib/presidentialElectionEngine.ts` resolves per-state turnout
 * "with GOTV/canvassing/suppression modifiers applied".
 */

const OPTS = { seed: "president-canvass", playerName: "Tester", countryId: "US", era: "1953" } as const;
const RACE_ID = "president:US:-:c-canvass";

function setupRace(): { world: WorldState; race: ElectionRecord; groupIds: string[] } {
  const world = createWorld(OPTS);
  const dem = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_DEM")!;
  const rep = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_REP")!;
  const race: ElectionRecord = {
    id: RACE_ID,
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 5,
    endTurn: 20,
    totalSeats: 1,
    chamberKey: "president",
    candidates: [
      { id: dem.id, name: dem.name, partyId: "US_DEM", isNPP: true, incumbent: false },
      { id: rep.id, name: rep.name, partyId: "US_REP", isNPP: true, incumbent: false },
    ],
    tally: {},
  };
  world.elections = [race];
  world.meta.turn = 6;
  ensureCampaignsForElection(world, race);
  // Boost every demographic group so the per-group live-turnout shift is
  // unambiguous in every state, regardless of per-state weighting.
  const groupIds = Object.keys(world.stateDemographics["CA"]!.groups);
  return { world, race, groupIds };
}

function canvassEverywhere(world: WorldState, groupIds: string[], boost: number): void {
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.electionId !== RACE_ID || campaign.status !== "active") continue;
    campaign.canvassModifiers = Object.fromEntries(groupIds.map((groupId) => [`test:${groupId}`, boost]));
  }
}

function totalsOf(world: WorldState): Record<string, number> {
  return { ...world.elections.find((e) => e.id === RACE_ID)!.tally };
}

describe("presidential per-state tally honors canvass turnout modifiers", () => {
  it("moves saved per-state and national totals when canvass modifiers change", () => {
    const { world, groupIds } = setupRace();
    const snap = serializeSave(world, new Date(0).toISOString());

    const plain = deserializeSave(snap);
    runVoteAccumulation(plain, rngFromSeed("canvass-pool"));

    const canvassed = deserializeSave(snap);
    canvassEverywhere(canvassed, groupIds, 25);
    runVoteAccumulation(canvassed, rngFromSeed("canvass-pool"));

    const plainRace = plain.elections.find((e) => e.id === RACE_ID)!;
    const canvassedRace = canvassed.elections.find((e) => e.id === RACE_ID)!;
    // Real per-state Electoral College path ran on both sides.
    expect(Object.keys(plainRace.stateTallyStates ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(canvassedRace.stateTallyStates ?? {}).length).toBeGreaterThan(0);

    const plainTotals = totalsOf(plain);
    const canvassedTotals = totalsOf(canvassed);
    expect(canvassedTotals).not.toEqual(plainTotals);
    const sum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);
    // The boost rides the per-group live turnouts (`byGroup`) the tally core
    // consumes (`accumulateVoteTurn.ts`), so a uniform GOTV push grows every
    // state's counted votes. The national pool-reader total stays invariant
    // in this pack (category weights are keyed by category, so the weighted
    // average falls back to neutral); the per-group channel is what moves.
    expect(sum(canvassedTotals)).toBeGreaterThan(sum(plainTotals));
  });

  it("stays deterministic across save/reload with modifiers present", () => {
    const { world, groupIds } = setupRace();
    canvassEverywhere(world, groupIds, 25);
    const snap = serializeSave(world, new Date(0).toISOString());

    const first = deserializeSave(snap);
    const second = deserializeSave(snap);
    runVoteAccumulation(first, rngFromSeed("canvass-determinism"));
    runVoteAccumulation(second, rngFromSeed("canvass-determinism"));

    expect(totalsOf(second)).toEqual(totalsOf(first));
  });
});
