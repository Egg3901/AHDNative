import { describe, expect, it } from "vitest";
import { getPackByEra } from "@ahdclient/content";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";

describe("Eastern Bloc natural-calendar journey", () => {
  it("activates, tallies, resolves, and continues through save/reload on ordinary turns", () => {
    const seed = "eastern-bloc-natural-1953-source-journey-01";
    const source = getPackByEra("1953")!.backgroundElections!.find((row) => row.countryId === "PL")!;
    const sourceRegion = source.regions.find((row) => row.id === "PL_MAZ")!;
    let world = createWorld({ seed, playerName: "Player", countryId: "US", era: "1953", autonomyLevel: "off" });
    let rngAtSave: number[] | undefined;
    for (let index = 0; index < 96; index++) {
      advanceTurn(world);
      if (world.meta.turn === 48) {
        const inProgress = world.elections.find((row) => row.countryId === "PL" && row.state === "PL_MAZ")!;
        expect(inProgress.startTurn).toBe(1);
        expect(inProgress.endTurn).toBe(96);
        expect(inProgress.status).toBe("active");
        expect(Object.values(inProgress.tally).reduce((sum, votes) => sum + votes, 0)).toBeGreaterThan(0);

        rngAtSave = [...world.meta.rng];
        const savedAtTurn = world.meta.turn;
        const resumed = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
        expect(resumed.meta.turn).toBe(savedAtTurn);
        expect(resumed.meta.rng).toEqual(rngAtSave);
        const resumedElection = resumed.elections.find((row) => row.countryId === "PL" && row.state === "PL_MAZ")!;
        expect(resumedElection).toMatchObject({
          id: inProgress.id,
          status: "active",
          startTurn: 1,
          endTurn: 96,
          tally: inProgress.tally,
          candidates: inProgress.candidates,
        });
        world = resumed;
      }
    }

    expect(world.meta.turn).toBe(96);
    const resolved = world.elections.find((row) => row.countryId === "PL" && row.state === "PL_MAZ")!;
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedTurn).toBe(96);
    expect(Object.values(resolved.tally).reduce((sum, votes) => sum + votes, 0)).toBeGreaterThan(0);
    expect(resolved.winners?.length).toBeGreaterThan(0);
    const holders = world.politicians.filter((politician) => resolved.winners?.includes(politician.id));
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.every((holder) => holder.countryId === "PL" && holder.electedState === "PL_MAZ")).toBe(true);
    expect(holders.reduce((sum, holder) => sum + (holder.seatsHeld ?? 1), 0)).toBe(sourceRegion.seats);
    const chamber = world.legislatures.PL!.chambers[0]!;
    expect(chamber.composition.seatsByParty[source.party.id]).toBe(460);

    const resumed = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
    const savedElection = resumed.elections.find((row) => row.id === resolved.id)!;
    expect(savedElection).toMatchObject({
      id: resolved.id,
      status: "resolved",
      resolvedTurn: 96,
      winners: resolved.winners,
      tally: resolved.tally,
      totalSeats: sourceRegion.seats,
    });
    expect(resumed.politicians.filter((politician) => resolved.winners?.includes(politician.id))).toEqual(holders);
    expect(resumed.legislatures.PL!.chambers[0]!.composition.seatsByParty[source.party.id]).toBe(460);

    console.info("EASTERN_BLOC_NATURAL_JOURNEY", JSON.stringify({
      source: {
        gameCommit: "b769e1141f0c0b8aa55f48fe45c8f2e1025a0ea6",
        currentEquivalentCommit: "283fa48a53e0efa856510e44acb9714ec43875c2",
        seed,
        era: "1953",
        country: source.countryId,
        electionType: source.electionType,
        party: source.party,
        region: sourceRegion,
      },
      journey: {
        turns: world.meta.turn,
        turn48Rng: rngAtSave,
        election: {
          id: resolved.id,
          status: resolved.status,
          startTurn: resolved.startTurn,
          endTurn: resolved.endTurn,
          resolvedTurn: resolved.resolvedTurn,
          totalSeats: resolved.totalSeats,
          tally: resolved.tally,
          winners: resolved.winners,
          holders: holders.map((holder) => ({ id: holder.id, partyId: holder.partyId, seatsHeld: holder.seatsHeld ?? 1 })),
        },
        partyComposition: chamber.composition.seatsByParty[source.party.id],
        savedComposition: resumed.legislatures.PL!.chambers[0]!.composition.seatsByParty[source.party.id],
      },
    }));
  }, 240_000);
});
