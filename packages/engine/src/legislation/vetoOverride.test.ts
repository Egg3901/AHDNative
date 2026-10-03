import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { Bill } from "./types.js";
import { resolveVetoOverrideTally } from "./billVoteLogic.js";
import { processBillLifecycle } from "./billLifecycle.js";
import { rngFromState } from "../rng.js";

describe("US presidential veto override", () => {
  it("requires a two-thirds seat majority in every elected chamber", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "veto-override-two-chamber", playerName: "President" });
    const chambers = world.legislatures.US!.chambers.filter((chamber) => chamber.elected);
    expect(chambers.map((chamber) => chamber.key)).toEqual(["house", "senate"]);

    const allFor: Record<string, "for" | "against"> = Object.fromEntries(world.politicians
      .filter((politician) => politician.countryId === "US" && politician.retiredAt == null
        && chambers.some((chamber) => chamber.key === politician.chamberKey))
      .map((politician) => [politician.id, "for" as const]));
    const passed = resolveVetoOverrideTally(world, "US", allFor);
    expect(passed.passed).toBe(true);
    expect(passed.byChamber.house.passed).toBe(true);
    expect(passed.byChamber.senate.passed).toBe(true);

    const senateAgainst = { ...allFor };
    for (const politician of world.politicians) {
      if (politician.countryId === "US" && politician.chamberKey === "senate" && politician.retiredAt == null) {
        senateAgainst[politician.id] = "against";
      }
    }
    const failed = resolveVetoOverrideTally(world, "US", senateAgainst);
    expect(failed.byChamber.house.passed).toBe(true);
    expect(failed.byChamber.senate.passed).toBe(false);
    expect(failed.passed).toBe(false);
  });

  it("writes the exact two-chamber result at the public lifecycle boundary", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "veto-override-lifecycle", playerName: "President" });
    const chambers = world.legislatures.US!.chambers.filter((chamber) => chamber.elected);
    const votes: Record<string, "for" | "against"> = Object.fromEntries(world.politicians
      .filter((politician) => politician.countryId === "US" && politician.retiredAt == null
        && chambers.some((chamber) => chamber.key === politician.chamberKey))
      .map((politician) => [politician.id, "for" as const]));
    const bill: Bill = {
      id: "override-lifecycle", title: "Override lifecycle test", summary: "Declared two-chamber ballot fixture.",
      countryId: "US", category: "economy", provisions: [], originChamber: "house", currentChamber: "house",
      status: "veto_override", presidentAction: "vetoed", vetoedByCharacterId: "player", vetoedAtTurn: 0,
      sponsorId: null, sponsorName: "Fixture", sponsorPartyId: null, votes: {}, votesFor: 0, votesAgainst: 0,
      votesAbstain: 0, vetoOverrideVotes: votes, proposedAtTurn: 0, overrideVotingStartedAtTurn: 0,
      overrideVotingEndsOnTurn: 0, filibusterInvocations: [], updatedAtTurn: 0,
    };
    world.bills.push(bill);
    const expected = Object.fromEntries(chambers.map((chamber) => {
      const holders = world.politicians.filter((politician) => politician.countryId === "US" && politician.chamberKey === chamber.key && politician.retiredAt == null);
      const seats = holders.reduce((sum, politician) => sum + (politician.seatsHeld ?? 1), 0);
      return [chamber.key, { for: seats, against: 0, seats }];
    }));
    processBillLifecycle(world, rngFromState(world.meta.rng));
    expect(bill.status).toBe("signed");
    expect(bill.presidentAction).toBe("override");
    expect(bill.overrideDisplaySnapshot).toEqual(expected);
    const resumed = deserializeSave(serializeSave(world, "2026-10-03T12:00:00.000Z"));
    expect(resumed.bills.find((candidate) => candidate.id === bill.id)?.overrideDisplaySnapshot)
      .toEqual(bill.overrideDisplaySnapshot);
  });

  it("persists source-shaped House/Senate snapshots while preserving legacy aggregate history", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "veto-override-snapshot", playerName: "President" });
    const baseBill: Bill = {
      id: "override-snapshot", title: "Override snapshot test", summary: "Declared persistence contract fixture.",
      countryId: "US", category: "economy", provisions: [], originChamber: "house", currentChamber: "house",
      status: "override_failed", sponsorId: null, sponsorName: "Fixture", sponsorPartyId: null,
      votes: {}, votesFor: 0, votesAgainst: 0, votesAbstain: 0, proposedAtTurn: 0,
      filibusterInvocations: [], updatedAtTurn: 0,
      overrideDisplaySnapshot: { for: 10, against: 5, seats: 20 },
    };
    world.bills.push(baseBill);
    const legacy = deserializeSave(serializeSave(world, "2026-10-03T12:00:00.000Z"));
    expect(legacy.bills[0]?.overrideDisplaySnapshot).toEqual({ for: 10, against: 5, seats: 20 });

    const sourceSnapshot = {
      house: { for: 290, against: 100, seats: 435 },
      senate: { for: 70, against: 20, seats: 100 },
    } as const;
    world.bills[0]!.overrideDisplaySnapshot = sourceSnapshot;
    const resumed = deserializeSave(serializeSave(world, "2026-10-03T12:00:00.000Z"));
    expect(resumed.bills[0]?.overrideDisplaySnapshot).toEqual(sourceSnapshot);

    const malformed = JSON.parse(serializeSave(world, "2026-10-03T12:00:00.000Z")) as { world: { bills: Array<Record<string, unknown>> } };
    malformed.world.bills[0]!["overrideDisplaySnapshot"] = { house: { for: 290, against: 100, seats: 435, guessed: true }, senate: sourceSnapshot.senate };
    expect(() => deserializeSave(JSON.stringify(malformed))).toThrow(/invalid bill override display snapshot/i);
  });

});
