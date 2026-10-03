import type { WorldState } from "../types.js";
import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { AD_BONUS_CAP, planAdPurchase, type TargetedAd } from "../campaigns/targetedAds.js";

export interface TargetedAdPurchaseParams {
  regionId?: string | undefined;
  demographicCategory?: string | undefined;
  demographicGroup?: string | undefined;
  expectedRevision?: number | undefined;
}

export type TargetedAdPurchaseResult = { ok: true; message: string } | { ok: false; error: string };

export const CAMPAIGN_TARGETED_AD_FUNDS = 100;
export const CAMPAIGN_TARGETED_AD_ACTIONS = 1;
export const CAMPAIGN_TARGETED_AD_CAP = AD_BONUS_CAP;
export const CAMPAIGN_TARGETED_AD_BOOST = 0.01;
export const CAMPAIGN_TARGETED_AD_HALF_LIFE = 24;

/** Keep the old campaign-scoped ledger decay intact for already-saved worlds. */
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

function activePresidentialCandidacy(world: WorldState): boolean {
  return world.elections.some((race) =>
    race.countryId === world.player.countryId &&
    (race.electionType === "president" || race.electionType === "uachtaran") &&
    race.status === "active" &&
    race.candidates.some((candidate) => candidate.id === "player" && candidate.status !== "withdrawn" && !candidate.campaignSuspended),
  );
}

/** Game standingAdRegions: home region unless a live presidential candidacy unlocks every domestic region. */
export function standingTargetedAdRegions(world: WorldState): string[] {
  const eligible = activePresidentialCandidacy(world)
    ? Object.values(world.regions).filter((region) => region.countryId === world.player.countryId && region.id !== world.player.countryId).map((region) => region.id)
    : world.player.homeRegionId && world.regions[world.player.homeRegionId]?.countryId === world.player.countryId
      ? [world.player.homeRegionId]
      : [];
  return eligible.sort((a, b) => a.localeCompare(b));
}

/** Game campaign quote regions: home state for local races, domestic states for presidential campaigns. */
export function campaignTargetedAdRegions(
  world: WorldState,
  election: WorldState["elections"][number],
): string[] {
  if (election.electionType === "president" || election.electionType === "uachtaran") {
    return Object.values(world.regions)
      .filter((region) => region.countryId === election.countryId && region.id !== election.countryId)
      .map((region) => region.id)
      .sort((a, b) => a.localeCompare(b));
  }
  const home = world.player.homeRegionId;
  const regionId = home && world.regions[home]?.countryId === election.countryId ? home
    : election.state && world.regions[election.state]?.countryId === election.countryId ? election.state
      : null;
  return regionId ? [regionId] : [];
}

function validateTarget(world: WorldState, params: TargetedAdPurchaseParams, allowedRegions = standingTargetedAdRegions(world)) {
  const { regionId, demographicCategory, demographicGroup, expectedRevision } = params;
  if (!regionId || !demographicCategory || !demographicGroup) {
    return { ok: false as const, error: "targetedAds requires regionId, demographicCategory, and demographicGroup" };
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== (world.player.targetedAdsRevision ?? 0)) {
    return { ok: false as const, error: "The ad quote changed. Refresh before buying." };
  }
  if (!allowedRegions.includes(regionId)) {
    return { ok: false as const, error: "Target your home region. Other regions require an active presidential race." };
  }
  const category = (world.demographicCategories[world.player.countryId] ?? []).find((item) => item._id === demographicCategory);
  const group = category?.groups.find((item) => item.id === demographicGroup);
  const audience = world.stateDemographics[regionId]?.groups[demographicGroup];
  if (!category || !group || !audience || (world.demographicCategories[world.player.countryId] ?? []).every((item) =>
    !item.groups.some((candidateGroup) => candidateGroup.id === demographicGroup))) {
    return { ok: false as const, error: "Choose a recorded demographic target in this region." };
  }
  return { ok: true as const, regionId, dimension: demographicCategory, bucket: demographicGroup, groupName: group.name };
}

/** AHDGame /api/targeted-ads purchaseStandingAds, represented as one action per purchase. */
export function purchaseStandingTargetedAd(world: WorldState, params: TargetedAdPurchaseParams, allowedRegions?: string[]): TargetedAdPurchaseResult {
  const target = validateTarget(world, params, allowedRegions ?? standingTargetedAdRegions(world));
  if (!target.ok) return target;
  const ads: TargetedAd[] = world.player.targetedAds ?? [];
  const next = planAdPurchase(ads, { stateId: target.regionId, dimension: target.dimension, bucket: target.bucket }, world.meta.turn);
  if (!next) return { ok: false, error: "This demographic target is already at the ad bonus cap." };
  world.player.targetedAds = next;
  world.player.targetedAdsRevision = (world.player.targetedAdsRevision ?? 0) + 1;
  return { ok: true, message: `Bought targeted ads for ${target.groupName} voters in ${world.regions[target.regionId]?.name ?? target.regionId}.` };
}

/** Active-campaign endpoint: Game delegates human nominees to the same standing writer. */
export function campaignTargetedAd(
  world: WorldState,
  params: TargetedAdPurchaseParams & { electionId?: string | undefined },
): TargetedAdPurchaseResult {
  const { electionId, regionId } = params;
  if (!electionId) return { ok: false, error: "campaignTargetedAd requires electionId" };
  const election = world.elections.find((item) => item.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (election.status !== "active") return { ok: false, error: "Election is not active" };
  if (!isCampaignEligibleElection(election)) return { ok: false, error: "Targeted advertising is not available for this race." };
  const candidate = election.candidates.find((entry) => entry.id === "player");
  if (!candidate || candidate.status === "withdrawn") return { ok: false, error: "File candidacy in this race before buying targeted ads." };
  if (candidate.campaignSuspended) return { ok: false, error: "Your campaign is suspended. Targeted ads are unavailable." };
  const campaign = world.campaigns[campaignKey(electionId, "player")];
  if (!campaign) return { ok: false, error: "No active campaign for this race." };
  if (campaign.status !== "active") return { ok: false, error: "Campaign is archived and read-only." };
  const eligibleRegions = campaignTargetedAdRegions(world, election);
  if (!regionId || !eligibleRegions.includes(regionId)) return { ok: false, error: "Choose a region available to this campaign." };
  if (world.meta.turn < election.startTurn || world.meta.turn >= election.endTurn) {
    return { ok: false, error: "Campaign is not accepting actions." };
  }
  return purchaseStandingTargetedAd(world, params, eligibleRegions);
}

/** Historical campaign modifiers remain in their old field and keep their old decay/consumer path. */
export const LEGACY_CAMPAIGN_TARGETED_AD_CAP = AD_BONUS_CAP;
