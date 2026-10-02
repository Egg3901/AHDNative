import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";

function homeStateSeats(world: ReturnType<typeof createWorld>, countryId: string, chamberKey: string, partyId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const politician of world.politicians) {
    if (politician.countryId !== countryId || politician.chamberKey !== chamberKey || politician.partyId !== partyId) continue;
    expect(politician.homeState).toBeDefined();
    counts[politician.homeState!] = (counts[politician.homeState!] ?? 0) + 1;
  }
  return counts;
}

function expectCompleteChamberHomes(world: ReturnType<typeof createWorld>, countryId: string, chamberKey: string, seats: number): void {
  const holders = world.politicians.filter((politician) => politician.countryId === countryId && politician.chamberKey === chamberKey);
  expect(holders).toHaveLength(seats);
  expect(holders.every((politician) => politician.homeState !== undefined)).toBe(true);
}

describe("source NPP homeState seed", () => {
  it("expands authored DE/CN historical seat rows onto the Native roster and keeps homes across save/reload", () => {
    // Independent source oracle: Game getPresetSeats(era-default), after
    // splitCNNPCDelegates, expanded each row's seatsHeld. See the dated private
    // evidence record; these vectors are intentionally literal here.
    const de = createWorld({ seed: "source-home-state-de", playerName: "Player", countryId: "DE", era: "2019" });
    expectCompleteChamberHomes(de, "DE", "bundestag", 201);
    expect(homeStateSeats(de, "DE", "bundestag", "DE_SPD").BW).toBe(7);
    expect(homeStateSeats(de, "DE", "bundestag", "DE_CSU").BY).toBe(12);

    expect(() => createWorld({ seed: "source-home-state-de-1991", playerName: "Player", countryId: "DE", era: "1991" }))
      .toThrow("Country DE is not playable in era 1991");

    const cn2019 = createWorld({ seed: "source-home-state-cn-2019", playerName: "Player", countryId: "CN", era: "2019" });
    expectCompleteChamberHomes(cn2019, "CN", "npc", 2980);
    expect(homeStateSeats(cn2019, "CN", "npc", "CN_CCP").DB).toBe(225);
    expect(homeStateSeats(cn2019, "CN", "npc", "CN_CDL").DB).toBe(8);
    expect(homeStateSeats(cn2019, "CN", "npc", "CN_CNDCA").DB).toBe(5);

    const cn1991 = createWorld({ seed: "source-home-state-cn-1991", playerName: "Player", countryId: "CN", era: "1991" });
    expectCompleteChamberHomes(cn1991, "CN", "npc", 2980);
    expect(homeStateSeats(cn1991, "CN", "npc", "CN_CCP").DB).toBe(231);
    expect(homeStateSeats(cn1991, "CN", "npc", "CN_CDL").DB).toBe(5);
    expect(homeStateSeats(cn1991, "CN", "npc", "CN_CNDCA").DB).toBe(2);

    for (const world of [de, cn2019, cn1991]) {
      const rosterIdentity = world.politicians.map((politician) => `${politician.id}:${politician.partyId}`).sort();
      const restored = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
      expect(restored.politicians.map((politician) => `${politician.id}:${politician.partyId}`).sort()).toEqual(rosterIdentity);
      expect(restored.politicians.map((politician) => `${politician.id}:${politician.homeState}`).sort())
        .toEqual(world.politicians.map((politician) => `${politician.id}:${politician.homeState}`).sort());
    }
  });

  it("leaves legacy saves without source provenance unchanged instead of inferring homes from elected seats", () => {
    const world = createWorld({ seed: "legacy-home-state-preservation", playerName: "Player", countryId: "CN", era: "2019" });
    const voter = world.politicians.find((politician) => politician.countryId === "CN" && politician.chamberKey === "npc")!;
    for (const politician of world.politicians) delete politician.homeState;
    const originalIdentity = world.politicians.map((politician) => `${politician.id}:${politician.partyId}`).sort();
    const ballot = { [voter.id]: "against" as const };
    world.bills.push({
      id: "legacy-ballot",
      title: "Legacy ballot",
      summary: "Preserve an existing saved vote without inventing home geography",
      countryId: "CN",
      category: "economic",
      provisions: [],
      originChamber: "npc",
      currentChamber: "npc",
      status: "active",
      sponsorId: null,
      sponsorName: "",
      sponsorPartyId: null,
      votes: ballot,
      votesFor: 0,
      votesAgainst: 1,
      votesAbstain: 0,
      proposedAtTurn: world.meta.turn,
      filibusterInvocations: [],
      updatedAtTurn: world.meta.turn,
    });

    const restored = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(restored.politicians.map((politician) => `${politician.id}:${politician.partyId}`).sort()).toEqual(originalIdentity);
    expect(restored.politicians.every((politician) => politician.homeState === undefined)).toBe(true);
    expect(restored.bills[0]?.votes).toEqual(ballot);
  });
});
