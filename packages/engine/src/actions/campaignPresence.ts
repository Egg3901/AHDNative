import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";
import { ELECTORAL_VOTE_UNITS } from "../electionEngine/resolution/constants.js";
import {
  STATE_ORG_COST_ACTIONS,
  stateOrgLevelCost,
} from "../electionEngine/constants.js";
import type { WorldState } from "../types.js";

export type CampaignPresenceResult = { ok: true; message: string } | { ok: false; error: string };

const US_POLITICAL_STATES = new Set(ELECTORAL_VOTE_UNITS.map((row) => row.stateId));

/** Build one source-priced US presidential campaign-presence level. */
export function buildStatePresence(
  world: WorldState,
  actorId: string,
  stateId: string | undefined,
): CampaignPresenceResult {
  if (actorId !== "player" || world.player.countryId !== "US") {
    return { ok: false, error: "Campaign Presence is currently available to US player campaigns only." };
  }
  if (!stateId || !US_POLITICAL_STATES.has(stateId) || world.regions[stateId]?.countryId !== "US" || !world.stateDemographics[stateId]) {
    return { ok: false, error: "Campaign Presence requires an eligible US state." };
  }

  const campaign = Object.values(world.campaigns)
    .filter((row) => row.candidateId === actorId && row.countryId === "US" && row.status === "active")
    .sort((a, b) => b.createdAtTurn - a.createdAtTurn || a.id.localeCompare(b.id))[0];
  if (!campaign) {
    return { ok: false, error: "You need an active campaign to build Campaign Presence." };
  }
  const current = world.player.primaryStateOrganizations?.[stateId];
  if (current?.lastBuildTurn === world.meta.turn) {
    return { ok: false, error: `Already built ${stateId} this turn (cap 1 per state per turn).` };
  }
  const currentLevel = current?.level ?? 0;
  const costActions = STATE_ORG_COST_ACTIONS;
  const costFunds = campaignAnchorToLocal(
    stateOrgLevelCost(currentLevel),
    campaign.countryId,
  );
  if (campaign.actions < costActions) {
    return { ok: false, error: `Not enough campaign actions. Building presence costs ${costActions}.` };
  }
  if (campaign.funds < costFunds) {
    return { ok: false, error: `Not enough campaign funds. The next level costs ${Math.round(costFunds)}.` };
  }

  const nextLevel = currentLevel + 1;
  // All gates precede mutation. Campaign resource pools, rather than the
  // player's personal AP/funds, are the source action's account of record.
  campaign.actions -= costActions;
  campaign.funds -= costFunds;
  campaign.totalActionsSpent += costActions;
  campaign.totalFundsSpent += costFunds;
  world.player.primaryStateOrganizations = {
    ...(world.player.primaryStateOrganizations ?? {}),
    [stateId]: {
      level: nextLevel,
      totalInvested: (current?.totalInvested ?? 0) + costActions,
      updatedAtTurn: world.meta.turn,
      lastBuildTurn: world.meta.turn,
      lastBuildFunds: costFunds,
    },
  };
  return { ok: true, message: `Built Campaign Presence level ${nextLevel} in ${stateId}.` };
}
