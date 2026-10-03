import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { loadContingentElectionDataPlain } from "../electionEngine/resolution/contingentData.js";
import { buildContingentInputs } from "./presidentialResolution.js";
import type { ElectionRecord } from "./types.js";

const OPTS = { seed: "president-contingent-input-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

function baseRecord(overrides: Partial<ElectionRecord> = {}): ElectionRecord {
  return {
    id: "president:US:-:c1",
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: 1,
    primaryEndTurn: 100,
    endTurn: 192,
    totalSeats: 1,
    chamberKey: "president",
    candidates: [],
    tally: {},
    ...overrides,
  };
}

describe("source contingent ballot input projection", () => {
  it("passes weighted elected House holders and the player's known House state into the source delegation loader", () => {
    const world = createWorld(OPTS);
    const houseHolder = world.politicians.find((p) => p.chamberKey === "house")!;
    const candidates = world.politicians.filter((p) => p.id !== houseHolder.id).slice(0, 3);
    expect(candidates).toHaveLength(3);
    for (const politician of world.politicians) politician.chamberKey = "";
    houseHolder.chamberKey = "house";
    houseHolder.electedState = "CA";
    houseHolder.partyId = "US_REP";
    houseHolder.seatsHeld = 3;
    houseHolder.ideology = { economic: 2, social: 2 };
    candidates[0]!.partyId = "US_DEM";
    candidates[0]!.ideology = { economic: -2, social: -2 };
    candidates[1]!.partyId = "US_REP";
    candidates[1]!.ideology = { economic: 2, social: 2 };
    candidates[2]!.partyId = "independent";
    candidates[2]!.ideology = { economic: 0, social: 0 };
    world.player.partyId = "US_DEM";
    world.player.policies = { economic: -2, social: -2 };
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house", regionId: "CA", seatsHeld: 2 };
    const rec = baseRecord({
      candidates: candidates.map((candidate) => ({
        id: candidate.id, name: candidate.name, partyId: candidate.partyId, isNPP: false, incumbent: false,
      })),
      tally: Object.fromEntries(candidates.map((candidate) => [candidate.id, 1])),
    });

    const inputs = buildContingentInputs(world, rec);
    expect(inputs.houseOfficials.find((official) => official._id === houseHolder.id)).toMatchObject({
      state: "CA", seatsHeld: 3,
    });
    expect(inputs.houseOfficials.find((official) => official._id === "player")).toMatchObject({
      state: "CA", party: "US_DEM", characterId: "player", seatsHeld: 2,
    });

    const loaded = loadContingentElectionDataPlain({
      ...inputs,
      electoralVotesByCandidate: Object.fromEntries(candidates.map((candidate) => [candidate.id, 10])),
      npps: [],
      frozenChamber: null,
      capturedAt: new Date(0),
    });
    expect(loaded.houseDelegations.find((delegation) => delegation.stateId === "CA")?.voters)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: houseHolder.id, party: "US_REP", weight: 3 }),
        expect.objectContaining({ id: "player", party: "US_DEM", economic: -2, social: -2, weight: 2 }),
      ]));

    world.player.legislativeSeat = { countryId: "US", chamberKey: "house", seatsHeld: 2 };
    expect(buildContingentInputs(world, rec).houseOfficials.some((official) => official._id === "player")).toBe(false);
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house", regionId: "DC", seatsHeld: 2 };
    expect(buildContingentInputs(world, rec).houseOfficials.some((official) => official._id === "player")).toBe(false);
  });
});
