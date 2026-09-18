export { advanceTurn } from "./engine.js";
export type { AdvanceTurnOptions } from "./engine.js";
export { createWorld, listEras, listPlayableCountries, listParties, listRegions, listCreationParties, listCountries, rulingPartyIdForCountry, rulingPartyForCountry, headOfStateOfficeForCountry, SCHEMA_VERSION } from "./world.js";
export { electorateLeanForGroups, listCreationHomeRegions } from "./demographics/homeRegionContext.js";
export type { HomeRegionContext, HomeRegionElectorateLean } from "./demographics/homeRegionContext.js";
export type { NewWorldOptions, EraInfo, PlayableCountryInfo, WorldOverrides, CountryEconomyOverride } from "./world.js";
export { applyCheat } from "./cheats.js";
export type { CheatOp, PartyNumericField, PlayerNumericField, PoliticianNumericField } from "./cheats.js";
export {
  DEFAULT_WORLD_FEATURE_FLAGS,
  WORLD_FEATURE_FLAG_DEFINITIONS,
  featureFlagForPhase,
  isTurnPhaseEnabled,
  isWorldFeatureFlag,
  resolveWorldFeatureFlags,
} from "./featureFlags.js";
export type { WorldFeatureFlag, WorldFeatureFlags } from "./featureFlags.js";
export {
  DEFAULT_SINGLEPLAYER_DIFFICULTY,
  NPP_ACTION_CAP,
  NPP_ACTIONS_PER_TURN,
  SINGLEPLAYER_DIFFICULTIES,
  isSingleplayerDifficulty,
  resolveSingleplayerDifficulty,
  singleplayerNppTuning,
} from "./singleplayerDifficulty.js";
export type { SingleplayerDifficulty, SingleplayerNppTuning } from "./singleplayerDifficulty.js";
export {
  DEFAULT_SINGLEPLAYER_MODE,
  SINGLEPLAYER_MODES,
  isSingleplayerMode,
  isWorldsimMode,
  resolveSingleplayerMode,
} from "./singleplayerMode.js";
export type { SingleplayerMode } from "./singleplayerMode.js";
export {
  DEFAULT_NPP_AUTONOMY_LEVEL,
  NPP_AUTONOMY_LEVEL_RANK,
  NPP_AUTONOMY_LEVELS,
  effectiveNppAutonomyLevelForCountry,
  isNppAutonomyLevel,
  nppAutonomyAtLeastForCountry,
  nppAutonomyLevelAtLeast,
  resolveNppAutonomyLevel,
} from "./nppAutonomyLevel.js";
export type { NppAutonomyLevel } from "./nppAutonomyLevel.js";
export { serializeSave, deserializeSave, projectSaveToV42 } from "./save.js";
export type { SaveFile, ProjectSaveToV42Result } from "./save.js";
export { rngFromSeed, rngFromState } from "./rng.js";
export type { WorldRng, RngState } from "./rng.js";
export { dateForTurn, eraForDate, nextEraForDate, addDaysIso, START_DATE, DAYS_PER_TURN } from "./calendar.js";
export type { TurnPhase, TurnReport, PhaseTiming } from "./phases/types.js";
export * from "./differential/trace.js";
export * from "./npp/nameGenerator.js";
export * from "./npp/nameEra.js";
export * from "./politician.js";
export * from "./support/index.js";
export * from "./actions/catalog.js";
export * from "./actions/execute.js";
export * from "./actions/fundGeneration.js";
// #242: one stat-scaled fund-cost source shared by executeAction and the quote.
export { actionFundCost } from "./actions/fundCost.js";
export type { FundCostInput } from "./actions/fundCost.js";
export { CAMPAIGN_TARGETED_AD_CAP } from "./actions/campaignTargetedAd.js";
export * from "./actions/polling.js";
export { getCatalog, getLaw } from "./legislation/catalog.js";
export type { Bill, Committee, EnactedLaw } from "./legislation/types.js";
export * from "./membership.js";
export * from "./caucus.js";
// #61: party/caucus action charge + consequence projection. executeAction
// charges from `partyCaucusCharge` and the party/caucus display adapters quote
// the same function, so a displayed cost cannot disagree with the debit.
export {
  PARTY_CAUCUS_ACTION_IDS,
  isPartyCaucusActionId,
  partyCaucusCharge,
  partyCaucusEffect,
  quotePartyCaucusAction,
  partySwitchCooldownRemaining,
} from "./actions/partyCaucus.js";
export type {
  PartyCaucusActionId,
  PartyCaucusActorStats,
  PartyCaucusCharge,
  PartyCaucusEffect,
  PartyCaucusQuote,
} from "./actions/partyCaucus.js";
export * from "./endorsement.js";
export type * from "./types.js";
export * as electionEngine from "./electionEngine/index.js";
export { declareCandidacy, withdrawCandidacy } from "./elections/candidacy.js";
export { electionSeriesForWorld, recomputeComposition, seatHolders } from "./elections/orchestration.js";
export { resolvePrimaries, requiresPrimaryResolution } from "./elections/primaryResolution.js";
export { isFoundingActive, detectFoundingComplete, runFoundingSweep, stampFoundingMarker, MAX_FOUNDING_RACES } from "./elections/founding.js";
export type { ElectionRecord, ElectionCandidate, ElectionStatus, PrimaryResults, PrimaryResultEntry } from "./elections/types.js";
// W24b real Electoral College (#69): the read-only display adapter shares the
// SAME per-state winner-take-all allocation, live EV apportionment, and
// majority threshold the resolution phase seats presidents with, so a rendered
// electoral count can never disagree with `applyPresidentialResolution`.
export {
  allocateElectoralVotes,
  electoralVotesByState,
  electoralMajorityFor,
} from "./elections/presidentialElectoralCollege.js";
export type { ElectoralCollegeResult } from "./elections/presidentialElectoralCollege.js";
export * from "./cabinet/types.js";
export * from "./cabinet/constants.js";
export * from "./cabinet/nominationLifecycle.js";
export * from "./cabinet/transition.js";
export * from "./corporation/corporateSectorAssets.js";
export * from "./corporation/corporateSectorSale.js";
export * from "./corporation/corporateSectorAcquire.js";
// Issue #326: atomic interbank lending and servicing. Types travel through
// `export type * from "./types.js"` (WorldState.interbankLoans); these are
// the commands, quote, and turn servicing the banking phases share with the
// session seam so a displayed quote can never disagree with the debit.
export {
  INTERBANK_MAX_SHARE_OF_LENDABLE,
  interbankHeadroom,
  interbankInterestDue,
  lenderInterbankOutstanding,
  lendInterbank,
  quoteInterbankMax,
  repayInterbank,
  serviceInterbankLoans,
  sumInterbankDefaultsLastTurn,
  writeOffLenderSideInterbankOnFailure,
} from "./banking/interbank.js";
export type { InterbankLoan, InterbankQuote, InterbankResult, InterbankServiceSummary } from "./banking/interbank.js";
export * from "./ministerialOrders/catalog.js";
export * from "./ministerialOrders/issue.js";
export * from "./ministerialOrders/lifecycle.js";
export * from "./cabinet/ministerialActionPool.js";
export { runMinisterialOrders } from "./ministerialOrders/phases.js";
// Issue #119: FOMC committee + nomination lifecycle. Types come through
// `export type * from "./types.js"`; these are the pure rules, the meeting
// lifecycle, and the executive nomination/ballot entry points, all shared with
// the engine phases so a display adapter can never disagree with the engine.
export * from "./centralBank/fomc.js";
export {
  FOMC_BOARD_SIZE,
  FOMC_COMMITTEE_COUNTRY_IDS,
  FOMC_TERM_TURNS,
  FOMC_MEETING_INTERVAL_TURNS,
  FOMC_VOTE_WINDOW_TURNS,
  FOMC_VACANCY_REMINDER_INTERVAL_TURNS,
  RATE_CHANGES_PER_TERM,
} from "./centralBank/constants.js";
export {
  createFomcBoard,
  seedFomcBoard,
  processFomcMeetings,
  castFomcBallot,
  committeeRateExecutionRefusal,
  resolveMeetingInto,
} from "./centralBank/fomcMeeting.js";
export type { CastFomcBallotResult, ResolveMeetingOutcome } from "./centralBank/fomcMeeting.js";
export {
  proposeFomcNomination,
  processFomcNominationLifecycle,
} from "./centralBank/fomcNominationLifecycle.js";
export type {
  ProposeFomcNominationOptions,
  FomcNominationLifecycleResult,
} from "./centralBank/fomcNominationLifecycle.js";
export type {
  FomcVote,
  FomcOccupantType,
  FomcSeat,
  FomcBallot,
  FomcMeeting,
  FomcMeetingStatus,
  FomcNomination,
  FomcNominationStatus,
} from "./centralBank/types.js";
export * from "./judiciary/types.js";
export * from "./judiciary/divergence.js";
export * from "./judiciary/scotusTurn.js";
export * from "./judiciary/scotusSponsorship.js";
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
// #242 character-creation stats/wealth/alignment. Pure rules shared by the
// engine gate and the creation/profile display adapters (SSOT).
export {
  STAT_KEYS,
  STAT_MIN,
  STAT_MAX,
  STAT_POINT_BUDGET,
  STAT_FREE_POINTS,
  EFFICACY_PIVOT,
  NEUTRAL_STAT,
  clampStat,
  defaultStatBuild,
  statMultiplier,
  statBonus,
  validateStatAllocation,
} from "./stats/characterStats.js";
export type { StatKey, CharacterStats, StatAllocationResult } from "./stats/characterStats.js";
export {
  WEALTH_BONUS,
  WEALTH_LEVELS,
  getWealthBonus,
  convertStartingAnchorToLocal,
  startingCashFor,
} from "./stats/characterWealth.js";
export type { WealthLevel } from "./stats/characterWealth.js";
export {
  POLICY_INTEGER_AXIS_RANGE,
  MAX_COMPASS_DISTANCE,
  compassDistance,
  alignmentBand,
  ALIGNMENT_META,
  ideologyLabel,
  nearestParty,
} from "./alignment/policyAlignment.js";
export type { CompassPoint, AlignmentBand, NearestParty } from "./alignment/policyAlignment.js";
export {
  isOnePartyCountry,
  isImperialEligibleCountry,
  onePartyCountries,
  imperialEligibleCountries,
} from "./creationCountryRules.js";
export {
  IMPERIAL_STARTING_CAPITAL,
  getImperialRole,
  getImperialTitle,
  resolveProfileDestination,
} from "./imperialRole.js";
export type { ImperialGender, ImperialRole, ImperialTitles, ProfileDestination, ProfileGateInput } from "./imperialRole.js";
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
export { campaignKey, ensureCampaign } from "./campaigns/lifecycle.js";
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
// #67 campaign blend: the display layer derives each operations lever's CURRENT
// standing effect from the same OPS_TREES magnitudes the engine consumes (SSOT).
export { opsChannelTotals, describeOpsCurrentEffect } from "./campaigns/opsCurrentEffect.js";
export type { OpsTreeState, OpsChannelTotals } from "./campaigns/opsCurrentEffect.js";

// Authoritative player action refresh projection (#31), shared by the
// actionRefresh phase and the Profile/footer resource breakdowns.
export { projectPlayerActionRefresh, resolvePlayerSeat } from "./actions/officeBonus.js";
export type { PlayerActionProjection, PlayerSeat } from "./actions/officeBonus.js";

// #49: the national-influence per-turn gain is projected from the exact function
// the actionRefresh phase applies, so the Profile never quotes a different rate.
export { playerNationalInfluenceGain } from "./actions/playerInfluence.js";

// #49: favorability tier table + natural-decay helpers (reference
// shared/constants/formulas.ts and src/lib/actions.ts getAdvertiseActionCost),
// shared by the advertise cost gate and the Profile/footer breakdowns.
export {
  FAVORABILITY_NATURAL_DECAY_THRESHOLD,
  FAVORABILITY_TIERS,
  favorabilityTierFor,
  calculateFavorabilityAboveThresholdPenalty,
  advertiseActionCost,
} from "./actions/favorability.js";
export type { FavorabilityTier } from "./actions/favorability.js";

// #52: countable achievement triggers shared with achievements/evaluate.ts, so
// the Profile's `current / target` progress uses the exact grant thresholds.
export { ACHIEVEMENT_COUNT_TRIGGERS, achievementCountProgress } from "./achievements/progress.js";
export type { AchievementCountTrigger } from "./achievements/progress.js";

// Read-only membership eligibility for display adapters.
export { canJoinParty, canLeaveParty } from "./membership.js";

export type { WorldInitialization } from "./initialization/ukHistorical.js";

export { projectPlayerPartyInfluence } from "./party/playerInfluence.js";

// Party logo identity: preset-stable country:abbreviation key plus the
// authored-URL carrier (remote defaults intentionally unresolved offline).
export { partyLogoKey, resolvePartyLogoUrl } from "./party/partyLogo.js";
export type { PartyLogoIdentity } from "./party/partyLogo.js";
export { ACHIEVEMENT_CATALOG } from "./achievements/catalog.js";

// W25 referendum request seam (#70): the display adapter shares the engine's
// devolution region set and eligibility rules instead of duplicating them.
export { UK_DEVOLUTION_REGIONS } from "./devolution/independenceDesireDrift.js";
export { referendumRequestEligibility, referendumRegionStatus, REQUEST_THRESHOLD, REQUEST_AP_COST } from "./referendum/request.js";
export {
  spendReferendumCampaign,
  campaignSideForParty,
  campaignSideForPartyInRegion,
  REGION_PRO_INDY_PARTY,
  CAMPAIGN_PS_COST_PER_UNIT,
} from "./referendum/campaign.js";
export {
  GROUND_GAME_PRESETS,
  findGroundGamePreset,
  applyPresetToModifiers,
  spendReferendumGroundGame,
  GG_PERSUADE_TARGET_CONC,
  GG_MOBILIZE_TARGET_CONC,
  GG_MOBILIZE_LEAN_FRACTION,
} from "./referendum/groundGame.js";
export type { GroundGamePreset, PresetEffect } from "./referendum/groundGame.js";
export { referendumYesShare, aggregateYesShare, leanFromUnits, cumulativeCampaignEffect } from "./referendum/cohort.js";
export type { ReferendumCohort, CohortModifier } from "./referendum/cohort.js";
export type { ReferendumRecord, ReferendumKind, ReferendumStatus } from "./referendum/types.js";
export {
  CURRENT_SP_INTERCHANGE_CONTRACT,
  CURRENT_SP_LAUNCHER_METADATA_CONTRACT,
  CURRENT_SP_COLLECTION_POLICY,
  CURRENT_SP_PROVENANCE,
  parseCurrentSpSnapshot,
} from "./interchange/currentSpSnapshot.js";
export type {
  CurrentSpCollectionManifestEntry,
  CurrentSpCollectionPolicy,
  CurrentSpExcludedCollectionName,
  CurrentSpMappedCollectionName,
  CurrentSpKnownCollectionName,
  CurrentSpMappingStatus,
  CurrentSpSnapshot,
  ParsedCurrentSpSnapshot,
} from "./interchange/currentSpSnapshot.js";
export { DAILY_WIRE_CAP_ANCHOR, WIRE_QUOTA_WINDOW_TURNS } from "./finance/wireTransfer.js";
export type { WireTransferResult } from "./finance/wireTransfer.js";
