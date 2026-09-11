import type { CandidateSupport, WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { getCampaignFamilyScalar } from "../campaigns/upgradeCosts.js";
import {
  DEFAULT_CANDIDATE_SUPPORT,
  SUPPORT_RALLY_ACTION_COST,
  SUPPORT_RALLY_FULL_VALUE,
} from "../support/constants.js";
import { buildRallyAccrualEntry } from "../support/support.js";

export interface CampaignRallyParams {
  electionId?: string | undefined;
}

export type CampaignRallyResult = { ok: true; message: string } | { ok: false; error: string };

export function ensurePlayerSupport(
  world: WorldState,
  election: WorldState["elections"][number],
  partyId: string,
): CandidateSupport {
  const existing = world.candidateSupports.player;
  if (existing && existing.electionId === election.id) return existing;
  if (existing && existing.electionId === undefined) {
    existing.electionId = election.id;
    return existing;
  }
  const support: CandidateSupport = {
    id: "player",
    partyId,
    countryId: election.countryId,
    electionId: election.id,
    support: DEFAULT_CANDIDATE_SUPPORT,
    supportAccrual: [],
    status: "active",
  };
  world.candidateSupports.player = support;
  return support;
}

/**
 * Fire the bounded, one-shot campaign rally port from the mainline campaign
 * command. The campaign action pool pays for the race-family-scaled rally;
 * candidate support receives the source 60/40 immediate/trailing split.
 */
export function campaignRally(
  world: WorldState,
  params: CampaignRallyParams,
): CampaignRallyResult {
  const { electionId } = params;
  if (!electionId) return { ok: false, error: "campaignRally requires electionId" };

  const election = world.elections.find((e) => e.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) return { ok: false, error: "Rallies are not available for this race" };
  if (!election.candidates.some((candidate) => candidate.id === "player")) {
    return { ok: false, error: "File candidacy in this race before rallying." };
  }

  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign || campaign.status !== "active") {
    return { ok: false, error: "No active campaign for this race." };
  }

  const scalar = getCampaignFamilyScalar(election.electionType);
  const actionCost = Math.ceil(SUPPORT_RALLY_ACTION_COST * scalar);
  if (campaign.actions < actionCost) {
    return { ok: false, error: `Insufficient campaign actions. Required: ${actionCost}, Available: ${campaign.actions}` };
  }

  const candidateSupport = ensurePlayerSupport(world, election, campaign.partyId);
  if (candidateSupport.status !== "active") return { ok: false, error: "Candidate support is inactive." };
  if (typeof candidateSupport.lastRallyTurn === "number" && candidateSupport.lastRallyTurn >= world.meta.turn) {
    return { ok: false, error: "Rally already fired this turn" };
  }

  const { immediateBump, entry } = buildRallyAccrualEntry(SUPPORT_RALLY_FULL_VALUE * scalar);
  const currentSupport = Number.isFinite(candidateSupport.support)
    ? candidateSupport.support
    : DEFAULT_CANDIDATE_SUPPORT;
  candidateSupport.support = Math.max(0, Math.min(100, currentSupport + immediateBump));
  candidateSupport.lastRallyTurn = world.meta.turn;
  candidateSupport.supportAccrual = [...(candidateSupport.supportAccrual ?? []), entry];
  campaign.actions -= actionCost;

  return {
    ok: true,
    message: `Rallied for ${immediateBump.toFixed(2)} support now and ${entry.amountPerTurn.toFixed(2)} per turn for ${entry.turnsRemaining} turns.`,
  };
}
