import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { Campaign, WorldState } from "../types.js";

const OPTIONS = { seed: "distributor-p0", playerName: "Tester", countryId: "US", era: "1953" } as const;
const DEMOCRATS = "US_DEM";

function setupRace(): { world: WorldState; raceId: string } {
  const world = createWorld(OPTIONS);
  for (let i = 0; i < 300; i += 1) {
    advanceTurn(world);
    const race = world.elections.find(
      (e) =>
        e.status === "active" &&
        e.countryId === "US" &&
        e.electionType === "house" &&
        world.meta.turn === e.primaryEndTurn &&
        new Set(e.candidates.map((candidate) => candidate.partyId)).size >= 2,
    );
    if (race) return { world, raceId: race.id };
  }
  throw new Error("no two-party US house race scheduled within 300 turns");
}

function setPartyStock(world: WorldState, raceId: string, partyId: string, spendStock: number): void {
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.electionId === raceId && campaign.partyId === partyId) {
      Object.assign(campaign as Campaign, { spendStock });
    }
  }
}

function raceTotals(world: WorldState, raceId: string): Record<string, number> {
  const race = world.elections.find((e) => e.id === raceId);
  if (!race) throw new Error(`race ${raceId} disappeared`);
  return { ...race.tally };
}

describe("election persuasion distributor", () => {
  it("changes saved vote totals when a real campaign stock input changes", () => {
    const { world, raceId } = setupRace();
    const filingClose = serializeSave(world, new Date(0).toISOString());

    const run = (stock: number): { world: WorldState; totals: Record<string, number> } => {
      const candidateWorld = deserializeSave(filingClose);
      setPartyStock(candidateWorld, raceId, DEMOCRATS, stock);
      advanceTurn(candidateWorld);
      return { world: candidateWorld, totals: raceTotals(candidateWorld, raceId) };
    };

    const low = run(0);
    const high = run(2_000_000);
    const lowSum = Object.values(low.totals).reduce((sum, votes) => sum + votes, 0);
    const highSum = Object.values(high.totals).reduce((sum, votes) => sum + votes, 0);

    expect(Object.keys(low.totals).sort()).toEqual(Object.keys(high.totals).sort());
    // The source tally rounds each candidate's increment independently. The
    // unrounded distributor conserves the pool exactly; integer storage can
    // differ by at most one vote per candidate between redistributions.
    expect(Math.abs(highSum - lowSum)).toBeLessThanOrEqual(Object.keys(low.totals).length);
    expect(high.totals).not.toEqual(low.totals);
    const democraticCandidates = high.world.elections
      .find((e) => e.id === raceId)!
      .candidates.filter((candidate) => candidate.partyId === DEMOCRATS)
      .map((candidate) => candidate.id);
    expect(democraticCandidates.length).toBeGreaterThan(0);
    const highDemocraticVotes = democraticCandidates.reduce((sum, id) => sum + (high.totals[id] ?? 0), 0);
    const lowDemocraticVotes = democraticCandidates.reduce((sum, id) => sum + (low.totals[id] ?? 0), 0);
    expect(highDemocraticVotes).toBeGreaterThan(lowDemocraticVotes);
  });

  it("preserves outcome determinism through save reload", () => {
    const { world, raceId } = setupRace();
    const filingClose = serializeSave(world, new Date(0).toISOString());
    const first = deserializeSave(filingClose);
    setPartyStock(first, raceId, DEMOCRATS, 2_000_000);
    const reloaded = deserializeSave(serializeSave(first, new Date(0).toISOString()));
    advanceTurn(first);
    advanceTurn(reloaded);
    expect(raceTotals(reloaded, raceId)).toEqual(raceTotals(first, raceId));
  });
});
