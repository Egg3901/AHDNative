import { NPP_PRIMARY_SCORE_MULTIPLIER } from "../electionEngine/constants.js";
import { infamyPenaltyMultiplier } from "../electionEngine/infamy.js";
import { normalizeNPI } from "../electionEngine/normalizeNPI.js";
import type { WorldState } from "../types.js";
import { archiveCampaign } from "../campaigns/lifecycle.js";
import { turnoutPoolForElection } from "./tallyAdapter.js";
import {
  accruePrimaryBallotTurn,
  ballotSharesWithinParty,
  partyPrimaryPools,
  primaryBallotWindow,
  scoreByPrimaryVotes,
} from "./primaryBallots.js";
import type {
  ElectionCandidate,
  ElectionRecord,
  PrimaryResultEntry,
  PrimarySnapshot,
  PrimarySnapshotEntry,
} from "./types.js";

const PRIMARY_SHARE_SOFTMAX_TEMPERATURE = 8;

/** This slice intentionally excludes presidential conventions and non-US multi-advance rules. */
export function requiresPrimaryResolution(rec: ElectionRecord): boolean {
  return rec.countryId === "US" && rec.electionType !== "president";
}

function scoreCandidate(world: WorldState, candidate: ElectionCandidate, hasPlayerInParty: boolean): number {
  const party = world.parties[candidate.partyId];
  const actor = candidate.id === "player"
    ? {
        ideology: world.player.policies ?? { economic: 0, social: 0 },
        favorability: world.player.favorability,
        politicalInfluence: world.player.politicalInfluence,
        infamy: world.player.infamy,
      }
    : world.politicians.find((entry) => entry.id === candidate.id);
  if (!actor) return 0;
  const econDiff = Math.abs(actor.ideology.economic - (party?.economicPosition ?? 0));
  const socialDiff = Math.abs(actor.ideology.social - (party?.socialPosition ?? 0));
  const alignment = Math.max(0, 40 - (econDiff + socialDiff) * 2);
  const favorability = Math.min(100, Math.max(0, actor.favorability));
  const influence = Math.min(100, Math.max(0, actor.politicalInfluence));
  const raw = alignment + (favorability / 100) * 35 + normalizeNPI(influence) * 25;
  const score = Math.round(raw * infamyPenaltyMultiplier(actor.infamy) * 10) / 10;
  return candidate.isNPP && hasPlayerInParty ? score * NPP_PRIMARY_SCORE_MULTIPLIER : score;
}

function shares(scores: number[]): number[] {
  if (scores.length === 1) return [100];
  const max = Math.max(...scores);
  const weights = scores.map((score) => Math.exp((score - max) / PRIMARY_SHARE_SOFTMAX_TEMPERATURE));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => Math.round((weight / total) * 1000) / 10);
}

interface ScoredPrimaryCandidate {
  candidate: ElectionCandidate;
  score: number;
  sharePct: number;
}

function primaryStandings(world: WorldState, rec: ElectionRecord): Map<string, ScoredPrimaryCandidate[]> {
  const candidatesByParty = new Map<string, ElectionCandidate[]>();
  for (const candidate of rec.candidates) {
    const candidates = candidatesByParty.get(candidate.partyId) ?? [];
    candidates.push(candidate);
    candidatesByParty.set(candidate.partyId, candidates);
  }

  const standings = new Map<string, ScoredPrimaryCandidate[]>();
  for (const [partyId, candidates] of candidatesByParty) {
    const hasPlayerInParty = candidates.some((candidate) => !candidate.isNPP);
    const scored = candidates.map((candidate) => ({
      candidate,
      score: scoreCandidate(world, candidate, hasPlayerInParty),
      sharePct: 0,
    }));
    scored.sort((a, b) => b.score - a.score);
    const sharePct = shares(scored.map((entry) => entry.score));
    scored.forEach((entry, index) => {
      entry.sharePct = sharePct[index] ?? 0;
    });
    standings.set(partyId, scored);
  }
  return standings;
}

function ballotAwareStandings(
  entries: ScoredPrimaryCandidate[],
  primaryVotes: Readonly<Record<string, number>> | undefined,
): ScoredPrimaryCandidate[] {
  const candidateIds = entries.map((entry) => entry.candidate.id);
  const ballotScores = scoreByPrimaryVotes(candidateIds, primaryVotes);
  const ballotShares = ballotSharesWithinParty(candidateIds, primaryVotes);
  if (!ballotScores || !ballotShares) return entries;
  return [...entries]
    .sort((a, b) =>
      (ballotScores[b.candidate.id] ?? 0) - (ballotScores[a.candidate.id] ?? 0) || b.score - a.score,
    )
    .map((entry) => ({ ...entry, sharePct: ballotShares.get(entry.candidate.id) ?? entry.sharePct }));
}

function snapshotEntry(entry: ScoredPrimaryCandidate): PrimarySnapshotEntry {
  return {
    candidateId: entry.candidate.id,
    candidateName: entry.candidate.name,
    score: entry.score,
    sharePct: entry.sharePct,
  };
}

function registrationByPartyForRegion(world: WorldState, rec: ElectionRecord): Map<string, number> {
  const registration = new Map<string, number>();
  if (!rec.state) return registration;
  for (const partyRegion of Object.values(world.partyRegions)) {
    if (partyRegion.regionId === rec.state && partyRegion.countryId === rec.countryId) {
      registration.set(partyRegion.partyId, partyRegion.registration);
    }
  }
  return registration;
}

/** Record live standings and accrue registered-party primary ballots once per turn. */
export function recordPrimarySnapshots(world: WorldState): void {
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!requiresPrimaryResolution(rec) || rec.status !== "active") continue;
    if (world.meta.turn < rec.startTurn || world.meta.turn >= rec.primaryEndTurn) continue;
    if (rec.primarySnapshots?.some((snapshot) => snapshot.turn === world.meta.turn)) continue;
    if (rec.candidates.length === 0) continue;

    const standings = primaryStandings(world, rec);
    const ballotWindow = rec.state
      ? primaryBallotWindow(rec.startTurn, rec.primaryEndTurn, rec.endTurn, world.meta.turn)
      : null;
    let primaryVotes = rec.primaryVotes ? { ...rec.primaryVotes } : {};

    if (rec.state && ballotWindow?.open) {
      const totalPool = turnoutPoolForElection(world, rec.state, rec.id);
      const pools = partyPrimaryPools(
        totalPool ?? 0,
        [...standings.keys()],
        registrationByPartyForRegion(world, rec),
      );
      if (pools.size > 0) {
        primaryVotes = accruePrimaryBallotTurn({
          cumulative: primaryVotes,
          entriesByParty: new Map(
            [...standings.entries()].map(([partyId, entries]) => [
              partyId,
              entries.map((entry) => ({ candidateId: entry.candidate.id, sharePct: entry.sharePct })),
            ]),
          ),
          poolsByParty: pools,
          totalTurns: ballotWindow.totalTurns,
          turnIndex: ballotWindow.turnIndex,
        });
        rec.primaryVotes = primaryVotes;
      }
    }

    const byParty: Record<string, PrimarySnapshotEntry[]> = {};
    for (const [partyId, entries] of standings) {
      byParty[partyId] = ballotAwareStandings(entries, primaryVotes).map(snapshotEntry);
    }
    const snapshot: PrimarySnapshot = {
      turn: world.meta.turn,
      recordedAt: `${world.meta.date}T00:00:00.000Z`,
      byParty,
    };
    rec.primarySnapshots = [...(rec.primarySnapshots ?? []), snapshot];
  }
}

/** Resolve eligible US down-ballot primaries exactly once through persisted state. */
export function resolvePrimaries(world: WorldState): void {
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!requiresPrimaryResolution(rec) || rec.primaryResults || rec.status === "resolved") continue;
    if (world.meta.turn <= rec.primaryEndTurn || world.meta.turn > rec.endTurn) continue;

    const byParty: Record<string, PrimaryResultEntry[]> = {};
    const winners = new Set<string>();
    for (const [partyId, entries] of primaryStandings(world, rec)) {
      const scored = ballotAwareStandings(entries, rec.primaryVotes);
      byParty[partyId] = scored.map((entry) => ({
        candidateId: entry.candidate.id,
        candidateName: entry.candidate.name,
        score: entry.score,
        sharePct: entry.sharePct,
        won: entry.candidate.id === scored[0]?.candidate.id,
      }));
      if (scored[0]) winners.add(scored[0].candidate.id);
    }

    for (const candidate of rec.candidates) {
      if (!winners.has(candidate.id)) archiveCampaign(world, rec.id, candidate.id);
    }
    rec.candidates = rec.candidates.filter((candidate) => winners.has(candidate.id));
    rec.tally = {};
    delete rec.tallyState;
    delete rec.stateTallyStates;
    rec.primaryResults = { byParty, recordedAt: `${world.meta.date}T00:00:00.000Z` };
    rec.primaryResolvedTurn = world.meta.turn;
  }
}
