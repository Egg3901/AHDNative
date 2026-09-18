/**
 * Labour-relations turn pass — #322.
 *
 * Advances every open bargaining campaign one turn: negotiating campaigns
 * past their deadline enter dispute, expired agreements close, due member
 * ballots settle or reject, stale disputes lapse, live mandates refresh,
 * overtime-ban upkeep is charged (a defunded ban ends), and NPP-led unions
 * plus NPC employers answer through the deterministic policy.
 *
 * Runs inside unionsTurn AFTER the dues/services/approval loop (same
 * turn position as the reference's labour-relations leg; #323 owns any
 * broader phase reordering and is explicitly out of scope). RNG-free:
 * deterministic iteration order, no draws, so the pass neither consumes
 * nor shifts the shared RNG stream.
 *
 * Economic enforcement reads turn bounds directly and applies EXACTLY once
 * in corporationTurn (which runs earlier in the registry): this pass never
 * touches revenue, margin, or output. Strike state written here
 * (strikeStartedAtTurn) is what the corporation turn throttles; strike
 * resolution (concession / waitout / ban / agreement) runs there through
 * stepSectorStrike.
 *
 * Source: <mainline-checkout>/src/lib/turn/unions/labourRelationsTurn.ts
 *         processLabourRelationsTurn and
 *         src/lib/turn/unions/nppUnionBehavior.ts (autonomous open /
 *         respond / escalate) at pinned e364c04954ed628beef73a993a8e9e156650a31e.
 *
 * Native adaptations: string ids + turn numbers; ballots live on the
 * campaign; mediation request/response is NOT auto-played (government
 * mediation intervention is a documented residual); employerIsNpp is always
 * true (no player-run corporations exist); COL reads absent (helper
 * default); law support neutral (no bias axis).
 */

import type { WorldState } from "../types.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import type { CorporateSectorAsset } from "../corporation/corporateSectorAssets.js";
import type { Union } from "./types.js";
import {
  bargainingCampaigns,
  collectiveAgreements,
  type BargainingCampaign,
} from "./campaigns.js";
import {
  disputeLapseTurn,
  escalationUpkeepPerTurn,
  isCollectiveAgreementActive,
  resolveRatification,
  settleBargainingCampaign,
  tallyRatificationBallots,
  STRIKE_CALL_MIN_UNIONIZATION,
} from "./bargaining.js";
import {
  answerBargainingCampaignAsEmployer,
  mandateFromLocals,
  moveBargainingCampaignAsUnion,
  openBargainingCampaignAction,
  restoreEscalationExpectations,
  settleBargainingCampaignDirect,
} from "./actions.js";
import { buildLabourRelationsPoliticalNudges } from "./political.js";
import {
  calculateNppSettlementWage,
  decideNppBargainingAction,
  industrialActionPressure,
} from "./employerPolicy.js";
import {
  NPP_CAMPAIGN_OPEN_LIMIT_PER_TURN,
  NPP_DEMAND_CEILING,
  NPP_DEMAND_MIN_UNIONIZATION,
  NPP_DEMAND_PREMIUM,
} from "./nppBehavior.js";

export interface LabourRelationsTurnResult {
  campaignsMovedToDispute: number;
  agreementsExpired: number;
  disputesLapsed: number;
  mandatesRefreshed: number;
  overtimeBansFunded: number;
  overtimeBansEnded: number;
  settlementsRatified: number;
  settlementsRejected: number;
  ratificationsVoided: number;
  campaignsOpened: number;
  counteroffersMade: number;
  agreementsSettled: number;
  disputesEscalated: number;
}

function militancy(p: { personality?: { ambition?: number; stubbornness?: number } }): number {
  const ambition = p.personality?.ambition ?? 50;
  const stubbornness = p.personality?.stubbornness ?? 50;
  return Math.max(0, Math.min(1, (ambition * 0.6 + stubbornness * 0.4) / 100));
}

function workerWeightedAverage(
  locals: readonly CorporateSectorAsset[],
  read: (local: CorporateSectorAsset) => number
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const local of locals) {
    const weight = Math.max(1, local.workers ?? 0);
    weighted += read(local) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

function scopedExistingAssets(world: WorldState, campaign: BargainingCampaign): CorporateSectorAsset[] {
  const assets = corporateSectorAssets(world);
  return campaign.sectorIds
    .map((id) => assets[id])
    .filter((asset): asset is CorporateSectorAsset => asset != null);
}

/**
 * Advance deadline, expiry, ballot, and lapse clocks; refresh mandates and
 * charge held industrial action; then let autonomous parties answer.
 */
export function processLabourRelationsTurn(world: WorldState, turn: number): LabourRelationsTurnResult {
  const result: LabourRelationsTurnResult = {
    campaignsMovedToDispute: 0,
    agreementsExpired: 0,
    disputesLapsed: 0,
    mandatesRefreshed: 0,
    overtimeBansFunded: 0,
    overtimeBansEnded: 0,
    settlementsRatified: 0,
    settlementsRejected: 0,
    ratificationsVoided: 0,
    campaignsOpened: 0,
    counteroffersMade: 0,
    agreementsSettled: 0,
    disputesEscalated: 0,
  };
  // Pre-#322 worlds carry no bargaining state and no NPP-led unions: return
  // early WITHOUT touching the lazy accessors below, which materialize
  // absent maps. Absent stays absent, so an idle world is byte-identical
  // before and after the pass.
  const hasBargainingState = world.bargainingCampaigns != null || world.collectiveAgreements != null;
  const hasNppLedUnion = Object.values(world.unions ?? {}).some(
    (union) => !union.suspended && union.ownerType === "npp" && union.ownerId != null
  );
  if (!hasBargainingState && !hasNppLedUnion) return result;
  const campaigns = bargainingCampaigns(world);

  // 1. Negotiating campaigns past their deadline enter dispute.
  for (const campaign of Object.values(campaigns).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (campaign.status === "negotiating" && campaign.deadlineTurn <= turn) {
      campaign.status = "dispute";
      campaign.disputeStartedAtTurn = turn;
      campaign.updatedAtTurn = turn;
      result.campaignsMovedToDispute++;
    }
  }

  // 2. Active agreements past expiry close.
  for (const agreement of Object.values(collectiveAgreements(world))) {
    if (agreement.status === "active" && agreement.expiresAtTurn <= turn) {
      agreement.status = "expired";
      agreement.updatedAtTurn = turn;
      result.agreementsExpired++;
    }
  }

  // 3. Close member ballots before lapsing: a settlement the members
  // ratified on the same turn a dispute runs out of road is a settlement,
  // not a lapse.
  closeDueRatificationVotes(world, turn, result);

  // 4. Lapse first so a dying dispute is not charged upkeep on its final turn.
  lapseStaleDisputes(world, turn, result);

  // 5. Refresh mandates from live conditions; charge overtime upkeep.
  refreshOpenCampaigns(world, turn, result);

  // 6. Autonomous answers: NPP campaign opens, policy responses, escalation.
  runNppBargainingAutoplay(world, turn, result);

  return result;
}

function closeDueRatificationVotes(
  world: WorldState,
  turn: number,
  result: LabourRelationsTurnResult
): void {
  const campaigns = bargainingCampaigns(world);
  const due = Object.values(campaigns)
    .filter((campaign) => campaign.ratification?.status === "open" && campaign.ratification.closesAtTurn <= turn)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const campaign of due) {
    const ratification = campaign.ratification!;
    const tally = tallyRatificationBallots(ratification, campaign.ballots ?? []);
    const outcome = resolveRatification(ratification, tally, turn);
    if (outcome === "ratified") {
      try {
        const settled = settleBargainingCampaign({ campaign, acceptedBy: "union", currentTurn: turn });
        if (!settled.ok) {
          campaign.ratification = { ...ratification, status: "void", closedAtTurn: turn };
          campaign.updatedAtTurn = turn;
          result.ratificationsVoided++;
          continue;
        }
        const agreements = collectiveAgreements(world);
        campaigns[settled.campaign.id] = {
          ...settled.campaign,
          ratification: { ...ratification, status: "ratified", closedAtTurn: turn },
        };
        agreements[settled.agreement.id] = settled.agreement;
        restoreEscalationExpectations(world, campaign);
        result.settlementsRatified++;
      } catch {
        campaign.ratification = { ...ratification, status: "void", closedAtTurn: turn };
        campaign.updatedAtTurn = turn;
        result.ratificationsVoided++;
      }
      continue;
    }
    if (outcome === "rejected") {
      campaign.ratification = { ...ratification, status: "rejected", closedAtTurn: turn };
      campaign.lastActionTurn = turn;
      campaign.updatedAtTurn = turn;
      result.settlementsRejected++;
      continue;
    }
    // Not due under the close rule yet (closesAtTurn <= turn always closes
    // via the deadline branch of resolveRatification; this arm is defensive).
    campaign.ratification = { ...ratification, status: "void", closedAtTurn: turn };
    campaign.updatedAtTurn = turn;
    result.ratificationsVoided++;
  }
  // Ballots on campaigns that can no longer be settled are void: there is
  // nothing left to ratify.
  for (const campaign of Object.values(campaigns)) {
    if (
      campaign.ratification?.status === "open" &&
      campaign.status !== "negotiating" &&
      campaign.status !== "dispute"
    ) {
      campaign.ratification = { ...campaign.ratification, status: "void", closedAtTurn: turn };
      campaign.updatedAtTurn = turn;
      result.ratificationsVoided++;
    }
  }
}

function lapseStaleDisputes(
  world: WorldState,
  turn: number,
  result: LabourRelationsTurnResult
): void {
  const campaigns = bargainingCampaigns(world);
  const stale = Object.values(campaigns)
    .filter((campaign) => campaign.status === "dispute" && turn >= disputeLapseTurn(campaign))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const campaign of stale) {
    if (campaign.ratification?.status === "open") {
      campaign.ratification = { ...campaign.ratification, status: "void", closedAtTurn: turn };
      result.ratificationsVoided++;
    }
    campaign.status = "lapsed";
    campaign.escalationLevel = "none";
    campaign.endedAtTurn = turn;
    campaign.lastActionTurn = turn;
    campaign.updatedAtTurn = turn;
    restoreEscalationExpectations(world, campaign);
    result.disputesLapsed++;
  }
}

function refreshOpenCampaigns(
  world: WorldState,
  turn: number,
  result: LabourRelationsTurnResult
): void {
  const campaigns = bargainingCampaigns(world);
  const open = Object.values(campaigns)
    .filter((campaign) => campaign.status === "negotiating" || campaign.status === "dispute")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const campaign of open) {
    const union = world.unions[campaign.unionId];
    if (!union || union.id !== campaign.unionId) continue;
    const scoped = scopedExistingAssets(world, campaign);
    if (scoped.length === 0) continue;

    // An overtime ban is organized withdrawal of labour the union keeps
    // paying for. When the fund runs dry the action ends. Suspended unions
    // are frozen like the dues pass keeps them: no upkeep debit moves a
    // banned union's treasury.
    let escalationLevel = campaign.escalationLevel;
    let treasury = union.treasury;
    if (campaign.status === "dispute" && campaign.escalationLevel === "overtime_ban" && !union.suspended) {
      const upkeep = escalationUpkeepPerTurn("overtime_ban", scoped.length);
      if (treasury >= upkeep) {
        treasury -= upkeep;
        result.overtimeBansFunded++;
      } else {
        escalationLevel = "none";
        result.overtimeBansEnded++;
      }
    }
    if (treasury !== union.treasury) {
      union.treasury = Math.max(0, treasury);
      union.updatedAtTurn = turn;
    }
    // A mandate frozen at opening means organizing during a dispute earns
    // nothing and a collapsed union keeps strike authority; refresh from
    // live conditions every turn.
    campaign.mandate = mandateFromLocals(world, union, scoped, union.treasury);
    campaign.mandateUpdatedAtTurn = turn;
    campaign.escalationLevel = escalationLevel;
    campaign.updatedAtTurn = turn;
    result.mandatesRefreshed++;
  }
}

function runNppBargainingAutoplay(
  world: WorldState,
  turn: number,
  result: LabourRelationsTurnResult
): void {
  const unions = Object.values(world.unions ?? {})
    .filter((union) => !union.suspended && union.ownerType === "npp" && union.ownerId != null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (unions.length === 0) return;

  openNppCampaigns(world, turn, unions, result);
  answerNppCampaigns(world, turn, result);
}

function openNppCampaigns(
  world: WorldState,
  turn: number,
  led: Union[],
  result: LabourRelationsTurnResult
): void {
  const assets = corporateSectorAssets(world);
  const campaigns = world.bargainingCampaigns ?? {};
  const unavailable = new Set<string>();
  for (const campaign of Object.values(campaigns)) {
    if (campaign.status === "negotiating" || campaign.status === "dispute") {
      unavailable.add(`${campaign.unionId}::${campaign.employerCorporationId}`);
    }
  }
  for (const agreement of Object.values(world.collectiveAgreements ?? {})) {
    if (isCollectiveAgreementActive(agreement, turn)) {
      unavailable.add(`${agreement.unionId}::${agreement.employerCorporationId}`);
    }
  }

  for (const union of led) {
    if (result.campaignsOpened >= NPP_CAMPAIGN_OPEN_LIMIT_PER_TURN) break;
    const leader = world.politicians.find((p) => p.id === union.ownerId);
    if (!leader) continue;
    const scope = Object.values(assets)
      .filter((asset) => asset.countryId === union.countryId && asset.sectorType === union.sectorType)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (scope.length === 0) continue;
    const density = Math.max(0, Math.min(100, union.unionization ?? 0));
    const scopeAverageUnionization = workerWeightedAverage(scope, (local) => local.unionization ?? density);
    if (scopeAverageUnionization < NPP_DEMAND_MIN_UNIONIZATION) continue;
    const scopeAverageWage = workerWeightedAverage(scope, (local) => local.wageLevel ?? 1);
    const claim = Math.min(
      NPP_DEMAND_CEILING,
      scopeAverageWage * (1 + NPP_DEMAND_PREMIUM * (0.5 + militancy(leader)))
    );

    const byEmployer = new Map<string, CorporateSectorAsset[]>();
    for (const local of scope) {
      const group = byEmployer.get(local.corporationId) ?? [];
      group.push(local);
      byEmployer.set(local.corporationId, group);
    }
    const candidates = [...byEmployer.entries()]
      .filter(([employerId, locals]) => {
        if (!world.corporations[employerId]) return false;
        if (unavailable.has(`${union.id}::${employerId}`)) return false;
        return locals.some((local) => (local.unionization ?? density) >= STRIKE_CALL_MIN_UNIONIZATION);
      })
      .map(([employerId, locals]) => ({
        employerId,
        grievance: workerWeightedAverage(locals, (local) => Math.max(0, claim - (local.wageLevel ?? 1))),
        workers: locals.reduce((sum, local) => sum + Math.max(0, local.workers ?? 0), 0),
      }))
      .sort(
        (left, right) =>
          right.grievance - left.grievance ||
          right.workers - left.workers ||
          (left.employerId < right.employerId ? -1 : 1)
      );
    const candidate = candidates[0];
    if (!candidate || candidate.grievance <= 0) continue;
    try {
      openBargainingCampaignAction(world, {
        unionId: union.id,
        employerCorporationId: candidate.employerId,
        terms: {
          wageLevel: Math.round(claim * 100) / 100,
          agreementDurationTurns: 48,
          noStrikeTurns: 24,
        },
        turn,
      });
      result.campaignsOpened++;
      unavailable.add(`${union.id}::${candidate.employerId}`);
    } catch {
      continue;
    }
  }
}

function answerNppCampaigns(world: WorldState, turn: number, result: LabourRelationsTurnResult): void {
  const campaigns = bargainingCampaigns(world);
  const open = Object.values(campaigns)
    .filter((campaign) => campaign.status === "negotiating" || campaign.status === "dispute")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const campaign of open) {
    if (campaign.lastActionTurn >= turn) continue;
    const union = world.unions[campaign.unionId];
    const employer = world.corporations[campaign.employerCorporationId];
    const locals = scopedExistingAssets(world, campaign);
    if (!union || !employer || locals.length === 0) continue;
    const employerWageLevel = workerWeightedAverage(locals, (local) => local.wageLevel ?? 1);
    const employerProfitMargin = employer.profitMargin;
    const unionIsNpp = union.ownerType === "npp" && union.ownerId != null;

    const responseParty =
      campaign.currentOffer.proposedBy === "union"
        ? "employer"
        : campaign.currentOffer.proposedBy === "employer" && unionIsNpp
          ? "union"
          : null;
    if (responseParty) {
      const decision = decideNppBargainingAction({
        campaign,
        party: responseParty,
        currentTurn: turn,
        employerWageLevel,
        employerProfitMargin,
      });
      if (decision.action === "accept") {
        try {
          settleBargainingCampaignDirect(world, campaign.id, responseParty, turn);
          result.agreementsSettled++;
        } catch {
          continue;
        }
        continue;
      }
      if (decision.action === "counter") {
        try {
          if (responseParty === "employer") {
            answerBargainingCampaignAsEmployer(world, {
              campaignId: campaign.id,
              action: "counter",
              terms: decision.terms,
              turn,
            });
          } else {
            moveBargainingCampaignAsUnion(world, {
              campaignId: campaign.id,
              action: "counter",
              terms: decision.terms,
              turn,
            });
          }
          result.counteroffersMade++;
        } catch {
          continue;
        }
        continue;
      }
    }
    if (campaign.status !== "dispute") continue;

    // Industrial action belongs to the union, not to whichever side authored
    // the current offer: an NPP union stays active after a hardline
    // rejection with no employer counteroffer.
    if (!unionIsNpp || union.suspended) continue;
    try {
      moveBargainingCampaignAsUnion(world, { campaignId: campaign.id, action: "escalate", turn });
      result.disputesEscalated++;
    } catch {
      continue;
    }
  }
}

/**
 * Worker political salience from live campaign state: open disputes drag
 * workerSecurity/civicLife down by rung, fresh settlements lift them by
 * mandate quality, services add the standing nudge — all through the
 * verbatim provider, capped per metric. The metric-engine write itself
 * stays a documented blocker (see political.ts); this is the feedback the
 * reference feeds its political board, computed from the same live state
 * the turn just advanced.
 */
export function labourNudgesForTurn(world: WorldState, turn: number): Map<string, Map<string, number>> {
  const campaigns = Object.values(world.bargainingCampaigns ?? {})
    .filter((campaign) => campaign.status === "dispute" || campaign.status === "settled")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const unions = Object.values(world.unions ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1));
  return buildLabourRelationsPoliticalNudges(campaigns, turn, unions);
}
