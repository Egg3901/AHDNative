/**
 * Public bargaining actions — #322.
 *
 * Session-level operations over the campaign lifecycle: open (call),
 * employer answer (accept / counter / reject into dispute), union moves
 * (accept via member ratification, counter, withdraw, escalate), and member
 * ballots. Every action validates fully BEFORE mutating anything and
 * restores snapshots if a write unexpectedly throws, so treasury, sectors,
 * campaigns, and agreements move together or not at all (same atomicity
 * contract as #321 applyUnionContributionPayouts).
 *
 * Refusals throw Errors (no HTTP layer in solo): unknown ids, suspended
 * unions, failed mandate/terms gates, cooldowns, stale state
 * ("Campaign state changed. Reload and try again." — the reference's own
 * optimistic-concurrency message), and same-turn double acts.
 *
 * The employer side is NPC in solo (no player-run corporations), so these
 * functions are what the turn's NPP auto-play calls too — one code path
 * for manual and autonomous moves, exactly like the reference's shared
 * persist* services.
 *
 * Source: <mainline-checkout>/src/lib/unions/commands/bargaining.ts
 *         (openBargainingCampaignFromLiveConditions, persistBargaining*,
 *         actOnBargainingCampaignAsUnion/AsEmployer) and
 *         commands/ratifySettlement.ts (openSettlementRatification,
 *         cast ballot, closeRatificationVote) at pinned
 *         e364c04954ed628beef73a993a8e9e156650a31e.
 */

import type { WorldState } from "../types.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import type { CorporateSectorAsset } from "../corporation/corporateSectorAssets.js";
import type { Union } from "./types.js";
import {
  bargainingCampaignIdFor,
  bargainingCampaigns,
  collectiveAgreements,
  type BargainingCampaign,
  type BargainingParty,
  type CollectiveAgreement,
} from "./campaigns.js";
import {
  BARGAINING_REOPEN_COOLDOWN_TURNS,
  bargainingReopenTurn,
  buildBargainingEscalationPlan,
  buildBargainingMandate,
  counterBargainingOffer,
  disputeLapseTurn,
  escalateBargainingCampaign,
  isCollectiveAgreementActive,
  laborTightnessFromUnemployment,
  lawSupportFromBias,
  moveCampaignToDispute,
  openBargainingCampaign,
  openRatificationVote,
  ratificationBlockReason,
  ratificationWeightFor,
  isRatificationOpen,
  realWageIndex,
  recordEscalationExpectations,
  resolveRatification,
  settleBargainingCampaign,
  strikeCallCost,
  STRIKE_CALL_MIN_UNIONIZATION,
  STRIKE_EXPECTATION_GAP_THRESHOLD,
  tallyRatificationBallots,
  validateBargainingTerms,
  type BargainingTerms,
} from "./bargaining.js";
import { eligibleOrganizerShares } from "./organizers.js";

export const BARGAINING_STATE_CHANGED = "Campaign state changed. Reload and try again.";

/** Live locals in scope for a union/employer pair, in asset-id order. */
export function scopedLocalsForPair(
  world: WorldState,
  union: Pick<Union, "countryId" | "sectorType">,
  employerCorporationId: string
): CorporateSectorAsset[] {
  const assets = corporateSectorAssets(world);
  return Object.values(assets)
    .filter(
      (asset) =>
        asset.corporationId === employerCorporationId &&
        asset.countryId === union.countryId &&
        asset.sectorType === union.sectorType
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Macro inputs for the mandate: tightness from the country unemployment rate (0-1 fraction scaled to percent), neutral law support (no Native bias axis). */
export function bargainingMacroInputs(world: WorldState, countryId: string): { laborTightness: number; lawSupport: number } {
  const unemployment = world.countries[countryId]?.economy.unemploymentRate;
  const percent = typeof unemployment === "number" && Number.isFinite(unemployment) ? unemployment * 100 : 5;
  return {
    laborTightness: laborTightnessFromUnemployment(percent),
    lawSupport: lawSupportFromBias(undefined),
  };
}

/** Build a mandate from live locals. Used at open and every turn refresh, so organizing during a dispute moves the running campaign. */
export function mandateFromLocals(
  world: WorldState,
  union: Union,
  locals: readonly CorporateSectorAsset[],
  treasury: number
): ReturnType<typeof buildBargainingMandate> {
  const density = Math.max(0, Math.min(100, union.unionization ?? 0));
  const macro = bargainingMacroInputs(world, union.countryId);
  const organizedCount = locals.filter(
    (local) => (local.unionization ?? density) >= STRIKE_CALL_MIN_UNIONIZATION
  ).length;
  return buildBargainingMandate({
    locals: locals.map((local) => ({
      workers: local.workers ?? 0,
      unionization: local.unionization ?? density,
      wageLevel: local.wageLevel ?? 1,
      workerExpectationIndex: local.workerExpectationIndex,
      costOfLivingIndex: undefined,
    })),
    laborTightness: macro.laborTightness,
    lawSupport: macro.lawSupport,
    treasury,
    strikeCost: strikeCallCost(organizedCount),
  });
}

function requireUnion(world: WorldState, unionId: string): Union {
  const union = world.unions[unionId];
  if (!union || union.id !== unionId) throw new Error(`Union not found: ${unionId}`);
  return union;
}

function requireOpenCampaign(world: WorldState, campaignId: string): BargainingCampaign {
  const campaign = bargainingCampaigns(world)[campaignId];
  if (!campaign || campaign.id !== campaignId) throw new Error(`Bargaining campaign not found: ${campaignId}`);
  return campaign;
}

/** Most recent ended (withdrawn/lapsed) campaign turn for a pair, or null. */
function lastEndedTurnForPair(world: WorldState, unionId: string, employerCorporationId: string): number | null {
  let last: number | null = null;
  for (const campaign of Object.values(world.bargainingCampaigns ?? {})) {
    if (campaign.unionId !== unionId || campaign.employerCorporationId !== employerCorporationId) continue;
    if ((campaign.status === "withdrawn" || campaign.status === "lapsed") && campaign.endedAtTurn != null) {
      last = last == null ? campaign.endedAtTurn : Math.max(last, campaign.endedAtTurn);
    }
  }
  return last;
}

function requireLivePair(world: WorldState, unionId: string, employerCorporationId: string): void {
  for (const campaign of Object.values(world.bargainingCampaigns ?? {})) {
    if (campaign.unionId !== unionId || campaign.employerCorporationId !== employerCorporationId) continue;
    if (campaign.status === "negotiating" || campaign.status === "dispute") {
      throw new Error("An open bargaining campaign already exists with this employer.");
    }
  }
}

function requireNoActiveAgreement(world: WorldState, unionId: string, employerCorporationId: string, turn: number): void {
  for (const agreement of Object.values(world.collectiveAgreements ?? {})) {
    if (
      agreement.unionId === unionId &&
      agreement.employerCorporationId === employerCorporationId &&
      isCollectiveAgreementActive(agreement, turn)
    ) {
      throw new Error(
        `A collective agreement already covers this employer through turn ${agreement.expiresAtTurn}.`
      );
    }
  }
}

function checkTurn(turn: number): void {
  if (!Number.isInteger(turn) || turn < 0) throw new Error(`Invalid turn: ${String(turn)}`);
}

// ── Open (call) ──────────────────────────────────────────────

export interface OpenCampaignArgs {
  unionId: string;
  employerCorporationId: string;
  terms: BargainingTerms;
  turn: number;
}

/**
 * Open one employer-scoped campaign. Refuses when the union is suspended,
 * the employer has no locals in the union's country + industry, an active
 * agreement covers the pair, an open campaign exists, the cooldown has not
 * cleared, or the mandate floors fail.
 */
export function openBargainingCampaignAction(world: WorldState, args: OpenCampaignArgs): BargainingCampaign {
  checkTurn(args.turn);
  const union = requireUnion(world, args.unionId);
  if (union.suspended) throw new Error(`Union ${union.id} is suspended; bargaining stays frozen`);
  const employer = world.corporations[args.employerCorporationId];
  if (!employer || employer.id !== args.employerCorporationId) {
    throw new Error(`Employer corporation not found: ${args.employerCorporationId}`);
  }
  const locals = scopedLocalsForPair(world, union, args.employerCorporationId);
  if (locals.length === 0) {
    throw new Error("This employer has no locals in the union's country and industry.");
  }
  requireNoActiveAgreement(world, union.id, employer.id, args.turn);
  requireLivePair(world, union.id, employer.id);
  const lastEnded = lastEndedTurnForPair(world, union.id, employer.id);
  if (lastEnded != null && args.turn < bargainingReopenTurn(lastEnded)) {
    throw new Error(`Bargaining with this employer can reopen on turn ${bargainingReopenTurn(lastEnded)}.`);
  }

  const mandate = mandateFromLocals(world, union, locals, union.treasury);
  const id = bargainingCampaignIdFor(union.id, employer.id, args.turn);
  const campaigns = bargainingCampaigns(world);
  if (campaigns[id]) throw new Error("An open bargaining campaign already exists with this employer.");
  const campaign = openBargainingCampaign({
    id,
    unionId: union.id,
    countryId: union.countryId,
    employerCorporationId: employer.id,
    sectorIds: locals.map((local) => local.id),
    mandate,
    terms: args.terms,
    currentTurn: args.turn,
  });
  if ("ok" in campaign) throw new Error(campaign.error);
  campaigns[campaign.id] = campaign;
  union.updatedAtTurn = args.turn;
  return campaign;
}

// ── Shared settlement writer ─────────────────────────────────

/**
 * Write a settlement: claim the campaign, insert the agreement, restore
 * pre-strike expectations. Single-threaded and validated up front, so the
 * three moves land together; a mid-write throw restores snapshots.
 */
function persistSettlement(
  world: WorldState,
  campaign: BargainingCampaign,
  settled: { campaign: BargainingCampaign; agreement: CollectiveAgreement },
  turn: number
): BargainingCampaign {
  const campaigns = bargainingCampaigns(world);
  const agreements = collectiveAgreements(world);
  const stored = campaigns[campaign.id];
  if (!stored || stored.status !== campaign.status || stored.currentOffer.revision !== campaign.currentOffer.revision) {
    throw new Error(BARGAINING_STATE_CHANGED);
  }
  if (agreements[settled.agreement.id]) throw new Error(BARGAINING_STATE_CHANGED);
  const priorCampaign = structuredClone(stored);
  campaigns[settled.campaign.id] = settled.campaign;
  agreements[settled.agreement.id] = settled.agreement;
  try {
    restoreEscalationExpectations(world, campaign);
  } catch (error) {
    campaigns[campaign.id] = priorCampaign;
    delete agreements[settled.agreement.id];
    throw error;
  }
  return settled.campaign;
}

/** Put shop-floor expectations back where they were before strike calls forced them up. */
export function restoreEscalationExpectations(world: WorldState, campaign: Pick<BargainingCampaign, "escalationExpectations">): number {
  const recorded = campaign.escalationExpectations ?? [];
  if (recorded.length === 0) return 0;
  const assets = corporateSectorAssets(world);
  let restored = 0;
  for (const entry of recorded) {
    const asset = assets[entry.sectorId];
    if (!asset) continue;
    asset.workerExpectationIndex = entry.previousExpectationIndex;
    restored++;
  }
  return restored;
}

// ── Employer answer ──────────────────────────────────────────

export interface EmployerAnswerArgs {
  campaignId: string;
  action: "accept" | "counter" | "reject";
  terms?: BargainingTerms;
  turn: number;
}

/**
 * NPC employer answers the standing offer. Accept settles (writes the
 * agreement); counter tables a new revision; reject moves a negotiating
 * campaign into dispute (the employer has no unilateral exit — rejecting
 * again changes nothing).
 */
export function answerBargainingCampaignAsEmployer(world: WorldState, args: EmployerAnswerArgs): BargainingCampaign {
  checkTurn(args.turn);
  const campaign = requireOpenCampaign(world, args.campaignId);
  if (campaign.status !== "negotiating" && campaign.status !== "dispute") {
    throw new Error("This campaign can no longer be answered.");
  }
  if (campaign.lastActionTurn >= args.turn) throw new Error(BARGAINING_STATE_CHANGED);
  const campaigns = bargainingCampaigns(world);

  if (args.action === "accept") {
    return settleBargainingCampaignDirect(world, args.campaignId, "employer", args.turn);
  }
  if (args.action === "counter") {
    if (!args.terms) throw new Error("Counteroffer terms are required.");
    const next = counterBargainingOffer({ campaign, proposedBy: "employer", terms: args.terms, currentTurn: args.turn });
    if ("ok" in next) throw new Error(next.error);
    campaigns[next.id] = next;
    return next;
  }
  const next = moveCampaignToDispute(campaign, args.turn);
  if ("ok" in next) throw new Error(next.error);
  campaigns[next.id] = next;
  return next;
}

/**
 * Settle a campaign directly without a member ballot: the autonomous path
 * the NPP auto-play and the empty-electorate accept share (reference
 * persistBargainingSettlement). Same guards as an accept, same atomic
 * campaign + agreement + expectation write.
 */
export function settleBargainingCampaignDirect(
  world: WorldState,
  campaignId: string,
  acceptedBy: BargainingParty,
  turn: number
): BargainingCampaign {
  checkTurn(turn);
  const campaign = requireOpenCampaign(world, campaignId);
  if (campaign.status !== "negotiating" && campaign.status !== "dispute") {
    throw new Error("This campaign can no longer be settled.");
  }
  if (campaign.currentOffer.proposedBy === acceptedBy) {
    throw new Error("The party that made an offer cannot accept its own offer.");
  }
  if (campaign.lastActionTurn >= turn) throw new Error(BARGAINING_STATE_CHANGED);
  const settled = settleBargainingCampaign({ campaign, acceptedBy, currentTurn: turn });
  if (!settled.ok) throw new Error(settled.error);
  return persistSettlement(world, campaign, settled, turn);
}

// ── Union moves ──────────────────────────────────────────────

export interface UnionMoveArgs {
  campaignId: string;
  action: "accept" | "counter" | "withdraw" | "escalate";
  terms?: BargainingTerms;
  turn: number;
}

export type UnionMoveResult =
  | { kind: "settled"; campaign: BargainingCampaign; agreement: CollectiveAgreement }
  | { kind: "ballot"; campaign: BargainingCampaign }
  | { kind: "moved"; campaign: BargainingCampaign; sectorsStriking?: number; cashSpent?: number };

function requireActableTurn(campaign: BargainingCampaign, turn: number): void {
  if (campaign.lastActionTurn >= turn) throw new Error(BARGAINING_STATE_CHANGED);
}

/**
 * Union-side moves. Accept puts the offer to the members when organizers
 * hold strength (a ballot nobody could answer would strand the settlement),
 * and settles directly otherwise. Counter tables a new revision (voiding an
 * open ballot on the replaced offer). Withdraw ends the campaign with a
 * cooling-off clock. Escalate climbs one rung through the shared
 * preview/gate plan: treasury debit, strike state on exactly the newly
 * struck locals, and forced expectations recorded for later restore.
 */
export function moveBargainingCampaignAsUnion(world: WorldState, args: UnionMoveArgs): UnionMoveResult {
  checkTurn(args.turn);
  const campaign = requireOpenCampaign(world, args.campaignId);
  const union = requireUnion(world, campaign.unionId);
  if (union.suspended) throw new Error(`Union ${union.id} is suspended; bargaining stays frozen`);
  const campaigns = bargainingCampaigns(world);

  if (args.action === "accept") {
    requireActableTurn(campaign, args.turn);
    if (campaign.status !== "negotiating" && campaign.status !== "dispute") {
      throw new Error("This campaign can no longer be settled.");
    }
    if (campaign.currentOffer.proposedBy === "union") {
      throw new Error("The party that made an offer cannot accept its own offer.");
    }
    const blocked = ratificationBlockReason(campaign, args.turn);
    if (blocked) throw new Error(blocked);
    const weights = new Map(
      eligibleOrganizerShares(world, union.id).map((share) => [share.characterId, share.strength] as [string, number])
    );
    const ratification = openRatificationVote({ campaign, weights, currentTurn: args.turn });
    if (ratification) {
      const next: BargainingCampaign = {
        ...campaign,
        ratification,
        ballots: [],
        lastActionTurn: args.turn,
        updatedAtTurn: args.turn,
      };
      campaigns[next.id] = next;
      return { kind: "ballot", campaign: next };
    }
    const settled = settleBargainingCampaign({ campaign, acceptedBy: "union", currentTurn: args.turn });
    if (!settled.ok) throw new Error(settled.error);
    return { kind: "settled", campaign: persistSettlement(world, campaign, settled, args.turn), agreement: settled.agreement };
  }

  if (args.action === "counter") {
    requireActableTurn(campaign, args.turn);
    if (!args.terms) throw new Error("Counteroffer terms are required.");
    const next = counterBargainingOffer({ campaign, proposedBy: "union", terms: args.terms, currentTurn: args.turn });
    if ("ok" in next) throw new Error(next.error);
    campaigns[next.id] = next;
    return { kind: "moved", campaign: next };
  }

  if (args.action === "withdraw") {
    if (campaign.status !== "negotiating" && campaign.status !== "dispute") {
      throw new Error("This campaign can no longer be withdrawn.");
    }
    const next: BargainingCampaign = {
      ...campaign,
      status: "withdrawn",
      escalationLevel: "none",
      endedAtTurn: args.turn,
      lastActionTurn: args.turn,
      updatedAtTurn: args.turn,
      ratification:
        campaign.ratification?.status === "open"
          ? { ...campaign.ratification, status: "void", closedAtTurn: args.turn }
          : campaign.ratification,
    };
    campaigns[next.id] = next;
    restoreEscalationExpectations(world, campaign);
    return { kind: "moved", campaign: next };
  }

  return escalateCampaignAction(world, campaign, union, args.turn);
}

function escalateCampaignAction(world: WorldState, campaign: BargainingCampaign, union: Union, turn: number): UnionMoveResult {
  const campaigns = bargainingCampaigns(world);
  const assets = corporateSectorAssets(world);
  const scoped = campaign.sectorIds
    .map((id) => assets[id])
    .filter((asset): asset is CorporateSectorAsset => asset != null);
  const liveMandate = mandateFromLocals(world, union, scoped, union.treasury);
  const refreshed: BargainingCampaign = {
    ...campaign,
    mandate: liveMandate,
    mandateUpdatedAtTurn: turn,
  };
  // Escalate against the shop floor as it is now, not as it was when the
  // campaign opened: a frozen mandate lets a collapsed union keep calling
  // strikes and gives no credit to one that organized during the dispute.
  const next = escalateBargainingCampaign(refreshed, turn);
  if ("ok" in next) throw new Error(next.error);

  const plan = buildBargainingEscalationPlan(
    campaign,
    scoped.map((asset) => ({
      id: asset.id,
      unionization: asset.unionization ?? union.unionization ?? 0,
      strikeStartedAtTurn: asset.strikeStartedAtTurn,
      strikeCooldownUntilTurn: asset.strikeCooldownUntilTurn,
    })),
    turn,
    union
  );
  if (plan.blockedReason) throw new Error(plan.blockedReason);
  if (plan.cashCost > 0 && union.treasury < plan.cashCost) {
    throw new Error("The strike fund cannot finance this escalation.");
  }
  if (campaign.lastActionTurn >= turn) throw new Error(BARGAINING_STATE_CHANGED);

  const newRecords = recordEscalationExpectations(
    campaign.escalationExpectations,
    plan.newStrikeLocalIds.map((id) => ({ id, workerExpectationIndex: assets[id]?.workerExpectationIndex }))
  );
  // Snapshots for the atomic restore: single-threaded assigns cannot
  // half-fail, but the guard keeps the three-leg write honest.
  const treasuryBefore = union.treasury;
  const lastCalledBefore = union.lastCalledStrikeTurn;
  const sectorBefore = new Map<string, { strike: number | null | undefined; expectation: number | null | undefined }>();
  for (const id of plan.newStrikeLocalIds) {
    const asset = assets[id];
    if (asset) sectorBefore.set(id, { strike: asset.strikeStartedAtTurn, expectation: asset.workerExpectationIndex });
  }
  try {
    if (plan.cashCost > 0) {
      union.treasury = treasuryBefore - plan.cashCost;
      union.lastCalledStrikeTurn = turn;
    }
    union.updatedAtTurn = turn;
    for (const id of plan.newStrikeLocalIds) {
      const asset = assets[id];
      if (!asset) throw new Error(BARGAINING_STATE_CHANGED);
      if (asset.strikeStartedAtTurn != null) throw new Error(BARGAINING_STATE_CHANGED);
      // Force the expectation above the trigger gap (COL read is absent in
      // solo, so the helper's own COL-100 default applies — the same index
      // the corporation turn recomputes next turn). Left in place, one
      // payment would buy a local that re-strikes forever; settlement,
      // withdraw, and lapse restore the recorded value.
      asset.strikeStartedAtTurn = turn;
      asset.workerExpectationIndex =
        realWageIndex(asset.wageLevel ?? 1, undefined) + STRIKE_EXPECTATION_GAP_THRESHOLD + 0.05;
    }
    const claimed: BargainingCampaign = {
      ...next,
      mandate: liveMandate,
      mandateUpdatedAtTurn: turn,
      escalationExpectations: [...(campaign.escalationExpectations ?? []), ...newRecords],
    };
    campaigns[claimed.id] = claimed;
    return { kind: "moved", campaign: claimed, sectorsStriking: plan.newStrikeLocalIds.length, cashSpent: plan.cashCost };
  } catch (error) {
    union.treasury = treasuryBefore;
    union.lastCalledStrikeTurn = lastCalledBefore;
    for (const [id, prior] of sectorBefore) {
      const asset = assets[id];
      if (asset) {
        asset.strikeStartedAtTurn = prior.strike;
        asset.workerExpectationIndex = prior.expectation;
      }
    }
    throw error;
  }
}

// ── Member ballots ───────────────────────────────────────────

export interface CastBallotArgs {
  campaignId: string;
  voterCharacterId: string;
  vote: "ratify" | "reject";
  turn: number;
}

export type CastBallotResult = {
  outcome: "ratified" | "rejected" | null;
  campaign: BargainingCampaign;
  agreement?: CollectiveAgreement;
};

/**
 * Cast or change one organizer's ballot (newest write per organizer per
 * offer wins), then close the vote when the result can no longer change.
 * Weight comes from the snapshot on the campaign, never a live read.
 * A ratified vote settles the campaign and writes the agreement; a
 * rejected vote closes the ballot and leaves the offer on the table with
 * the clocks still running.
 */
export function castRatificationBallot(world: WorldState, args: CastBallotArgs): CastBallotResult {
  checkTurn(args.turn);
  const campaign = requireOpenCampaign(world, args.campaignId);
  if (!isRatificationOpen(campaign, args.turn)) {
    throw new Error("There is no open ratification vote to answer.");
  }
  const ratification = campaign.ratification!;
  if (ratificationWeightFor(ratification, args.voterCharacterId) <= 0) {
    throw new Error("This organizer holds no ballot in this vote.");
  }
  if (args.vote !== "ratify" && args.vote !== "reject") throw new Error("Vote must be ratify or reject.");
  const campaigns = bargainingCampaigns(world);

  const ballots = (campaign.ballots ?? []).filter(
    (ballot) => !(ballot.voterCharacterId === args.voterCharacterId && ballot.offerRevision === ratification.offerRevision)
  );
  ballots.push({ voterCharacterId: args.voterCharacterId, vote: args.vote, offerRevision: ratification.offerRevision });
  const tally = tallyRatificationBallots(ratification, ballots);
  const outcome = resolveRatification(ratification, tally, args.turn);
  if (!outcome) {
    const next: BargainingCampaign = { ...campaign, ballots, updatedAtTurn: args.turn };
    campaigns[next.id] = next;
    return { outcome: null, campaign: next };
  }
  if (outcome === "rejected") {
    const next: BargainingCampaign = {
      ...campaign,
      ballots,
      ratification: { ...ratification, status: "rejected", closedAtTurn: args.turn },
      lastActionTurn: args.turn,
      updatedAtTurn: args.turn,
    };
    campaigns[next.id] = next;
    return { outcome, campaign: next };
  }
  const settled = settleBargainingCampaign({ campaign: { ...campaign, ballots }, acceptedBy: "union", currentTurn: args.turn });
  if (!settled.ok) throw new Error(settled.error);
  const closed: BargainingCampaign = {
    ...settled.campaign,
    ratification: { ...ratification, status: "ratified", closedAtTurn: args.turn },
    ballots,
  };
  return {
    outcome,
    campaign: persistSettlement(world, campaign, { campaign: closed, agreement: settled.agreement }, args.turn),
    agreement: settled.agreement,
  };
}

// ── Turn-seam helpers (used by the labour-relations pass) ─────

export { disputeLapseTurn };
export { BARGAINING_REOPEN_COOLDOWN_TURNS };

/** Validate raw terms without opening anything (public quote path). */
export function quoteBargainingTerms(terms: BargainingTerms): void {
  const validation = validateBargainingTerms(terms);
  if (!validation.ok) throw new Error(validation.error);
}
