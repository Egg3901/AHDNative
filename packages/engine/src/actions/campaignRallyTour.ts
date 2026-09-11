import type { WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { ensurePlayerSupport } from "./campaignRally.js";

export interface CampaignRallyTourParams {
  electionId?: string | undefined;
  active?: boolean | undefined;
}

export type CampaignRallyTourResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Toggle the source-backed per-turn rally tour for the player's active
 * campaign. The campaign turn phase owns the recurring tick and affordability
 * check; this action only persists the candidate-level toggle.
 */
export function campaignRallyTour(
  world: WorldState,
  params: CampaignRallyTourParams,
): CampaignRallyTourResult {
  const { electionId, active } = params;
  if (!electionId) return { ok: false, error: "campaignRallyTour requires electionId" };
  if (active === undefined) return { ok: false, error: "campaignRallyTour requires rallyTour start|stop" };

  const election = world.elections.find((e) => e.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) return { ok: false, error: "Rallies are not available for this race" };
  if (!election.candidates.some((candidate) => candidate.id === "player")) {
    return { ok: false, error: "File candidacy in this race before managing its rally tour." };
  }

  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign || campaign.status !== "active") {
    return { ok: false, error: "No active campaign for this race." };
  }

  const support = ensurePlayerSupport(world, election, campaign.partyId);
  if (support.status !== "active") return { ok: false, error: "Candidate support is inactive." };
  support.rallyTourActive = active;
  return { ok: true, message: `Campaign rally tour ${active ? "started" : "stopped"}.` };
}
