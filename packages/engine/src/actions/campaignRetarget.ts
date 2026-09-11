import type { WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";

export interface CampaignRetargetParams {
  electionId?: string | undefined;
  oppositionTargetId?: string | undefined;
}

export type CampaignRetargetResult = { ok: true; message: string } | { ok: false; error: string };

export const OPPOSITION_RESEARCH_COOLDOWN_TURNS = 6;

/**
 * Select the candidate who receives the campaign's opposition-research drain.
 *
 * This is the solo equivalent of AHDGame's retargetOppositionResearch route:
 * the research starter must be purchased first, primary targeting is limited
 * to the player's own party field, and changing targets freezes for six turns.
 * The turn phase owns the recurring support drain after this action persists
 * the target.
 */
export function campaignRetarget(
  world: WorldState,
  params: CampaignRetargetParams,
): CampaignRetargetResult {
  const { electionId, oppositionTargetId } = params;
  if (!electionId) return { ok: false, error: "campaignRetarget requires electionId" };
  if (!oppositionTargetId) return { ok: false, error: "campaignRetarget requires oppositionTargetId" };

  const election = world.elections.find((item) => item.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) {
    return { ok: false, error: "Opposition research is not available for this race." };
  }
  const playerCandidate = election.candidates.find((candidate) => candidate.id === "player");
  if (!playerCandidate) return { ok: false, error: "File candidacy in this race before targeting opposition research." };

  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign || campaign.status !== "active") {
    return { ok: false, error: "No active campaign for this race." };
  }
  if (!campaign.oppositionResearchTree.starter) {
    return { ok: false, error: "Unlock opposition research before retargeting." };
  }

  const cooldownUntil = campaign.oppositionResearchCooldownUntilTurn;
  if (typeof cooldownUntil === "number" && world.meta.turn < cooldownUntil) {
    return { ok: false, error: "Opposition research is on cooldown." };
  }

  const target = election.candidates.find((candidate) => candidate.id === oppositionTargetId);
  if (!target || target.id === "player") {
    return { ok: false, error: "Target must be an active candidate in this race." };
  }
  const primaryOpen = world.meta.turn < election.primaryEndTurn;
  if (primaryOpen && target.partyId !== playerCandidate.partyId) {
    return { ok: false, error: "Target must be a same-party primary opponent." };
  }

  campaign.oppositionTargetId = target.id;
  campaign.oppositionTargetName = target.name;
  campaign.oppositionResearchCooldownUntilTurn = world.meta.turn + OPPOSITION_RESEARCH_COOLDOWN_TURNS;
  return { ok: true, message: `Opposition research now targets ${target.name}.` };
}
