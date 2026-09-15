import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { castScotusNominationVote, ensureScotusSeats, processScotusTurn } from "./scotusTurn.js";
import { sponsorScotusNomination } from "./scotusSponsorship.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-270", playerName: "President" } as const;

function presidentialWorld() {
  return createWorld({ ...OPTIONS, mode: "hos" as const });
}

function vacateSeat(world: ReturnType<typeof presidentialWorld>, seatNumber: number) {
  ensureScotusSeats(world);
  const seat = world.supremeCourtSeats.find((candidate) => candidate.seatNumber === seatNumber)!;
  Object.assign(seat, {
    justiceMode: null,
    justiceId: null,
    justiceName: null,
    justiceParty: null,
    economicLean: null,
    socialLean: null,
    seatedAtTurn: null,
    divergentHazardStartsTurn: null,
  });
  return seat;
}

describe("#270 presidential SCOTUS nomination sponsorship", () => {
  it("sponsors a source-shaped Senate nomination for a vacant seat", () => {
    const world = presidentialWorld();
    vacateSeat(world, 1);
    const nominee = world.politicians.find((candidate) => candidate.countryId === "US")!;
    const nomination = sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId: nominee.id });
    expect(nomination).toMatchObject({
      countryId: "US",
      seatNumber: 1,
      nomineeMode: "character",
      nomineeId: nominee.id,
      nomineeName: nominee.name,
      proposedBy: "player",
      status: "active",
      votingEndsOnTurn: world.meta.turn + 24,
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      proposedAtTurn: world.meta.turn,
    });
  });

  it("rejects authority, country, seat, vacancy, duplicate, and nominee failures atomically", () => {
    const cases = [
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => { world.executives.US!.presidentId = "US-1"; return () => sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId }); },
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => () => sponsorScotusNomination(world, { countryId: "UK", seatNumber: 1, nomineeId }),
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => () => sponsorScotusNomination(world, { countryId: "US", seatNumber: 99, nomineeId }),
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => () => sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId }),
      (world: ReturnType<typeof presidentialWorld>, nomineeId: string) => { vacateSeat(world, 1); sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId }); return () => sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId: world.politicians.find((p) => p.countryId === "US" && p.id !== nomineeId)!.id }); },
      (world: ReturnType<typeof presidentialWorld>) => { vacateSeat(world, 1); return () => sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId: "missing" }); },
      (world: ReturnType<typeof presidentialWorld>) => { vacateSeat(world, 1); const foreign = world.politicians.find((candidate) => candidate.countryId !== "US")!; return () => sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId: foreign.id }); },
    ];
    for (const arrange of cases) {
      const world = presidentialWorld();
      const nomineeId = world.politicians.find((candidate) => candidate.countryId === "US")!.id;
      const act = arrange(world, nomineeId);
      const before = structuredClone(world.scotusNominations);
      expect(act).toThrow();
      expect(world.scotusNominations).toEqual(before);
    }
  });

  it("persists the pending nomination and seats it after Senate confirmation", () => {
    const world = presidentialWorld();
    vacateSeat(world, 1);
    const nominee = world.politicians.find((candidate) => candidate.countryId === "US")!;
    const nomination = sponsorScotusNomination(world, { countryId: "US", seatNumber: 1, nomineeId: nominee.id });
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.scotusNominations[0]).toEqual(nomination);

    restored.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    castScotusNominationVote(restored, nomination.id, "for");
    restored.meta.turn = nomination.votingEndsOnTurn;
    processScotusTurn(restored);
    expect(restored.scotusNominations[0]).toMatchObject({ status: "confirmed" });
    expect(restored.supremeCourtSeats.find((seat) => seat.seatNumber === 1)).toMatchObject({
      justiceName: nominee.name,
      justiceMode: "character",
    });
  });

  it("records a Senate rejection without seating the nominee", () => {
    const world = presidentialWorld();
    vacateSeat(world, 2);
    const nominee = world.politicians.find((candidate) => candidate.countryId === "US")!;
    const nomination = sponsorScotusNomination(world, { countryId: "US", seatNumber: 2, nomineeId: nominee.id });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    castScotusNominationVote(world, nomination.id, "against");
    world.meta.turn = nomination.votingEndsOnTurn;
    processScotusTurn(world);
    expect(world.scotusNominations[0]).toMatchObject({ status: "rejected" });
    expect(world.supremeCourtSeats.find((seat) => seat.seatNumber === 2)).toMatchObject({ justiceMode: null, justiceName: null });
  });
});
