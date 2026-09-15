/**
 * Player polling (issue #38).
 *
 * Ports the AHDGame poll commission flow against Native election tallies:
 * - `src/lib/actions.ts` ACTIONS.poll / pollLarge (2 AP / $25k, 6 AP / $75k,
 *   with the Intellect divisor) plus the poll route's frozen campaign-currency
 *   conversion. The shared `actionFundCost` path owns both quote and debit.
 * - `src/app/api/actions/poll/route.ts` POST (validate before charging, read
 *   the same-turn tally inputs: demographics, live GOTV/canvass turnouts,
 *   party org/reg and general-phase opponents, then compute and persist
 *   lastPoll / lastPollLarge on the character).
 * - `src/lib/actions/pollCalculations.ts` computePollData (result fields,
 *   rounding, reach/appeal/share math, FPTP spoiler pass).
 * - `src/lib/electionEngine/resolvedTurnout.ts` buildLiveTurnouts
 *   (baseline + summed turnout modifiers, clamped 0-100).
 *
 * Deliberate divergences, all where Native inputs differ or Native's own
 * tally uses a different shared helper (the poll must predict the election
 * it actually reads):
 * - Shared helpers (calcAppeal, approvalScalar, normalizeNPI, orgVoteWeight,
 *   regResistanceMultiplier, infamyPenaltyMultiplier, FPTP_SPOILER_RATE,
 *   getMajorPartiesForRegion) are Native's own ports, the same units the
 *   tally consumes. NOTE: Native approvalScalar carries the 0.8 power
 *   calibration while pinned AHDGame e364c049 uses linear; the poll follows
 *   the engine it predicts.
 * - votingSystem is always fptp: Native regions carry no votingSystem field
 *   and tallyAdapter hardcodes fptp for accumulation.
 * - Native persists the seeded electorate as voter-group cells rather than
 *   AHDGame's raw census axes. The additive granular payload preserves the
 *   reference `dims`, `cells`, and `candidateShares` contract against those
 *   same cells, so it describes the electorate the Native tally uses.
 * - No primary-electorale shift: AHDGame only resolves opponents for
 *   post-primary (general-phase) races, so the shift block is unreachable
 *   there; Native's tally likewise accumulates primaries unshifted.
 * - Polls are player-only: commissioning reads the player's home region and
 *   Native politicians carry no home-region input, so there is nothing
 *   faithful to resolve for them (mirrors the player-only candidacy gate).
 *
 * Pure and deterministic: no RNG, no wall clock. takenAt reuses the world's
 * deterministic date clock (world.meta.date) plus the turn.
 */

import { calcAppeal, approvalScalar, MAX_APPEAL } from "../electionEngine/demographicAppeal.js";
import { normalizeNPI } from "../electionEngine/normalizeNPI.js";
import { infamyPenaltyMultiplier } from "../electionEngine/infamy.js";
import { orgVoteWeight, regResistanceMultiplier } from "../electionEngine/electionFormulaFactors.js";
import { FPTP_SPOILER_RATE } from "../electionEngine/constants.js";
import { getMajorPartiesForRegion } from "../electionEngine/countryElectionConstants.js";
import type {
  DemographicCategory,
  DemographicGroupDef,
} from "../demographics/categories.js";
import type { StateDemographics } from "../demographics/stateDemographics.js";
import type { WorldState } from "../types.js";

export type PollType = "poll" | "pollLarge";

/** Anchor fund costs, ports SMALL_POLL_COST / LARGE_POLL_COST. */
export const SMALL_POLL_COST = 25_000;
export const LARGE_POLL_COST = 75_000;

/** Per-group poll row. Field-for-field port of AHDGame GroupResult. */
export interface PollGroupResult {
  id: string;
  name: string;
  populationPct: number;
  economicLean: number;
  socialLean: number;
  turnoutPct: number;
  influencePct: number;
  groupPop: number;
  turnoutPop: number;
  reachedPop: number;
  appeal: number;
  rawPotential: number;
  weightedPotential: number;
  categoryName: string;
  categoryId: string;
  categoryWeight: number;
  /** Estimated share of this group when competing (in a race only). */
  estimatedSharePct?: number;
  archetypeApproval?: number;
  effectiveFavorability?: number;
}

/** Per-category breakdown (full poll only). Port of CategoryResult. */
export interface PollCategoryResult {
  id: string;
  name: string;
  weight: number;
  categoryTurnoutPop: number;
  totalRawPotential: number;
  totalPotentialVoters: number;
  groups: PollGroupResult[];
}

/** Head-to-head vote totals from group-level allocation. Port of InRaceVoteShare. */
export interface PollInRaceVoteShare {
  myVotes: number;
  opponentVotes: Record<string, number>;
}

export interface GranularPollCell {
  id: string;
  buckets: Record<string, string>;
  share: number;
  economicLean: number;
  socialLean: number;
  turnout: number;
}

export interface GranularCandidateShare {
  you: number;
  opponents: Array<{ id: string; name: string; share: number }>;
  undecided: number;
}

export interface GranularPollPayload {
  dims: string[];
  dimLabels: Record<string, string>;
  cells: GranularPollCell[];
  candidateShares: Record<string, GranularCandidateShare>;
}

/**
 * Stored poll snapshot. Ports StoredPoll: same result fields; takenAt is the
 * deterministic world-date ISO string at commission (AHDGame serializes its
 * Date to ISO for the client) plus the commission turn.
 */
export interface StoredPollSnapshot {
  takenAt: string;
  takenAtTurn: number;
  overallAppeal: number;
  totalEstimatedVoters: number;
  totalPotentialVoters: number;
  topGroups: PollGroupResult[];
  bottomGroups: PollGroupResult[];
  categories?: PollCategoryResult[];
  inRaceVoteShare?: PollInRaceVoteShare;
  granular: GranularPollPayload;
}

/** Opponent candidate input. Port of OpponentForShare (archetype approvals
 *  are absent in Native, so the field is omitted and defaults to {}). */
export interface PollOpponent {
  candidateId: string;
  name: string;
  economicPosition: number;
  socialPosition: number;
  favorability: number;
  politicalInfluence: number;
  party: string;
  /** Character infamy; omit for NPP-style opponents (no penalty). */
  infamy?: number;
}

export interface PollContender {
  id: string;
  name: string;
  party: string;
  economicPosition: number;
  socialPosition: number;
  favorability: number;
  politicalInfluence: number;
  infamy?: number;
}

function clampPercentStat(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Effective favorability for one group: favorability + approval * 0.5, clamped. */
export function calcEffectiveFavorability(baseFavorability: number, archetypeApproval: number | undefined): number {
  const adjustment = (archetypeApproval ?? 0) * 0.5;
  return Math.max(0, Math.min(100, baseFavorability + adjustment));
}

export interface PollPlayerInput {
  economicPosition: number;
  socialPosition: number;
  favorability: number;
  politicalInfluence: number;
  partyId: string | null;
  infamy: number;
}

export interface PollRegionInput {
  population: number;
  votingEligiblePopulation: number | null;
}

export interface PollPartyOrgInput {
  partyId: string;
  organization: number;
  registration?: number;
}

/**
 * Live group turnouts from stored baselines plus GOTV/canvass modifiers.
 * Ports buildLiveTurnouts minus the Layer-1 derived-archetype path: Native
 * demographic tables already carry derived per-group turnout, so the baseline
 * is the stored group turnout (falling back to the category default, then 55
 * (same precedence as the authority). Modifiers sum across every modifier
 * category and clamp to [0, 100] (resolveSingleGroupTurnout defaults).
 */
export function buildLiveTurnouts(
  demographics: StateDemographics,
  categories: DemographicCategory[],
  modifiers: Record<string, Record<string, number>>,
): Record<string, number> {
  const live: Record<string, number> = {};
  for (const category of categories) {
    for (const group of category.groups) {
      const stateGroup = demographics.groups[group.id];
      const baseline =
        typeof stateGroup?.turnout === "number"
          ? stateGroup.turnout
          : (group.defaultTurnout ?? 55);
      let modifier = 0;
      for (const groupModifiers of Object.values(modifiers)) {
        if (groupModifiers && typeof groupModifiers === "object") {
          const delta = groupModifiers[group.id];
          if (typeof delta === "number") modifier += delta;
        }
      }
      live[group.id] = Math.max(0, Math.min(100, baseline + modifier));
    }
  }
  return live;
}

export interface ComputePollDataInput {
  player: PollPlayerInput;
  /** Home-region population basis. */
  region: PollRegionInput;
  countryId: string;
  demographics: StateDemographics;
  categories: DemographicCategory[];
  partyOrgs: PollPartyOrgInput[];
  opponents?: PollOpponent[] | undefined;
  liveTurnouts?: Record<string, number> | null | undefined;
}

/**
 * Full poll math. Structural port of computePollData: same group loop, same
 * reach/appeal/approval/org/reg/infamy weighting, same estimated-share and
 * in-race group-level allocation, same FPTP spoiler pass, same rounding.
 * Home-region projection only (AHDGame polls never replicate the
 * presidential simulation either).
 */
export interface ComputedPollData {
  /** Full per-category breakdown (attached to the snapshot for pollLarge only). */
  results: PollCategoryResult[];
  overallAppeal: number;
  totalEstimatedVoters: number;
  totalPotentialVoters: number;
  topGroups: PollGroupResult[];
  bottomGroups: PollGroupResult[];
  inRaceVoteShare?: PollInRaceVoteShare | undefined;
}

interface CandidateWeightInput {
  economicPosition: number;
  socialPosition: number;
  politicalInfluence: number;
  favorability: number;
  party: string;
  partyOrg: number;
  partyReg: number;
  infamy?: number;
}

/** One mechanics-sensitive candidate weight, shared by group shares and totals. */
function candidateWeight(
  candidate: CandidateWeightInput,
  demographic: { economicLean: number; socialLean: number },
): number {
  const influence = clampPercentStat(candidate.politicalInfluence);
  return Math.max(
    0,
    calcAppeal(demographic.economicLean, demographic.socialLean, candidate.economicPosition, candidate.socialPosition, influence, false)
      * normalizeNPI(influence)
      * approvalScalar(calcEffectiveFavorability(candidate.favorability, 0))
      * candidate.partyOrg
      * candidate.partyReg
      * infamyPenaltyMultiplier(candidate.infamy),
  );
}

/**
 * Build the additive granular payload used by the reference poll response.
 * Native's seeded electorate is already reduced to the cells consumed by its
 * tally. Each active demographic category is therefore a dimension and each
 * stored group is one real cell in that dimension. Candidate shares use the
 * reference granular projection: positional appeal, a bounded undecided pool,
 * then proportional allocation of the decided pool.
 */
export function buildGranularPollPayload(
  player: PollPlayerInput,
  demographics: StateDemographics,
  categories: DemographicCategory[],
  opponents: PollOpponent[],
  liveTurnouts: Record<string, number>,
): GranularPollPayload {
  const dims = categories.map((category) => category._id);
  const dimLabels = Object.fromEntries(categories.map((category) => [category._id, category.name]));
  const cells: GranularPollCell[] = [];
  const candidateShares: Record<string, GranularCandidateShare> = {};

  for (const category of categories) {
    const categoryShare = (demographics.categoryWeights[category._id] ?? 0) / 100;
    for (const group of category.groups) {
      const stored = demographics.groups[group.id];
      if (!stored || stored.population <= 0) continue;
      const id = categories.length === 1 ? group.id : `${category._id}:${group.id}`;
      const cell = {
        id,
        buckets: { [category._id]: group.id },
        share: categoryShare * stored.population / 100,
        economicLean: stored.economicLean,
        socialLean: stored.socialLean,
        turnout: (liveTurnouts[group.id] ?? stored.turnout) / 100,
      };
      cells.push(cell);

      const youAppeal = calcAppeal(
        cell.economicLean, cell.socialLean,
        player.economicPosition, player.socialPosition,
        player.politicalInfluence, false,
      );
      const opponentAppeals = opponents.map((opponent) => ({
        id: opponent.candidateId,
        name: opponent.name,
        appeal: calcAppeal(
          cell.economicLean, cell.socialLean,
          opponent.economicPosition, opponent.socialPosition,
          opponent.politicalInfluence, false,
        ),
      }));
      const bestOpponent = opponentAppeals.length > 0
        ? Math.max(...opponentAppeals.map((opponent) => opponent.appeal))
        : 0;
      const undecided = Math.max(0.04, 0.16 - Math.abs(youAppeal - bestOpponent) / 220);
      const totalAppeal = youAppeal + opponentAppeals.reduce((sum, opponent) => sum + opponent.appeal, 0);
      const decidedPool = 1 - undecided;
      candidateShares[id] = {
        you: totalAppeal > 0 ? youAppeal / totalAppeal * decidedPool : decidedPool,
        opponents: opponentAppeals.map((opponent) => ({
          id: opponent.id,
          name: opponent.name,
          share: totalAppeal > 0 ? opponent.appeal / totalAppeal * decidedPool : 0,
        })),
        undecided,
      };
    }
  }

  cells.sort((a, b) => b.share - a.share || a.id.localeCompare(b.id));
  return { dims, dimLabels, cells, candidateShares };
}

export function computePollData(input: ComputePollDataInput): ComputedPollData {
  const { player, region, countryId, demographics, categories, partyOrgs, opponents, liveTurnouts } = input;
  // Age-aware electorate (P1b-1b): same voting-age basis the tally uses.
  const statePopulation = region.votingEligiblePopulation ?? region.population;
  const userEP = player.economicPosition;
  const userSP = player.socialPosition;
  const favorability = player.favorability;
  const politicalInfluence = clampPercentStat(player.politicalInfluence);
  const archetypeApprovals: Record<string, number> = {};

  const partyOrgByParty = new Map(partyOrgs.map((po) => [po.partyId, po.organization]));
  // Neutral 1x fallback when the region has no Org data (same as authority).
  const partyOrg = orgVoteWeight(partyOrgByParty, player.partyId ?? "");

  const regByParty = new Map<string, number>();
  for (const po of partyOrgs) {
    if (typeof po.registration === "number") regByParty.set(po.partyId, po.registration);
  }
  const partyRegMult = (party: string): number => regResistanceMultiplier(regByParty.get(party));
  const partyReg = partyRegMult(player.partyId ?? "");

  // Filter out categories with zero weight (same as authority).
  const activeCategories = categories.filter((c) => (demographics.categoryWeights[c._id] ?? 0) > 0);

  const results: PollCategoryResult[] = activeCategories.map((category) => {
    const categoryWeight = demographics.categoryWeights[category._id] ?? 0;

    const groups: PollGroupResult[] = category.groups.map((group: DemographicGroupDef) => {
      const stateGroup = demographics.groups[group.id];

      const populationPct = stateGroup?.population ?? 0;
      const demoEP = stateGroup?.economicLean ?? group.defaultEconomicLean;
      const demoSP = stateGroup?.socialLean ?? group.defaultSocialLean;
      // Prefer live-computed turnout (GOTV/canvass modifiers) over the stored value.
      const turnoutPct =
        liveTurnouts?.[group.id] ?? stateGroup?.turnout ?? group.defaultTurnout ?? 55;

      // Reach: political influence (name recognition) determines what fraction
      // of turned-out voters the candidate reaches.
      const reachFraction = normalizeNPI(politicalInfluence);

      const groupPop = Math.round(statePopulation * (populationPct / 100));
      const turnoutPop = Math.round(groupPop * (turnoutPct / 100));
      const reachedPop = Math.round(turnoutPop * reachFraction);

      // Appeal (0-25 scale within MAX_APPEAL=50): quadratic position only
      // (state-level: NPI is reach, not appeal).
      const appeal = calcAppeal(demoEP, demoSP, userEP, userSP, politicalInfluence, false);
      const rawPotential = Math.round(reachedPop * (appeal / MAX_APPEAL));

      const archetypeApproval = archetypeApprovals[group.id] ?? 0;
      const effectiveFav = calcEffectiveFavorability(favorability, archetypeApproval);
      const effectiveApproval = approvalScalar(effectiveFav);

      // Org-neutral single-candidate reach figure (same as authority).
      const weightedPotential = Math.round(rawPotential * (categoryWeight / 100) * effectiveApproval);

      // In-race: estimated share of this group when competing.
      let estimatedSharePct: number | undefined;
      if (opponents && opponents.length > 0) {
        const myWeight = candidateWeight({
          economicPosition: userEP, socialPosition: userSP,
          politicalInfluence, favorability, party: player.partyId ?? "",
          partyOrg, partyReg, infamy: player.infamy,
        }, { economicLean: demoEP, socialLean: demoSP });
        let totalWeight = myWeight;
        for (const opp of opponents) {
          totalWeight += candidateWeight({
            economicPosition: opp.economicPosition, socialPosition: opp.socialPosition,
            politicalInfluence: opp.politicalInfluence, favorability: opp.favorability,
            party: opp.party, partyOrg: orgVoteWeight(partyOrgByParty, opp.party),
            partyReg: partyRegMult(opp.party),
            ...(opp.infamy !== undefined ? { infamy: opp.infamy } : {}),
          }, { economicLean: demoEP, socialLean: demoSP });
        }
        estimatedSharePct =
          totalWeight > 0
            ? Math.round((myWeight / totalWeight) * 1000) / 10
            : Math.round(1000 / (1 + opponents.length) / 10);
      }

      return {
        id: group.id,
        name: group.name,
        populationPct,
        economicLean: demoEP,
        socialLean: demoSP,
        turnoutPct,
        influencePct: Math.round(politicalInfluence * 10) / 10,
        groupPop,
        turnoutPop,
        reachedPop,
        appeal: Math.round(appeal * 100) / 100,
        rawPotential,
        weightedPotential,
        categoryName: category.name,
        categoryId: category._id,
        categoryWeight,
        archetypeApproval: Math.round(archetypeApproval * 10) / 10,
        effectiveFavorability: Math.round(effectiveFav * 10) / 10,
        ...(estimatedSharePct !== undefined && { estimatedSharePct }),
      };
    });

    const categoryTurnoutPop = groups.reduce((s, g) => s + g.turnoutPop, 0);
    const totalRawPotential = groups.reduce((s, g) => s + g.rawPotential, 0);
    const totalPotentialVoters = groups.reduce((s, g) => s + g.weightedPotential, 0);

    return {
      id: category._id,
      name: category.name,
      weight: categoryWeight,
      categoryTurnoutPop,
      totalRawPotential,
      totalPotentialVoters,
      groups,
    };
  });

  const totalEstimatedVoters = results.reduce(
    (s, c) => s + Math.round(c.categoryTurnoutPop * (c.weight / 100)),
    0
  );
  const totalPotentialVoters = results.reduce((s, c) => s + c.totalPotentialVoters, 0);

  let appealNumer = 0;
  let appealDenom = 0;
  for (const cat of results) {
    for (const grp of cat.groups) {
      const w = cat.weight * grp.populationPct;
      appealNumer += grp.appeal * w;
      appealDenom += w;
    }
  }
  const overallAppeal = appealDenom > 0 ? Math.round((appealNumer / appealDenom) * 100) / 100 : 0;

  const allGroups = results.flatMap((c) => c.groups);
  const topGroups = [...allGroups].sort((a, b) => b.weightedPotential - a.weightedPotential).slice(0, 5);
  const bottomGroups = [...allGroups].sort((a, b) => a.weightedPotential - b.weightedPotential).slice(0, 5);

  // In-race: vote totals via group-level competitive allocation.
  let inRaceVoteShare: PollInRaceVoteShare | undefined;
  if (opponents && opponents.length > 0 && totalEstimatedVoters > 0) {
    const candidates = [
      {
        id: "me",
        ep: userEP,
        sp: userSP,
        influence: politicalInfluence,
        baseFavorability: favorability,
        partyOrg,
        partyReg,
        party: player.partyId ?? "",
        infamy: player.infamy,
      },
      ...opponents.map((o) => ({
        id: o.candidateId,
        ep: o.economicPosition,
        sp: o.socialPosition,
        influence: clampPercentStat(o.politicalInfluence),
        baseFavorability: o.favorability,
        partyOrg: orgVoteWeight(partyOrgByParty, o.party),
        partyReg: partyRegMult(o.party),
        party: o.party,
        infamy: o.infamy,
      })),
    ];
    const votesByCandidate: Record<string, number> = {};
    for (const c of candidates) votesByCandidate[c.id] = 0;

    for (const category of activeCategories) {
      const categoryWeight = demographics.categoryWeights[category._id] ?? 0;
      if (categoryWeight <= 0) continue;

      for (const group of category.groups) {
        const stateGroup = demographics.groups[group.id];
        const populationPct = stateGroup?.population ?? 0;
        const demoEP = stateGroup?.economicLean ?? group.defaultEconomicLean;
        const demoSP = stateGroup?.socialLean ?? group.defaultSocialLean;
        const turnoutPct =
          liveTurnouts?.[group.id] ?? stateGroup?.turnout ?? group.defaultTurnout ?? 55;

        const groupContribution =
          statePopulation * (populationPct / 100) * (turnoutPct / 100) * (categoryWeight / 100);
        const groupShare = groupContribution / totalEstimatedVoters;
        const groupPool = totalEstimatedVoters * groupShare;

        let totalWeight = 0;
        const weights: Record<string, number> = {};
        for (const c of candidates) {
          const w = candidateWeight({
            economicPosition: c.ep, socialPosition: c.sp,
            politicalInfluence: c.influence, favorability: c.baseFavorability,
            party: c.party, partyOrg: c.partyOrg, partyReg: c.partyReg,
            ...(c.infamy !== undefined ? { infamy: c.infamy } : {}),
          }, { economicLean: demoEP, socialLean: demoSP });
          weights[c.id] = w;
          totalWeight += w;
        }

        if (totalWeight > 0) {
          for (const c of candidates) {
            votesByCandidate[c.id] = (votesByCandidate[c.id] ?? 0) + groupPool * ((weights[c.id] ?? 0) / totalWeight);
          }
        } else {
          const n = candidates.length;
          for (const c of candidates) {
            votesByCandidate[c.id] = (votesByCandidate[c.id] ?? 0) + groupPool / n;
          }
        }
      }
    }

    // FPTP vote-splitting (spoiler effect), mirroring the election engine:
    // major parties from getMajorPartiesForRegion; Native regions carry no
    // votingSystem override so the poll always applies the fptp path, exactly
    // like the tally it predicts (tallyAdapter hardcodes fptp).
    const majorPartySet = getMajorPartiesForRegion(countryId);
    const thirdPartyCandidates = candidates.filter((c) => !majorPartySet.has(c.party));
    const majorPartyCandidates = candidates.filter((c) => majorPartySet.has(c.party));

    if (thirdPartyCandidates.length > 0 && majorPartyCandidates.length > 0) {
      for (const tp of thirdPartyCandidates) {
        const tpVotes = votesByCandidate[tp.id] ?? 0;
        const spoiled = tpVotes * FPTP_SPOILER_RATE;

        let nearest = majorPartyCandidates[0]!;
        let minDist = Infinity;
        for (const mp of majorPartyCandidates) {
          const dist = Math.abs(tp.ep - mp.ep) + Math.abs(tp.sp - mp.sp);
          if (dist < minDist) {
            minDist = dist;
            nearest = mp;
          }
        }

        const available = votesByCandidate[nearest.id] ?? 0;
        const actualSpoiled = Math.min(spoiled, available);
        votesByCandidate[nearest.id] = (votesByCandidate[nearest.id] ?? 0) - actualSpoiled;
        votesByCandidate[tp.id] = (votesByCandidate[tp.id] ?? 0) + actualSpoiled;
      }
    }

    const myVotes = Math.round(votesByCandidate["me"] ?? 0);
    const opponentVotes: Record<string, number> = {};
    for (const o of opponents) {
      opponentVotes[o.candidateId] = Math.round(votesByCandidate[o.candidateId] ?? 0);
    }
    inRaceVoteShare = { myVotes, opponentVotes };
  }

  return {
    results,
    overallAppeal,
    totalEstimatedVoters,
    totalPotentialVoters,
    topGroups,
    bottomGroups,
    inRaceVoteShare,
  };
}

/**
 * Resolve the player's general-phase opponents in their home region. Ports
 * getElectionOpponents: active races in the home state past the primary phase
 * where the player is a candidate, with at least one other contender.
 * Returns null when there is no race (polls then carry no in-race shares).
 */
export function resolvePollOpponents(world: WorldState): { electionId: string; opponents: PollOpponent[] } | null {
  const homeState = world.player.homeRegionId;
  if (!homeState) return null;
  for (const election of world.elections) {
    if (election.countryId !== world.player.countryId) continue;
    if ((election.state ?? null) !== homeState) continue;
    if (election.status !== "active") continue;
    // General phase only (turn-first primary gate, same as the phase check
    // getElectionOpponents applies via isPrimaryEnded).
    if (world.meta.turn < election.primaryEndTurn) continue;
    if (!election.candidates.some((c) => c.id === "player")) continue;
    const others = election.candidates.filter((c) => c.id !== "player");
    if (others.length === 0) return null;
    const opponents: PollOpponent[] = others.map((c) => {
      const politician = world.politicians.find((p) => p.id === c.id);
      return {
        candidateId: c.id,
        name: c.name,
        party: c.partyId,
        economicPosition: politician?.ideology.economic ?? 0,
        socialPosition: politician?.ideology.social ?? 0,
        favorability: politician?.favorability ?? 50,
        politicalInfluence: politician?.politicalInfluence ?? 0,
        // NPP-style opponents without a politician record carry no infamy
        // (infamyPenaltyMultiplier(undefined) === 1.0, same as authority).
        ...(politician ? { infamy: politician.infamy } : {}),
      };
    });
    return { electionId: election.id, opponents };
  }
  return null;
}

export type CommissionPollResult =
  | { ok: true; snapshot: StoredPollSnapshot; electionId: string | null }
  | { ok: false; error: string };

/**
 * Commission a poll: validate every tally input BEFORE charging (AHDGame:
 * "Validate before charging: never charge if we cannot produce poll data"),
 * compute the snapshot, and persist it on the player (lastPoll / lastPollLarge).
 * Charging itself stays in executeAction's shared path; this returns the fund
 * Player-only (see module doc). The shared action-cost path owns the
 * stat-scaled, currency-converted debit and its player message.
 */
export function commissionPoll(
  world: WorldState,
  actorId: string,
  pollType: PollType,
): CommissionPollResult {
  if (actorId !== "player") {
    return { ok: false, error: "Only the player commissions polls" };
  }
  const player = world.player;
  const homeState = player.homeRegionId;
  if (!homeState) {
    return { ok: false, error: "No home region set. Choose a home region before commissioning polls." };
  }
  const region = world.regions[homeState];
  if (!region || region.countryId !== player.countryId) {
    return { ok: false, error: `State not found for ${homeState}. Contact support.` };
  }
  const demographics = world.stateDemographics[homeState];
  if (!demographics) {
    return { ok: false, error: "Demographic data not found for your state. Polls need seeded demographics." };
  }
  const categories = world.demographicCategories[player.countryId] ?? [];
  const active = categories.filter((c) => (demographics.categoryWeights[c._id] ?? 0) > 0);
  if (active.length === 0 || !active.some((c) => c.groups.length > 0)) {
    return { ok: false, error: "Demographic categories not configured. Polls need seeded demographic categories." };
  }

  const partyOrgs: PollPartyOrgInput[] = Object.values(world.partyRegions)
    .filter((pr) => pr.countryId === player.countryId && pr.regionId === homeState)
    .map((pr) => ({ partyId: pr.partyId, organization: pr.organization, registration: pr.registration }));

  const modifiers = world.regionTurnouts[homeState]?.modifiers ?? {};
  const liveTurnouts = buildLiveTurnouts(demographics, active, modifiers);

  const race = resolvePollOpponents(world);

  const computed = computePollData({
    player: {
      economicPosition: player.policies?.economic ?? 0,
      socialPosition: player.policies?.social ?? 0,
      favorability: player.favorability,
      politicalInfluence: player.politicalInfluence,
      partyId: player.partyId,
      infamy: player.infamy,
    },
    region: {
      population: region.population ?? 0,
      votingEligiblePopulation: region.votingEligiblePopulation ?? null,
    },
    countryId: player.countryId,
    demographics,
    categories: active,
    partyOrgs,
    opponents: race?.opponents,
    liveTurnouts,
  });

  const granular = buildGranularPollPayload(
    {
      economicPosition: player.policies?.economic ?? 0,
      socialPosition: player.policies?.social ?? 0,
      favorability: player.favorability,
      politicalInfluence: player.politicalInfluence,
      partyId: player.partyId,
      infamy: player.infamy,
    },
    demographics,
    active,
    race?.opponents ?? [],
    liveTurnouts,
  );

  const snapshot: StoredPollSnapshot = {
    takenAt: world.meta.date,
    takenAtTurn: world.meta.turn,
    overallAppeal: computed.overallAppeal,
    totalEstimatedVoters: computed.totalEstimatedVoters,
    totalPotentialVoters: computed.totalPotentialVoters,
    topGroups: computed.topGroups,
    bottomGroups: computed.bottomGroups,
    // Small/large granularity distinction: only the full poll stores the
    // per-category breakdown (route.ts: ...(pollType === "large" ? { categories: pd.results } : {})).
    ...(pollType === "pollLarge" ? { categories: computed.results } : {}),
    ...(computed.inRaceVoteShare ? { inRaceVoteShare: computed.inRaceVoteShare } : {}),
    granular,
  };

  if (pollType === "pollLarge") {
    player.lastPollLarge = snapshot;
  } else {
    player.lastPoll = snapshot;
  }
  return {
    ok: true,
    snapshot,
    electionId: race?.electionId ?? null,
  };
}
