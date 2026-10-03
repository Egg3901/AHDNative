import type { WorldState } from "../types.js";
import { distributeVotesByGroupLevelAllocation } from "../electionEngine/voteDistribution.js";
import { NPP_STAGGER_EXTRA_MULTIPLIER, PRIMARY_CAMPAIGN_STAGGER_TICK_RATE, PRIMARY_CAMPAIGN_TICK_CAP, PRIMARY_HOME_SURGE_PCT } from "../electionEngine/constants.js";
import type { EnrichedCandidate } from "../electionEngine/types.js";
import { supportMoodMultiplier } from "../electionEngine/electionFormulaFactors.js";
import { allocateDelegates } from "./primaryDelegateAllocation.js";
import { applyPrimaryTurnoutRetention, computeTurnoutPoolFromRates, PRIMARY_TURNOUT_FACTOR } from "./primaryElectorate.js";
import {
  BUILTIN_PARTY_FAMILY,
  DEM_2020_DELEGATES,
  EV_2020_BASELINE,
  GOP_2020_DELEGATES,
  GOP_DEFAULT_ALLOCATION,
  PRIMARY_WAVES,
  type PrimaryCalendarFamily,
} from "./data/usPrimaryCalendar.js";
import { electoralVotesByState } from "./presidentialElectoralCollege.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { targetedAdBonusByGroup } from "../campaigns/targetedAds.js";
import type { ElectionRecord } from "./types.js";

const STRETCHED_OFFSETS = [40, 32, 24, 16, 8, 0] as const;

function wavesFor(race: ElectionRecord) {
  if ((race.primaryRulesetVersion ?? 1) < 3) return PRIMARY_WAVES;
  return PRIMARY_WAVES.map((wave, index) => ({
    ...wave,
    states: [...wave.states],
    turnsRemaining: STRETCHED_OFFSETS[index] ?? wave.turnsRemaining,
  }));
}

function partyFamily(world: WorldState, partyId: string): PrimaryCalendarFamily {
  const family = BUILTIN_PARTY_FAMILY[partyId.toLowerCase()];
  if (family) return family;
  return (world.parties[partyId]?.economicPosition ?? 0) < 0 ? "dem" : "gop";
}

function delegatesForState(world: WorldState, stateId: string, family: PrimaryCalendarFamily): number {
  const baseline = (family === "dem" ? DEM_2020_DELEGATES : GOP_2020_DELEGATES)[stateId] ?? 0;
  if (!baseline) return 0;
  const ev2020 = EV_2020_BASELINE[stateId];
  const evCurrent = electoralVotesByState(world, "US")[stateId];
  if (!ev2020 || !evCurrent || ev2020 === evCurrent) return baseline;
  return Math.max(1, Math.round(baseline * (evCurrent / ev2020)));
}

export function presidentialPrimaryMajority(world: WorldState, family: PrimaryCalendarFamily): number {
  const stateIds = Object.keys(family === "dem" ? DEM_2020_DELEGATES : GOP_2020_DELEGATES);
  const total = stateIds.reduce((sum, stateId) => sum + delegatesForState(world, stateId, family), 0);
  return Math.floor(total / 2) + 1;
}

export function presidentialPrimaryWavesComplete(race: ElectionRecord): boolean {
  const waves = wavesFor(race);
  const historyLength = race.primaryWaveHistory?.length ?? 0;
  const counted = Number.isSafeInteger(race.primaryStaggerWavesRun) && (race.primaryStaggerWavesRun ?? 0) >= 0
    ? race.primaryStaggerWavesRun!
    : historyLength;
  return counted >= waves.length;
}

/** Number of waves that the pinned source schedule considers due by this turn. */
export function duePresidentialPrimaryWaveCount(turnsToEnd: number, race: ElectionRecord): number {
  if (turnsToEnd < 0) return 0;
  return wavesFor(race).filter((wave) => turnsToEnd <= wave.turnsRemaining).length;
}

function registrationFor(world: WorldState, stateId: string, partyId: string): number {
  return Math.min(100, Math.max(0, Object.values(world.partyRegions).find(
    (row) => row.countryId === "US" && row.regionId === stateId && row.partyId === partyId,
  )?.registration ?? 0));
}

function cumulativePartyVotes(race: ElectionRecord, partyId: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const votes of Object.values(race.primaryStateVotes?.[partyId] ?? {})) {
    for (const [candidateId, value] of Object.entries(votes)) {
      totals[candidateId] = (totals[candidateId] ?? 0) + value;
    }
  }
  return totals;
}

function candidateCampaignTurnoutModifiers(world: WorldState, race: ElectionRecord, stateId: string): Record<string, number> {
  const modifiers: Record<string, number> = {};
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.electionId !== race.id || campaign.status !== "active") continue;
    for (const [key, value] of Object.entries(campaign.canvassModifiers ?? {})) {
      const [regionId, groupId] = key.split(":");
      if (regionId !== stateId || !groupId || !Number.isFinite(value)) continue;
      modifiers[groupId] = (modifiers[groupId] ?? 0) + value;
    }
  }
  const regionTurnout = world.regionTurnouts[stateId];
  for (const groups of Object.values(regionTurnout?.campaignModifiers ?? regionTurnout?.modifiers ?? {})) {
    for (const [groupId, value] of Object.entries(groups)) {
      if (Number.isFinite(value)) modifiers[groupId] = (modifiers[groupId] ?? 0) + value;
    }
  }
  return modifiers;
}

function primaryCandidatesForState(world: WorldState, race: ElectionRecord, stateId: string): EnrichedCandidate[] {
  const parties = Object.values(world.parties).filter((party) => party.countryId === "US");
  const partyById = new Map(parties.map((party) => [party.id, party]));
  return race.candidates
    .filter((candidate) => candidate.status !== "withdrawn")
    .map((candidate): EnrichedCandidate | null => {
      const party = partyById.get(candidate.partyId);
      const politician = candidate.id === "player" ? undefined : world.politicians.find((row) => row.id === candidate.id);
      const policies = candidate.id === "player"
        ? world.player.policies ?? { economic: 0, social: 0 }
        : politician?.ideology ?? { economic: 0, social: 0 };
      const isNPP = candidate.isNPP;
      const actor = candidate.id === "player" ? world.player : politician;
      if (!actor) return null;
      const nationalInfluence = isNPP
        ? actor.politicalInfluence
        : candidate.id === "player"
          ? world.player.nationalInfluence ?? 0
          : politician?.politicalInfluence ?? 0;
      const targetedAdBonuses: Record<string, number> = {};
      const campaign = world.campaigns[campaignKey(race.id, candidate.id)];
      for (const [key, value] of Object.entries(campaign?.targetedAdModifiers ?? {})) {
        const separator = key.indexOf(":");
        if (separator < 0 || !Number.isFinite(value)) continue;
        const groupId = key.slice(separator + 1);
        if (groupId) targetedAdBonuses[groupId] = (targetedAdBonuses[groupId] ?? 0) + Math.max(0, Math.min(0.25, value));
      }
      if (candidate.id === "player" && race.electionType !== "president" && world.player.targetedAds?.length) {
        const standing = targetedAdBonusByGroup(
          world,
          stateId,
          policies,
          world.player.targetedAds,
          world.meta.turn,
        );
        for (const [groupId, bonus] of Object.entries(standing)) {
          const legacy = targetedAdBonuses[groupId] ?? 0;
          targetedAdBonuses[groupId] = legacy > 0 ? (1 + legacy) * (1 + bonus) - 1 : bonus;
        }
      }
      return {
        candidateId: candidate.id,
        characterId: candidate.id,
        characterName: candidate.name,
        party: candidate.partyId,
        isNPP,
        charEP: policies.economic,
        charSP: policies.social,
        favorability: actor.favorability,
        politicalInfluence: actor.politicalInfluence,
        nationalInfluence,
        ...(isNPP ? {} : { partyInfluence: candidate.id === "player" ? world.player.partyInfluence ?? 0 : politician?.partyInfluence ?? 0 }),
        ...(party ? { partyEcon: party.economicPosition, partySocial: party.socialPosition } : {}),
        ...(typeof world.candidateSupports?.[candidate.id]?.support === "number"
          ? { support: world.candidateSupports[candidate.id]!.support }
          : {}),
        ...(actor.infamy > 0 ? { infamy: actor.infamy } : {}),
        ...(Object.keys(targetedAdBonuses).length > 0 ? { targetedAdBonuses } : {}),
      };
    })
    .filter((candidate): candidate is EnrichedCandidate => candidate !== null);
}

function projectedSourcePrimaryVotes(world: WorldState, race: ElectionRecord, stateId: string, partyId: string): Record<string, number> {
  const region = world.regions[stateId];
  const demographics = world.stateDemographics[stateId];
  const categories = world.demographicCategories.US ?? [];
  if (!region || !demographics || categories.length === 0) return {};
  const party = world.parties[partyId];
  const candidates = primaryCandidatesForState(world, race, stateId).filter((candidate) => candidate.party === partyId);
  if (!party || candidates.length === 0) return {};

  const turnoutModifiers = candidateCampaignTurnoutModifiers(world, race, stateId);
  const baseTurnouts: Record<string, number> = {};
  for (const category of categories) {
    for (const group of category.groups) {
      const base = demographics.groups[group.id]?.turnout ?? group.defaultTurnout ?? 55;
      baseTurnouts[group.id] = Math.max(0, Math.min(100, base + (turnoutModifiers[group.id] ?? 0)));
    }
  }
  const primaryTurnouts = applyPrimaryTurnoutRetention(baseTurnouts, demographics, party);
  const primaryDemographics = {
    ...demographics,
    groups: Object.fromEntries(Object.entries(demographics.groups).map(([id, group]) => [
      id,
      { ...group, turnout: primaryTurnouts[id] ?? group.turnout ?? 55 },
    ])),
  };
  const sourceTurnoutPool = computeTurnoutPoolFromRates(
    region.population ?? 0,
    primaryDemographics as never,
    categories as never,
    primaryTurnouts,
  );
  const primaryTurnoutPool = sourceTurnoutPool * PRIMARY_TURNOUT_FACTOR;
  const homeStateByCandidate = new Map<string, string>();
  if (world.player.homeRegionId) homeStateByCandidate.set("player", world.player.homeRegionId);
  const stateOrgByCandidate = new Map<string, number>();
  const playerStateOrgLevel = world.player.primaryStateOrganizations?.[stateId]?.level;
  if (playerStateOrgLevel !== undefined) stateOrgByCandidate.set("player", playerStateOrgLevel);
  for (const politician of world.politicians) {
    const homeState = (politician as typeof politician & { homeState?: string }).homeState;
    if (homeState) homeStateByCandidate.set(politician.id, homeState);
  }
  const distributed = distributeVotesByGroupLevelAllocation(
    candidates,
    primaryTurnoutPool,
    sourceTurnoutPool,
    region.population ?? 0,
    primaryDemographics as never,
    categories as never,
    new Map(),
    {
      useAveragedPositions: false,
      includeInfluenceInAppeal: false,
      useNationalInfluenceForReach: true,
      presidentialPrimaryNationalReach: true,
      applyPartyFit: true,
      currentStateId: stateId,
      countryId: "US",
      liveTurnouts: primaryTurnouts,
      homeStateByCandidate,
      stateOrgByCandidate,
      hasPlayerInRace: candidates.some((candidate) => !candidate.isNPP),
    },
  );
  const votes = { ...distributed.votesPerCandidate };
  for (const candidate of race.candidates) {
    let multiplier = 1;
    if (candidate.primaryCampaignState === stateId) {
      const ticks = Math.min(PRIMARY_CAMPAIGN_TICK_CAP, Math.max(0, candidate.primaryCampaignTicks ?? 0));
      multiplier *= 1 + ticks * PRIMARY_CAMPAIGN_STAGGER_TICK_RATE;
    }
    if (candidate.primarySurgeUsed && candidate.id === "player" && world.player.homeRegionId === stateId) {
      multiplier *= 1 + (candidate.primarySurgeBoost ?? PRIMARY_HOME_SURGE_PCT) / 100;
    }
    if (multiplier !== 1) votes[candidate.id] = Math.round((votes[candidate.id] ?? 0) * multiplier);
  }
  if (candidates.some((candidate) => !candidate.isNPP)) {
    for (const candidate of candidates) {
      if (candidate.isNPP) votes[candidate.candidateId] = Math.round((votes[candidate.candidateId] ?? 0) * NPP_STAGGER_EXTRA_MULTIPLIER);
    }
  }
  for (const candidate of candidates) {
    const mood = supportMoodMultiplier(candidate.support);
    votes[candidate.candidateId] = Math.round((votes[candidate.candidateId] ?? 0) * mood);
  }
  return votes;
}

/** Run exactly the next due 2020-source presidential primary wave. */
export function processPresidentialPrimaryWave(world: WorldState, race: ElectionRecord): boolean {
  if (race.countryId !== "US" || race.electionType !== "president" || race.status !== "active") return false;
  const waves = wavesFor(race);
  const historyLength = race.primaryWaveHistory?.length ?? 0;
  const counted = Number.isSafeInteger(race.primaryStaggerWavesRun) && (race.primaryStaggerWavesRun ?? 0) >= 0
    ? race.primaryStaggerWavesRun!
    : historyLength;
  if (counted >= waves.length) return false;
  const wave = waves[counted];
  const turnsToEnd = race.primaryEndTurn - world.meta.turn;
  // Game computes a due-wave count and catches up one outstanding wave at a
  // time. Requiring equality here silently loses a wave whenever a turn is
  // skipped or the primary scheduler is resumed after an overdue save.
  if (!wave || turnsToEnd < 0 || turnsToEnd > wave.turnsRemaining) return false;

  race.primaryStateVotes ??= {};
  race.primaryDelegates ??= {};
  race.primaryDelegatesByState ??= {};
  race.primaryAllocationByState ??= {};
  const activeCandidates = race.candidates.filter((candidate) => candidate.status !== "withdrawn");
  const partyIds = [...new Set(activeCandidates.map((candidate) => candidate.partyId))].sort();

  for (const stateId of wave.states) {
    const region = world.regions[stateId];
    if (!region || region.countryId !== "US" || region.corporationHeadquartersOnly === true || !world.stateDemographics[stateId]) continue;
    for (const partyId of partyIds) {
      const family = partyFamily(world, partyId);
      const candidates = activeCandidates.filter((candidate) => candidate.partyId === partyId);
      if (candidates.length === 0) continue;
      const votes = projectedSourcePrimaryVotes(world, race, stateId, partyId);
      if (Object.keys(votes).length === 0) continue;

      race.primaryStateVotes[partyId] ??= {};
      const stateVotes = race.primaryStateVotes[partyId][stateId] ??= {};
      for (const [candidateId, ballots] of Object.entries(votes)) {
        stateVotes[candidateId] = (stateVotes[candidateId] ?? 0) + ballots;
      }

      const delegates = delegatesForState(world, stateId, family);
      if (delegates <= 0) continue;
      race.primaryDelegates[partyId] ??= {};
      race.primaryDelegatesByState[partyId] ??= {};
      const prior = race.primaryDelegatesByState[partyId]![stateId];
      if (prior) continue;

      let allocation: Record<string, number>;
      if (candidates.length === 1) {
        allocation = { [candidates[0]!.id]: delegates };
      } else {
        const method = family === "dem" ? "PR" : GOP_DEFAULT_ALLOCATION[stateId] ?? "WTA";
        race.primaryAllocationByState[partyId] ??= {};
        race.primaryAllocationByState[partyId]![stateId] = method;
        allocation = allocateDelegates(method, stateVotes, delegates, cumulativePartyVotes(race, partyId)).byCandidate;
      }
      race.primaryDelegatesByState[partyId]![stateId] = allocation;
      for (const [candidateId, count] of Object.entries(allocation)) {
        race.primaryDelegates[partyId]![candidateId] = (race.primaryDelegates[partyId]![candidateId] ?? 0) + count;
      }
    }
  }

  race.primaryWaveHistory ??= [];
  race.primaryWaveHistory.push({
    wave: counted,
    turnsRemaining: wave.turnsRemaining,
    statesVoted: [...wave.states],
    turn: world.meta.turn,
  });
  race.primaryStaggerWavesRun = counted + 1;
  return true;
}
