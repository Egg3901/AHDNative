/**
 * Bargaining campaign lifecycle rules — #322.
 *
 * Ports AHDGame's src/lib/unions/bargaining.ts, src/lib/labour/strikes.ts
 * (strike state machine + constants), src/lib/unions/unionEconomy.ts
 * (strike-call costs/cooldowns), src/lib/labour/unionization.ts
 * (realWageIndex), src/lib/labour/laborCost.ts (wage bounds), and
 * src/lib/unions/ratification.ts (member ballot rules) at pinned
 * e364c04954ed628beef73a993a8e9e156650a31e.
 *
 * Native adaptations (cited, not invented):
 * - ObjectId/Date become deterministic string ids and turn numbers; the
 *   pure constructors take already-resolved values (no DB reads).
 * - Native has no per-state cost-of-living metric and no union-law bias
 *   axis, so grievance reads realWageIndex(wage, undefined) (COL defaults
 *   to 100 in the reference helper itself) and lawSupport defaults to 50
 *   (the reference's own absent/non-finite rule). Unemployment arrives as
 *   a 0-1 fraction on the Native economy and is scaled to the percent the
 *   reference tightness helper takes.
 * - Government mediation intervention (#127 crisis path) is NOT ported:
 *   documented residual, no silent coverage. Member ratification ballots
 *   live on the campaign record (no separate ballot collection).
 * - Strike softening comes from the union's active services via services.ts
 *   (verbatim MAX_STRIKE_SOFTENING 0.6 cap), matching the reference's
 *   unionServices input to stepStrike.
 *
 * Determinism: sorted iteration, no RNG, no timestamps anywhere in this
 * module. The same campaign snapshot decides the same way every replay.
 *
 * Source: <mainline-checkout>/src/lib/unions/bargaining.ts
 *         <mainline-checkout>/src/lib/labour/strikes.ts
 *         <mainline-checkout>/src/lib/unions/unionEconomy.ts
 *         <mainline-checkout>/src/lib/unions/ratification.ts
 */

import type {
  BargainingCampaign,
  BargainingEscalationLevel,
  BargainingMandate,
  BargainingOffer,
  BargainingParty,
  CollectiveAgreement,
  EscalationExpectationRecord,
  RatificationBallot,
  BargainingRatification,
} from "./campaigns.js";
import { collectiveAgreementIdFor } from "./campaigns.js";

// ── Campaign clocks ──────────────────────────────────────────────

/** Turns a negotiating campaign has before it becomes a dispute. Source: bargaining.ts BARGAINING_DEADLINE_TURNS. */
export const BARGAINING_DEADLINE_TURNS = 8;
/** Agreement duration bounds (turns). Source: AGREEMENT_DURATION_MIN/MAX_TURNS. */
export const AGREEMENT_DURATION_MIN_TURNS = 24;
export const AGREEMENT_DURATION_MAX_TURNS = 192;
/** Offer revisions before a campaign cannot move the package further. Source: BARGAINING_MAX_OFFERS. */
export const BARGAINING_MAX_OFFERS = 12;
/** Mandate floors to open a campaign. Source: BARGAINING_MIN_COVERAGE / BARGAINING_MIN_SUPPORT. */
export const BARGAINING_MIN_COVERAGE = 20;
export const BARGAINING_MIN_SUPPORT = 25;
/** Strike-fund runway cap in the mandate score. Source: BARGAINING_STRIKE_RUNWAY_SCORE_CAP. */
export const BARGAINING_STRIKE_RUNWAY_SCORE_CAP = 6;
/** Member support each rung demands. Source: BARGAINING_ESCALATION_SUPPORT. */
export const BARGAINING_ESCALATION_SUPPORT = {
  overtime_ban: 35,
  selective_strike: 50,
  industry_strike: 65,
} as const;
/** Output factor while an overtime ban holds a sector. Source: OVERTIME_BAN_OUTPUT_FACTOR. */
export const OVERTIME_BAN_OUTPUT_FACTOR = 0.96;
/** Treasury per covered local per turn an overtime ban is held. Source: OVERTIME_BAN_UPKEEP_PER_LOCAL. */
export const OVERTIME_BAN_UPKEEP_PER_LOCAL = 40;
/** Turns a dispute can run before it lapses. Source: BARGAINING_DISPUTE_MAX_TURNS. */
export const BARGAINING_DISPUTE_MAX_TURNS = 16;
/** Cooling-off before the same pair can reopen. Source: BARGAINING_REOPEN_COOLDOWN_TURNS. */
export const BARGAINING_REOPEN_COOLDOWN_TURNS = 8;

// ── Strike fund ──────────────────────────────────────────────────

/** Density floor below which a strike cannot be manufactured. Source: unionEconomy.ts STRIKE_CALL_MIN_UNIONIZATION. */
export const STRIKE_CALL_MIN_UNIONIZATION = 30;
/** Treasury per newly struck local, paid once when called. Source: unionEconomy.ts STRIKE_CALL_COST_PER_SECTOR. */
export const STRIKE_CALL_COST_PER_SECTOR = 400;
/** Union-level cooldown between force-called strikes. Source: unionEconomy.ts UNION_STRIKE_CALL_COOLDOWN_TURNS. */
export const UNION_STRIKE_CALL_COOLDOWN_TURNS = 8;

// ── Strike state machine ─────────────────────────────────────────

/** Density above which a strike can trigger organically. Source: strikes.ts STRIKE_UNIONIZATION_THRESHOLD. */
export const STRIKE_UNIONIZATION_THRESHOLD = 55;
/** Expectation gap that triggers a strike. Source: strikes.ts STRIKE_EXPECTATION_GAP_THRESHOLD. */
export const STRIKE_EXPECTATION_GAP_THRESHOLD = 0.12;
/** Gap an active strike must close to for concession (strictly below trigger: hysteresis). Source: STRIKE_CONCESSION_GAP_THRESHOLD. */
export const STRIKE_CONCESSION_GAP_THRESHOLD = 0.04;
/** Per-turn step limit on the expectation drift. Source: strikes.ts WORKER_EXPECTATION_TREND_STEP. */
export const WORKER_EXPECTATION_TREND_STEP = 0.02;
/** Turns an active strike runs before wait-it-out resolution. Source: strikes.ts STRIKE_DURATION_TURNS. */
export const STRIKE_DURATION_TURNS = 4;
/** Cooldown after ANY resolution path. Source: strikes.ts STRIKE_COOLDOWN_TURNS. */
export const STRIKE_COOLDOWN_TURNS = 12;
/** Fraction of revenue cut while a strike is active (throttled, not zeroed). Source: strikes.ts STRIKE_REVENUE_THROTTLE. */
export const STRIKE_REVENUE_THROTTLE = 0.25;
/** Margin penalty (pp) while a strike is active. Source: strikes.ts STRIKE_MARGIN_PENALTY_PP. */
export const STRIKE_MARGIN_PENALTY_PP = -8;
/** Density bump on wait-it-out resolution only. Source: strikes.ts STRIKE_WAITOUT_UNIONIZATION_BUMP. */
export const STRIKE_WAITOUT_UNIONIZATION_BUMP = 10;

// ── Wage ─────────────────────────────────────────────────────────

/** Offer wage bounds. Source: laborCost.ts WAGE_LEVEL_MIN/MAX. */
export const WAGE_LEVEL_MIN = 0.8;
export const WAGE_LEVEL_MAX = 1.5;

// ── Ratification ─────────────────────────────────────────────────

/** Turns a member ballot stays open. Source: ratification.ts RATIFICATION_VOTE_TURNS. */
export const RATIFICATION_VOTE_TURNS = 3;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function roundScore(value: number): number {
  return Math.round(clampScore(value) * 10) / 10;
}

/** Clamp a wage into [WAGE_LEVEL_MIN, WAGE_LEVEL_MAX]. Source: laborCost.ts clampWageLevel. */
export function clampWageLevel(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(WAGE_LEVEL_MAX, Math.max(WAGE_LEVEL_MIN, value));
}

/** Real-wage index: wage deflated by cost of living (absent COL reads as 100). Source: unionization.ts realWageIndex. */
export function realWageIndex(wageLevel: number, costOfLivingIndex: number | undefined): number {
  const raw = typeof costOfLivingIndex === "number" && Number.isFinite(costOfLivingIndex) ? costOfLivingIndex : 100;
  const safe = raw > 0 ? raw : 100;
  return wageLevel / (safe / 100);
}

/**
 * Step the persisted expectation toward the real wage by at most
 * WORKER_EXPECTATION_TREND_STEP, never overshooting. Absent initializes AT
 * the real wage: no spurious first-turn gap. Source: strikes.ts
 * trendWorkerExpectation.
 */
export function trendWorkerExpectation(current: number | undefined | null, realWage: number): number {
  if (current === undefined || current === null || !Number.isFinite(current)) return realWage;
  if (current === realWage) return current;
  const diff = realWage - current;
  const step = Math.sign(diff) * Math.min(WORKER_EXPECTATION_TREND_STEP, Math.abs(diff));
  const next = current + step;
  return Math.max(0.3, Math.min(2.0, next));
}

/** Normalize unemployment percent into labor scarcity: 2% = 100, 15% = 0. Source: bargaining.ts laborTightnessFromUnemployment. */
export function laborTightnessFromUnemployment(unemploymentRatePercent: number): number {
  if (!Number.isFinite(unemploymentRatePercent)) return 50;
  return roundScore(((15 - unemploymentRatePercent) / 13) * 100);
}

/** Normalize the collective-bargaining law axis from -50..50 to 0..100 (absent reads as neutral 50). Source: bargaining.ts lawSupportFromBias. */
export function lawSupportFromBias(unionLawBias: number | undefined): number {
  if (typeof unionLawBias !== "number" || !Number.isFinite(unionLawBias)) return 50;
  return roundScore(unionLawBias + 50);
}

/** Total treasury cost to force-call a strike across `sectorCount` new locals. Source: unionEconomy.ts strikeCallCost. */
export function strikeCallCost(sectorCount: number): number {
  return Math.max(0, Math.round(sectorCount)) * STRIKE_CALL_COST_PER_SECTOR;
}

/** Treasury per turn of holding `level` over `localCount` locals (overtime ban only). Source: bargaining.ts escalationUpkeepPerTurn. */
export function escalationUpkeepPerTurn(level: BargainingEscalationLevel, localCount: number): number {
  if (level !== "overtime_ban") return 0;
  return Math.max(0, Math.floor(localCount)) * OVERTIME_BAN_UPKEEP_PER_LOCAL;
}

// ── Mandate ──────────────────────────────────────────────────────

export interface BargainingLocalSnapshot {
  workers: number;
  unionization: number;
  wageLevel: number;
  workerExpectationIndex?: number | null;
  costOfLivingIndex?: number;
}

/**
 * Derive the campaign mandate from shop-floor conditions and normalized
 * macro inputs. A snapshot, not a live meter, so both parties know what
 * power the campaign opened with and replays stay deterministic.
 * Source: bargaining.ts buildBargainingMandate (verbatim math).
 */
export function buildBargainingMandate(args: {
  locals: readonly BargainingLocalSnapshot[];
  laborTightness: number;
  lawSupport: number;
  treasury: number;
  strikeCost: number;
}): BargainingMandate {
  const totalWorkers = args.locals.reduce((sum, local) => sum + Math.max(0, local.workers), 0);
  const denominator = totalWorkers > 0 ? totalWorkers : Math.max(1, args.locals.length);
  const weight = (local: BargainingLocalSnapshot) =>
    totalWorkers > 0 ? Math.max(0, local.workers) : 1;

  const coverage =
    args.locals.reduce((sum, local) => sum + clampScore(local.unionization) * weight(local), 0) /
    denominator;
  const grievance =
    args.locals.reduce((sum, local) => {
      const realWage = realWageIndex(
        Math.max(WAGE_LEVEL_MIN, local.wageLevel),
        local.costOfLivingIndex
      );
      const expectation = local.workerExpectationIndex ?? realWage;
      const relativeGap = Math.max(0, expectation - realWage) / Math.max(WAGE_LEVEL_MIN, realWage);
      return sum + clampScore(relativeGap * 400) * weight(local);
    }, 0) / denominator;
  const laborTightness = clampScore(args.laborTightness);
  const lawSupport = clampScore(args.lawSupport);
  const strikeFundRunway =
    args.strikeCost > 0
      ? Math.min(BARGAINING_STRIKE_RUNWAY_SCORE_CAP, Math.max(0, args.treasury) / args.strikeCost)
      : 0;
  const fundScore = (strikeFundRunway / BARGAINING_STRIKE_RUNWAY_SCORE_CAP) * 100;

  return {
    coverage: roundScore(coverage),
    grievance: roundScore(grievance),
    laborTightness: roundScore(laborTightness),
    lawSupport: roundScore(lawSupport),
    strikeFundRunway: Math.round(strikeFundRunway * 10) / 10,
    support: roundScore(coverage * 0.6 + grievance * 0.3 + lawSupport * 0.1),
    leverage: roundScore(
      coverage * 0.35 +
        grievance * 0.25 +
        laborTightness * 0.15 +
        fundScore * 0.15 +
        lawSupport * 0.1
    ),
    organizedLocalCount: args.locals.filter(
      (local) => local.unionization >= STRIKE_CALL_MIN_UNIONIZATION
    ).length,
    totalLocalCount: args.locals.length,
  };
}

export type BargainingRefusal = { ok: false; error: string };

/** Gate to open: the employer must have locals, and the mandate must clear both floors. Source: bargaining.ts validateBargainingMandate. */
export function validateBargainingMandate(mandate: BargainingMandate): { ok: true } | BargainingRefusal {
  if (mandate.totalLocalCount === 0) {
    return { ok: false, error: "This employer has no locals in the union's industry." };
  }
  if (mandate.organizedLocalCount === 0 || mandate.coverage < BARGAINING_MIN_COVERAGE) {
    return { ok: false, error: "The union needs more organized workers at this employer." };
  }
  if (mandate.support < BARGAINING_MIN_SUPPORT) {
    return { ok: false, error: "The proposed claim does not have a strong enough member mandate." };
  }
  return { ok: true };
}

export interface BargainingTerms {
  wageLevel: number;
  agreementDurationTurns: number;
  noStrikeTurns: number;
}

/** Validate an offer without silently changing submitted terms. Source: bargaining.ts validateBargainingTerms (pension term omitted: no Native pension bargain exists). */
export function validateBargainingTerms(terms: BargainingTerms): { ok: true } | BargainingRefusal {
  if (
    !Number.isFinite(terms.wageLevel) ||
    terms.wageLevel < WAGE_LEVEL_MIN ||
    terms.wageLevel > WAGE_LEVEL_MAX
  ) {
    return {
      ok: false,
      error: `Wage level must be between ${WAGE_LEVEL_MIN} and ${WAGE_LEVEL_MAX}.`,
    };
  }
  if (
    !Number.isInteger(terms.agreementDurationTurns) ||
    terms.agreementDurationTurns < AGREEMENT_DURATION_MIN_TURNS ||
    terms.agreementDurationTurns > AGREEMENT_DURATION_MAX_TURNS
  ) {
    return {
      ok: false,
      error: `Agreement duration must be ${AGREEMENT_DURATION_MIN_TURNS}-${AGREEMENT_DURATION_MAX_TURNS} turns.`,
    };
  }
  if (
    !Number.isInteger(terms.noStrikeTurns) ||
    terms.noStrikeTurns < 0 ||
    terms.noStrikeTurns > terms.agreementDurationTurns
  ) {
    return {
      ok: false,
      error: "No-strike term must be a whole number of turns within the agreement duration.",
    };
  }
  return { ok: true };
}

function makeOffer(
  revision: number,
  proposedBy: BargainingParty,
  terms: BargainingTerms,
  currentTurn: number
): BargainingOffer {
  return { revision, proposedBy, ...terms, proposedAtTurn: currentTurn };
}

/** Pure campaign constructor. Source: bargaining.ts openBargainingCampaign. */
export function openBargainingCampaign(args: {
  id: string;
  unionId: string;
  countryId: string;
  employerCorporationId: string;
  sectorIds: string[];
  mandate: BargainingMandate;
  terms: BargainingTerms;
  currentTurn: number;
}): BargainingCampaign | BargainingRefusal {
  const termsValidation = validateBargainingTerms(args.terms);
  if (!termsValidation.ok) return termsValidation;
  const mandateValidation = validateBargainingMandate(args.mandate);
  if (!mandateValidation.ok) return mandateValidation;

  const firstOffer = makeOffer(1, "union", args.terms, args.currentTurn);
  return {
    id: args.id,
    unionId: args.unionId,
    countryId: args.countryId,
    employerCorporationId: args.employerCorporationId,
    sectorIds: [...args.sectorIds],
    status: "negotiating",
    escalationLevel: "none",
    mandate: args.mandate,
    mandateUpdatedAtTurn: args.currentTurn,
    currentOffer: firstOffer,
    offers: [firstOffer],
    startedAtTurn: args.currentTurn,
    deadlineTurn: args.currentTurn + BARGAINING_DEADLINE_TURNS,
    disputeStartedAtTurn: null,
    escalationStartedAtTurn: null,
    escalationExpectations: [],
    ratification: null,
    ballots: [],
    settledAgreementId: null,
    endedAtTurn: null,
    lastActionTurn: args.currentTurn,
    updatedAtTurn: args.currentTurn,
  };
}

/** Table a counteroffer. Source: bargaining.ts counterBargainingOffer. */
export function counterBargainingOffer(args: {
  campaign: BargainingCampaign;
  proposedBy: BargainingParty;
  terms: BargainingTerms;
  currentTurn: number;
}): BargainingCampaign | BargainingRefusal {
  if (args.campaign.status !== "negotiating" && args.campaign.status !== "dispute") {
    return { ok: false, error: "Only an open campaign can receive an offer." };
  }
  if (args.campaign.currentOffer.proposedBy === args.proposedBy) {
    return { ok: false, error: "The other party must answer the current offer." };
  }
  if (args.campaign.offers.length >= BARGAINING_MAX_OFFERS) {
    return { ok: false, error: "This campaign has reached its bargaining-round limit." };
  }
  const validation = validateBargainingTerms(args.terms);
  if (!validation.ok) return validation;

  const offer = makeOffer(
    args.campaign.currentOffer.revision + 1,
    args.proposedBy,
    args.terms,
    args.currentTurn
  );
  return {
    ...args.campaign,
    currentOffer: offer,
    offers: [...args.campaign.offers, offer],
    // A member ballot authorizes exactly one revision: replacing the package
    // voids the open ballot in the same transition.
    ratification:
      args.campaign.ratification?.status === "open"
        ? { ...args.campaign.ratification, status: "void", closedAtTurn: args.currentTurn }
        : args.campaign.ratification,
    lastActionTurn: args.currentTurn,
    updatedAtTurn: args.currentTurn,
  };
}

/** Move a negotiating campaign into dispute. Source: bargaining.ts moveCampaignToDispute. */
export function moveCampaignToDispute(
  campaign: BargainingCampaign,
  currentTurn: number
): BargainingCampaign | BargainingRefusal {
  if (campaign.status !== "negotiating") {
    return { ok: false, error: "Only a negotiating campaign can enter dispute." };
  }
  return {
    ...campaign,
    status: "dispute",
    disputeStartedAtTurn: currentTurn,
    lastActionTurn: currentTurn,
    updatedAtTurn: currentTurn,
  };
}

export function nextBargainingEscalationLevel(
  level: BargainingEscalationLevel
): Exclude<BargainingEscalationLevel, "none"> | null {
  if (level === "none") return "overtime_ban";
  if (level === "overtime_ban") return "selective_strike";
  if (level === "selective_strike") return "industry_strike";
  return null;
}

/** Climb one rung. Source: bargaining.ts escalateBargainingCampaign. */
export function escalateBargainingCampaign(
  campaign: BargainingCampaign,
  currentTurn: number
): BargainingCampaign | BargainingRefusal {
  if (campaign.status !== "dispute") {
    return { ok: false, error: "Only a bargaining dispute can be escalated." };
  }
  if (campaign.lastActionTurn >= currentTurn) {
    return { ok: false, error: "This campaign has already acted this turn." };
  }
  const nextLevel = nextBargainingEscalationLevel(campaign.escalationLevel);
  if (!nextLevel) return { ok: false, error: "This dispute is already fully escalated." };
  if (campaign.mandate.support < BARGAINING_ESCALATION_SUPPORT[nextLevel]) {
    return {
      ok: false,
      error: `${nextLevel.replaceAll("_", " ")} requires ${BARGAINING_ESCALATION_SUPPORT[nextLevel]} member support.`,
    };
  }
  return {
    ...campaign,
    escalationLevel: nextLevel,
    escalationStartedAtTurn: currentTurn,
    lastActionTurn: currentTurn,
    updatedAtTurn: currentTurn,
  };
}

// ── Escalation plan (preview + gate, one rule) ───────────────────

export interface EscalationPlanLocal {
  id: string;
  unionization: number;
  strikeStartedAtTurn: number | null | undefined;
  strikeCooldownUntilTurn: number | null | undefined;
}

export interface BargainingEscalationPlan {
  nextLevel: Exclude<BargainingEscalationLevel, "none"> | null;
  supportRequired: number | null;
  /** Every local affected at the resulting action level. */
  affectedLocalIds: string[];
  /** Locals newly placed into strike state (determine the treasury cost). */
  newStrikeLocalIds: string[];
  cashCost: number;
  upkeepPerTurn: number;
  strikeCooldownUntilTurn: number | null;
  blockedReason: string | null;
  blockedCode: "no_target" | "strike_cooldown" | "insufficient_funds" | null;
}

/**
 * Shared authoritative preview and execution plan for one escalation step.
 * Source: bargaining.ts buildBargainingEscalationPlan (verbatim targeting
 * and refusal order).
 */
export function buildBargainingEscalationPlan(
  campaign: Pick<BargainingCampaign, "escalationLevel" | "sectorIds">,
  locals: readonly EscalationPlanLocal[],
  currentTurn: number,
  union?: { lastCalledStrikeTurn?: number | null; treasury?: number }
): BargainingEscalationPlan {
  const nextLevel = nextBargainingEscalationLevel(campaign.escalationLevel);
  if (!nextLevel) {
    return {
      nextLevel: null,
      supportRequired: null,
      affectedLocalIds: [],
      newStrikeLocalIds: [],
      cashCost: 0,
      upkeepPerTurn: 0,
      strikeCooldownUntilTurn: null,
      blockedReason: null,
      blockedCode: null,
    };
  }

  const scopedIds = new Set(campaign.sectorIds);
  const scoped = locals
    .filter((local) => scopedIds.has(local.id))
    .sort(
      (a, b) =>
        (b.unionization ?? 0) - (a.unionization ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  const alreadyStriking = scoped.filter((local) => local.strikeStartedAtTurn != null);
  const eligible = scoped.filter(
    (local) =>
      (local.unionization ?? 0) >= STRIKE_CALL_MIN_UNIONIZATION &&
      local.strikeStartedAtTurn == null &&
      (local.strikeCooldownUntilTurn == null || local.strikeCooldownUntilTurn <= currentTurn)
  );
  const newStrikeLocals =
    nextLevel === "selective_strike"
      ? eligible.slice(0, Math.max(1, Math.ceil(eligible.length / 2)))
      : nextLevel === "industry_strike"
        ? eligible
        : [];
  const affectedLocals =
    nextLevel === "overtime_ban"
      ? scoped
      : [...alreadyStriking, ...newStrikeLocals].sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        );

  const cashCost = strikeCallCost(newStrikeLocals.length);
  const strikeEscalation = nextLevel === "selective_strike" || nextLevel === "industry_strike";
  const strikeCooldownUntilTurn =
    strikeEscalation && newStrikeLocals.length > 0 && union?.lastCalledStrikeTurn != null
      ? union.lastCalledStrikeTurn + UNION_STRIKE_CALL_COOLDOWN_TURNS
      : null;
  let blockedCode: BargainingEscalationPlan["blockedCode"] = null;
  let blockedReason: string | null = null;
  if (strikeEscalation && newStrikeLocals.length === 0 && alreadyStriking.length === 0) {
    blockedCode = "no_target";
    blockedReason = "No organized local can escalate this dispute.";
  } else if (strikeCooldownUntilTurn != null && currentTurn < strikeCooldownUntilTurn) {
    blockedCode = "strike_cooldown";
    blockedReason = `This union can call another strike on turn ${strikeCooldownUntilTurn}.`;
  } else if (union?.treasury != null && union.treasury < cashCost) {
    blockedCode = "insufficient_funds";
    blockedReason = "The strike fund cannot finance this escalation.";
  }

  return {
    nextLevel,
    supportRequired: BARGAINING_ESCALATION_SUPPORT[nextLevel],
    affectedLocalIds: affectedLocals.map((local) => local.id),
    newStrikeLocalIds: newStrikeLocals.map((local) => local.id),
    cashCost,
    upkeepPerTurn: escalationUpkeepPerTurn(nextLevel, scoped.length),
    strikeCooldownUntilTurn,
    blockedReason,
    blockedCode,
  };
}

// ── Settlement ───────────────────────────────────────────────────

/**
 * Settle on the current offer. The agreement is the wage floor; it is NOT
 * written into sector wage levels (reference persistSettlementOutcome
 * comment). Source: bargaining.ts settleBargainingCampaign.
 */
export function settleBargainingCampaign(args: {
  campaign: BargainingCampaign;
  acceptedBy: BargainingParty;
  currentTurn: number;
}):
  | { ok: true; campaign: BargainingCampaign; agreement: CollectiveAgreement }
  | BargainingRefusal {
  if (args.campaign.status !== "negotiating" && args.campaign.status !== "dispute") {
    return { ok: false, error: "This campaign can no longer be settled." };
  }
  if (args.campaign.currentOffer.proposedBy === args.acceptedBy) {
    return { ok: false, error: "The party that made an offer cannot accept its own offer." };
  }
  const offer = args.campaign.currentOffer;
  const agreement: CollectiveAgreement = {
    id: collectiveAgreementIdFor(args.campaign.id),
    campaignId: args.campaign.id,
    unionId: args.campaign.unionId,
    countryId: args.campaign.countryId,
    employerCorporationId: args.campaign.employerCorporationId,
    sectorIds: [...args.campaign.sectorIds],
    wageLevel: offer.wageLevel,
    startsAtTurn: args.currentTurn,
    expiresAtTurn: args.currentTurn + offer.agreementDurationTurns,
    noStrikeUntilTurn: args.currentTurn + offer.noStrikeTurns,
    status: "active",
    updatedAtTurn: args.currentTurn,
  };
  return {
    ok: true,
    agreement,
    campaign: {
      ...args.campaign,
      status: "settled",
      settledAgreementId: agreement.id,
      endedAtTurn: args.currentTurn,
      lastActionTurn: args.currentTurn,
      updatedAtTurn: args.currentTurn,
    },
  };
}

/** Turn an unresolved dispute lapses on. Source: bargaining.ts disputeLapseTurn. */
export function disputeLapseTurn(
  campaign: Pick<BargainingCampaign, "disputeStartedAtTurn" | "deadlineTurn">
): number {
  return (campaign.disputeStartedAtTurn ?? campaign.deadlineTurn) + BARGAINING_DISPUTE_MAX_TURNS;
}

/**
 * The one definition of "this agreement is in force right now". Start is
 * INCLUSIVE, expiry is EXCLUSIVE: an agreement running to turn 100 is not in
 * force on turn 100. Source: bargaining.ts isCollectiveAgreementActive.
 */
export function isCollectiveAgreementActive(
  agreement: Pick<CollectiveAgreement, "status" | "startsAtTurn" | "expiresAtTurn">,
  currentTurn: number
): boolean {
  return (
    agreement.status === "active" &&
    agreement.startsAtTurn <= currentTurn &&
    currentTurn < agreement.expiresAtTurn
  );
}

/** Turn the same pair may bargain again after a withdraw/lapse. Source: openBargainingCampaignFromLiveConditions reopen gate. */
export function bargainingReopenTurn(endedAtTurn: number): number {
  return endedAtTurn + BARGAINING_REOPEN_COOLDOWN_TURNS;
}

// ── Member ratification ──────────────────────────────────────────

export interface RatificationTally {
  ratifyStrength: number;
  rejectStrength: number;
  castStrength: number;
  outstandingStrength: number;
  ratifyCount: number;
  rejectCount: number;
}

/** Strength a character may cast, from the snapshot taken at open. Source: ratification.ts ratificationWeightFor. */
export function ratificationWeightFor(
  ratification: Pick<BargainingRatification, "weights">,
  characterId: string
): number {
  const entry = ratification.weights.find((weight) => weight.characterId === characterId);
  return entry?.strength ?? 0;
}

/**
 * Freeze organizing strengths into a ballot. Null when no organizer holds
 * strength: with an empty electorate there is nobody to ask, and the caller
 * settles directly. Source: ratification.ts openRatificationVote.
 */
export function openRatificationVote(args: {
  campaign: Pick<BargainingCampaign, "currentOffer">;
  weights: ReadonlyMap<string, number> | Array<{ characterId: string; strength: number }>;
  currentTurn: number;
}): BargainingRatification | null {
  const entries = Array.isArray(args.weights) ? args.weights : [...args.weights.entries()].map(([characterId, strength]) => ({ characterId, strength }));
  const weights = entries.filter((entry) => Number.isFinite(entry.strength) && entry.strength > 0);
  if (weights.length === 0) return null;
  const totalStrength = weights.reduce((sum, weight) => sum + weight.strength, 0);
  return {
    offerRevision: args.campaign.currentOffer.revision,
    status: "open",
    openedAtTurn: args.currentTurn,
    closesAtTurn: args.currentTurn + RATIFICATION_VOTE_TURNS,
    weights: weights.map((weight) => ({ characterId: weight.characterId, strength: weight.strength })),
    totalStrength,
    closedAtTurn: null,
  };
}

/** Weighted yes/no totals, counting only ballots that carry snapshot strength. Source: ratification.ts tallyRatificationBallots. */
export function tallyRatificationBallots(
  ratification: Pick<BargainingRatification, "weights" | "totalStrength" | "offerRevision">,
  ballots: readonly Pick<RatificationBallot, "voterCharacterId" | "vote" | "offerRevision">[]
): RatificationTally {
  let ratifyStrength = 0;
  let rejectStrength = 0;
  let ratifyCount = 0;
  let rejectCount = 0;
  const counted = new Set<string>();
  for (const ballot of ballots) {
    if (ballot.offerRevision !== ratification.offerRevision) continue;
    const key = ballot.voterCharacterId;
    if (counted.has(key)) continue;
    const weight = ratificationWeightFor(ratification, key);
    if (!(weight > 0)) continue;
    counted.add(key);
    if (ballot.vote === "ratify") {
      ratifyStrength += weight;
      ratifyCount++;
    } else {
      rejectStrength += weight;
      rejectCount++;
    }
  }
  const castStrength = ratifyStrength + rejectStrength;
  return {
    ratifyStrength,
    rejectStrength,
    castStrength,
    outstandingStrength: Math.max(0, ratification.totalStrength - castStrength),
    ratifyCount,
    rejectCount,
  };
}

/**
 * The one close rule: a majority of ALL outstanding strength one way closes
 * early; at the deadline a tie ratifies, and so does silence (an unanswered
 * ballot leaves the president's acceptance standing). Source: ratification.ts
 * resolveRatification.
 */
export function resolveRatification(
  ratification: Pick<BargainingRatification, "totalStrength" | "closesAtTurn" | "status">,
  tally: RatificationTally,
  currentTurn: number
): "ratified" | "rejected" | null {
  if (ratification.status !== "open") return null;
  if (tally.ratifyStrength * 2 > ratification.totalStrength) return "ratified";
  if (tally.rejectStrength * 2 > ratification.totalStrength) return "rejected";
  if (currentTurn >= ratification.closesAtTurn) {
    return tally.ratifyStrength >= tally.rejectStrength ? "ratified" : "rejected";
  }
  return null;
}

/** True while members can still cast a ballot. Source: ratification.ts isRatificationOpen. */
export function isRatificationOpen(
  campaign: Pick<BargainingCampaign, "status" | "ratification">,
  currentTurn: number
): boolean {
  const ratification = campaign.ratification;
  if (!ratification || ratification.status !== "open") return false;
  if (campaign.status !== "negotiating" && campaign.status !== "dispute") return false;
  return currentTurn < ratification.closesAtTurn;
}

/**
 * Whether the president may put the current offer to the members: a rejected
 * offer cannot be re-tabled to the same electorate without moving the
 * package. Source: ratification.ts ratificationBlockReason.
 */
export function ratificationBlockReason(
  campaign: Pick<BargainingCampaign, "status" | "ratification" | "currentOffer">,
  currentTurn: number
): string | null {
  const ratification = campaign.ratification;
  if (!ratification) return null;
  if (ratification.offerRevision !== campaign.currentOffer.revision) return null;
  if (ratification.status === "open") {
    return currentTurn < ratification.closesAtTurn
      ? `Members are already voting on this offer through turn ${ratification.closesAtTurn}.`
      : null;
  }
  if (ratification.status === "rejected") {
    return "Members rejected this offer. Table a counteroffer before asking them again.";
  }
  return null;
}

// ── Sector strike state machine ──────────────────────────────────

export interface SectorStrikeState {
  strikeStartedAtTurn: number | null | undefined;
  strikeCooldownUntilTurn: number | null | undefined;
}

export interface StrikeStepInputs {
  unionization: number;
  realWage: number;
  workerExpectation: number;
  turn: number;
  prior: SectorStrikeState;
  unionizationThreshold?: number;
  expectationGapThreshold?: number;
  unionsBanned?: boolean;
  noStrikeProtected?: boolean;
  strikeSoftening?: number;
}

export interface StrikeStepResult {
  next: { strikeStartedAtTurn: number | null; strikeCooldownUntilTurn: number | null };
  event:
    | "started"
    | "resolved_concession"
    | "resolved_waitout"
    | "resolved_banned"
    | "resolved_agreement"
    | null;
  unionizationBump: number;
}

/**
 * Pure strike state machine. Hysteresis (trigger gap strictly above
 * concession gap), slow expectation index, cooldown on every resolution
 * path. Source: labour/strikes.ts stepStrike (verbatim logic).
 */
export function stepSectorStrike(inputs: StrikeStepInputs): StrikeStepResult {
  const { unionization, realWage, workerExpectation, turn, prior } = inputs;
  const unionizationThreshold = inputs.unionizationThreshold ?? STRIKE_UNIONIZATION_THRESHOLD;
  const expectationGapThreshold =
    inputs.expectationGapThreshold ?? STRIKE_EXPECTATION_GAP_THRESHOLD;
  const softening = Math.max(
    0,
    Math.min(1, Number.isFinite(inputs.strikeSoftening) ? (inputs.strikeSoftening as number) : 0)
  );
  const gap = (workerExpectation - realWage) * (1 - softening);

  if (inputs.unionsBanned) {
    if (prior.strikeStartedAtTurn != null) {
      return {
        next: { strikeStartedAtTurn: null, strikeCooldownUntilTurn: turn + STRIKE_COOLDOWN_TURNS },
        event: "resolved_banned",
        unionizationBump: 0,
      };
    }
    return {
      next: {
        strikeStartedAtTurn: prior.strikeStartedAtTurn ?? null,
        strikeCooldownUntilTurn: prior.strikeCooldownUntilTurn ?? null,
      },
      event: null,
      unionizationBump: 0,
    };
  }

  if (inputs.noStrikeProtected) {
    if (prior.strikeStartedAtTurn != null) {
      return {
        next: { strikeStartedAtTurn: null, strikeCooldownUntilTurn: turn + STRIKE_COOLDOWN_TURNS },
        event: "resolved_agreement",
        unionizationBump: 0,
      };
    }
    return {
      next: {
        strikeStartedAtTurn: prior.strikeStartedAtTurn ?? null,
        strikeCooldownUntilTurn: prior.strikeCooldownUntilTurn ?? null,
      },
      event: null,
      unionizationBump: 0,
    };
  }

  if (prior.strikeStartedAtTurn != null) {
    if (gap <= STRIKE_CONCESSION_GAP_THRESHOLD) {
      return {
        next: { strikeStartedAtTurn: null, strikeCooldownUntilTurn: turn + STRIKE_COOLDOWN_TURNS },
        event: "resolved_concession",
        unionizationBump: 0,
      };
    }
    const elapsed = turn - prior.strikeStartedAtTurn;
    if (elapsed >= STRIKE_DURATION_TURNS) {
      return {
        next: { strikeStartedAtTurn: null, strikeCooldownUntilTurn: turn + STRIKE_COOLDOWN_TURNS },
        event: "resolved_waitout",
        unionizationBump: STRIKE_WAITOUT_UNIONIZATION_BUMP,
      };
    }
    return {
      next: {
        strikeStartedAtTurn: prior.strikeStartedAtTurn,
        strikeCooldownUntilTurn: prior.strikeCooldownUntilTurn ?? null,
      },
      event: null,
      unionizationBump: 0,
    };
  }

  const inCooldown = prior.strikeCooldownUntilTurn != null && turn < prior.strikeCooldownUntilTurn;
  if (!inCooldown && unionization > unionizationThreshold && gap > expectationGapThreshold) {
    return {
      next: { strikeStartedAtTurn: turn, strikeCooldownUntilTurn: null },
      event: "started",
      unionizationBump: 0,
    };
  }
  return {
    next: {
      strikeStartedAtTurn: prior.strikeStartedAtTurn ?? null,
      strikeCooldownUntilTurn: prior.strikeCooldownUntilTurn ?? null,
    },
    event: null,
    unionizationBump: 0,
  };
}

/** Pre-strike expectation records for newly struck locals (locals already recorded keep their original value). */
export function recordEscalationExpectations(
  existing: readonly EscalationExpectationRecord[] | undefined,
  targets: ReadonlyArray<{ id: string; workerExpectationIndex: number | null | undefined }>
): EscalationExpectationRecord[] {
  const recorded = new Set((existing ?? []).map((entry) => entry.sectorId));
  return targets
    .filter((target) => !recorded.has(target.id))
    .map((target) => ({ sectorId: target.id, previousExpectationIndex: target.workerExpectationIndex ?? null }));
}
