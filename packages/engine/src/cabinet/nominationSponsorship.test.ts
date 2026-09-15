import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import {
  castCabinetNominationVote,
  processCabinetNominationLifecycle,
  sponsorCabinetNomination,
} from "./nominationLifecycle.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-269", playerName: "President" } as const;

function presidentialWorld() {
  return createWorld({ ...OPTIONS, mode: "hos" as const });
}

describe("#269 presidential cabinet nomination sponsorship", () => {
  it("creates a source-shaped Senate nomination and routes a VP vacancy to both chambers", () => {
    const world = presidentialWorld();
    const nominee = world.politicians.find((candidate) => candidate.countryId === "US")!;
    const regular = sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId: nominee.id });
    expect(regular).toMatchObject({
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
      proposedBy: "player",
      status: "active",
      votingEndsOnTurn: world.meta.turn + 24,
      votes: {},
    });

    const vpNominee = world.politicians.find((candidate) => candidate.countryId === "US" && candidate.id !== nominee.id)!;
    const vp = sponsorCabinetNomination(world, { countryId: "US", positionId: "vicePresident", nomineeId: vpNominee.id });
    expect(vp).toMatchObject({ houseVotes: {}, houseVotesFor: 0, houseVotesAgainst: 0, houseVotesAbstain: 0 });
  });

  it("rejects authority, country, position, vacancy, duplicate, and nominee failures atomically", () => {
    const cases = [
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => { world.executives.US!.presidentId = "US-1"; return () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId }); },
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => () => sponsorCabinetNomination(world, { countryId: "UK", positionId: "foreign_secretary", nomineeId }),
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => () => sponsorCabinetNomination(world, { countryId: "US", positionId: "invented", nomineeId }),
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_hud", nomineeId }),
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => { world.cabinetMembers.push({ countryId: "US", positionId: "secretary_of_state", characterId: "US-9", characterName: "Holder", partyId: null, appointedBy: null, appointedAtTurn: 0, confirmedAtTurn: 0 }); return () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId }); },
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => { sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId }); return () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId: world.politicians.find((p) => p.countryId === "US" && p.id !== nomineeId)!.id }); },
      (world: ReturnType<typeof presidentialWorld>) => () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId: "missing" }),
      (world: ReturnType<typeof presidentialWorld>) => { const foreign = world.politicians.find((candidate) => candidate.countryId !== "US")!; return () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId: foreign.id }); },
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => { world.meta.turn = Number.NaN; return () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId }); },
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => { world.meta.date = "not-a-date"; return () => sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId }); },
      (world: ReturnType<typeof presidentialWorld>) => () => sponsorCabinetNomination(world, { countryId: "US", positionId: "vicePresident", nomineeId: "player" }),
    ];
    for (const arrange of cases) {
      const world = presidentialWorld();
      const nomineeId = world.politicians.find((candidate) => candidate.countryId === "US")!.id;
      const act = arrange(world, nomineeId);
      const before = structuredClone(world.cabinetNominations);
      expect(act).toThrow();
      expect(world.cabinetNominations).toEqual(before);
    }
  });

  it("persists the pending nomination and resolves it later through exported engine boundaries", () => {
    const world = presidentialWorld();
    const nominee = world.politicians.find((candidate) => candidate.countryId === "US")!;
    const nomination = sponsorCabinetNomination(world, { countryId: "US", positionId: "secretary_of_state", nomineeId: nominee.id });
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.cabinetNominations[0]).toEqual(nomination);

    restored.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    castCabinetNominationVote(restored, nomination.id, "for");
    restored.meta.turn = nomination.votingEndsOnTurn;
    processCabinetNominationLifecycle(restored);
    expect(restored.cabinetNominations[0]?.status).toBe("confirmed");
    expect(restored.cabinetMembers).toContainEqual(expect.objectContaining({ positionId: "secretary_of_state", characterId: nominee.id }));
  });
});
