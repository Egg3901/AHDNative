import type { WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";

export interface CampaignManagerParams {
  electionId?: string | undefined;
  managerId?: string | undefined;
}

export type CampaignManagerResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Select or clear the politician who represents the player's campaign manager.
 *
 * Native keeps this first manager slice intentionally narrow: the appointment
 * is persisted on the campaign, but manager permissions and independent
 * effects remain outside the solo action model until they are ported.
 */
export function campaignManager(
  world: WorldState,
  params: CampaignManagerParams,
): CampaignManagerResult {
  const { electionId, managerId } = params;
  if (!electionId) return { ok: false, error: "campaignManager requires electionId" };
  if (managerId === undefined) return { ok: false, error: "campaignManager requires managerId" };

  const election = world.elections.find((item) => item.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) {
    return { ok: false, error: "Campaign management is not available for this race." };
  }
  if (!election.candidates.some((candidate) => candidate.id === "player")) {
    return { ok: false, error: "File candidacy in this race before managing the campaign." };
  }

  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign) return { ok: false, error: "No active campaign for this race." };
  if (campaign.status !== "active") return { ok: false, error: "Campaign is archived and read-only." };

  if (managerId === "") {
    delete campaign.managerId;
    delete campaign.managerName;
    return { ok: true, message: "Campaign manager cleared." };
  }

  const manager = world.politicians.find((politician) =>
    politician.id === managerId && politician.countryId === campaign.countryId);
  if (!manager) {
    return { ok: false, error: "Campaign managers must be from the same country as the campaign." };
  }

  campaign.managerId = manager.id;
  campaign.managerName = manager.name;
  return { ok: true, message: `${manager.name} appointed as campaign manager.` };
}
