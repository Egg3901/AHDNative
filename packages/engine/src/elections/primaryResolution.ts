import { NPP_PRIMARY_SCORE_MULTIPLIER } from "../electionEngine/constants.js";
import { COUNTRY_CONFIGS } from "../electionEngine/countryElectionConstants.js";
import { infamyPenaltyMultiplier } from "../electionEngine/infamy.js";
import { normalizeNPI } from "../electionEngine/normalizeNPI.js";
import {
  normalizeNationalReachPresidentialPrimary,
  normalizePartyInfluencePresidentialPrimary,
} from "../electionEngine/normalizeNPI.js";
import type { Politician, WorldState } from "../types.js";
import { archiveCampaign } from "../campaigns/lifecycle.js";
import { turnoutPoolForElection } from "./tallyAdapter.js";
import {
  accruePrimaryBallotTurn,
  ballotSharesWithinParty,
  partyPrimaryPools,
  primaryBallotWindow,
  scoreByPrimaryVotes,
} from "./primaryBallots.js";
import { resolveNominationForParty } from "../electionEngine/resolution/conventionResolution.js";
import { presidentialPrimaryMajority, presidentialPrimaryWavesComplete } from "./primaryStaggerPhase.js";
import { BUILTIN_PARTY_FAMILY } from "./data/usPrimaryCalendar.js";
import type {
  ElectionCandidate,
  ElectionRecord,
  PrimaryResultEntry,
  PrimarySnapshot,
  PrimarySnapshotEntry,
} from "./types.js";

const PRIMARY_SHARE_SOFTMAX_TEMPERATURE = 8;

/** Ephemeral lookup for one primary pass; retain Array.find's first match. */
function indexPrimaryPoliticians(world: WorldState): ReadonlyMap<string, Politician> {
  const politicians = new Map<string, Politician>();
  for (const politician of world.politicians) {
    if (!politicians.has(politician.id)) politicians.set(politician.id, politician);
  }
  return politicians;
}

/**
 * Mainline `getPrimaryWinnersForElection` applies a country government-type cap
 * to parliamentary and one-party-state elections, except single-winner
 * executive offices. Native's pinned country roster has these government
 * types; unknown countries retain the source's safe one-winner default.
 */
const PRIMARY_WINNERS_BY_GOVERNMENT_TYPE = {
  presidential: 1,
  parliamentaryMonarchy: 3,
  parliamentaryRepublic: 3,
  onePartyState: 7,
};

const SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES = new Set([
  "president",
  "governor",
  "uachtaran",
  "ministerPresident",
]);

export function primaryWinnersForElection(countryId: string, electionType: string): number {
  if (SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES.has(electionType)) return 1;
  const governmentType = COUNTRY_CONFIGS[countryId]?.governmentType;
  return governmentType ? PRIMARY_WINNERS_BY_GOVERNMENT_TYPE[governmentType] : 1;
}

/**
 * A US presidential record without a distinct primary window uses the general
 * election lifecycle. Records with a primary window, including presidential
 * stagger races and non-US nomination races, require the persisted transition.
 */
export function requiresPrimaryResolution(rec: ElectionRecord): boolean {
  return !(rec.countryId === "US" && rec.electionType === "president") || rec.primaryEndTurn > rec.startTurn;
}

function presidentPrimaryFamily(world: WorldState, partyId: string): "dem" | "gop" {
  return BUILTIN_PARTY_FAMILY[partyId.toLowerCase()] ??
    ((world.parties[partyId]?.economicPosition ?? 0) < 0 ? "dem" : "gop");
}

function presidentialNationalVotes(rec: ElectionRecord, partyId: string): Record<string, number> {
  const votes: Record<string, number> = {};
  for (const stateVotes of Object.values(rec.primaryStateVotes?.[partyId] ?? {})) {
    for (const [candidateId, count] of Object.entries(stateVotes)) {
      votes[candidateId] = (votes[candidateId] ?? 0) + count;
    }
  }
  return votes;
}

function presidentialPosition(world: WorldState, candidate: ElectionCandidate, politicians: ReadonlyMap<string, Politician>) {
  const actor = candidate.id === "player"
    ? { ideology: world.player.policies ?? { economic: 0, social: 0 } }
    : politicians.get(candidate.id);
  return actor ? {
    candidateId: candidate.id,
    charEP: actor.ideology.economic,
    charSP: actor.ideology.social,
    party: candidate.partyId,
  } : null;
}

function scoreCandidate(
  world: WorldState,
  politicians: ReadonlyMap<string, Politician>,
  candidate: ElectionCandidate,
  hasPlayerInParty: boolean,
  stateLean?: { economic: number; social: number },
  presidential = false,
): number {
  const party = world.parties[candidate.partyId];
  const actor = candidate.id === "player"
    ? {
        ideology: world.player.policies ?? { economic: 0, social: 0 },
        favorability: world.player.favorability,
        politicalInfluence: world.player.politicalInfluence,
        infamy: world.player.infamy,
      }
    : politicians.get(candidate.id);
  if (!actor) return 0;
  const partyEconomic = party?.economicPosition ?? 0;
  const partySocial = party?.socialPosition ?? 0;
  const econDiff = Math.abs(actor.ideology.economic - partyEconomic);
  const socialDiff = Math.abs(actor.ideology.social - partySocial);
  const alignment = stateLean
    ? Math.max(0, 25 - (
        Math.abs(actor.ideology.economic - stateLean.economic) +
        Math.abs(actor.ideology.social - stateLean.social)
      ) * 1.25) + Math.max(0, 15 - (econDiff + socialDiff) * 0.75)
    : Math.max(0, 40 - (econDiff + socialDiff) * 2);
  const favorability = Math.min(100, Math.max(0, actor.favorability));
  const influence = Math.min(100, Math.max(0, actor.politicalInfluence));
  const raw = presidential
    ? alignment +
      normalizePartyInfluencePresidentialPrimary(candidate.id === "player" ? world.player.partyInfluence ?? 0 : 0) * 20 +
      normalizeNationalReachPresidentialPrimary(
        candidate.id === "player"
          ? world.player.nationalInfluence ?? 0
          : candidate.isNPP ? influence : 0,
      ) * 15 +
      (favorability / 100) * 25
    : alignment + (favorability / 100) * 35 + normalizeNPI(influence) * 25;
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

function primaryStandings(
  world: WorldState,
  rec: ElectionRecord,
  stateId: string | undefined = rec.state,
  politicians: ReadonlyMap<string, Politician> = indexPrimaryPoliticians(world),
): Map<string, ScoredPrimaryCandidate[]> {
  const stateDemographics = stateId ? world.stateDemographics[stateId] : undefined;
  const stateLean =
    typeof stateDemographics?.cachedEconomicLean === "number" &&
    typeof stateDemographics.cachedSocialLean === "number"
      ? {
          economic: stateDemographics.cachedEconomicLean,
          social: stateDemographics.cachedSocialLean,
        }
      : undefined;
  const candidatesByParty = new Map<string, ElectionCandidate[]>();
    for (const candidate of rec.candidates) {
    if (candidate.status === "withdrawn") continue;
    const candidates = candidatesByParty.get(candidate.partyId) ?? [];
    candidates.push(candidate);
    candidatesByParty.set(candidate.partyId, candidates);
  }

  const standings = new Map<string, ScoredPrimaryCandidate[]>();
  for (const [partyId, candidates] of candidatesByParty) {
    const hasPlayerInParty = candidates.some((candidate) => !candidate.isNPP);
    const scored = candidates.map((candidate) => ({
      candidate,
      score: scoreCandidate(world, politicians, candidate, hasPlayerInParty, stateLean, rec.countryId === "US" && rec.electionType === "president"),
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

/** Project state-level primary vote shares using the candidate and demographic
 * inputs already present in a Native save. The wave ledger consumes these
 * shares only for the source calendar's scheduled states. */
export function projectedPrimarySharesByParty(
  world: WorldState,
  rec: ElectionRecord,
  stateId: string,
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    [...primaryStandings(world, rec, stateId)].map(([partyId, entries]) => [
      partyId,
      Object.fromEntries(entries.map((entry) => [entry.candidate.id, entry.sharePct])),
    ]),
  );
}

function ballotAwareStandings(
  entries: ScoredPrimaryCandidate[],
  primaryVotes: Readonly<Record<string, number>> | undefined,
  candidateOrder?: ReadonlyMap<string, number>,
): ScoredPrimaryCandidate[] {
  const candidateIds = entries.map((entry) => entry.candidate.id);
  const ballotScores = scoreByPrimaryVotes(candidateIds, primaryVotes);
  const ballotShares = ballotSharesWithinParty(candidateIds, primaryVotes);
  if (!ballotScores || !ballotShares) return entries;
  return [...entries]
    // AHDGame's primary resolver sorts ballot-ranked candidates by their
    // ballot total alone. Stable sort preserves the source candidate-query
    // order on an exact ballot tie; the score-ranked standing is not a
    // secondary tiebreak once ballots exist.
    .sort((a, b) =>
      (ballotScores[b.candidate.id] ?? 0) - (ballotScores[a.candidate.id] ?? 0) ||
      (candidateOrder?.get(a.candidate.id) ?? 0) - (candidateOrder?.get(b.candidate.id) ?? 0),
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
  const politicians = indexPrimaryPoliticians(world);
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!requiresPrimaryResolution(rec) || rec.status !== "active") continue;
    if (world.meta.turn < rec.startTurn || world.meta.turn >= rec.primaryEndTurn) continue;
    if (rec.primarySnapshots?.some((snapshot) => snapshot.turn === world.meta.turn)) continue;
    if (!rec.candidates.some((candidate) => candidate.status !== "withdrawn")) continue;

    const standings = primaryStandings(world, rec, rec.state, politicians);
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

/** Resolve source-supported nomination races exactly once through persisted state. */
export function resolvePrimaries(world: WorldState): void {
  const politicians = indexPrimaryPoliticians(world);
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!requiresPrimaryResolution(rec) || rec.primaryResults || rec.status === "resolved") continue;
    if (world.meta.turn <= rec.primaryEndTurn || world.meta.turn > rec.endTurn) continue;
    const presidential = rec.countryId === "US" && rec.electionType === "president";
    if (presidential && !presidentialPrimaryWavesComplete(rec)) continue;
    if (!rec.candidates.some((candidate) => candidate.status !== "withdrawn")) continue;

    const byParty: Record<string, PrimaryResultEntry[]> = {};
    const conventionResults: NonNullable<ElectionRecord["primaryConventionResults"]> = {};
    const winners = new Set<string>();
    const candidateOrder = new Map(rec.candidates.map((candidate, index) => [candidate.id, index]));
    const maxAdvancing = presidential ? 1 : primaryWinnersForElection(rec.countryId, rec.electionType);
    for (const [partyId, entries] of primaryStandings(world, rec, rec.state, politicians)) {
      const scored = ballotAwareStandings(entries, rec.primaryVotes, candidateOrder);
      let partyWinnerIds: string[];
      let useDelegateStanding = false;
      if (presidential) {
        const family = presidentPrimaryFamily(world, partyId);
        const delegates = rec.primaryDelegates?.[partyId] ?? {};
        const totalDelegates = Object.values(delegates).reduce((sum, count) => sum + count, 0);
        const positions = scored.flatMap((entry) => {
          const position = presidentialPosition(world, entry.candidate, politicians);
          return position ? [position] : [];
        });
        const nomination = totalDelegates > 0
          ? resolveNominationForParty({
              partyCandidates: scored.map((entry) => ({ candidateId: entry.candidate.id })),
              partyDelegates: delegates,
              family,
              majorityThreshold: presidentialPrimaryMajority(world, family),
              enriched: positions,
              nationalVotes: presidentialNationalVotes(rec, partyId),
              ruleset: { conventionEnabled: (rec.primaryRulesetVersion ?? 1) >= 3 },
              now: new Date(`${world.meta.date}T00:00:00.000Z`),
            })
          : null;
        if (nomination) {
          partyWinnerIds = [nomination.winnerCandidateId];
          useDelegateStanding = true;
          if (nomination.mode === "convention") {
            conventionResults[partyId] = {
              mode: nomination.mode,
              winnerCandidateId: nomination.winnerCandidateId,
              majorityThreshold: nomination.majorityThreshold,
              firstBallotLeaderId: nomination.firstBallotLeaderId,
              ...(nomination.ballots ? { ballots: nomination.ballots } : {}),
              resolvedAt: nomination.resolvedAt.toISOString(),
            };
          }
        } else {
          partyWinnerIds = scored.slice(0, maxAdvancing).map((entry) => entry.candidate.id);
        }
      } else {
        partyWinnerIds = scored.slice(0, maxAdvancing).map((entry) => entry.candidate.id);
      }

      const delegates = rec.primaryDelegates?.[partyId] ?? {};
      const totalDelegates = Object.values(delegates).reduce((sum, count) => sum + count, 0);
      const nationalVotes = presidential ? presidentialNationalVotes(rec, partyId) : {};
      const totalVotes = Object.values(nationalVotes).reduce((sum, count) => sum + count, 0);
      byParty[partyId] = scored.map((entry) => ({
        candidateId: entry.candidate.id,
        candidateName: entry.candidate.name,
        score: useDelegateStanding ? (delegates[entry.candidate.id] ?? 0) : entry.score,
        sharePct: useDelegateStanding
          ? (totalDelegates > 0 ? Math.round(((delegates[entry.candidate.id] ?? 0) / totalDelegates) * 1000) / 10 : 0)
          : (presidential && totalVotes > 0
            ? Math.round(((nationalVotes[entry.candidate.id] ?? 0) / totalVotes) * 1000) / 10
            : entry.sharePct),
        won: partyWinnerIds.includes(entry.candidate.id),
      }));
      for (const candidateId of partyWinnerIds) winners.add(candidateId);
    }

  for (const candidate of rec.candidates) {
      candidate.status = winners.has(candidate.id) ? "active" : "withdrawn";
      if (!winners.has(candidate.id)) archiveCampaign(world, rec.id, candidate.id);
      if (presidential) {
        // Source primary-only campaigning state ends at the primary→general
        // transition; the separately stored general travel state is unaffected.
        delete candidate.primaryCampaignState;
        delete candidate.primaryCampaignTicks;
        candidate.primarySurgeUsed = false;
      }
    }
    rec.tally = {};
    delete rec.tallyState;
    delete rec.stateTallyStates;
    rec.primaryResults = { byParty, recordedAt: `${world.meta.date}T00:00:00.000Z` };
    if (Object.keys(conventionResults).length > 0) rec.primaryConventionResults = conventionResults;
    rec.primaryResolvedTurn = world.meta.turn;
  }
}
