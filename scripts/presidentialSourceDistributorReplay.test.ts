import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distributeVotesBySwingFlow } from "@/lib/electionEngine/voteDistributionSwingFlow";

const snapshotPath = process.env.PRESIDENTIAL_SOURCE_SNAPSHOT;
const proofPath = process.env.PRESIDENTIAL_SOURCE_PROOF;
const sourceRevision = process.env.AHDGAME_SOURCE_REVISION;

type Snapshot = {
  election: { _id: string; countryId: string; electionType: string; state: string };
  candidates: unknown[];
  effectiveTurnPool: number;
  totalPool: number;
  electorate: number;
  demographics: unknown;
  categories: unknown[];
  partyOrgByParty: Array<[string, number]>;
  options: Record<string, unknown>;
  turnNumber: number;
  nativeVotesPerCandidate: Record<string, number>;
  nativeSharesPct: Record<string, number>;
};

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (typeof value !== "object" || value === null) return value;
  const row = value as Record<string, unknown>;
  if (row.__nativeType === "Map" && Array.isArray(row.entries))
    return new Map((row.entries as unknown[][]).map((entry) => entry.map(revive)));
  if (row.__nativeType === "Set" && Array.isArray(row.values))
    return new Set((row.values as unknown[]).map(revive));
  return Object.fromEntries(Object.entries(row).map(([key, nested]) => [key, revive(nested)]));
}

type RetainedEvidence = {
  snapshot: Snapshot;
  governorEndorsementsBefore: Array<Record<string, unknown>>;
  priorWyTally: { totalVotes: Record<string, number> };
  nextWyTally: { totalVotes: Record<string, number> };
  rngBefore: number[];
  rngAfter: number[];
};

describe.skipIf(!snapshotPath || !proofPath || !sourceRevision)("immutable AHDGame presidential distributor replay on a retained public input", () => {
  it("reproduces every WY candidate vote and share from the actual turn-178 pre-distributor input", () => {
    if (!snapshotPath || !proofPath || !sourceRevision) throw new Error("Set PRESIDENTIAL_SOURCE_SNAPSHOT, PRESIDENTIAL_SOURCE_PROOF and AHDGAME_SOURCE_REVISION.");
    const evidence = JSON.parse(readFileSync(snapshotPath, "utf8")) as RetainedEvidence;
    const snapshot = evidence.snapshot;
    expect(snapshot.election).toMatchObject({ _id: "president:US:-:c1", countryId: "US", electionType: "president", state: "WY" });
    expect(snapshot.turnNumber).toBe(178);
    const endorsement = evidence.governorEndorsementsBefore.find((row) => row.stateId === "WY" && row.endorsedById === "player" && row.isActive);
    if (!endorsement) throw new Error("Retained public turn is missing the active WY governor endorsement.");
    const options = revive(snapshot.options);
    const source = distributeVotesBySwingFlow(
      snapshot.candidates as never[],
      snapshot.effectiveTurnPool,
      snapshot.totalPool,
      snapshot.electorate,
      snapshot.demographics as never,
      snapshot.categories as never[],
      new Map(snapshot.partyOrgByParty),
      options as never,
    );
    expect(source.votesPerCandidate).toEqual(snapshot.nativeVotesPerCandidate);
    expect(source.sharesPct).toEqual(snapshot.nativeSharesPct);
    const candidateId = String(endorsement.candidateId);
    const raw = source.votesPerCandidate[candidateId]!;
    const rawRounded = Math.round(raw);
    const expectedAfterEndorsement = Math.round(rawRounded * 1.015);
    const actualDelta = evidence.nextWyTally.totalVotes[candidateId]! - evidence.priorWyTally.totalVotes[candidateId]!;
    expect(actualDelta).toBe(expectedAfterEndorsement);
    const proof = {
      sourceRevision,
      race: snapshot.election._id,
      state: snapshot.election.state,
      turn: snapshot.turnNumber,
      candidateCount: snapshot.candidates.length,
      candidateIds: snapshot.candidates.map((candidate) => (candidate as { candidateId?: string }).candidateId),
      endorsement,
      sourceVotesPerCandidate: source.votesPerCandidate,
      nativeVotesPerCandidate: snapshot.nativeVotesPerCandidate,
      sourceSharesPct: source.sharesPct,
      nativeSharesPct: snapshot.nativeSharesPct,
      exactDistributorMatch: true,
      rawEndorsedCandidateVotes: raw,
      afterDistributorRounding: rawRounded,
      sourceGovernorEndorsementMultiplier: 1.015,
      sourceAfterEndorsementRounding: expectedAfterEndorsement,
      actualPersistedTurnDelta: actualDelta,
      actualTurnDeltaMatchesSourceEndorsement: true,
      rngBefore: evidence.rngBefore,
      rngAfter: evidence.rngAfter,
    };
    writeFileSync(proofPath, JSON.stringify(proof, null, 2));
    console.log(`SOURCE_REPLAY_PROOF ${JSON.stringify(proof)}`);
  });
});
