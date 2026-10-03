import { describe, expect, it, vi } from "vitest";
import { advanceTurn, createWorld, deserializeSave, serializeSave } from "../index.js";

describe("primary scoring during an ordinary world turn", () => {
  it("bounds full-roster searches while recording the seeded primary field", () => {
    const world = createWorld({ seed: "primary-roster-search-budget", playerName: "Player", countryId: "US", era: "1953" });
    // The first ordinary turn schedules the authored national races. The
    // next one records their live primary field, without calendar edits.
    advanceTurn(world);
    const searches = vi.spyOn(world.politicians, "find");
    let previousSearchCount = 0;
    let primaryPhaseSearchCount: number | undefined;

    advanceTurn(world, {
      afterPhase(name) {
        const currentSearchCount = searches.mock.calls.length;
        if (name === "voteAccumulation") primaryPhaseSearchCount = currentSearchCount - previousSearchCount;
        previousSearchCount = currentSearchCount;
      },
    });
    searches.mockRestore();

    const primarySnapshots = world.elections.flatMap((election) => election.primarySnapshots ?? []);
    const scoredCandidates = primarySnapshots.flatMap((snapshot) => Object.values(snapshot.byParty).flat());
    expect(world.meta.turn).toBe(2);
    expect(scoredCandidates.length).toBeGreaterThan(1000);
    // A global roster search per candidate makes a full authored primary
    // field quadratic. The public phase must use a bounded number of those
    // searches; elapsed time would make this regression depend on hardware.
    expect(primaryPhaseSearchCount).toBeLessThanOrEqual(1);

    const stamp = "2026-10-02T21:10:00.000Z";
    const reloaded = deserializeSave(serializeSave(world, stamp));
    expect(reloaded).toEqual(world);
  }, 90_000);
});
