export { advanceTurn } from "./engine.js";
export type { AdvanceTurnOptions } from "./engine.js";
export { createWorld, listEras, listPlayableCountries, listParties, listRegions, listCountries, rulingPartyIdForCountry, rulingPartyForCountry, SCHEMA_VERSION } from "./world.js";
export type { NewWorldOptions, EraInfo, PlayableCountryInfo, WorldOverrides, CountryEconomyOverride } from "./world.js";
export { applyCheat } from "./cheats.js";
export type { CheatOp, PartyNumericField, PlayerNumericField, PoliticianNumericField } from "./cheats.js";
export {
  DEFAULT_WORLD_FEATURE_FLAGS,
  WORLD_FEATURE_FLAG_DEFINITIONS,
  featureFlagForPhase,
  isTurnPhaseEnabled,
  isWorldFeatureFlag,
} from "./featureFlags.js";
export type { WorldFeatureFlag, WorldFeatureFlags } from "./featureFlags.js";
export { serializeSave, deserializeSave, projectSaveToV42 } from "./save.js";
export type { SaveFile, ProjectSaveToV42Result } from "./save.js";
export { rngFromSeed, rngFromState } from "./rng.js";
export type { WorldRng, RngState } from "./rng.js";
export { dateForTurn, eraForDate, nextEraForDate, addDaysIso, START_DATE, DAYS_PER_TURN } from "./calendar.js";
export type { TurnPhase, TurnReport, PhaseTiming } from "./phases/types.js";
export * from "./npp/nameGenerator.js";
export * from "./npp/nameEra.js";
export * from "./politician.js";
export * from "./support/index.js";
export * from "./actions/catalog.js";
export * from "./actions/execute.js";
export * from "./actions/fundGeneration.js";
export { CAMPAIGN_TARGETED_AD_CAP } from "./actions/campaignTargetedAd.js";
export { getCatalog, getLaw } from "./legislation/catalog.js";
export type { Bill, Committee, EnactedLaw } from "./legislation/types.js";
export * from "./membership.js";
export * from "./caucus.js";
export * from "./endorsement.js";
export type * from "./types.js";
export * as electionEngine from "./electionEngine/index.js";
export { declareCandidacy, withdrawCandidacy } from "./elections/candidacy.js";
export { electionSeriesForWorld, recomputeComposition, seatHolders } from "./elections/orchestration.js";
export { resolvePrimaries, requiresPrimaryResolution } from "./elections/primaryResolution.js";
export type { ElectionRecord, ElectionCandidate, ElectionStatus, PrimaryResults, PrimaryResultEntry } from "./elections/types.js";
export * from "./cabinet/types.js";
export * from "./cabinet/constants.js";
export * from "./cabinet/nominationLifecycle.js";
export * from "./cabinet/transition.js";
export * from "./judiciary/types.js";
export * from "./judiciary/divergence.js";
export * from "./judiciary/scotusTurn.js";
export * from "./judiciary/ukJrSurpriseTurn.js";
export * from "./history/types.js";
export { recordWorldHistory, computePlayerBondsValue, computePlayerSharesValue } from "./history/phases.js";
export { checkInvariants } from "./history/invariants.js";
export type { InvariantReport, InvariantFinding, InvariantSeverity } from "./history/invariants.js";
// W42 QA gate: engine-side clamp bounds, exposed so the CLI's economy
// sanity bands check against the real enforced ranges (macroCountryTurn.ts,
// metrics/inflationRecalc.ts) rather than a duplicated set of magic numbers.
export {
  GROWTH_RATE_MIN,
  GROWTH_RATE_MAX,
  UNEMPLOYMENT_MIN,
  UNEMPLOYMENT_MAX,
  INFLATION_MIN,
  INFLATION_MAX,
  OUTPUT_GAP_BOUND,
} from "./economy/macroConstants.js";
export { GOVERNMENT_CHAMBER_BY_COUNTRY } from "./government/constants.js";
export { EXTRACTABLE_RESOURCES } from "./commodity/constants.js";
export type { ExtractableResource } from "./commodity/constants.js";
export * from "./countryPolitics/index.js";
export * from "./governor/constants.js";
export * from "./governor/powers.js";

// Read-only display queries use the same action refresh constants as the engine.
export { MIN_BASE_ACTIONS_PER_TURN, ACTION_HOARD_PENALTY, ENERGY_BASE_ACTION_CAP, ENERGY_BASE_HOARD_THRESHOLD } from "./actions/constants.js";
// P0 campaign management (#67): display + purchase previews share the exact
// upgrade table with the engine gate (SSOT, mirroring mainline's UI/gate sharing).
export {
  GENERAL_PHASE_UPGRADE_MULTIPLIER, OPS_TREES, getCampaignFamilyScalar, getEffectiveBranchCost,
  getOpsBranch, getOpsBranchMagnitude, getTreeMaintenanceCost,
} from "./campaigns/upgradeCosts.js";
export type { OpsBranchKey, UpgradeCategory } from "./campaigns/upgradeCosts.js";
export { campaignAnchorToLocal, campaignLocalRate } from "./campaigns/campaignCurrency.js";
export { calculateCampaignIncome } from "./campaigns/income.js";
export { calculateMaintenanceCosts } from "./campaigns/maintenance.js";
export { campaignKey } from "./campaigns/lifecycle.js";
// #68 campaign strength: the display layer shares the exact contribution
// cost/action formulas and the vote-boost curve with the engine (SSOT).
export {
  CAMPAIGN_STRENGTH_MAX_BONUS,
  CAMPAIGN_STRENGTH_TAU,
  CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER,
  CAMPAIGN_STRENGTH_LEADER_PULLBACK_MAX_PER_TURN,
  CAMPAIGN_STRENGTH_PRICE_PER_POINT,
  CAMPAIGN_STRENGTH_POINTS_PER_ACTION,
  CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS,
  CAMPAIGN_STRENGTH_BATCH_STEPS,
  campaignStrengthContributionCost,
  campaignStrengthContributionActions,
  campaignStrengthVoteMultiplier,
  campaignStrengthBoostPercent,
  calculateCampaignStrengthLeaderPullbacks,
  campaignStrengthBatchQuote,
  maxAffordableCampaignStrengthClicks,
} from "./campaigns/campaignStrength.js";
export type {
  CampaignStrengthPullbackCandidate,
  CampaignStrengthBatchQuote,
} from "./campaigns/campaignStrength.js";

// Authoritative player action refresh projection (#31), shared by the
// actionRefresh phase and the Profile/footer resource breakdowns.
export { projectPlayerActionRefresh, resolvePlayerSeat } from "./actions/officeBonus.js";
export type { PlayerActionProjection, PlayerSeat } from "./actions/officeBonus.js";

// Read-only membership eligibility for display adapters.
export { canJoinParty, canLeaveParty } from "./membership.js";

export type { WorldInitialization } from "./initialization/ukHistorical.js";

export { projectPlayerPartyInfluence } from "./party/playerInfluence.js";
export { ACHIEVEMENT_CATALOG } from "./achievements/catalog.js";

// W25 referendum request seam (#70): the display adapter shares the engine's
// devolution region set and eligibility rules instead of duplicating them.
export { UK_DEVOLUTION_REGIONS } from "./devolution/independenceDesireDrift.js";
export { referendumRequestEligibility, referendumRegionStatus, REQUEST_THRESHOLD, REQUEST_AP_COST } from "./referendum/request.js";
export type { ReferendumRecord, ReferendumKind, ReferendumStatus } from "./referendum/types.js";
