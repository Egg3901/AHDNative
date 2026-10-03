import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { ElectionRecord } from "./types.js";

function fixture(optIn: boolean) {
  const world = createWorld({
    seed: "source-pr-stv-transfer-vector-01",
    playerName: "Player",
    countryId: "IE",
    era: "2019",
    autonomyLevel: "off",
  });
  const election = {
    id: "dail:IE:fixture:pr-stv",
    electionType: "dail",
    countryId: "IE",
    state: "IE-MUN",
    cycle: 999,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 1,
    endTurn: 1,
    totalSeats: 2,
    chamberKey: "dail",
    candidates: ["a", "b", "c", "d"].map((id) => ({
      id,
      name: id,
      partyId: `party-${id}`,
      isNPP: true,
      incumbent: false,
    })),
    tally: { a: 45, b: 30, c: 20, d: 5 },
    ...(optIn
      ? {
          countingMethod: "pr_stv",
          rankedPreferenceModel: "same_party_then_policy_distance_v1",
          rankedBallots: [
            { weight: 45, preferences: ["a", "c"] },
            { weight: 30, preferences: ["b"] },
            { weight: 20, preferences: ["c"] },
            { weight: 5, preferences: ["d", "c"] },
          ],
        }
      : {}),
  } as unknown as ElectionRecord;
  world.elections.push(election);
  return { world, election };
}

describe("explicit Irish PR-STV election lifecycle", () => {
  it("uses persisted rankings to transfer surplus before the ordinary resolution turn", () => {
    const { world, election } = fixture(true);

    advanceTurn(world);

    expect(election.status).toBe("resolved");
    expect(election.winners).toEqual(["a", "c"]);
    expect(election.totalSeats).toBe(2);
    expect(election.resolutionPath).toBe("pr_stv");
    expect(election.prStvResult?.quota).toBe(34);
    expect(election.prStvResult?.elected).toEqual(["a", "c"]);
    expect(election.prStvResult?.rounds.map((round) => round.action)).toEqual([
      "elect",
      "eliminate",
      "elect",
    ]);
    expect(election.prStvResult?.rounds[0]?.transferValue).toBeCloseTo(11 / 45, 10);
    expect(election.prStvResult?.rounds[1]?.candidates).toEqual(["d"]);
    expect(election.prStvResult?.rounds.every((round) => round.conservationResidual === 0)).toBe(true);

    const raw = serializeSave(world, "2026-10-03T00:00:00Z");
    const resumed = deserializeSave(raw);
    expect(resumed.meta.schemaVersion).toBe(67);
    expect(resumed.elections.find((row) => row.id === election.id)).toMatchObject({
      countingMethod: "pr_stv",
      rankedPreferenceModel: "same_party_then_policy_distance_v1",
      rankedBallots: election.rankedBallots,
      resolutionPath: "pr_stv",
      prStvResult: election.prStvResult,
    });
  });

  it("keeps the default Irish allocator when the explicit marker is absent", () => {
    const { world, election } = fixture(false);
    advanceTurn(world);
    expect(election.status).toBe("resolved");
    expect(election.winners).toEqual(["a", "b"]);
    expect(election.countingMethod).toBeUndefined();
    expect(election.rankedBallots).toBeUndefined();
    expect(election.prStvResult).toBeUndefined();
  });

  it("rejects ineligible and inconsistent ranked inputs before replacing any seated holder", () => {
    const invalidMutations: Array<(election: ElectionRecord) => void> = [
      (election) => {
        election.countryId = "UK";
        election.electionType = "commons";
        election.chamberKey = "commons";
        election.state = "LON";
      },
      (election) => {
        election.rankedBallots![0]!.weight = 44;
      },
      (election) => {
        election.candidates.push({ ...election.candidates[0]! });
      },
      (election) => {
        election.conversionTerms = { reservedSeats: { a: 1 } };
      },
    ];

    for (const mutate of invalidMutations) {
      const { world, election } = fixture(true);
      const existingOfficeholder = world.politicians.find((politician) => politician.countryId === "IE");
      expect(existingOfficeholder, "fixture requires a seeded Irish politician identity").toBeDefined();
      existingOfficeholder!.chamberKey = "dail";
      existingOfficeholder!.electedState = "IE-MUN";
      existingOfficeholder!.seatsHeld = 1;
      mutate(election);

      expect(() => advanceTurn(world)).toThrow();
      expect(existingOfficeholder!.chamberKey).toBe("dail");
      expect(existingOfficeholder!.electedState).toBe("IE-MUN");
      expect(existingOfficeholder!.seatsHeld).toBe(1);
    }
  });
});
