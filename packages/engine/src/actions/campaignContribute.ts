import type { Campaign, WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { campaignLocalRate } from "../campaigns/campaignCurrency.js";
import {
  CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER,
  CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS,
  campaignStrengthBatchQuote,
  campaignStrengthBoostPercent,
  maxAffordableCampaignStrengthClicks,
} from "../campaigns/campaignStrength.js";

export interface CampaignContributeParams {
  electionId?: string | undefined;
  /**
   * How many single-click contributions to bundle. A click buys
   * `nationalInfluence * CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER` points
   * of strength. `"max"` resolves server-side to the largest count the player
   * can pay for right now; defaults to 1, so callers that predate the batched
   * Support control are unchanged.
   */
  clicks?: number | "max" | undefined;
  /**
   * Candidate in the SAME election whose campaign receives the strength.
   * Defaults to the player's own campaign. Cross-campaign contribution is the
   * reference's rival-support path (AHDGame contributeCampaignStrength takes an
   * arbitrary campaignId; the suspendEndorse transfer moves strength within one
   * election too).
   */
  targetCandidateId?: string | undefined;
  /**
   * Internal raw-amount override. Kept as the helper the UI can call when it
   * already holds an explicit amount (it does not need the national-influence
   * derivation): a single contribution of exactly `strengthAdded` points, with
   * the reference action cost `ceil(strengthAdded / POINTS_PER_ACTION)`. The
   * public/reference-shaped path is `clicks`; `strengthAdded` is ignored when
   * `clicks` is supplied.
   */
  strengthAdded?: number | undefined;
}

export type CampaignContributeResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Contribute campaign strength to a campaign in an eligible race (#68).
 *
 * Faithful port of AHDGame's `contributeCampaignStrength`
 * (src/lib/campaigns/commands/campaignCommands.ts ~lines 719-948):
 *
 *   - `strengthPerClick = nationalInfluence * 0.75`
 *     (CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER), so a contributor with no
 *     national influence cannot contribute;
 *   - a batched click count (`clicks`): a numeric count is honoured (floored,
 *     clamped to CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS) and `"max"` is resolved
 *     HERE with `maxAffordableCampaignStrengthClicks` against the campaign's
 *     live strength and the player's current funds/actions, so a Max request
 *     degrades to a slightly smaller batch rather than hard-failing;
 *   - funds/actions come from `campaignStrengthBatchQuote` (the exact integral
 *     of the reference's quadratic marginal price and `clicks * ceil(perClick
 *     / POINTS_PER_ACTION)` actions — ceilings do not add), and the anchor funds
 *     cost is converted to the player's local balance with the frozen
 *     `campaignLocalRate`;
 *   - the reference's eligibility gates: campaign-eligible race, presidential
 *     only (the multiplier is the only place strength changes votes), not
 *     resolved (the reference's "completed"), and same country as the player.
 *
 * Cross-campaign: `targetCandidateId` picks another candidate's campaign in the
 * SAME election (the reference targets an arbitrary campaignId; Native scopes
 * the transfer to one election). Strength is credited to the target while
 * funds/actions are debited from the player.
 *
 * Atomicity (reference): AHDGame debits the actor, then the campaign, and
 * refunds the actor if the campaign write misses. Native is a single-threaded
 * in-memory world, so every gate — including affordability — is validated
 * BEFORE any write; a rejected or unaffordable contribution leaves the player's
 * funds/actions and the target campaign's strength exactly as they were
 * (execute.ts also snapshots and restores accounting on any failure result,
 * belt-and-braces).
 */
export function campaignContribute(
  world: WorldState,
  params: CampaignContributeParams,
): CampaignContributeResult {
  const { electionId, targetCandidateId } = params;

  if (!electionId) return { ok: false, error: "campaignContribute requires electionId" };

  const election = world.elections.find((item) => item.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) {
    return { ok: false, error: "Campaign strength is not available for this race" };
  }
  // UI-honesty gate (reference): only the presidential engine consumes
  // campaign strength; down-ballot engines ignore it, so accepting a
  // contribution there would charge the player for a stat with zero vote
  // effect. Reject BEFORE any funds/actions debit.
  if (election.electionType !== "president") {
    return {
      ok: false,
      error:
        "Campaign strength only affects presidential races right now, so contributions to this race are disabled to protect your funds and actions.",
    };
  }
  if (election.countryId !== world.player.countryId) {
    return { ok: false, error: "You cannot contribute campaign strength to a campaign in another country" };
  }

  // Resolve the target campaign. The player's own campaign is the default; a
  // rival candidate in this election can be selected explicitly.
  const targetId = targetCandidateId && targetCandidateId !== "player" ? targetCandidateId : "player";
  if (targetId === "player") {
    if (!election.candidates.some((candidate) => candidate.id === "player")) {
      return { ok: false, error: "File candidacy in this race before contributing." };
    }
  } else if (!election.candidates.some((candidate) => candidate.id === targetId)) {
    return { ok: false, error: "That candidate is not running in this race." };
  }

  const campaign = world.campaigns[campaignKey(electionId, targetId)];
  if (!campaign || campaign.status !== "active") {
    return {
      ok: false,
      error: targetId === "player" ? "No active campaign for this race." : "That campaign is not active in this race.",
    };
  }

  const currentStrength = campaign.campaignStrength ?? 0;
  // Anchor cost, converted to the player's local campaign-fund balance at the
  // frozen world-seeded basis (campaign funds are decoupled from live forex).
  const fundsRate = campaignLocalRate(world.player.countryId);

  // Internal raw-amount helper path: an explicit strengthAdded is a single
  // contribution of that amount, bypassing the national-influence derivation.
  if (params.clicks === undefined && params.strengthAdded !== undefined) {
    const added = params.strengthAdded;
    if (!Number.isFinite(added) || added <= 0) {
      return { ok: false, error: "campaignContribute requires a positive contribution" };
    }
    return applyStrengthContribution(world, {
      election,
      campaign,
      clicks: 1,
      strengthPerClick: added,
      currentStrength,
      fundsRate,
    });
  }

  const nationalInfluence = world.player.nationalInfluence ?? 0;
  const strengthPerClick = nationalInfluence * CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER;
  if (strengthPerClick <= 0) {
    return { ok: false, error: "You have no national influence to contribute" };
  }

  // "Max" is resolved against the campaign's LIVE strength and the player's
  // current balances, not a client preview. A numeric count is honoured as
  // asked (floored, clamped) and simply gated below.
  const requestedClicks = params.clicks ?? 1;
  const clicks =
    requestedClicks === "max"
      ? maxAffordableCampaignStrengthClicks({
          currentStrength,
          strengthPerClick,
          availableFunds: world.player.funds,
          availableActions: world.player.actions,
          fundsRate,
        })
      : Number.isFinite(requestedClicks)
        ? Math.min(Math.max(1, Math.floor(requestedClicks as number)), CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS)
        : 1;

  if (clicks < 1) {
    // Only reachable via "max". Quote a single click so the message says what
    // the player is actually short of rather than just refusing.
    const one = campaignStrengthBatchQuote(currentStrength, strengthPerClick, 1);
    const oneCostLocal = one.costFunds * fundsRate;
    return {
      ok: false,
      error:
        world.player.actions < one.costActions
          ? `Insufficient actions. Need ${one.costActions}, have ${world.player.actions}`
          : `Insufficient funds. Need ${Math.ceil(oneCostLocal).toLocaleString()}, have ${Math.floor(world.player.funds).toLocaleString()}`,
    };
  }

  return applyStrengthContribution(world, {
    election,
    campaign,
    clicks,
    strengthPerClick,
    currentStrength,
    fundsRate,
  });
}

/** Debits the player and credits one campaign in a single validated commit. */
function applyStrengthContribution(
  world: WorldState,
  input: {
    election: WorldState["elections"][number];
    campaign: Campaign;
    clicks: number;
    strengthPerClick: number;
    currentStrength: number;
    fundsRate: number;
  },
): CampaignContributeResult {
  const { election, campaign, clicks, strengthPerClick, currentStrength, fundsRate } = input;

  const quote = campaignStrengthBatchQuote(currentStrength, strengthPerClick, clicks);
  const strengthAdded = quote.strengthAdded;
  const costFundsLocal = quote.costFunds * fundsRate;
  const costActions = quote.costActions;

  if (world.player.actions < costActions) {
    return {
      ok: false,
      error: `Insufficient actions. Need ${costActions}, have ${world.player.actions}`,
    };
  }
  if (world.player.funds < costFundsLocal) {
    return {
      ok: false,
      error: `Insufficient funds. Need ${Math.ceil(costFundsLocal).toLocaleString()}, have ${Math.floor(world.player.funds).toLocaleString()}`,
    };
  }

  // All gates passed — commit atomically (both axes in one place, no partial
  // write). execute.ts additionally snapshots/restores accounting on failure.
  world.player.actions -= costActions;
  world.player.funds -= costFundsLocal;
  campaign.campaignStrength = currentStrength + strengthAdded;

  const targetName =
    campaign.candidateId === "player"
      ? world.player.name
      : election.candidates.find((candidate) => candidate.id === campaign.candidateId)?.name ?? campaign.candidateId;
  // Batched contributions are one debit, so the message says how many clicks it
  // stood in for (mirrors the reference's activityLog batch suffix).
  const batchSuffix = clicks > 1 ? ` (x${clicks})` : "";
  const own = campaign.candidateId === "player";
  const boostSuffix = own
    ? ` (now +${campaignStrengthBoostPercent(campaign.campaignStrength).toFixed(1)}% vote boost)`
    : "";
  return {
    ok: true,
    message: `Added ${strengthAdded.toFixed(1)} campaign strength to ${targetName}${batchSuffix}${boostSuffix}.`,
  };
}
