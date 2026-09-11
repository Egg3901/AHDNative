import type { WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";

export interface CampaignCanvassParams {
  electionId?: string | undefined;
  regionId?: string | undefined;
  demographicCategory?: string | undefined;
  demographicGroup?: string | undefined;
}

export type CampaignCanvassResult = { ok: true; message: string } | { ok: false; error: string };

export const CAMPAIGN_CANVASS_FUNDS = 100;
export const CAMPAIGN_CANVASS_ACTIONS = 1;
export const CAMPAIGN_CANVASS_BASE_BOOST = 2;
export const CAMPAIGN_CANVASS_TURNOUT_CAP = 20;
export const CAMPAIGN_CANVASS_HALF_LIFE = 6;

function campaignFit(candidate: { economic: number; social: number }, audience: { economic: number; social: number }): number {
  const distance = ((candidate.economic - audience.economic) ** 2 + (candidate.social - audience.social) ** 2) / 2;
  return 0.2 + 0.8 * Math.exp(-distance / 18);
}

function addTurnoutBoost(current: number, boost: number): number {
  const clamped = Math.max(-CAMPAIGN_CANVASS_TURNOUT_CAP, Math.min(CAMPAIGN_CANVASS_TURNOUT_CAP, current));
  const resistance = Math.max(0, Math.sign(boost) * clamped) / CAMPAIGN_CANVASS_TURNOUT_CAP;
  return Math.max(
    -CAMPAIGN_CANVASS_TURNOUT_CAP,
    Math.min(CAMPAIGN_CANVASS_TURNOUT_CAP, clamped + boost * (1 - resistance)),
  );
}

/**
 * Apply one source-backed demographic canvass to the player's campaign.
 *
 * AHDGame's canvassing route charges one action and 100 funds, then applies
 * the ideology-fit turnout boost to the selected group. Native stores that
 * race-local modifier on the campaign so it survives saves and can be fed into
 * the election tally without mutating the seeded demographic baseline.
 */
export function campaignCanvass(
  world: WorldState,
  params: CampaignCanvassParams,
): CampaignCanvassResult {
  const { electionId, regionId, demographicCategory, demographicGroup } = params;
  if (!electionId) return { ok: false, error: "campaignCanvass requires electionId" };
  if (!regionId || !demographicCategory || !demographicGroup) {
    return { ok: false, error: "campaignCanvass requires regionId, demographicCategory, and demographicGroup" };
  }

  const election = world.elections.find((item) => item.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) {
    return { ok: false, error: "Campaign canvassing is not available for this race." };
  }
  if (!election.candidates.some((candidate) => candidate.id === "player")) {
    return { ok: false, error: "File candidacy in this race before canvassing." };
  }

  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign) return { ok: false, error: "No active campaign for this race." };
  if (campaign.status !== "active") return { ok: false, error: "Campaign is archived and read-only." };

  const activeRegion = election.state ?? campaign.countryId;
  if (regionId !== activeRegion) {
    return { ok: false, error: "Canvassing is only available in the campaign's active region." };
  }

  const categories = world.demographicCategories[campaign.countryId] ?? [];
  const category = categories.find((candidateCategory) => candidateCategory._id === demographicCategory);
  const group = category?.groups.find((candidateGroup) => candidateGroup.id === demographicGroup);
  const state = world.stateDemographics[regionId];
  const target = group && state?.groups[group.id];
  if (!category || !group || !target) {
    return { ok: false, error: "Unknown campaign demographic target." };
  }

  const policies = world.player.policies ?? { economic: 0, social: 0 };
  const closing = election.endTurn - world.meta.turn <= 4;
  const fit = campaignFit(
    { economic: policies.economic, social: policies.social },
    { economic: target.economicLean, social: target.socialLean },
  );
  const boost = CAMPAIGN_CANVASS_BASE_BOOST * fit ** 2 * (closing ? 2 : 1);
  const key = `${demographicCategory}:${demographicGroup}`;
  const next = addTurnoutBoost(campaign.canvassModifiers?.[key] ?? 0, boost);
  campaign.canvassModifiers = { ...(campaign.canvassModifiers ?? {}), [key]: next };

  return { ok: true, message: `Canvassed ${group.name} voters in ${regionId}.` };
}

/** Source campaign-targeting decay: turnout bonuses halve every six turns. */
export function decayCampaignCanvassModifiers(
  modifiers: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!modifiers) return undefined;
  const next = Object.fromEntries(Object.entries(modifiers).map(([key, value]) => {
    const decayed = value * 2 ** (-1 / CAMPAIGN_CANVASS_HALF_LIFE);
    return [key, Math.abs(decayed) < 0.01 ? 0 : decayed];
  }));
  return Object.keys(next).length > 0 ? next : undefined;
}
