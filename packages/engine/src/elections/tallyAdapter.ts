import type { WorldRng } from "../rng.js";
import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";
import { accumulateVoteTurn } from "../electionEngine/tally/accumulateVoteTurn.js";
import { initElectionVoteTally } from "../electionEngine/tally/initElectionVoteTally.js";
import type {
  AccumulateVoteTurnInput,
  TallyCandidateInput,
  TallyDerivedInputs,
  TallyInput,
  TallyStatePartyOrgInput,
  TallyTurnoutInput,
} from "../electionEngine/tally/types.js";
import { enrichCandidates } from "../electionEngine/candidateEnrichment.js";
import type {
  State as EngineState,
  StateDemographics as EngineStateDemographics,
  StateDemographicTurnout as EngineStateDemographicTurnout,
} from "../electionEngine/types.js";
import { aggregateFundsByParty } from "../electionEngine/fundsByParty.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { campaignStrengthVoteMultiplier } from "../campaigns/campaignStrength.js";
import { buildNationwideElectoratePreload } from "../electionEngine/nationwideElectorate.js";
import { distributeVotesByGroupLevelAllocation } from "../electionEngine/voteDistribution.js";
import { distributeVotesBySwingFlow } from "../electionEngine/voteDistributionSwingFlow.js";
import { CAMPAIGN_TARGETED_AD_CAP } from "../actions/campaignTargetedAd.js";
import { electoralVoteUnitsForWorld } from "./presidentialElectoralCollege.js";
import { appliesExplicitPresidentialLean, presidentialRulesetVersionFor } from "./presidentialRuleset.js";
import { displayLean, PRESIDENTIAL_UNIT_LEAN, presidentialLeanVoteMultiplier, sourceFallbackStateLean } from "./presidentialLean.js";
import { dcPresidentialDemographics } from "./dcPresidentialDemographics.js";

/**
 * W21c tally wiring: feeds the ported accumulateVoteTurn from WorldState.
 * US races run the real mainline vote math against W16 demographics.
 * Races whose state lacks demographic tables (UK/RU/DD until W39) return
 * false and stay on the stub accumulator.
 *
 * W24b: the presidential general now runs the SAME per-state accumulation
 * every US state actually holds its own tally against — real Electoral
 * College, not a nationwide aggregate — via `realAccumulatePresident`. The
 * nationwide aggregate (`nationwideSliceFor`) survives only as its defensive
 * fallback for a world whose states carry no demographics at all.
 */

function worldNow(world: WorldState): Date {
  return new Date(`${world.meta.date}T00:00:00Z`);
}

/**
 * Turnout resolution from demographic tables. Mainline's resolveTurnout is
 * caller-supplied in the pure tally; this derivation mirrors its semantics:
 * per-group turnout percentages, pool = VEP share weighted by category weight
 * and group turnout. PORT-STUB-DERIVED: replaced verbatim if/when
 * resolveTurnout itself is ported. Shared by the per-state and
 * nationwide-aggregate (W24 president) paths.
 */
function deriveTurnoutFrom(
  demo: Pick<EngineStateDemographics, "groups" | "categoryWeights">,
  vep: number,
  campaignModifiers: Record<string, number> = {},
): TallyTurnoutInput {
  const byGroup: Record<string, number> = {};
  let weighted = 0;
  let weightSum = 0;
  for (const [groupId, group] of Object.entries(demo.groups)) {
    const turnout = Math.max(0, Math.min(100,
      (typeof group.turnout === "number" ? group.turnout : 55) + (campaignModifiers[groupId] ?? 0),
    ));
    byGroup[groupId] = turnout;
    const wgt = demo.categoryWeights[groupId] ?? 0;
    weighted += wgt * turnout;
    weightSum += wgt;
  }
  const avgTurnout = weightSum > 0 ? weighted / weightSum : 55;
  return { totalPool: Math.round((vep * avgTurnout) / 100), byGroup };
}

function campaignTurnoutModifiers(world: WorldState, electionId: string | undefined): Record<string, number> {
  if (!electionId) return {};
  const modifiers: Record<string, number> = {};
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.electionId !== electionId || campaign.status !== "active") continue;
    for (const [key, value] of Object.entries(campaign.canvassModifiers ?? {})) {
      const separator = key.indexOf(":");
      if (separator < 0 || !Number.isFinite(value)) continue;
      const groupId = key.slice(separator + 1);
      modifiers[groupId] = (modifiers[groupId] ?? 0) + value;
    }
  }
  return modifiers;
}

function campaignTargetedAdBonuses(
  world: WorldState,
  electionId: string,
  candidateId: string,
): Record<string, number> | undefined {
  const campaign = world.campaigns[campaignKey(electionId, candidateId)];
  if (!campaign || campaign.status !== "active") return undefined;
  const bonuses: Record<string, number> = {};
  for (const [key, value] of Object.entries(campaign.targetedAdModifiers ?? {})) {
    const separator = key.indexOf(":");
    if (separator < 0 || !Number.isFinite(value)) continue;
    const groupId = key.slice(separator + 1);
    const bonus = Math.max(0, Math.min(CAMPAIGN_TARGETED_AD_CAP, value));
    if (bonus > 0) bonuses[groupId] = (bonuses[groupId] ?? 0) + bonus;
  }
  return Object.keys(bonuses).length > 0 ? bonuses : undefined;
}

/**
 * #68: per-candidate campaign-strength vote multiplier, keyed by the
 * ElectionRecord candidate id.
 *
 * WHERE the reference applies it: ONLY in AHDGame's presidential engine
 * (src/lib/presidentialElectionEngine.ts, ~line 976) — it multiplies each
 * unit's current-turn votes by `campaignStrengthVoteMultiplier(cs, …)`. A grep
 * of the whole AHDGame src/lib found no other engine reading
 * `campaignStrengthVoteMultiplier`: the general/down-ballot tower
 * (electionEngine/tallyManagement.ts, ported here as
 * electionEngine/tally/accumulateVoteTurn.ts) never touches campaign strength.
 * Native routes BOTH the president's per-state tallies and down-ballot races
 * through that same `accumulateVoteTurn`, so the presidential-only gate lives
 * HERE: the caller passes this map for president races only, down-ballot races
 * pass nothing, and the accumulator stays a generic multiplier consumer.
 *
 * WHY strength<=0 is skipped: the multiplier is exactly 1 at strength 0, so an
 * empty/absent map leaves every existing save and fixture byte-identical.
 */
function buildCampaignStrengthVoteMultipliers(
  world: WorldState,
  electionId: string,
): Record<string, number> | undefined {
  const multipliers: Record<string, number> = {};
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.electionId !== electionId) continue;
    const strength = campaign.campaignStrength ?? 0;
    if (strength <= 0) continue;
    multipliers[campaign.candidateId] = campaignStrengthVoteMultiplier(strength);
  }
  return Object.keys(multipliers).length > 0 ? multipliers : undefined;
}

/** Source presidential candidate-local multipliers, applied after campaign strength. */
function buildPresidentialLocalVoteMultipliers(
  world: WorldState,
  rec: ElectionRecord,
  stateId: string,
  unitId: string,
): Record<string, number[]> | undefined {
  const byCandidate: Record<string, number[]> = {};
  const unitLean = PRESIDENTIAL_UNIT_LEAN[unitId] ?? sourceStateLean(world, stateId);
  const districtLean = PRESIDENTIAL_UNIT_LEAN[unitId] !== undefined;
  const legacyLeanEnabled = appliesExplicitPresidentialLean(presidentialRulesetVersionFor(rec));
  for (const candidate of rec.candidates) {
    const multipliers: number[] = [];
    if (legacyLeanEnabled && unitLean !== 0) {
      const party = world.parties[candidate.partyId];
      const politician = world.politicians.find((entry) => entry.id === candidate.id);
      const positions = party
        ? [party.economicPosition, party.socialPosition]
        : [politician?.ideology?.economic, politician?.ideology?.social];
      if (positions.every((position) => typeof position === "number" && Number.isFinite(position))) {
        const average = ((positions[0] as number) + (positions[1] as number)) / 2;
        const sign = average > 0 ? 1 : average < 0 ? -1 : 0;
        if (sign !== 0) multipliers.push(presidentialLeanVoteMultiplier(unitLean, sign, districtLean));
      }
    }
    if (!candidate.campaignSuspended && candidate.runningMateId) {
      // Game resolves VP home states from characters, not NPPs. Native's
      // single human character is the player; generated NPC tickets never
      // acquire a human running-mate bonus from a politician's home state.
      const mateHomeState = candidate.runningMateId === "player" ? world.player.homeRegionId : undefined;
      if (mateHomeState === stateId) multipliers.push(1.03);
    }
    if (
      rec.governorEndorsements?.some((endorsement) =>
        endorsement.isActive && endorsement.stateId === stateId && endorsement.candidateId === candidate.id,
      )
    ) {
      multipliers.push(1.015);
    }
    if (multipliers.length > 0) byCandidate[candidate.id] = multipliers;
  }
  return Object.keys(byCandidate).length > 0 ? byCandidate : undefined;
}

function sourceStateLean(world: WorldState, stateId: string): number {
  const demographics = world.stateDemographics[stateId];
  if (!demographics) return sourceFallbackStateLean(stateId);
  if (typeof demographics.cachedEconomicLean === "number" && typeof demographics.cachedSocialLean === "number") {
    return displayLean(demographics.cachedEconomicLean, demographics.cachedSocialLean);
  }
  const categories = world.demographicCategories?.["US"] ?? [];
  let totalWeight = 0;
  let economic = 0;
  let social = 0;
  for (const category of categories) {
    const categoryId = typeof (category as { id?: unknown }).id === "string"
      ? (category as unknown as { id: string }).id
      : (category as { _id?: string })._id;
    const categoryWeight = categoryId ? (demographics.categoryWeights[categoryId] ?? 0) : 0;
    if (categoryWeight <= 0) continue;
    for (const group of category.groups) {
      const row = demographics.groups[group.id];
      if (!row) continue;
      const weight = (row.population / 100) * (row.turnout / 100) * (categoryWeight / 100);
      totalWeight += weight;
      economic += weight * row.economicLean;
      social += weight * row.socialLean;
    }
  }
  if (totalWeight <= 0) return sourceFallbackStateLean(stateId);
  return displayLean(
    Math.max(-5, Math.min(5, Math.round((economic / totalWeight) * 100) / 100)),
    Math.max(-5, Math.min(5, Math.round((social / totalWeight) * 100) / 100)),
  );
}

function deriveTurnout(
  world: WorldState,
  stateId: string,
  electionId?: string,
  demographicOverride?: Pick<EngineStateDemographics, "groups" | "categoryWeights">,
  populationOverride?: number,
): TallyTurnoutInput | null {
  const demo = demographicOverride ?? world.stateDemographics[stateId];
  const region = world.regions[stateId];
  if (!demo || !region) return null;
  const vep = populationOverride ?? region.votingEligiblePopulation ?? region.population ?? 0;
  const modifiers = campaignTurnoutModifiers(world, electionId);
  const regional = world.regionTurnouts[stateId]?.campaignModifiers;
  for (const groups of Object.values(regional ?? {})) {
    for (const [group, value] of Object.entries(groups)) modifiers[group] = (modifiers[group] ?? 0) + value;
  }
  return deriveTurnoutFrom(demo, vep, modifiers);
}

/** Resolved regional turnout pool shared by general and primary ballot paths. */
export function turnoutPoolForElection(world: WorldState, stateId: string, electionId?: string): number | null {
  return deriveTurnout(world, stateId, electionId)?.totalPool ?? null;
}

/**
 * Population-weighted national organization/registration per party — the
 * simple aggregate `accumulateVoteTurn` actually consumes (it only reads
 * `partyId`/`organization`/`registration`, never `stateId`, so there is no
 * need to route through the heavier `StatePartyOrg` shape
 * `buildNationwideElectoratePreload` returns).
 */
function nationalPartyOrgs(world: WorldState, countryId: string): TallyStatePartyOrgInput[] {
  const byParty = new Map<string, { orgWeighted: number; regWeighted: number; weight: number }>();
  for (const pr of Object.values(world.partyRegions)) {
    if (pr.countryId !== countryId) continue;
    const weight = world.regions[pr.regionId]?.population ?? 0;
    if (weight <= 0) continue;
    const acc = byParty.get(pr.partyId) ?? { orgWeighted: 0, regWeighted: 0, weight: 0 };
    acc.orgWeighted += pr.organization * weight;
    acc.regWeighted += (pr.registration ?? 0) * weight;
    acc.weight += weight;
    byParty.set(pr.partyId, acc);
  }
  const result: TallyStatePartyOrgInput[] = [];
  for (const [partyId, acc] of [...byParty.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (acc.weight <= 0) continue;
    result.push({
      stateId: countryId,
      partyId,
      organization: acc.orgWeighted / acc.weight,
      registration: acc.regWeighted / acc.weight,
    });
  }
  return result;
}

function derivedInputs(world: WorldState, rec: ElectionRecord): TallyDerivedInputs {
  const incumbentSeatShareByParty = new Map<string, number>();
  const leg = world.legislatures[rec.countryId];
  const chamber = leg?.chambers.find((c) => c.key === rec.chamberKey);
  if (chamber) {
    const held = Object.values(chamber.composition.seatsByParty).reduce((a, b) => a + b, 0);
    if (held > 0) {
      for (const [pid, seats] of Object.entries(chamber.composition.seatsByParty)) {
        incumbentSeatShareByParty.set(pid, seats / held);
      }
    }
  }
  // #92: tally reads the decaying campaign spend stock plus this turn's
  // accumulator. Hoarded treasury funds never enter this driver.
  // electionEngine/fundsByParty.ts aggregateFundsByParty. Races without
  // campaigns (isCampaignEligible.ts gates which races get one) correctly
  // yield an empty map, same as mainline where no Campaign doc exists.
  const fundsByParty = aggregateFundsByParty(
    rec.candidates.map((cand) => {
      const campaign = world.campaigns[campaignKey(rec.id, cand.id)];
      return {
        party: cand.partyId,
        spendStock: campaign?.spendStock ?? 0,
        spendThisTurn: campaign?.spendThisTurn ?? 0,
      };
    }),
  );
  // W24: the sitting president's party feeds the presidential-coattail driver
  // for down-ballot races (accumulateVoteTurn.ts self-excludes the
  // president's own race via isHeadOfGovernmentRace, so this is a no-op
  // there). Approval is PORT-STUB neutral (50) — no approval-rating system
  // exists yet for the executive.
  const exec = world.executives[rec.countryId];
  const president = exec?.presidentId ? { partyId: exec.presidentParty ?? "independent", approval: 50 } : null;

  return {
    // PORT-STUB: no approval system yet; mainline neutral.
    approvalPct: 50,
    fundsByParty,
    incumbentSeatShareByParty,
    govExecutive: null,
    president,
    isOnePartyState: world.countryPolitics[rec.countryId]?.regime === "one-party",
  } as TallyDerivedInputs;
}

export interface StateSlice {
  /** Tally unit id — a real state id for down-ballot races, `countryId` for the nationwide president aggregate. */
  stateId: string;
  state: { name: string; population: number; votingEligiblePopulation: number | null };
  demographics: EngineStateDemographics;
  turnout: TallyTurnoutInput;
  statePartyOrgs: TallyStatePartyOrgInput[];
}

/** Per-state slice (house/senate/governor/...): real region + demographic table lookups. */
function stateSliceFor(
  world: WorldState,
  stateId: string,
  electionId?: string,
  includePresidentialDc = false,
): StateSlice | null {
  const isPresidentialDc = includePresidentialDc && stateId === "DC" &&
    world.regions.DC?.countryId === "US" && world.regions.DC.corporationHeadquartersOnly === true;
  const demoRaw = isPresidentialDc
    ? dcPresidentialDemographics(world.meta.era, worldNow(world).toISOString())
    : world.stateDemographics[stateId];
  const region = world.regions[stateId];
  if (!demoRaw || !region) return null;
  const sourceFallbackPopulation = isPresidentialDc ? 689_545 : undefined;
  const turnout = deriveTurnout(world, stateId, electionId, demoRaw, sourceFallbackPopulation);
  if (!turnout) return null;

  const statePartyOrgs: TallyStatePartyOrgInput[] = [];
  for (const [key, pr] of Object.entries(world.partyRegions)) {
    if (!key.startsWith(`${stateId}:`)) continue;
    statePartyOrgs.push({
      stateId,
      partyId: pr.partyId,
      organization: pr.organization,
      registration: pr.registration,
    });
  }

  // World demographics persist lastUpdated as an ISO string for JSON safety;
  // the tally contract mirrors the Mongo doc with a Date.
  const demographics = { ...demoRaw, lastUpdated: new Date(demoRaw.lastUpdated) } as unknown as EngineStateDemographics;

  return {
    stateId,
    state: {
      name: region.name,
      population: sourceFallbackPopulation ?? region.population ?? 0,
      votingEligiblePopulation: region.votingEligiblePopulation ?? null,
    },
    demographics,
    turnout,
    statePartyOrgs,
  };
}

/**
 * Nationwide slice (president, W24): every state of `countryId` folded into
 * one uniform electorate via mainline's own `nationwideElectorate.ts`
 * (verbatim port, previously only wired for the presidential primary — see
 * presidentialResolution.ts file doc for the port-scope rationale). Party
 * orgs are aggregated separately (`nationalPartyOrgs`) since the caller only
 * needs the simple `{partyId, organization, registration}` shape.
 */
function nationwideSliceFor(world: WorldState, countryId: string, electionId?: string): StateSlice | null {
  const regions = Object.values(world.regions).filter((r) => r.countryId === countryId);
  if (regions.length === 0) return null;

  const statesPlain = regions.map((r) => ({
    _id: r.id,
    countryId,
    regionType: "state",
    name: r.name,
    population: r.population ?? 0,
    votingEligiblePopulation: r.votingEligiblePopulation,
    workingAgePopulation: r.workingAgePopulation,
    militaryServicePopulation: r.militaryServicePopulation,
    gdp: r.gdp,
    houseDistricts: r.houseSeats,
    votingSystem: "fptp",
  })) as unknown as EngineState[];

  const demoPlain = regions
    .map((r) => world.stateDemographics[r.id])
    .filter((d): d is NonNullable<typeof d> => d != null)
    .map((d) => ({ ...d, lastUpdated: new Date(d.lastUpdated) })) as unknown as EngineStateDemographics[];
  if (demoPlain.length === 0) return null;

  const now = worldNow(world);
  const turnoutPlain = regions.map((r) => {
    const rt = world.regionTurnouts[r.id];
    return { _id: r.id, countryId, modifiers: rt?.modifiers ?? {}, lastDecayApplied: now, lastUpdated: now };
  }) as unknown as EngineStateDemographicTurnout[];

  const preload = buildNationwideElectoratePreload(countryId, statesPlain, demoPlain, turnoutPlain, []);
  if (!preload) return null;

  const vep = preload.state.votingEligiblePopulation ?? preload.state.population;
  const turnout = deriveTurnoutFrom(preload.demographics, vep, campaignTurnoutModifiers(world, electionId));

  return {
    stateId: countryId,
    state: {
      name: preload.state.name,
      population: preload.state.population,
      votingEligiblePopulation: preload.state.votingEligiblePopulation ?? null,
    },
    demographics: preload.demographics,
    turnout,
    statePartyOrgs: nationalPartyOrgs(world, countryId),
  };
}

/** Shared accumulate core: mirrors mainline's per-turn tally write against a resolved state/nationwide slice. */
function runAccumulate(world: WorldState, rng: WorldRng, rec: ElectionRecord, slice: StateSlice): boolean {
  const result = runAccumulateCore(world, rng, rec, slice, rec.tallyState);
  if (!result) return false;
  rec.tallyState = result.tallyState as unknown as ElectionRecord["tallyState"];
  rec.tally = { ...result.totals };
  return true;
}

/**
 * State-agnostic accumulate core (W24b): identical math to the single-state
 * `runAccumulate`, but takes/returns the prior tally state explicitly
 * instead of reading/writing `rec.tallyState` directly, so the presidential
 * per-state path (`realAccumulatePresident`) can call it once per state
 * against N independent tally documents sharing one `ElectionRecord`.
 */
function runAccumulateCore(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
  slice: StateSlice,
  priorTallyState: unknown,
  presidentialModifierStateId: string = slice.stateId,
): { tallyState: unknown; totals: Record<string, number> } | null {
  const { stateId, state, demographics, turnout, statePartyOrgs } = slice;

  const now = worldNow(world);
  const player = world.player;
  const candidates: TallyCandidateInput[] = rec.candidates.map((c) => {
    const support = world.candidateSupports?.[c.id]?.support;
    const targetedAdBonuses = campaignTargetedAdBonuses(world, rec.id, c.id);
    return {
      _id: c.id,
      electionId: rec.id,
      ...(c.id === "player" ? { characterId: "player" } : { nppId: c.id }),
      characterName: c.name,
      party: c.partyId,
      status: "active",
      isNPP: c.isNPP,
      support: typeof support === "number" ? support : 50,
      ...(targetedAdBonuses ? { targetedAdBonuses } : {}),
    };
  });

  let tallyState = priorTallyState as TallyInput | undefined;
  if (!tallyState) {
    const init = initElectionVoteTally({
      electionId: rec.id,
      candidates,
      state: stateId,
      primaryResults: rec.primaryResults,
      now,
    });
    tallyState = init.tally;
  }

  const categories = world.demographicCategories?.[rec.countryId] ?? [];
  const characters = rec.candidates.some((c) => c.id === "player")
    ? [
        {
          _id: "player",
          policies: player.policies ?? { economic: 0, social: 0 },
          favorability: player.favorability,
          politicalInfluence: player.politicalInfluence,
          ...(typeof player.nationalInfluence === "number"
            ? { nationalInfluence: player.nationalInfluence }
            : {}),
          ...(typeof player.partyInfluence === "number" ? { partyInfluence: player.partyInfluence } : {}),
          infamy: player.infamy,
        },
      ]
    : [];
  const npps = rec.candidates.flatMap((candidate) => {
    if (!candidate.isNPP) return [];
    const politician = world.politicians.find((entry) => entry.id === candidate.id);
    if (!politician) return [];
    return [
      {
        _id: candidate.id,
        policies: politician.ideology,
        favorability: politician.favorability,
        politicalInfluence: politician.politicalInfluence,
      },
    ];
  });

  const enriched = enrichCandidates(
    candidates.map((c) => ({
      _id: c._id,
      electionId: c.electionId,
      // Enrichment requires characterId; NPPs use their own id (nppId also set).
      characterId: c.characterId ?? c._id,
      nppId: c.nppId ?? null,
      characterName: c.characterName,
      party: c.party,
      isNPP: c.isNPP ?? true,
      ...(typeof c.support === "number" ? { support: c.support } : {}),
      ...(c.targetedAdBonuses ? { targetedAdBonuses: c.targetedAdBonuses } : {}),
    })),
    {
      parties: Object.values(world.parties)
        .filter((p) => p.countryId === rec.countryId)
        .map((p) => ({
          sequentialId: p.id,
          name: p.name,
          abbreviation: p.abbreviation,
          color: p.color ?? "#888888",
          countryId: p.countryId,
          economicPosition: p.economicPosition,
          socialPosition: p.socialPosition,
        })),
      characters,
      npps,
      includePartyPositions: true,
    } as unknown as Parameters<typeof enrichCandidates>[1],
  );

  const isGeneralElection = world.meta.turn >= rec.primaryEndTurn;
  // #68: campaign strength only multiplies presidential GENERAL votes (see
  // buildCampaignStrengthVoteMultipliers). Down-ballot races and primary-phase
  // president tallies pass nothing, so the accumulator is byte-identical.
  const voteMultiplierByCandidateId =
    rec.electionType === "president" && isGeneralElection
      ? buildCampaignStrengthVoteMultipliers(world, rec.id)
      : undefined;
  const additionalVoteMultipliersByCandidateId =
    rec.electionType === "president" && isGeneralElection
      ? buildPresidentialLocalVoteMultipliers(world, rec, presidentialModifierStateId, slice.stateId)
      : undefined;
  const input: AccumulateVoteTurnInput = {
    election: {
      _id: rec.id,
      countryId: rec.countryId,
      electionType: rec.electionType,
      state: stateId,
      startTurn: rec.startTurn,
      endTurn: rec.endTurn,
      primaryEndTurn: rec.primaryEndTurn,
      totalSeats: rec.totalSeats,
      endTime: new Date(now.getTime() + (rec.endTurn - world.meta.turn) * 3600_000),
      createdAt: now,
    },
    candidates,
    tally: tallyState,
    state: {
      _id: stateId,
      countryId: rec.countryId,
      name: state.name,
      population: state.population,
      votingEligiblePopulation: state.votingEligiblePopulation,
      votingSystem: "fptp",
    },
    demographics,
    categories: categories as unknown as AccumulateVoteTurnInput["categories"],
    statePartyOrgs,
    turnout,
    enriched,
    turnNumber: world.meta.turn,
    now,
    derived: derivedInputs(world, rec),
    distributeFn: isGeneralElection
      ? distributeVotesBySwingFlow
      : distributeVotesByGroupLevelAllocation,
    rng,
    isGeneralElection,
    ...(voteMultiplierByCandidateId ? { voteMultiplierByCandidateId } : {}),
    ...(additionalVoteMultipliersByCandidateId
      ? { additionalVoteMultipliersByCandidateId }
      : {}),
  };

  const result = accumulateVoteTurn(input);
  if (!result) return null;
  return { tallyState: result.tally, totals: { ...result.newTotals } };
}

function scaledElectoralDistrictSlice(slice: StateSlice, unitId: string, share: number): StateSlice {
  return {
    ...slice,
    stateId: unitId,
    state: {
      ...slice.state,
      name: `${slice.state.name} ${unitId}`,
      population: slice.state.population * share,
      ...(typeof slice.state.votingEligiblePopulation === "number"
        ? { votingEligiblePopulation: slice.state.votingEligiblePopulation * share }
        : {}),
    },
    turnout: { ...slice.turnout, totalPool: slice.turnout.totalPool * share },
  };
}

function combinedDistrictTallyState(
  parentStateId: string,
  districtTallies: readonly TallyInput[],
): TallyInput {
  const first = districtTallies[0]!;
  const totalVotes: Record<string, number> = {};
  const snapshotsByTurn = new Map<number, { recordedAt: Date; cumulativeVotes: Record<string, number> }>();
  for (const tally of districtTallies) {
    for (const [candidateId, votes] of Object.entries(tally.totalVotes)) {
      totalVotes[candidateId] = (totalVotes[candidateId] ?? 0) + votes;
    }
    for (const snapshot of tally.turnSnapshots) {
      const combined = snapshotsByTurn.get(snapshot.turn) ?? {
        recordedAt: snapshot.recordedAt,
        cumulativeVotes: {},
      };
      for (const [candidateId, votes] of Object.entries(snapshot.cumulativeVotes)) {
        combined.cumulativeVotes[candidateId] = (combined.cumulativeVotes[candidateId] ?? 0) + votes;
      }
      snapshotsByTurn.set(snapshot.turn, combined);
    }
  }
  const turnSnapshots = [...snapshotsByTurn.entries()]
    .sort(([a], [b]) => a - b)
    .map(([turn, snapshot]) => {
      const total = Object.values(snapshot.cumulativeVotes).reduce((sum, votes) => sum + votes, 0);
      return {
        turn,
        recordedAt: snapshot.recordedAt,
        cumulativeVotes: snapshot.cumulativeVotes,
        sharesPct: Object.fromEntries(
          Object.entries(snapshot.cumulativeVotes).map(([candidateId, votes]) => [
            candidateId,
            total > 0 ? Math.round((votes / total) * 1000) / 10 : 0,
          ]),
        ),
      };
    });
  return {
    ...first,
    _id: `${first.electionId}:${parentStateId}:derived-at-large`,
    state: parentStateId,
    totalVotes,
    turnSnapshots,
    updatedAt: first.updatedAt,
  };
}

/**
 * Presidential per-state accumulation (W24b): the real Electoral College
 * path. Runs `runAccumulateCore` once per US state that has a valid tally
 * slice (real region + demographics), each against its own persisted
 * `rec.stateTallyStates[stateId]` tally document, and folds the per-state
 * cumulative totals into `rec.tally` as the national popular-vote sum (kept
 * for display/withdrawal-cleanup parity with every other race — NOT used
 * for the majority test, which `presidentialResolution.ts` computes from
 * real per-state electoral votes).
 *
 * Iteration order is the sorted state id list: `rng` is a single shared
 * stream consumed once per state per turn, so a stable order is required
 * for determinism (same doctrine as `runVoteAccumulation`'s sorted record
 * iteration).
 *
 * Falls back to the nationwide aggregate (`nationwideSliceFor`, the W24
 * shape) only when NOT ONE state produces a valid slice — i.e. the world's
 * states carry no demographic tables at all (defensive; mirrors this
 * adapter's own stub-fallback pattern for non-US races). With the shipped
 * 1953 pack (48 states, all demographic-seeded) this branch is unreachable
 * in practice; it exists for future eras/content packs that ship states
 * without demographics yet.
 */
function realAccumulatePresident(world: WorldState, rng: WorldRng, rec: ElectionRecord): boolean {
  const regions = Object.values(world.regions).filter((r) => r.countryId === rec.countryId);
  const stateIds = regions.map((r) => r.id).sort((a, b) => a.localeCompare(b));

  const slices = new Map<string, StateSlice>();
  for (const stateId of stateIds) {
    // Thread the election id so canvass/GOTV turnout modifiers recorded
    // against this race's campaigns shape the per-state pools, exactly as
    // the down-ballot path already does. Reference:
    // AHDGame presidentialElectionEngine.ts resolves per-state turnout
    // "with GOTV/canvassing/suppression modifiers applied".
    const slice = stateSliceFor(world, stateId, rec.id, true);
    if (slice) slices.set(stateId, slice);
  }

  if (slices.size === 0) {
    const nw = nationwideSliceFor(world, rec.countryId, rec.id);
    if (!nw) return false;
    return runAccumulate(world, rng, rec, nw);
  }

  const stateTallyStates = { ...(rec.stateTallyStates ?? {}) };
  const nationalTotals: Record<string, number> = {};
  let ranAny = false;

  const isGeneral = world.meta.turn > rec.primaryEndTurn;
  const electoralUnits = isGeneral ? electoralVoteUnitsForWorld(world, rec.countryId) : [];
  const districtUnitsByState = new Map<string, Array<{ unitId: string; stateId: string; ev: number }>>();
  for (const unit of electoralUnits) {
    if (unit.unitId === unit.stateId || !unit.unitId.startsWith(`${unit.stateId}_CD`)) continue;
    const stateUnits = districtUnitsByState.get(unit.stateId) ?? [];
    stateUnits.push(unit);
    districtUnitsByState.set(unit.stateId, stateUnits);
  }

  for (const [stateId, slice] of slices) {
    const districtUnits = districtUnitsByState.get(stateId) ?? [];
    const hasSavedDistrictTallies = districtUnits.some((unit) => stateTallyStates[unit.unitId] !== undefined);
    const hasLegacyStateTally = stateTallyStates[stateId] !== undefined && !hasSavedDistrictTallies;
    // Existing saves that entered a split era with only one statewide tally
    // retain that historical WTA record through the current race. Fresh races
    // and races already carrying unit keys accumulate the source district
    // ballot records from this turn forward.
    if (districtUnits.length > 0 && !hasLegacyStateTally) {
      const districtResults: TallyInput[] = [];
      const share = 1 / districtUnits.length;
      for (const unit of districtUnits) {
        const unitSlice = scaledElectoralDistrictSlice(slice, unit.unitId, share);
        const result = runAccumulateCore(
          world,
          rng,
          rec,
          unitSlice,
          stateTallyStates[unit.unitId],
          stateId,
        );
        if (!result) continue;
        ranAny = true;
        const tallyState = result.tallyState as TallyInput;
        districtResults.push(tallyState);
        stateTallyStates[unit.unitId] = result.tallyState;
        for (const [candId, votes] of Object.entries(result.totals)) {
          nationalTotals[candId] = (nationalTotals[candId] ?? 0) + votes;
        }
      }
      if (districtResults.length > 0) {
        stateTallyStates[stateId] = combinedDistrictTallyState(stateId, districtResults);
      }
      continue;
    }
    const result = runAccumulateCore(world, rng, rec, slice, stateTallyStates[stateId]);
    if (!result) continue;
    ranAny = true;
    stateTallyStates[stateId] = result.tallyState;
    for (const [candId, votes] of Object.entries(result.totals)) {
      nationalTotals[candId] = (nationalTotals[candId] ?? 0) + votes;
    }
  }

  if (!ranAny) return false;
  rec.stateTallyStates = stateTallyStates as Record<string, unknown>;
  rec.tally = nationalTotals;
  return true;
}

/** Returns true when the real tally ran; false = caller falls back to the stub. */
export function realAccumulate(world: WorldState, rng: WorldRng, rec: ElectionRecord): boolean {
  if (rec.electionType === "president") {
    return realAccumulatePresident(world, rng, rec);
  }
  const slice = rec.state ? stateSliceFor(world, rec.state, rec.id) : null;
  if (!slice) return false;
  return runAccumulate(world, rng, rec, slice);
}
