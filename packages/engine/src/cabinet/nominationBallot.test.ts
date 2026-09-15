import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import type { CabinetNomination } from "./types.js";
import {
  castCabinetNominationVote,
  computeCabinetNominationTally,
  processCabinetNominationLifecycle,
} from "./nominationLifecycle.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-267", playerName: "Alex" } as const;

function nomination(overrides: Partial<CabinetNomination> = {}): CabinetNomination {
  return {
    id: "cab-nom-1",
    countryId: "US",
    positionId: "secretary_of_state",
    nomineeId: "US-3",
    nomineeName: "Nominee",
    nomineeParty: "US_DEM",
    proposedBy: "US-1",
    proposedByName: "President",
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

describe("#267 cabinet nomination ballots", () => {
  it("recomputes from current country-scoped senators and excludes stale voters", () => {
    const world = createWorld(OPTIONS);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    const usSenator = world.politicians.find((p) => p.countryId === "US" && p.chamberKey === "senate")!;
    const foreignSenator = { ...usSenator, id: "foreign-senator", countryId: "UK" };
    world.politicians.push(foreignSenator);
    const nom = nomination({
      votes: {
        player: "for",
        [`pol_${usSenator.id}`]: "against",
        [`pol_${foreignSenator.id}`]: "for",
        stale: "for",
      },
      votesFor: 99,
      votesAgainst: 99,
    });

    expect(computeCabinetNominationTally(world, nom)).toMatchObject({
      votesFor: 1,
      votesAgainst: 1,
      votesAbstain: 0,
    });
  });

  it("accepts and replaces an eligible player ballot, but rejects the wrong chamber atomically", () => {
    const world = createWorld(OPTIONS);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    world.cabinetNominations = [nomination()];

    expect(castCabinetNominationVote(world, "cab-nom-1", "for")).toMatchObject({ votesFor: 1, votesAgainst: 0 });
    expect(castCabinetNominationVote(world, "cab-nom-1", "against")).toMatchObject({ votesFor: 0, votesAgainst: 1 });

    const before = structuredClone(world.cabinetNominations[0]);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house" };
    expect(() => castCabinetNominationVote(world, "cab-nom-1", "for")).toThrow("Only Senators");
    expect(world.cabinetNominations[0]).toEqual(before);
  });

  it("keeps VP House and Senate ballots separate and rejects closed or invalid ballots", () => {
    const world = createWorld(OPTIONS);
    world.cabinetNominations = [nomination({
      positionId: "vicePresident",
      houseVotes: {},
      houseVotesFor: 0,
      houseVotesAgainst: 0,
      houseVotesAbstain: 0,
    })];
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house" };
    expect(castCabinetNominationVote(world, "cab-nom-1", "for")).toMatchObject({
      votesFor: 0,
      houseVotesFor: 1,
    });
    expect(world.cabinetNominations[0]?.houseVotes?.player).toBe("for");

    const senateWorld = createWorld(OPTIONS);
    senateWorld.cabinetNominations = [nomination({ positionId: "vicePresident", houseVotes: {} })];
    senateWorld.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    expect(castCabinetNominationVote(senateWorld, "cab-nom-1", "against")).toMatchObject({
      votesAgainst: 1,
      houseVotesFor: 0,
    });

    const before = structuredClone(senateWorld.cabinetNominations[0]);
    expect(() => castCabinetNominationVote(senateWorld, "cab-nom-1", "present" as never)).toThrow("Vote must be");
    senateWorld.meta.turn = 4;
    expect(() => castCabinetNominationVote(senateWorld, "cab-nom-1", "for")).toThrow("Voting has ended");
    expect(senateWorld.cabinetNominations[0]).toEqual(before);
  });

  it("uses the current-seat tally for resolution and preserves a pending ballot through save/reload", () => {
    const world = createWorld(OPTIONS);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    world.cabinetNominations = [nomination()];
    castCabinetNominationVote(world, "cab-nom-1", "for");

    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.cabinetNominations[0]?.votes.player).toBe("for");
    restored.meta.turn = 4;
    restored.cabinetNominations[0]!.votesFor = 0;
    restored.cabinetNominations[0]!.votesAgainst = 50;

    processCabinetNominationLifecycle(restored);
    expect(restored.cabinetNominations[0]).toMatchObject({ status: "confirmed", votesFor: 1, votesAgainst: 0 });
    expect(restored.cabinetMembers.some((member) => member.positionId === "secretary_of_state")).toBe(true);
  });
});
