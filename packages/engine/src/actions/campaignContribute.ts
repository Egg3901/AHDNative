import type { WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { campaignLocalRate } from "../campaigns/campaignCurrency.js";
import {
  campaignStrengthBoostPercent,
  campaignStrengthContributionActions,
  campaignStrengthContributionCost,
} from "../campaigns/campaignStrength.js";

export interface CampaignContributeParams {
  electionId?: string | undefined;
  strengthAdded?: number | undefined;
}

export type CampaignContributeResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Contribute campaign strength to the player's OWN campaign (#68).
 *
 * Ports the SPEND + STRENGTH-ACCRUAL half of AHDGame's
 * `contributeCampaignStrength` (src/lib/campaigns/commands/campaignCommands.ts
 * ~lines 719-948): the funds and action axes come from the exact reference
 * formulas (`campaignStrengthContributionCost` / `…Actions`), the anchor cost
 * is converted to the player's local campaign-fund balance with the frozen
 * `campaignLocalRate`, and eligibility mirrors the reference gates
 * (campaign-eligible race, presidential-only, not resolved, same country).
 *
 * Concurrency/atomicity note (reference): AHDGame debits the actor, then the
 * campaign, and refunds the actor if the campaign write misses. Native is a
 * single-threaded in-memory world, so both axes are validated BEFORE any write
 * — a rejected contribution leaves the player's funds/actions and the
 * campaign's strength exactly as they were (execute.ts also snapshots and
 * restores accounting on any failure result, belt-and-braces).
 *
 * PORT-STUB (deliberately omitted, named per system — do not invent params):
 *   - The reference derives `strengthAdded` from the contributor's national
 *     influence: `strengthPerClick = nationalInfluence *
 *     CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER` (0.75), then a click
 *     count (x1 / x5 / Max via `maxAffordableCampaignStrengthClicks`). Native's
 *     action takes an explicit `strengthAdded` instead — no national-influence
 *     coupling and no batched click count. The NPI multiplier constant is
 *     still ported for the display layer.
 *   - Cross-campaign transfers (contributing to a RIVAL campaign) and the
 *     reference's activityLog audit row are not modeled; the action targets the
 *     player's own campaign only.
 */
export function campaignContribute(
  world: WorldState,
  params: CampaignContributeParams,
): CampaignContributeResult {
  const { electionId, strengthAdded } = params;

  if (!electionId) return { ok: false, error: "campaignContribute requires electionId" };
  if (strengthAdded === undefined || !Number.isFinite(strengthAdded) || strengthAdded <= 0) {
    return { ok: false, error: "campaignContribute requires a positive strengthAdded" };
  }

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
  if (!election.candidates.some((candidate) => candidate.id === "player")) {
    return { ok: false, error: "File candidacy in this race before contributing." };
  }

  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign || campaign.status !== "active") {
    return { ok: false, error: "No active campaign for this race." };
  }

  const currentStrength = campaign.campaignStrength ?? 0;
  // Anchor cost, converted to the player's local campaign-fund balance at the
  // frozen world-seeded basis (campaign funds are decoupled from live forex).
  const fundsRate = campaignLocalRate(world.player.countryId);
  const costFundsLocal = campaignStrengthContributionCost(currentStrength, strengthAdded) * fundsRate;
  const costActions = campaignStrengthContributionActions(strengthAdded);

  if (world.player.actions < costActions) {
    return { ok: false, error: `Insufficient actions. Need ${costActions}, have ${world.player.actions}` };
  }
  if (world.player.funds < costFundsLocal) {
    return {
      ok: false,
      error: `Insufficient funds. Need ${Math.ceil(costFundsLocal).toLocaleString()}, have ${Math.floor(world.player.funds).toLocaleString()}`,
    };
  }

  // All gates passed — commit atomically.
  world.player.actions -= costActions;
  world.player.funds -= costFundsLocal;
  campaign.campaignStrength = currentStrength + strengthAdded;

  return {
    ok: true,
    message:
      `Added ${strengthAdded.toFixed(1)} campaign strength ` +
      `(now +${campaignStrengthBoostPercent(campaign.campaignStrength).toFixed(1)}% vote boost).`,
  };
}
