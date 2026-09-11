import { NPP_PRIMARY_SCORE_MULTIPLIER } from "../electionEngine/constants.js";
import { infamyPenaltyMultiplier } from "../electionEngine/infamy.js";
import { normalizeNPI } from "../electionEngine/normalizeNPI.js";
import type { WorldState } from "../types.js";
import { archiveCampaign } from "../campaigns/lifecycle.js";
import type { ElectionCandidate, ElectionRecord, PrimaryResultEntry } from "./types.js";

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

/** Resolve eligible US down-ballot primaries exactly once through persisted state. */
export function resolvePrimaries(world: WorldState): void {
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!requiresPrimaryResolution(rec) || rec.primaryResults || rec.status === "resolved") continue;
    if (world.meta.turn <= rec.primaryEndTurn || world.meta.turn > rec.endTurn) continue;

    const byPartyCandidates = new Map<string, ElectionCandidate[]>();
    for (const candidate of rec.candidates) {
      const partyCandidates = byPartyCandidates.get(candidate.partyId) ?? [];
      partyCandidates.push(candidate);
      byPartyCandidates.set(candidate.partyId, partyCandidates);
    }

    const byParty: Record<string, PrimaryResultEntry[]> = {};
    const winners = new Set<string>();
    for (const [partyId, candidates] of byPartyCandidates) {
      const hasPlayerInParty = candidates.some((candidate) => !candidate.isNPP);
      const scored = candidates.map((candidate) => ({
        candidate,
        score: scoreCandidate(world, candidate, hasPlayerInParty),
      }));
      // ECMAScript's stable sort preserves candidate source order for equal scores, matching AHDGame.
      scored.sort((a, b) => b.score - a.score);
      const sharePct = shares(scored.map((entry) => entry.score));
      byParty[partyId] = scored.map((entry, index) => ({
        candidateId: entry.candidate.id,
        candidateName: entry.candidate.name,
        score: entry.score,
        sharePct: sharePct[index] ?? 0,
        won: index === 0,
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
