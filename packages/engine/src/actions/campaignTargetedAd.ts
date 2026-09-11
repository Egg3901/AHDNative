import type { WorldState } from "../types.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";

export interface CampaignTargetedAdParams {
  electionId?: string | undefined;
  regionId?: string | undefined;
  demographicCategory?: string | undefined;
  demographicGroup?: string | undefined;
}

export type CampaignTargetedAdResult = { ok: true; message: string } | { ok: false; error: string };

export const CAMPAIGN_TARGETED_AD_FUNDS = 100;
export const CAMPAIGN_TARGETED_AD_ACTIONS = 1;
export const CAMPAIGN_TARGETED_AD_BOOST = 0.01;
export const CAMPAIGN_TARGETED_AD_CAP = 0.25;
export const CAMPAIGN_TARGETED_AD_HALF_LIFE = 24;

function targetKey(category: string, group: string): string {
  return `${category}:${group}`;
}

/**
 * Buy one race-local targeted ad flight for the selected demographic group.
 *
 * AHDGame's targeted-ad route charges one action and 100 funds, adds one
 * percentage point of nominal audience bonus up to the 25% cap, and lets the
 * resulting exposure decay over a 24-turn half-life. Native keeps that
 * exposure on the race campaign so save/load and the tally see the same value.
 */
export function campaignTargetedAd(
  world: WorldState,
  params: CampaignTargetedAdParams,
): CampaignTargetedAdResult {
  const { electionId, regionId, demographicCategory, demographicGroup } = params;
  if (!electionId) return { ok: false, error: "campaignTargetedAd requires electionId" };
  if (!regionId || !demographicCategory || !demographicGroup) {
    return { ok: false, error: "campaignTargetedAd requires regionId, demographicCategory, and demographicGroup" };
  }

  const election = world.elections.find((item) => item.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) {
    return { ok: false, error: "Targeted advertising is not available for this race." };
  }
  if (!election.candidates.some((candidate) => candidate.id === "player")) {
    return { ok: false, error: "File candidacy in this race before buying targeted ads." };
  }

  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign) return { ok: false, error: "No active campaign for this race." };
  if (campaign.status !== "active") return { ok: false, error: "Campaign is archived and read-only." };

  const activeRegion = election.state ?? campaign.countryId;
  if (regionId !== activeRegion) {
    return { ok: false, error: "Targeted ads are only available in the campaign's active region." };
  }

  const categories = world.demographicCategories[campaign.countryId] ?? [];
  const category = categories.find((candidateCategory) => candidateCategory._id === demographicCategory);
  const group = category?.groups.find((candidateGroup) => candidateGroup.id === demographicGroup);
  const state = world.stateDemographics[regionId];
  const target = group && state?.groups[group.id];
  if (!category || !group || !target) {
    return { ok: false, error: "Unknown campaign demographic target." };
  }

  const key = targetKey(demographicCategory, demographicGroup);
  const current = campaign.targetedAdModifiers?.[key] ?? 0;
  if (current >= CAMPAIGN_TARGETED_AD_CAP - 1e-10) {
    return { ok: false, error: "This demographic target is already at the ad bonus cap." };
  }
  const next = Math.min(CAMPAIGN_TARGETED_AD_CAP, Math.max(0, current) + CAMPAIGN_TARGETED_AD_BOOST);
  campaign.targetedAdModifiers = { ...(campaign.targetedAdModifiers ?? {}), [key]: next };

  return { ok: true, message: `Bought targeted ads for ${group.name} voters in ${regionId}.` };
}

/** Source targeted-ad exposure decay: the nominal bonus halves every 24 turns. */
export function decayCampaignTargetedAdModifiers(
  modifiers: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!modifiers) return undefined;
  const next = Object.fromEntries(Object.entries(modifiers)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => {
      const decayed = value * 2 ** (-1 / CAMPAIGN_TARGETED_AD_HALF_LIFE);
      return [key, Math.abs(decayed) < 0.0001 ? 0 : decayed];
    })
    .filter(([, value]) => value !== 0));
  return Object.keys(next).length > 0 ? next : undefined;
}
