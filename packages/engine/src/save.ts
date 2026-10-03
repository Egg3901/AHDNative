import { validateCanvassState } from "./actions/canvass.js";
import { EXTERNAL_BROAD_MONEY_GDP_SHARE, SCHEMA_VERSION } from "./world.js";
import { COUNTRY_CONFIGS } from "./electionEngine/countryElectionConstants.js";
import { GOVERNMENT_CHAMBER_BY_COUNTRY } from "./government/constants.js";
import { pmAppointmentExecutiveTitle } from "./government/pmAppointment.js";
import { getPackByEra } from "@ahdclient/content";
import { STAT_KEYS } from "./stats/characterStats.js";
import { isWorldFeatureFlag, resolveWorldFeatureFlags, WORLD_FEATURE_FLAG_DEFINITIONS } from "./featureFlags.js";
import { DEFAULT_SINGLEPLAYER_DIFFICULTY, isSingleplayerDifficulty } from "./singleplayerDifficulty.js";
import { isSingleplayerMode } from "./singleplayerMode.js";
import { DEFAULT_NPP_AUTONOMY_LEVEL, isNppAutonomyLevel } from "./nppAutonomyLevel.js";
import { TENSION_BASELINE } from "./coldWar/constants.js";
import { NUCLEAR_CAPABLE } from "./coldWar/nuclear.js";
import { normalizeShares } from "./alignment/alignment.js";
import { validateAlignmentRecords } from "./alignment/recordValidation.js";
import { seedInternationalOrgs } from "./internationalOrgs/seed.js";
import { assignUsSeatGeography } from "./elections/seatGeography.js";
import { PRIMARY_WAVES } from "./elections/data/usPrimaryCalendar.js";
import { CENTRAL_BANK_COUNTRY_ANCHORS, CHAIR_TERM_TURNS } from "./centralBank/constants.js";
import { seedCorporations, tickerForSector, SOURCE_NPP_HEADQUARTERS_REGION, corporationIdentity } from "./corporation/founding.js";
import { rngFromSeed } from "./rng.js";
import { isPlayerImageUrl, MAX_PLAYER_AVATAR_BYTES, MAX_PLAYER_HEADER_BYTES } from "./playerImages.js";
import type { WorldState } from "./types.js";
import { CORPORATION_TYPES, type CorporationType, type ShareholderEntry } from "./corporation/types.js";
import { CURRENCY_CODE_BY_COUNTRY } from "./forex/constants.js";
import { CEO_INITIAL_SHARES, NPC_FOUNDER_SHARE_FRACTION, DEFAULT_SHARE_PRICE } from "./market/constants.js";
import { seedUnions } from "./unions/founding.js";
import {
  MARKETIZATION_SCHEDULE,
  scheduledMarketizationLevel,
  NPP_DEFAULT_BUDGET_SOFTNESS,
  NPP_DEFAULT_INTERNAL_REPRESSION,
  NPP_DEFAULT_REFORMISM,
} from "./commandEconomy/constants.js";
import { seedCapitalStock } from "./economy/capitalStock.js";
import { seedStateResourceCapacities } from "./extraction/founding.js";
import { seedCountryPolitics } from "./countryPolitics/overview.js";
import {
  backfillSectorOwner,
  backfillSectorWorkforce,
  backfillSectorPlantCapital,
  calculateSectorWorkers,
  initialRepresentingUnionId,
  validateCorporateSectorAssets,
} from "./corporation/corporateSectorAssets.js";
import { validatePlantMarketDemand } from "./corporation/plantDemand.js";
import { validateUnionOrganizers } from "./unions/organizers.js";
import { validateUnionContributionLedger } from "./unions/contributions.js";
import { makeSeedSoeState } from "./commandEconomy/soe.js";
import { validateCorporateBondSettlementLedger } from "./bonds/corporateBondDefaultSettlement.js";
import { validatePlayerLineOfCredit, validatePlayerLineOfCreditWallet } from "./finance/playerLineOfCredit.js";
import { validateNationalSavingsPools } from "./finance/playerSavingsInterest.js";
import type { BankCharter } from "./banking/types.js";
import { validateBankingState } from "./banking/validate.js";
import { validatePoliticalState } from "./politicalMetrics/validate.js";
import { validateNationalizationEligibilityState } from "./corporation/nationalizationEligibility.js";
import { validateNationalCorporations } from "./corporation/nationalCorporation.js";
import { validateStateOwnershipLedger } from "./corporation/stateOwnershipLedger.js";
import { validatePendingNationalizations } from "./corporation/pendingNationalizations.js";
import { validateCorporateCashLedger } from "./corporation/corporateCashLedger.js";
import { countPrStv, validateRankedBallots } from "./elections/prStv.js";
import { validateNppStrategyState } from "./corporation/nppCorpStrategy.js";
import { validateCorporateRelocationVote } from "./corporation/relocationVotes.js";
import { charterTypeOf, sumPositionMarks } from "./banking/propTrading.js";
import { isValidContributionRate, validatePensionLedger, validatePensionSchemes } from "./unions/pension.js";
import {
  validateBargainingCampaigns,
  validateCollectiveAgreements,
} from "./unions/campaigns.js";
import { validateTargetedAds } from "./campaigns/targetedAds.js";

/**
 * Save file = versioned JSON envelope around the full WorldState. Older
 * schema versions migrate forward at load; loading a newer version than the
 * engine understands is an error, never a silent best-effort.
 */
export interface SaveFile {
  format: "ahdsolo-save";
  schemaVersion: number;
  savedAt: string;
  world: WorldState;
}

export function serializeSave(world: WorldState, savedAt: string): string {
  const save: SaveFile = {
    format: "ahdsolo-save",
    schemaVersion: world.meta.schemaVersion,
    savedAt,
    world,
  };
  return JSON.stringify(save);
}

const V42_SCHEMA = 42;

/** Reference demographic option sets (creatorOptions.ts / characterWealth.ts). */
const DEMOGRAPHIC_RACE_VALUES = new Set(["white", "black", "hispanic", "asian", "other"]);
const DEMOGRAPHIC_GENDER_VALUES = new Set(["male", "female", "nonbinary"]);
const DEMOGRAPHIC_EDUCATION_VALUES = new Set(["no_college", "college", "graduate"]);
const DEMOGRAPHIC_WEALTH_VALUES = new Set(["low", "middle", "high"]);

/** A complete, legal demographics record. All four fields required together. */
function isValidDemographics(value: Record<string, unknown>): boolean {
  return (
    typeof value["race"] === "string" && DEMOGRAPHIC_RACE_VALUES.has(value["race"] as string) &&
    typeof value["gender"] === "string" && DEMOGRAPHIC_GENDER_VALUES.has(value["gender"] as string) &&
    typeof value["education"] === "string" && DEMOGRAPHIC_EDUCATION_VALUES.has(value["education"] as string) &&
    typeof value["wealth"] === "string" && DEMOGRAPHIC_WEALTH_VALUES.has(value["wealth"] as string)
  );
}

export type ProjectSaveToV42Result =
  | { ok: true; contents: string }
  | { ok: false; error: string };

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ownEnumerableValue(value: object, key: string): unknown {
  const desc = Object.getOwnPropertyDescriptor(value, key);
  return desc === undefined ? undefined : desc.value;
}

/**
 * Exact structural equality for save envelopes. Array order is preserved.
 * Record key order is ignored. Enumerable own keys are compared, including
 * "__proto__", by reading descriptors so assignment cannot poison a clone.
 * Primitives use ===. No numeric tolerance.
 */
function structurallyEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (!structurallyEqual(left[i], right[i])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  const rightKeySet = new Set(rightKeys);
  for (const key of leftKeys) {
    if (!rightKeySet.has(key)) return false;
    if (!structurallyEqual(ownEnumerableValue(left, key), ownEnumerableValue(right, key))) return false;
  }
  return true;
}

/**
 * Project a public serializeSave envelope to schema 42.
 *
 * countryPolitics is dropped only when Native deserializeSave of the
 * stripped document re-seeds the same gauges and history. A string
 * player.homeRegionId is kept as an opaque extra: the historical v42
 * reader does not interpret it and preserves it through load, turn, and
 * serializeSave. Progressed countryPolitics is refused; the old engine
 * does not run that phase, so easing and approval history cannot be
 * reconstructed from schema 42 fields.
 *
 * v46 market pressure fields are dropped only while neutral and empty. A
 * current save with an executed-trade window, non-neutral multiplier, or
 * price history is refused because schema 42 has no representation for that
 * state.
 */
export function projectSaveToV42(contents: string): ProjectSaveToV42Result {
  if (typeof contents !== "string" || contents.length === 0) {
    return { ok: false, error: "Not a valid save file: empty document" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { ok: false, error: "Not a valid save file: unparseable JSON" };
  }
  if (!isRecord(parsed) || parsed["format"] !== "ahdsolo-save") {
    return { ok: false, error: "Not a valid save file: wrong format marker" };
  }
  if (!isRecord(parsed["world"]) || !isRecord(parsed["world"]["meta"]) || !isRecord(parsed["world"]["player"])) {
    return { ok: false, error: "Not a valid save file: invalid world state" };
  }
  const save = parsed;
  const world = parsed["world"];
  // Schema 42 has no writer for Native's manual-trade lookback. Those rows
  // affect later player fees and currency-rate pressure, so preserving them
  // as unknown JSON is not enough to continue this world. The empty array is
  // the reconstructable no-trade default and remains exportable.
  const forexTradeHistory = world["forexTradeHistory"];
  if (Array.isArray(forexTradeHistory) && forexTradeHistory.length > 0) {
    return { ok: false, error: `Manual currency trade history cannot be continued by the schema 42 turn reader. Keep this Native save as schema ${SCHEMA_VERSION}` };
  }
  // These snapshots are derived solely from the recorded manual lookback.
  // Neutral zero snapshots are equivalent to the absent pre-feature state;
  // active or malformed snapshots must remain on the current schema.
  const forexRates = world["exchangeRates"];
  if (isRecord(forexRates)) for (const [countryId, row] of Object.entries(forexRates)) {
    if (!isRecord(row)) continue;
    for (const field of ["buyVolume24", "sellVolume24"] as const) {
      const volume = row[field];
      if (volume === undefined) continue;
      if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0) {
        return { ok: false, error: `Exchange-rate ${countryId} has an invalid ${field} snapshot; keep this Native save as schema ${SCHEMA_VERSION}` };
      }
      if (volume !== 0) {
        return { ok: false, error: `Active currency-volume pressure cannot be continued by the schema 42 turn reader. Keep this Native save as schema ${SCHEMA_VERSION}` };
      }
    }
  }
  const standingAds = isRecord(world["player"]) ? world["player"]["targetedAds"] : undefined;
  if (Array.isArray(standingAds) && standingAds.length > 0) {
    return { ok: false, error: "Standing targeted-ad exposure cannot be continued by the schema 42 turn reader; keep this Native save." };
  }
  if (isRecord(world["meta"]) && hasOwn(world["meta"], "startingYear")) {
    return { ok: false, error: "The source 48-turn election clock cannot be continued by the schema 42 turn reader; keep this Native save." };
  }
  if (hasOwn(world, "pendingNationalizations")) {
    return { ok: false, error: "Pending nationalization notices cannot be continued by the schema 42 turn reader; keep this Native save." };
  }
  const weightedPlayer = world["player"];
  const weightedSeat = isRecord(weightedPlayer) ? weightedPlayer["legislativeSeat"] : undefined;
  const weightedOfficials = world["politicians"];
  if ((isRecord(weightedSeat) && hasOwn(weightedSeat, "seatsHeld")) ||
    (Array.isArray(weightedOfficials) && weightedOfficials.some(official => isRecord(official) && hasOwn(official, "seatsHeld")))) {
    return { ok: false, error: "Weighted elected seats cannot be continued by the schema 42 turn reader; keep this Native save." };
  }
  const partyWhips = world["partyWhips"];
  if (Array.isArray(partyWhips) && partyWhips.some((whip) => isRecord(whip) && typeof whip["stateId"] === "string" && whip["stateId"].length > 0)) {
    return { ok: false, error: `Home-state party whip behavior cannot be projected to the schema 42 turn reader. Keep this Native save.` };
  }
  // The pinned v42 turn reader has no corporate issuer servicing, buyback or
  // settlement path. Keeping an issuer row as an opaque extension would retain
  // bytes but freeze coupons/default/maturity consequences in that reader.
  // Refuse the projection while any corporate bond exists rather than imply
  // behavioral interchange from unknown-field preservation alone.
  const bondRows = world["bonds"];
  if (isRecord(bondRows) && Object.values(bondRows).some((row) => isRecord(row) && row["issuerType"] === "corporation")) {
    return { ok: false, error: "Corporate bond lifecycle state cannot be projected to the schema 42 turn reader; keep this Native save." };
  }
  const poolRows = world["bondMarketPools"];
  if (isRecord(poolRows) && Object.keys(poolRows).length > 0) {
    return { ok: false, error: "Bond market pool cash cannot be projected to the schema 42 turn reader; keep this Native save." };
  }
  const ownershipMetadata = world["corporations"];
  if (isRecord(ownershipMetadata) && Object.values(ownershipMetadata).some(corp => isRecord(corp) &&
    ["nationalizationOwnerKind", "financialDistressSinceTurn", "ceoVacantSinceTurn", "privatizedAtTurn"].some(key => hasOwn(corp, key)))) {
    return { ok: false, error: "Nationalization origin and grace clocks cannot be continued by schema 42. Keep this Native save." };
  }

  const budgets = world["budgets"];
  if (isRecord(budgets)) for (const [countryId, row] of Object.entries(budgets)) {
    if (!isRecord(row)) continue;
    if (row["unionsBanned"] === true || (typeof row["unionLawBias"] === "number" && row["unionLawBias"] !== 0)) {
      return { ok: false, error: `Budget ${countryId} union-law state cannot be continued by the schema 42 turn reader; keep this Native save.` };
    }
    const rates = row["taxRates"];
    const phaseIn = row["taxRatePhaseIn"];
    if (
      (isRecord(rates) && typeof rates["solidaritySurcharge"] === "number" && rates["solidaritySurcharge"] !== 0) ||
      (isRecord(phaseIn) && Object.hasOwn(phaseIn, "solidaritySurcharge"))
    ) {
      return { ok: false, error: `Budget ${countryId} solidarity surcharge state cannot be projected to the schema 42 turn reader; keep this Native save.` };
    }

  }
  const meta = world["meta"] as Record<string, unknown>;
  const player = world["player"] as Record<string, unknown>;
  const turnoutRows = world["regionTurnouts"];
  if (isRecord(turnoutRows)) for (const [regionId, row] of Object.entries(turnoutRows)) {
    if (isRecord(row) && hasOwn(row, "campaignModifiers")) return { ok: false, error: `regionTurnouts.${regionId}.campaignModifiers cannot be projected to schema 42. Keep this Native save.` };
  }
  const envelopeSchema = save["schemaVersion"];
  const metaSchema = meta["schemaVersion"];

  if (envelopeSchema === V42_SCHEMA && metaSchema === V42_SCHEMA) {
    if (hasOwn(world, "stateOwnershipLedger")) {
      return { ok: false, error: "State ownership history cannot be continued by schema 42. Keep this Native save." };
    }
    if (["regionalPoliticalMetrics", "politicalCabinetContributions"].some(key =>
      isRecord(world[key]) && Object.keys(world[key]).length > 0)) {
      return { ok: false, error: "Political board and cabinet driver state cannot be continued by schema 42. Keep this Native save." };
    }
    if (hasOwn(world, "countryPolitics")) {
      return {
        ok: false,
        error:
          "This schema 42 document still carries countryPolitics; it is not an authentic schema 42 save",
      };
    }
    const authenticCorporations = world["corporations"];
    if (isRecord(authenticCorporations) && Object.values(authenticCorporations).some(corp =>
      isRecord(corp) && (hasOwn(corp, "soe") || hasOwn(corp, "legacySoeProjection")))) {
      return { ok: false, error: "This schema 42 document carries SOE production; it is not an authentic schema 42 save" };
    }
    const authenticCommandStates = world["commandEconomy"];
    if (isRecord(authenticCommandStates) && Object.values(authenticCommandStates).some(state =>
      isRecord(state) && ["pendingDirectives", "sectorCredit", "directedCreditBySector"].some(key => hasOwn(state, key)))) {
      return { ok: false, error: "This schema 42 document carries Gosbank directive state; it is not an authentic schema 42 save" };
    }
    const authenticSubsidies = world["subsidies"];
    if (Array.isArray(authenticSubsidies) && authenticSubsidies.length > 0) {
      return { ok: false, error: "This schema 42 document still carries subsidies; it is not an authentic schema 42 save" };
    }
    if (hasOwn(player, "homeRegionId") && typeof player["homeRegionId"] !== "string") {
      return {
        ok: false,
        error:
          "This schema 42 document still carries v43 homeRegionId; it is not an authentic schema 42 save",
      };
    }
    if (hasOwn(world, "difficulty")) {
      return {
        ok: false,
        error:
          "This schema 42 document still carries the difficulty axis; it is not an authentic schema 42 save",
      };
    }
    // Issue #346: schema 42 knows career/hos (player.mode since v12) but no
    // worldsim spectator mode. A 42-labeled document carrying worldsim is
    // not an authentic schema 42 save.
    if (player["mode"] === "worldsim") {
      return {
        ok: false,
        error:
          "This schema 42 document carries a worldsim play mode; it is not an authentic schema 42 save",
      };
    }
    if (hasOwn(world, "nppAutonomyLevel")) {
      return {
        ok: false,
        error:
          "This schema 42 document still carries the autonomy axis; it is not an authentic schema 42 save",
      };
    }
    try {
      deserializeSave(contents);
    } catch (error) {
      return { ok: false, error: `Schema 42 save is not loadable: ${errorMessage(error)}` };
    }
    return { ok: true, contents };
  }

  if (envelopeSchema !== SCHEMA_VERSION || metaSchema !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Save schema ${String(envelopeSchema)} cannot be projected to schema 42 without a Native load of a schema ${SCHEMA_VERSION} document`,
    };
  }
  const savedAt = save["savedAt"];
  if (typeof savedAt !== "string" || savedAt.length === 0) {
    return { ok: false, error: "Not a valid save file: missing savedAt" };
  }
  const homeRegionId = player["homeRegionId"];
  const featureFlags = world["featureFlags"];
  if (isRecord(featureFlags) && featureFlags["rpgStats"] === false) {
    return {
      ok: false,
      error: `RPG stats are disabled in this ruleset. Schema 42 always applies RPG stats; keep this save as schema ${SCHEMA_VERSION}`,
    };
  }
  if (world["frontierEntryExperimentEnabled"] === true) {
    return { ok: false, error: `Frontier-entry experiment state cannot be continued by schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  if (hasOwn(world, "bankingLaws") || hasOwn(world, "bankPropTradingEnabled")) {
    return { ok: false, error: `Banking policies cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  const savingsPolicy = world["savingsAccountsPolicy"];
  if (
    isRecord(savingsPolicy) &&
    savingsPolicy["mode"] === "authoritative" &&
    Array.isArray(savingsPolicy["readCurrencies"]) &&
    savingsPolicy["readCurrencies"].length > 0
  ) {
    return { ok: false, error: `Authoritative savings-holder policy cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  const centralBanks = world["centralBanks"];
  if (isRecord(centralBanks)) {
    for (const bank of Object.values(centralBanks)) {
      if (isRecord(bank) && typeof bank["nationalSavingsBalance"] === "number" && bank["nationalSavingsBalance"] > 0) {
        return { ok: false, error: `Active national savings pool state cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
      }
      if (isRecord(bank) && (hasOwn(bank, "reserveBalance") || hasOwn(bank, "netMoneyCreatedLifetime"))) {
        return { ok: false, error: `Central-bank facility accounting cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
      }
    }
  }
  if (homeRegionId !== null && homeRegionId !== undefined && typeof homeRegionId !== "string") {
    return {
      ok: false,
      error: "player.homeRegionId is not a nullable string. Schema 42 cannot store that identity",
    };
  }
  if (hasOwn(player, "lastRelocatedTurn")) {
    return { ok: false, error: `Player relocation cooldown cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  // Issue #334: schema 42 has no difficulty axis. An absent or normal
  // axis projects cleanly (dropped below; absent reloads as the identical
  // default); any other axis cannot round-trip and is refused, same class
  // as subsidies/regionalMetrics above.
  const difficulty = world["difficulty"];
  if (difficulty !== undefined && difficulty !== DEFAULT_SINGLEPLAYER_DIFFICULTY) {
    return {
      ok: false,
      error: `difficulty is ${String(difficulty)}. Schema 42 has no difficulty axis; exporting would drop it. Keep this save as schema ${SCHEMA_VERSION}`,
    };
  }
  // Issue #346: schema 42 has no worldsim spectator mode. Career/hos project
  // cleanly (mode is a v12 field the projection keeps); a spectator world
  // cannot round-trip and is refused, same class as the difficulty axis above.
  if (player["mode"] === "worldsim") {
    return {
      ok: false,
      error: `This is a worldsim spectator world. Schema 42 has no worldsim play mode; exporting would drop it. Keep this save as schema ${SCHEMA_VERSION}`,
    };
  }
  // Issue #345: schema 42 has no autonomy axis. An absent or v4 axis
  // projects cleanly (dropped below; absent reloads as the identical
  // default); any other axis cannot round-trip and is refused, same class
  // as difficulty above.
  const nppAutonomyLevel = world["nppAutonomyLevel"];
  if (nppAutonomyLevel !== undefined && nppAutonomyLevel !== DEFAULT_NPP_AUTONOMY_LEVEL) {
    return {
      ok: false,
      error: `autonomy tier is ${String(nppAutonomyLevel)}. Schema 42 has no autonomy axis; exporting would drop it. Keep this save as schema ${SCHEMA_VERSION}`,
    };
  }
  if (!hasOwn(world, "countryPolitics")) {
    return {
      ok: false,
      error: `Schema ${SCHEMA_VERSION} save is missing countryPolitics, so a reversible schema 42 projection cannot be proven`,
    };
  }
  const subsidies = world["subsidies"];
  if (Array.isArray(subsidies) && subsidies.length > 0) {
    return { ok: false, error: `Industry subsidy records cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  const pmAppointmentVotes = world["pmAppointmentVotes"];
  if (pmAppointmentVotes !== undefined && (!Array.isArray(pmAppointmentVotes) || pmAppointmentVotes.length > 0)) {
    return { ok: false, error: `PM appointment vote history cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  const regionalMetrics = world["regionalMetrics"];
  if (isRecord(regionalMetrics) && Object.keys(regionalMetrics).length > 0) {
    return { ok: false, error: `Regional metric records cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  // Issue #119 (v47): FOMC nomination records. An empty collection is dropped so
  // the projected bytes stay identical to an authentic schema 42 document; any
  // live nomination cannot round-trip through schema 42 and is refused (same
  // class as subsidies/regionalMetrics above).
  const fomcNominations = world["fomcNominations"];
  if (Array.isArray(fomcNominations) && fomcNominations.length > 0) {
    return { ok: false, error: `FOMC nomination records cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  // Issue #326 (v48): interbank loan book. An empty book is dropped so the
  // projected bytes stay identical to an authentic schema 42 document (the
  // v47 -> v48 migration backfills it empty on reload); any live loan cannot
  // round-trip through schema 42 and is refused (same class as
  // subsidies/regionalMetrics above).
  const interbankLoans = world["interbankLoans"];
  if (Array.isArray(interbankLoans) && interbankLoans.length > 0) {
    return { ok: false, error: `Interbank loan records cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  const nppInfluenceAttempts = world["nppInfluenceAttempts"];
  if (Array.isArray(nppInfluenceAttempts) && nppInfluenceAttempts.length > 0) {
    return { ok: false, error: `NPP influence attempt records cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  if (hasOwn(world, "nppInfluenceRng")) {
    return { ok: false, error: `NPP influence RNG progress cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  const nppRelationships = world["nppRelationships"];
  if (isRecord(nppRelationships)) {
    for (const rel of Object.values(nppRelationships)) {
      if (isRecord(rel) && (hasOwn(rel, "lastAttemptTurn") || hasOwn(rel, "totalAttempts") || hasOwn(rel, "successfulAttempts"))) {
        return { ok: false, error: `NPP influence relationship progress cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
      }
    }
  }
  const caucuses = world["caucuses"];
  if (Array.isArray(caucuses)) {
    for (const caucus of caucuses) {
      if (isRecord(caucus) && hasOwn(caucus, "lastNppRecruitTurn")) {
        return { ok: false, error: `Caucus NPP recruitment progress cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
      }
    }
  }
  const politicians = world["politicians"];
  if (Array.isArray(politicians)) {
    for (const politician of politicians) {
      if (isRecord(politician) && hasOwn(politician, "retiredAt") && politician["retiredAt"]) {
        return { ok: false, error: `Retired NPP records cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
      }
    }
  }
  const corporations = world["corporations"];
  if (!isRecord(corporations)) {
    return { ok: false, error: "Schema 42 projection cannot validate corporation market state" };
  }
  for (const [corpId, value] of Object.entries(corporations)) {
    if (!isRecord(value)) {
      return { ok: false, error: `Corporation ${corpId} cannot be projected to schema 42` };
    }
    if (value["isPrivate"] === true || value["relocationVote"] !== undefined) {
      return { ok: false, error: `Corporation ${corpId} has private-company or relocation-vote state that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
    }
    const liquidCurrencyCode = value["liquidCurrencyCode"];
    if (liquidCurrencyCode !== undefined) {
      const countryId = String(value["countryId"] ?? "");
      const expectedCurrency = CURRENCY_CODE_BY_COUNTRY[countryId] ??
        (isRecord(world["budgets"]) && isRecord(world["budgets"][countryId]) && typeof world["budgets"][countryId]!["currencyCode"] === "string"
          ? world["budgets"][countryId]!["currencyCode"] as string : "USD");
      if (typeof liquidCurrencyCode !== "string" || !/^[A-Z]{3}$/.test(liquidCurrencyCode) || liquidCurrencyCode !== expectedCurrency) {
        return { ok: false, error: `Corporation ${corpId} has a liquid currency that schema 42 cannot infer from its country. Keep this save as schema ${SCHEMA_VERSION}` };
      }
    }
    // Schema 42 readers preserve unknown save keys, but their corporation
    // turn has no CEO ballot, appointment, compensation, or dividend phase.
    // Only neutral default values are reversible; an active lifecycle must
    // remain on the current Native schema rather than silently stop advancing.
    const ceoVotes = value["ceoVotes"];
    const ceoAmounts = [
      "ceoSalaryPerTurn",
      "dividendRate",
      "lastCeoSalaryPaid",
      "lastDividendPoolPaid",
      "lastPlayerDividendPaid",
      "lastUnpostedDividendPaid",
    ].map((field) => value[field]);
    const hasNonzeroCeoAmount = ceoAmounts.some((amount) =>
      amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount !== 0),
    );
    if (
      (value["ceoType"] !== undefined && value["ceoType"] !== "npp") ||
      value["ceoId"] !== undefined ||
      (value["ceoVacant"] !== undefined && value["ceoVacant"] !== false) ||
      value["pendingCeoId"] !== undefined ||
      (ceoVotes !== undefined && (!Array.isArray(ceoVotes) || ceoVotes.length > 0)) ||
      hasNonzeroCeoAmount
    ) {
      return {
        ok: false,
        error: `Corporation ${corpId} has CEO governance or compensation state that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}`,
      };
    }
    for (const [field, neutral] of [
      ["sentimentMultiplier", 1],
      ["orderFlowMultiplier", 1],
      ["orderFlowWindowBuyValue", 0],
      ["orderFlowWindowSellValue", 0],
    ] as const) {
      const current = value[field];
      if (current !== undefined && (typeof current !== "number" || !Number.isFinite(current) || current !== neutral)) {
        return {
          ok: false,
          error: `Corporation ${corpId} has active market pressure state and cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}`,
        };
      }
    }
    const priceHistory = value["priceHistory"];
    if (priceHistory !== undefined && (!Array.isArray(priceHistory) || priceHistory.length > 0)) {
      return {
        ok: false,
        error: `Corporation ${corpId} has price history that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}`,
      };
    }
    // #328: bank proprietary-book state. A default retail charter with an
    // empty book and a zero mark projects cleanly (dropped below; absent
    // reloads as the identical default). Any live prop state cannot
    // round-trip through schema 42 and is refused, same class as market
    // pressure above.
    const charter = value["bankCharter"];
    if (isRecord(charter)) {
      if (["lastCbMarginTurn", "lastDiscountWindowTurn", "lastBankingIncome", "lastBankingFacilityInterest", "lastBankingIncomeTurn"].some(key => hasOwn(charter, key)) ||
        ["discountWindowDebt", "discountWindowArrears", "cbMarginDebt", "cbMarginArrears", "interbankDebt"].some(key => typeof charter[key] === "number" && (charter[key] as number) > 0)) {
        return { ok: false, error: `Corporation ${corpId} has banking facility state that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
      }
      const charterType = charter["charterType"];
      if (charterType !== undefined && charterType !== "retail") {
        return {
          ok: false,
          error: `Corporation ${corpId} has a ${String(charterType)} bank charter that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}`,
        };
      }
      const propBook = charter["propBook"];
      if (propBook !== undefined && (!Array.isArray(propBook) || propBook.length > 0)) {
        return {
          ok: false,
          error: `Corporation ${corpId} has proprietary positions that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}`,
        };
      }
      const propBookMarkValue = charter["propBookMarkValue"];
      if (propBookMarkValue !== undefined && propBookMarkValue !== 0) {
        return {
          ok: false,
          error: `Corporation ${corpId} has a proprietary mark that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}`,
        };
      }
    }
  }

  // Preserve the earlier market/governance refusal before checking R&D.
  for (const [corpId, value] of Object.entries(corporations)) {
    if (!isRecord(value)) continue;
    if (Array.isArray(value["unlockedTechNodeIds"]) || value["techDecadeLane"] !== undefined || value["techDecadeChosenTurn"] !== undefined ||
      value["marketingStrength"] !== undefined || value["logisticsStrength"] !== undefined) {
      return { ok: false, error: `Corporation ${corpId} has technology-tree state that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
    }
    const rdAmounts = ["rdBudgetPerTurn", "rdScore", "lastRdSpendPerTurn", "lastRdCapacityGain"].map((field) => value[field]);
    const hasNonzeroRdState = rdAmounts.some((amount) =>
      amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount !== 0),
    );
    if (hasNonzeroRdState) {
      return { ok: false, error: `Corporation ${corpId} has R&D state that cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
    }
  }

  // The actual v42 engine has no corporate plant-production/market phase.
  // Keeping unfamiliar JSON keys cannot continue the recorded production.
  const sectorAssets = world["corporateSectors"];
  const hasPlantCapacity = isRecord(sectorAssets) && Object.values(sectorAssets).some(asset =>
    isRecord(asset) && (
      ["capitalStock", "capacityBookAnchor", "producedUnits", "soldUnits", "soldFraction", "realizedRevenue", "soldByCommodity", "transitionFromStrategyId", "transitionStartTurn", "transitionCooldownUntilTurn", "retoolRescaleApplied", "plantsPnl", "otherOpexPerUnitAnchor", "otherOpexAnchorMarginBasis", "plantsUpkeepMarginBasisAnchor", "effectiveProfitMargin", "mothballed", "pnlLossTurns"].some(field => hasOwn(asset, field)) ||
      (hasOwn(asset, "strategyId") && asset["strategyId"] !== undefined && asset["strategyId"] !== "standard")
    ),
  );
  if (hasOwn(world, "plantMarketDemand") || hasOwn(world, "corporateTradeSnapshot") || hasPlantCapacity) {
    return { ok: false, error: `Plant production and market state cannot be continued by schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }

  const commandStates = world["commandEconomy"];
  if (isRecord(commandStates)) {
    for (const state of Object.values(commandStates)) {
      if (isRecord(state) && ["pendingDirectives", "sectorCredit", "directedCreditBySector"].some(key => hasOwn(state, key))) {
        return { ok: false, error: "Gosbank directive and allocation state cannot be continued by schema 42. Keep this Native save." };
      }
    }
  }
  // Only a reconstructable legacy seed can be removed. Fresh or progressed
  // SOE production has no consumer in the historical reader, even if it
  // preserves unfamiliar JSON fields.
  for (const [corpId, value] of Object.entries(corporations)) {
    if (!isRecord(value) || !hasOwn(value, "soe")) continue;
    const provenance = value["legacySoeProjection"];
    const sector = CORPORATION_TYPES.find(candidate => candidate === value["sectorType"]);
    if (!isRecord(provenance) || sector === undefined || typeof value["revenue"] !== "number" ||
        Object.keys(provenance).some(key => key !== "countryOwnerId" && key !== "ownershipState") ||
        !structurallyEqual(value["soe"], makeSeedSoeState(sector, value["revenue"])) ||
        value["countryOwnerId"] !== value["countryId"] || value["ownershipState"] !== "stateOwned") {
      return { ok: false, error: `Corporation ${corpId} has SOE production state that schema 42 cannot continue. Keep this Native save.` };
    }
  }
  // A v42 reader retains unfamiliar JSON but cannot advance these boards.
  // Refuse their state rather than export a frozen extension.
  if (["regionalPoliticalMetrics", "politicalCabinetContributions"].some(key =>
    isRecord(world[key]) && Object.keys(world[key]).length > 0)) {
    return { ok: false, error: "Political board and cabinet driver state cannot be continued by schema 42. Keep this Native save." };
  }
  if (hasOwn(world, "stateOwnershipLedger")) {
    return { ok: false, error: "State ownership history cannot be continued by schema 42. Keep this Native save." };
  }
  const statehood = world["statehood"];
  if (statehood !== undefined && (!isRecord(statehood) ||
      Object.keys(statehood).some((key) => key !== "startingPreset"))) {
    return { ok: false, error: "Statehood admission progress cannot be continued by schema 42. Keep this Native save." };
  }
  const candidateSave = structuredClone(save);
  const candidateWorld = candidateSave["world"] as Record<string, unknown>;
  const candidateMeta = candidateWorld["meta"] as Record<string, unknown>;
  const candidatePlayer = candidateWorld["player"] as Record<string, unknown>;
  candidateSave["schemaVersion"] = V42_SCHEMA;
  candidateMeta["schemaVersion"] = V42_SCHEMA;
  delete candidateWorld["countryPolitics"];
  delete candidateWorld["interbankLoans"];
  delete candidateWorld["subsidies"];
  // PM appointment ballots were introduced after the authentic schema-42
  // reader. An empty backfill is reconstructable; a live ballot is refused
  // above because the old reader cannot advance its deadline or tally.
  delete candidateWorld["pmAppointmentVotes"];
  // Loading a historical save restores the starting-preset guard without
  // consuming RNG. Drop only that neutral default, then require the complete
  // reload comparison below to reconstruct it. Recorded evaluation or
  // admission progress is refused above.
  delete candidateWorld["statehood"];
  delete candidateWorld["regionalMetrics"];
  delete candidateWorld["fomcNominations"];
  delete candidateWorld["nppInfluenceAttempts"];
  delete candidateWorld["nppInfluenceRng"];
  delete candidateWorld["difficulty"];
  delete candidateWorld["nppAutonomyLevel"];
  // Historical readers have no RPG switch and always apply saved stats.
  // Native restores the enabled default when loading their flag shape.
  const candidateFlags = candidateWorld["featureFlags"];
  if (isRecord(candidateFlags)) delete candidateFlags["rpgStats"];
  const candidateCorporations = candidateWorld["corporations"] as Record<string, Record<string, unknown>>;
  for (const [corpId, corp] of Object.entries(candidateCorporations)) {
    const soeProvenance = corp["legacySoeProjection"];
    if (isRecord(soeProvenance)) {
      delete corp["soe"];
      delete corp["legacySoeProjection"];
      for (const key of ["countryOwnerId", "ownershipState"] as const) {
        if (hasOwn(soeProvenance, key)) corp[key] = soeProvenance[key];
        else delete corp[key];
      }
    }
    // v49/v50 migrations may supply only canonical source identity to a
    // legacy save. Remove that provenance-marked default on downgrade so an
    // unchanged schema-42 save stays byte-identical. Current/fresh issuer
    // identity has no such marker and is carried through the old reader.
    const projectionDefaults = corp["legacyProjectionDefaults"];
    if (projectionDefaults !== undefined) {
      if (!isRecord(projectionDefaults)) {
        return { ok: false, error: `Corporation ${corpId} has invalid legacy identity provenance` };
      }
      const sector = CORPORATION_TYPES.find(candidate => candidate === corp["sectorType"]);
      if (sector === undefined) return { ok: false, error: `Corporation ${corpId} has invalid sector identity` };
      const identity = corporationIdentity(String(corp["countryId"]), sector);
      const expected: Record<string, string | undefined> = {
        name: identity.name,
        brandColor: identity.brandColor,
        headquartersRegionId: SOURCE_NPP_HEADQUARTERS_REGION[String(corp["countryId"])],
      };
      for (const [field, isDefault] of Object.entries(projectionDefaults)) {
        if (!(field in expected) || isDefault !== true || expected[field] === undefined) {
          return { ok: false, error: `Corporation ${corpId} has invalid legacy identity provenance` };
        }
        if (corp[field] !== expected[field]) {
          return {
            ok: false,
            error: `Corporation ${corpId} has changed ${field} identity that cannot be projected from a legacy default. Keep this save as schema ${SCHEMA_VERSION}`,
          };
        }
        delete corp[field];
      }
      delete corp["legacyProjectionDefaults"];
    }
    delete corp["sentimentMultiplier"];
    delete corp["orderFlowMultiplier"];
    delete corp["orderFlowWindowBuyValue"];
    delete corp["orderFlowWindowSellValue"];
    delete corp["priceHistory"];
    delete corp["liquidCurrencyCode"];
    delete corp["rdBudgetPerTurn"];
    delete corp["rdScore"];
    delete corp["lastRdSpendPerTurn"];
    delete corp["lastRdCapacityGain"];
    // #328: default prop-book state is dropped so the projected bytes stay
    // identical to an authentic schema 42 document; the reload backfill
    // re-seeds the same retail charter, empty book, and zero mark.
    const candidateCharter = corp["bankCharter"];
    if (isRecord(candidateCharter)) {
      delete candidateCharter["charterType"];
      delete candidateCharter["propBook"];
      delete candidateCharter["propBookMarkValue"];
    }
  }
  const candidateRegions = candidateWorld["regions"];
  if (isRecord(candidateRegions)) {
    for (const [regionId, value] of Object.entries(candidateRegions)) {
      if (!isRecord(value) || value["legacyProjectionDefault"] !== true) continue;
      if (Object.values(candidateCorporations).some((corp) => corp["headquartersRegionId"] === regionId)) {
        return {
          ok: false,
          error: `Headquarters region ${regionId} is referenced by a corporation and cannot be projected from a legacy default. Keep this save as schema ${SCHEMA_VERSION}`,
        };
      }
      delete candidateRegions[regionId];
    }
  }
  if (typeof candidatePlayer["homeRegionId"] !== "string") {
    delete candidatePlayer["homeRegionId"];
  }
  const candidate = JSON.stringify(candidateSave);

  let restoredWorld: WorldState;
  try {
    restoredWorld = deserializeSave(candidate);
  } catch (error) {
    return {
      ok: false,
      error: `Schema 42 projection is not loadable: ${errorMessage(error)}`,
    };
  }

  const restoredSave = {
    format: "ahdsolo-save",
    schemaVersion: restoredWorld.meta.schemaVersion,
    savedAt,
    world: restoredWorld,
  };
  if (!structurallyEqual(world["countryPolitics"], restoredWorld.countryPolitics)) {
    return {
      ok: false,
      error:
        `countryPolitics live gauges are not reconstructable from schema 42. Exporting would drop national approval, legitimacy, unrest, or approval history. Keep this save as schema ${SCHEMA_VERSION}`,
    };
  }
  if (world["centralBankPricingPhaseIn"] !== undefined) {
    return { ok: false, error: `Central-bank pricing phase-in state cannot be projected to schema 42. Keep this save as schema ${SCHEMA_VERSION}` };
  }
  if (structurallyEqual(save, restoredSave)) {
    return { ok: true, contents: candidate };
  }
  if (player["homeRegionId"] !== restoredWorld.player.homeRegionId) {
    return {
      ok: false,
      error: `player.homeRegionId is set to ${String(player["homeRegionId"])}. Schema 42 has no home-region identity; exporting would drop it. Keep this save as schema ${SCHEMA_VERSION}`,
    };
  }
  return {
    ok: false,
    error: `Schema 42 projection is not reversible: Native reload does not restore the original schema ${SCHEMA_VERSION} document`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSaveWorldRoot(value: unknown): asserts value is WorldState {
  if (!isRecord(value) || !isRecord(value["meta"]) || !isRecord(value["countries"])) {
    throw new Error("Not a valid save file: invalid world state");
  }
}

function validateDurableLayer1CheckpointOverlays(world: WorldState): void {
  for (const [regionId, raw] of Object.entries(world.baselineDemographics)) {
    if (!isRecord(raw)) throw new Error(`Not a valid save file: invalid baseline demographics for ${regionId}`);
    const positions = raw["layer1PositionOverrides"];
    if (positions !== undefined) {
      if (!isRecord(positions)) throw new Error("Not a valid save file: invalid durable Layer-1 position overrides");
      for (const [dimension, byBucket] of Object.entries(positions)) {
        if (!dimension || !isRecord(byBucket)) throw new Error("Not a valid save file: invalid durable Layer-1 position dimension");
        for (const [bucket, axes] of Object.entries(byBucket)) {
          if (!bucket || !isRecord(axes) || Object.keys(axes).some((axis) => axis !== "economicLean" && axis !== "socialLean")) {
            throw new Error("Not a valid save file: invalid durable Layer-1 position bucket");
          }
          for (const value of Object.values(axes)) {
            if (typeof value !== "number" || !Number.isFinite(value) || value < -5 || value > 5) {
              throw new Error("Not a valid save file: durable Layer-1 position delta is outside source bounds");
            }
          }
        }
      }
    }
    const turnout = raw["layer1TurnoutOverrides"];
    if (turnout !== undefined) {
      if (!isRecord(turnout)) throw new Error("Not a valid save file: invalid durable Layer-1 turnout overrides");
      for (const [dimension, byBucket] of Object.entries(turnout)) {
        if (!dimension || !isRecord(byBucket)) throw new Error("Not a valid save file: invalid durable Layer-1 turnout dimension");
        for (const [bucket, value] of Object.entries(byBucket)) {
          if (!bucket || typeof value !== "number" || !Number.isFinite(value) || value < -80 || value > 80) {
            throw new Error("Not a valid save file: durable Layer-1 turnout delta is outside source bounds");
          }
        }
      }
    }
  }
}

function validatePmAppointmentVotes(world: WorldState): void {
  const records = (world as unknown as Record<string, unknown>)["pmAppointmentVotes"];
  if (!Array.isArray(records)) throw new Error("Not a valid save file: invalid PM appointment votes");
  const ids = new Set<string>();
  for (const raw of records) {
    if (!isRecord(raw)) throw new Error("Not a valid save file: invalid PM appointment vote");
    const vote = raw;
    const countryId = vote["countryId"];
    const partyId = vote["partyId"];
    const coalitionPartyIds = vote["coalitionPartyIds"];
    const party = typeof partyId === "string" ? world.parties[partyId] : undefined;
    const coalition = typeof countryId === "string" && typeof vote["coalitionId"] === "string"
      ? world.coalitions.find((candidate) => candidate.id === vote["coalitionId"] && candidate.countryId === countryId)
      : undefined;
    const leadPartyId = Array.isArray(coalitionPartyIds) && coalitionPartyIds.length > 0
      ? coalitionPartyIds[0]
      : partyId;
    const leadParty = typeof leadPartyId === "string" ? world.parties[leadPartyId] : undefined;
    const turnFields = [vote["openedTurn"], vote["closesTurn"]];
    if (
      typeof vote["id"] !== "string" || vote["id"].length === 0 || ids.has(vote["id"]) ||
      typeof countryId !== "string" || !pmAppointmentExecutiveTitle(countryId) ||
      vote["chamberKey"] !== GOVERNMENT_CHAMBER_BY_COUNTRY[countryId] ||
      typeof partyId !== "string" || party?.countryId !== countryId ||
      (vote["coalitionId"] !== null && (typeof vote["coalitionId"] !== "string" || !coalition)) ||
      (coalitionPartyIds !== null && (!Array.isArray(coalitionPartyIds) || coalitionPartyIds.length < 2 || new Set(coalitionPartyIds).size !== coalitionPartyIds.length || !coalitionPartyIds.every((memberId) => typeof memberId === "string" && world.parties[memberId]?.countryId === countryId))) ||
      (COUNTRY_CONFIGS[countryId]?.governmentType === "onePartyState" && leadParty?.regimeStatus !== "ruling") ||
      vote["nomineeId"] !== "player" || typeof vote["nomineeName"] !== "string" || vote["nomineeName"].length === 0 ||
      (vote["formationType"] !== "majority" && vote["formationType"] !== "minority" && vote["formationType"] !== "coalition") ||
      !turnFields.every((turn) => typeof turn === "number" && Number.isSafeInteger(turn) && turn >= 0) ||
      (vote["closesTurn"] as number) <= (vote["openedTurn"] as number) ||
      !["active", "passed", "failed", "cancelled"].includes(String(vote["status"])) ||
      !isRecord(vote["votes"]) ||
      typeof vote["votesFor"] !== "number" || !Number.isSafeInteger(vote["votesFor"]) || vote["votesFor"] < 0 ||
      typeof vote["votesAgainst"] !== "number" || !Number.isSafeInteger(vote["votesAgainst"]) || vote["votesAgainst"] < 0 ||
      (vote["closedTurn"] !== null && (typeof vote["closedTurn"] !== "number" || !Number.isSafeInteger(vote["closedTurn"]) || vote["closedTurn"] < (vote["openedTurn"] as number)))
    ) throw new Error("Not a valid save file: invalid PM appointment vote");
    ids.add(vote["id"]);
    for (const [voterId, choice] of Object.entries(vote["votes"])) {
      if ((voterId !== "player" && !world.politicians.some((politician) => politician.id === voterId && politician.countryId === countryId && politician.chamberKey === vote["chamberKey"])) || (choice !== "aye" && choice !== "nay")) {
        throw new Error("Not a valid save file: invalid PM appointment ballot");
      }
    }
    if ((vote["status"] === "active") !== (vote["closedTurn"] === null)) {
      throw new Error("Not a valid save file: inconsistent PM appointment vote lifecycle");
    }
  }
}

function validateGovernmentDirectives(world: WorldState): void {
  // These saved NPP directives are produced only by the Irish NPC-government
  // phase. Player PM appointments elsewhere must not widen this snapshot
  // contract or authorize foreign NPP directive records.
  for (const [countryId, raw] of Object.entries(world.governments)) {
    if (!isRecord(raw)) throw new Error("Not a valid save file: invalid government state");
    const hasAgenda = Object.prototype.hasOwnProperty.call(raw, "governingAgenda");
    const hasStance = Object.prototype.hasOwnProperty.call(raw, "fiscalStance");
    const hasPm = Object.prototype.hasOwnProperty.call(raw, "directivesForPmId");
    const hasGoals = Object.prototype.hasOwnProperty.call(raw, "governingGoals");
    if (!hasAgenda && !hasStance && !hasPm && !hasGoals) continue;
    if (
      countryId !== "IE" || raw["countryId"] !== "IE" || raw["status"] !== "formed" ||
      raw["pmPoliticianId"] === "player" || typeof raw["pmPoliticianId"] !== "string" ||
      raw["directivesForPmId"] !== raw["pmPoliticianId"] || !hasAgenda || !hasStance || !hasPm
    ) throw new Error("Not a valid save file: invalid NPC government directive authority");
    const pm = world.politicians.find((politician) => politician.id === raw["pmPoliticianId"]);
    if (!pm || pm.countryId !== "IE" || pm.partyId !== raw["governingPartyId"]) {
      throw new Error("Not a valid save file: invalid NPC government directive PM");
    }
    const agenda = raw["governingAgenda"];
    if (
      !isRecord(agenda) || !Array.isArray(agenda["items"]) || agenda["items"].length > 6 ||
      !["reformer", "ideologue", "technocrat", "steward"].includes(String(agenda["archetype"])) ||
      !Number.isSafeInteger(agenda["computedTurn"]) || (agenda["computedTurn"] as number) < 0 ||
      (agenda["computedTurn"] as number) > world.meta.turn
    ) throw new Error("Not a valid save file: invalid governing agenda");
    for (const item of agenda["items"]) {
      if (
        !isRecord(item) || typeof item["domain"] !== "string" || item["domain"].length === 0 ||
        !Number.isFinite(item["target"]) || (item["target"] as number) < 0 || (item["target"] as number) > 100 ||
        !["raise", "lower", "hold"].includes(String(item["direction"])) ||
        !Number.isFinite(item["priority"]) || (item["priority"] as number) < 0 || (item["priority"] as number) > 1 ||
        (item["crisis"] !== undefined && typeof item["crisis"] !== "boolean")
      ) throw new Error("Not a valid save file: invalid governing agenda item");
    }
    const stance = raw["fiscalStance"];
    if (
      !isRecord(stance) || !["expansionary", "neutral", "austere"].includes(String(stance["stance"])) ||
      ![-1, 0, 1].includes(stance["direction"] as number) || !Number.isFinite(stance["intensity"]) ||
      (stance["intensity"] as number) < 0 || (stance["intensity"] as number) > 1 ||
      !Number.isSafeInteger(stance["computedTurn"]) || stance["computedTurn"] !== agenda["computedTurn"] ||
      (stance["stance"] === "expansionary" && stance["direction"] !== -1) ||
      (stance["stance"] === "austere" && stance["direction"] !== 1) ||
      (stance["stance"] === "neutral" && stance["direction"] !== 0)
    ) throw new Error("Not a valid save file: invalid fiscal stance");
    if (hasGoals) {
      const goalState = raw["governingGoals"];
      if (
        !isRecord(goalState) || !Array.isArray(goalState["goals"]) || goalState["goals"].length > 5 ||
        !Number.isSafeInteger(goalState["updatedTurn"]) || (goalState["updatedTurn"] as number) < 0 ||
        (goalState["updatedTurn"] as number) > world.meta.turn
      ) throw new Error("Not a valid save file: invalid governing goals");
      for (const goal of goalState["goals"]) {
        if (
          !isRecord(goal) || typeof goal["domain"] !== "string" || goal["domain"].length === 0 ||
          !["raise", "lower"].includes(String(goal["direction"])) ||
          !Number.isFinite(goal["target"]) || (goal["target"] as number) < 0 || (goal["target"] as number) > 100 ||
          !Number.isFinite(goal["priority"]) || (goal["priority"] as number) < 0 || (goal["priority"] as number) > 1 ||
          !["active", "achieved", "failed", "revised"].includes(String(goal["status"])) ||
          !["openedTurn", "reviewedTurn", "strikes"].every((key) => Number.isSafeInteger(goal[key]) && (goal[key] as number) >= 0) ||
          (goal["openedTurn"] as number) > (goalState["updatedTurn"] as number) ||
          (goal["reviewedTurn"] as number) > (goalState["updatedTurn"] as number) ||
          !Number.isFinite(goal["openingAttainment"]) || (goal["openingAttainment"] as number) < 0 || (goal["openingAttainment"] as number) > 1 ||
          !Number.isFinite(goal["attainment"]) || (goal["attainment"] as number) < 0 || (goal["attainment"] as number) > 1 ||
          (goal["crisis"] !== undefined && typeof goal["crisis"] !== "boolean")
        ) throw new Error("Not a valid save file: invalid governing goal record");
      }
    }
  }
}

const REQUIRED_WORLD_ARRAYS = [
  "politicians", "elections", "referendums", "impeachments", "charters", "caucuses",
  "endorsements", "extractionContracts", "prospectingSurveys", "achievementsEarned",
  "statePartyElections", "nationalPartyElections", "nationalCommitteeElections", "coalitions",
  "cabinetMembers", "cabinetNominations", "supremeCourtSeats", "scotusNominations", "docketCases",
  "ukJudicialReviewCases", "activeWorldModifiers", "crises", "playerEventLog", "governorAddresses",
  "governorOrders", "bills", "committees", "enactedLaws", "stateBills", "news", "bankLoans", "interbankLoans",
  "vitalSignsHistory", "ministerialOrders", "conflicts", "settlements", "subsidies", "pmAppointmentVotes",
] as const;

const REQUIRED_WORLD_RECORDS = [
  "featureFlags", "countries", "parties", "legislatures", "executives", "commodityPrices", "stateResourceCapacities",
  "regions", "partyRegions", "electoratePools", "regionTurnouts", "partyPressures", "candidateSupports",
  "stateDemographics", "baselineDemographics", "demographicCategories", "census", "laborForces", "budgets",
  "regionalBudgets", "nppRelationships", "nppSponsorLastTurn", "centralBanks", "corporations",
  "corpRevenueSnapshots", "campaigns", "governments", "worldEventLedger", "governors", "depositInsurance",
  "unions", "bonds", "exchangeRates", "nationalMetrics", "regionalMetrics", "economicModels", "commodityPriceHistory",
  "commandEconomy", "capitalStock", "capitalGrowth", "unownedSectors", "history", "policyLedger",
  "enactmentGates", "currencyUnions", "coldWarTension", "nuclearPrograms", "alignments", "internationalOrgs",
  "countryPolitics",
] as const;

function assertCurrentWorldState(world: WorldState): void {
  const value = world as unknown as Record<string, unknown>;
  const meta = value["meta"] as Record<string, unknown>;
  const player = value["player"];

  if (
    meta["schemaVersion"] !== SCHEMA_VERSION ||
    typeof meta["seed"] !== "string" ||
    !Array.isArray(meta["rng"]) ||
    meta["rng"].length !== 4 ||
    !meta["rng"].every((part) => Number.isInteger(part)) ||
    !Number.isInteger(meta["turn"]) ||
    (meta["turn"] as number) < 0 ||
    typeof meta["date"] !== "string" ||
    typeof meta["era"] !== "string" ||
    typeof meta["lastEra"] !== "string" ||
    typeof meta["cheatsUsed"] !== "boolean" ||
    !isRecord(player) ||
    typeof player["name"] !== "string" ||
    typeof player["countryId"] !== "string" ||
    (player["homeRegionId"] !== null && typeof player["homeRegionId"] !== "string")
  ) {
    throw new Error("Not a valid save file: invalid world state");
  }

  // Schema 68 adds source metric-engine coexistence state only to the
  // cost-of-living node. Old rows may legitimately omit it; present values
  // must be consumable by the 40..200 bounded source node.
  const regionalMetrics = value["regionalMetrics"];
  if (!isRecord(regionalMetrics)) throw new Error("Not a valid save file: invalid regional metrics");
  for (const [regionId, regionMetrics] of Object.entries(regionalMetrics)) {
    if (!isRecord(regionMetrics)) throw new Error(`Not a valid save file: invalid regional metrics for ${regionId}`);
    const col = regionMetrics["economic.costOfLiving"];
    if (col === undefined) continue;
    if (
      !isRecord(col) ||
      Object.keys(col).some((key) => key !== "value" && key !== "simBaseline") ||
      typeof col["value"] !== "number" || !Number.isFinite(col["value"]) ||
      (col["value"] as number) < 40 || (col["value"] as number) > 200 ||
      (col["simBaseline"] !== undefined &&
        (typeof col["simBaseline"] !== "number" || !Number.isFinite(col["simBaseline"]) ||
          (col["simBaseline"] as number) < 40 || (col["simBaseline"] as number) > 200))
    ) {
      throw new Error(`Not a valid save file: invalid regional cost-of-living metric for ${regionId}`);
    }
  }
  if (meta["startingYear"] !== undefined &&
      (!Number.isSafeInteger(meta["startingYear"]) || (meta["startingYear"] as number) < 1000 || (meta["startingYear"] as number) > 9999)) {
    throw new Error("Not a valid save file: invalid source starting year");
  }
  validateDurableLayer1CheckpointOverlays(world);
  const lastRelocatedTurn = player["lastRelocatedTurn"];
  if (lastRelocatedTurn !== undefined &&
      (!Number.isSafeInteger(lastRelocatedTurn) || (lastRelocatedTurn as number) < 0)) {
    throw new Error("Not a valid save file: invalid player relocation turn");
  }

  const ukDevolution = value["ukDevolution"];
  if (ukDevolution !== undefined) {
    const expectedRegions = ["LON", "NIR", "SCO", "WAL"];
    if (
      !isRecord(ukDevolution) ||
      ukDevolution["_id"] !== "UK" ||
      !isRecord(ukDevolution["regions"]) ||
      Object.keys(ukDevolution["regions"]).sort().join(",") !== expectedRegions.join(",") ||
      Object.keys(ukDevolution).some((key) => !["_id", "regions", "lastPolicyBillId", "northernIrelandPeace"].includes(key)) ||
      (ukDevolution["lastPolicyBillId"] !== undefined &&
        (typeof ukDevolution["lastPolicyBillId"] !== "string" || ukDevolution["lastPolicyBillId"].length === 0))
    ) {
      throw new Error("Not a valid save file: invalid UK devolution institution state");
    }
    const niPeace = ukDevolution["northernIrelandPeace"];
    if (niPeace !== undefined && (
      !isRecord(niPeace) ||
      Object.keys(niPeace).some((key) => !["posture", "changedTurn", "assemblyFirstCycle", "assemblyFirstElectionEndTurn"].includes(key)) ||
      !["unsettled", "power_sharing", "suspended"].includes(String(niPeace["posture"])) ||
      !Number.isInteger(niPeace["changedTurn"]) || (niPeace["changedTurn"] as number) < 0 ||
      (niPeace["assemblyFirstCycle"] !== undefined && (!Number.isInteger(niPeace["assemblyFirstCycle"]) || (niPeace["assemblyFirstCycle"] as number) < 1)) ||
      (niPeace["assemblyFirstElectionEndTurn"] !== undefined && (!Number.isInteger(niPeace["assemblyFirstElectionEndTurn"]) || (niPeace["assemblyFirstElectionEndTurn"] as number) < 0))
    )) {
      throw new Error("Not a valid save file: invalid Northern Ireland peace posture");
    }
    if (niPeace !== undefined) {
      for (const field of ["assemblyFirstCycle", "assemblyFirstElectionEndTurn"]) {
        const fieldValue = niPeace[field];
        if (fieldValue !== undefined && (!Number.isInteger(fieldValue) || (fieldValue as number) < 0)) {
          throw new Error("Not a valid save file: invalid Northern Ireland peace institution anchor");
        }
      }
    }
    for (const regionId of expectedRegions) {
      const institution = ukDevolution["regions"][regionId];
      if (
        !isRecord(institution) ||
        Object.keys(institution).some((key) => !["active", "firstCycle", "firstElectionEndTurn"].includes(key)) ||
        typeof institution["active"] !== "boolean" ||
        !Number.isInteger(institution["firstCycle"]) ||
        (institution["firstCycle"] as number) < 1 ||
        (institution["firstElectionEndTurn"] !== undefined &&
          (!Number.isInteger(institution["firstElectionEndTurn"]) || (institution["firstElectionEndTurn"] as number) < 0))
      ) {
        throw new Error(`Not a valid save file: invalid UK devolution institution state for ${regionId}`);
      }
    }
  }

  const niConflict = value["northernIrelandConflict"];
  if (niConflict !== undefined) {
    const phases = ["armed_stalemate", "backchannels", "ceasefire", "multiparty_talks", "agreement", "power_sharing", "fragile_settlement"];
    const trackKeys = ["violence", "settlementMomentum", "legitimacy", "unionistConsent", "nationalistConsent", "decommissioning", "institutionalStability", "domesticConsent", "referendumRatification", "ratificationAuthorization", "ratificationFailureCount"];
    if (!isRecord(niConflict) || niConflict["_id"] !== "northern_ireland" || niConflict["hasOpened"] !== true || !phases.includes(String(niConflict["phase"])) || niConflict["phaseLevel"] !== phases.indexOf(String(niConflict["phase"])) + 1 || !["active", "negotiating", "ceasefire", "settled", "closed"].includes(String(niConflict["status"])) || !isRecord(niConflict["tracks"]) || Object.keys(niConflict["tracks"]).sort().join(",") !== trackKeys.sort().join(",")) {
      throw new Error("Not a valid save file: invalid Northern Ireland living-conflict state");
    }
    for (const key of trackKeys) {
      const n = niConflict["tracks"][key];
      const max = key === "referendumRatification" ? 1 : key === "ratificationAuthorization" || key === "ratificationFailureCount" ? 2 : 100;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) throw new Error(`Not a valid save file: invalid Northern Ireland track ${key}`);
    }
    for (const key of ["phaseTurns", "totalTurns", "lastProcessedTurn", "lastInteractionTurn"]) {
      const min = key === "lastInteractionTurn" ? -24 : -1;
      if (!Number.isInteger(niConflict[key]) || (niConflict[key] as number) < min) throw new Error("Not a valid save file: invalid Northern Ireland living-conflict clock");
    }
    if (niConflict["decision"] !== undefined && (!isRecord(niConflict["decision"]) || !["peace_initiative", "agreement_implementation"].includes(String(niConflict["decision"]["interaction"])) || typeof niConflict["decision"]["nodeId"] !== "string" || !Number.isInteger(niConflict["decision"]["nodeIndex"]) || !Number.isInteger(niConflict["decision"]["openedTurn"]) || !Number.isInteger(niConflict["decision"]["deadlineTurn"]))) {
      throw new Error("Not a valid save file: invalid Northern Ireland conflict decision");
    }
  }
  const niPoll = value["northernIrelandPeacePoll"];
  if (niPoll !== undefined && (!isRecord(niPoll) || typeof niPoll["id"] !== "string" || niPoll["kind"] !== "peace_agreement" || !["campaigning", "completed"].includes(String(niPoll["status"])) || typeof niPoll["agreementKey"] !== "string" || !Number.isInteger(niPoll["openedTurn"]) || !Number.isInteger(niPoll["closesTurn"]) || typeof niPoll["yesShare"] !== "number" || !Number.isFinite(niPoll["yesShare"]) || niPoll["yesShare"] < 0 || niPoll["yesShare"] > 100 || !isRecord(niPoll["campaignSpendUnits"]) || !isRecord(niPoll["campaignSpendUnits"]) || typeof niPoll["campaignSpendUnits"]["yes"] !== "number" || typeof niPoll["campaignSpendUnits"]["no"] !== "number" || !Array.isArray(niPoll["cohortBaseline"]))) {
    throw new Error("Not a valid save file: invalid Northern Ireland peace poll");
  }

  const ukCommonsVacancies = value["ukCommonsVacancies"];
  if (ukCommonsVacancies !== undefined) {
    if (!Array.isArray(ukCommonsVacancies)) throw new Error("Not a valid save file: invalid UK Commons vacancy ledger");
    const seenVacancyIds = new Set<string>();
    for (const vacancy of ukCommonsVacancies) {
      if (!isRecord(vacancy) || Object.keys(vacancy).some((key) => !["id", "countryId", "regionId", "formerHolderId", "seats", "reason", "vacatedTurn", "status", "electionId", "filledById", "filledTurn"].includes(key)) ||
        typeof vacancy["id"] !== "string" || typeof vacancy["regionId"] !== "string" || vacancy["countryId"] !== "UK" || typeof vacancy["formerHolderId"] !== "string" || !["death", "retirement", "defection", "resignation", "recall", "removal"].includes(String(vacancy["reason"])) || !Number.isInteger(vacancy["vacatedTurn"]) || !["open", "scheduled", "filled", "subsumed"].includes(String(vacancy["status"])) ||
        (vacancy["seats"] !== undefined && (!Number.isSafeInteger(vacancy["seats"]) || (vacancy["seats"] as number) < 1)) ||
        seenVacancyIds.has(vacancy["id"]) ||
        (vacancy["status"] === "scheduled" && typeof vacancy["electionId"] !== "string") ||
        (vacancy["status"] === "filled" && ((vacancy["filledById"] !== undefined && typeof vacancy["filledById"] !== "string") || !Number.isInteger(vacancy["filledTurn"]))) ||
        (vacancy["status"] !== "filled" && (vacancy["filledById"] !== undefined || vacancy["filledTurn"] !== undefined))) {
        throw new Error("Not a valid save file: invalid UK Commons vacancy entry");
      }
      seenVacancyIds.add(vacancy["id"]);
    }
  }

  const recallPetitions = value["ukCommonsRecallPetitions"];
  if (recallPetitions !== undefined) {
    const petitionKeys = ["id", "countryId", "regionId", "officialId", "targetName", "targetPartyId", "status", "trigger", "lowStreak", "lastEvaluatedTurn", "signatures", "declarations", "supportSamples", "openedTurn", "checkStartTurn", "checkEndTurn", "resolvedTurn", "outcome", "vacancyId", "expireReason"];
    const ids = new Set<string>();
    const liveOfficials = new Set<string>();
    const recallVacancies = new Map((Array.isArray(ukCommonsVacancies) ? ukCommonsVacancies : []).filter(isRecord).map((row) => [String(row["id"]), row]));
    const currentTurn = isRecord(value["meta"]) && Number.isSafeInteger(value["meta"]["turn"]) ? value["meta"]["turn"] as number : -1;
    if (!Array.isArray(recallPetitions)) throw new Error("Not a valid save file: invalid UK Commons recall ledger");
    for (const petition of recallPetitions) {
      if (!isRecord(petition) || Object.keys(petition).some((key) => !petitionKeys.includes(key)) ||
        typeof petition["id"] !== "string" || !petition["id"] || ids.has(petition["id"]) || petition["countryId"] !== "UK" ||
        typeof petition["regionId"] !== "string" || !petition["regionId"] || typeof petition["officialId"] !== "string" || !petition["officialId"] ||
        typeof petition["targetName"] !== "string" || !["watch", "open", "check", "retained", "vacated", "expired"].includes(String(petition["status"])) ||
        !["infamy", "lowApproval"].includes(String(petition["trigger"])) || !Number.isSafeInteger(petition["lowStreak"]) || (petition["lowStreak"] as number) < 0 ||
        !Number.isSafeInteger(petition["lastEvaluatedTurn"]) || (petition["lastEvaluatedTurn"] as number) < -1 ||
        (petition["targetPartyId"] !== undefined && typeof petition["targetPartyId"] !== "string") ||
        !Array.isArray(petition["signatures"]) || !Array.isArray(petition["declarations"]) || !Array.isArray(petition["supportSamples"])) {
        throw new Error("Not a valid save file: invalid UK Commons recall petition");
      }
      ids.add(petition["id"]);
      const live = ["watch", "open", "check"].includes(String(petition["status"]));
      if (live && liveOfficials.has(petition["officialId"])) throw new Error("Not a valid save file: duplicate live UK Commons recall office");
      if (live) liveOfficials.add(petition["officialId"]);
      const uniqueActors = new Set<string>();
      for (const signature of petition["signatures"]) {
        if (!isRecord(signature) || Object.keys(signature).some((key) => !["actorId", "turn"].includes(key)) || typeof signature["actorId"] !== "string" || !signature["actorId"] || !Number.isSafeInteger(signature["turn"]) || (signature["turn"] as number) < 0 || uniqueActors.has(signature["actorId"])) throw new Error("Not a valid save file: invalid UK Commons recall signature");
        uniqueActors.add(signature["actorId"]);
        if ((petition["openedTurn"] !== undefined && (signature["turn"] as number) < (petition["openedTurn"] as number)) || (currentTurn >= 0 && (signature["turn"] as number) > currentTurn)) throw new Error("Not a valid save file: UK Commons recall signature outside petition clock");
      }
      uniqueActors.clear();
      for (const declaration of petition["declarations"]) {
        if (!isRecord(declaration) || Object.keys(declaration).some((key) => !["actorId", "side", "turn"].includes(key)) || typeof declaration["actorId"] !== "string" || !declaration["actorId"] || !["retain", "remove"].includes(String(declaration["side"])) || !Number.isSafeInteger(declaration["turn"]) || (declaration["turn"] as number) < 0 || uniqueActors.has(declaration["actorId"])) throw new Error("Not a valid save file: invalid UK Commons recall declaration");
        uniqueActors.add(declaration["actorId"]);
        if ((petition["checkStartTurn"] !== undefined && (declaration["turn"] as number) < (petition["checkStartTurn"] as number)) || (petition["checkEndTurn"] !== undefined && (declaration["turn"] as number) > (petition["checkEndTurn"] as number)) || (currentTurn >= 0 && (declaration["turn"] as number) > currentTurn)) throw new Error("Not a valid save file: UK Commons recall declaration outside check clock");
      }
      let priorSampleTurn = -1;
      for (const sample of petition["supportSamples"]) {
        if (!isRecord(sample) || Object.keys(sample).some((key) => !["turn", "favorability"].includes(key)) || !Number.isSafeInteger(sample["turn"]) || (sample["turn"] as number) < 0 || (sample["turn"] as number) <= priorSampleTurn || typeof sample["favorability"] !== "number" || !Number.isFinite(sample["favorability"]) || sample["favorability"] < 0 || sample["favorability"] > 100) throw new Error("Not a valid save file: invalid UK Commons recall support sample");
        priorSampleTurn = sample["turn"] as number;
        if ((petition["checkStartTurn"] !== undefined && priorSampleTurn < (petition["checkStartTurn"] as number)) || (currentTurn >= 0 && priorSampleTurn > currentTurn)) throw new Error("Not a valid save file: UK Commons recall sample outside check clock");
      }
      const turnFields = ["openedTurn", "checkStartTurn", "checkEndTurn", "resolvedTurn"] as const;
      for (const key of turnFields) if (petition[key] !== undefined && (!Number.isSafeInteger(petition[key]) || (petition[key] as number) < 0)) throw new Error("Not a valid save file: invalid UK Commons recall clock");
      if ((petition["status"] === "watch" && ((petition["lowStreak"] as number) > 3 || petition["openedTurn"] !== undefined || petition["checkStartTurn"] !== undefined || petition["checkEndTurn"] !== undefined || petition["resolvedTurn"] !== undefined || petition["signatures"].length !== 0 || petition["declarations"].length !== 0 || petition["supportSamples"].length !== 0)) ||
        (petition["status"] === "open" && (!Number.isSafeInteger(petition["openedTurn"]) || petition["checkStartTurn"] !== undefined || petition["checkEndTurn"] !== undefined || petition["resolvedTurn"] !== undefined)) ||
        (petition["status"] === "open" && ((petition["openedTurn"] as number) > currentTurn || petition["outcome"] !== undefined || petition["vacancyId"] !== undefined || petition["expireReason"] !== undefined || petition["declarations"].length !== 0 || petition["supportSamples"].length !== 0)) ||
        (petition["status"] === "check" && (!Number.isSafeInteger(petition["openedTurn"]) || !Number.isSafeInteger(petition["checkStartTurn"]) || !Number.isSafeInteger(petition["checkEndTurn"]) || (petition["checkEndTurn"] as number) !== (petition["checkStartTurn"] as number) + 6 || (petition["checkStartTurn"] as number) > currentTurn || petition["resolvedTurn"] !== undefined || petition["outcome"] !== undefined || petition["vacancyId"] !== undefined || petition["expireReason"] !== undefined || petition["signatures"].length < 5)) ||
        (["retained", "vacated", "expired"].includes(String(petition["status"])) && (petition["openedTurn"] === undefined || (petition["openedTurn"] as number) > currentTurn || petition["declarations"].length > 0 && petition["checkStartTurn"] === undefined)) ||
        (["retained", "vacated", "expired"].includes(String(petition["status"])) && !Number.isSafeInteger(petition["resolvedTurn"])) ||
        (petition["status"] === "vacated" && (petition["outcome"] !== "vacated" || typeof petition["vacancyId"] !== "string" || !recallVacancies.has(petition["vacancyId"] as string) || recallVacancies.get(petition["vacancyId"] as string)?.["formerHolderId"] !== petition["officialId"] || recallVacancies.get(petition["vacancyId"] as string)?.["reason"] !== "recall")) ||
        (petition["status"] === "retained" && (petition["outcome"] !== "retained" || petition["checkStartTurn"] === undefined || petition["supportSamples"].length === 0)) ||
        (petition["status"] === "expired" && (typeof petition["expireReason"] !== "string" || petition["expireReason"] !== "fewer than 5 signatures within 12 turns" || petition["outcome"] !== undefined || petition["signatures"].length >= 5 || petition["openedTurn"] === undefined || petition["checkStartTurn"] !== undefined || petition["checkEndTurn"] !== undefined || petition["declarations"].length !== 0 || petition["supportSamples"].length !== 0 || (petition["resolvedTurn"] as number) < (petition["openedTurn"] as number) + 12)) ||
        (petition["status"] !== "vacated" && petition["vacancyId"] !== undefined) ||
        (petition["status"] !== "expired" && petition["expireReason"] !== undefined) ||
        (petition["status"] !== "retained" && petition["status"] !== "vacated" && petition["outcome"] !== undefined) ||
        (petition["status"] === "vacated" && (petition["checkStartTurn"] === undefined || petition["supportSamples"].length === 0)) ||
        ((petition["status"] === "retained" || petition["status"] === "vacated") && (petition["checkEndTurn"] === undefined || (petition["resolvedTurn"] as number) < (petition["checkEndTurn"] as number))) ||
        (["retained", "vacated", "expired"].includes(String(petition["status"])) && !Number.isSafeInteger(petition["resolvedTurn"])) ||
        (currentTurn >= 0 && Number.isSafeInteger(petition["lastEvaluatedTurn"]) && (petition["lastEvaluatedTurn"] as number) > currentTurn)) throw new Error("Not a valid save file: inconsistent UK Commons recall petition phase");
    }
  }

  const hasValidSeatWeight = (holder: Record<string, unknown>): boolean =>
    holder["seatsHeld"] === undefined ||
    (Number.isSafeInteger(holder["seatsHeld"]) && (holder["seatsHeld"] as number) >= 1);
  const playerSeat = player["legislativeSeat"];
  if (isRecord(playerSeat) && !hasValidSeatWeight(playerSeat)) {
    throw new Error("Not a valid save file: invalid player seat weight");
  }
  const politicians = value["politicians"];
  if (Array.isArray(politicians) && politicians.some(p => isRecord(p) && !hasValidSeatWeight(p))) {
    throw new Error("Not a valid save file: invalid politician seat weight");
  }

  const pricingState = value["centralBankPricingPhaseIn"];
  if (
    pricingState !== undefined &&
    (!isRecord(pricingState) || typeof pricingState["startedTurn"] !== "number" ||
      !Number.isFinite(pricingState["startedTurn"]) || pricingState["startedTurn"] < 0 ||
      !Number.isInteger(pricingState["startedTurn"]))
  ) {
    throw new Error("Not a valid save file: invalid central-bank pricing phase state");
  }
  const savingsPolicy = value["savingsAccountsPolicy"];
  if (savingsPolicy !== undefined) {
    if (
      !isRecord(savingsPolicy) ||
      !["off", "shadow", "authoritative"].includes(String(savingsPolicy["mode"])) ||
      !Array.isArray(savingsPolicy["readCurrencies"]) ||
      !savingsPolicy["readCurrencies"].every((currency) => typeof currency === "string" && currency.length > 0)
    ) {
      throw new Error("Not a valid save file: invalid savings-accounts policy");
    }
  }

  // Legacy saves omit NI. Present values must be valid uncapped reputation.
  const nationalInfluence = player["nationalInfluence"];
  if (
    nationalInfluence !== undefined &&
    (typeof nationalInfluence !== "number" || !Number.isFinite(nationalInfluence) || nationalInfluence < 0)
  ) {
    throw new Error("Not a valid save file: invalid player national influence");
  }
  const bills = value["bills"];
  if (!Array.isArray(bills)) throw new Error("Not a valid save file: invalid bills");
  for (const rawBill of bills) {
    if (!isRecord(rawBill)) throw new Error("Not a valid save file: invalid bill");
    for (const key of ["proposalActionCost", "proposalNpiCost"] as const) {
      const amount = rawBill[key];
      if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
        throw new Error(`Not a valid save file: invalid bill ${key}`);
      }
    }
    if (rawBill["proposalCostsRefunded"] !== undefined && typeof rawBill["proposalCostsRefunded"] !== "boolean") {
      throw new Error("Not a valid save file: invalid bill proposalCostsRefunded");
    }
    const provisions = rawBill["provisions"];
    if (!Array.isArray(provisions)) throw new Error("Not a valid save file: invalid bill provisions");
    for (const provision of provisions) {
      if (!isRecord(provision) || provision["type"] !== "union_law") continue;
      const bias = provision["bias"];
      const banAction = provision["banAction"];
      if (typeof bias !== "number" || !Number.isFinite(bias) || bias < -50 || bias > 50 ||
          (banAction !== undefined && banAction !== "ban" && banAction !== "repeal_ban")) {
        throw new Error("Not a valid save file: invalid union-law provision");
      }
    }
  }
  const budgets = value["budgets"];
  if (isRecord(budgets)) for (const [countryId, rawBudget] of Object.entries(budgets)) {
    if (!isRecord(rawBudget)) continue;
    if (rawBudget["unionsBanned"] !== undefined && typeof rawBudget["unionsBanned"] !== "boolean") {
      throw new Error(`Not a valid save file: invalid budget ${countryId} unionsBanned`);
    }
    const bias = rawBudget["unionLawBias"];
    if (bias !== undefined && (typeof bias !== "number" || !Number.isFinite(bias) || bias < -50 || bias > 50)) {
      throw new Error(`Not a valid save file: invalid budget ${countryId} unionLawBias`);
    }
  }
  const tradeTariffs = value["tradeTariffs"];
  if (tradeTariffs !== undefined) {
    if (!Array.isArray(tradeTariffs)) throw new Error("Not a valid save file: invalid trade tariffs");
    for (const row of tradeTariffs) {
      if (!isRecord(row) || typeof row["id"] !== "string" || typeof row["countryId"] !== "string" ||
          row["scopeType"] !== "economy_wide" || typeof row["sourceBillId"] !== "string" ||
          typeof row["rate"] !== "number" || !Number.isFinite(row["rate"]) || row["rate"] < 0 || row["rate"] > 100 ||
          !Number.isSafeInteger(row["createdTurn"]) || (row["createdTurn"] as number) < 0 ||
          !Number.isSafeInteger(row["updatedTurn"]) || (row["updatedTurn"] as number) < 0) {
        throw new Error("Not a valid save file: invalid trade tariff row");
      }
    }
  }
  const partyInfluence = player["partyInfluence"];
  if (partyInfluence !== undefined && (typeof partyInfluence !== "number" || !Number.isFinite(partyInfluence) || partyInfluence < 0)) {
    throw new Error("Not a valid save file: invalid player party influence");
  }
  const policies = player["policies"];
  if (policies !== undefined && (!isRecord(policies) || ["economic", "social"].some(axis => {
    const n = policies[axis];
    return typeof n !== "number" || !Number.isFinite(n) || n < -5 || n > 5;
  }))) {
    throw new Error("Not a valid save file: invalid player policies");
  }
  const stats = player["stats"];
  if (stats !== undefined) {
    if (!isRecord(stats)) throw new Error("Not a valid save file: invalid player Energy stats");
    // #242: the full seven-key stat block shares the reference [1,10] band;
    // legacy saves carry only energy/debate. Every present key must be legal.
    for (const [key, raw] of Object.entries(stats)) {
      if (!STAT_KEYS.includes(key as (typeof STAT_KEYS)[number])) {
        throw new Error(`Not a valid save file: unknown player stat ${key}`);
      }
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1 || raw > 10) {
        throw new Error(`Not a valid save file: invalid player stat ${key}`);
      }
    }
  }
  for (const key of ["statsAllocated", "statsReallocationUsed", "statAllocationDismissed"] as const) {
    if (player[key] !== undefined && typeof player[key] !== "boolean") {
      throw new Error(`Not a valid save file: invalid player ${key}`);
    }
  }
  if (player["statsAllocated"] === true && (!isRecord(stats) || STAT_KEYS.some(key => stats[key] === undefined))) {
    throw new Error("Not a valid save file: allocated player has incomplete stats");
  }
  if (player["statsReallocationUsed"] === true && player["statsAllocated"] === false) {
    throw new Error("Not a valid save file: reallocation used before allocation");
  }
  const statXp = player["statXp"];
  if (statXp !== undefined && (!isRecord(statXp) || Object.entries(statXp).some(([key, xp]) =>
    !STAT_KEYS.includes(key as (typeof STAT_KEYS)[number]) || typeof xp !== "number" || !Number.isFinite(xp) || xp < 0))) {
    throw new Error("Not a valid save file: invalid player stat XP");
  }
  const decayAnchor = player["debateDecayAnchor"];
  const decayAnchorTurn = player["debateDecayAnchorTurn"];
  if (decayAnchorTurn !== undefined && (typeof decayAnchorTurn !== "number" || !Number.isSafeInteger(decayAnchorTurn) || decayAnchorTurn < 0)) {
    throw new Error("Not a valid save file: invalid player debate decay turn");
  }
  if (decayAnchor !== undefined && (typeof decayAnchor !== "string" || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(decayAnchor) || !Number.isFinite(Date.parse(decayAnchor)))) {
    throw new Error("Not a valid save file: invalid player debate decay anchor");
  }
  // #242: demographics and the optional header are player-identity extras. They
  // are optional, but a present value must match the reference option sets.
  const demographics = player["demographics"];
  if (demographics !== undefined) {
    if (!isRecord(demographics) || !isValidDemographics(demographics)) {
      throw new Error("Not a valid save file: invalid player demographics");
    }
  }
  const profileHeader = player["profileHeaderUrl"];
  if (profileHeader !== undefined && profileHeader !== null && !isPlayerImageUrl(profileHeader, MAX_PLAYER_HEADER_BYTES)) {
    throw new Error("Not a valid save file: invalid player profile header");
  }
  // #48: onboarding/tutorial prompt states are optional booleans. Absent
  // reads as not dismissed / not completed; a present non-boolean is
  // corruption, never history.
  for (const field of ["onboardingDismissed", "tutorialCompleted", "tutorialDismissed"] as const) {
    const flag = player[field];
    if (flag !== undefined && typeof flag !== "boolean") {
      throw new Error(`Not a valid save file: invalid player ${field}`);
    }
  }
  // #242: the portrait shares the raster format, but its 2 MB cap is lower
  // than the header's 4 MB cap. Import must enforce the same rule as creation.
  const avatar = player["avatarUrl"];
  if (avatar !== undefined && avatar !== null && !isPlayerImageUrl(avatar, MAX_PLAYER_AVATAR_BYTES)) {
    throw new Error("Not a valid save file: invalid player avatar");
  }
  // Stored poll snapshots (#38): absent until commissioned; present values
  // must carry the numeric topline fields (ports Character.lastPoll shape).
  for (const field of ["lastPoll", "lastPollLarge"] as const) {
    const snap = player[field];
    if (snap === undefined) continue;
    if (
      !isRecord(snap) ||
      typeof snap["takenAt"] !== "string" ||
      !Number.isInteger(snap["takenAtTurn"]) ||
      typeof snap["overallAppeal"] !== "number" ||
      !Number.isFinite(snap["overallAppeal"]) ||
      typeof snap["totalEstimatedVoters"] !== "number" ||
      typeof snap["totalPotentialVoters"] !== "number" ||
      !Array.isArray(snap["topGroups"]) ||
      !Array.isArray(snap["bottomGroups"])
    ) {
      throw new Error(`Not a valid save file: invalid player ${field}`);
    }
  }

  for (const field of REQUIRED_WORLD_ARRAYS) {
    if (!Array.isArray(value[field])) {
      throw new Error(`Not a valid save file: invalid world state field ${field}`);
    }
  }
  for (const field of REQUIRED_WORLD_RECORDS) {
    if (!isRecord(value[field])) {
      throw new Error(`Not a valid save file: invalid world state field ${field}`);
    }
  }
  if (
    typeof player["homeRegionId"] === "string" &&
    (value["regions"] as Record<string, { countryId?: unknown }>)[player["homeRegionId"]]?.countryId !==
      player["countryId"]
  ) {
    throw new Error("Not a valid save file: player home region does not belong to player country");
  }
  // Issue #334: difficulty is optional with absent-means-normal. A present
  // axis must be a known value; an explicit `normal` (written only by
  // unreleased schema 47 dev saves) reads as the default.
  const saveDifficulty = value["difficulty"];
  if (saveDifficulty !== undefined && !isSingleplayerDifficulty(saveDifficulty)) {
    throw new Error("Not a valid save file: invalid difficulty");
  }
  // Issue #346: the play mode is part of the load contract. Legacy saves
  // reach here only after the v12/v39 migrations backfill career, so a
  // surviving unknown value is corruption, never history.
  if (!isSingleplayerMode((value["player"] as Record<string, unknown>)["mode"])) {
    throw new Error("Not a valid save file: invalid play mode");
  }
  // Issue #345: autonomy is optional with absent-means-v4. A present
  // tier must be a known value; an explicit `v4` (written only by
  // unreleased schema 48 dev saves) reads as the default.
  const saveAutonomy = value["nppAutonomyLevel"];
  if (saveAutonomy !== undefined && !isNppAutonomyLevel(saveAutonomy)) {
    throw new Error("Not a valid save file: invalid autonomy tier");
  }
  const featureFlags = value["featureFlags"] as Record<string, unknown>;
  if (Object.keys(featureFlags).some((key) => !isWorldFeatureFlag(key))) {
    throw new Error("Not a valid save file: unknown feature flag");
  }
  for (const { key } of WORLD_FEATURE_FLAG_DEFINITIONS) {
    if (typeof featureFlags[key] !== "boolean") {
      throw new Error(`Not a valid save file: invalid feature flag ${key}`);
    }
  }
  for (const field of ["ledgerPreForexSnapshot", "economicVitalSigns"] as const) {
    if (value[field] !== null && !isRecord(value[field])) {
      throw new Error(`Not a valid save file: invalid world state field ${field}`);
    }
  }
  assertCountryPolitics(value["countryPolitics"]);
}

const COUNTRY_POLITICS_REGIMES = new Set([
  "presidential-republic",
  "parliamentary",
  "one-party",
  "national-government",
]);

function assertFiniteGauge(entry: Record<string, unknown>, field: string, countryId: string): void {
  const v = entry[field];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
    throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"].${field}`);
  }
}

/** Strict per-entry validation for the v43 countryPolitics record. */
function assertCountryPolitics(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("Not a valid save file: invalid world state field countryPolitics");
  }
  for (const [countryId, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"]`);
    }
    if (entry["countryId"] !== countryId) {
      throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"].countryId`);
    }
    for (const field of ["approval", "legitimacy", "unrest"] as const) {
      assertFiniteGauge(entry, field, countryId);
    }
    if (!Array.isArray(entry["approvalHistory"])) {
      throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"].approvalHistory`);
    }
    for (const sample of entry["approvalHistory"] as unknown[]) {
      if (
        !isRecord(sample) ||
        !Number.isInteger(sample["turn"]) ||
        (sample["turn"] as number) < 0 ||
        typeof sample["approval"] !== "number" ||
        !Number.isFinite(sample["approval"] as number) ||
        (sample["approval"] as number) < 0 ||
        (sample["approval"] as number) > 100
      ) {
        throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"].approvalHistory entry`);
      }
    }
    if (typeof entry["regime"] !== "string" || !COUNTRY_POLITICS_REGIMES.has(entry["regime"])) {
      throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"].regime`);
    }
    if (typeof entry["governmentType"] !== "string") {
      throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"].governmentType`);
    }
    if (!Number.isInteger(entry["updatedTurn"]) || (entry["updatedTurn"] as number) < 0) {
      throw new Error(`Not a valid save file: invalid countryPolitics["${countryId}"].updatedTurn`);
    }
  }
}

/**
 * #328 load-time normalization for bank charter prop state. Absent fields
 * take the seeded shape (retail, empty book, zero mark); a present-but-absent
 * mark is recomputed from the rows so the cached aggregate stays
 * self-consistent. Anything present-but-invalid fails closed.
 */
function normalizeBankCharterPropBook(corpId: string, charter: BankCharter): void {
  if (charter.charterType === undefined) {
    charter.charterType = "retail";
  } else if (charter.charterType !== "retail" && charter.charterType !== "investment" && charter.charterType !== "universal") {
    throw new Error(`Not a valid save file: corporation ${corpId} has an invalid bank charter type`);
  }
  if (charter.propBook === undefined) {
    charter.propBook = [];
  } else {
    if (!Array.isArray(charter.propBook)) {
      throw new Error(`Not a valid save file: corporation ${corpId} has an invalid bank prop book`);
    }
    for (const row of charter.propBook) {
      if (typeof row !== "object" || row === null) {
        throw new Error(`Not a valid save file: corporation ${corpId} has an invalid bank prop position`);
      }
      const asset = (row as { asset?: unknown }).asset;
      const ref = (row as { ref?: unknown }).ref;
      const units = (row as { units?: unknown }).units;
      const costBasis = (row as { costBasis?: unknown }).costBasis;
      const markValue = (row as { markValue?: unknown }).markValue;
      if (asset !== "equity" || typeof ref !== "string" || ref.length === 0 || typeof units !== "number" || !Number.isFinite(units) || !(units > 0) || typeof costBasis !== "number" || !Number.isFinite(costBasis) || costBasis < 0 || (markValue !== undefined && (typeof markValue !== "number" || !Number.isFinite(markValue) || markValue < 0))) {
        throw new Error(`Not a valid save file: corporation ${corpId} has an invalid bank prop position`);
      }
    }
  }
  if (charter.propBookMarkValue === undefined) {
    charter.propBookMarkValue = sumPositionMarks(charter.propBook);
  } else if (typeof charter.propBookMarkValue !== "number" || !Number.isFinite(charter.propBookMarkValue) || charter.propBookMarkValue < 0) {
    throw new Error(`Not a valid save file: corporation ${corpId} has an invalid bank prop mark`);
  }
  // #328 coherence: no legal transition puts positions (or a nonzero mark)
  // on a non-prop charter - opens refuse retail, failure clears the book,
  // and seeds are retail/empty/zero. A retail book can only be smuggled in,
  // so it fails closed instead of persisting inert until a charter flip.
  if (
    charterTypeOf(charter) === "retail" &&
    ((charter.propBook?.length ?? 0) > 0 ||
      (charter.propBookMarkValue ?? 0) !== 0)
  ) {
    throw new Error(
      `Not a valid save file: corporation ${corpId} has proprietary positions on a retail bank charter`,
    );
  }
}

function compactResolvedNpcBallots(world: WorldState): void {
  const compactSingleChoice = (records: unknown[]): void => {
    for (const record of records) {
      if (!isRecord(record) || record["status"] !== "completed" || !isRecord(record["votes"])) continue;
      const playerVote = record["votes"]["player"];
      record["votes"] = typeof playerVote === "string" ? { player: playerVote } : {};
    }
  };
  compactSingleChoice(world.statePartyElections);
  compactSingleChoice(world.nationalPartyElections);
  for (const record of world.nationalCommitteeElections) {
    if (!isRecord(record) || record["status"] !== "completed" || !isRecord(record["votes"])) continue;
    const playerVote = record["votes"]["player"];
    record["votes"] = Array.isArray(playerVote) && playerVote.every((candidate) => typeof candidate === "string")
      ? { player: playerVote }
      : {};
  }
}

function validateCommandEconomySave(world: WorldState): void {
  const raw = (world as unknown as Record<string, unknown>)["commandEconomy"];
  if (raw === undefined) return;
  if (!isRecord(raw)) throw new Error("Not a valid save file: commandEconomy must be a country map");

  const currentTurn = world.meta.turn;
  for (const [countryId, value] of Object.entries(raw)) {
    if (!world.countries[countryId] || !isRecord(value) || value["countryId"] !== countryId) {
      throw new Error(`Not a valid save file: command-economy country identity does not match ${countryId}`);
    }
    const validSoeSectors = new Set<string>(Object.values(world.corporations)
      .filter((corporation) => corporation.countryId === countryId && corporation.soe)
      .map((corporation) => corporation.soe!.sector));
    for (const key of ["creditAggressiveness", "budgetSoftness"] as const) {
      const posture = value[key];
      if (posture !== undefined && (typeof posture !== "number" || !Number.isFinite(posture) || posture < 0 || posture > 1)) {
        throw new Error(`Not a valid save file: command-economy ${key} for ${countryId} must be finite in [0,1]`);
      }
    }
    const validateSectorMap = (sectorMap: unknown, key: string, allowNull: boolean) => {
      if (sectorMap === null && allowNull) return;
      if (!isRecord(sectorMap)) throw new Error(`Not a valid save file: ${countryId} ${key} must be a sector map`);
      for (const [sector, weight] of Object.entries(sectorMap)) {
        if (!validSoeSectors.has(sector) || typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1_000_000) {
          throw new Error(`Not a valid save file: ${countryId} ${key}.${sector} must be a known sector with a finite weight in [0,1000000]`);
        }
      }
    };
    if (value["sectorCredit"] !== undefined) validateSectorMap(value["sectorCredit"], "sectorCredit", false);
    if (value["directedCreditBySector"] !== undefined) {
      const readout = value["directedCreditBySector"];
      if (!isRecord(readout)) throw new Error(`Not a valid save file: ${countryId} directedCreditBySector must be a sector map`);
      for (const [sector, amount] of Object.entries(readout)) {
        if (!validSoeSectors.has(sector) || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
          throw new Error(`Not a valid save file: ${countryId} directedCreditBySector.${sector} must be a known sector with finite non-negative credit`);
        }
      }
    }

    const pending = value["pendingDirectives"];
    if (pending === undefined) continue; // Older saves predate player directives.
    if (!Array.isArray(pending)) throw new Error(`Not a valid save file: ${countryId} pendingDirectives must be an array`);
    const ids = new Set<string>();
    for (const directive of pending) {
      if (!isRecord(directive)) throw new Error(`Not a valid save file: ${countryId} contains an invalid Gosbank directive`);
      const id = directive["id"];
      if (typeof id !== "string" || id.trim().length === 0 || ids.has(id)) {
        throw new Error(`Not a valid save file: ${countryId} Gosbank directive IDs must be non-empty and unique`);
      }
      ids.add(id);
      if (directive["countryId"] !== countryId) {
        throw new Error(`Not a valid save file: directive countryId must match ${countryId}`);
      }
      const proposedTurn = directive["proposedTurn"];
      const effectiveTurn = directive["effectiveTurn"];
      if (
        !Number.isInteger(proposedTurn) || proposedTurn !== currentTurn ||
        !Number.isInteger(effectiveTurn) || effectiveTurn !== (proposedTurn as number) + 1
      ) {
        throw new Error(`Not a valid save file: directive effectiveTurn must be the next turn after the current turn for ${countryId}`);
      }
      if (!id.startsWith(`gosbank-${countryId}-${String(proposedTurn)}-`)) {
        throw new Error(`Not a valid save file: Gosbank directive ID must match its country and proposal turn for ${countryId}`);
      }
      const hasCredit = directive["creditAggressiveness"] !== undefined;
      const hasSoftness = directive["budgetSoftness"] !== undefined;
      const hasSectorCredit = directive["sectorCredit"] !== undefined;
      if (!hasCredit && !hasSoftness && !hasSectorCredit) {
        throw new Error(`Not a valid save file: Gosbank directive for ${countryId} must set a posture or sector-credit weights`);
      }
      if (hasSectorCredit) validateSectorMap(directive["sectorCredit"], "pending sectorCredit", true);
      for (const key of ["creditAggressiveness", "budgetSoftness"] as const) {
        const posture = directive[key];
        if (posture !== undefined && (typeof posture !== "number" || !Number.isFinite(posture) || posture < 0 || posture > 1)) {
          throw new Error(`Not a valid save file: directive ${key} for ${countryId} must be finite in [0,1]`);
        }
      }
    }
  }
}

/** Upgrade old planned-economy saves from their recorded corporation revenue, never invented capacity. */
function backfillSourceSeededSoeState(world: WorldState): void {
  for (const corporation of Object.values(world.corporations)) {
    const commandState = world.commandEconomy[corporation.countryId];
    if (corporation.soe || !commandState || commandState.marketizationLevel >= 70) continue;
    corporation.legacySoeProjection = {
      ...(corporation.countryOwnerId === undefined ? {} : { countryOwnerId: corporation.countryOwnerId }),
      ...(corporation.ownershipState === undefined ? {} : { ownershipState: corporation.ownershipState }),
    };
    corporation.countryOwnerId = corporation.countryId;
    corporation.ownershipState = "stateOwned";
    corporation.soe = makeSeedSoeState(corporation.sectorType, corporation.revenue);
  }
}

function validateSoeSave(world: WorldState): void {
  for (const corporation of Object.values(world.corporations)) {
    const soe = corporation.soe;
    const provenance = corporation.legacySoeProjection;
    if (provenance !== undefined && (!soe || !isRecord(provenance) ||
        Object.keys(provenance).some(key => key !== "countryOwnerId" && key !== "ownershipState") ||
        (provenance.countryOwnerId !== undefined && typeof provenance.countryOwnerId !== "string") ||
        (provenance.ownershipState !== undefined && provenance.ownershipState !== "private" && provenance.ownershipState !== "stateOwned"))) {
      throw new Error(`Not a valid save file: ${corporation.id} has invalid legacy SOE provenance`);
    }
    if (!soe) continue;
    if (soe.sector !== corporation.sectorType || corporation.ownershipState !== "stateOwned" || corporation.countryOwnerId !== corporation.countryId) {
      throw new Error(`Not a valid save file: ${corporation.id} SOE identity/ownership does not match its corporation`);
    }
    for (const key of ["capacity", "output", "planTarget", "efficiency", "cumulativeLosses"] as const) {
      if (!Number.isFinite(soe[key]) || soe[key] < 0) {
        throw new Error(`Not a valid save file: ${corporation.id} SOE ${key} must be finite and non-negative`);
      }
    }
    if (soe.directorId !== null && typeof soe.directorId !== "string") {
      throw new Error(`Not a valid save file: ${corporation.id} SOE directorId must be a character ID or null`);
    }
  }
}

function validatePresidentialPrimaryLedger(world: WorldState): void {
  for (const rawRace of world.elections as unknown[]) {
    if (!isRecord(rawRace)) continue;
    const race = rawRace;
    const hasLedger = [
      "primaryStateVotes", "primaryDelegates", "primaryDelegatesByState",
      "primaryAllocationByState", "primaryWaveHistory", "primaryStaggerWavesRun",
      "primaryRulesetVersion", "primaryConventionResults",
      "primaryCampaignState", "primaryCampaignTicks", "primarySurgeUsed", "primarySurgeBoost",
    ].some((key) => race[key] !== undefined) ||
      (Array.isArray(race["candidates"]) && race["candidates"].some((candidate) =>
        isRecord(candidate) && ["primaryCampaignState", "primaryCampaignTicks", "primarySurgeUsed", "primarySurgeBoost"]
          .some((key) => candidate[key] !== undefined),
      ));
    if (!hasLedger) continue;
    if (race["countryId"] !== "US" || race["electionType"] !== "president") {
      throw new Error("Not a valid save file: presidential primary ledger belongs only to a US presidential race");
    }
    const version = race["primaryRulesetVersion"];
    if (version !== undefined && (!Number.isSafeInteger(version) || (version as number) < 1)) {
      throw new Error("Not a valid save file: invalid presidential primary ruleset version");
    }
    if (Array.isArray(race["candidates"])) {
      for (const rawCandidate of race["candidates"]) {
        if (!isRecord(rawCandidate)) continue;
        const stateId = rawCandidate["primaryCampaignState"];
        const ticks = rawCandidate["primaryCampaignTicks"];
        const surgeUsed = rawCandidate["primarySurgeUsed"];
        const surgeBoost = rawCandidate["primarySurgeBoost"];
        if (
          (stateId !== undefined && (race["countryId"] !== "US" || race["electionType"] !== "president" ||
            typeof stateId !== "string" || world.regions[stateId]?.countryId !== "US")) ||
          (ticks !== undefined && (!Number.isSafeInteger(ticks) || (ticks as number) < 0 || (ticks as number) > 5 ||
            ((ticks as number) > 0 && typeof stateId !== "string"))) ||
          (surgeUsed !== undefined && typeof surgeUsed !== "boolean") ||
          (surgeBoost !== undefined && (typeof surgeBoost !== "number" || !Number.isFinite(surgeBoost) || surgeBoost < 0 || surgeBoost > 100))
        ) {
          throw new Error("Not a valid save file: invalid presidential primary candidate campaign state");
        }
      }
    }
    const stretchedOffsets = [40, 32, 24, 16, 8, 0];
    const history = race["primaryWaveHistory"];
    if (history !== undefined) {
      if (!Array.isArray(history) || history.length > PRIMARY_WAVES.length) {
        throw new Error("Not a valid save file: invalid presidential primary wave history");
      }
      for (let index = 0; index < history.length; index += 1) {
        const entry = history[index];
        const sourceWave = PRIMARY_WAVES[index];
        const turnsRemaining = ((version as number | undefined) ?? 1) >= 3
          ? stretchedOffsets[index]
          : sourceWave?.turnsRemaining;
        if (
          !isRecord(entry) || !sourceWave || entry["wave"] !== index ||
          entry["turnsRemaining"] !== turnsRemaining ||
          !Number.isSafeInteger(entry["turn"]) || (entry["turn"] as number) < 0 ||
          (entry["turn"] as number) > world.meta.turn ||
          (index > 0 && (entry["turn"] as number) < ((history[index - 1] as Record<string, unknown>)["turn"] as number)) ||
          !Array.isArray(entry["statesVoted"]) ||
          JSON.stringify(entry["statesVoted"]) !== JSON.stringify(sourceWave.states)
        ) {
          throw new Error("Not a valid save file: invalid presidential primary wave history entry");
        }
      }
      const wavesRun = race["primaryStaggerWavesRun"];
      if (wavesRun !== undefined && (!Number.isSafeInteger(wavesRun) || wavesRun !== history.length)) {
        throw new Error("Not a valid save file: presidential primary wave count disagrees with its history");
      }
    }
    const validateNumberTree = (value: unknown, label: string, depth: number): void => {
      if (depth === 0 || !isRecord(value)) throw new Error(`Not a valid save file: invalid presidential primary ${label}`);
      for (const [key, child] of Object.entries(value)) {
        if (!key.trim()) throw new Error(`Not a valid save file: invalid presidential primary ${label} key`);
        if (typeof child === "number") {
          if (!Number.isSafeInteger(child) || child < 0) throw new Error(`Not a valid save file: invalid presidential primary ${label} value`);
        } else {
          validateNumberTree(child, label, depth - 1);
        }
      }
    };
    for (const key of ["primaryStateVotes", "primaryDelegates", "primaryDelegatesByState"] as const) {
      if (race[key] !== undefined) validateNumberTree(race[key], key, key === "primaryDelegates" ? 2 : 3);
    }
    const knownCandidates = new Set(
      Array.isArray(race["candidates"])
        ? race["candidates"].flatMap((candidate) =>
            isRecord(candidate) && typeof candidate["id"] === "string" ? [candidate["id"]] : [],
          )
        : [],
    );
    for (const key of ["primaryStateVotes", "primaryDelegates", "primaryDelegatesByState"] as const) {
      const tree = race[key];
      if (!isRecord(tree)) continue;
      for (const [partyId, branch] of Object.entries(tree)) {
        if (!world.parties[partyId] || !isRecord(branch)) {
          throw new Error(`Not a valid save file: presidential primary ${key} references an unknown party`);
        }
        for (const [stateOrCandidateId, values] of Object.entries(branch)) {
          if (key === "primaryDelegates" && !knownCandidates.has(stateOrCandidateId)) {
            throw new Error("Not a valid save file: presidential primary delegates reference an unknown candidate");
          }
          if (key !== "primaryDelegates" && !world.regions[stateOrCandidateId]) {
            throw new Error(`Not a valid save file: presidential primary ${key} references an unknown state`);
          }
          if (key === "primaryDelegates") continue;
          if (!isRecord(values)) continue;
          for (const candidateId of Object.keys(values)) {
            if (!knownCandidates.has(candidateId)) {
              throw new Error(`Not a valid save file: presidential primary ${key} references an unknown candidate`);
            }
          }
        }
      }
    }
    const allocation = race["primaryAllocationByState"];
    if (allocation !== undefined) {
      if (!isRecord(allocation)) throw new Error("Not a valid save file: invalid presidential primary allocations");
      for (const byState of Object.values(allocation)) {
        if (!isRecord(byState) || Object.values(byState).some((method) => method !== "PR" && method !== "WTA")) {
          throw new Error("Not a valid save file: invalid presidential primary allocation method");
        }
      }
      for (const [partyId, byState] of Object.entries(allocation)) {
        if (!world.parties[partyId]) throw new Error("Not a valid save file: presidential primary allocation references an unknown party");
        if (!isRecord(byState)) continue;
        for (const stateId of Object.keys(byState)) {
          if (!world.regions[stateId]) throw new Error("Not a valid save file: presidential primary allocation references an unknown state");
        }
      }
    }
    const wavesRun = race["primaryStaggerWavesRun"];
    if (wavesRun !== undefined && (!Number.isSafeInteger(wavesRun) || (wavesRun as number) < 0 || (wavesRun as number) > PRIMARY_WAVES.length)) {
      throw new Error("Not a valid save file: invalid presidential primary wave count");
    }
    const conventions = race["primaryConventionResults"];
    if (conventions !== undefined) {
      if (!isRecord(conventions)) throw new Error("Not a valid save file: invalid presidential primary convention results");
      for (const [partyId, result] of Object.entries(conventions)) {
        if (!partyId.trim() || !isRecord(result) ||
            (result["mode"] !== "delegate_majority" && result["mode"] !== "convention") ||
            typeof result["winnerCandidateId"] !== "string" || !result["winnerCandidateId"].trim() ||
            typeof result["firstBallotLeaderId"] !== "string" || !result["firstBallotLeaderId"].trim() ||
            !Number.isSafeInteger(result["majorityThreshold"]) || (result["majorityThreshold"] as number) <= 0 ||
            typeof result["resolvedAt"] !== "string" || !Number.isFinite(Date.parse(result["resolvedAt"]))) {
          throw new Error("Not a valid save file: invalid presidential primary convention result");
        }
      }
    }
  }
}

function validatePresidentialGeneralMechanics(world: WorldState): void {
  for (const rawRace of world.elections as unknown[]) {
    if (!isRecord(rawRace)) continue;
    const version = rawRace["presidentialRulesetVersion"];
    const endorsements = rawRace["governorEndorsements"];
    if (version !== undefined && (rawRace["countryId"] !== "US" || rawRace["electionType"] !== "president" ||
      !Number.isSafeInteger(version) || (version as number) < 1)) {
      throw new Error("Not a valid save file: invalid presidential general ruleset stamp");
    }
    if (endorsements === undefined) continue;
    if (rawRace["countryId"] !== "US" || rawRace["electionType"] !== "president" || !Array.isArray(endorsements)) {
      throw new Error("Not a valid save file: governor endorsement ledger belongs only to a US presidential race");
    }
    const ids = new Set<string>();
    const activeGovernorStates = new Set<string>();
    for (const row of endorsements) {
      if (!isRecord(row) || typeof row["id"] !== "string" || row["id"].length === 0 || ids.has(row["id"]) ||
        typeof row["stateId"] !== "string" || world.regions[row["stateId"]]?.countryId !== "US" ||
        typeof row["candidateId"] !== "string" || typeof row["endorsedById"] !== "string" ||
        !Number.isSafeInteger(row["createdAtTurn"]) || (row["createdAtTurn"] as number) < 0 ||
        (row["isActive"] !== true && row["isActive"] !== false) ||
        (row["withdrawnAtTurn"] !== undefined && (!Number.isSafeInteger(row["withdrawnAtTurn"]) ||
          (row["withdrawnAtTurn"] as number) < (row["createdAtTurn"] as number))) ||
        (row["withdrawnReason"] !== undefined && !["manual", "election_ended", "candidate_inactive", "governor_left_office"].includes(String(row["withdrawnReason"])))) {
        throw new Error("Not a valid save file: invalid presidential governor endorsement");
      }
      if (row["isActive"] === true && activeGovernorStates.has(row["stateId"] as string)) {
        throw new Error("Not a valid save file: multiple active governor endorsements for one state and race");
      }
      ids.add(row["id"] as string);
      if (row["isActive"] === true) activeGovernorStates.add(row["stateId"] as string);
    }
  }
}

function validatePrStvElectionState(world: WorldState): void {
  for (const rawRace of world.elections as unknown[]) {
    if (!isRecord(rawRace)) continue;
    const race = rawRace;
    const hasPrStvState = ["countingMethod", "rankedBallots", "rankedPreferenceModel", "prStvResult", "resolutionPath"]
      .some((key) => race[key] !== undefined && (key !== "resolutionPath" || race[key] === "pr_stv"));
    if (!hasPrStvState) continue;
    if (race["countingMethod"] !== "pr_stv" || race["countryId"] !== "IE" ||
      !["dail", "localCouncil"].includes(String(race["electionType"]))) {
      throw new Error("Not a valid save file: ranked PR-STV state belongs only to an opted-in Irish Dail or local council race");
    }
    if (race["rankedPreferenceModel"] !== "same_party_then_policy_distance_v1" || !Array.isArray(race["rankedBallots"])) {
      throw new Error("Not a valid save file: invalid ranked PR-STV ballot grammar");
    }
    const tally = race["tally"];
    const candidates = race["candidates"];
    if (!isRecord(tally) || !Array.isArray(candidates)) {
      throw new Error("Not a valid save file: ranked PR-STV election is missing its tally or candidates");
    }
    try {
      validateRankedBallots(race["rankedBallots"], tally as Record<string, number>);
    } catch (error) {
      throw new Error(`Not a valid save file: invalid ranked PR-STV ballots (${error instanceof Error ? error.message : "invalid evidence"})`);
    }
    if (race["conversionTerms"] !== undefined) {
      throw new Error("Not a valid save file: ranked PR-STV cannot carry conversion terms or reserved seat floors");
    }
    const result = race["prStvResult"];
    if (race["status"] === "resolved") {
      if (!isRecord(result) || race["resolutionPath"] !== "pr_stv") {
        throw new Error("Not a valid save file: resolved ranked PR-STV election is missing its count receipt");
      }
      const activeIds = candidates.flatMap((candidate) =>
        isRecord(candidate) && candidate["status"] !== "withdrawn" && typeof candidate["id"] === "string"
          ? [candidate["id"]]
          : [],
      );
      let expected;
      try {
        expected = countPrStv(activeIds, race["totalSeats"] as number, race["rankedBallots"]);
      } catch (error) {
        throw new Error(`Not a valid save file: ranked PR-STV count cannot be reproduced (${error instanceof Error ? error.message : "invalid result"})`);
      }
      if (JSON.stringify(result) !== JSON.stringify(expected)) {
        throw new Error("Not a valid save file: ranked PR-STV count receipt does not match the stored ballots");
      }
    } else if (result !== undefined || race["resolutionPath"] === "pr_stv") {
      throw new Error("Not a valid save file: unresolved ranked PR-STV election carries a completed count receipt");
    }
  }
}

function validatePrimaryStateOrganizations(world: WorldState): void {
  const validateOwner = (
    ownerId: string,
    ownerCountryId: string,
    raw: unknown,
  ): void => {
    if (raw === undefined) return;
    if (ownerCountryId !== "US" || !isRecord(raw)) {
      throw new Error(`Not a valid save file: ${ownerId} has invalid primary state organizations`);
    }
    for (const [stateId, value] of Object.entries(raw)) {
      if (
        !world.regions[stateId] ||
        world.regions[stateId]!.countryId !== "US" ||
        !isRecord(value) ||
        !Number.isSafeInteger(value["level"]) || (value["level"] as number) < 1 ||
        !Number.isFinite(value["totalInvested"]) || (value["totalInvested"] as number) < 0 ||
        !Number.isSafeInteger(value["updatedAtTurn"]) || (value["updatedAtTurn"] as number) < 0 || (value["updatedAtTurn"] as number) > world.meta.turn ||
        !Number.isSafeInteger(value["lastBuildTurn"]) || (value["lastBuildTurn"] as number) < 0 ||
        (value["lastBuildTurn"] as number) > (value["updatedAtTurn"] as number) ||
        !Number.isFinite(value["lastBuildFunds"]) || (value["lastBuildFunds"] as number) < 0
      ) {
        throw new Error(`Not a valid save file: ${ownerId} has invalid primary state organization for ${stateId}`);
      }
    }
  };
  validateOwner("player", world.player.countryId, world.player.primaryStateOrganizations);
}

export function deserializeSave(raw: string): WorldState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Not a valid save file: unparseable JSON");
  }
  if (
    typeof parsed !== "object" || parsed === null ||
    (parsed as SaveFile).format !== "ahdsolo-save"
  ) {
    throw new Error("Not a valid save file: wrong format marker");
  }
  const save = parsed as SaveFile;
  if (!Number.isInteger(save.schemaVersion) || save.schemaVersion < 1) {
    throw new Error("Not a valid save file: invalid schema version");
  }
  assertSaveWorldRoot(save.world);
  if (save.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Save is from a newer version (schema ${save.schemaVersion} > ${SCHEMA_VERSION}); update the game to load it`,
    );
  }
  // v1 -> v2: add outputGap to each country economy
  if (save.schemaVersion < 2) {
    for (const country of Object.values((save.world as WorldState).countries)) {
      const econ = country.economy as unknown as Record<string, unknown>;
      if (!Number.isFinite(econ["outputGap"] as number)) {
        econ["outputGap"] = 0;
      }
    }
    save.world.meta.schemaVersion = 2;
  }
  // v2 -> v3: add parties and legislatures (empty for old saves)
  if (save.schemaVersion < 3) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["parties"] !== "object" || w["parties"] === null || Array.isArray(w["parties"])) {
      w["parties"] = {};
    }
    if (typeof w["legislatures"] !== "object" || w["legislatures"] === null || Array.isArray(w["legislatures"])) {
      w["legislatures"] = {};
    }
    save.world.meta.schemaVersion = 3;
  }
  // v3 -> v4: add politicians (empty for old saves)
  if (save.schemaVersion < 4) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["politicians"])) {
      w["politicians"] = [];
    }
    save.world.meta.schemaVersion = 4;
  }
  // v4 -> v5: add cheatsUsed flag (false for old saves)
  if (save.schemaVersion < 5) {
    const w = save.world as unknown as Record<string, unknown>;
    const meta = w["meta"] as Record<string, unknown> | undefined;
    if (meta && typeof meta["cheatsUsed"] !== "boolean") {
      meta["cheatsUsed"] = false;
    }
    save.world.meta.schemaVersion = 5;
  }
  // v5 -> v6: party organization cluster (treasury, PS, org, tier, memberCount, charters, caucuses, politician influence)
  if (save.schemaVersion < 6) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["charters"])) w["charters"] = [];
    if (!Array.isArray(w["caucuses"])) w["caucuses"] = [];
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    if (parties && typeof parties === "object") {
      for (const p of Object.values(parties)) {
        if (typeof p["treasury"] !== "number") p["treasury"] = 1_000_000;
        if (typeof p["politicalStrength"] !== "number") p["politicalStrength"] = 0;
        if (typeof p["organization"] !== "number") p["organization"] = 0;
        if (p["tier"] !== "major" && p["tier"] !== "minor") p["tier"] = "minor";
        if (!Array.isArray(p["psCapEarnedRegions"])) p["psCapEarnedRegions"] = [];
        if (typeof p["memberCount"] !== "number") p["memberCount"] = 0;
        if (typeof p["isDefault"] !== "boolean") p["isDefault"] = true;
      }
    }
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(politicians)) {
      for (const pol of politicians) {
        if (typeof pol["partyInfluence"] !== "number") pol["partyInfluence"] = 0;
        if (typeof pol["bonusActions"] !== "number") pol["bonusActions"] = 0;
      }
    }
    save.world.meta.schemaVersion = 6;
  }
  // v6 -> v7: commodity prices and extraction contracts (seed with era-neutral defaults)
  if (save.schemaVersion < 7) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["commodityPrices"] !== "object" || w["commodityPrices"] === null || Array.isArray(w["commodityPrices"])) {
      const fallback: Record<string, unknown> = {};
      // Use modern base prices as fallback basePrice where era unknown (scale 1).
      // WorldState era is available for a better seed but content import would
      // be circular here; keep the migration deterministic and era-agnostic.
      const modernBase: Record<string, number> = {
        steel: 800, electronics: 500, energy: 60, chemicals: 220, pharmaceuticals: 1200,
        fertilizers: 180, food: 200, building_materials: 400, construction_services: 3500,
        healthcare_services: 2500, real_estate_services: 2200, software: 1000,
        financial_services: 2000, advertising: 150, vehicles: 25000, retail: 150,
        freight: 3000, consulting_services: 5000, iron: 120, coal: 150, oil: 80,
        rare_earth: 21000, timber: 400, natural_gas: 25, ordnance: 4500, plastics: 1000,
        network_services: 1200, entertainment_services: 600,
      };
      for (const [k, v] of Object.entries(modernBase)) {
        fallback[k] = { commodity: k, basePrice: v, globalPrice: v, globalSupply: 0, globalDemand: 0, turn: (w["meta"] as Record<string, unknown>)?.["turn"] ?? 0 };
      }
      w["commodityPrices"] = fallback;
    }
    if (!Array.isArray(w["extractionContracts"])) w["extractionContracts"] = [];
    save.world.meta.schemaVersion = 7;
  }
  // v7 -> v8: W19 support/electorate cluster (opaque regions per playable country)
  if (save.schemaVersion < 8) {
    const w = save.world as unknown as Record<string, unknown>;
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    // Build regions deterministically from parties' countryIds (playable set implied)
    const playableCountries = new Set<string>();
    if (parties) for (const p of Object.values(parties)) if (typeof p["countryId"] === "string") playableCountries.add(p["countryId"] as string);
    const regions: Record<string, unknown> = {};
    const electoratePools: Record<string, unknown> = {};
    const regionTurnouts: Record<string, unknown> = {};
    const partyRegions: Record<string, unknown> = {};
    const partyPressures: Record<string, unknown> = {};
    const candidateSupports: Record<string, unknown> = {};

    if (typeof w["regions"] !== "object" || w["regions"] === null || Array.isArray(w["regions"])) w["regions"] = regions;
    else Object.assign(regions, w["regions"] as Record<string, unknown>);
    if (typeof w["electoratePools"] !== "object" || w["electoratePools"] === null || Array.isArray(w["electoratePools"])) w["electoratePools"] = electoratePools;
    else Object.assign(electoratePools, w["electoratePools"] as Record<string, unknown>);
    if (typeof w["regionTurnouts"] !== "object" || w["regionTurnouts"] === null || Array.isArray(w["regionTurnouts"])) w["regionTurnouts"] = regionTurnouts;
    else Object.assign(regionTurnouts, w["regionTurnouts"] as Record<string, unknown>);
    if (typeof w["partyRegions"] !== "object" || w["partyRegions"] === null || Array.isArray(w["partyRegions"])) w["partyRegions"] = partyRegions;
    else Object.assign(partyRegions, w["partyRegions"] as Record<string, unknown>);
    if (typeof w["partyPressures"] !== "object" || w["partyPressures"] === null || Array.isArray(w["partyPressures"])) w["partyPressures"] = partyPressures;
    else Object.assign(partyPressures, w["partyPressures"] as Record<string, unknown>);
    if (typeof w["candidateSupports"] !== "object" || w["candidateSupports"] === null || Array.isArray(w["candidateSupports"])) w["candidateSupports"] = candidateSupports;
    else Object.assign(candidateSupports, w["candidateSupports"] as Record<string, unknown>);

    // If regions empty, seed 3 opaque per country as in world.ts seedW19Support
    const existingRegionCount = Object.keys(regions).length;
    if (existingRegionCount === 0 && playableCountries.size > 0) {
      for (const countryId of playableCountries) {
        for (let i = 1; i <= 3; i++) {
          const rid = `${countryId}-R${i}`;
          if (!regions[rid]) regions[rid] = { id: rid, countryId, name: `${countryId} Region ${i}` };
          if (!electoratePools[rid]) {
            const isSouth = countryId === "US" && rid.endsWith("-R2");
            electoratePools[rid] = {
              regionId: rid,
              countryId,
              independent: countryId === "RU" ? 3 : countryId === "DD" ? 5 : isSouth ? 3 : 8,
              unregistered: countryId === "RU" ? 2 : countryId === "DD" ? 3 : isSouth ? 22 : 7,
            };
          }
          if (!regionTurnouts[rid]) {
            const groups: string[] =
              countryId === "US" ? ["urban_progressives", "rural_conservatives", "suburban_moderates"]
              : countryId === "UK" ? ["urban_progressives", "rural_traditionalists", "suburban_centrists"]
              : countryId === "RU" ? ["workers", "urban_progressives"]
              : countryId === "DD" ? ["workers", "bloc_centrists"]
              : ["general"];
            const mods: Record<string, number> = {};
            for (const g of groups) mods[g] = 0;
            regionTurnouts[rid] = { regionId: rid, countryId, modifiers: { voterGroups: mods }, lastDecayAppliedTurn: 0 };
          }
        }
      }
      if (parties) {
        for (const [partyId, party] of Object.entries(parties)) {
          const countryId = party["countryId"] as string | undefined;
          if (!countryId) continue;
          for (let i = 1; i <= 3; i++) {
            const rid = `${countryId}-R${i}`;
            const key = `${rid}:${partyId}`;
            if (partyRegions[key]) continue;
            let org = 10, reg = 10;
            if (countryId === "US") {
              if (partyId === "US_DEM") org = rid.endsWith("-R1") ? 34 : rid.endsWith("-R2") ? 38 : 24, reg = rid.endsWith("-R1") ? 50 : rid.endsWith("-R2") ? 66 : 35;
              else if (partyId === "US_REP") org = rid.endsWith("-R1") ? 24 : rid.endsWith("-R2") ? 8 : 34, reg = rid.endsWith("-R1") ? 35 : rid.endsWith("-R2") ? 6 : 50;
            } else if (countryId === "UK") {
              if (partyId === "UK_LAB") org = rid.endsWith("-R1") ? 32 : rid.endsWith("-R2") ? 24 : 28, reg = rid.endsWith("-R1") ? 38 : rid.endsWith("-R2") ? 30 : 34;
              else if (partyId === "UK_CON") org = rid.endsWith("-R1") ? 28 : rid.endsWith("-R2") ? 36 : 30, reg = rid.endsWith("-R1") ? 34 : rid.endsWith("-R2") ? 42 : 36;
              else if (partyId === "UK_LIB") org = 8, reg = 5;
              else org = 2, reg = 1;
            } else if (countryId === "RU") org = partyId === "RU_CPSU" ? 96 : 0, reg = partyId === "RU_CPSU" ? 92 : 0;
            else if (countryId === "DD") {
              if (partyId === "DD_SED") org = 82, reg = 78;
              else if (partyId === "DD_CDU") org = 22, reg = 18;
              else if (partyId === "DD_LDPD") org = 18, reg = 15;
              else if (partyId === "DD_NDPD") org = 18, reg = 15;
              else if (partyId === "DD_DBD") org = 20, reg = 16;
            }
            partyRegions[key] = { regionId: rid, partyId, countryId, organization: org, registration: reg };
            const pkey = `${partyId}:${rid}`;
            if (!partyPressures[pkey]) partyPressures[pkey] = { partyId, regionId: rid, countryId, value: 0 };
          }
        }
      }
      if (politicians && Array.isArray(politicians)) {
        for (const pol of politicians) {
          const id = pol["id"] as string | undefined;
          const partyId = pol["partyId"] as string | undefined;
          const countryId = pol["countryId"] as string | undefined;
          if (!id || !partyId || !countryId) continue;
          if (!candidateSupports[id]) candidateSupports[id] = { id, partyId, countryId, support: 50, supportAccrual: [], status: "active" };
        }
      }
    }
    // Ensure priorityRegion field exists (optional) - no migration needed, leave undefined

    w["regions"] = regions;
    w["electoratePools"] = electoratePools;
    w["regionTurnouts"] = regionTurnouts;
    w["partyRegions"] = partyRegions;
    w["partyPressures"] = partyPressures;
    w["candidateSupports"] = candidateSupports;
    save.world.meta.schemaVersion = 8;
  }
  // v8 -> v9: W34 action economy (actions, funds, donorBase, influence, favorability, infamy, cooldowns)
  if (save.schemaVersion < 9) {
    const w = save.world as unknown as Record<string, unknown>;
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(politicians)) {
      for (const pol of politicians) {
        if (typeof pol["actions"] !== "number") pol["actions"] = 25;
        if (typeof pol["funds"] !== "number") pol["funds"] = 0;
        if (typeof pol["donorBaseLevel"] !== "number") pol["donorBaseLevel"] = 0;
        if (typeof pol["politicalInfluence"] !== "number") pol["politicalInfluence"] = 0;
        if (typeof pol["favorability"] !== "number") pol["favorability"] = 50;
        if (typeof pol["infamy"] !== "number") pol["infamy"] = 0;
        if (typeof pol["actionCooldowns"] !== "object" || pol["actionCooldowns"] === null || Array.isArray(pol["actionCooldowns"])) pol["actionCooldowns"] = {};
      }
    }
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player === "object") {
      if (typeof player["actions"] !== "number") player["actions"] = 25;
      if (typeof player["funds"] !== "number") player["funds"] = 0;
      if (typeof player["donorBaseLevel"] !== "number") player["donorBaseLevel"] = 0;
      if (typeof player["politicalInfluence"] !== "number") player["politicalInfluence"] = 0;
      if (typeof player["favorability"] !== "number") player["favorability"] = 50;
      if (typeof player["infamy"] !== "number") player["infamy"] = 0;
      if (typeof player["actionCooldowns"] !== "object" || player["actionCooldowns"] === null || Array.isArray(player["actionCooldowns"])) player["actionCooldowns"] = {};
    }
    save.world.meta.schemaVersion = 9;
  }
  // v9 -> v10: W38 US states - replace US opaque US-R1..R3 with 48 real states.
  // UK/RU/DD retain opaque until W39 per docs/support/W19_BRIDGE.md.
  // Bridge decision: mainline has no explicit opaque-to-state mapping, so we use
  // a deterministic population-weighted split. Pooled org/reg from the 3 opaque US
  // regions (averaged) is assigned uniformly to all 48 new states (population
  // weighting yields the same uniform result for percentage metrics; totals are
  // preserved proportionally via population weight; see world.ts seedSupport).
  // This is deterministic (sorted state tables, no RNG) and preserves aggregate
  // support investment. PriorityRegion ids referencing US-Rx are dropped (no table).
  // Turnout modifiers are neutral 0, so copy is safe. UK/RU/DD untouched.
  if (save.schemaVersion < 10) {
    const w = save.world as unknown as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    const partyRegions = w["partyRegions"] as Record<string, Record<string, unknown>> | undefined;
    const electoratePools = w["electoratePools"] as Record<string, Record<string, unknown>> | undefined;
    const regionTurnouts = w["regionTurnouts"] as Record<string, Record<string, unknown>> | undefined;
    const partyPressures = w["partyPressures"] as Record<string, Record<string, unknown>> | undefined;
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;

    // Detect opaque US regions
    const opaqueUsIds = ["US-R1", "US-R2", "US-R3"];
    const hasOpaqueUs = regions ? opaqueUsIds.some((id) => id in regions) : false;

    if (hasOpaqueUs && regions && partyRegions && electoratePools && regionTurnouts && partyPressures) {
      // Import state list for population weighting and region seeding
      // Inline minimal US states metadata (id, name, population) to avoid circular import
      // Source: packages/content/src/packs/usStates1953.ts - sorted for determinism
      const US_STATES_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
        { id: "AL", name: "Alabama", population: 3061743, houseSeats: 9, senateSeats: 35, senateClasses: [2, 3], region: "Southeast", gdp: 4500 },
        { id: "AR", name: "Arkansas", population: 1909511, houseSeats: 6, senateSeats: 35, senateClasses: [2, 3], region: "Southeast", gdp: 2300 },
        { id: "AZ", name: "Arizona", population: 749587, houseSeats: 2, senateSeats: 30, senateClasses: [1, 3], region: "Southwest", gdp: 1700 },
        { id: "CA", name: "California", population: 10586223, houseSeats: 30, senateSeats: 40, senateClasses: [1, 3], region: "West", gdp: 38000 },
        { id: "CO", name: "Colorado", population: 1325089, houseSeats: 4, senateSeats: 35, senateClasses: [2, 3], region: "West", gdp: 3200 },
        { id: "CT", name: "Connecticut", population: 2007280, houseSeats: 6, senateSeats: 36, senateClasses: [1, 3], region: "Northeast", gdp: 6500 },
        { id: "DE", name: "Delaware", population: 318085, houseSeats: 1, senateSeats: 21, senateClasses: [1, 2], region: "Northeast", gdp: 1000 },
        { id: "FL", name: "Florida", population: 2771305, houseSeats: 8, senateSeats: 40, senateClasses: [1, 3], region: "Southeast", gdp: 4500 },
        { id: "GA", name: "Georgia", population: 3444578, houseSeats: 10, senateSeats: 56, senateClasses: [2, 3], region: "Southeast", gdp: 5500 },
        { id: "IA", name: "Iowa", population: 2621073, houseSeats: 8, senateSeats: 50, senateClasses: [2, 3], region: "Midwest", gdp: 5500 },
        { id: "ID", name: "Idaho", population: 588637, houseSeats: 2, senateSeats: 35, senateClasses: [2, 3], region: "West", gdp: 1300 },
        { id: "IL", name: "Illinois", population: 8712176, houseSeats: 25, senateSeats: 59, senateClasses: [2, 3], region: "Midwest", gdp: 30000 },
        { id: "IN", name: "Indiana", population: 3934224, houseSeats: 11, senateSeats: 50, senateClasses: [1, 3], region: "Midwest", gdp: 10000 },
        { id: "KS", name: "Kansas", population: 1905299, houseSeats: 6, senateSeats: 40, senateClasses: [2, 3], region: "Midwest", gdp: 4000 },
        { id: "KY", name: "Kentucky", population: 2944806, houseSeats: 8, senateSeats: 38, senateClasses: [2, 3], region: "Southeast", gdp: 4500 },
        { id: "LA", name: "Louisiana", population: 2683516, houseSeats: 8, senateSeats: 39, senateClasses: [2, 3], region: "Southeast", gdp: 5500 },
        { id: "MA", name: "Massachusetts", population: 4690514, houseSeats: 14, senateSeats: 40, senateClasses: [1, 2], region: "Northeast", gdp: 14000 },
        { id: "MD", name: "Maryland", population: 2343001, houseSeats: 7, senateSeats: 47, senateClasses: [1, 3], region: "Northeast", gdp: 6500 },
        { id: "ME", name: "Maine", population: 913774, houseSeats: 3, senateSeats: 35, senateClasses: [1, 2], region: "Northeast", gdp: 1800 },
        { id: "MI", name: "Michigan", population: 6371766, houseSeats: 18, senateSeats: 38, senateClasses: [1, 2], region: "Midwest", gdp: 20000 },
        { id: "MN", name: "Minnesota", population: 2982483, houseSeats: 9, senateSeats: 67, senateClasses: [1, 2], region: "Midwest", gdp: 7500 },
        { id: "MO", name: "Missouri", population: 3954653, houseSeats: 11, senateSeats: 34, senateClasses: [1, 3], region: "Midwest", gdp: 11000 },
        { id: "MS", name: "Mississippi", population: 2178914, houseSeats: 6, senateSeats: 52, senateClasses: [1, 2], region: "Southeast", gdp: 2300 },
        { id: "MT", name: "Montana", population: 591024, houseSeats: 2, senateSeats: 50, senateClasses: [1, 2], region: "West", gdp: 1400 },
        { id: "NC", name: "North Carolina", population: 4061929, houseSeats: 12, senateSeats: 50, senateClasses: [2, 3], region: "Southeast", gdp: 6500 },
        { id: "ND", name: "North Dakota", population: 619636, houseSeats: 2, senateSeats: 47, senateClasses: [1, 3], region: "Midwest", gdp: 1300 },
        { id: "NE", name: "Nebraska", population: 1325510, houseSeats: 4, senateSeats: 49, senateClasses: [1, 2], region: "Midwest", gdp: 3200 },
        { id: "NH", name: "New Hampshire", population: 533242, houseSeats: 2, senateSeats: 24, senateClasses: [2, 3], region: "Northeast", gdp: 1300 },
        { id: "NJ", name: "New Jersey", population: 4835329, houseSeats: 14, senateSeats: 40, senateClasses: [1, 2], region: "Northeast", gdp: 16000 },
        { id: "NM", name: "New Mexico", population: 681187, houseSeats: 2, senateSeats: 42, senateClasses: [1, 2], region: "Southwest", gdp: 1200 },
        { id: "NV", name: "Nevada", population: 160083, houseSeats: 1, senateSeats: 21, senateClasses: [1, 3], region: "Southwest", gdp: 450 },
        { id: "NY", name: "New York", population: 14830192, houseSeats: 43, senateSeats: 61, senateClasses: [1, 3], region: "Northeast", gdp: 50000 },
        { id: "OH", name: "Ohio", population: 7946627, houseSeats: 23, senateSeats: 33, senateClasses: [1, 3], region: "Midwest", gdp: 24000 },
        { id: "OK", name: "Oklahoma", population: 2233351, houseSeats: 6, senateSeats: 48, senateClasses: [2, 3], region: "Southwest", gdp: 4000 },
        { id: "OR", name: "Oregon", population: 1521341, houseSeats: 4, senateSeats: 30, senateClasses: [2, 3], region: "West", gdp: 3600 },
        { id: "PA", name: "Pennsylvania", population: 10498012, houseSeats: 30, senateSeats: 50, senateClasses: [1, 3], region: "Northeast", gdp: 30000 },
        { id: "RI", name: "Rhode Island", population: 791896, houseSeats: 2, senateSeats: 38, senateClasses: [1, 2], region: "Northeast", gdp: 2300 },
        { id: "SC", name: "South Carolina", population: 2117027, houseSeats: 6, senateSeats: 46, senateClasses: [2, 3], region: "Southeast", gdp: 2800 },
        { id: "SD", name: "South Dakota", population: 652740, houseSeats: 2, senateSeats: 35, senateClasses: [2, 3], region: "Midwest", gdp: 1300 },
        { id: "TN", name: "Tennessee", population: 3291718, houseSeats: 9, senateSeats: 33, senateClasses: [1, 2], region: "Southeast", gdp: 5500 },
        { id: "TX", name: "Texas", population: 7711194, houseSeats: 22, senateSeats: 31, senateClasses: [1, 2], region: "Southwest", gdp: 18000 },
        { id: "UT", name: "Utah", population: 688862, houseSeats: 2, senateSeats: 29, senateClasses: [1, 3], region: "Southwest", gdp: 1400 },
        { id: "VA", name: "Virginia", population: 3318680, houseSeats: 10, senateSeats: 40, senateClasses: [1, 2], region: "Southeast", gdp: 6500 },
        { id: "VT", name: "Vermont", population: 377747, houseSeats: 1, senateSeats: 30, senateClasses: [1, 3], region: "Northeast", gdp: 750 },
        { id: "WA", name: "Washington", population: 2378963, houseSeats: 7, senateSeats: 49, senateClasses: [1, 3], region: "West", gdp: 6500 },
        { id: "WI", name: "Wisconsin", population: 3434575, houseSeats: 10, senateSeats: 33, senateClasses: [1, 3], region: "Midwest", gdp: 8500 },
        { id: "WV", name: "West Virginia", population: 2005552, houseSeats: 6, senateSeats: 34, senateClasses: [1, 2], region: "Southeast", gdp: 3500 },
        { id: "WY", name: "Wyoming", population: 290529, houseSeats: 1, senateSeats: 30, senateClasses: [1, 2], region: "West", gdp: 650 },
      ];

      // Compute per-party average org/reg and per-region electorate averages across opaque US regions
      const usPartyIds = parties ? Object.keys(parties).filter((pid) => (parties[pid] as Record<string, unknown>)["countryId"] === "US") : [];
      const avgOrgByParty = new Map<string, number>();
      const avgRegByParty = new Map<string, number>();
      for (const pid of usPartyIds) {
        let sumOrg = 0, sumReg = 0, count = 0;
        for (const rid of opaqueUsIds) {
          const key = `${rid}:${pid}`;
          const pr = partyRegions[key] as Record<string, unknown> | undefined;
          if (pr && typeof pr["organization"] === "number" && typeof pr["registration"] === "number") {
            sumOrg += pr["organization"] as number;
            sumReg += pr["registration"] as number;
            count++;
          }
        }
        avgOrgByParty.set(pid, count ? Math.round(sumOrg / count) : 0);
        avgRegByParty.set(pid, count ? Math.round(sumReg / count) : 0);
      }
      // Electorate averages
      let sumInd = 0, sumUnreg = 0, countPools = 0;
      for (const rid of opaqueUsIds) {
        const pool = electoratePools[rid] as Record<string, unknown> | undefined;
        if (pool && typeof pool["independent"] === "number" && typeof pool["unregistered"] === "number") {
          sumInd += pool["independent"] as number;
          sumUnreg += pool["unregistered"] as number;
          countPools++;
        }
      }
      const avgInd = countPools ? Math.round(sumInd / countPools) : 8;
      const avgUnreg = countPools ? Math.round(sumUnreg / countPools) : 7;

      // Turnout modifiers are neutral 0; copy from first opaque if present
      let turnoutMods: Record<string, Record<string, number>> | null = null;
      for (const rid of opaqueUsIds) {
        const rt = regionTurnouts[rid] as Record<string, unknown> | undefined;
        if (rt && typeof rt["modifiers"] === "object" && rt["modifiers"] !== null) {
          turnoutMods = rt["modifiers"] as Record<string, Record<string, number>>;
          break;
        }
      }
      if (!turnoutMods) turnoutMods = { voterGroups: { urban_progressives: 0, rural_conservatives: 0, suburban_moderates: 0 } };

      // Remove opaque US entries
      for (const rid of opaqueUsIds) {
        delete regions[rid];
        delete electoratePools[rid];
        delete regionTurnouts[rid];
      }
      // Remove old partyRegions/pressures for US opaque
      for (const key of Object.keys(partyRegions)) {
        if (opaqueUsIds.some((rid) => key.startsWith(`${rid}:`))) delete partyRegions[key];
      }
      for (const key of Object.keys(partyPressures)) {
        if (opaqueUsIds.some((rid) => key.endsWith(`:${rid}`))) delete partyPressures[key];
      }

      // Create new US state regions and support rows
      for (const st of US_STATES_1953) {
        const rid = st.id;
        regions[rid] = { id: rid, countryId: "US", name: st.name, population: st.population, houseSeats: st.houseSeats, senateSeats: st.senateSeats, senateClasses: st.senateClasses, censusRegion: st.region, gdp: st.gdp };
        electoratePools[rid] = { regionId: rid, countryId: "US", independent: avgInd, unregistered: avgUnreg };
        regionTurnouts[rid] = { regionId: rid, countryId: "US", modifiers: JSON.parse(JSON.stringify(turnoutMods)), lastDecayAppliedTurn: 0 };
        for (const pid of usPartyIds) {
          const org = avgOrgByParty.get(pid) ?? 0;
          const reg = avgRegByParty.get(pid) ?? 0;
          const key = `${rid}:${pid}`;
          partyRegions[key] = { regionId: rid, partyId: pid, countryId: "US", organization: org, registration: reg };
          const pkey = `${pid}:${rid}`;
          partyPressures[pkey] = { partyId: pid, regionId: rid, countryId: "US", value: 0 };
        }
      }

      // PriorityRegion remap: drop US-Rx ids (no table); keep others
      if (parties) {
        for (const p of Object.values(parties)) {
          const pr = (p as Record<string, unknown>)["priorityRegion"] as Record<string, unknown> | undefined;
          if (pr && Array.isArray(pr["regionIds"])) {
            const ids = pr["regionIds"] as string[];
            const filtered = ids.filter((id) => !opaqueUsIds.includes(id));
            // If any US opaque was present, drop them; if empty after filter, keep empty
            if (filtered.length !== ids.length) {
              pr["regionIds"] = filtered;
            }
          }
        }
      }
    }
    save.world.meta.schemaVersion = 10;
  }
  // v10 -> v11: W36 membership, caucuses, endorsements
  if (save.schemaVersion < 11) {
    const w = save.world as unknown as Record<string, unknown>;
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player === "object") {
      if (!("partyId" in player) || (player["partyId"] !== null && typeof player["partyId"] !== "string")) {
        if (player["partyId"] === undefined) player["partyId"] = null;
      }
      if (typeof player["partyJoinedTurn"] !== "number" && player["partyJoinedTurn"] !== null) player["partyJoinedTurn"] = null;
      if (typeof player["lastPartySwitchTurn"] !== "number" && player["lastPartySwitchTurn"] !== null) player["lastPartySwitchTurn"] = null;
      if (!Array.isArray(player["purgeRejoinBlocks"])) player["purgeRejoinBlocks"] = [];
      if (!("caucusId" in player) || (player["caucusId"] !== null && typeof player["caucusId"] !== "string")) {
        if (player["caucusId"] === undefined) player["caucusId"] = null;
      }
      // Backfill missing membership fields for pre-v11 saves where player had no partyId
      if (player["partyId"] === undefined) player["partyId"] = null;
    }
    if (!Array.isArray(w["endorsements"])) w["endorsements"] = [];
    // Ensure caucuses memberIds exists (already in v6 but enforce)
    const caucuses = w["caucuses"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(caucuses)) {
      for (const c of caucuses) {
        if (!Array.isArray(c["memberIds"])) c["memberIds"] = [];
        if (typeof c["taxRate"] !== "number") c["taxRate"] = 0;
        if (typeof c["treasury"] !== "number") c["treasury"] = 0;
      }
    }
    save.world.meta.schemaVersion = 11;
  }
  // v11 -> v12: W27 legislation core - bills, committees, enactedLaws, stateBills, player seat/mode
  if (save.schemaVersion < 12) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["bills"])) w["bills"] = [];
    if (!Array.isArray(w["committees"])) w["committees"] = [];
    if (!Array.isArray(w["enactedLaws"])) w["enactedLaws"] = [];
    if (!Array.isArray(w["stateBills"])) w["stateBills"] = [];
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player === "object") {
      if (!("legislativeSeat" in player) || (player["legislativeSeat"] !== null && typeof player["legislativeSeat"] !== "object")) {
        if (player["legislativeSeat"] === undefined) player["legislativeSeat"] = null;
      }
      if (player["legislativeSeat"] === undefined) player["legislativeSeat"] = null;
      if (player["mode"] !== "hos" && player["mode"] !== "career") player["mode"] = "career";
    }
    // Ensure every bill has filibusterInvocations and vote maps
    const bills = w["bills"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(bills)) {
      for (const b of bills) {
        if (!Array.isArray(b["filibusterInvocations"])) b["filibusterInvocations"] = [];
        if (typeof b["votes"] !== "object" || b["votes"] === null || Array.isArray(b["votes"])) b["votes"] = {};
      }
    }
    const committees = w["committees"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(committees)) {
      for (const c of committees) {
        if (!Array.isArray(c["memberIds"])) c["memberIds"] = [];
        if (!Array.isArray(c["jurisdiction"])) c["jurisdiction"] = [];
      }
    }
    save.world.meta.schemaVersion = 12;
  }
  // v12 -> v13: W21c live elections. Empty election list; US seated politicians
  // gain deterministic state/class geography (sorted fill, see seatGeography.ts).
  if (save.schemaVersion < 13) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["elections"])) w["elections"] = [];
    assignUsSeatGeography(save.world);
    save.world.meta.schemaVersion = 13;
  }
  // v13 -> v14: W16 demographics (categories, stateDemographics, census, laborForces).
  // Note: if W37 takes v14 in parallel, merge resolver renumbers this to next free.
  if (save.schemaVersion < 14) {
    const w = save.world as unknown as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    if (typeof w["stateDemographics"] !== "object" || w["stateDemographics"] === null || Array.isArray(w["stateDemographics"])) w["stateDemographics"] = {};
    if (typeof w["baselineDemographics"] !== "object" || w["baselineDemographics"] === null || Array.isArray(w["baselineDemographics"])) w["baselineDemographics"] = {};
    if (typeof w["demographicCategories"] !== "object" || w["demographicCategories"] === null || Array.isArray(w["demographicCategories"])) w["demographicCategories"] = {};
    if (typeof w["census"] !== "object" || w["census"] === null || Array.isArray(w["census"])) w["census"] = {};
    if (typeof w["laborForces"] !== "object" || w["laborForces"] === null || Array.isArray(w["laborForces"])) w["laborForces"] = {};

    // If regions exist but demographics are empty, seed uniform stubs so old saves are tally-ready.
    const sd = w["stateDemographics"] as Record<string, unknown>;
    const bd = w["baselineDemographics"] as Record<string, unknown>;
    const lf = w["laborForces"] as Record<string, unknown>;
    const dc = w["demographicCategories"] as Record<string, unknown>;
    if (Object.keys(sd).length === 0 && regions && Object.keys(regions).length > 0) {
      for (const [rid, reg] of Object.entries(regions)) {
        const cid = (reg as { countryId?: string }).countryId ?? "US";
        // Minimal voterGroups stub (two groups) so tally has input; real US data seeded via createWorld on new worlds
        const stubGroups: Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }> = {
          young_renters: { population: 50, economicLean: -1.5, socialLean: -1.5, turnout: 36 },
          evangelicals: { population: 50, economicLean: 2.0, socialLean: 3.5, turnout: 55 },
        };
        sd[rid] = { _id: rid, countryId: cid, categoryWeights: { voterGroups: 100 }, groups: stubGroups, lastUpdated: "1953-01-06T00:00:00.000Z" };
        bd[rid] = JSON.parse(JSON.stringify(sd[rid]));
        const pop = typeof (reg as { population?: number }).population === "number" ? (reg as { population: number }).population : 1_000_000;
        lf[rid] = Math.round(pop * 0.58 * 0.625);
      }
      // Minimal categories
      if (Object.keys(dc).length === 0) {
        dc["US"] = [{ _id: "voterGroups", name: "Voter Groups", defaultWeight: 100, groups: [{ id: "young_renters", name: "Young Renters", defaultEconomicLean: -1.5, defaultSocialLean: -1.5, defaultTurnout: 36 }, { id: "evangelicals", name: "Evangelicals", defaultEconomicLean: 2.0, defaultSocialLean: 3.5, defaultTurnout: 55 }] }];
      }
    }
    // Ensure laborForces and region demographics stocks exist for existing regions
    if (regions) {
      for (const [rid, reg] of Object.entries(regions)) {
        if (typeof (reg as { workingAgePopulation?: number }).workingAgePopulation !== "number") {
          const pop = typeof (reg as { population?: number }).population === "number" ? (reg as { population: number }).population : 1_000_000;
          (reg as Record<string, unknown>)["workingAgePopulation"] = Math.round(pop * 0.58);
          (reg as Record<string, unknown>)["votingEligiblePopulation"] = Math.round(pop * 0.70);
          (reg as Record<string, unknown>)["militaryServicePopulation"] = 0;
        }
        if (typeof lf[rid] !== "number") {
          const pop = typeof (reg as { population?: number }).population === "number" ? (reg as { population: number }).population : 1_000_000;
          lf[rid] = Math.round(pop * 0.58 * 0.625);
        }
      }
    }
    save.world.meta.schemaVersion = 14;
  }
  // v14 -> v15: W2 budgets (national budgets + regional budgets).
  // If W37 races for v14/v15, merge resolver renumbers - note collision for resolver.
  // Seed minimal budgets/regionalBudgets so old saves have fiscal state.
  if (save.schemaVersion < 15) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["budgets"] !== "object" || w["budgets"] === null || Array.isArray(w["budgets"])) w["budgets"] = {};
    if (typeof w["regionalBudgets"] !== "object" || w["regionalBudgets"] === null || Array.isArray(w["regionalBudgets"])) w["regionalBudgets"] = {};
    const budgets = w["budgets"] as Record<string, unknown>;
    const regionalBudgets = w["regionalBudgets"] as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    // If budgets empty but regions exist, synthesize minimal entries per country/region
    if (Object.keys(budgets).length === 0 && regions && Object.keys(regions).length > 0) {
      const countryIds = new Set<string>();
      for (const reg of Object.values(regions)) {
        const cid = (reg as { countryId?: string }).countryId;
        if (typeof cid === "string") countryIds.add(cid);
      }
      for (const cid of countryIds) {
        const gdp = 10_000_000_000;
        budgets[cid] = {
          countryId: cid,
          fiscalYear: 1953,
          gdp,
          population: 1_000_000,
          currencyCode: "USD",
          taxRates: { incomeTax: 25, domesticCorporateTax: 30, foreignCorporateTax: 30, payrollTax: 5, tariffs: 2, salesTax: 5 },
          taxBases: {
            taxableIncome: gdp * 0.3,
            domesticCorporateProfits: gdp * 0.06,
            foreignCorporateProfits: gdp * 0.02,
            wagesAndSalaries: gdp * 0.35,
            importValue: gdp * 0.15,
            taxableSales: gdp * 0.4,
          },
          revenue: { incomeTax: 0, domesticCorporateTax: 0, foreignCorporateTax: 0, payrollTax: 0, tariffs: 0, salesTax: 0, other: 200_000_000, total: 200_000_000 },
          spending: { byCategory: { other: 100_000_000 }, stateGrants: 50_000_000, debtInterest: 10_000_000, total: 160_000_000 },
          debt: { principal: 3_000_000_000, interestRate: 0.03, ceiling: 6_000_000_000 },
          surplus: 40_000_000,
          treasuryBalance: -3_000_000_000,
          creditRating: "BBB",
          economicFactors: { gdpGrowth: 2.5, wageGrowth: 3.0, inflationRate: 2.0, tradeGrowth: 3.0 },
          baselineSpendingByCategory: { other: 100_000_000 },
          baselineStateGrants: 50_000_000,
        };
        // Recompute revenue total correctly
        const b = budgets[cid] as Record<string, unknown> & { revenue: { incomeTax: number; domesticCorporateTax: number; foreignCorporateTax: number; payrollTax: number; tariffs: number; salesTax: number; other: number; total: number }; taxBases: Record<string, number>; taxRates: Record<string, number> };
        b.revenue.incomeTax = Math.round((b.taxBases["taxableIncome"] ?? 0) * ((b.taxRates["incomeTax"] ?? 0) / 100));
        b.revenue.domesticCorporateTax = Math.round((b.taxBases["domesticCorporateProfits"] ?? 0) * ((b.taxRates["domesticCorporateTax"] ?? 0) / 100));
        b.revenue.foreignCorporateTax = Math.round((b.taxBases["foreignCorporateProfits"] ?? 0) * ((b.taxRates["foreignCorporateTax"] ?? 0) / 100));
        b.revenue.payrollTax = Math.round((b.taxBases["wagesAndSalaries"] ?? 0) * ((b.taxRates["payrollTax"] ?? 0) / 100));
        b.revenue.tariffs = Math.round((b.taxBases["importValue"] ?? 0) * ((b.taxRates["tariffs"] ?? 0) / 100));
        b.revenue.salesTax = Math.round((b.taxBases["taxableSales"] ?? 0) * ((b.taxRates["salesTax"] ?? 0) / 100));
        b.revenue.total = b.revenue.incomeTax + b.revenue.domesticCorporateTax + b.revenue.foreignCorporateTax + b.revenue.payrollTax + b.revenue.tariffs + b.revenue.salesTax + b.revenue.other;
        const spending = b["spending"] as { byCategory: Record<string, number>; stateGrants: number; debtInterest: number; total: number };
        (b as Record<string, unknown>)["surplus"] = b.revenue.total - spending.total;
      }
      for (const [rid, reg] of Object.entries(regions)) {
        const cid = (reg as { countryId?: string }).countryId ?? "US";
        if (!regionalBudgets[rid]) {
          regionalBudgets[rid] = {
            regionId: rid,
            countryId: cid,
            revenue: { councilTax: 10_000_000, businessRates: 5_000_000, grant: 5_000_000, total: 20_000_000 },
            spending: { byCategory: { other: 15_000_000 }, total: 15_000_000 },
            balance: 5_000_000,
            consecutiveDeficits: 0,
          };
        }
      }
    }
    save.world.meta.schemaVersion = 15;
  }
  // v15 -> v16: W37 NPC behavior cluster - personality, relationships, sponsor cooldown, stance drift support
  if (save.schemaVersion < 16) {
    const w = save.world as unknown as Record<string, unknown>;
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(politicians)) {
      for (const pol of politicians) {
        if (typeof pol["personality"] !== "object" || pol["personality"] === null || Array.isArray(pol["personality"])) {
          // Deterministic legacy personality from id hash (FNV-1a style) so migrated saves are deterministic
          const id = String(pol["id"] ?? "");
          let h = 0x811c9dc5;
          for (let i = 0; i < id.length; i++) {
            h ^= id.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
          }
          const r = (h >>> 0) / 0xffffffff;
          // Derive three traits from spaced hashes
          const hash2 = (s: string): number => {
            let hh = 0x811c9dc5;
            for (let i = 0; i < s.length; i++) {
              hh ^= s.charCodeAt(i);
              hh = Math.imul(hh, 0x01000193);
            }
            return (hh >>> 0) / 0xffffffff;
          };
          pol["personality"] = {
            loyalty: Math.round(hash2(`${id}:loyalty`) * 100),
            ambition: Math.round(hash2(`${id}:ambition`) * 100),
            stubbornness: Math.round(r * 100),
          };
        } else {
          const p = pol["personality"] as Record<string, unknown>;
          if (typeof p["loyalty"] !== "number") p["loyalty"] = 50;
          if (typeof p["ambition"] !== "number") p["ambition"] = 50;
          if (typeof p["stubbornness"] !== "number") p["stubbornness"] = 50;
        }
      }
    }
    if (typeof w["nppRelationships"] !== "object" || w["nppRelationships"] === null || Array.isArray(w["nppRelationships"])) {
      w["nppRelationships"] = {};
    }
    if (typeof w["nppSponsorLastTurn"] !== "object" || w["nppSponsorLastTurn"] === null || Array.isArray(w["nppSponsorLastTurn"])) {
      w["nppSponsorLastTurn"] = {};
    }
    save.world.meta.schemaVersion = 16;
  }
  // v16 -> v17: W3 central banks (this worktree branched at v15; v16 is another
  // wave's pre-allocated slot merging in parallel. Written as a direct jump to
  // the target v17 per the wave brief - the merge resolver may need to split
  // this into a proper v15->v16 (whatever v16's wave adds) -> v16->v17 (this
  // block, renumbered) chain depending on merge order. Seeds one central bank
  // per playable country (mirrors world.ts seedCentralBanks): bootstrapped
  // directly in autonomous "npp" chair mode at that country's defaultPrimeRate
  // anchor, term expiring at CHAIR_TERM_TURNS from now (not from turn 0 - an
  // in-progress save should not immediately roll the chair on load).
  if (save.schemaVersion < 17) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["centralBanks"] !== "object" || w["centralBanks"] === null || Array.isArray(w["centralBanks"])) {
      w["centralBanks"] = {};
    }
    const centralBanks = w["centralBanks"] as Record<string, unknown>;
    const countries = w["countries"] as Record<string, Record<string, unknown>> | undefined;
    const meta = w["meta"] as Record<string, unknown> | undefined;
    const currentTurn = typeof meta?.["turn"] === "number" ? (meta["turn"] as number) : 0;
    if (countries) {
      for (const [countryId, country] of Object.entries(countries)) {
        if (country["playable"] !== true) continue;
        if (centralBanks[countryId]) continue;
        const anchor = CENTRAL_BANK_COUNTRY_ANCHORS[countryId];
        if (!anchor) continue;
        centralBanks[countryId] = {
          countryId,
          primeRate: anchor.defaultPrimeRate,
          chairMode: "npp",
          chairAlignment: null,
          chairInfamy: 0,
          resolveStreak: 0,
          lastRateChangeTurn: null,
          chairTermExpiresAtTurn: currentTurn + CHAIR_TERM_TURNS,
          interestRateHistory: [],
        };
      }
    }
    save.world.meta.schemaVersion = 17;
  }
  // v17 -> v18: W39 UK/RU/DD subdivisions - replace opaque UK-R1..R3, RU-R1..R3, DD-R1..R3 with real tables.
  // Pre-allocated v18 for this wave; parallel waves hold 16 and 17. Note for merge resolver: renumber to next free if collision.
  // Bridge decision: same deterministic averaged-split approach as W38's US bridge (docs/support/W19_BRIDGE.md): pooled org/reg totals across 3 opaque regions are averaged and assigned uniformly to new subdivisions. Sorted tables ensure determinism. UK 12 regions (1951 Census, 625 commons), RU 14 (1939/1950 Census, 526 Union seats), DD 6 Laender (18.4M, 500 Volkskammer). Demographics for new regions are seeded as uniform stubs here; new worlds use Layer1-derived tables via seedDemographics.
  if (save.schemaVersion < 18) {
    const w = save.world as unknown as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    const partyRegions = w["partyRegions"] as Record<string, Record<string, unknown>> | undefined;
    const electoratePools = w["electoratePools"] as Record<string, Record<string, unknown>> | undefined;
    const regionTurnouts = w["regionTurnouts"] as Record<string, Record<string, unknown>> | undefined;
    const partyPressures = w["partyPressures"] as Record<string, Record<string, unknown>> | undefined;
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    const stateDemographics = w["stateDemographics"] as Record<string, unknown> | undefined;
    const baselineDemographics = w["baselineDemographics"] as Record<string, unknown> | undefined;
    const laborForces = w["laborForces"] as Record<string, unknown> | undefined;
    const demographicCategories = w["demographicCategories"] as Record<string, unknown> | undefined;

    // Inline real region metadata for migration (sorted for determinism). Sources: ukRegions1953.ts, ruRegions1953.ts, ddRegions1953.ts
    const UK_REGIONS_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
      { id: "EAE", name: "East of England", population: 3700000, houseSeats: 47, senateSeats: 39, senateClasses: [1, 2], region: "East of England", gdp: 1300 },
      { id: "EMI", name: "East Midlands", population: 3200000, houseSeats: 37, senateSeats: 39, senateClasses: [1, 2], region: "East Midlands", gdp: 1100 },
      { id: "LON", name: "London", population: 8200000, houseSeats: 91, senateSeats: 32, senateClasses: [1, 2], region: "London", gdp: 3800 },
      { id: "NEE", name: "North East England", population: 3100000, houseSeats: 27, senateSeats: 17, senateClasses: [1, 2], region: "North East", gdp: 1000 },
      { id: "NIR", name: "Northern Ireland", population: 1400000, houseSeats: 12, senateSeats: 90, senateClasses: [1, 2], region: "Northern Ireland", gdp: 370 },
      { id: "NWE", name: "North West England", population: 6500000, houseSeats: 75, senateSeats: 27, senateClasses: [1, 2], region: "North West", gdp: 2400 },
      { id: "SCO", name: "Scotland", population: 5100000, houseSeats: 71, senateSeats: 129, senateClasses: [1, 2], region: "Scotland", gdp: 1500 },
      { id: "SEE", name: "South East England", population: 6100000, houseSeats: 81, senateSeats: 67, senateClasses: [1, 2], region: "South East", gdp: 2800 },
      { id: "SWE", name: "South West England", population: 3400000, houseSeats: 43, senateSeats: 39, senateClasses: [1, 2], region: "South West", gdp: 1200 },
      { id: "WAL", name: "Wales", population: 2600000, houseSeats: 36, senateSeats: 60, senateClasses: [1, 2], region: "Wales", gdp: 630 },
      { id: "WMI", name: "West Midlands", population: 4700000, houseSeats: 53, senateSeats: 18, senateClasses: [1, 2], region: "West Midlands", gdp: 1900 },
      { id: "YHU", name: "Yorkshire & the Humber", population: 4600000, houseSeats: 52, senateSeats: 21, senateClasses: [1, 2], region: "Yorkshire", gdp: 1800 },
    ];
    const RU_REGIONS_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
      { id: "CAS", name: "Central Asia", population: 14000000, houseSeats: 50, senateSeats: 500, senateClasses: [1, 2], region: "Central Asia", gdp: 58333 },
      { id: "CBE", name: "Central Black Earth", population: 8500000, houseSeats: 30, senateSeats: 164, senateClasses: [1, 2], region: "Russia", gdp: 37500 },
      { id: "CEN", name: "Central Russia", population: 22500000, houseSeats: 80, senateSeats: 575, senateClasses: [1, 2], region: "Russia", gdp: 179167 },
      { id: "ESB", name: "East Siberia", population: 6000000, houseSeats: 21, senateSeats: 164, senateClasses: [1, 2], region: "Russia", gdp: 45833 },
      { id: "FEA", name: "Russian Far East", population: 5200000, houseSeats: 18, senateSeats: 143, senateClasses: [1, 2], region: "Russia", gdp: 41667 },
      { id: "KAZ", name: "Kazakhstan", population: 8500000, houseSeats: 30, senateSeats: 510, senateClasses: [1, 2], region: "Kazakhstan", gdp: 45833 },
      { id: "MOL", name: "Moldova", population: 2500000, houseSeats: 9, senateSeats: 350, senateClasses: [1, 2], region: "Moldova", gdp: 12500 },
      { id: "NCA", name: "North Caucasus", population: 13000000, houseSeats: 46, senateSeats: 307, senateClasses: [1, 2], region: "Russia", gdp: 66667 },
      { id: "NOR", name: "European North", population: 4800000, houseSeats: 17, senateSeats: 123, senateClasses: [1, 2], region: "Russia", gdp: 33333 },
      { id: "NWR", name: "Northwest Russia", population: 10500000, houseSeats: 37, senateSeats: 266, senateClasses: [1, 2], region: "Russia", gdp: 91667 },
      { id: "TRA", name: "Transcaucasia", population: 11000000, houseSeats: 39, senateSeats: 440, senateClasses: [1, 2], region: "Caucasus", gdp: 58333 },
      { id: "URA", name: "Urals", population: 15500000, houseSeats: 55, senateSeats: 389, senateClasses: [1, 2], region: "Russia", gdp: 158333 },
      { id: "VOL", name: "Volga", population: 17000000, houseSeats: 60, senateSeats: 410, senateClasses: [1, 2], region: "Russia", gdp: 116667 },
      { id: "WSB", name: "West Siberia", population: 9500000, houseSeats: 34, senateSeats: 246, senateClasses: [1, 2], region: "Russia", gdp: 83333 },
    ];
    const DD_REGIONS_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
      { id: "BB", name: "Brandenburg", population: 2620000, houseSeats: 71, senateSeats: 11, senateClasses: [1, 2], region: "North", gdp: 5600 },
      { id: "BEO", name: "Berlin (Ost)", population: 1190000, houseSeats: 32, senateSeats: 5, senateClasses: [1, 2], region: "Berlin", gdp: 5200 },
      { id: "MV", name: "Mecklenburg-Vorpommern", population: 2120000, houseSeats: 58, senateSeats: 9, senateClasses: [1, 2], region: "North", gdp: 3900 },
      { id: "SN", name: "Sachsen", population: 5560000, houseSeats: 151, senateSeats: 24, senateClasses: [1, 2], region: "South", gdp: 13900 },
      { id: "ST", name: "Sachsen-Anhalt", population: 4120000, houseSeats: 112, senateSeats: 18, senateClasses: [1, 2], region: "North", gdp: 9900 },
      { id: "TH", name: "Thüringen", population: 2790000, houseSeats: 76, senateSeats: 13, senateClasses: [1, 2], region: "South", gdp: 5500 },
    ];

    function migrateCountry(countryId: string, opaqueIds: string[], realRegions: typeof UK_REGIONS_1953) {
      if (!regions || !partyRegions || !electoratePools || !regionTurnouts || !partyPressures) return;
      const hasOpaque = opaqueIds.some((id) => id in regions);
      if (!hasOpaque) return;
      const countryPartyIds = parties ? Object.keys(parties).filter((pid) => (parties[pid] as Record<string, unknown>)["countryId"] === countryId) : [];
      const avgOrgByParty = new Map<string, number>();
      const avgRegByParty = new Map<string, number>();
      for (const pid of countryPartyIds) {
        let sumOrg = 0, sumReg = 0, count = 0;
        for (const rid of opaqueIds) {
          const key = `${rid}:${pid}`;
          const pr = partyRegions[key] as Record<string, unknown> | undefined;
          if (pr && typeof pr["organization"] === "number" && typeof pr["registration"] === "number") {
            sumOrg += pr["organization"] as number;
            sumReg += pr["registration"] as number;
            count++;
          }
        }
        avgOrgByParty.set(pid, count ? Math.round(sumOrg / count) : 0);
        avgRegByParty.set(pid, count ? Math.round(sumReg / count) : 0);
      }
      let sumInd = 0, sumUnreg = 0, countPools = 0;
      for (const rid of opaqueIds) {
        const pool = electoratePools[rid] as Record<string, unknown> | undefined;
        if (pool && typeof pool["independent"] === "number" && typeof pool["unregistered"] === "number") {
          sumInd += pool["independent"] as number;
          sumUnreg += pool["unregistered"] as number;
          countPools++;
        }
      }
      const avgInd = countPools ? Math.round(sumInd / countPools) : (countryId === "UK" ? 8 : countryId === "RU" ? 3 : 5);
      const avgUnreg = countPools ? Math.round(sumUnreg / countPools) : (countryId === "UK" ? 8 : countryId === "RU" ? 2 : 3);
      let turnoutMods: Record<string, Record<string, number>> | null = null;
      for (const rid of opaqueIds) {
        const rt = regionTurnouts[rid] as Record<string, unknown> | undefined;
        if (rt && typeof rt["modifiers"] === "object" && rt["modifiers"] !== null) {
          turnoutMods = rt["modifiers"] as Record<string, Record<string, number>>;
          break;
        }
      }
      if (!turnoutMods) {
        const groups: string[] = countryId === "UK" ? ["urban_progressives", "rural_traditionalists", "suburban_centrists"] : countryId === "RU" ? ["workers", "urban_progressives"] : ["workers", "bloc_centrists"];
        const mods: Record<string, number> = {};
        for (const g of groups) mods[g] = 0;
        turnoutMods = { voterGroups: mods } as unknown as Record<string, Record<string, number>>;
      }
      for (const rid of opaqueIds) {
        delete regions[rid];
        delete electoratePools[rid];
        delete regionTurnouts[rid];
      }
      for (const key of Object.keys(partyRegions)) {
        if (opaqueIds.some((rid) => key.startsWith(`${rid}:`))) delete partyRegions[key];
      }
      for (const key of Object.keys(partyPressures)) {
        if (opaqueIds.some((rid) => key.endsWith(`:${rid}`))) delete partyPressures[key];
      }
      for (const st of realRegions) {
        const rid = st.id;
        regions[rid] = { id: rid, countryId, name: st.name, population: st.population, houseSeats: st.houseSeats, senateSeats: st.senateSeats, senateClasses: st.senateClasses, censusRegion: st.region, gdp: st.gdp };
        electoratePools[rid] = { regionId: rid, countryId, independent: avgInd, unregistered: avgUnreg };
        regionTurnouts[rid] = { regionId: rid, countryId, modifiers: JSON.parse(JSON.stringify(turnoutMods)), lastDecayAppliedTurn: 0 };
        for (const pid of countryPartyIds) {
          const org = avgOrgByParty.get(pid) ?? 0;
          const reg = avgRegByParty.get(pid) ?? 0;
          const key = `${rid}:${pid}`;
          partyRegions[key] = { regionId: rid, partyId: pid, countryId, organization: org, registration: reg };
          const pkey = `${pid}:${rid}`;
          partyPressures[pkey] = { partyId: pid, regionId: rid, countryId, value: 0 };
        }
      }
      if (parties) {
        for (const p of Object.values(parties)) {
          const pr = (p as Record<string, unknown>)["priorityRegion"] as Record<string, unknown> | undefined;
          if (pr && Array.isArray(pr["regionIds"])) {
            const ids = pr["regionIds"] as string[];
            const filtered = ids.filter((id) => !opaqueIds.includes(id));
            if (filtered.length !== ids.length) pr["regionIds"] = filtered;
          }
        }
      }
      // Seed demographics stubs for new regions if missing (so tally has input; real tables used for new worlds via seedDemographics)
      if (stateDemographics && baselineDemographics && laborForces && demographicCategories) {
        for (const st of realRegions) {
          const rid = st.id;
          if (typeof stateDemographics[rid] === "undefined") {
            const catList = (demographicCategories as Record<string, unknown>)[countryId] as Array<{ _id: string; defaultWeight: number; groups: Array<{ id: string; defaultEconomicLean: number; defaultSocialLean: number; defaultTurnout?: number }> }> | undefined;
            const catsFor = Array.isArray(catList) ? catList : [];
            const groups: Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }> = {};
            for (const cat of catsFor) {
              const share = 100 / cat.groups.length;
              for (const g of cat.groups) groups[g.id] = { population: Math.round(share*100)/100, economicLean: g.defaultEconomicLean, socialLean: g.defaultSocialLean, turnout: g.defaultTurnout ?? 50 };
            }
            const total = Object.values(groups).reduce((s,v)=>s+v.population,0);
            const diff = Math.round((100-total)*100)/100;
            if (Math.abs(diff)>0.001) {
              const first = Object.keys(groups)[0];
              if (first) groups[first]!.population = Math.round((groups[first]!.population+diff)*100)/100;
            }
            const weights: Record<string, number> = {};
            for (const c of catsFor) weights[c._id]=c.defaultWeight;
            const nowIso = (w["meta"] as Record<string, unknown>)?.["date"] as string ?? "1953-01-06T00:00:00.000Z";
            const demo = { _id: rid, countryId, categoryWeights: weights, groups, lastUpdated: nowIso };
            stateDemographics[rid] = demo;
            baselineDemographics[rid] = JSON.parse(JSON.stringify(demo));
            const pop = st.population;
            const workingAge = Math.round(pop*0.58);
            laborForces[rid] = Math.round(workingAge*0.625);
            (regions[rid] as Record<string, unknown>)["workingAgePopulation"] = workingAge;
            (regions[rid] as Record<string, unknown>)["votingEligiblePopulation"] = Math.round(pop*0.70);
            (regions[rid] as Record<string, unknown>)["militaryServicePopulation"] = 0;
          }
        }
      }
    }

    migrateCountry("UK", ["UK-R1", "UK-R2", "UK-R3"], UK_REGIONS_1953);
    migrateCountry("RU", ["RU-R1", "RU-R2", "RU-R3"], RU_REGIONS_1953);
    migrateCountry("DD", ["DD-R1", "DD-R2", "DD-R3"], DD_REGIONS_1953);

    save.world.meta.schemaVersion = 18;
  }
  // v18 -> v19: W9 corporations. This worktree branched at v17; v18 is another
  // wave's pre-allocated slot merging in parallel. Written as a direct jump to
  // the target v19 per the wave brief - the merge resolver may need to split
  // this into a proper v17->v18 (whatever v18's wave adds) -> v18->v19 (this
  // block, renumbered) chain depending on merge order.
  //
  // Seeds corporations for every playable country with authored 1953 sector
  // weights, exactly as world.ts createWorld does - but from a migration-only
  // rng derived from the save's own seed (never the save's live meta.rng
  // state: that stream must stay untouched so future turns continue exactly
  // where an in-progress campaign left off). A save loaded mid-campaign gets
  // corporations "founded" at the save's current turn rather than turn 0 -
  // there is no way to reconstruct what turn-0 founding would have produced
  // without replaying the whole campaign, and founding-at-load is the same
  // shape as a fresh createWorld seed step, just later.
  if (save.schemaVersion < 19) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["corporations"] !== "object" || w["corporations"] === null || Array.isArray(w["corporations"])) {
      const countries = w["countries"] as Record<string, { id: string; playable: boolean; economy: { gdp: number; growthRate: number } }> | undefined;
      const regions = w["regions"] as Record<string, { countryId: string }> | undefined;
      const turn = typeof (w["meta"] as Record<string, unknown> | undefined)?.["turn"] === "number" ? ((w["meta"] as Record<string, unknown>)["turn"] as number) : 0;
      const seed = typeof (w["meta"] as Record<string, unknown> | undefined)?.["seed"] === "string" ? ((w["meta"] as Record<string, unknown>)["seed"] as string) : "migration";
      const migrationRng = rngFromSeed(`${seed}:corp-migration-v19`);
      const corporations = countries
        ? seedCorporations(
            Object.values(countries).map((c) => {
              const sourceHq = SOURCE_NPP_HEADQUARTERS_REGION[c.id];
              return {
                id: c.id,
                playable: c.playable,
                gdp: c.economy.gdp,
                growthRate: c.economy.growthRate,
                ...(sourceHq && regions?.[sourceHq]?.countryId === c.id ? { headquartersRegionId: sourceHq } : {}),
              };
            }),
            migrationRng,
            turn,
        )
        : {};
      for (const corp of Object.values(corporations)) {
        corp.legacyProjectionDefaults = {
          name: true,
          brandColor: true,
          ...(corp.headquartersRegionId ? { headquartersRegionId: true as const } : {}),
        };
      }
      w["corporations"] = corporations;
      const corpRevenueSnapshots: Record<string, { current: number; previous: number; turn: number }> = {};
      for (const corp of Object.values(corporations)) {
        const existing = corpRevenueSnapshots[corp.countryId];
        const total = (existing?.current ?? 0) + corp.revenue;
        corpRevenueSnapshots[corp.countryId] = { current: total, previous: total, turn };
      }
      w["corpRevenueSnapshots"] = corpRevenueSnapshots;
    }
    if (typeof w["corpRevenueSnapshots"] !== "object" || w["corpRevenueSnapshots"] === null || Array.isArray(w["corpRevenueSnapshots"])) {
      w["corpRevenueSnapshots"] = {};
    }
    save.world.meta.schemaVersion = 19;
  }
  // v19 -> v20: W26 campaigns - add the new `campaigns` map (empty for
  // every pre-existing save; campaigns are created going forward by
  // elections/orchestration.ts + elections/candidacy.ts as candidates enter
  // campaign-eligible races). Pre-allocated v20 for this wave; v19 and v21
  // are held by parallel waves. RESOLVER NOTE: this block only touches the
  // `campaigns` field and is safe to run in either order relative to
  // whatever v19 adds - on merge, chain the blocks in strict ascending
  // schemaVersion order (v18 -> v19 -> v20) and confirm v19 does not also
  // introduce a field named `campaigns` (it should not; W26 is authoritative
  // for that name).
  if (save.schemaVersion < 20) {
    const w = save.world as unknown as Record<string, unknown>;
    if (w["campaigns"] == null || typeof w["campaigns"] !== "object") {
      w["campaigns"] = {};
    }
    save.world.meta.schemaVersion = 20;
  }
  // v20 -> v21: W20 intra-party democracy (state/national/committee elections + coalitions).
  // Pre-allocated v21: mainline is v18; parallel waves hold v19 and v20. This migration jumps
  // from latest known (v18) to v21. Merge resolver note: if v19/v20 land before this, split this
  // block into chained v18->v19 (their wave) ->v19->v20 (their wave) ->v20->v21 (this block renumbered)
  // and adjust SCHEMA_VERSION sequencing accordingly. Splitting is mechanical: rename the version guard
  // below and preserve ordering.
  // Seeds empty coalition array and empty intra-party election arrays; backfills Party leadership fields
  // (chairId/viceChairId/treasurerId/committeeIds) and PartyRegion chair fields so older saves load.
  if (save.schemaVersion < 21) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["statePartyElections"])) w["statePartyElections"] = [];
    if (!Array.isArray(w["nationalPartyElections"])) w["nationalPartyElections"] = [];
    if (!Array.isArray(w["nationalCommitteeElections"])) w["nationalCommitteeElections"] = [];
    if (!Array.isArray(w["coalitions"])) w["coalitions"] = [];
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    if (parties) {
      for (const p of Object.values(parties)) {
        if (!("chairId" in p) || p["chairId"] === undefined) p["chairId"] = null;
        if (!("viceChairId" in p) || p["viceChairId"] === undefined) p["viceChairId"] = null;
        if (!("treasurerId" in p) || p["treasurerId"] === undefined) p["treasurerId"] = null;
        if (!Array.isArray(p["committeeIds"])) p["committeeIds"] = [];
      }
    }
    const partyRegions = w["partyRegions"] as Record<string, Record<string, unknown>> | undefined;
    if (partyRegions) {
      for (const pr of Object.values(partyRegions)) {
        if (!("chairId" in pr) || pr["chairId"] === undefined) pr["chairId"] = null;
        if (!("viceChairId" in pr) || pr["viceChairId"] === undefined) pr["viceChairId"] = null;
        if (!("treasurerId" in pr) || pr["treasurerId"] === undefined) pr["treasurerId"] = null;
      }
    }
    // Ensure v19/v20 gaps are marked as passed through for chained migration tests
    save.world.meta.schemaVersion = 21;
  }
  // v21 -> v22: W23 parliamentary government - add the new `governments`
  // map (empty for every pre-existing save; entries are lazily created by
  // government/phases.ts governmentFormationPhase the next time it runs for
  // each of UK/RU/DD, exactly as a fresh world leaves it empty at creation -
  // see world.ts's `governments: {}` comment). Pre-allocated v22 for this
  // wave; v21 is held by a parallel wave that had not merged as of W23, so
  // this block jumps straight from v20 to v22 rather than chaining through
  // an intermediate v21 step. RESOLVER NOTE: this block only touches the
  // `governments` field. On merging the v21 wave, re-chain in strict
  // ascending schemaVersion order (v20 -> v21 -> v22) and confirm v21 does
  // not also introduce a field named `governments` (it should not; W23 is
  // authoritative for that name) - if it does, keep both blocks but resolve
  // the name collision before merging rather than silently letting the
  // later block clobber the earlier one.
  if (save.schemaVersion < 22) {
    const w = save.world as unknown as Record<string, unknown>;
    if (w["governments"] == null || typeof w["governments"] !== "object") {
      w["governments"] = {};
    }
    save.world.meta.schemaVersion = 22;
  }
  // v22 -> v23: W24 presidential cluster (election, succession, impeachment,
  // central-bank chair-appointment attribution). Pre-allocated v23: mainline
  // is v21; a parallel wave holds v22. This migration jumps straight from
  // latest-known (v21) to v23. RESOLVER NOTE: if the v22 wave lands first,
  // split this block into chained v21->v22 (their wave) -> v22->v23 (this
  // block, renumbered) and confirm v22 does not also introduce a field named
  // `executives`, `impeachments`, or `chairAppointedBy` (it should not; W24
  // is authoritative for those names). Splitting is mechanical: rename the
  // version guard below and preserve ordering, same pattern as the v20/v21
  // split note above.
  if (save.schemaVersion < 23) {
    const w = save.world as unknown as Record<string, unknown>;
    if (w["executives"] == null || typeof w["executives"] !== "object" || Array.isArray(w["executives"])) {
      w["executives"] = {};
    }
    if (!Array.isArray(w["impeachments"])) w["impeachments"] = [];
    const centralBanks = w["centralBanks"] as Record<string, Record<string, unknown>> | undefined;
    if (centralBanks) {
      for (const bank of Object.values(centralBanks)) {
        if (!("chairAppointedBy" in bank) || bank["chairAppointedBy"] === undefined) {
          bank["chairAppointedBy"] = null;
        }
      }
    }
    save.world.meta.schemaVersion = 23;
  }
  // v23 -> v24: pre-allocated for parallel wave (holds v24) - no fields added
  // by this wave. This stub preserves chained migration ordering: latest is 25.
  // RESOLVER NOTE: if the v24 wave lands first with real fields, its block
  // replaces this stub and the v25 guard below is renumbered from 25 to
  // 24->25 accordingly; no name collision expected (W29 owns cabinetMembers,
  // cabinetNominations, supremeCourtSeats, scotusNominations, docketCases,
  // ukJudicialReviewCases). Verify ascending schemaVersion order (v23 -> v24 -> v25)
  // and that v24 does not introduce any of those names.
  if (save.schemaVersion < 24) {
    save.world.meta.schemaVersion = 24;
  }
  // v24 -> v25: W29 cabinet + judiciary (cabinetMembers, cabinetNominations,
  // supremeCourtSeats, scotusNominations, docketCases, ukJudicialReviewCases).
  // Ports src/lib/db/types/cabinet.ts, src/lib/db/types/scotus.ts,
  // src/lib/turn/scotusTurn.ts, src/lib/turn/ukJrSurpriseTurn.ts.
  // Main v23; parallel wave holds v24; this wave is pre-allocated v25.
  if (save.schemaVersion < 25) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["cabinetMembers"])) w["cabinetMembers"] = [];
    if (!Array.isArray(w["cabinetNominations"])) w["cabinetNominations"] = [];
    if (!Array.isArray(w["supremeCourtSeats"])) w["supremeCourtSeats"] = [];
    if (!Array.isArray(w["scotusNominations"])) w["scotusNominations"] = [];
    if (!Array.isArray(w["docketCases"])) w["docketCases"] = [];
    if (!Array.isArray(w["ukJudicialReviewCases"])) w["ukJudicialReviewCases"] = [];
    save.world.meta.schemaVersion = 25;
  }
  // v25 -> v26: W10 markets (share price, stock exchange). Main is v25 as of
  // this wave's branch point; a parallel wave holds v27. Pre-allocated v26
  // for this wave. RESOLVER NOTE: if the v26 slot is claimed by another wave
  // first, renumber this block to v26->v27 (chained after theirs) and
  // confirm they do not also add tickerSymbol/totalShares/sharePrice/
  // fundamentalSharePrice/shareholders/publicFloat/earningsHistory to
  // Corporation (they should not; W10 is authoritative for those names).
  //
  // Backfills every existing corp with the market fields founding.ts now
  // seeds for brand-new worlds (same formula, same citations - see
  // founding.ts "W10: founder/public-float share split" comment): 51% NPC /
  // 49% public float of CEO_INITIAL_SHARES, initial price from
  // liquidCapital/totalShares floored at DEFAULT_SHARE_PRICE, empty rolling
  // earnings history (the corp has not had a market-aware corporationTurn
  // run yet, so there is nothing to seed it with - the next turn's
  // corporationTurnPhase starts populating it). A save with NO corporations
  // yet (pre-v19, upgraded straight through) has nothing to backfill; the
  // v18->v19 block above already produces fully market-seeded corps via the
  // same shared founding.ts path.
  if (save.schemaVersion < 26) {
    const w = save.world as unknown as Record<string, unknown>;
    const corporations = w["corporations"] as Record<string, Record<string, unknown>> | undefined;
    if (corporations) {
      for (const corp of Object.values(corporations)) {
        if (typeof corp["totalShares"] === "number") continue; // already market-seeded
        const countryId = corp["countryId"] as string;
        const sectorType = corp["sectorType"] as CorporationType;
        const liquidCapital = typeof corp["liquidCapital"] === "number" ? (corp["liquidCapital"] as number) : 0;
        const totalShares = CEO_INITIAL_SHARES;
        const npcShares = Math.floor(totalShares * NPC_FOUNDER_SHARE_FRACTION);
        const publicFloatShares = totalShares - npcShares;
        const initialSharePrice = Math.max(
          DEFAULT_SHARE_PRICE,
          Math.round((liquidCapital / totalShares) * 100) / 100,
        );
        corp["tickerSymbol"] = tickerForSector(countryId, sectorType);
        corp["totalShares"] = totalShares;
        corp["sharePrice"] = initialSharePrice;
        corp["fundamentalSharePrice"] = initialSharePrice;
        const shareholders: ShareholderEntry[] = [{ holder: "npc", shares: npcShares }];
        corp["shareholders"] = shareholders;
        corp["publicFloat"] = publicFloatShares;
        corp["earningsHistory"] = [];
      }
    }
    save.world.meta.schemaVersion = 26;
  }
  // v25 -> v26: pre-allocated for parallel wave (holds v26) - no fields added
  // by this wave. This stub preserves chained migration ordering: latest is 27.
  // RESOLVER NOTE: if the v26 wave lands first with real fields, its block
  // replaces this stub and the v27 guard below is renumbered from 27 to
  // 26->27 accordingly; no name collision expected (W31 owns worldEventLedger,
  // activeWorldModifiers, crises, playerEventLog). Verify ascending schemaVersion
  // order (v25 -> v26 -> v27) and that v26 does not introduce any of those names.
  if (save.schemaVersion < 26) {
    save.world.meta.schemaVersion = 26;
  }
  // v26 -> v27: W31 events cluster (worldEventLedger, activeWorldModifiers,
  // crises, playerEventLog). Ports src/lib/events/worldEvents/definitions.ts
  // WORLD_EVENT_SEED_DEFINITIONS (20 kinds), src/lib/events/pree/*
  // (player random events), src/lib/crises/templates.ts (8 templates),
  // src/lib/turn/crisisTurn.ts lifecycle, and
  // src/lib/events/substrate/countryModifiers.ts modifiers.
  // Main v25; parallel wave holds v26; this wave is pre-allocated v27.
  if (save.schemaVersion < 27) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["worldEventLedger"] !== "object" || w["worldEventLedger"] === null || Array.isArray(w["worldEventLedger"])) {
      w["worldEventLedger"] = {};
    }
    if (!Array.isArray(w["activeWorldModifiers"])) w["activeWorldModifiers"] = [];
    if (!Array.isArray(w["crises"])) w["crises"] = [];
    if (!Array.isArray(w["playerEventLog"])) w["playerEventLog"] = [];
    save.world.meta.schemaVersion = 27;
  }
  // v27 -> v28: W12 private banking (merged in ahead of this wave - see
  // world.ts SCHEMA_VERSION file doc: main landed v28 while this wave was
  // pre-allocated v29, so the v27->v28 stub originally written here is
  // replaced by the real banking migration below; W30's block chains on top
  // as v28->v29, unaffected since it only touches governors/
  // governorAddresses/governorOrders - no name collision with banking's
  // player.savings/savingsHolder, world.bankLoans/depositInsurance, or
  // centralBank.externalBroadMoney). Adds the fields bankingTurnPhase/
  // bankSolvencyTurnPhase read. Deliberately does NOT retroactively charter
  // any bank on an existing save - bankCharter is optional
  // (corporation/types.ts), both new phases no-op on a corp without one, and
  // seedNpcBanks moves real cash out of a corp's liquidCapital, which is not
  // something a load-time migration should spring on an existing world.
  // Banks only ever appear on worlds CREATED after this wave.
  if (save.schemaVersion < 28) {
    const w = save.world as unknown as Record<string, unknown>;
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player) {
      if (typeof player["savings"] !== "number") player["savings"] = 0;
      if (typeof player["savingsHolder"] !== "string") player["savingsHolder"] = "centralBank";
    }
    if (!Array.isArray(w["bankLoans"])) w["bankLoans"] = [];
    if (typeof w["depositInsurance"] !== "object" || w["depositInsurance"] === null) {
      w["depositInsurance"] = {};
    }
    const countries = w["countries"] as Record<string, { economy?: { gdp?: number } }> | undefined;
    const centralBanks = w["centralBanks"] as Record<string, Record<string, unknown>> | undefined;
    if (centralBanks) {
      for (const [countryId, bank] of Object.entries(centralBanks)) {
        if (typeof bank["externalBroadMoney"] === "number") continue;
        const gdp = countries?.[countryId]?.economy?.gdp ?? 0;
        bank["externalBroadMoney"] = Math.round(gdp * 1_000_000 * EXTERNAL_BROAD_MONEY_GDP_SHARE);
      }
    }
    save.world.meta.schemaVersion = 28;
  }
  // v28 -> v29: W30 governor cluster (governors, governorAddresses,
  // governorOrders). Ports src/lib/db/types/electedOfficial.ts officeType
  // "governor" per state, src/lib/db/types/governorOfficeState.ts,
  // src/lib/constants/governorOffice.ts (GUBERNATORIAL_ACTION_*),
  // src/lib/governorOffice/*.ts powers, and src/lib/turn/byElections.ts
  // special_governor watcher. This wave was pre-allocated v29 when main was
  // v27; W12 banking landed v28 first, and mainline deliberately left its own
  // v28->v29 chain slot as a no-op stub reserved for this wave (see the
  // resolver note that used to live here: "if the v29 wave lands first with
  // real fields, its block replaces this stub"). Reconciliation fills that
  // reserved slot in place - no renumbering. Chained migration: this block
  // only touches governors, governorAddresses, governorOrders - confirmed no
  // collision with unions (v30), bonds (v31), exchangeRates (v32), or the W6
  // metric engine fields (v33), which chain unchanged below. Seeded from
  // world.regions: one vacant office per US state (governorId null, AP capped)
  // mirroring world.ts seedGovernors. Existing saves with US regions get the
  // same vault; saves without US regions get empty maps/arrays.
  if (save.schemaVersion < 29) {
    const w = save.world as unknown as Record<string, unknown>;
    const regions = w["regions"] as Record<string, { countryId: string }> | undefined;
    if (typeof w["governors"] !== "object" || w["governors"] === null || Array.isArray(w["governors"])) {
      const governors: Record<string, unknown> = {};
      if (regions) {
        for (const [rid, region] of Object.entries(regions)) {
          if (region.countryId !== "US") continue;
          governors[rid] = {
            stateId: rid,
            countryId: "US",
            governorId: null,
            governorParty: null,
            governorName: null,
            termStartTurn: null,
            gubernatorialActions: 3,
            lastActionGrantedTurn: typeof (w["meta"] as Record<string, unknown> | undefined)?.["turn"] === "number" ? ((w["meta"] as Record<string, unknown>)["turn"] as number) : 0,
            lastAddressTurn: null,
          };
        }
      }
      w["governors"] = governors;
    }
    if (!Array.isArray(w["governorAddresses"])) w["governorAddresses"] = [];
    if (!Array.isArray(w["governorOrders"])) w["governorOrders"] = [];
    save.world.meta.schemaVersion = 29;
  }
  // v29 -> v30: W15 unions. This is the real migration that now runs right
  // after W30 governors' v28->v29 above (mainline's own v28->v29 slot, which
  // used to be a stub reserved for this wave, is gone now that the governor
  // block fills it - see that block's comment). Chain order preserved: v28 ->
  // v29 (governors) -> v30 (unions) -> v31 (bonds) -> v32 (forex) -> v33
  // (metric engine), matching mainline exactly. Confirmed no name collision
  // with governors/governorAddresses/governorOrders.
  //
  // Seeds unions for every playable country's nonzero-weight 1953 sector,
  // exactly as world.ts createWorld does (same founding helper, same
  // deterministic id `${countryId}-${sectorType}`). A save that already has
  // unions (e.g. re-saving after this wave) is left untouched; a save
  // upgraded through v28 (or earlier) that has no unions yet gets a full
  // seeded roster so the unionsTurnPhase has something to tick. No rng is
  // consumed here — union founding is deterministic given countries, so a
  // migration must not disturb world.meta.rng (the live turn rng stream).
  if (save.schemaVersion < 30) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["unions"] !== "object" || w["unions"] === null || Array.isArray(w["unions"])) {
      const countries = w["countries"] as Record<string, { id: string; playable: boolean }> | undefined;
      const era = typeof (w["meta"] as Record<string, unknown> | undefined)?.["era"] === "string"
        ? ((w["meta"] as Record<string, unknown>)["era"] as string)
        : "1953";
      const unions = countries
        ? seedUnions(
            Object.values(countries).map((c) => ({ id: c.id, playable: c.playable })),
            era,
          )
        : {};
      w["unions"] = unions;
    } else {
      // Backfill any missing defaults on existing union docs (so a hand-edited or
      // partially-written save that somehow has unions but missing fields still loads).
      const unions = w["unions"] as Record<string, Record<string, unknown>>;
      for (const u of Object.values(unions)) {
        if (typeof u["treasury"] !== "number") u["treasury"] = 500;
        if (typeof u["approval"] !== "number") u["approval"] = 55;
        if (typeof u["duesPerWorkerAnnual"] !== "number") u["duesPerWorkerAnnual"] = 0;
        if (!Array.isArray(u["activeServices"])) u["activeServices"] = [];
        if (typeof u["politicalContributionPct"] !== "number") u["politicalContributionPct"] = 0;
        if (typeof u["unionization"] !== "number") u["unionization"] = 25;
        if (!("ownerType" in u) || (u["ownerType"] !== "npp" && u["ownerType"] !== "player" && u["ownerType"] !== null)) {
          if (u["ownerType"] === undefined) u["ownerType"] = null;
        }
        if (!("ownerId" in u) || (typeof u["ownerId"] !== "string" && u["ownerId"] !== null)) {
          if (u["ownerId"] === undefined) u["ownerId"] = null;
        }
        if (typeof u["createdAtTurn"] !== "number") u["createdAtTurn"] = 0;
        if (typeof u["updatedAtTurn"] !== "number") u["updatedAtTurn"] = 0;
      }
    }
    save.world.meta.schemaVersion = 30;
  }
  // v30 -> v31: W13 bonds. Pre-allocated v31 for this wave; main is v30;
  // parallel wave holds v29 which will insert earlier in the chain (between
  // v28 and v30). This is the latest migration, jumping from latest known
  // (v30) to v31. RESOLVER NOTE: on merge, chain in strict ascending order
  // (v28 -> v29 -> v30 -> v31) and confirm v29 does not also introduce a
  // field named `bonds` (it should not; W13 is authoritative for that name).
  // If the parallel v29 wave lands first with real fields, its block replaces
  // the existing v28->v29 stub and this block remains v30->v31 — no renumbering
  // needed beyond verifying ascending order. Splitting is mechanical: rename
  // the version guard below if needed and preserve ordering, same pattern as
  // the v28->v30 chain above.
  //
  // Seeds empty bonds map (no retroactive issuance — existing saves had no
  // bonds to represent, and the quarterly auction will issue the first tranche
  // on the next turn that is %12==0). Backfills any partially-present bond docs
  // so a hand-edited save that somehow has bonds but missing fields still loads.
  if (save.schemaVersion < 31) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["bonds"] !== "object" || w["bonds"] === null || Array.isArray(w["bonds"])) {
      w["bonds"] = {};
    } else {
      const bonds = w["bonds"] as Record<string, Record<string, unknown>>;
      for (const [bondKey, b] of Object.entries(bonds)) {
        if (typeof b["id"] !== "string") b["id"] = String(b["id"] ?? `bond-migrated-${bondKey}`);
        if (typeof b["issuerType"] !== "string") b["issuerType"] = "sovereign";
        if (typeof b["countryId"] !== "string") b["countryId"] = "US";
        if (typeof b["issuerName"] !== "string") b["issuerName"] = b["countryId"] as string;
        if (typeof b["faceValue"] !== "number") b["faceValue"] = 1_000;
        if (typeof b["couponRate"] !== "number") b["couponRate"] = 3.0;
        if (typeof b["maturityTurns"] !== "number") b["maturityTurns"] = 48;
        if (typeof b["issuedAtTurn"] !== "number") b["issuedAtTurn"] = 0;
        if (typeof b["maturityTurn"] !== "number") b["maturityTurn"] = b["issuedAtTurn"] as number + (b["maturityTurns"] as number);
        if (typeof b["marketPrice"] !== "number") b["marketPrice"] = 1.0;
        if (typeof b["totalIssued"] !== "number") b["totalIssued"] = 1_000_000;
        if (typeof b["publicFloat"] !== "number") b["publicFloat"] = Math.floor((b["totalIssued"] as number) / 1_000);
        if (!Array.isArray(b["holders"])) b["holders"] = [];
        if (typeof b["matured"] !== "boolean") b["matured"] = false;
        if (typeof b["defaulted"] !== "boolean") b["defaulted"] = false;
        if (!("defaultedAtTurn" in b) || (b["defaultedAtTurn"] !== null && typeof b["defaultedAtTurn"] !== "number")) {
          if (b["defaultedAtTurn"] === undefined) b["defaultedAtTurn"] = null;
        }
        if (typeof b["currencyCode"] !== "string") b["currencyCode"] = "USD";
        if (typeof b["createdAt"] !== "string") b["createdAt"] = (w["meta"] as Record<string, unknown>)?.["date"] as string ?? "1953-01-06";
        if (typeof b["updatedAt"] !== "string") b["updatedAt"] = b["createdAt"] as string;
      }
    }
    save.world.meta.schemaVersion = 31;
  }
  // v31 -> v32: W4 forex (exchangeRates + ledgerPreForexSnapshot). Pre-allocated
  // v32 for this wave; main is v31; parallel wave holds v29 which will insert
  // earlier in the chain (between v28 and v30). This is the latest migration,
  // jumping from latest known (v31) to v32. RESOLVER NOTE: on merge, chain in
  // strict ascending order (v28 -> v29 -> v30 -> v31 -> v32) and confirm v29
  // does not also introduce `exchangeRates` or `ledgerPreForexSnapshot` (it
  // should not; W4 is authoritative for those names). If the parallel v29 wave
  // lands first with real fields, its block replaces the existing v28->v29 stub
  // and this block remains v31->v32 — no renumbering needed beyond verifying
  // ascending order. Splitting is mechanical: rename the version guard below if
  // needed and preserve ordering, same pattern as the v28->v30 chain above.
  //
  // Seeds exchangeRates from INITIAL_RATES_1953 (era-aware) for the era the save
  // was created in (meta.era, defaulting to "1953"). No RNG is consumed — rate
  // seeding is deterministic given era, so migration must not disturb meta.rng.
  // ledgerPreForexSnapshot is seeded null (no history needed; the next turn's
  // forex phase will overwrite it via ledgerPreForexSnapshotPhase).
  if (save.schemaVersion < 32) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["exchangeRates"] !== "object" || w["exchangeRates"] === null || Array.isArray(w["exchangeRates"])) {
      const countries = w["countries"] as Record<string, { id: string }> | undefined;
      const era = typeof (w["meta"] as Record<string, unknown> | undefined)?.["era"] === "string"
        ? ((w["meta"] as Record<string, unknown>)["era"] as string)
        : "1953";
      // Inline INITIAL_RATES_1953 copy to avoid importing at load-time (circular risk)
      const INITIAL_RATES_1953: Record<string, number> = {
        US: 1.0, UK: 0.357, JP: 360.0, DE: 4.2, IE: 0.357, BR: 18.8, CN: 2.46, NG: 0.357,
        RU: 9.0, DD: 4.2, FR: 350.0, IT: 625.0, ES: 39.6, SE: 5.17, TR: 2.8, GR: 30.0,
        AT: 26.0, FI: 230.0, PL: 24.0, CS: 27.0, RO: 13.5, HU: 20.0, BG: 15.3, YU: 16.667,
      };
      const CURRENCY_CODE_BY_COUNTRY: Record<string, string> = {
        US: "USD", UK: "GBP", JP: "JPY", DE: "EUR", IE: "IEP", BR: "BRL", CN: "CNY", NG: "NGN",
        RU: "SUR", DD: "DDM", FR: "FRF", IT: "ITL", ES: "ESP", SE: "SEK", TR: "TRL", GR: "GRD",
        AT: "ATS", FI: "FIM", PL: "PLZ", CS: "CSK", RO: "ROL", HU: "HUF", BG: "BGL", YU: "YUD",
      };
      const regimeForEra = (e: string) => (e === "1953" || e === "1960" ? "pegged" : "floating");
      const exchangeRates: Record<string, unknown> = {};
      const ids = countries ? Object.keys(countries) : Object.keys(INITIAL_RATES_1953);
      const meta = w["meta"] as Record<string, unknown> | undefined;
      const turn = typeof meta?.["turn"] === "number" ? (meta["turn"] as number) : 0;
      for (const cid of ids) {
        const baseRate = INITIAL_RATES_1953[cid] ?? 1;
        const currencyCode = CURRENCY_CODE_BY_COUNTRY[cid] ?? "USD";
        exchangeRates[cid] = {
          countryId: cid,
          currencyCode,
          rate: baseRate,
          baseRate,
          macroTarget: baseRate,
          rateHistory: [{ turn, rate: baseRate }],
          regime: regimeForEra(era),
          updatedTurn: turn,
        };
      }
      w["exchangeRates"] = exchangeRates;
    } else {
      // Backfill missing fields on existing exchangeRates docs
      const exchangeRates = w["exchangeRates"] as Record<string, Record<string, unknown>>;
      const meta = w["meta"] as Record<string, unknown> | undefined;
      const era = typeof meta?.["era"] === "string" ? (meta["era"] as string) : "1953";
      const regimeForEra2 = (e: string) => (e === "1953" || e === "1960" ? "pegged" : "floating");
      for (const ex of Object.values(exchangeRates)) {
        if (typeof ex["countryId"] !== "string") ex["countryId"] = String(ex["countryId"] ?? "US");
        if (typeof ex["currencyCode"] !== "string") ex["currencyCode"] = "USD";
        if (typeof ex["rate"] !== "number" || !Number.isFinite(ex["rate"])) ex["rate"] = typeof ex["baseRate"] === "number" ? (ex["baseRate"] as number) : 1;
        if (typeof ex["baseRate"] !== "number" || !Number.isFinite(ex["baseRate"])) ex["baseRate"] = ex["rate"] as number;
        if (typeof ex["macroTarget"] !== "number" || !Number.isFinite(ex["macroTarget"])) ex["macroTarget"] = ex["baseRate"] as number;
        if (!Array.isArray(ex["rateHistory"])) ex["rateHistory"] = [{ turn: typeof meta?.["turn"] === "number" ? (meta["turn"] as number) : 0, rate: ex["rate"] as number }];
        if (ex["regime"] !== "pegged" && ex["regime"] !== "floating") ex["regime"] = regimeForEra2(era);
        if (typeof ex["updatedTurn"] !== "number") ex["updatedTurn"] = typeof meta?.["turn"] === "number" ? (meta["turn"] as number) : 0;
      }
    }
    if (!("ledgerPreForexSnapshot" in w) || (w["ledgerPreForexSnapshot"] !== null && typeof w["ledgerPreForexSnapshot"] !== "object")) {
      w["ledgerPreForexSnapshot"] = null;
    }
    save.world.meta.schemaVersion = 32;
  }
  // v32 -> v33: W6 metric engine cluster. Pre-allocated v33 for this wave; main is v32;
  // parallel wave holds v29 which will insert earlier in the chain (between v28
  // and v30). This is the latest migration, jumping from latest known (v32) to v33.
  // RESOLVER NOTE: on merge, chain in strict ascending order
  // (v28 -> v29 -> v30 -> v31 -> v32 -> v33) and confirm v29 does not also introduce
  // `nationalMetrics`, `economicModels`, `commodityPriceHistory`, `economicVitalSigns`,
  // or `vitalSignsHistory` (it should not; W6 is authoritative for those names). If the
  // parallel v29 wave lands first with real fields, its block replaces the existing
  // v28->v29 stub and this block remains v32->v33 — no renumbering needed beyond
  // verifying ascending order. Splitting is mechanical: rename the version guard below
  // if needed and preserve ordering, same pattern as the v28->v30 chain above.
  //
  // Seeds empty nationalMetrics/economicModels, commodityPriceHistory from base prices,
  // and vital signs null/history. No RNG consumed — seeding is deterministic.
  if (save.schemaVersion < 33) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["nationalMetrics"] !== "object" || w["nationalMetrics"] === null || Array.isArray(w["nationalMetrics"])) {
      w["nationalMetrics"] = {};
    }
    if (typeof w["economicModels"] !== "object" || w["economicModels"] === null || Array.isArray(w["economicModels"])) {
      w["economicModels"] = {};
    }
    if (typeof w["commodityPriceHistory"] !== "object" || w["commodityPriceHistory"] === null || Array.isArray(w["commodityPriceHistory"])) {
      const commodityPrices = w["commodityPrices"] as Record<string, { basePrice?: number; globalPrice?: number; turn?: number }> | undefined;
      const meta = w["meta"] as Record<string, unknown> | undefined;
      const turn = typeof meta?.["turn"] === "number" ? (meta["turn"] as number) : 0;
      const history: Record<string, unknown> = {};
      if (commodityPrices) {
        for (const [k, v] of Object.entries(commodityPrices)) {
          const price = typeof v.globalPrice === "number" ? v.globalPrice : (typeof v.basePrice === "number" ? v.basePrice : 0);
          history[k] = [{ turn, price }];
        }
      }
      w["commodityPriceHistory"] = history;
    } else {
      const history = w["commodityPriceHistory"] as Record<string, unknown[]>;
      for (const arr of Object.values(history)) {
        if (!Array.isArray(arr)) continue;
        for (const entry of arr as Array<Record<string, unknown>>) {
          if (typeof entry["turn"] !== "number") entry["turn"] = 0;
          if (typeof entry["price"] !== "number" || !Number.isFinite(entry["price"])) entry["price"] = 0;
        }
      }
    }
    if (!("economicVitalSigns" in w) || (w["economicVitalSigns"] !== null && typeof w["economicVitalSigns"] !== "object")) {
      w["economicVitalSigns"] = null;
    }
    if (!Array.isArray(w["vitalSignsHistory"])) w["vitalSignsHistory"] = [];
    // Backfill investorConfidence on budgets (optional field)
    const budgets = w["budgets"] as Record<string, Record<string, unknown>> | undefined;
    if (budgets) {
      for (const b of Object.values(budgets)) {
        if (typeof b["investorConfidence"] !== "number" || !Number.isFinite(b["investorConfidence"])) {
          // Leave absent — healed only when set; no invented default beyond seed absence
        }
      }
    }
    save.world.meta.schemaVersion = 33;
  }
  // v32 -> v33: pre-allocated for a parallel wave (holds v33) — no fields
  // added by this batch. This stub preserves chained migration ordering:
  // latest is 34. RESOLVER NOTE: if the v33 wave lands first with real
  // fields, its block replaces this stub and the v34 guard below is
  // renumbered from 34 to 33->34 accordingly; no name collision expected
  // (this batch — W7/W8/W14 — owns commandEconomy, capitalStock,
  // capitalGrowth, unownedSectors, budgets[].stateOwnershipConcentration,
  // centralBanks[].tradeGrowth). Verify ascending schemaVersion order
  // (v32 -> v33 -> v34) and that v33 does not introduce any of those names.
  if (save.schemaVersion < 33) {
    save.world.meta.schemaVersion = 33;
  }
  // v33 -> v34: batch W7 command economy + W8 trade + W14 sector cleanup.
  // Pre-allocated v34 for this batch; main is v32; parallel wave holds v33
  // (stub above). This is the latest migration, jumping from latest known
  // (v32, via the v33 stub) to v34.
  //
  // Adds:
  //  - `commandEconomy`: one entry per country carrying a
  //    MARKETIZATION_SCHEDULE row (RU/DD in the 1953 pack — see
  //    commandEconomy/constants.ts). Backfilled at the era-schedule level for
  //    the save's meta.era (defaulting "1953"), same seed world.ts uses for a
  //    fresh world — a save with neither RU nor DD playable gets an empty map.
  //  - `capitalStock` (per region) and `capitalGrowth` (per country, empty —
  //    the next advanceCapitalStockPhase run populates it): capitalStock is
  //    backfilled at CAPITAL_OUTPUT_RATIO_TARGET × the region's current gdp
  //    (economy/capitalStock.ts seedCapitalStock — the same steady-state seed
  //    a fresh world uses), not turn 0's gdp, so a mid-campaign save doesn't
  //    understate an economy that has grown since founding.
  //  - `unownedSectors`: one pool per existing corp, backfilled at parity with
  //    that corp's CURRENT revenue × GROWTH_RATE_TURNS_PER_YEAR (annualized) —
  //    the closest analogue available at load time to world.ts's founding-time
  //    seed (foundingRevenue is not reconstructable for an existing corp).
  //  - `budgets[countryId].stateOwnershipConcentration`: backfilled 0 (it is
  //    recomputed fresh next turn by stateOwnershipConcentrationPhase).
  //  - `centralBanks[countryId].tradeGrowth`: backfilled from the paired
  //    budget's economicFactors.tradeGrowth (the mirror phase's own logic),
  //    or 0 when no budget exists.
  //
  // No RNG is consumed — every backfill is deterministic given the save's
  // existing state, so migration must not disturb world.meta.rng.
  if (save.schemaVersion < 34) {
    const w = save.world as unknown as Record<string, unknown>;
    const countries = w["countries"] as Record<string, { id: string; playable: boolean }> | undefined;
    const regions = w["regions"] as Record<string, { countryId: string; gdp?: number }> | undefined;
    const budgets = w["budgets"] as Record<string, { economicFactors?: { tradeGrowth?: number }; stateOwnershipConcentration?: number }> | undefined;
    const centralBanksW = w["centralBanks"] as Record<string, Record<string, unknown>> | undefined;
    const corporationsW = w["corporations"] as Record<string, { countryId: string; sectorType: string; revenue: number }> | undefined;
    const meta = w["meta"] as Record<string, unknown> | undefined;
    const era = typeof meta?.["era"] === "string" ? (meta["era"] as string) : "1953";
    const currentYear = era === "1953" ? 1953 : era === "1960" ? 1960 : Number(era) || 1953;

    if (typeof w["commandEconomy"] !== "object" || w["commandEconomy"] === null || Array.isArray(w["commandEconomy"])) {
      const commandEconomy: Record<string, unknown> = {};
      for (const countryId of Object.keys(MARKETIZATION_SCHEDULE)) {
        if (!countries?.[countryId]?.playable) continue;
        commandEconomy[countryId] = {
          countryId,
          marketizationLevel: scheduledMarketizationLevel(countryId, currentYear),
          monetaryOverhang: 0,
          shortageIndex: 0,
          blackMarketPremium: 0,
          secondEconomyShare: 0,
          blackMarketPressureBase: 0,
          blackMarketPressureEffective: 0,
          governmentReformism: NPP_DEFAULT_REFORMISM,
          internalRepression: NPP_DEFAULT_INTERNAL_REPRESSION,
          budgetSoftness: NPP_DEFAULT_BUDGET_SOFTNESS,
        };
      }
      w["commandEconomy"] = commandEconomy;
    }

    if (typeof w["capitalStock"] !== "object" || w["capitalStock"] === null || Array.isArray(w["capitalStock"])) {
      const capitalStock: Record<string, number> = {};
      if (regions) {
        for (const [rid, region] of Object.entries(regions)) {
          capitalStock[rid] = seedCapitalStock(region.gdp ?? 0);
        }
      }
      w["capitalStock"] = capitalStock;
    }
    if (typeof w["capitalGrowth"] !== "object" || w["capitalGrowth"] === null || Array.isArray(w["capitalGrowth"])) {
      w["capitalGrowth"] = {};
    }

    if (typeof w["unownedSectors"] !== "object" || w["unownedSectors"] === null || Array.isArray(w["unownedSectors"])) {
      const unownedSectors: Record<string, unknown> = {};
      if (corporationsW) {
        for (const corp of Object.values(corporationsW)) {
          const key = `${corp.countryId}:${corp.sectorType}`;
          unownedSectors[key] = {
            countryId: corp.countryId,
            sectorType: corp.sectorType,
            revenue: Math.round((corp.revenue ?? 0) * 48),
          };
        }
      }
      w["unownedSectors"] = unownedSectors;
    }

    if (budgets) {
      for (const budget of Object.values(budgets)) {
        if (typeof budget.stateOwnershipConcentration !== "number") budget.stateOwnershipConcentration = 0;
      }
    }
    if (centralBanksW) {
      for (const [countryId, bank] of Object.entries(centralBanksW)) {
        if (typeof bank["tradeGrowth"] !== "number") {
          bank["tradeGrowth"] = budgets?.[countryId]?.economicFactors?.tradeGrowth ?? 0;
        }
      }
    }

    save.world.meta.schemaVersion = 34;
  }
  // v33 -> v34: pre-allocated for parallel wave (holds v34) — no fields added
  // by this wave. This stub preserves chained migration ordering: latest is
  // 38 (W41 WorldHistory). RESOLVER NOTE: if the v34 wave lands first with
  // real fields, its block replaces this stub and the guards below are
  // unaffected (each is a distinct `< N` check); verify ascending
  // schemaVersion order (v33 -> v34 -> v35 -> v36 -> v37 -> v38) and that
  // v34 does not introduce a field named `history` (it should not; W41 is
  // authoritative for that name).
  if (save.schemaVersion < 34) {
    save.world.meta.schemaVersion = 34;
  }
  // v34 -> v35: batch of four waves (W25 referendums, W40 subnational
  // compositions, W22 candidate-lifecycle leftovers, W33 era crossing). Fills
  // the v34->v35 stub reserved above (this branch's checkpoint held it as
  // v32->v35 directly, back when main was v32; the merge resolver split that
  // single jump into this v34->v35 block, chaining after the real v33->v34
  // W7/W8/W14 migration and the v33->v34 stub, same splitting pattern as
  // every earlier multi-wave schema bump in this file (e.g. the v28->v32
  // chain above).
  //
  // Backfills, none of which touch meta.rng (no RNG consumed by a migration,
  // ever, per this file's determinism contract):
  //  - `referendums`: new top-level array (W25), empty for every existing
  //    save — there was never a producer for a referendum record before this
  //    wave. See referendum/types.ts.
  //  - `regions[SCO|WAL|NIR].independenceDesire`: new optional per-region
  //    field (W25), only for UK's three devolved regions (see
  //    devolution/independenceDesireDrift.ts UK_DEVOLUTION_REGIONS). Backfilled
  //    to MEAN_REVERSION_TARGET (25) — the same neutral seed a freshly
  //    created world starts from (see devolution/independenceDesireDrift.ts
  //    runIndependenceDesireDrift `previous ?? MEAN_REVERSION_TARGET`), so an
  //    old save's first post-migration turn drifts identically to a new
  //    world's first turn rather than starting from an arbitrary 0.
  //  - `player.autoRunForReelection` (W22): defaults false — an old save's
  //    player never had this flag, and false matches mainline's own default
  //    (src/lib/turn/autoReelectionEntry.ts:58), so behavior is unchanged
  //    until the player explicitly opts in.
  //  - `meta.lastEra` (W33): the eraCrossing guard field. Backfilled to the
  //    save's CURRENT `meta.era` (not the world's starting era, which this
  //    migration cannot recover) — this is deliberate: it means an old save
  //    that is already past a threshold never fires a spurious "new era
  //    begins" news post for an era it has been in for a while, exactly as
  //    mainline's own `lastEraCrossedYear` guard prevents re-announcing an
  //    era the world already occupies. Only a genuinely NEW crossing after
  //    the migration fires the announcement.
  //  - W40 (subnational chamber elections) and the rest of W22 (candidate
  //    party-sweep, staleCandidateCleanup) need no schema field: they are
  //    pure behavior changes over `world.elections`/`world.politicians`,
  //    which already exist on every save from v13 onward.
  if (save.schemaVersion < 35) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["referendums"])) {
      w["referendums"] = [];
    }
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    if (regions) {
      for (const regionId of ["SCO", "WAL", "NIR"]) {
        const region = regions[regionId];
        if (region && typeof region["independenceDesire"] !== "number") {
          region["independenceDesire"] = 25; // MEAN_REVERSION_TARGET
        }
      }
    }
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player["autoRunForReelection"] !== "boolean") {
      player["autoRunForReelection"] = false;
    }
    const meta = w["meta"] as Record<string, unknown> | undefined;
    if (meta && typeof meta["lastEra"] !== "string") {
      meta["lastEra"] = meta["era"];
    }
    save.world.meta.schemaVersion = 35;
  }
  // v35 -> v36: W11 (extraction/prospecting) + W35 (player wealth, international
  // wires, achievements) batch. Pre-allocated v36; main is v33 as of this
  // wave's branch point (heading to v34 next); a separate parallel wave holds
  // v35. This is the latest migration, jumping from latest known (v33) to v36
  // via the two stubs above. RESOLVER NOTE: on merge, chain in strict
  // ascending order (v33 -> v34 -> v35 -> v36) and confirm neither v34 nor
  // v35 also introduces `prospectingSurveys`, `stateResourceCapacities`,
  // `achievementsEarned`, `actionCounts`, `wireQuotaUsedAnchor`,
  // `wireQuotaWindowStartTurn`, or politician `cash` (they should not; this
  // wave is authoritative for those names).
  //
  // Seeds empty prospectingSurveys/achievementsEarned, deterministic
  // stateResourceCapacities (same seeding helper createWorld uses — no rng
  // consumed, so this does not disturb world.meta.rng), empty player
  // actionCounts + null wire-quota window, and 0 cash on every existing
  // politician (a save with no politicians array segment untouched).
  if (save.schemaVersion < 36) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["prospectingSurveys"])) w["prospectingSurveys"] = [];
    if (!Array.isArray(w["achievementsEarned"])) w["achievementsEarned"] = [];
    if (typeof w["stateResourceCapacities"] !== "object" || w["stateResourceCapacities"] === null || Array.isArray(w["stateResourceCapacities"])) {
      const regions = w["regions"] as Record<string, { id: string; countryId: string }> | undefined;
      const meta = w["meta"] as Record<string, unknown> | undefined;
      const era = typeof meta?.["era"] === "string" ? (meta["era"] as string) : "1953";
      const regionIdsByCountry = new Map<string, string[]>();
      if (regions) {
        for (const region of Object.values(regions)) {
          const list = regionIdsByCountry.get(region.countryId) ?? [];
          list.push(region.id);
          regionIdsByCountry.set(region.countryId, list);
        }
      }
      w["stateResourceCapacities"] = seedStateResourceCapacities(regionIdsByCountry, era);
    }
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player) {
      if (typeof player["actionCounts"] !== "object" || player["actionCounts"] === null || Array.isArray(player["actionCounts"])) {
        player["actionCounts"] = {};
      }
      if (typeof player["wireQuotaUsedAnchor"] !== "number") player["wireQuotaUsedAnchor"] = 0;
      if (player["wireQuotaWindowStartTurn"] === undefined) player["wireQuotaWindowStartTurn"] = null;
    }
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    if (politicians) {
      for (const pol of politicians) {
        if (typeof pol["cash"] !== "number") pol["cash"] = 0;
      }
    }
    save.world.meta.schemaVersion = 36;
  }
  // v33 -> v37: W28 (enactment depth) + W32 (cold war / world politics)
  // batch. Pre-allocated v37 for this batch; parallel waves hold v35 and
  // v36 (in-flight elsewhere, not yet on this branch's history) — this is a
  // single migration block jumping latest (33) -> 37 directly, since v34-36
  // do not exist as intermediate states on THIS branch.
  //
  // RESOLVER NOTE: on merge, chain in strict ascending order
  // (v33 -> v34 -> v35 -> v36 -> v37) verifying that whichever wave lands
  // v34/v35/v36 does NOT also introduce `policyLedger`, `ministerialOrders`,
  // `enactmentGates`, `currencyUnions`, `coldWarTension`, `nuclearPrograms`,
  // `conflicts`, `alignments`, `settlements`, or `internationalOrgs` (this
  // batch is authoritative for those names). If a parallel wave's block
  // lands first with real fields under different names, this block still
  // only needs the version guard below renumbered — the backfill logic
  // itself is additive and order-independent (every check is `if missing/
  // malformed, seed`), same pattern as every prior multi-wave resolver note
  // in this file (see v16->v17, v27->v28, v32->v33 above).
  //
  // All seeding below is deterministic — no RNG consumed, matching every
  // other migration block in this file.
  if (save.schemaVersion < 37) {
    const w = save.world as unknown as Record<string, unknown>;
    const meta = w["meta"] as Record<string, unknown> | undefined;
    const turn = typeof meta?.["turn"] === "number" ? (meta["turn"] as number) : 0;
    const countries = w["countries"] as Record<string, { playable?: boolean }> | undefined;

    // ── W28 ────────────────────────────────────────────────────────────
    if (typeof w["policyLedger"] !== "object" || w["policyLedger"] === null || Array.isArray(w["policyLedger"])) {
      w["policyLedger"] = {};
    }
    if (!Array.isArray(w["ministerialOrders"])) w["ministerialOrders"] = [];
    if (typeof w["enactmentGates"] !== "object" || w["enactmentGates"] === null || Array.isArray(w["enactmentGates"])) {
      w["enactmentGates"] = { debtCeilingCrisis: {} };
    } else {
      const gates = w["enactmentGates"] as Record<string, unknown>;
      if (typeof gates["debtCeilingCrisis"] !== "object" || gates["debtCeilingCrisis"] === null || Array.isArray(gates["debtCeilingCrisis"])) {
        gates["debtCeilingCrisis"] = {};
      }
    }
    if (typeof w["currencyUnions"] !== "object" || w["currencyUnions"] === null || Array.isArray(w["currencyUnions"])) {
      w["currencyUnions"] = {};
    }

    // ── W32 ────────────────────────────────────────────────────────────
    if (typeof w["coldWarTension"] !== "object" || w["coldWarTension"] === null || Array.isArray(w["coldWarTension"])) {
      w["coldWarTension"] = { value: TENSION_BASELINE, pressureFloor: TENSION_BASELINE, updatedTurn: turn, events: [] };
    }
    if (typeof w["nuclearPrograms"] !== "object" || w["nuclearPrograms"] === null || Array.isArray(w["nuclearPrograms"])) {
      w["nuclearPrograms"] = {};
    }
    const nuclearPrograms = w["nuclearPrograms"] as Record<string, unknown>;
    if (countries) {
      for (const countryId of NUCLEAR_CAPABLE) {
        if (!countries[countryId]?.playable) continue;
        if (!nuclearPrograms[countryId]) {
          nuclearPrograms[countryId] = { countryId, adopted: {}, warheads: 0, productionRate: 0 };
        }
      }
    }
    if (!Array.isArray(w["conflicts"])) w["conflicts"] = [];
    if (typeof w["alignments"] !== "object" || w["alignments"] === null || Array.isArray(w["alignments"])) {
      w["alignments"] = {};
    }
    const alignments = w["alignments"] as Record<string, unknown>;
    if (countries) {
      const WEST_ALIGNED = new Set(["US", "UK"]);
      const EAST_ALIGNED = new Set(["RU", "DD"]);
      for (const [countryId, country] of Object.entries(countries)) {
        if (!country.playable) continue;
        if (alignments[countryId]) continue;
        const pole = WEST_ALIGNED.has(countryId) ? "WEST" : EAST_ALIGNED.has(countryId) ? "EAST" : null;
        const raw: Partial<Record<"WEST" | "EAST", number>> = pole ? { [pole]: 100 } : {};
        const shares = normalizeShares(raw, ["WEST", "EAST"]);
        alignments[countryId] = { countryId, shares: shares.shares, nonAligned: shares.nonAligned, updatedTurn: turn };
      }
    }
    if (!Array.isArray(w["settlements"])) w["settlements"] = [];
    if (typeof w["internationalOrgs"] !== "object" || w["internationalOrgs"] === null || Array.isArray(w["internationalOrgs"])) {
      w["internationalOrgs"] = seedInternationalOrgs(countries ? Object.keys(countries) : []);
    }

    save.world.meta.schemaVersion = 37;
  }
  // v37 -> v38: W41 WorldHistory (macro, primeRate, partyStrength,
  // playerWealth, moneySupply bounded ring buffers — see history/types.ts
  // file doc). Pre-allocated v38 for this wave; main (this worktree) is
  // v33; parallel waves hold v29, v35, v36, v37 (see the stub chain above
  // and world.ts SCHEMA_VERSION file doc). This is the latest migration,
  // jumping from latest known (v33) to v38 via the v34/v35/v36/v37 stubs.
  // RESOLVER NOTE: on merge, chain in strict ascending order and confirm no
  // other wave introduces a field named `history`.
  //
  // Seeds empty history (no retroactive backfill — a save has no record of
  // its own past turns' macro/rate/PS/wealth/money values beyond what is
  // already on WorldState today, so there is nothing truthful to backfill;
  // recording starts fresh from the next advanceTurn, exactly like
  // vitalSignsHistory and CentralBank.interestRateHistory both start empty
  // on migration rather than inventing history). No RNG consumed — seeding
  // is deterministic.
  if (save.schemaVersion < 38) {
    const w = save.world as unknown as Record<string, unknown>;
    const history = w["history"] as Record<string, unknown> | undefined;
    if (typeof history !== "object" || history === null || Array.isArray(history)) {
      w["history"] = { macro: {}, primeRate: {}, partyStrength: {}, playerWealth: [], moneySupply: {} };
    } else {
      if (typeof history["macro"] !== "object" || history["macro"] === null || Array.isArray(history["macro"])) history["macro"] = {};
      if (typeof history["primeRate"] !== "object" || history["primeRate"] === null || Array.isArray(history["primeRate"])) history["primeRate"] = {};
      if (typeof history["partyStrength"] !== "object" || history["partyStrength"] === null || Array.isArray(history["partyStrength"])) history["partyStrength"] = {};
      if (!Array.isArray(history["playerWealth"])) history["playerWealth"] = [];
      if (typeof history["moneySupply"] !== "object" || history["moneySupply"] === null || Array.isArray(history["moneySupply"])) history["moneySupply"] = {};
    }
    save.world.meta.schemaVersion = 38;
  }
  // v33 -> v39: M1 (Lane 12 Head of State mode) player.hosPartyId. Pre-
  // allocated v39 (see world.ts SCHEMA_VERSION resolver note) — this batch's
  // branch point is v33, and v34-v38 are reserved for other in-flight
  // batches merging independently before this one. Guarding on `< 39` rather
  // than chaining through 34-38 is safe here because this block only adds
  // player.hosPartyId (new) and re-defends player.mode (already added at
  // v12, just re-checked): neither field is touched by any other batch's
  // migration, so this block composes cleanly regardless of merge order.
  if (save.schemaVersion < 39) {
    const w = save.world as unknown as Record<string, unknown>;
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player === "object") {
      if (player["mode"] !== "hos" && player["mode"] !== "career") player["mode"] = "career";
      if (player["hosPartyId"] !== null && typeof player["hosPartyId"] !== "string") {
        player["hosPartyId"] = null;
      }
    }
    save.world.meta.schemaVersion = 39;
  }
  // v39 -> v40: era-truth batch. Removed the fabricated "1960" content pack
  // (invented era, interpolation-derived numbers — see packs/index.ts and
  // calendar.ts for the writeup) and added real 1979/1991/2019 packs ported
  // from mainline's actual preset data.
  //
  // Adds `meta.legacyEra` (WorldState shape change, hence the bump): true
  // for any save whose `meta.era` is not one of the four real shipped pack
  // ids ("1953"/"1979"/"1991"/"2019") — in practice this can currently only
  // be "1960", the fabricated era, for saves created before this fix.
  // `false`/absent for every real-pack era. This is a pure backfill (no RNG
  // consumed, no other field touched); calendar.ts's `nextEraForDate` keeps
  // such a save's era label stable and correctly promotes it forward once
  // the in-game calendar reaches the next real era, instead of regressing
  // it back to "1953" or crashing on an unknown pack lookup.
  if (save.schemaVersion < 40) {
    const w = save.world as unknown as Record<string, unknown>;
    const meta = w["meta"] as Record<string, unknown> | undefined;
    const era = typeof meta?.["era"] === "string" ? (meta["era"] as string) : "1953";
    const REAL_PACK_ERAS = new Set(["1953", "1979", "1991", "2019"]);
    if (meta && typeof meta["legacyEra"] !== "boolean") {
      meta["legacyEra"] = !REAL_PACK_ERAS.has(era);
    }
    save.world.meta.schemaVersion = 40;
  }
  // v40 -> v41: tax-rate ladder (ticket #1102 phase-in). Adds
  // CountryBudget.taxRatePhaseIn (backfilled {}) and Bill.selectedRate
  // (optional, no backfill: pre-v41 tax bills enact at the catalog baseline).
  if (save.schemaVersion < 41) {
    const w = save.world as unknown as Record<string, unknown>;
    const budgets = w["budgets"] as Record<string, Record<string, unknown>> | undefined;
    if (budgets) {
      for (const b of Object.values(budgets)) {
        if (typeof b["taxRatePhaseIn"] !== "object" || b["taxRatePhaseIn"] === null) b["taxRatePhaseIn"] = {};
      }
    }
    save.world.meta.schemaVersion = 41;
  }
  // v41 -> v42: player-owned singleplayer simulation controls. Existing
  // saves retain the complete historical pipeline because every flag defaults
  // on. Unknown or malformed keys are discarded during migration.
  if (save.schemaVersion < 42) {
    const w = save.world as unknown as Record<string, unknown>;
    w["featureFlags"] = resolveWorldFeatureFlags();
    save.world.meta.schemaVersion = 42;
  }
  // v42 -> v43: country political overview and player home-region identity.
  // Existing saves never selected a home region, so they retain an honest
  // null until the player chooses one from the Character panel.
  // countryPolitics is backfilled by
  // deriving every gauge from the save's own live data at its current turn
  // (seedCountryOverview over the migrated world) — no RNG, no invented
  // office-holders.
  // Executives are deliberately untouched: a vacant US presidency in an old
  // save means no election seated one in that save's history, and neither
  // migration nor fresh-world overview seeding may fabricate one.
  if (save.schemaVersion < 43) {
    const w = save.world as unknown as Record<string, unknown>;
    const player = w["player"];
    if (isRecord(player) && player["homeRegionId"] === undefined) {
      player["homeRegionId"] = null;
    }
    if (!isRecord(w["countryPolitics"])) {
      w["countryPolitics"] = seedCountryPolitics(save.world);
    }
    save.world.meta.schemaVersion = 43;
  }
  // v43 -> v44: pre-v44 worlds could not enact subsidies, so the exact
  // compatible backfill is an empty collection. No RNG is consumed.
  if (save.schemaVersion < 44) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["subsidies"])) {
      const entries = Object.entries(w);
      for (const key of Object.keys(w)) delete w[key];
      for (const [key, value] of entries) {
        w[key] = value;
        if (key === "corpRevenueSnapshots") w["subsidies"] = [];
      }
      if (!Array.isArray(w["subsidies"])) w["subsidies"] = [];
    }
    save.world.meta.schemaVersion = 44;
  }
  // v44 -> v45: regional policy metric values. Existing saves have no region
  // metric history, so start with an empty map and let policyEffects populate
  // it from active regional ledger entries. No RNG is consumed.
  if (save.schemaVersion < 45) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["regionalMetrics"] !== "object" || w["regionalMetrics"] === null || Array.isArray(w["regionalMetrics"])) {
      w["regionalMetrics"] = {};
    }
    save.world.meta.schemaVersion = 45;
  }
  // v45 -> v46: source-backed market pressure state. Existing saves have no
  // executed-trade windows, multipliers, or live-price history, so they load
  // with neutral pressure and begin recording history on the next market
  // phase. No RNG is consumed and no historical signal is invented.
  if (save.schemaVersion < 46) {
    const w = save.world as unknown as Record<string, unknown>;
    const corporations = w["corporations"] as Record<string, Record<string, unknown>> | undefined;
    if (corporations) {
      for (const corp of Object.values(corporations)) {
        if (typeof corp["sentimentMultiplier"] !== "number" || !Number.isFinite(corp["sentimentMultiplier"] as number)) {
          corp["sentimentMultiplier"] = 1;
        }
        if (typeof corp["orderFlowMultiplier"] !== "number" || !Number.isFinite(corp["orderFlowMultiplier"] as number)) {
          corp["orderFlowMultiplier"] = 1;
        }
        if (typeof corp["orderFlowWindowBuyValue"] !== "number" || !Number.isFinite(corp["orderFlowWindowBuyValue"] as number)) {
          corp["orderFlowWindowBuyValue"] = 0;
        }
        if (typeof corp["orderFlowWindowSellValue"] !== "number" || !Number.isFinite(corp["orderFlowWindowSellValue"] as number)) {
          corp["orderFlowWindowSellValue"] = 0;
        }
        if (!Array.isArray(corp["priceHistory"])) {
          corp["priceHistory"] = [];
        }
      }
    }
    save.world.meta.schemaVersion = 46;
  }
  // v46 -> v47: grounded corporate-sector workforce (#296). Pre-#296 asset
  // rows carry placeholder workforce state (workers: 0, representingUnionId:
  // null, seeded by #293 before the substrate existed); no command or UI ever
  // authored those fields, so every stored pre-#47 value is placeholder, and
  // the schema version — not a magic value — is what distinguishes it from a
  // genuinely recorded 0. Recompute headcount deterministically from each
  // asset's recorded corporation (live revenue: the reference re-derives
  // headcount from live revenue every turn, so this is the steady-state
  // value, not history) and adopt the seeded union for the pair where one
  // exists, preserving any present pointer (raid preservation). Saves with no
  // materialized corporateSectors are untouched — they lazy-seed grounded
  // values on access. No RNG is consumed and no identity changes.
  if (save.schemaVersion < 47) {
    const assets = save.world.corporateSectors;
    if (assets) {
      for (const asset of Object.values(assets)) {
        asset.workers = calculateSectorWorkers(save.world.corporations[asset.corporationId]?.revenue, null);
        if (asset.representingUnionId === null || asset.representingUnionId === undefined) {
          asset.representingUnionId = initialRepresentingUnionId(save.world, asset.countryId, asset.sectorType);
        }
      }
    }
    save.world.meta.schemaVersion = 47;
  }
  // v47 -> v48: interbank loan book (#326). Pre-#326 saves have no
  // world.interbankLoans array; backfill it empty (no bank ever originated
  // an interbank loan before this wave, so empty is the true history, not a
  // default). Charter.interbankDebt already existed as an optional balance-
  // sheet field and needs no migration. No RNG is consumed.
  if (save.schemaVersion < 48) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["interbankLoans"])) w["interbankLoans"] = [];
    save.world.meta.schemaVersion = 48;
  }
  // v48 -> v49: preserve the exact capital region used by Game's NPP seed
  // route. Add residence-only geography from the same era pack where needed;
  // migration never substitutes the player's first or alphabetically first region.
  if (save.schemaVersion < 49) {
    const regions = save.world.regions;
    const authoredRegions = getPackByEra(save.world.meta.era)?.corporationHeadquartersRegions ?? [];
    for (const location of authoredRegions) {
      if (!regions[location.id]) {
        regions[location.id] = {
          id: location.id,
          countryId: location.countryId,
          name: location.name,
          corporationHeadquartersOnly: true,
          legacyProjectionDefault: true,
        };
      }
    }
    for (const corp of Object.values(save.world.corporations)) {
      const sourceHq = SOURCE_NPP_HEADQUARTERS_REGION[corp.countryId];
      if (!corp.headquartersRegionId && sourceHq && regions[sourceHq]?.countryId === corp.countryId) {
        corp.headquartersRegionId = sourceHq;
        corp.legacyProjectionDefaults = { ...corp.legacyProjectionDefaults, headquartersRegionId: true };
      }
    }
    save.world.meta.schemaVersion = 49;
  }
  // v49 -> v50: complete source headquarters geography and stable local
  // corporation display identity. Game generates thematic names and brand
  // colors at spawn; the offline engine resolves these deterministically.
  if (save.schemaVersion < 50) {
    // Early v49 files could not include US/DC because the authored region was
    // added after the CEO model. Complete the same explicit HQ geography here
    // as well, without choosing a substitute region.
    for (const location of getPackByEra(save.world.meta.era)?.corporationHeadquartersRegions ?? []) {
      if (!save.world.regions[location.id]) {
        save.world.regions[location.id] = {
          id: location.id,
          countryId: location.countryId,
          name: location.name,
          corporationHeadquartersOnly: true,
          legacyProjectionDefault: true,
        };
      }
    }
    for (const corp of Object.values(save.world.corporations)) {
      if (!corp.headquartersRegionId) {
        const sourceHq = SOURCE_NPP_HEADQUARTERS_REGION[corp.countryId];
        if (sourceHq && save.world.regions[sourceHq]?.countryId === corp.countryId) {
          corp.headquartersRegionId = sourceHq;
          corp.legacyProjectionDefaults = { ...corp.legacyProjectionDefaults, headquartersRegionId: true };
        }
      }
      const identity = corporationIdentity(corp.countryId, corp.sectorType);
      if (!corp.name) {
        corp.name = identity.name;
        corp.legacyProjectionDefaults = { ...corp.legacyProjectionDefaults, name: true };
      }
      if (!corp.brandColor) {
        corp.brandColor = identity.brandColor;
        corp.legacyProjectionDefaults = { ...corp.legacyProjectionDefaults, brandColor: true };
      }
    }
    for (const [regionId, region] of Object.entries(save.world.regions)) {
      if (region.legacyProjectionDefault !== true) continue;
      const hasRecordedHqReference = Object.values(save.world.corporations).some(
        (corp) => corp.headquartersRegionId === regionId && corp.legacyProjectionDefaults?.headquartersRegionId !== true,
      );
      if (hasRecordedHqReference) delete region.legacyProjectionDefault;
    }
    save.world.meta.schemaVersion = 50;
  }
  // v50 -> v51: persist source political dynamics, including NPP directives
  // and political boards. Keep recorded absence on legacy saves; seeding a
  // progressed game here would invent government posture, scores or history.
  if (save.schemaVersion < 51) save.world.meta.schemaVersion = 51;
  // Historical actions have no reconstructable history. Preserve absence.
  if (save.schemaVersion < 52) save.world.meta.schemaVersion = 52;
  // No creator or grace history is invented for earlier Native issuers.
  if (save.schemaVersion < 53) save.world.meta.schemaVersion = 53;
  // Source labour political snapshots and primary waves/delegates/campaign
  // records preserve historical absence until their actual producers run.
  if (save.schemaVersion < 54) save.world.meta.schemaVersion = 54;
  if (save.schemaVersion < 55) save.world.meta.schemaVersion = 55;
  // Source strategy transitions are absent until an actual retool is ordered.
  if (save.schemaVersion < 56) save.world.meta.schemaVersion = 56;
  // Paid tiers and their political/ownership continuation require the new
  // reader. No historical acquisitions or confidence records are invented.
  if (save.schemaVersion < 57) save.world.meta.schemaVersion = 57;
  // v57 -> v58: general presidential ruleset stamps are absent=>v1 (source
  // compatibility), and the election-scoped governor endorsement ledger is
  // optional/empty on legacy races. Do not stamp existing elections v3.
  if (save.schemaVersion < 58) save.world.meta.schemaVersion = 58;
  // v59: do not infer historic law state. The optional budget fields stay
  // absent until a source union-law bill enacts; preserve that historical
  // absence while making the current reader reject older union-unaware readers.
  if (save.schemaVersion < 59) save.world.meta.schemaVersion = 59;
  // Earlier readers only understood Irish PM votes. No appointment history
  // can be reconstructed; existing Irish records continue unchanged.
  if (save.schemaVersion < 61) save.world.meta.schemaVersion = 61;
  // v62: the schema-61 reader predates union law and underground continuation.
  // Keep historical law/drive/crisis fields absent; the version barrier is
  // what prevents that reader from silently loading state it cannot consume.
  if (save.schemaVersion < 62) save.world.meta.schemaVersion = 62;
  // v63: primary/split-off ownership routing needs the new consumer.
  // Preserve historical absence of primary flags and sector assignments.
  if (save.schemaVersion < 63) save.world.meta.schemaVersion = 63;
  // v64: preserve absent legacy seat weights as one. Historical winner
  // weights cannot be reconstructed from previously redistributed rosters.
  if (save.schemaVersion < 64) save.world.meta.schemaVersion = 64;
  // v65: legislative notices, corporate/NPP finance, annual statehood and
  // UK devolved/conflict/recall state share this unpublished version boundary.
  // Preserve historical absence except for the statehood preset guard.
  if (save.schemaVersion < 65) {
    save.world.meta.schemaVersion = 65;
    const regions = save.world.regions;
    const currentEra = typeof save.world.meta.era === "string" ? save.world.meta.era : "1953";
    const inferredPreset = regions?.AK?.countryId === "US" && regions.AK.houseSeats === 0
      ? "1953-default"
      : `${currentEra}-default`;
    const statehood = save.world.statehood && typeof save.world.statehood === "object"
      ? save.world.statehood as Record<string, unknown>
      : {};
    if (typeof statehood.startingPreset !== "string") statehood.startingPreset = inferredPreset;
    save.world.statehood = statehood as NonNullable<typeof save.world.statehood>;
  }
  // v66: player FX execution stamps trade notional for the source size-fee
  // lookback and keeps exact trade flow for breadth/pressure. Older saves
  // have no reconstructable trade history: keep the field absent rather than
  // inferring trades from balances or exchange-rate snapshots.
  if (save.schemaVersion < 66) save.world.meta.schemaVersion = 66;
  // v67: preserve genuinely absent ranked-count state on historical and
  // default Irish races. The schema barrier makes opt-in ballot/result
  // continuations unreadable to the prior tally grammar.
  if (save.schemaVersion < 67) save.world.meta.schemaVersion = 67;
  // v68: preserve genuinely absent regional rows and coexistence baselines
  // until their first ordinary cost-of-living metric turn.
  if (save.schemaVersion < 68) save.world.meta.schemaVersion = 68;
  // v69: source-shaped standing ad flights and quote revision are optional
  // player state. Leave prior campaign-targeted-ad modifiers untouched: their
  // purchase turn, state and exposure history cannot be reconstructed from
  // the old flat category/group map.
  if (save.schemaVersion < 69) save.world.meta.schemaVersion = 69;
  // Issues #334/#345 difficulty and autonomy need no migration block:
  // both axes are optional with absent-means-default, so saves written
  // before either contract already carry the canonical default — the same
  // default a fresh world gets, with the identity tuning (x1) and the
  // v4 gate (every country active) keeping their simulation
  // byte-identical. A present axis is validated by assertCurrentWorldState
  // below; no RNG is consumed.
  // NPP-backed politicians used to carry Character-only party clout and
  // bonus-action counters. Keep the fields readable for older save shapes, but
  // normalize their obsolete values before any post-load consumer can use them.
  for (const politician of save.world.politicians) {
    politician.partyInfluence = 0;
    politician.bonusActions = 0;
  }
  // 1.0.0 stored every synthetic NPC party ballot after resolution. They
  // cannot affect a future turn, so compact them on load while retaining the
  // player's historical ballot. This is a storage cleanup, not a schema
  // change, and therefore applies to current-schema saves too.
  compactResolvedNpcBallots(save.world);
  // #92: persisted spendStock default. Saves written before the spend-stock
  // port carry campaigns without the field; missing degrades to 0 in the
  // aggregation (same absent-means-zero invariant as upstream), but the
  // backfill keeps every loaded row explicit. Applies to current-schema
  // saves too, so no version renumber is needed.
  for (const campaign of Object.values(save.world.campaigns)) {
    if (typeof campaign.spendStock !== "number") campaign.spendStock = 0;
    if (!Array.isArray(campaign.activityHistory)) campaign.activityHistory = [];
    // #68: campaignStrength default. Saves written before the campaign-strength
    // port carry campaigns without the field; missing degrades to 0 at every
    // read site (strength 0 ⇒ vote multiplier 1, a no-op), but the backfill
    // keeps every loaded row explicit — same additive shape as the spendStock
    // backfill above, and tolerant of absent values for old saves. No version
    // renumber is needed.
    if (typeof campaign.campaignStrength !== "number") campaign.campaignStrength = 0;
  }
  if (save.world.player.targetedAds !== undefined) {
    validateTargetedAds(save.world.player.targetedAds, "player.targetedAds", save.world);
    if (!Number.isSafeInteger(save.world.player.targetedAdsRevision) || (save.world.player.targetedAdsRevision ?? -1) < 0) {
      throw new Error("Invalid targetedAdsRevision at player");
    }
  }
  if (save.world.player.targetedAdsRevision !== undefined &&
    (!Number.isSafeInteger(save.world.player.targetedAdsRevision) || save.world.player.targetedAdsRevision < 0)) {
    throw new Error("Invalid targetedAdsRevision at player");
  }
  // Pre-#48 Native saves always applied recorded stats. Preserve that ruleset
  // when the new key is absent; present malformed values still fail closed.
  if (save.world.featureFlags.rpgStats === undefined) save.world.featureFlags.rpgStats = true;
  // PM appointment ballots are an additive save field; pre-feature and older
  // current-schema saves have no vote history to recover.
  if (!Array.isArray((save.world as unknown as Record<string, unknown>)["pmAppointmentVotes"])) {
    (save.world as unknown as Record<string, unknown>)["pmAppointmentVotes"] = [];
  }
  validatePmAppointmentVotes(save.world);
  validateGovernmentDirectives(save.world);
  backfillSourceSeededSoeState(save.world);
  assertCurrentWorldState(save.world);
  for (const crisis of save.world.crises) {
    if (
      crisis.lastUndergroundExtensionTurn !== undefined &&
      (!Number.isSafeInteger(crisis.lastUndergroundExtensionTurn) ||
        crisis.lastUndergroundExtensionTurn < 0 || crisis.lastUndergroundExtensionTurn > save.world.meta.turn)
    ) {
      throw new Error(`Crisis ${crisis.id} has an invalid underground extension turn`);
    }
  }
  validatePresidentialPrimaryLedger(save.world);
  validatePresidentialGeneralMechanics(save.world);
  validatePrStvElectionState(save.world);
  validatePrimaryStateOrganizations(save.world);
  validateCommandEconomySave(save.world);
  validateSoeSave(save.world);
  validateBankingState(save.world);
  validatePoliticalState(save.world);
  validateStateOwnershipLedger(save.world);
  validatePendingNationalizations(save.world);
  if (save.world.corporateCashLedger !== undefined) validateCorporateCashLedger(save.world.corporateCashLedger);
  validateNationalizationEligibilityState(save.world);
  validateNationalCorporations(save.world);
  validateCanvassState(save.world);
  if (save.world.frontierEntryExperimentEnabled !== undefined && typeof save.world.frontierEntryExperimentEnabled !== "boolean") {
    throw new Error("Frontier-entry experiment flag must be boolean");
  }
  for (const corporation of Object.values(save.world.corporations)) validateNppStrategyState(corporation.nppStrategy);
  for (const [corporationId, corporation] of Object.entries(save.world.corporations)) {
    if (corporation.isPrivate !== undefined && typeof corporation.isPrivate !== "boolean") throw new Error(`Corporation ${corporationId} has invalid private-company state`);
    if (corporation.liquidCurrencyCode !== undefined && (typeof corporation.liquidCurrencyCode !== "string" || !/^[A-Z]{3}$/.test(corporation.liquidCurrencyCode))) {
      throw new Error(`Corporation ${corporationId} has invalid liquid currency`);
    }
    for (const point of corporation.priceHistory ?? []) {
      if (point.currencyCode !== undefined && !/^[A-Z]{3}$/.test(point.currencyCode)) {
        throw new Error(`Corporation ${corporationId} has invalid price-history currency`);
      }
    }
    validateCorporateRelocationVote(corporation.relocationVote, corporationId);
  }
  // #295: persisted sector-owner default. Saves written before the
  // acquisition slice carry materialized assets without the field; missing
  // degrades to the #293 default ("corporation") and keeps every loaded row
  // explicit. Applies to current-schema saves too, so no version renumber
  // is needed. Present-but-invalid values are left for the validator below
  // to fail closed on.
  if (save.world.corporateSectors !== undefined) {
    backfillSectorOwner(save.world.corporateSectors);
    // #322: pre-existing materialized rows predate the shop-floor
    // labor-relations fields. Missing density/wage/expectation/strike
    // markers degrade to their read defaults (same absent-means-default
    // rule as the owner backfill above); present-but-invalid values are
    // left for the validator below to fail closed on. Applies to
    // current-schema saves too, so no version renumber is needed.
    backfillSectorWorkforce(save.world, save.world.corporateSectors);
    backfillSectorPlantCapital(save.world, save.world.corporateSectors);
    validateCorporateSectorAssets(save.world, save.world.corporateSectors);
  }
  // #320: union organizer rows. Saves written before the organizer slice
  // carry no map; missing degrades to empty (no drives run) and every
  // loaded row is kept explicit — same additive shape as the spendStock
  // backfill above, so no version renumber is needed. Present-but-invalid
  // rows fail closed through validateUnionOrganizers. Union strength keeps
  // the reference absent-means-zero rule explicitly.
  if (save.world.plantMarketDemand !== undefined) {
    validatePlantMarketDemand(save.world);
  }
  if (save.world.corporateTradeSnapshot !== undefined) {
    const snapshot = save.world.corporateTradeSnapshot;
    if (!isRecord(snapshot) || !Number.isSafeInteger(snapshot.turn) || !isRecord(snapshot.byCountry) ||
        !isRecord(snapshot.flow) || !isRecord(snapshot.byCommodity)) {
      throw new Error("World has an invalid corporate trade snapshot");
    }
    for (const [countryId, row] of Object.entries(snapshot.byCountry)) {
      if (!isRecord(row) || ![row.exports, row.imports, row.net].every(value => typeof value === "number" && Number.isFinite(value)) ||
          !(row.topPartner === null || typeof row.topPartner === "string")) {
        throw new Error(`World corporate trade snapshot has an invalid country row ${countryId}`);
      }
    }
    for (const [exporter, destinations] of Object.entries(snapshot.flow)) {
      if (!isRecord(destinations)) throw new Error(`World corporate trade snapshot has an invalid flow row ${exporter}`);
      for (const [importer, value] of Object.entries(destinations)) {
        if (exporter === importer || typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          throw new Error(`World corporate trade snapshot has an invalid flow ${exporter}:${importer}`);
        }
      }
    }
    for (const [commodity, byExporter] of Object.entries(snapshot.byCommodity)) {
      if (!isRecord(byExporter)) throw new Error(`World corporate trade snapshot has an invalid commodity ${commodity}`);
      for (const [exporter, destinations] of Object.entries(byExporter)) {
        if (!isRecord(destinations)) throw new Error(`World corporate trade snapshot has an invalid commodity route ${commodity}:${exporter}`);
        for (const [importer, row] of Object.entries(destinations)) {
          if (exporter === importer || !isRecord(row) ||
              ![row.units, row.value].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
            throw new Error(`World corporate trade snapshot has an invalid commodity flow ${commodity}:${exporter}:${importer}`);
          }
        }
      }
    }
    if (snapshot.valuationPriceByCommodity !== undefined) {
      if (!isRecord(snapshot.valuationPriceByCommodity)) {
        throw new Error("World corporate trade snapshot has invalid commodity valuation prices");
      }
      for (const [commodity, price] of Object.entries(snapshot.valuationPriceByCommodity)) {
        if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
          throw new Error(`World corporate trade snapshot has invalid valuation price ${commodity}`);
        }
      }
    }
  }
  if (save.world.unionOrganizers !== undefined) {
    validateUnionOrganizers(save.world, save.world.unionOrganizers);
  }
  for (const [unionId, candidate] of Object.entries(save.world.unions)) {
    if (!isRecord(candidate)) throw new Error(`Invalid underground union record: ${unionId}`);
    const row = candidate as unknown as Record<string, unknown>;
    for (const field of ["undergroundStrength", "heat", "recentUndergroundDriveCount"] as const) {
      const amount = row[field];
      if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || (field === "heat" && amount > 100))) {
        throw new Error(`Invalid underground union ${field}: ${unionId}`);
      }
    }
    for (const field of ["exposedUntilTurn", "lastUndergroundDriveTurn", "undergroundProcessedTurn", "lastUndergroundRaidTurn"] as const) {
      const turn = row[field];
      if (turn !== undefined && turn !== null && (typeof turn !== "number" || !Number.isSafeInteger(turn) || turn < 0)) {
        throw new Error(`Invalid underground union turn ${field}: ${unionId}`);
      }
    }
  }
  const lastUndergroundDriveTurn = save.world.player.lastUndergroundDriveTurn;
  if (lastUndergroundDriveTurn !== undefined && lastUndergroundDriveTurn !== null &&
    (!Number.isSafeInteger(lastUndergroundDriveTurn) || lastUndergroundDriveTurn < 0)) {
    throw new Error("Invalid player underground drive turn");
  }
  // #321: union contribution ledger. Saves written before the payout slice
  // carry no rows; missing degrades to empty and every loaded row is kept
  // explicit — same additive shape as the organizer backfill above, so no
  // version renumber is needed. Present-but-invalid rows fail closed.
  // Absent stays absent (no materialization), so a mid-campaign save/load
  // leaves untouched worlds byte-identical.
  if (save.world.unionContributionLedger !== undefined) {
    validateUnionContributionLedger(save.world, save.world.unionContributionLedger);
  }
  // #308: resolved bond-default claimants remain auditable after the live
  // instruments and dissolved issuer have been retired. Legacy saves keep
  // this field absent; malformed retained records fail closed.
  if (save.world.corporateBondSettlementLedger !== undefined) {
    validateCorporateBondSettlementLedger(save.world.corporateBondSettlementLedger);
  }
  // #314: player line-of-credit servicing state. Saves written before the
  // slice carry no field; missing degrades to no line and the phase no-ops,
  // so no version renumber is needed. Present-but-invalid state fails
  // closed. Absent stays absent (no materialization), so a mid-campaign
  // save/load leaves untouched worlds byte-identical.
  if (save.world.player.lineOfCredit !== undefined) {
    validatePlayerLineOfCredit(save.world.player.lineOfCredit);
    validatePlayerLineOfCreditWallet(save.world.player);
  }
  validateNationalSavingsPools(save.world);
  // #322: bargaining campaigns + collective agreements. Saves written before
  // the bargaining slice carry no maps; missing degrades to empty (no open
  // campaigns, no enforceable agreements) and every loaded row is kept
  // explicit (same additive shape as the organizer/ledger backfills above),
  // so no version renumber is needed. Present-but-invalid rows fail closed.
  // Absent stays absent (no materialization), so a pre-#322 save/load
  // leaves untouched worlds byte-identical.
  if (save.world.bargainingCampaigns !== undefined) {
    validateBargainingCampaigns(save.world, save.world.bargainingCampaigns);
  }
  if (save.world.collectiveAgreements !== undefined) {
    validateCollectiveAgreements(save.world, save.world.collectiveAgreements);
  }
  // #328: bank proprietary-book state. Saves written before the slice carry
  // no charterType/propBook/propBookMarkValue; absent degrades to the
  // seeded shape (retail charter, empty book, zero mark), so no version
  // renumber is needed. Present-but-invalid state fails closed.
  for (const corp of Object.values(save.world.corporations)) {
    if (corp.bankCharter !== undefined) {
      normalizeBankCharterPropBook(corp.id, corp.bankCharter);
    }
  }
  // Union strength keeps the reference absent-means-zero rule WITHOUT
  // materializing the field: a mid-campaign save/load must leave union rows
  // byte-identical (see unions.sim.test.ts round-trip), so absent stays
  // absent and only a present-but-invalid pool fails closed.
  for (const union of Object.values(save.world.unions)) {
    if (union.strength !== undefined && (!Number.isFinite(union.strength) || union.strength < 0)) {
      throw new Error(`Union ${union.id} has an invalid strength`);
    }
    // #315: the pension rate keeps the reference agreement
    // absent-reads-as-zero rule the same way: absent stays absent, only a
    // present-but-invalid rate fails closed.
    if (union.pensionContributionRate !== undefined && !isValidContributionRate(union.pensionContributionRate)) {
      throw new Error(`Union ${union.id} has an invalid pension contribution rate`);
    }
  }
  // #315: pension schemes and ledger. Saves written before the pension
  // slice carry neither; missing degrades to empty and every loaded row is
  // kept explicit — same additive shape as the #320/#321 backfills above,
  // so no version renumber is needed. Present-but-invalid rows fail
  // closed. Absent stays absent (no materialization), so a mid-campaign
  // save/load leaves untouched worlds byte-identical.
  if (save.world.pensionSchemes !== undefined) {
    validatePensionSchemes(save.world, save.world.pensionSchemes);
  }
  if (save.world.pensionLedger !== undefined) {
    validatePensionLedger(save.world, save.world.pensionLedger);
  }
  // #112: alignment rows. Saves written before the W32 slice carry no map
  // and the v33->v37 migration backfills it via normalizeShares, so missing
  // degrades to seeded shares and absent stays absent (no materialization),
  // keeping untouched saves byte-identical. Present-but-invalid rows fail
  // closed against the normalize.ts invariant (grid + exact-100 total, known
  // poles only) — same additive shape as the #320/#321 backfills above, so
  // no version renumber is needed.
  if (save.world.alignments !== undefined) {
    validateAlignmentRecords(save.world.alignments);
  }
  if (save.world.forexTradeHistory !== undefined) {
    if (!Array.isArray(save.world.forexTradeHistory)) throw new Error("Not a valid save file: invalid forex trade history");
    const seenForexTradeIds = new Set<string>();
    const forexCurrencies = new Set(Object.values(save.world.exchangeRates).map((exchangeRate) => exchangeRate.currencyCode));
    const supportedForexCurrencies = new Set(Object.values(CURRENCY_CODE_BY_COUNTRY));
    for (const [index, trade] of save.world.forexTradeHistory.entries()) {
      if (
        !isRecord(trade) || typeof trade.id !== "string" || trade.id !== `fx-${String(trade.turn)}-${index + 1}` || seenForexTradeIds.has(trade.id) ||
        !Number.isSafeInteger(trade.turn) || trade.turn < 0 || trade.turn > save.world.meta.turn ||
        trade.traderId !== "player" ||
        typeof trade.fromCurrency !== "string" || !supportedForexCurrencies.has(trade.fromCurrency) || !forexCurrencies.has(trade.fromCurrency) ||
        typeof trade.toCurrency !== "string" || !supportedForexCurrencies.has(trade.toCurrency) || !forexCurrencies.has(trade.toCurrency) || trade.fromCurrency === trade.toCurrency ||
        !Number.isFinite(trade.amount) || trade.amount <= 0 ||
        !Number.isFinite(trade.anchorAmount) || trade.anchorAmount <= 0 ||
        !Number.isFinite(trade.spread) || trade.spread < 0 || trade.spread > trade.amount ||
        trade.source !== "manual"
      ) throw new Error("Not a valid save file: invalid forex trade history row");
      seenForexTradeIds.add(trade.id);
    }
  }
  for (const exchangeRate of Object.values(save.world.exchangeRates)) {
    if (
      exchangeRate.buyVolume24 !== undefined && (!Number.isFinite(exchangeRate.buyVolume24) || exchangeRate.buyVolume24 < 0) ||
      exchangeRate.sellVolume24 !== undefined && (!Number.isFinite(exchangeRate.sellVolume24) || exchangeRate.sellVolume24 < 0)
    ) throw new Error("Not a valid save file: invalid forex volume snapshot");
  }
  return save.world;
}
