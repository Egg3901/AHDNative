import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { ensureCampaignsForElection } from "../campaigns/lifecycle.js";
import { runVoteAccumulation } from "./orchestration.js";
import type { ElectionRecord } from "./types.js";
import type { WorldState } from "../types.js";
import { allocateElectoralVotes } from "./presidentialElectoralCollege.js";
import { executeAction } from "../actions/execute.js";
import { governorEndorsementsPhase } from "../governor/phases.js";
import { rngFromState } from "../rng.js";
import { appliesExplicitPresidentialLean, presidentialRulesetVersionFor } from "./presidentialRuleset.js";

const RACE_ID = "president:US:-:source-units";

function setup(era: "1953" | "1991" | "2019" = "2019"): { world: WorldState; race: ElectionRecord } {
  const world = createWorld({ seed: `presidential-units-${era}`, playerName: "Tester", countryId: "US", era });
  const dem = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_DEM")!;
  const rep = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_REP")!;
  const race: ElectionRecord = {
    id: RACE_ID,
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 0,
    endTurn: 20,
    totalSeats: 1,
    chamberKey: "president",
    presidentialRulesetVersion: 3,
    candidates: [
      { id: dem.id, name: dem.name, partyId: dem.partyId, isNPP: true, incumbent: false },
      { id: rep.id, name: rep.name, partyId: rep.partyId, isNPP: true, incumbent: false },
    ],
    tally: {},
  };
  world.elections = [race];
  world.meta.turn = race.primaryEndTurn + 1;
  ensureCampaignsForElection(world, race);
  return { world, race };
}

function stateTotals(world: WorldState, stateOrUnitId: string): Record<string, number> {
  return (world.elections[0]!.stateTallyStates![stateOrUnitId] as { totalVotes: Record<string, number> })
    .totalVotes;
}

describe("presidential per-unit accumulation", () => {
  it("treats absent general ruleset stamps as source v1 and stamps new races v3", () => {
    expect(presidentialRulesetVersionFor(undefined)).toBe(1);
    expect(presidentialRulesetVersionFor({})).toBe(1);
    expect(presidentialRulesetVersionFor({ presidentialRulesetVersion: 2 })).toBe(2);
    expect(presidentialRulesetVersionFor({ presidentialRulesetVersion: 3 })).toBe(3);
    expect(appliesExplicitPresidentialLean(1)).toBe(true);
    expect(appliesExplicitPresidentialLean(2)).toBe(true);
    expect(appliesExplicitPresidentialLean(3)).toBe(false);
  });

  it("records separate source district ballots and derives each at-large state tally once", () => {
    const { world } = setup("2019");
    const race = world.elections[0]!;

    runVoteAccumulation(world, rngFromSeed("presidential-source-units"));

    expect(world.elections[0]!.stateTallyStates).toHaveProperty("ME_CD1");
    expect(world.elections[0]!.stateTallyStates).toHaveProperty("ME_CD2");
    expect(world.elections[0]!.stateTallyStates).toHaveProperty("NE_CD1");
    expect(world.elections[0]!.stateTallyStates).toHaveProperty("NE_CD2");
    expect(world.elections[0]!.stateTallyStates).toHaveProperty("NE_CD3");
    expect(world.elections[0]!.stateTallyStates).toHaveProperty("DC");
    expect(Object.values(stateTotals(world, "DC")).reduce((sum, votes) => sum + votes, 0)).toBeGreaterThan(0);
    const dcVotes = stateTotals(world, "DC");
    const dcEv = allocateElectoralVotes(world, race);
    expect(dcEv?.stateWinners.DC).toBe(Object.entries(dcVotes).sort((a, b) => b[1] - a[1])[0]?.[0]);
    expect(dcEv?.totalEv).toBe(538);
    const resumed = deserializeSave(serializeSave(world, new Date(0).toISOString()));
    expect(stateTotals(resumed, "DC")).toEqual(dcVotes);
    expect(allocateElectoralVotes(resumed, resumed.elections[0]!)?.stateWinners.DC).toBe(dcEv?.stateWinners.DC);

    for (const stateId of ["ME", "NE"]) {
      const districtIds = Object.keys(world.elections[0]!.stateTallyStates!).filter((id) => id.startsWith(`${stateId}_CD`));
      const summed: Record<string, number> = {};
      for (const districtId of districtIds) {
        for (const [candidateId, votes] of Object.entries(stateTotals(world, districtId))) {
          summed[candidateId] = (summed[candidateId] ?? 0) + votes;
        }
      }
      expect(stateTotals(world, stateId)).toEqual(summed);
    }

    const nationalVotesFromUnits: Record<string, number> = {};
    for (const [stateId, tally] of Object.entries(world.elections[0]!.stateTallyStates!)) {
      if (stateId === "ME" || stateId === "NE") continue;
      for (const [candidateId, votes] of Object.entries((tally as { totalVotes: Record<string, number> }).totalVotes)) {
        nationalVotesFromUnits[candidateId] = (nationalVotesFromUnits[candidateId] ?? 0) + votes;
      }
    }
    expect(race.tally).toEqual(nationalVotesFromUnits);
  });

  it("applies the source 3% VP home-state effect only to that candidate in that state", () => {
    const baseline = setup("2019");
    const sourceEffect = setup("2019");
    const candidate = sourceEffect.race.candidates[0]!;
    sourceEffect.world.player.homeRegionId = "CA";
    candidate.runningMateId = "player";

    runVoteAccumulation(baseline.world, rngFromSeed("presidential-vp-state"));
    runVoteAccumulation(sourceEffect.world, rngFromSeed("presidential-vp-state"));

    const candidateId = candidate.id;
    const otherId = sourceEffect.race.candidates[1]!.id;
    const baseCA = stateTotals(baseline.world, "CA");
    const effectCA = stateTotals(sourceEffect.world, "CA");
    expect(effectCA[candidateId]).toBe(Math.round(baseCA[candidateId]! * 1.03));
    expect(effectCA[otherId]).toBe(baseCA[otherId]);
    expect(stateTotals(sourceEffect.world, "TX")).toEqual(stateTotals(baseline.world, "TX"));
  });

  it("does not grant the human-character home-state bonus to an NPC running mate", () => {
    const baseline = setup("2019");
    const npcTicket = setup("2019");
    const mate = npcTicket.world.politicians.find(p =>
      !npcTicket.race.candidates.some(candidate => candidate.id === p.id),
    )!;
    mate.homeState = "CA";
    npcTicket.race.candidates[0]!.runningMateId = mate.id;

    runVoteAccumulation(baseline.world, rngFromSeed("npc-vp-no-human-bonus"));
    runVoteAccumulation(npcTicket.world, rngFromSeed("npc-vp-no-human-bonus"));

    // Game reads running mates only from the characters collection, never npps.
    expect(stateTotals(npcTicket.world, "CA")).toEqual(stateTotals(baseline.world, "CA"));
  });

  it("persists the district unit tally layout and the VP modifier outcome through resume", () => {
    const { world, race } = setup("2019");
    const candidate = race.candidates[0]!;
    world.player.homeRegionId = "ME";
    candidate.runningMateId = "player";

    runVoteAccumulation(world, rngFromSeed("presidential-unit-save"));
    const expectedEc = allocateElectoralVotes(world, race);
    const saved = serializeSave(world, new Date(0).toISOString());
    const resumed = deserializeSave(saved);

    expect(allocateElectoralVotes(resumed, resumed.elections[0]!)).toEqual(expectedEc);
    for (const unitId of ["ME_CD1", "ME_CD2", "NE_CD1", "NE_CD2", "NE_CD3"]) {
      expect(stateTotals(resumed, unitId)).toEqual(stateTotals(world, unitId));
    }
    expect(resumed.elections[0]!.candidates[0]!.runningMateId).toBe("player");
  });

  it("creates, charges, consumes, saves and withdraws a source-scoped governor endorsement", () => {
    const baseline = setup("2019");
    const endorsed = setup("2019");
    const candidate = endorsed.race.candidates[0]!;
    const office = endorsed.world.governors.CA!;
    office.governorId = "player";
    office.governorParty = candidate.partyId;
    office.gubernatorialActions = 1;
    const playerActions = endorsed.world.player.actions;

    const response = executeAction(endorsed.world, "player", "governorEndorsePresidentialCandidate", {
      regionId: "CA", electionId: endorsed.race.id, candidateId: candidate.id,
    });
    expect(response.ok).toBe(true);
    expect(office.gubernatorialActions).toBe(0);
    expect(endorsed.world.player.actions).toBe(playerActions);
    expect(endorsed.race.governorEndorsements).toEqual([{
      id: expect.any(String), stateId: "CA", candidateId: candidate.id, endorsedById: "player",
      createdAtTurn: endorsed.world.meta.turn, isActive: true,
    }]);

    runVoteAccumulation(baseline.world, rngFromSeed("governor-endorsement-vote"));
    runVoteAccumulation(endorsed.world, rngFromSeed("governor-endorsement-vote"));
    expect(stateTotals(endorsed.world, "CA")[candidate.id]).toBe(
      Math.round(stateTotals(baseline.world, "CA")[candidate.id]! * 1.015),
    );
    expect(stateTotals(endorsed.world, "TX")).toEqual(stateTotals(baseline.world, "TX"));

    const saved = serializeSave(endorsed.world, new Date(0).toISOString());
    const duplicateActive = JSON.parse(saved) as { world: { elections: Array<{ governorEndorsements: Array<Record<string, unknown>> }> } };
    duplicateActive.world.elections[0]!.governorEndorsements.push({
      ...duplicateActive.world.elections[0]!.governorEndorsements[0]!, id: "duplicate-active-endorsement",
    });
    expect(() => deserializeSave(JSON.stringify(duplicateActive))).toThrow(/multiple active governor endorsements/);
    const resumed = deserializeSave(saved);
    expect(resumed.elections[0]!.governorEndorsements).toEqual(endorsed.race.governorEndorsements);
    const endorsement = resumed.elections[0]!.governorEndorsements![0]!;
    const withdrawal = executeAction(resumed, "player", "withdrawGovernorEndorsement", {
      electionId: resumed.elections[0]!.id, endorsementId: endorsement.id,
    });
    expect(withdrawal.ok).toBe(true);
    expect(endorsement).toMatchObject({ isActive: false, withdrawnAtTurn: resumed.meta.turn, withdrawnReason: "manual" });
  });

  it("rejects wrong-party, non-office and unaffordable governor endorsements without mutation", () => {
    const { world, race } = setup("2019");
    const office = world.governors.CA!;
    office.governorId = "player";
    office.governorParty = race.candidates[0]!.partyId;
    office.gubernatorialActions = 0;
    const before = serializeSave(world, new Date(0).toISOString());
    expect(executeAction(world, "player", "governorEndorsePresidentialCandidate", {
      regionId: "CA", electionId: race.id, candidateId: race.candidates[1]!.id,
    }).ok).toBe(false);
    expect(serializeSave(world, new Date(0).toISOString())).toBe(before);

    office.governorId = "npc-governor";
    const nonOfficeBefore = serializeSave(world, new Date(0).toISOString());
    expect(executeAction(world, "player", "governorEndorsePresidentialCandidate", {
      regionId: "CA", electionId: race.id, candidateId: race.candidates[0]!.id,
    }).ok).toBe(false);
    expect(serializeSave(world, new Date(0).toISOString())).toBe(nonOfficeBefore);
  });

  it("refuses player withdrawal of another sitting governor's endorsement without mutation", () => {
    const { world, race } = setup("2019");
    const governorId = world.politicians.find(p => p.countryId === "US")!.id;
    world.governors.CA!.governorId = governorId;
    race.governorEndorsements = [{
      id: "governor-owned-endorsement", stateId: "CA", candidateId: race.candidates[0]!.id,
      endorsedById: governorId, createdAtTurn: world.meta.turn, isActive: true,
    }];
    const before = serializeSave(world, new Date(0).toISOString());
    expect(executeAction(world, "player", "withdrawGovernorEndorsement", {
      electionId: race.id, endorsementId: race.governorEndorsements[0]!.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("sitting governor") });
    expect(serializeSave(world, new Date(0).toISOString())).toBe(before);
  });

  it("withdraws endorsements when the source election ends or governor leaves office", () => {
    const { world, race } = setup("2019");
    race.governorEndorsements = [{
      id: "gov-endorsement:source", stateId: "CA", candidateId: race.candidates[0]!.id,
      endorsedById: "player", createdAtTurn: world.meta.turn, isActive: true,
    }];
    world.governors.CA!.governorId = "replacement";
    governorEndorsementsPhase.run(world, rngFromState(world.meta.rng));
    expect(race.governorEndorsements[0]).toMatchObject({
      isActive: false, withdrawnAtTurn: world.meta.turn, withdrawnReason: "governor_left_office",
    });
  });
});
