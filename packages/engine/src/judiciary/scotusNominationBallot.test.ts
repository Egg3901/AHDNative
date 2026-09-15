import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import type { ScotusNomination } from "./types.js";
import {
  castScotusNominationVote,
  computeScotusNominationTally,
  ensureScotusSeats,
  processScotusTurn,
} from "./scotusTurn.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-268", playerName: "Alex" } as const;

function nomination(overrides: Partial<ScotusNomination> = {}): ScotusNomination {
  return {
    id: "scotus-nom-1",
    countryId: "US",
    seatNumber: 1,
    nomineeMode: "character",
    nomineeId: "US-10",
    nomineeName: "Nominee",
    nomineeParty: "US_DEM",
    proposedBy: "US-1",
    status: "active",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    votes: {},
    votingEndsOnTurn: 4,
    proposedAtTurn: 0,
    ...overrides,
  };
}

describe("#268 SCOTUS nomination ballots", () => {
  it("reuses current country-scoped Senate tally semantics", () => {
    const world = createWorld(OPTIONS);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate_us" };
    const usSenator = world.politicians.find((politician) => politician.countryId === "US" && politician.chamberKey === "senate")!;
    const foreignSenator = { ...usSenator, id: "foreign-senator", countryId: "UK" };
    world.politicians.push(foreignSenator);
    const nom = nomination({
      votes: {
        player: "for",
        [`pol_${usSenator.id}`]: "against",
        [`pol_${foreignSenator.id}`]: "for",
        stale: "for",
      },
      votesFor: 50,
      votesAgainst: 50,
    });

    expect(computeScotusNominationTally(world, nom)).toEqual({
      votesFor: 1,
      votesAgainst: 1,
      votesAbstain: 0,
    });
  });

  it("accepts and replaces an eligible Senate ballot and rejects invalid contexts atomically", () => {
    const world = createWorld(OPTIONS);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    world.scotusNominations = [nomination()];

    expect(castScotusNominationVote(world, "scotus-nom-1", "for")).toMatchObject({ votesFor: 1, votesAgainst: 0 });
    expect(castScotusNominationVote(world, "scotus-nom-1", "abstain")).toMatchObject({ votesFor: 0, votesAbstain: 1 });

    const before = structuredClone(world.scotusNominations[0]);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house" };
    expect(() => castScotusNominationVote(world, "scotus-nom-1", "for")).toThrow("Only Senators");
    world.player.legislativeSeat = { countryId: "UK", chamberKey: "senate" };
    expect(() => castScotusNominationVote(world, "scotus-nom-1", "for")).toThrow("Only Senators");
    world.meta.turn = 4;
    expect(() => castScotusNominationVote(world, "scotus-nom-1", "for")).toThrow("Voting has ended");
    world.meta.turn = 0;
    world.scotusNominations[0]!.status = "confirmed";
    expect(() => castScotusNominationVote(world, "scotus-nom-1", "for")).toThrow("voting closed");
    expect(() => castScotusNominationVote(world, "stale-nomination", "for")).toThrow("not found");
    world.scotusNominations[0]!.status = "active";
    expect(world.scotusNominations[0]).toEqual(before);
  });

  it("resolves from current votes after save/reload and seats only a confirmed nominee", () => {
    const world = createWorld(OPTIONS);
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats[0]!;
    Object.assign(seat, { justiceMode: null, justiceId: null, justiceName: null, economicLean: null, socialLean: null });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    world.scotusNominations = [nomination()];
    castScotusNominationVote(world, "scotus-nom-1", "for");

    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    restored.meta.turn = 4;
    restored.scotusNominations[0]!.votesFor = 0;
    restored.scotusNominations[0]!.votesAgainst = 50;
    processScotusTurn(restored);

    expect(restored.scotusNominations[0]).toMatchObject({ status: "confirmed", votesFor: 1, votesAgainst: 0 });
    expect(restored.supremeCourtSeats[0]).toMatchObject({ justiceName: "Nominee", justiceMode: "character" });
  });
});
