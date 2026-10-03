import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { applyPresidentialResolution } from "./presidentialResolution.js";
import { electoralVoteUnitsForWorld } from "./presidentialElectoralCollege.js";
import type { ElectionRecord } from "./types.js";

function subsetWithTotal(values: Array<{ id: string; ev: number }>, target: number): Set<string> {
  const reachable = new Map<number, string[]>();
  reachable.set(0, []);
  for (const value of values) {
    for (const [sum, chosen] of [...reachable.entries()].sort((a, b) => b[0] - a[0])) {
      const next = sum + value.ev;
      if (next <= target && !reachable.has(next)) reachable.set(next, [...chosen, value.id]);
    }
  }
  const result = reachable.get(target);
  if (!result) throw new Error(`No exact electoral-unit subset totals ${target}`);
  return new Set(result);
}

describe("presidential EC resolved save", () => {
  it("serializes a first-seen unit tie and exact overall tie through contingent resolution", () => {
    const world = createWorld({ seed: "ec-overall-tie-source", playerName: "Tester", countryId: "US", era: "1979" });
    const units = electoralVoteUnitsForWorld(world, "US");
    expect(units.reduce((sum, unit) => sum + unit.ev, 0)).toBe(538);
    const wyoming = units.find((unit) => unit.unitId === "WY");
    expect(wyoming?.ev).toBe(3);
    const nonWyoming = units.filter((unit) => unit.unitId !== "WY").map((unit) => ({ id: unit.unitId, ev: unit.ev }));
    const awardedToA = subsetWithTotal(nonWyoming, 266);

    const race: ElectionRecord = {
      id: "president:US:-:source-exact-overall-tie",
      electionType: "president",
      countryId: "US",
      cycle: 1,
      status: "active",
      startTurn: 1,
      primaryEndTurn: 100,
      endTurn: 192,
      totalSeats: 1,
      chamberKey: "president",
      candidates: [
        { id: "A", name: "Candidate A", partyId: "US_DEM", isNPP: false, incumbent: false },
        { id: "B", name: "Candidate B", partyId: "US_REP", isNPP: false, incumbent: false },
      ],
      tally: { A: 1, B: 1 },
      stateTallyStates: Object.fromEntries(units.map((unit) => [
        unit.unitId,
        { totalVotes: unit.unitId === "WY"
          ? { A: 100, B: 100 }
          : awardedToA.has(unit.unitId) ? { A: 101, B: 100 } : { A: 100, B: 101 } },
      ])),
    };
    world.elections = [race];

    applyPresidentialResolution(world, race);

    expect(race.electoralCollegeResult).toMatchObject({
      stateWinners: { WY: "A" },
      evByCandidate: { A: 269, B: 269 },
      totalEv: 538,
      resolutionMode: "contingent_deadlock",
    });
    expect(race.status).toBe("resolved");
    expect(race.winners).toHaveLength(1);

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00Z"));
    const resumedRace = resumed.elections[0]!;
    expect(resumedRace.electoralCollegeResult).toEqual(race.electoralCollegeResult);
    expect(resumedRace.winners).toEqual(race.winners);
    expect(resumed.executives.US?.presidentId).toBe(race.winners![0]);
  });
});
