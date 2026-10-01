import { applyCanvass, quoteCanvass } from "./canvass.js";
import { effectivePlayerStats } from "../stats/allocation.js";
import { accrueCharacterActionXp } from "../stats/progression.js";
import { characterActionDisabledReason } from "./characterEligibility.js";
/**
 * Typed action execution API.
 * Ports src/lib/actions/commands/executeAction.ts validation (cost/cooldown/eligibility)
 * and dispatches per-action effects deterministically.
 */

import type { WorldState } from "../types.js";
import { ACTION_CATALOG, getActionCost, type ActionId } from "./catalog.js";
import { isPartyCaucusActionId, partyCaucusCharge } from "./partyCaucus.js";
import { fundraiseYield, isFundraiseEligible } from "./fundGeneration.js";
import { NEUTRAL_STAT, statMultiplier } from "../stats/characterStats.js";
import { actionFundCost } from "./fundCost.js";
import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";
import { DOLLARS_PER_TURNOUT_POINT } from "../support/constants.js";
import { applyBoost, calculateAlignmentMultiplier, getVoterGroups, DEFAULT_GOTV_CATEGORY } from "../support/turnout.js";
import { decayPressure } from "../support/pressure.js";
import * as Membership from "../membership.js";
import * as Caucus from "../caucus.js";
import * as Endorsement from "../endorsement.js";
import * as Candidacy from "../elections/candidacy.js";
import { commissionPoll } from "./polling.js";
import { resolveBondCurrency, resolveCountryCurrency } from "../bonds/denomination.js";
import * as CampaignUpgrade from "./campaignUpgrade.js";
import * as CampaignRally from "./campaignRally.js";
import * as CampaignRallyTour from "./campaignRallyTour.js";
import * as CampaignRetarget from "./campaignRetarget.js";
import * as CampaignManager from "./campaignManager.js";
import * as CampaignCanvass from "./campaignCanvass.js";
import * as CampaignTargetedAd from "./campaignTargetedAd.js";
import * as CampaignContribute from "./campaignContribute.js";
import * as Referendum from "../referendum/request.js";
import * as ReferendumCampaign from "../referendum/campaign.js";
import * as ReferendumGroundGame from "../referendum/groundGame.js";
import * as Coalition from "../intraparty/coalitions.js";
import {
  getPlayerPartyLeadershipGate,
  isPartyLeadershipAuthority,
  isPlayerNationalLeadershipVoter,
} from "../intraparty/leadershipTenure.js";
import { getLaw, resolveCatalogPolicyOption } from "../legislation/catalog.js";
import { launchProspectingSurvey } from "../extraction/prospecting.js";
import { expandRegionalExtraction } from "../extraction/operations.js";
import { isNationalExtractionIssuer, isStateExtractionIssuer, resolveExtractionContractIssuer, getResourceContractAuthority } from "../extraction/authority.js";
import {
  acceptExtractionContractOffer,
  declineExtractionContractOffer,
  issueContractOffer,
  revokeExtractionContract,
} from "../extraction/contracts.js";
import type { ExtractableResource } from "../commodity/constants.js";
import { depositToSavings, withdrawFromSavings, moveSavingsHolder } from "../finance/savingsActions.js";
import { wireTransfer as wireTransferFn } from "../finance/wireTransfer.js";
import { rollDebatePrep } from "../stats/debatePrep.js";
import { isCorpStateOwned, issueCorporateBond, validateBondIssuerIdentity } from "../bonds/corporateBonds.js";
import { quoteCorporateBondIssuance } from "../bonds/corporateBondQuote.js";
import { buybackCorporateBondUnits } from "../bonds/corporateBondServicing.js";
import { BOND_UNIT_FACE_VALUE } from "../bonds/constants.js";
import { rngFromState } from "../rng.js";
import { isOrderFlowPriceEligible } from "../market/orderFlow.js";
import { isPlannedEconomy } from "../commandEconomy/constants.js";
import { canPlayerOperateGosbank } from "../commandEconomy/authority.js";
import { reconcileCeoAppointment } from "../corporation/ceoGovernance.js";
import { enactNationalSubsidy, endNationalSubsidy } from "../budget/subsidyBudget.js";
import { nationalizeDistressedCorporation } from "../corporation/nationalization.js";
import { quoteNppInfluence, resolveNppInfluence } from "../npp/nppInfluence.js";
import { applyRecruitCaucusNpp, quoteRecruitCaucusNpp } from "../npp/caucusRecruit.js";
import { proposalNpiCost, BILL_PROPOSE_ACTION_COST } from "../legislation/proposalCosts.js";
import { applyBillEffects } from "../legislation/billLifecycle.js";

export type ExecuteActionParams = {
  regionId?: string;
  contractId?: string;
  issuerLevel?: "national" | "state";
  /** Source canvassing batch size, 1 through 50. */
  count?: number;
  amount?: number; // for convertCash
  partyId?: string;
  caucusId?: string;
  caucusName?: string;
  caucusTaxRate?: number;
  foundPartyName?: string;
  foundPartyAbbr?: string;
  endorsedId?: string;
  endorsedType?: "party" | "politician";
  endorsementId?: string;
  electionId?: string;
  // Legislation
  catalogId?: string;
  /** Source-generated program-law option id (`l0` through `l4`). */
  policyOptionId?: string;
  billId?: string;
  vote?: "for" | "against" | "abstain";
  sponsorCountryId?: string;
  billTitle?: string;
  billCategory?: string;
  originChamber?: string;
  // Intra-party ballots
  intrapartyElectionId?: string;
  candidateId?: string;
  salaryPerTurn?: number;
  dividendRate?: number;
  rdBudgetPerTurn?: number;
  committeeCandidateIds?: string[];
  coalitionId?: string;
  coalitionName?: string;
  coalitionAbbr?: string;
  // Direct nomination session commands (#272/#273).
  positionId?: string;
  seatNumber?: number;
  nominationId?: string;
  nomineeId?: string;
  position?: "chair" | "viceChair" | "treasurer";
  countryId?: string;
  disbandVote?: "yes" | "no";
  whipDirection?: "for" | "against" | "abstain";
  whipMode?: "hard" | "soft";
  // W10 markets
  corpId?: string;
  corporationId?: string;
  tier?: "seizure";
  shares?: number;
  // W13 bonds
  bondId?: string;
  units?: number;
  /** Face value requested in the USD accounting anchor (source API contract). */
  faceValue?: number;
  maturityTurns?: number;
  // M1 economic-direction levers (Lane 12 Head of State mode)
  budgetCountryId?: string;
  budgetCategory?: string;
  budgetAmount?: number;
  taxField?: "incomeTax" | "domesticCorporateTax" | "foreignCorporateTax" | "payrollTax" | "tariffs" | "salesTax";
  taxRate?: number;
  // setSubsidyRate (#94): player-authored national subsidy lifecycle.
  subsidyOp?: "enact" | "end";
  subsidyScope?: string;
  subsidyScopeType?: "economy_wide" | "sector";
  sectorType?: string;
  targetStrategyId?: string;
  domesticOnly?: boolean;
  directiveOp?: "setGosbankPosture";
  creditAggressiveness?: number;
  budgetSoftness?: number;
  sectorCredit?: Record<string, number>;
  // W11 extraction/prospecting
  resource?: string;
  share?: number;
  royaltyRatePerTurn?: number;
  termTurns?: number;
  signingFeeAnchor?: number;
  // W35 player wealth
  holder?: string;
  targetPoliticianId?: string;
  /** Wire denomination; defaults to the sender home currency. Must be a known world currency. */
  currency?: string;
  // P0 campaign management (#67)
  category?: string;
  branch?: "a" | "b" | "c" | null;
  rallyTour?: "start" | "stop";
  oppositionTargetId?: string;
  managerId?: string;
  demographicCategory?: string;
  demographicGroup?: string;
  // #68 campaign strength
  /** Batched single-click count for campaignContribute; "max" resolves server-side. */
  clicks?: number | "max";
  /** Rival campaign in the same election to receive contributed strength. */
  targetCandidateId?: string;
  /** Internal raw-amount override (see actions/campaignContribute.ts). */
  strengthAdded?: number;
  // #70 referendum campaign writers
  referendumId?: string;
  referendumSide?: "yes" | "no";
  /** Ground-game preset id (referendumGroundGame). `units` (above) is reused as
   *  the campaign-spend unit count for referendumCampaignSpend. */
  presetId?: string;
  /** Ground-game target cohort groupId; empty/absent = whole electorate. */
  cohortGroupId?: string;
  /** Personal NPP influence target (influenceNpp / recruitCaucusNpp). */
  targetId?: string;
  /** Relationship-only influence type (boost_loyalty, boost_favorability, boost_influence, reduce_stubbornness). */
  influenceType?: string;
  /** Extra campaign-anchor funds on top of the type's baseFundCost. */
  influenceFundAmount?: number;
};

export type ExecuteActionResult =
  | { ok: true; message: string; changes?: Partial<Record<"actions" | "funds" | "cash" | "infamy" | "politicalInfluence" | "nationalInfluence" | "favorability" | "donorBaseLevel", number>> }
  | { ok: false; error: string };

function findActor(world: WorldState, actorId: string): { kind: "player" | "politician"; entity: any } | null {
  if (actorId === "player") return { kind: "player", entity: world.player };
  const pol = world.politicians.find((p) => p.id === actorId);
  if (pol) return { kind: "politician", entity: pol };
  return null;
}

/**
 * M1 (Lane 12 Head of State mode): action ids where an existing party
 * action's "must be a member of this party" gate should accept the bound
 * ruling party (player.hosPartyId) in place of personal membership
 * (player.partyId) when the player holds no personal membership. Ports the
 * FRAMEWORK.md rule "a mode is who the player is, never how the world
 * works" onto the action layer: HoS grants the player the surfaces
 * party-leadership NPCs already operate (organize/pressure/endorse/caucus/
 * intra-party ballots/coalitions) plus government bill sponsorship, without
 * requiring a separate "join your own government's party" step. Deliberately
 * excludes joinParty/leaveParty/foundParty: those mutate real membership
 * bookkeeping (party.memberCount, cooldown fields) that the player was never
 * counted into, so they stay gated on genuine partyId either way.
 */
const HOS_PARTY_BYPASS_ACTIONS: ReadonlySet<string> = new Set([
  "organize",
  "pressureBoost",
  "investInfluence",
  "endorse",
  "createCaucus",
  "joinCaucus",
  "leaveCaucus",
  "contestPartyLeadership",
  "votePartyLeadership",
  "issuePartyWhip",
  "contestCommittee",
  "voteCommittee",
  "createCoalition",
  "joinCoalition",
  "initiateCoalitionDisband",
  "voteCoalitionDisband",
  "sponsorBill",
  "repealLaw",
]);

/**
 * Public entry point. Applies the M1 HoS party-bypass (see
 * HOS_PARTY_BYPASS_ACTIONS doc) as a temporary substitution around the real
 * dispatch in executeActionInner, then reverts it — this is the ONLY place
 * `player.mode` is read outside executeActionInner's own two pre-existing
 * seat-bypass checks (sponsorBill/repealLaw), and it lives in the action
 * layer, never a phase.
 */
export function executeAction(
  world: WorldState,
  actorId: string,
  actionId: string,
  params: ExecuteActionParams = {},
): ExecuteActionResult {
  // Dispatchers validate before their first domain mutation. Accounting is
  // the only shared state charged before dispatch, so snapshot it once and
  // restore it exactly for every returned or thrown failure.
  const actor = findActor(world, actorId)?.entity as {
    actions: number;
    funds: number;
    cash?: number;
    infamy?: number;
    politicalInfluence?: number;
    nationalInfluence?: number;
    favorability?: number;
    donorBaseLevel?: number;
    actionCooldowns: Record<string, number>;
    actionCounts?: Record<string, number>;
  } | undefined;
  const accounting = actor
    ? {
        actions: actor.actions,
        funds: actor.funds,
        cash: actor.cash,
        infamy: actor.infamy,
        politicalInfluence: actor.politicalInfluence,
        nationalInfluence: actor.nationalInfluence,
        favorability: actor.favorability,
        donorBaseLevel: actor.donorBaseLevel,
        actionCooldowns: { ...actor.actionCooldowns },
        actionCounts: actor.actionCounts ? { ...actor.actionCounts } : undefined,
      }
    : undefined;
  try {
    const result = executeActionWithModeBypass(world, actorId, actionId, params);
    if (!result.ok && actor && accounting) restoreActionAccounting(actor, accounting);
    if (result.ok && actorId === "player") accrueCharacterActionXp(world, actionId);
    if (result.ok && actor && accounting) {
      const changes: Extract<ExecuteActionResult, { ok: true }>["changes"] = {};
      for (const key of ["actions", "funds", "cash", "infamy", "politicalInfluence", "nationalInfluence", "favorability", "donorBaseLevel"] as const) {
        const previous = accounting[key];
        const current = actor[key];
        if (typeof previous === "number" && typeof current === "number" && current !== previous) changes[key] = current - previous;
      }
      return { ...result, changes };
    }
    return result;
  } catch (error) {
    if (actor && accounting) restoreActionAccounting(actor, accounting);
    throw error;
  }
}

function restoreActionAccounting(
  actor: { actions: number; funds: number; cash?: number; infamy?: number; politicalInfluence?: number; nationalInfluence?: number; favorability?: number; donorBaseLevel?: number; actionCooldowns: Record<string, number>; actionCounts?: Record<string, number> },
  snapshot: {
    actions: number;
    funds: number;
    cash: number | undefined;
    infamy: number | undefined;
    politicalInfluence: number | undefined;
    nationalInfluence: number | undefined;
    favorability: number | undefined;
    donorBaseLevel: number | undefined;
    actionCooldowns: Record<string, number>;
    actionCounts: Record<string, number> | undefined;
  },
): void {
  actor.actions = snapshot.actions;
  actor.funds = snapshot.funds;
  for (const key of ["cash", "infamy", "politicalInfluence", "nationalInfluence", "favorability", "donorBaseLevel"] as const) {
    const previous = snapshot[key];
    if (previous === undefined) delete actor[key];
    else actor[key] = previous;
  }
  replaceRecord(actor.actionCooldowns, snapshot.actionCooldowns);
  if (actor.actionCounts && snapshot.actionCounts) {
    replaceRecord(actor.actionCounts, snapshot.actionCounts);
  } else if (snapshot.actionCounts) {
    actor.actionCounts = { ...snapshot.actionCounts };
  } else {
    delete actor.actionCounts;
  }
}

function replaceRecord(target: Record<string, number>, snapshot: Record<string, number>): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, snapshot);
}

function executeActionWithModeBypass(
  world: WorldState,
  actorId: string,
  actionId: string,
  params: ExecuteActionParams,
): ExecuteActionResult {
  const player = world.player as unknown as { mode: string; partyId: string | null; hosPartyId: string | null };
  const bypass =
    actorId === "player" &&
    player.mode === "hos" &&
    !player.partyId &&
    !!player.hosPartyId &&
    HOS_PARTY_BYPASS_ACTIONS.has(actionId);
  if (!bypass) return executeActionInner(world, actorId, actionId, params);
  const original = player.partyId;
  player.partyId = player.hosPartyId;
  try {
    return executeActionInner(world, actorId, actionId, params);
  } finally {
    player.partyId = original;
  }
}

function executeActionInner(
  world: WorldState,
  actorId: string,
  actionId: string,
  params: ExecuteActionParams = {},
): ExecuteActionResult {
  const catalog = (ACTION_CATALOG as Record<string, typeof ACTION_CATALOG[ActionId]>)[actionId];
  if (!catalog) return { ok: false, error: `Unknown action: ${actionId}` };

  if (catalog.status === "unavailable") {
    return { ok: false, error: `Action ${actionId} unavailable: ${catalog.blockingSystem ?? "unported system"}` };
  }

  const found = findActor(world, actorId);
  if (!found) return { ok: false, error: `Unknown actor: ${actorId}` };
  const eligibilityError = found.kind === "player" ? characterActionDisabledReason(world, actionId) : undefined;
  if (eligibilityError) return { ok: false, error: eligibilityError };
  const paramError = validateRequiredActionParams(actionId, params);
  if (paramError) return { ok: false, error: paramError };
  const actor = found.entity as {
    actions: number;
    funds: number;
    donorBaseLevel: number;
    politicalInfluence: number;
    favorability: number;
    infamy: number;
    partyId?: string;
    countryId: string;
    cash?: number;
    actionCooldowns: Record<string, number>;
    actionCounts?: Record<string, number>;
    stats?: { charisma?: number; intellect?: number; fundraising?: number };
    homeRegionId?: string | null;
  };

  const turn = world.meta.turn;

  // Cooldown check
  const readyAt = actor.actionCooldowns[actionId] ?? 0;
  if (turn < readyAt) return { ok: false, error: `Action ${actionId} on cooldown until turn ${readyAt}` };

  // Cost check (dynamic). Party/caucus actions charge from the shared
  // partyCaucusCharge projection (#61) so the displayed quote and this charge
  // read one source (actions/partyCaucus.ts); every other action uses its
  // catalog entry directly.
  const canvass = actionId === "canvass" && found.kind === "player" ? quoteCanvass(world, params) : null;
  if (canvass && !canvass.ok) return canvass;
  if (canvass?.ok && canvass.error) return { ok: false, error: canvass.error };
  const nppInfluence = actionId === "influenceNpp" ? quoteNppInfluence(world, params, actorId) : null;
  if (nppInfluence && !nppInfluence.ok) return nppInfluence;
  const nppRecruit = actionId === "recruitCaucusNpp" ? quoteRecruitCaucusNpp(world, params, actorId) : null;
  if (nppRecruit && !nppRecruit.ok) return nppRecruit;
  const partyCaucus = isPartyCaucusActionId(actionId) ? partyCaucusCharge(actor, actionId) : null;
  const cost = canvass?.ok ? canvass.actions : nppInfluence?.ok ? nppInfluence.actionCost : nppRecruit?.ok ? nppRecruit.actionCost : partyCaucus
    ? partyCaucus.actionCost
    : actionId === "sponsorBill"
      ? BILL_PROPOSE_ACTION_COST
      : getActionCost(catalog, actor.donorBaseLevel ?? 0, actor.politicalInfluence ?? 0, actor.favorability ?? 50);
  if ((actor.actions ?? 0) < cost) return { ok: false, error: `Not enough action points. Required: ${cost}, Available: ${actor.actions}` };

  // Fund cost check: one stat-scaled source shared with the session quote
  // (actions/fundCost.ts). Intellect softens campaign (never advertise), and
  // Fundraising softens buildDonorBase, exactly as the reference effects do.
  // NPP politicians carry no stat block, so their quote is the neutral curve.
  // Game character quotes price the actor's home state, not a UI target.
  const actionRegion = world.regions[actor.homeRegionId ?? ""];
  const playerStats = found.kind === "player" ? effectivePlayerStats(world) : undefined;
  const fundCost = canvass?.ok ? canvass.funds : nppInfluence?.ok ? nppInfluence.fundCost : nppRecruit?.ok ? nppRecruit.fundCost : partyCaucus ? partyCaucus.fundCost : actionFundCost({
    actionId,
    actionCost: cost,
    donorBaseLevel: actor.donorBaseLevel ?? 0,
    catalogFundCost: catalog.fundCost,
    countryId: actor.countryId,
    gdpMillions: actionRegion?.gdp,
    population: actionRegion?.population,
    era: world.meta.era,
    ...(playerStats ? { stats: playerStats } : {}),
  });
  if (fundCost > 0) {
    // Prefer campaign funds; allow actor.funds only (player funds field)
    const available = actor.funds ?? 0;
    if (available < fundCost) return { ok: false, error: `Not enough funds. Required: ${fundCost}, Available: ${available}` };
  }

  // Eligibility per-type
  if (actionId === "fundraise" && !isFundraiseEligible(actor.donorBaseLevel)) {
    return { ok: false, error: "No donor base. Use Build Donor Network first." };
  }
  if (actionId === "convertCash") {
    const amount = params.amount ?? actor.cash ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Conversion amount must be a finite positive number" };
    if (!Number.isFinite(actor.cash ?? 0)) return { ok: false, error: "Cash balance must be finite" };
    if ((actor.cash ?? 0) < amount) return { ok: false, error: `Not enough cash. Available: ${actor.cash}` };
  }
  if ((actionId === "canvass" || actionId === "organize" || actionId === "pressureBoost") && !params.regionId) {
    return { ok: false, error: `Action ${actionId} requires a regionId` };
  }
  // Membership eligibility: party actions require membership (ports mainline party actions gating)
  const membershipGated = new Set(["organize", "pressureBoost", "investInfluence", "createCaucus", "joinCaucus", "leaveCaucus", "endorse"]);
  if (found.kind === "player" && membershipGated.has(actionId)) {
    const pid = (world.player as unknown as { partyId: string | null }).partyId;
    if (actionId === "createCaucus" || actionId === "joinCaucus" || actionId === "leaveCaucus") {
      // handled via caucus helpers but still require party
      if (!pid && actionId !== "leaveCaucus") {
        // leaveCaucus also requires membership indirectly but caucus helper will error
      }
    }
    if (actionId === "organize" || actionId === "pressureBoost" || actionId === "investInfluence") {
      if (!pid) return { ok: false, error: `Action ${actionId} requires party membership` };
    }
    if (actionId === "endorse" && !pid) return { ok: false, error: "Must be a party member to endorse" };
  }
  if (actionId === "joinParty" && !params.partyId) return { ok: false, error: "joinParty requires partyId" };
  if (actionId === "foundParty" && (!params.foundPartyName || !params.foundPartyAbbr)) return { ok: false, error: "foundParty requires foundPartyName and foundPartyAbbr" };
  // foundParty preflight before any shared mutation. The common fund gate
  // above already enforces the single 100k charge threshold; canFoundParty
  // re-checks names, country uniqueness, switch cooldown and funds on the
  // unmutated world so a rejection costs nothing (no actions, funds,
  // cooldown or actionCounts change). Membership owns the sole fund charge.
  if (actionId === "foundParty") {
    if (found.kind !== "player") return { ok: false, error: "Only player can found parties" };
    const pre = Membership.canFoundParty(world, { name: params.foundPartyName!, abbreviation: params.foundPartyAbbr! });
    if (!pre.ok) return { ok: false, error: (pre as { ok: false; error: string }).error };
  }
  if (actionId === "createCaucus" && !params.caucusName) return { ok: false, error: "createCaucus requires caucusName" };
  // Validate before shared accounting. The caucus helper owns the sole charge.
  if (actionId === "createCaucus") {
    if (found.kind !== "player") return { ok: false, error: "Only player can create caucuses" };
    const taxRate = params.caucusTaxRate ?? 0;
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > Caucus.CAUCUS_TAX_MAX) {
      return { ok: false, error: `taxRate must be 0-${Caucus.CAUCUS_TAX_MAX}` };
    }
    const pre = Caucus.canCreateCaucus(world, params.caucusName!);
    if (!pre.ok) return pre;
  }
  if (actionId === "joinCaucus" && !params.caucusId) return { ok: false, error: "joinCaucus requires caucusId" };
  if (actionId === "endorse" && !params.endorsedId) return { ok: false, error: "endorse requires endorsedId" };
  // debatePrep preflight before any shared mutation. AHDGame requires
  // allocated stats: a missing player Debate stat rejects here so the attempt
  // costs no AP and draws no RNG (the branch below re-checks before its draw;
  // the outer wrapper refunds accounting on any failure).
  if (actionId === "debatePrep") {
    if (!world.featureFlags.rpgStats) return { ok: false, error: "The stat system is not currently enabled." };
    if (found.kind !== "player") return { ok: false, error: "Only the player can train Debate (politicians have no stat block)" };
    if (world.player.stats?.debate === undefined) {
      return { ok: false, error: "Allocate your stats before training Debate (missing Debate stat)" };
    }
  }

  // Deduct action points + cooldown stamp
  actor.actions -= cost;
  if (catalog.cooldown > 0) actor.actionCooldowns[actionId] = turn + catalog.cooldown + 1;

  // W35: per-action success counter (achievements/evaluate.ts reads this).
  // Player-only — see PlayerCharacter.actionCounts file doc.
  if (found.kind === "player" && actor.actionCounts) {
    actor.actionCounts[actionId] = (actor.actionCounts[actionId] ?? 0) + 1;
  }

  // Deduct fund cost where applicable (except convertCash which adds).
  // Founding helpers own their sole charges: party 100k, caucus 25k.
  if (fundCost > 0 && actionId !== "convertCash" && actionId !== "rest" && actionId !== "investInfluence" && actionId !== "foundParty" && actionId !== "createCaucus") {
    actor.funds -= fundCost;
  }

  // Dispatch effects
  const actorPartyId = actor.partyId as string | undefined;
  const actorCountry = actor.countryId;

  if (actionId === "acceptExtractionContract" || actionId === "declineExtractionContract" || actionId === "revokeExtractionContract") {
    if (found.kind !== "player") return { ok: false, error: "Only the player can respond to an extraction contract." };
    const contractId = params.contractId;
    if (!contractId) return { ok: false, error: `${actionId} requires contractId` };
    const result = actionId === "acceptExtractionContract"
      ? acceptExtractionContractOffer(world, contractId)
      : actionId === "declineExtractionContract"
        ? declineExtractionContractOffer(world, contractId)
        : revokeExtractionContract(world, contractId);
    return result.ok ? { ok: true, message: `${actionId} completed for ${contractId}.` } : result;
  }

  if (actionId === "fundraise") {
    const yieldAmt = campaignAnchorToLocal(fundraiseYield(actor.donorBaseLevel ?? 0, actor.politicalInfluence ?? 0, found.kind === "player" ? effectivePlayerStats(world) : undefined), actor.countryId);
    actor.funds = (actor.funds ?? 0) + yieldAmt;
    return { ok: true, message: `Raised ${yieldAmt} from donors.` };
  }
  if (actionId === "campaign") {
    // Increase politicalInfluence with diminishing returns above 50, mirroring
    // the reference campaignInfluenceGain curve, then scale by the charisma
    // efficacy multiplier (port of the reference effect). A missing charisma
    // stat resolves at the neutral 1.0x, preserving legacy behavior.
    const cur = actor.politicalInfluence ?? 0;
    const baseGain = 1;
    const threshold = 50;
    const rate = 1 / 75;
    const penalty = cur > threshold ? (cur - threshold) * rate : 0;
    const mult = statMultiplier(found.kind === "player" ? effectivePlayerStats(world)?.charisma ?? NEUTRAL_STAT : NEUTRAL_STAT);
    const gain = Math.max(0.1, (baseGain - penalty) * mult);
    actor.politicalInfluence = Math.min(100, cur + gain);
    // Also queue support accrual for candidateSupport entry if politician
    if (found.kind === "politician") {
      const cand = world.candidateSupports[actorId];
      if (cand && cand.status === "active") {
        // Simple: push a 1-turn accrual of +2 support per campaign action
        cand.supportAccrual.push({ amountPerTurn: 2, turnsRemaining: 3 });
      }
    }
    return { ok: true, message: `Campaigned: +${gain.toFixed(2)} influence.` };
  }
  if (actionId === "advertise") {
    // Port of advertiseFavorabilityGain: base +3, diminishing returns above 70,
    // floored at 1, then scaled by the charisma efficacy multiplier. A missing
    // charisma stat resolves at the neutral 1.0x, preserving legacy behavior.
    const cur = actor.favorability ?? 50;
    const baseGain = 3;
    const penalty = cur > 70 ? (cur - 70) * 0.1 : 0;
    const mult = statMultiplier(found.kind === "player" ? effectivePlayerStats(world)?.charisma ?? NEUTRAL_STAT : NEUTRAL_STAT);
    const gain = Math.max(1, Math.floor((baseGain - penalty) * mult));
    actor.favorability = Math.min(100, cur + gain);
    return { ok: true, message: `Advertised: +${gain} favorability.` };
  }
  if (actionId === "buildDonorBase") {
    actor.donorBaseLevel = (actor.donorBaseLevel ?? 0) + 1;
    return { ok: true, message: `Donor base now ${actor.donorBaseLevel}.` };
  }
  if (actionId === "poll" || actionId === "pollLarge") {
    // commissionPoll validates every tally input and stores the snapshot on
    // the player (lastPoll / lastPollLarge). A failure returns before any
    // world mutation; the outer accounting snapshot restores AP/funds.
    const commissioned = commissionPoll(world, actorId, actionId);
    if (!commissioned.ok) return { ok: false, error: commissioned.error };
    const snap = commissioned.snapshot;
    const currencyCode = world.budgets[actor.countryId]?.currencyCode
      ?? world.exchangeRates[actor.countryId]?.currencyCode
      ?? "XXX";
    const costLabel = `${currencyCode} ${fundCost.toLocaleString()}`;
    const topline = `Topline appeal ${snap.overallAppeal} across ~${snap.totalEstimatedVoters.toLocaleString()} likely voters (${snap.totalPotentialVoters.toLocaleString()} reachable).`;
    const race = snap.inRaceVoteShare
      ? ` Projected vote: ${snap.inRaceVoteShare.myVotes.toLocaleString()} vs ${Object.values(snap.inRaceVoteShare.opponentVotes).map((v) => v.toLocaleString()).join(", ")}.`
      : "";
    const kind = actionId === "pollLarge" ? "full demographic poll" : "quick poll";
    return { ok: true, message: `Commissioned a ${kind} for ${costLabel}. ${topline}${race}` };
  }
  if (actionId === "convertCash") {
    const amount = params.amount ?? actor.cash ?? 0;
    const converted = Math.floor(amount * 0.5);
    const infamy = Math.min(100, Math.round(15 * Math.pow(amount / 1_000_000, 0.564)));
    actor.cash = (actor.cash ?? 0) - amount;
    actor.funds = (actor.funds ?? 0) + converted;
    actor.infamy = Math.min(100, (actor.infamy ?? 0) + infamy);
    return { ok: true, message: `Converted ${amount} cash to ${converted} funds.` };
  }
  if (actionId === "rest") {
    return { ok: true, message: "Rested." };
  }
  if (actionId === "debatePrep") {
    // Player-only: Native NPC politicians carry no stat block, so mainline's
    // "allocate your stats" gate has no provisionable target for them. A
    // missing player Debate stat is unallocated (see ENGINE-ADAPTATIONS.md):
    // reject before the RNG draw; the preflight above already rejected before
    // the shared AP charge and the outer wrapper refunds any accounting.
    // Ports executeAction.ts debatePrep branch + rollDebatePrep at the coded
    // 15% chance; the draw flows through world.meta.rng so save/load
    // mid-campaign and deterministic replay are preserved (see engine.ts).
    if (found.kind !== "player") return { ok: false, error: "Only the player can train Debate (politicians have no stat block)" };
    const current = world.player.stats?.debate;
    if (current === undefined) {
      return { ok: false, error: "Allocate your stats before training Debate (missing Debate stat)" };
    }
    const rng = rngFromState(world.meta.rng);
    const roll = rollDebatePrep(() => rng.next(), current);
    world.meta.rng = rng.state();
    if (roll.success) {
      world.player.stats = { ...world.player.stats, debate: roll.debate };
      return { ok: true, message: "Breakthrough in the briefing room: your Debate skill improved (+1)." };
    }
    return { ok: true, message: "You studied hard, but no breakthrough this time." };
  }
  if (actionId === "canvass") {
    if (!canvass?.ok) return { ok: false, error: "Canvass requires a player character." };
    return { ok: true, message: applyCanvass(world, canvass) };
  }
  if (actionId === "organize") {
    const regionId = params.regionId!;
    const key = `${regionId}:${actorPartyId}`;
    const pr = world.partyRegions[key];
    if (!pr) return { ok: false, error: `No party region ${key}` };
    pr.organization = Math.min(100, pr.organization + 5);
    return { ok: true, message: `Organized ${regionId}: org ${pr.organization}.` };
  }
  if (actionId === "pressureBoost") {
    const regionId = params.regionId!;
    const pkey = `${actorPartyId}:${regionId}`;
    let pp = world.partyPressures[pkey];
    if (!pp) {
      pp = { partyId: actorPartyId ?? "unknown", regionId, countryId: actorCountry, value: 0 };
      world.partyPressures[pkey] = pp;
    }
    pp.value = Math.min(100, pp.value + 10);
    // ensure decay not zeroed immediately
    void decayPressure; // cite import
    return { ok: true, message: `Pressure ${pkey} now ${pp.value}.` };
  }
  if (actionId === "joinParty") {
    if (found.kind !== "player") return { ok: false, error: "Only player can join parties" };
    // Pre-charge already done; refund on failure
    const res = Membership.joinParty(world, params.partyId!);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Joined party ${params.partyId}` };
  }
  if (actionId === "leaveParty") {
    if (found.kind !== "player") return { ok: false, error: "Only player can leave parties" };
    const res = Membership.leaveParty(world);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: "Left party" };
  }
  if (actionId === "foundParty") {
    // Preflight above already enforced player-only and canFoundParty, and
    // the common path skipped the catalog fund deduction, so the dispatch
    // below applies the single Membership charge. A defensive failure only
    // refunds actions and cooldown (no fund moved yet); the outer accounting
    // snapshot also restores actionCounts.
    const res = Membership.foundParty(world, { name: params.foundPartyName!, abbreviation: params.foundPartyAbbr! });
    if (!res.ok) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Founded party ${res.partyId}` };
  }
  if (actionId === "createCaucus") {
    const res = Caucus.createCaucus(world, params.caucusName!, params.caucusTaxRate ?? 0);
    if (!res.ok) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return res;
    }
    return { ok: true, message: `Created caucus ${res.caucusId}` };
  }
  if (actionId === "joinCaucus") {
    if (found.kind !== "player") return { ok: false, error: "Only player can join caucuses" };
    const res = Caucus.joinCaucus(world, params.caucusId!);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Joined caucus ${params.caucusId}` };
  }
  if (actionId === "influenceNpp") {
    // Quote already enforced eligibility (no charge on refusal). Shared
    // accounting deducted AP + local funds. Stochastic failure/backfire must
    // return ok:true so the outer snapshot does not refund. Do not re-quote:
    // the actor no longer has the AP the quote would demand.
    if (!nppInfluence?.ok) return { ok: false, error: "influenceNpp quote missing" };
    return resolveNppInfluence(world, nppInfluence);
  }
  if (actionId === "recruitCaucusNpp") {
    const res = applyRecruitCaucusNpp(world, params);
    if (!res.ok) return res;
    return { ok: true, message: res.message };
  }
  if (actionId === "leaveCaucus") {
    if (found.kind !== "player") return { ok: false, error: "Only player can leave caucuses" };
    const res = Caucus.leaveCaucus(world);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: "Left caucus" };
  }
  if (actionId === "setCaucusTaxRate") {
    if (found.kind !== "player") return { ok: false, error: "Only player can edit caucus settings" };
    const res = Caucus.setCaucusTaxRate(world, params.caucusId!, params.caucusTaxRate!);
    if (!res.ok) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Set caucus tax rate to ${params.caucusTaxRate}%` };
  }
  if (actionId === "disbandCaucus") {
    if (found.kind !== "player") return { ok: false, error: "Only player can disband caucuses" };
    const res = Caucus.disbandCaucus(world, params.caucusId!);
    if (!res.ok) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: "Disbanded caucus" };
  }
  if (actionId === "endorse") {
    if (found.kind !== "player") return { ok: false, error: "Only player can endorse" };
    const endorsedType = params.endorsedType ?? "politician";
    const res = Endorsement.endorse(world, params.endorsedId!, endorsedType);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Endorsed ${params.endorsedId}` };
  }
  if (actionId === "declareCandidacy" || actionId === "withdrawCandidacy") {
    if (found.kind !== "player") return { ok: false, error: "Only the player files candidacies" };
    if (!params.electionId) return { ok: false, error: `${actionId} requires electionId` };
    const res =
      actionId === "declareCandidacy"
        ? Candidacy.declareCandidacy(world, params.electionId)
        : Candidacy.withdrawCandidacy(world, params.electionId);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error ?? "Candidacy action failed" };
    }
    return { ok: true, message: actionId === "declareCandidacy" ? "Candidacy declared" : "Candidacy withdrawn" };
  }
  if (actionId === "campaignUpgrade") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    const res = CampaignUpgrade.campaignUpgrade(world, {
      electionId: params.electionId,
      category: params.category,
      branch: params.branch,
    });
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: res.message };
  }
  if (actionId === "campaignRally") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    const res = CampaignRally.campaignRally(world, { electionId: params.electionId });
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: res.message };
  }
  if (actionId === "campaignRallyTour") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    if (params.rallyTour !== "start" && params.rallyTour !== "stop") {
      return { ok: false, error: "campaignRallyTour requires rallyTour start|stop" };
    }
    const res = CampaignRallyTour.campaignRallyTour(world, {
      electionId: params.electionId,
      active: params.rallyTour === "start",
    });
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: res.message };
  }
  if (actionId === "campaignRetarget") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    const res = CampaignRetarget.campaignRetarget(world, {
      electionId: params.electionId,
      oppositionTargetId: params.oppositionTargetId,
    });
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: res.message };
  }
  if (actionId === "campaignManager") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    const res = CampaignManager.campaignManager(world, {
      electionId: params.electionId,
      managerId: params.managerId,
    });
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: res.message };
  }
  if (actionId === "campaignCanvass") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    const res = CampaignCanvass.campaignCanvass(world, {
      electionId: params.electionId,
      regionId: params.regionId,
      demographicCategory: params.demographicCategory,
      demographicGroup: params.demographicGroup,
    });
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: res.message };
  }
  if (actionId === "campaignTargetedAd") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    const res = CampaignTargetedAd.campaignTargetedAd(world, {
      electionId: params.electionId,
      regionId: params.regionId,
      demographicCategory: params.demographicCategory,
      demographicGroup: params.demographicGroup,
    });
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: res.message };
  }
  if (actionId === "campaignContribute") {
    if (found.kind !== "player") return { ok: false, error: "Only player can manage a campaign" };
    // Catalog baseCost/fundCost are 0; campaignContribute charges the dynamic
    // funds/actions itself AFTER validating every gate, so a rejection leaves
    // both the player's balances and the target campaign's strength untouched
    // (and the executeAction wrapper restores accounting on any failure result
    // anyway). The reference-shaped entry is click-based (clicks: number|"max",
    // strength derived from national influence); strengthAdded remains an
    // internal raw-amount override.
    const res = CampaignContribute.campaignContribute(world, {
      electionId: params.electionId,
      clicks: params.clicks,
      targetCandidateId: params.targetCandidateId,
      strengthAdded: params.strengthAdded,
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: res.message };
  }
  if (actionId === "requestReferendum") {
    if (found.kind !== "player") return { ok: false, error: "Only the player can request a referendum" };
    const res = Referendum.requestReferendum(world, params.regionId!);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: res.message };
  }
  if (actionId === "referendumCampaignSpend") {
    if (found.kind !== "player") return { ok: false, error: "Only the player can campaign in a referendum" };
    // Catalog baseCost/fundCost are 0; the campaign spend debits the player
    // party's Political Strength itself AFTER validating every gate, so a
    // rejection leaves the party's PS and the record untouched.
    const res = ReferendumCampaign.spendReferendumCampaign(world, {
      referendumId: params.referendumId,
      side: params.referendumSide,
      units: params.units,
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: res.message };
  }
  if (actionId === "referendumGroundGame") {
    if (found.kind !== "player") return { ok: false, error: "Only the player can campaign in a referendum" };
    // Catalog baseCost/fundCost are 0; the ground game debits Actions + Campaign
    // Funds itself AFTER validating every gate (see referendum/groundGame.ts).
    const res = ReferendumGroundGame.spendReferendumGroundGame(world, {
      referendumId: params.referendumId,
      side: params.referendumSide,
      presetId: params.presetId,
      cohortGroupId: params.cohortGroupId,
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: res.message };
  }
  if (actionId === "sponsorBill") {
    if (found.kind !== "player") return { ok: false, error: "Only player can sponsor bills" };
    const catalogId = params.catalogId;
    if (!catalogId) return { ok: false, error: "sponsorBill requires catalogId" };
    // Seed gating: must hold a legislative seat per mainline seat check; HoS mode grants bypass later
    const player = world.player as unknown as { legislativeSeat: { chamberKey: string; countryId: string } | null; mode: string; partyId: string | null };
    if (player.mode !== "hos" && !player.legislativeSeat) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Must hold a legislative seat to sponsor bills (career mode); HoS mode grants government sponsorship" };
    }
    // Validate catalog availability
    try {
      const leg = awaitImportCatalog(catalogId);
      if (!leg) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Unknown catalog entry: ${catalogId}` };
      }
      if (leg.status === "unavailable") {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Catalog entry unavailable: ${leg.blockingSystem ?? "unported system"} — PORT-STUB` };
      }
      const countryId = params.sponsorCountryId ?? world.player.countryId;
      if (countryId !== world.player.countryId) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: "Cannot sponsor a bill outside the player's country" };
      }
      if (leg.countryId !== countryId) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Catalog entry ${catalogId} belongs to ${leg.countryId}, not ${countryId}` };
      }
      if (params.regionId) {
        const region = world.regions[params.regionId];
        if (!region || region.countryId !== countryId) {
          actor.actions += cost;
          if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
          return { ok: false, error: `Unknown region ${params.regionId} for ${countryId}` };
        }
        if (leg.allowedScope === "national") {
          actor.actions += cost;
          if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
          return { ok: false, error: `${catalogId} is national-scope and cannot target a region` };
        }
      } else if (leg.allowedScope === "regional") {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `${catalogId} requires a regionId` };
      }
      const selectedPolicyOption =
        params.policyOptionId === undefined ? null : resolveCatalogPolicyOption(leg, params.policyOptionId);
      if (params.policyOptionId !== undefined && !selectedPolicyOption) {
        const reason = leg.kind === "tax" || !leg.levels
          ? "policyOptionId is only valid for catalog laws with discrete levels"
          : `Unknown policy option ${params.policyOptionId} for ${catalogId}`;
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: reason };
      }
      let selectedTaxOption: NonNullable<NonNullable<typeof leg.taxPolicy>["options"]>[number] | undefined;
      let selectedTaxRate: number | undefined;
      let taxEffectDirection: number | undefined;
      if (leg.kind === "tax" && leg.taxPolicy) {
        const tp = leg.taxPolicy;
        const raw = typeof params.taxRate === "number" && Number.isFinite(params.taxRate) ? params.taxRate : tp.baselineRate;
        if (tp.options?.length) {
          selectedTaxOption = tp.options.find((option) => option.rate === raw);
          if (!selectedTaxOption) return { ok: false, error: `Tax rate ${raw} is not an authored option for ${catalogId}` };
          selectedTaxRate = selectedTaxOption.rate;
        } else {
          const snapped = tp.step > 0 ? Math.round((raw - tp.minRate) / tp.step) * tp.step + tp.minRate : raw;
          selectedTaxRate = Math.round(Math.min(tp.maxRate, Math.max(tp.minRate, snapped)) * 1000) / 1000;
        }
        const currentRate = tp.scope === "federal"
          ? world.budgets[countryId]?.taxRates[tp.taxType as keyof NonNullable<typeof world.budgets[string]>["taxRates"]]
          : params.regionId
            ? world.regionalBudgets[params.regionId]?.taxRates?.[tp.taxType]
            : undefined;
        const effectiveCurrentRate = typeof currentRate === "number" ? currentRate : tp.baselineRate;
        if (selectedTaxRate === effectiveCurrentRate) return { ok: false, error: `Tax rate is already ${selectedTaxRate}` };
        // Tax option stance is authored independently from its numeric rate.
        // For example, Ireland's 23% VAT option is centrist even though it is
        // a two-point increase from the 1991 Native baseline; keep fiscal
        // selectedRate/phase-in separate from this political bill effect.
        taxEffectDirection = selectedTaxOption?.effectDirection ?? (selectedTaxRate > effectiveCurrentRate ? 1 : -1);
      }
      const npiCost = proposalNpiCost(leg);
      const availableNpi = world.player.nationalInfluence ?? 0;
      if (availableNpi < npiCost) {
        return { ok: false, error: `Not enough national influence. Required: ${npiCost}, Available: ${availableNpi}` };
      }
      if (npiCost > 0) world.player.nationalInfluence = availableNpi - npiCost;
      // Origin chamber: player's seat chamber or first elected chamber of country
      const legConfig = world.legislatures[countryId];
      const originChamber = params.originChamber ?? player.legislativeSeat?.chamberKey ?? legConfig?.chambers.find((c) => c.elected)?.key ?? "house";
      const title = params.billTitle ?? leg.title;
      const category = params.billCategory ?? leg.category;
      const id = `bill-${world.meta.turn}-${world.bills.length + 1}-${catalogId}`;
      const provisions = [
        {
          type: "policy" as const,
          legislationTypeId: catalogId,
          ...(selectedPolicyOption ? { policyOptionId: selectedPolicyOption.id } : selectedTaxOption ? { policyOptionId: selectedTaxOption.id } : {}),
          effectDirection: selectedPolicyOption?.effectDirection ?? taxEffectDirection ?? 1,
          economic: selectedTaxOption?.economic ?? 0,
          social: selectedTaxOption?.social ?? 0,
        },
      ];
      // If tax kind, add proposedRate handling (not needed for test)
      const bill: import("../legislation/types.js").Bill = {
        id,
        title,
        summary: leg.description,
        countryId,
        category,
        legislationTypeId: catalogId,
        ...(params.regionId ? { regionId: params.regionId } : {}),
        effectDirection: selectedPolicyOption?.effectDirection ?? taxEffectDirection ?? 1,
        // Tax bills: selected rate from the catalog ladder (params.taxRate, snapped
        // to step and clamped to [minRate, maxRate]; defaults to baselineRate).
        // Source: mainline billEnactment.ts applyTaxRateChange(policyOption.rate).
        ...(leg.kind === "tax" && leg.taxPolicy
          ? {
              selectedRate: selectedTaxRate!,
            }
          : {}),
        provisions,
        originChamber,
        currentChamber: originChamber,
        status: "proposed",
        sponsorId: "player",
        sponsorName: world.player.name,
        sponsorPartyId: world.player.partyId,
        votes: {},
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        proposedAtTurn: world.meta.turn,
        proposalActionCost: BILL_PROPOSE_ACTION_COST,
        ...(npiCost > 0 ? { proposalNpiCost: npiCost } : {}),
        filibusterInvocations: [],
        updatedAtTurn: world.meta.turn,
        committeeId: null,
      };
      world.bills.push(bill);
      // AHDGame@968's local same-country singleplayer HoS route calls
      // enactSingleplayerDecree immediately after the national bill insert.
      // This is the source sovereign override, not a legislative ballot.
      // Career-mode elected-seat players continue through billLifecycle.
      if (player.mode === "hos") {
        bill.status = "signed";
        bill.enactedAtTurn = world.meta.turn;
        bill.updatedAtTurn = world.meta.turn;
        applyBillEffects(world, bill);
        // The source national-bill command has no separate sponsor action
        // cooldown; the source action-point charge and active-bill guard are
        // its pacing rules. HoS decrees finish immediately, so release the
        // Native one-turn cooldown that only models delayed chamber bills.
        delete actor.actionCooldowns[actionId];
      }
      return { ok: true, message: `Sponsored bill ${id}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "voteOnBill") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote on bills" };
    const billId = params.billId;
    const vote = params.vote;
    if (!billId || !vote) return { ok: false, error: "voteOnBill requires billId and vote" };
    const bill = world.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: `Unknown bill: ${billId}` };
    const playerSeat = (world.player as unknown as { legislativeSeat: { chamberKey: string } | null }).legislativeSeat;
    if (!playerSeat) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Must hold a legislative seat to vote" };
    }
    if (playerSeat.chamberKey !== bill.currentChamber) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Player chamber ${playerSeat.chamberKey} does not match bill chamber ${bill.currentChamber}` };
    }
    if (bill.status !== "active" && bill.status !== "active_other" && bill.status !== "veto_override") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Bill not in voting status: ${bill.status}` };
    }
    const targetMap = bill.status === "active_other" ? (bill.otherChamberVotes ??= {}) : bill.status === "veto_override" ? (bill.vetoOverrideVotes ??= {}) as Record<string, string> : bill.votes;
    const key = "player";
    (targetMap as Record<string, string>)[key] = vote;
    return { ok: true, message: `Voted ${vote} on ${billId}` };
  }
  if (actionId === "repealLaw") {
    if (found.kind !== "player") return { ok: false, error: "Only player can repeal laws" };
    const catalogId = params.catalogId;
    if (!catalogId) return { ok: false, error: "repealLaw requires catalogId" };
    const player = world.player as unknown as { legislativeSeat: unknown; mode: string };
    if (player.mode !== "hos" && !player.legislativeSeat) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Must hold a legislative seat to repeal" };
    }
    if (params.regionId) {
      const region = world.regions[params.regionId];
      if (!region || region.countryId !== world.player.countryId) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Unknown region ${params.regionId} for ${world.player.countryId}` };
      }
    }
    const leg = awaitImportCatalog(catalogId);
    const law = world.enactedLaws.find(
      (l) => l.id === catalogId && l.repealedAtTurn === undefined && (!params.regionId || l.regionId === params.regionId),
    );
    const hasActiveLedger = Object.values(world.policyLedger).some(
      (entry) =>
        entry.legislationTypeId === catalogId &&
        entry.repealedAtTurn === undefined &&
        !entry.isRepeal &&
        (!params.regionId || entry.regionId === params.regionId),
    );
    const hasAuthoredBaseline =
      !params.regionId &&
      leg?.status === "available" &&
      leg.kind !== "tax" &&
      leg.allowedScope !== "regional" &&
      (leg.baselineLevel ?? 0) > 0;
    if (!law && !hasActiveLedger && !hasAuthoredBaseline) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `No active enacted law ${catalogId} to repeal` };
    }
    // Create a repeal bill (negative effectDirection)
    const title = `Repeal ${leg?.title ?? catalogId}`;
    const id = `bill-repeal-${world.meta.turn}-${world.bills.length + 1}-${catalogId}`;
    const countryId = law?.countryId ?? leg?.countryId ?? world.player.countryId;
    const legConfig = world.legislatures[countryId];
    const originChamber = legConfig?.chambers.find((c) => c.elected)?.key ?? "house";
    const bill: import("../legislation/types.js").Bill = {
      id,
      title,
      summary: `Repeal of ${catalogId}`,
      countryId,
      category: leg?.category ?? "economy",
      legislationTypeId: catalogId,
      effectDirection: -1,
      ...(params.regionId ? { regionId: params.regionId } : {}),
      repealsLawId: catalogId,
      provisions: [{ type: "policy", legislationTypeId: catalogId, effectDirection: -1 }],
      originChamber,
      currentChamber: originChamber,
      status: "proposed",
      sponsorId: "player",
      sponsorName: world.player.name,
      sponsorPartyId: world.player.partyId,
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      proposedAtTurn: world.meta.turn,
      filibusterInvocations: [],
      updatedAtTurn: world.meta.turn,
      committeeId: null,
    };
    world.bills.push(bill);
    // The same local singleplayer decree authority applies to supported
    // repeal proposals; source replacement/repeal uses the national-bill command.
    if (world.player.mode === "hos") {
      bill.status = "signed";
      bill.enactedAtTurn = world.meta.turn;
      bill.updatedAtTurn = world.meta.turn;
      applyBillEffects(world, bill);
      delete actor.actionCooldowns[actionId];
    }
    return { ok: true, message: `Repeal bill ${id} sponsored` };
  }
  if (actionId === "invokeFilibuster") {
    if (found.kind !== "player") return { ok: false, error: "Only the player can invoke a filibuster" };
    const billId = params.billId;
    if (!billId) return { ok: false, error: "invokeFilibuster requires billId" };
    const bill = world.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: `Unknown bill: ${billId}` };
    const playerSeat = world.player.legislativeSeat;
    if (!playerSeat || playerSeat.chamberKey !== "senate" || playerSeat.countryId !== bill.countryId) {
      return { ok: false, error: "Must hold a senate seat in the bill's country to invoke a filibuster" };
    }
    if (bill.currentChamber !== "senate") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Filibuster only in senate" };
    }
    if (bill.status !== "active" && bill.status !== "active_other") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Bill not in voting: ${bill.status}` };
    }
    bill.filibusterInvocations.push({ characterId: "player", characterName: world.player.name, invokedAtTurn: world.meta.turn });
    return { ok: true, message: `Filibuster invoked on ${billId}` };
  }

  // Intra-party ballot actions (W20, W34 catalog pattern)
  if (actionId === "contestPartyLeadership") {
    if (found.kind !== "player") return { ok: false, error: "Only player can contest party leadership" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member to contest" };
    const targetId = params.intrapartyElectionId;
    const position = params.position;
    // If specific election id given, enter that one; otherwise find first matching voting race for player's party
    let election: import("../intraparty/types.js").StatePartyElectionRecord | import("../intraparty/types.js").NationalPartyElectionRecord | undefined;
    if (targetId) {
      election = (world.statePartyElections as unknown as Array<{ id: string }>).find((e) => e.id === targetId) as unknown as typeof election
        ?? (world.nationalPartyElections as unknown as Array<{ id: string }>).find((e) => e.id === targetId) as unknown as typeof election;
    } else if (position) {
      // Try state first: need regionId; use player's country first region
      const playerCountry = world.player.countryId;
      const regionIds = Object.values(world.regions).filter((r) => r.countryId === playerCountry).map((r) => r.id);
      for (const rid of regionIds) {
        const cand = world.statePartyElections.find((e) => e.status === "voting" && e.partyId === world.player.partyId && e.regionId === rid && e.position === position);
        if (cand) { election = cand; break; }
      }
      if (!election) {
        election = world.nationalPartyElections.find((e) => e.status === "voting" && e.partyId === world.player.partyId && e.position === position);
      }
    } else {
      return { ok: false, error: "contestPartyLeadership requires intrapartyElectionId or position" };
    }
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "No matching party leadership election found" };
    }
    const rec = election as unknown as {
      candidateIds: string[];
      partyId: string;
      status: string;
      founding?: boolean;
      regionId?: string;
    };
    if (rec.status !== "voting") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Election not in voting status" };
    }
    if (rec.partyId !== world.player.partyId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Election is for a different party" };
    }
    const gate = getPlayerPartyLeadershipGate(world, rec.partyId, {
      ...(rec.founding !== undefined ? { founding: rec.founding } : {}),
      ...(rec.regionId !== undefined ? { regionId: rec.regionId } : {}),
    });
    if (!gate.eligible) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      const error = gate.reason === "region"
        ? "State party leadership requires residence in the election region"
        : gate.reason === "tenure"
          ? `Party leadership tenure: ${gate.turnsRemaining} turn(s) remaining`
          : "Election is for a different party";
      return { ok: false, error };
    }
    if (rec.candidateIds.includes("player")) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Already a candidate in this election" };
    }
    rec.candidateIds.push("player");
    return { ok: true, message: `Entered ${election.id} as candidate` };
  }
  if (actionId === "votePartyLeadership") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member to vote" };
    const electionId = params.intrapartyElectionId;
    const candidateId = params.candidateId;
    if (!electionId || !candidateId) return { ok: false, error: "votePartyLeadership requires intrapartyElectionId and candidateId" };
    const election = (world.statePartyElections.find((e) => e.id === electionId)
      ?? world.nationalPartyElections.find((e) => e.id === electionId)) as unknown as {
        votes: Record<string, string>;
        candidateIds: string[];
        partyId: string;
        status: string;
        founding?: boolean;
        regionId?: string;
      } | undefined;
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown election ${electionId}` };
    }
    if (election.status !== "voting") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Election not in voting status" };
    }
    if (election.partyId !== world.player.partyId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Election is for a different party" };
    }
    if (!("regionId" in election) && !isPlayerNationalLeadershipVoter(world, election.partyId)) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Committee-method leadership voting is limited to committee members and party officers" };
    }
    const gate = getPlayerPartyLeadershipGate(world, election.partyId, {
      ...(election.founding !== undefined ? { founding: election.founding } : {}),
      ...(election.regionId !== undefined ? { regionId: election.regionId } : {}),
    });
    if (!gate.eligible) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      const error = gate.reason === "region"
        ? "State party leadership requires residence in the election region"
        : gate.reason === "tenure"
          ? `Party leadership tenure: ${gate.turnsRemaining} turn(s) remaining`
          : "Election is for a different party";
      return {
        ok: false,
        error,
      };
    }
    if (!election.candidateIds.includes(candidateId)) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Candidate ${candidateId} not in this election` };
    }
    election.votes["player"] = candidateId;
    return { ok: true, message: `Voted for ${candidateId} in ${electionId}` };
  }
  if (actionId === "contestCommittee") {
    if (found.kind !== "player") return { ok: false, error: "Only player can contest committee" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member" };
    const electionId = params.intrapartyElectionId;
    let election: import("../intraparty/types.js").NationalCommitteeElectionRecord | undefined;
    if (electionId) election = world.nationalCommitteeElections.find((e) => e.id === electionId);
    else election = world.nationalCommitteeElections.find((e) => e.status === "voting" && e.partyId === world.player.partyId);
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "No committee election found for your party" };
    }
    if (election.status !== "voting") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Committee election not in voting status" };
    }
    if (election.partyId !== world.player.partyId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Committee election is for a different party" };
    }
    const committeeGate = getPlayerPartyLeadershipGate(world, election.partyId);
    if (!committeeGate.eligible) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return {
        ok: false,
        error: committeeGate.reason === "tenure"
          ? `Party leadership tenure: ${committeeGate.turnsRemaining} turn(s) remaining`
          : "Must be a member of the committee election party",
      };
    }
    if (election.candidateIds.includes("player")) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Already a candidate" };
    }
    election.candidateIds.push("player");
    return { ok: true, message: `Entered committee ${election.id}` };
  }
  if (actionId === "voteCommittee") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote committee" };
    const electionId = params.intrapartyElectionId;
    const picks = params.committeeCandidateIds ?? (params.candidateId ? [params.candidateId] : undefined);
    if (!electionId || !picks) return { ok: false, error: "voteCommittee requires intrapartyElectionId and committeeCandidateIds" };
    const election = world.nationalCommitteeElections.find((e) => e.id === electionId);
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown committee election ${electionId}` };
    }
    if (election.status !== "voting") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Not in voting" };
    }
    if (election.partyId !== world.player.partyId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Wrong party" };
    }
    const committeeGate = getPlayerPartyLeadershipGate(world, election.partyId);
    if (!committeeGate.eligible) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return {
        ok: false,
        error: committeeGate.reason === "tenure"
          ? `Party leadership tenure: ${committeeGate.turnsRemaining} turn(s) remaining`
          : "Must be a member of the committee election party",
      };
    }
    const maxVotes = 6; // COMMITTEE SIZE
    if (picks.length > maxVotes) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Too many picks, max ${maxVotes}` };
    }
    if (new Set(picks).size !== picks.length) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Committee picks must be unique" };
    }
    for (const cid of picks) {
      if (!election.candidateIds.includes(cid)) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Candidate ${cid} not in race` };
      }
    }
    election.votes["player"] = picks;
    return { ok: true, message: `Voted committee ${picks.join(",")} in ${electionId}` };
  }
  if (actionId === "issuePartyWhip") {
    if (found.kind !== "player") return { ok: false, error: "Only player can issue a party whip" };
    const partyId = world.player.partyId;
    const billId = params.billId;
    const direction = params.whipDirection;
    const mode = params.whipMode ?? "soft";
    if (!partyId || !billId || !direction) {
      return { ok: false, error: "issuePartyWhip requires party membership, billId, and whipDirection" };
    }
    const bill = world.bills.find((candidate) => candidate.id === billId);
    if (!bill) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown bill: ${billId}` };
    }
    if (bill.countryId !== world.player.countryId || bill.sponsorPartyId === null && world.parties[partyId]?.countryId !== bill.countryId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Party and bill must be in the same country" };
    }
    if (bill.status !== "active" && bill.status !== "active_other") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Bill not in voting status: ${bill.status}` };
    }
    if (!isPartyLeadershipAuthority(world, partyId, "player")) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Party whip requires the national chair or acting vice chair" };
    }
    const issuerRole = world.parties[partyId]?.chairId === "player" ? "chair" : "actingViceChair";
    const whip = {
      id: `whip-${billId}-${partyId}`,
      billId,
      partyId,
      countryId: bill.countryId,
      chamber: bill.currentChamber,
      direction,
      mode,
      issuedAtTurn: world.meta.turn,
      issuerId: "player",
      issuerRole,
    } as const;
    const partyWhips = world.partyWhips ??= [];
    const existing = partyWhips.findIndex((candidate) => candidate.billId === billId && candidate.partyId === partyId);
    if (existing >= 0) partyWhips[existing] = whip;
    else partyWhips.push(whip);
    return { ok: true, message: `Issued ${mode} ${direction} whip for ${partyId} on ${billId}` };
  }
  if (actionId === "createCoalition") {
    if (found.kind !== "player") return { ok: false, error: "Only player can create coalition" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member" };
    const name = params.coalitionName ?? `Coalition ${world.coalitions.length + 1}`;
    const abbr = params.coalitionAbbr ?? `C${world.coalitions.length + 1}`;
    const countryId = params.countryId ?? world.player.countryId;
    try {
      const co = Coalition.createCoalition(world, { countryId, name, abbreviation: abbr, founderPartyId: world.player.partyId, actorId: "player" });
      return { ok: true, message: `Created coalition ${co.id}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "joinCoalition") {
    if (found.kind !== "player") return { ok: false, error: "Only player can join" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member" };
    const coalitionId = params.coalitionId;
    if (!coalitionId) return { ok: false, error: "joinCoalition requires coalitionId" };
    try {
      Coalition.joinCoalition(world, coalitionId, world.player.partyId, "player");
      return { ok: true, message: `Joined ${coalitionId}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "initiateCoalitionDisband") {
    if (found.kind !== "player") return { ok: false, error: "Only player can initiate" };
    const coalitionId = params.coalitionId;
    if (!coalitionId) return { ok: false, error: "requires coalitionId" };
    if (!world.player.partyId) return { ok: false, error: "Must be member" };
    try {
      Coalition.initiateDisbandVote(world, coalitionId, world.player.partyId, "player");
      return { ok: true, message: `Disband vote started for ${coalitionId}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "voteCoalitionDisband") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote" };
    const coalitionId = params.coalitionId;
    const vote = params.disbandVote ?? (params.vote as "yes" | "no" | undefined);
    if (!coalitionId || !vote) return { ok: false, error: "requires coalitionId and disbandVote" };
    if (!world.player.partyId) return { ok: false, error: "Must be member" };
    try {
      Coalition.voteDisband(world, coalitionId, world.player.partyId, vote);
      return { ok: true, message: `Voted ${vote} on ${coalitionId} disband` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "voteCeo" || actionId === "acceptCeoAppointment" || actionId === "resignCeo" || actionId === "setCorporationCompensation") {
    if (found.kind !== "player") return { ok: false, error: "Only the player may manage this CEO relationship" };
    const corpId = params.corpId;
    if (!corpId) return { ok: false, error: `${actionId} requires corpId` };
    const corp = world.corporations[corpId];
    if (!corp) return { ok: false, error: `Unknown corporation: ${corpId}` };

    if (actionId === "voteCeo") {
      if (params.candidateId !== "player") return { ok: false, error: "The only available candidate is the player" };
      if (world.player.countryId !== corp.countryId) return { ok: false, error: "You must reside in the corporation's country to vote for its CEO" };
      if (!isCorpStateOwned(corp)) {
        if (!corp.headquartersRegionId || !world.regions[corp.headquartersRegionId]) return { ok: false, error: "This corporation's source-authored HQ region is not present in this era" };
        if (world.player.homeRegionId !== corp.headquartersRegionId) return { ok: false, error: "You must reside in the corporation's HQ region to be a CEO candidate" };
      }
      const holding = corp.shareholders.find((shareholder) => shareholder.holder === "player");
      if (!holding || holding.shares <= 0 || !Number.isFinite(holding.shares)) {
        return { ok: false, error: "You must hold shares to vote for the corporation CEO" };
      }
      const votes = (corp.ceoVotes ?? []).filter((vote) => vote.voterId !== "player");
      votes.push({ voterId: "player", candidateId: "player", shares: holding.shares });
      corp.ceoVotes = votes;
      const leader = reconcileCeoAppointment(corp);
      const bondConflict = Object.values(world.bonds).some((bond) => bond.issuerType === "corporation" && bond.corporationId === corp.id && bond.holders.some((holder) => holder.holderId === "player" && holder.units > 0));
      if (leader === "player" && bondConflict) delete corp.pendingCeoId;
      if (corp.pendingCeoId !== "player") return { ok: true, message: "Your vote was recorded; current shareholders have not offered you the CEO position" };
      return { ok: true, message: `Your ${holding.shares} shareholder votes nominate you as CEO of ${corp.tickerSymbol}` };
    }

    if (actionId === "acceptCeoAppointment") {
      // Reconcile the persisted offer against the current cap table immediately
      // before acceptance. Offers in a save can outlive a trade or a newer ballot.
      const leader = reconcileCeoAppointment(corp);
      const bondConflict = Object.values(world.bonds).some((bond) => bond.issuerType === "corporation" && bond.corporationId === corp.id && bond.holders.some((holder) => holder.holderId === "player" && holder.units > 0));
      if (leader === "player" && bondConflict) delete corp.pendingCeoId;
      if (corp.pendingCeoId !== "player") return { ok: false, error: "No CEO appointment is pending for you" };
      if (world.player.countryId !== corp.countryId) return { ok: false, error: "You must reside in the corporation's country to accept its CEO position" };
      if (!isCorpStateOwned(corp)) {
        if (!corp.headquartersRegionId || !world.regions[corp.headquartersRegionId]) return { ok: false, error: "This corporation's source-authored HQ region is not present in this era" };
        if (world.player.homeRegionId !== corp.headquartersRegionId) return { ok: false, error: "You must reside in the corporation's HQ region to accept its CEO position" };
      }
      const other = Object.values(world.corporations).find((candidate) => candidate.id !== corp.id && candidate.ceoId === "player" && candidate.ceoVacant !== true);
      if (other) return { ok: false, error: `You are already CEO of ${other.tickerSymbol}; resign before accepting another position` };
      if (bondConflict) return { ok: false, error: "Sell this corporation's bonds before accepting its CEO position" };
      corp.ceoId = "player";
      corp.ceoType = "player";
      corp.ceoVacant = false;
      delete corp.pendingCeoId;
      return { ok: true, message: `You are now CEO of ${corp.tickerSymbol}` };
    }

    if (actionId === "setCorporationCompensation") {
      if (corp.ceoId !== "player" || corp.ceoVacant === true) return { ok: false, error: "Only the active CEO may set corporation compensation" };
      const salary = params.salaryPerTurn;
      const dividendRate = params.dividendRate;
      const rdBudgetPerTurn = params.rdBudgetPerTurn === undefined ? (corp.rdBudgetPerTurn ?? 0) : params.rdBudgetPerTurn;
      if (!Number.isFinite(salary) || salary! < 0 || salary! > Math.max(0, corp.revenue) * 1.25) {
        return { ok: false, error: "salaryPerTurn must be finite, non-negative, and no more than 1.25 times current corporation revenue" };
      }
      if (!Number.isFinite(dividendRate) || dividendRate! < 0 || dividendRate! > 25) {
        return { ok: false, error: "dividendRate must be finite and between 0 and 25 percent" };
      }
      if (!Number.isFinite(rdBudgetPerTurn) || rdBudgetPerTurn! < 0) {
        return { ok: false, error: "rdBudgetPerTurn must be finite and non-negative" };
      }
      const totalOverhead = salary! + rdBudgetPerTurn!;
      if (totalOverhead > Math.max(0, corp.revenue) * 1.5) {
        return { ok: false, error: "CEO salary and R&D budget cannot exceed 1.5 times current corporation revenue" };
      }
      corp.ceoSalaryPerTurn = salary!;
      corp.dividendRate = dividendRate!;
      corp.rdBudgetPerTurn = rdBudgetPerTurn!;
      return { ok: true, message: `Set ${corp.tickerSymbol} CEO salary, dividend rate, and R&D budget` };
    }

    if (corp.ceoId !== "player" || corp.ceoVacant === true) return { ok: false, error: "You are not the active CEO of this corporation" };
    corp.ceoVacant = true;
    delete corp.pendingCeoId;
    corp.ceoVotes = [];
    return { ok: true, message: `You resigned as CEO of ${corp.tickerSymbol}; the position is vacant` };
  }

  if (actionId === "issueCorporateBond") {
    if (found.kind !== "player") return { ok: false, error: "Only the player may issue corporation bonds" };
    const corpId = params.corpId;
    const faceValueAnchor = params.faceValue;
    const maturityTurns = params.maturityTurns;
    if (!corpId || faceValueAnchor === undefined || maturityTurns === undefined) {
      return { ok: false, error: "issueCorporateBond requires corpId, faceValue, and maturityTurns" };
    }
    const corp = world.corporations[corpId];
    if (!corp) return { ok: false, error: `Unknown corporation: ${corpId}` };
    if (corp.ceoType !== "player" || corp.ceoId !== "player" || corp.ceoVacant === true) {
      return { ok: false, error: "Only the active CEO may issue corporation bonds" };
    }
    if (!Number.isFinite(faceValueAnchor) || faceValueAnchor < 100_000) {
      return { ok: false, error: "Corporate bond face value must be at least 100000 in the accounting anchor" };
    }
    if (maturityTurns !== 96 && maturityTurns !== 240 && maturityTurns !== 336) {
      return { ok: false, error: "Corporate bond maturity must be 96, 240, or 336 turns" };
    }

    const quote = quoteCorporateBondIssuance(world, corpId);
    if (!quote.available) return { ok: false, error: quote.reason ?? "Corporate bond issuance is unavailable" };
    if (faceValueAnchor > quote.maximumFaceValue) {
      return { ok: false, error: `Corporate bond face value exceeds the quoted maximum of ${Math.floor(quote.maximumFaceValue)} USD accounting-anchor units` };
    }
    const totalUnits = Math.floor((faceValueAnchor * quote.exchangeRate) / BOND_UNIT_FACE_VALUE);
    const totalFaceLocal = totalUnits * BOND_UNIT_FACE_VALUE;
    if (!Number.isSafeInteger(totalUnits) || totalUnits <= 0 || !Number.isSafeInteger(totalFaceLocal)
      || !Number.isFinite(corp.liquidCapital + totalFaceLocal)) {
      return { ok: false, error: "Corporate bond face value is outside the supported whole-unit range" };
    }

    // Native has no bond-pool ledger. Game's no-pool fallback places the full
    // float and credits its proceeds to the issuer, which is the supported
    // underwriting path here.
    const issuance = issueCorporateBond(world, corpId, {
      totalUnits,
      maturityTurns,
      couponRate: quote.couponRates[maturityTurns],
    });
    if (!issuance.ok) return { ok: false, error: issuance.error };
    corp.liquidCapital += totalFaceLocal;
    return {
      ok: true,
      message: `Issued ${totalUnits} ${quote.currencyCode} bond units for ${corp.name ?? corp.tickerSymbol}`,
    };
  }

  if (actionId === "buybackCorporateBond") {
    if (found.kind !== "player") return { ok: false, error: "Only the player may buy back corporation bonds" };
    const bondId = params.bondId;
    const units = params.units;
    if (!bondId || units === undefined) return { ok: false, error: "buybackCorporateBond requires bondId and a positive integer units amount" };
    const bond = world.bonds[bondId];
    if (!bond) return { ok: false, error: `Unknown bond: ${bondId}` };
    if (bond.issuerType !== "corporation" || !bond.corporationId) return { ok: false, error: `Bond ${bondId} is not a corporate issue` };
    const issuer = world.corporations[bond.corporationId];
    if (!issuer || issuer.ceoType !== "player" || issuer.ceoId !== "player" || issuer.ceoVacant === true) {
      return { ok: false, error: "Only the active issuer CEO may buy back corporation bonds" };
    }
    const result = buybackCorporateBondUnits(world, bondId, units);
    return result.ok
      ? { ok: true, message: `Bought back ${result.units} units of ${issuer.name ?? issuer.tickerSymbol} bonds for ${result.cost} ${result.currencyCode}` }
      : result;
  }

  if (actionId === "buyShares" || actionId === "sellShares") {
    // Simplified market order: ports mainline's buyPublicShares/sellPublicShares
    // "instant" retail path only (price = corp.sharePrice, no brokerage fee —
    // see market/constants.ts), NOT the human-liquidity order book
    // (placeShareOrder/fillShareOrder/acceptShareOffer). Successful trades also
    // accumulate their executed notional for the next turn's source-backed
    // order-flow multiplier.
    if (found.kind !== "player") return { ok: false, error: "Only the player trades shares" };
    const corpId = params.corpId;
    const shares = params.shares;
    if (!corpId || shares === undefined || !Number.isInteger(shares) || shares <= 0) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `${actionId} requires corpId and a positive integer shares amount` };
    }
    const corp = world.corporations[corpId];
    if (!corp) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown corporation: ${corpId}` };
    }
    // Notional at the live price, cash-rounded. Eligibility is captured before
    // the trade changes publicFloat, matching the source command path.
    const notional = Math.round(shares * corp.sharePrice * 100) / 100;
    const orderFlowEligible = isOrderFlowPriceEligible(corp.publicFloat, corp.totalShares);
    const player = world.player as unknown as { cash: number };

    if (actionId === "buyShares") {
      if (corp.publicFloat < shares) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Only ${corp.publicFloat} shares available in ${corp.tickerSymbol}'s public float` };
      }
      if ((player.cash ?? 0) < notional) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Not enough cash. Required: ${notional}, Available: ${player.cash}` };
      }
      player.cash -= notional;
      corp.publicFloat -= shares;
      // Treasury-backed market maker: the buyer's payment is injected into the
      // issuer's liquidCapital so a float buy conserves money instead of
      // vanishing. Source: buyPublicShares.ts applyFloatBuyCredit comment.
      corp.liquidCapital += notional;
      let holding = corp.shareholders.find((sh) => sh.holder === "player");
      if (!holding) {
        holding = { holder: "player", shares: 0, avgCostPerShare: corp.sharePrice };
        corp.shareholders.push(holding);
      }
      const priorShares = holding.shares;
      const priorAvg = holding.avgCostPerShare ?? corp.sharePrice;
      holding.avgCostPerShare =
        priorShares > 0 ? (priorShares * priorAvg + shares * corp.sharePrice) / (priorShares + shares) : corp.sharePrice;
      holding.shares += shares;
      if (orderFlowEligible) {
        corp.orderFlowWindowBuyValue = (corp.orderFlowWindowBuyValue ?? 0) + notional;
      }
      return { ok: true, message: `Bought ${shares} shares of ${corp.tickerSymbol} for ${notional}` };
    }

    // sellShares
    const holding = corp.shareholders.find((sh) => sh.holder === "player");
    if (!holding || holding.shares < shares) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `You only own ${holding?.shares ?? 0} shares of ${corp.tickerSymbol}` };
    }
    if (corp.liquidCapital < notional) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `${corp.tickerSymbol}'s treasury can't cover this sale (needs ${notional})` };
    }
    // Issuer buyback: proceeds paid from the issuing corp's own treasury,
    // capped by what it can cover (the check above). Source:
    // sellPublicShares.ts settleFloatSellDebit / gateIssuerBuyback comments.
    corp.liquidCapital -= notional;
    corp.publicFloat += shares;
    holding.shares -= shares;
    if (holding.shares === 0) {
      corp.shareholders = corp.shareholders.filter((sh) => sh !== holding);
    }
    reconcileCeoAppointment(corp);
    player.cash = (player.cash ?? 0) + notional;
    if (orderFlowEligible) {
      corp.orderFlowWindowSellValue = (corp.orderFlowWindowSellValue ?? 0) + notional;
    }
    return { ok: true, message: `Sold ${shares} shares of ${corp.tickerSymbol} for ${notional}` };
  }

  // W13 bonds — player buy/sell sovereign bond units at mainline pricing.
  // #307 extends the same seam to corporate issues with issuer/owner invariant
  // enforcement below (corporate servicing itself is #308).
  // Ports src/app/api/bonds/[bondId]/buy + sell (reserveBondUnitsForHolder) at neutral fee.
  // Pricing: cost = units × faceValue × marketPrice, rounded once (same as mainline's costLocal).
  // Denomination (#306): the debit/credit balance is named by the bond's authoritative
  // currencyCode (Task-18B canonical key; legacy fallback country currency then USD — the
  // same resolver as the coupon/maturity path in bonds/bondTurn.ts). Home-currency bonds
  // move player.cash (preserves domestic behavior and old saves); foreign bonds move
  // currencyBalances.personal[ccy] (optional, JSON-safe; absent means zero). No FX
  // conversion — the solo engine has no FX system, so a foreign bond needs a pre-funded
  // foreign balance (coupons/maturities from #305 are one way to fund it). Corporate
  // bond lifecycle/servicing stays out of scope (#307/#308); corporate issues carrying
  // an explicit denomination settle through this same path.
  if (actionId === "buyBond" || actionId === "sellBond") {
    if (found.kind !== "player") return { ok: false, error: "Only the player trades bonds" };
    const bondId = params.bondId;
    const units = params.units;
    if (!bondId || units === undefined || !Number.isInteger(units) || units <= 0) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `${actionId} requires bondId and a positive integer units amount` };
    }
    const bond = world.bonds[bondId];
    if (!bond) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown bond: ${bondId}` };
    }
    if (bond.matured) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Bond ${bondId} has already matured` };
    }
    if (bond.defaulted) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Bond ${bondId} is in default` };
    }
    // #307 issuer/owner invariants — corporate issues must name a live
    // corporation with matching country, term, denomination, ownership, and
    // conserved float; sovereign issues must not carry a corporationId.
    const identityError = validateBondIssuerIdentity(world, bond);
    if (identityError) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: identityError };
    }
    const bondCurrency = resolveBondCurrency(world, bond);
    const homeCurrency = resolveCountryCurrency(world, world.player.countryId);
    const domestic = bondCurrency === homeCurrency;
    // Read-only lookup: never creates currencyBalances, so a refusal changes
    // neither cash/currency balances, holdings, nor public float.
    const denominationBalance = (): number =>
      domestic ? (world.player.cash ?? 0) : (world.player.currencyBalances?.personal?.[bondCurrency] ?? 0);
    const pricePerUnit = Math.round(bond.faceValue * bond.marketPrice * 100) / 100;
    const notional = Math.round(units * bond.faceValue * bond.marketPrice * 100) / 100;
    const debitDenomination = (amount: number): void => {
      if (domestic) {
        world.player.cash -= amount;
      } else {
        const balances = (world.player.currencyBalances ??= { personal: {} }).personal;
        balances[bondCurrency] = (balances[bondCurrency] ?? 0) - amount;
      }
    };
    const creditDenomination = (amount: number): void => {
      if (domestic) {
        world.player.cash = (world.player.cash ?? 0) + amount;
      } else {
        const balances = (world.player.currencyBalances ??= { personal: {} }).personal;
        balances[bondCurrency] = (balances[bondCurrency] ?? 0) + amount;
      }
    };
    if (actionId === "buyBond") {
      if (bond.publicFloat < units) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Only ${bond.publicFloat} units available in ${bond.id}'s public float` };
      }
      const available = denominationBalance();
      if (available < notional) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return domestic
          ? { ok: false, error: `Not enough cash. Required: ${notional}, Available: ${world.player.cash}` }
          : { ok: false, error: `Not enough ${bondCurrency} balance. Required: ${notional}, Available: ${available}` };
      }
      // Single action transition: balance, holding, and public-float changes
      // commit together. Every refusal above returns before this point.
      debitDenomination(notional);
      bond.publicFloat -= units;
      let holding = bond.holders.find((h) => h.holderId === "player");
      if (!holding) {
        holding = { holderId: "player", units: 0 };
        bond.holders.push(holding);
      }
      holding.units += units;
      bond.updatedAt = world.meta.date;
      return { ok: true, message: `Bought ${units} units of ${bond.id} for ${notional} (${bondCurrency})` };
    }
    const holding = bond.holders.find((h) => h.holderId === "player");
    if (!holding || holding.units < units) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `You only own ${holding?.units ?? 0} units of ${bond.id}` };
    }
    // Single action transition: holding, public float, and balance credit
    // commit together (mirrors the mainline sell's pool-debit + holder + credit).
    holding.units -= units;
    if (holding.units === 0) bond.holders = bond.holders.filter((h) => h !== holding);
    bond.publicFloat += units;
    creditDenomination(notional);
    bond.updatedAt = world.meta.date;
    return { ok: true, message: `Sold ${units} units of ${bond.id} for ${notional} (${bondCurrency})` };
  }

  // W31 crisis action hooks — player responses to active crises.
  // Each action targets the active crisis for the player's country (or first active if none country-specific).
  // Effects mirror src/lib/crises/optionActions.ts: bailout shortens banking crisis, stimulus shortens recession,
  // generic response shortens any crisis by 1, monitor is no-op. All consume AP + fundCost already deducted.
  if (actionId === "crisisBailout" || actionId === "crisisStimulus" || actionId === "crisisRespond" || actionId === "crisisMonitor") {
    const countryId = world.player.countryId;
    const crisis = world.crises.find((c) => c.status === "active" && c.countryIds.includes(countryId))
      ?? world.crises.find((c) => c.status === "active");
    if (!crisis) {
      // No active crisis: no-op success (same as mainline's autoResolveOnExpiry fallback — action doesn't error, just no effect)
      return { ok: true, message: "No active crisis to respond to." };
    }
    if (crisis.playerResponse) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Already responded to this crisis" };
    }
    if (actionId === "crisisBailout") {
      if (crisis.kind !== "crisis.bankingCrisis") {
        actor.actions += cost;
        actor.funds += fundCost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: "Bailout is only for banking crises" };
      }
      // Treasury already debited via fundCost; also shorten duration
      crisis.durationTurns = Math.max(1, (crisis.durationTurns ?? 8) - 3);
      crisis.playerResponse = "bailout";
      return { ok: true, message: "Bailout authorized: crisis shortened by 3 turns." };
    }
    if (actionId === "crisisStimulus") {
      if (crisis.kind !== "crisis.recession") {
        actor.actions += cost;
        actor.funds += fundCost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: "Stimulus is only for recessions" };
      }
      crisis.durationTurns = Math.max(1, (crisis.durationTurns ?? 12) - 2);
      crisis.playerResponse = "stimulus";
      return { ok: true, message: "Stimulus passed: recession shortened by 2 turns." };
    }
    if (actionId === "crisisRespond") {
      crisis.durationTurns = Math.max(1, (crisis.durationTurns ?? 8) - 1);
      crisis.playerResponse = "respond";
      return { ok: true, message: "Crisis response coordinated: shortened by 1 turn." };
    }
    if (actionId === "crisisMonitor") {
      crisis.playerResponse = "monitor";
      return { ok: true, message: "Monitoring crisis: no action taken." };
    }
  }

  // ── M1 economic-direction levers (Lane 12 Head of State mode) ─────
  // Country-level fiscal authority, not a party action: gated on
  // player.mode directly (like sponsorBill/repealLaw above), not the
  // HOS_PARTY_BYPASS_ACTIONS party-membership swap. Each mutates budget
  // state at the next turn boundary through fiscalDirectivesPhase, which calls
  // the same pure budget calculators and preserves the surplus invariant.
  // Tax directives phase in through budget.taxRatePhaseIn exactly like federal
  // tax legislation (issue #93); spending directives enact at the boundary.
  if (actionId === "adjustBudgetSpending" || actionId === "adjustTaxRate") {
    if (found.kind !== "player") return { ok: false, error: "Only the player directs the budget" };
    const player = world.player as unknown as { mode: string };
    if (player.mode !== "hos") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Economic direction levers require Head of State mode" };
    }
    const countryId = world.player.countryId;
    if (params.budgetCountryId !== undefined && params.budgetCountryId !== countryId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "A budget directive can only target the player's country" };
    }
    const budget = world.budgets[countryId];
    if (!budget) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `No budget for country: ${countryId}` };
    }
    if (actionId === "adjustBudgetSpending") {
      const category = params.budgetCategory;
      const amount = params.budgetAmount;
      if (!category || amount === undefined || !Number.isFinite(amount) || amount < 0) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: "adjustBudgetSpending requires budgetCategory and a non-negative finite budgetAmount" };
      }
      world.pendingFiscalDirectives = [
        ...(world.pendingFiscalDirectives ?? []),
        { id: `fiscal-${world.meta.turn}-${actionId}`, countryId, kind: "spending", field: category, value: amount, proposedTurn: world.meta.turn },
      ];
      return { ok: true, message: `Directed ${category} spending to ${amount} for ${countryId}; enacts next turn.` };
    }
    // adjustTaxRate
    const field = params.taxField;
    const rate = params.taxRate;
    if (!field || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "adjustTaxRate requires taxField and taxRate in [0,100]" };
    }
    world.pendingFiscalDirectives = [
      ...(world.pendingFiscalDirectives ?? []),
      { id: `fiscal-${world.meta.turn}-${actionId}`, countryId, kind: "tax", field, value: rate, proposedTurn: world.meta.turn },
    ];
    return { ok: true, message: `Directed ${field} to ${rate}% for ${countryId}; enacts next turn.` };
  }
  // ── setSubsidyRate (#94): source subsidy legislation proposal ─────────
  // AHDGame's subsidy route creates subsidy/end_subsidy provisions and lets
  // the normal legislature lifecycle vote and enact them. This action keeps
  // the source proposal charge (10 AP); it never mutates subsidy state itself.
  if (actionId === "setSubsidyRate") {
    const fail = (error: string): ExecuteActionResult => {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error };
    };
    if (found.kind !== "player") return fail("Only the player directs subsidies");
    const countryId = world.player.countryId;
    const seat = world.player.legislativeSeat;
    if (world.player.mode !== "hos" && seat?.countryId !== countryId) {
      return fail("A national subsidy bill requires Head of State authority or a legislative seat in the player's country");
    }
    if (params.budgetCountryId !== undefined && params.budgetCountryId !== countryId) {
      return fail("A subsidy directive can only target the player's country");
    }
    if (!world.budgets[countryId]) return fail(`No budget for country: ${countryId}`);
    const op = params.subsidyOp;
    if (op !== "enact" && op !== "end") {
      return fail("setSubsidyRate requires subsidyOp 'enact' or 'end'");
    }
    if (params.subsidyScope !== undefined && params.subsidyScope !== "national") {
      return fail("setSubsidyRate supports national scope only: solo has no state-budget subsidy writer");
    }
    if (params.targetStrategyId !== undefined && typeof params.targetStrategyId !== "string") {
      return fail("targetStrategyId must be a string when supplied");
    }
    if (params.domesticOnly !== undefined && typeof params.domesticOnly !== "boolean") {
      return fail("domesticOnly must be a boolean when supplied");
    }
    const scopeType = params.subsidyScopeType ?? "economy_wide";
    const sectorType = params.sectorType ?? null;
    const targetStrategyId = typeof params.targetStrategyId === "string" ? params.targetStrategyId.trim() || null : null;
    if (scopeType !== "economy_wide" && scopeType !== "sector") return fail("Subsidy scope must be economy_wide or sector");
    if (scopeType === "sector" && (!sectorType || !Object.values(world.corporations).some((corp) => corp.countryId === countryId && corp.sectorType === sectorType))) {
      return fail("Sector subsidies require a sector present in the player's country");
    }
    const endTarget = op === "end" ? (world.subsidies ?? []).find((subsidy) => subsidy.active
      && subsidy.countryId === countryId && subsidy.scope === "national" && subsidy.scopeType === scopeType
      && (subsidy.targetSectorType ?? null) === (scopeType === "sector" ? sectorType : null)
      && (subsidy.targetStrategyId ?? null) === targetStrategyId) : undefined;
    if (op === "end" && !endTarget) return fail("No active national subsidy matches this proposal");
    const proposalId = `bill-${world.meta.turn}-${world.bills.length + 1}-subsidy-${countryId}`;
    const isEnd = op === "end";
    const provision = {
      type: isEnd ? "end_subsidy" as const : "subsidy" as const,
      legislationTypeId: "national_subsidy",
      effectDirection: 1,
      subsidyScopeType: scopeType,
      targetSectorType: scopeType === "sector" ? sectorType : null,
      targetStrategyId,
      ...(!isEnd ? { domesticOnly: params.domesticOnly ?? false } : {}),
    };
    const legConfig = world.legislatures[countryId];
    const originChamber = (world.player.mode === "hos" ? undefined : seat?.chamberKey)
      ?? legConfig?.chambers.find((chamber) => chamber.elected)?.key ?? legConfig?.chambers[0]?.key ?? "house";
    world.bills.push({
      id: proposalId,
      title: isEnd ? `End ${scopeType === "sector" ? `${sectorType} ` : "economy-wide "}subsidy` : `National ${scopeType === "sector" ? `${sectorType} ` : "economy-wide "}subsidy`,
      summary: isEnd ? "End the active national subsidy through legislation." : "Provide the fixed source subsidy margin benefit to qualifying national production.",
      countryId,
      category: "industry",
      legislationTypeId: "national_subsidy",
      provisions: [provision],
      originChamber,
      currentChamber: originChamber,
      status: "proposed",
      sponsorId: "player",
      sponsorName: world.player.name,
      sponsorPartyId: world.player.partyId,
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      proposedAtTurn: world.meta.turn,
      filibusterInvocations: [],
      updatedAtTurn: world.meta.turn,
      committeeId: null,
    });
    return { ok: true, message: `Proposed ${isEnd ? "ending" : "national"} subsidy bill ${proposalId}` };
  }
  if (actionId === "commandEconomyDirective") {
    if (found.kind !== "player") return { ok: false, error: "Only the player can direct Gosbank policy" };
    if (!canPlayerOperateGosbank(world)) return { ok: false, error: "Only the Gosbank chair or head of government can set state credit policy" };
    const countryId = world.player.countryId;
    const commandState = world.commandEconomy[countryId];
    if (!commandState || !isPlannedEconomy(commandState.marketizationLevel)) {
      return { ok: false, error: `No planned-economy Gosbank system is active for ${countryId}` };
    }
    if (params.countryId !== undefined && params.countryId !== countryId) {
      return { ok: false, error: "A Gosbank directive can only target the player's country" };
    }
    if (params.directiveOp !== "setGosbankPosture") {
      return { ok: false, error: "commandEconomyDirective requires directiveOp 'setGosbankPosture'" };
    }
    const hasCredit = params.creditAggressiveness !== undefined;
    const hasSoftness = params.budgetSoftness !== undefined;
    const hasSectorCredit = params.sectorCredit !== undefined;
    if (!hasCredit && !hasSoftness && !hasSectorCredit) {
      return { ok: false, error: "A Gosbank directive must set a posture dial or sector-credit weights" };
    }
    for (const [name, value] of [["creditAggressiveness", params.creditAggressiveness], ["budgetSoftness", params.budgetSoftness]] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
        return { ok: false, error: `${name} must be a finite value in [0,1]` };
      }
    }
    const validSoeSectors = new Set<string>(Object.values(world.corporations)
      .filter((corporation) => corporation.countryId === countryId && corporation.soe)
      .map((corporation) => corporation.soe!.sector));
    const sectorCredit: Record<string, number> = {};
    for (const [sector, weight] of Object.entries(params.sectorCredit ?? {})) {
      if (!Number.isFinite(weight) || weight < 0 || weight > 1_000_000) {
        return { ok: false, error: `sectorCredit.${sector} must be a finite value in [0,1000000]` };
      }
      // Source route silently drops sectors outside commandEconomySoeSectors(country).
      if (validSoeSectors.has(sector)) sectorCredit[sector] = weight;
    }
    const pendingDirectives = commandState.pendingDirectives ?? [];
    const directive = {
      id: `gosbank-${countryId}-${world.meta.turn}-${pendingDirectives.length + 1}`,
      countryId,
      proposedTurn: world.meta.turn,
      effectiveTurn: world.meta.turn + 1,
      ...(hasCredit ? { creditAggressiveness: params.creditAggressiveness! } : {}),
      ...(hasSoftness ? { budgetSoftness: params.budgetSoftness! } : {}),
      ...(hasSectorCredit ? { sectorCredit: Object.keys(sectorCredit).length ? sectorCredit : null } : {}),
    };
    commandState.pendingDirectives = [...pendingDirectives, directive];
    return { ok: true, message: `Gosbank posture for ${countryId} is queued for turn ${directive.effectiveTurn}.` };
  }
  // ── W11 extraction/prospecting: source-authorized national / state issuers ──
  if (actionId === "expandRegionalExtraction") {
    if (found.kind !== "player") return { ok: false, error: "Only the player can direct a corporation in this session" };
    const regionId = params.regionId;
    if (!regionId) return { ok: false, error: "expandRegionalExtraction requires regionId" };
    const result = expandRegionalExtraction(world, regionId);
    return result.ok
      ? { ok: true, message: `Extraction operations opened in ${regionId}; expansion fee ${result.expansionCostAnchor} anchor` }
      : { ok: false, error: result.error };
  }
  if (actionId === "launchProspect" || actionId === "issueExtractionContract") {
    if (found.kind !== "player") {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: "Only the player can act for the national government" };
    }
    const resource = params.resource as ExtractableResource | undefined;
    const regionId = params.regionId;
    if (!resource || !regionId) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: `${actionId} requires regionId and resource` };
    }
    if (actionId === "launchProspect") {
      const requestedLevel = params.issuerLevel;
      const level = requestedLevel ?? (isNationalExtractionIssuer(world, world.player.countryId)
        ? "national"
        : isStateExtractionIssuer(world, world.player.countryId, regionId) ? "state" : undefined);
      const authorized = level === "national"
        ? isNationalExtractionIssuer(world, world.player.countryId)
        : level === "state" && isStateExtractionIssuer(world, world.player.countryId, regionId);
      if (!authorized || !level) {
        actor.actions += cost;
        return { ok: false, error: "Only the head of government or finance minister, or the state's governor, can commission a survey." };
      }
      const res = launchProspectingSurvey(world, { countryId: world.player.countryId, regionId, resource, level });
      if (!res.ok) {
        actor.actions += cost;
        if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
        return { ok: false, error: res.error };
      }
      return { ok: true, message: `Survey launched: ${res.surveyId} (cost ${res.costAnchor})` };
    }
    const share = params.share;
    const royaltyRatePerTurn = params.royaltyRatePerTurn;
    const termTurns = params.termTurns;
    const signingFeeAnchor = params.signingFeeAnchor;
    if (share === undefined || royaltyRatePerTurn === undefined || termTurns === undefined || signingFeeAnchor === undefined) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: "issueExtractionContract requires share, royaltyRatePerTurn, termTurns, signingFeeAnchor" };
    }
    const issuerLevel = resolveExtractionContractIssuer(world, world.player.countryId, regionId);
    if (!issuerLevel) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      const authority = getResourceContractAuthority(world, world.player.countryId);
      return { ok: false, error: authority === "national"
        ? "Only national officials may issue extraction contracts here."
        : authority === "state" ? "Only the state governor may issue extraction contracts here."
          : "You are not authorized to issue extraction contracts for this region." };
    }
    const res = issueContractOffer(world, {
      countryId: world.player.countryId,
      regionId,
      resource,
      share,
      royaltyRatePerTurn,
      termTurns,
      signingFeeAnchor,
    });
    if (!res.ok) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Contract offered: ${res.contractId}` };
  }

  // ── W35 player wealth: savings + wires ──────────────────────────────────
  if (actionId === "depositSavings" || actionId === "withdrawSavings") {
    if (found.kind !== "player") {
      actor.actions += cost;
      return { ok: false, error: "Only the player has personal savings" };
    }
    const amount = params.amount;
    if (amount === undefined) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: `${actionId} requires amount` };
    }
    const res = actionId === "depositSavings" ? depositToSavings(world, amount) : withdrawFromSavings(world, amount);
    if (!res.ok) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: res.error };
    }
    return { ok: true, message: actionId === "depositSavings" ? `Deposited ${amount} to savings` : `Withdrew ${amount} from savings` };
  }
  if (actionId === "moveSavings") {
    if (found.kind !== "player") {
      actor.actions += cost;
      return { ok: false, error: "Only the player has personal savings" };
    }
    const holder = params.holder;
    if (!holder) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: "moveSavings requires holder" };
    }
    const res = moveSavingsHolder(world, holder);
    if (!res.ok) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Savings now held at ${holder}` };
  }
  if (actionId === "wireTransfer") {
    if (found.kind !== "player") {
      actor.actions += cost;
      return { ok: false, error: "Only the player wires funds" };
    }
    const targetPoliticianId = params.targetPoliticianId;
    const amount = params.amount;
    if (!targetPoliticianId || amount === undefined) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: "wireTransfer requires targetPoliticianId and amount" };
    }
    const res = wireTransferFn(world, targetPoliticianId, amount, params.currency);
    if (!res.ok) {
      actor.actions += cost;
      if (actor.actionCounts) actor.actionCounts[actionId] = Math.max(0, (actor.actionCounts[actionId] ?? 1) - 1);
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Wired ${amount} ${res.currency} to ${res.recipientName}` };
  }
  if (actionId === "nationalizeCorporation") {
    if (found.kind !== "player") {
      actor.actions += cost;
      return { ok: false, error: "Only the sitting head of government may order an executive nationalization." };
    }
    if (params.tier !== "seizure") {
      actor.actions += cost;
      return { ok: false, error: "Executive nationalization currently supports only the source seizure tier." };
    }
    const result = nationalizeDistressedCorporation(world, params.corporationId ?? "", actorId);
    if (!result.ok) {
      actor.actions += cost;
      return result;
    }
    return { ok: true, message: result.message };
  }

  return { ok: false, error: `No effect for ${actionId}` };
}

function validateRequiredActionParams(actionId: string, params: ExecuteActionParams): string | null {
  switch (actionId) {
    case "canvass":
    case "organize":
    case "pressureBoost":
      return params.regionId ? null : `Action ${actionId} requires a regionId`;
    case "requestReferendum":
      return params.regionId ? null : "requestReferendum requires regionId";
    case "referendumCampaignSpend":
      return params.referendumId && params.units !== undefined
        ? null
        : "referendumCampaignSpend requires referendumId and units";
    case "referendumGroundGame":
      return params.referendumId && params.presetId
        ? null
        : "referendumGroundGame requires referendumId and presetId";
    case "joinParty":
      return params.partyId ? null : "joinParty requires partyId";
    case "foundParty":
      return params.foundPartyName && params.foundPartyAbbr
        ? null
        : "foundParty requires foundPartyName and foundPartyAbbr";
    case "createCaucus":
      return params.caucusName ? null : "createCaucus requires caucusName";
    case "joinCaucus":
      return params.caucusId ? null : "joinCaucus requires caucusId";
    case "disbandCaucus":
      return params.caucusId ? null : "disbandCaucus requires caucusId";
    case "setCaucusTaxRate":
      return params.caucusId && params.caucusTaxRate !== undefined
        ? null
        : "setCaucusTaxRate requires caucusId and caucusTaxRate";
    case "influenceNpp":
      return params.targetId && params.influenceType
        ? null
        : "influenceNpp requires targetId and influenceType";
    case "recruitCaucusNpp":
      return params.caucusId && params.targetId
        ? null
        : "recruitCaucusNpp requires caucusId and targetId";
    case "endorse":
      return params.endorsedId ? null : "endorse requires endorsedId";
    case "declareCandidacy":
    case "withdrawCandidacy":
    case "campaignRally":
    case "campaignRallyTour":
      return params.electionId ? null : `${actionId} requires electionId`;
    case "campaignRetarget":
      return params.electionId && params.oppositionTargetId
        ? null
        : "campaignRetarget requires electionId and oppositionTargetId";
    case "campaignManager":
      return params.electionId && Object.prototype.hasOwnProperty.call(params, "managerId")
        ? null
        : "campaignManager requires electionId and managerId";
    case "campaignCanvass":
      return params.electionId && params.regionId && params.demographicCategory && params.demographicGroup
        ? null
        : "campaignCanvass requires electionId, regionId, demographicCategory, and demographicGroup";
    case "campaignTargetedAd":
      return params.electionId && params.regionId && params.demographicCategory && params.demographicGroup
        ? null
        : "campaignTargetedAd requires electionId, regionId, demographicCategory, and demographicGroup";
    case "campaignContribute":
      return params.electionId ? null : "campaignContribute requires electionId";
    case "sponsorBill":
    case "repealLaw":
      return params.catalogId ? null : `${actionId} requires catalogId`;
    case "voteOnBill":
      return params.billId && params.vote ? null : "voteOnBill requires billId and vote";
    case "invokeFilibuster":
      return params.billId ? null : "invokeFilibuster requires billId";
    case "contestPartyLeadership":
      return params.intrapartyElectionId || params.position
        ? null
        : "contestPartyLeadership requires intrapartyElectionId or position";
    case "votePartyLeadership":
      return params.intrapartyElectionId && params.candidateId
        ? null
        : "votePartyLeadership requires intrapartyElectionId and candidateId";
    case "issuePartyWhip":
      return params.billId && (params.whipDirection === "for" || params.whipDirection === "against" || params.whipDirection === "abstain")
        && (params.whipMode === undefined || params.whipMode === "hard" || params.whipMode === "soft")
        ? null
        : "issuePartyWhip requires billId, whipDirection, and a valid whipMode";
    case "voteCommittee":
      return params.intrapartyElectionId && (params.committeeCandidateIds || params.candidateId)
        ? null
        : "voteCommittee requires intrapartyElectionId and committeeCandidateIds";
    case "joinCoalition":
      return params.coalitionId ? null : "joinCoalition requires coalitionId";
    case "initiateCoalitionDisband":
      return params.coalitionId ? null : "requires coalitionId";
    case "voteCoalitionDisband":
      return params.coalitionId && (params.disbandVote || params.vote)
        ? null
        : "requires coalitionId and disbandVote";
    case "buyShares":
    case "sellShares":
      return params.corpId && params.shares !== undefined && Number.isInteger(params.shares) && params.shares > 0
        ? null
        : `${actionId} requires corpId and a positive integer shares amount`;
    case "nationalizeCorporation":
      return params.corporationId && params.tier === "seizure"
        ? null
        : "nationalizeCorporation requires corporationId and tier 'seizure'";
    case "voteCeo":
      return params.corpId && params.candidateId ? null : "voteCeo requires corpId and candidateId";
    case "acceptCeoAppointment":
    case "resignCeo":
      return params.corpId ? null : `${actionId} requires corpId`;
    case "setCorporationCompensation":
      return params.corpId && Number.isFinite(params.salaryPerTurn) && Number.isFinite(params.dividendRate) &&
        (params.rdBudgetPerTurn === undefined || Number.isFinite(params.rdBudgetPerTurn))
        ? null
        : "setCorporationCompensation requires corpId, salaryPerTurn, dividendRate, and optional rdBudgetPerTurn";
    case "buyBond":
    case "sellBond":
      return params.bondId && params.units !== undefined && Number.isInteger(params.units) && params.units > 0
        ? null
        : `${actionId} requires bondId and a positive integer units amount`;
    case "issueCorporateBond":
      return params.corpId && params.faceValue !== undefined && Number.isFinite(params.faceValue) && params.faceValue >= 100_000
        && params.maturityTurns !== undefined && [96, 240, 336].includes(params.maturityTurns)
        ? null
        : "issueCorporateBond requires corpId, faceValue of at least 100000, and maturityTurns of 96, 240, or 336";
    case "buybackCorporateBond":
      return params.bondId && params.units !== undefined && Number.isInteger(params.units) && params.units > 0
        ? null
        : "buybackCorporateBond requires bondId and a positive integer units amount";
    case "adjustBudgetSpending":
      return params.budgetCategory && params.budgetAmount !== undefined && Number.isFinite(params.budgetAmount) && params.budgetAmount >= 0
        ? null
        : "adjustBudgetSpending requires budgetCategory and a non-negative finite budgetAmount";
    case "adjustTaxRate":
      return params.taxField && params.taxRate !== undefined && Number.isFinite(params.taxRate) && params.taxRate >= 0 && params.taxRate <= 100
        ? null
        : "adjustTaxRate requires taxField and taxRate in [0,100]";
    case "setSubsidyRate":
      return params.subsidyOp === "enact" || params.subsidyOp === "end"
        ? null
        : "setSubsidyRate requires subsidyOp 'enact' or 'end'";
    case "launchProspect":
      return params.regionId && params.resource ? null : "launchProspect requires regionId and resource";
    case "expandRegionalExtraction":
      return params.regionId ? null : "expandRegionalExtraction requires regionId";
    case "issueExtractionContract":
      if (!params.regionId || !params.resource) return "issueExtractionContract requires regionId and resource";
      return params.share !== undefined &&
        params.royaltyRatePerTurn !== undefined &&
        params.termTurns !== undefined &&
        params.signingFeeAnchor !== undefined
        ? null
        : "issueExtractionContract requires share, royaltyRatePerTurn, termTurns, signingFeeAnchor";
    case "acceptExtractionContract":
    case "declineExtractionContract":
    case "revokeExtractionContract":
      return params.contractId ? null : `${actionId} requires contractId`;
    case "depositSavings":
    case "withdrawSavings":
      return params.amount === undefined ? `${actionId} requires amount` : null;
    case "moveSavings":
      return params.holder ? null : "moveSavings requires holder";
    case "wireTransfer":
      return params.targetPoliticianId && params.amount !== undefined
        ? null
        : "wireTransfer requires targetPoliticianId and amount";
    default:
      return null;
  }
}

function awaitImportCatalog(id: string): import("../legislation/catalog.js").CatalogEntry | null {
  return getLaw(id);
}
