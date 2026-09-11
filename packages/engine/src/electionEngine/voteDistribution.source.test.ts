import { describe, expect, it } from "vitest";
import { distributeVotesByGroupLevelAllocation } from "./voteDistribution.js";
import { distributeVotesBySwingFlow } from "./voteDistributionSwingFlow.js";
import type { DemographicCategory, EnrichedCandidate, StateDemographics } from "./types.js";

// These fixtures use the literal source constants from AHDGame commit
// d4baf899fd8bd529099f03d7410807143604e2e5. The expected values are the
// source formulas evaluated on a single 100% demographic group.
const category: DemographicCategory = {
  _id: "ideology",
  name: "Ideology",
  defaultWeight: 100,
  groups: [
    { id: "swing", name: "Swing voters", defaultEconomicLean: 0, defaultSocialLean: 0, defaultTurnout: 60 },
  ],
};

const demographics: StateDemographics = {
  _id: "PA",
  countryId: "US",
  categoryWeights: { ideology: 100 },
  groups: { swing: { population: 100, economicLean: 0, socialLean: 0, turnout: 60 } },
  lastUpdated: new Date(0),
};

function candidate(overrides: Partial<EnrichedCandidate> & { candidateId: string }): EnrichedCandidate {
  const { candidateId, ...rest } = overrides;
  return {
    candidateId,
    characterId: candidateId,
    characterName: candidateId,
    party: "democrat",
    isNPP: false,
    charEP: 0,
    charSP: 0,
    favorability: 50,
    politicalInfluence: 100,
    nationalInfluence: 100,
    support: 50,
    ...rest,
  };
}

describe("source-backed vote distribution vectors", () => {
  it("moves exactly 200 votes on a 100-to-1 funds ratio in swing flow", () => {
    const enriched = [
      candidate({ candidateId: "dem", party: "dem" }),
      candidate({ candidateId: "rep", party: "rep" }),
    ];
    const result = distributeVotesBySwingFlow(
      enriched,
      10_000,
      600_000,
      1_000_000,
      demographics,
      [category],
      new Map(),
      {
        countryId: "US",
        isGeneralElection: true,
        votingSystem: "rcv",
        fundsByParty: new Map([
          ["dem", 100],
          ["rep", 1],
        ]),
      },
    );

    expect(result.votesPerCandidate).toEqual({ dem: 5_200, rep: 4_800 });
    expect(result.sharesPct).toEqual({ dem: 52, rep: 48 });
    expect(Object.values(result.votesPerCandidate).reduce((sum, votes) => sum + votes, 0)).toBe(10_000);
  });

  it("uses the source primary clout multiplier for a player candidate", () => {
    const result = distributeVotesByGroupLevelAllocation(
      [
        candidate({ candidateId: "high", partyInfluence: 150 }),
        candidate({ candidateId: "low", partyInfluence: 0 }),
      ],
      10_000,
      600_000,
      1_000_000,
      demographics,
      [category],
      new Map(),
      {
        countryId: "US",
        useNationalInfluenceForReach: true,
        presidentialPrimaryNationalReach: true,
        applyPartyFit: true,
        hasPlayerInRace: true,
      },
    );

    expect(result.votesPerCandidate.high).toBeCloseTo(5_833.333333333333, 9);
    expect(result.votesPerCandidate.low).toBeCloseTo(4_166.666666666667, 9);
    expect(Object.values(result.votesPerCandidate).reduce((sum, votes) => sum + votes, 0)).toBeCloseTo(10_000, 9);
  });
});
