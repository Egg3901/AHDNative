import type { WorldState } from "../types.js";

export interface TargetedAd {
  stateId: string;
  dimension: string;
  bucket: string;
  /** Immediate nominal exposure; absent on a legacy prepaid flight. */
  bonus?: number;
  /** Per-turn exposure retained for historical prepaid flights. */
  exposure?: number;
  lastPurchaseTurn: number;
  /** Inclusive last prepaid-flight turn. */
  throughTurn?: number;
}

export interface CampaignCell {
  id: string;
  stateId: string;
  economicLean: number;
  socialLean: number;
  share: number;
  turnout: number;
  buckets: Record<string, string>;
  identities: Record<string, { economicLean: number; socialLean: number }>;
}

type Position = { economicLean: number; socialLean: number };
type AdTarget = { stateId: string; dimension: string; bucket: string };

export const AD_BONUS_CAP = 0.25;
export const AD_BOOST_PER_ACTION = 0.01;
export const AD_HALF_LIFE = 24;
export const AD_MAX_ACTIONS = 50;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function distanceSquared(a: Position, b: Position): number {
  return ((a.economicLean - b.economicLean) ** 2 + (a.socialLean - b.socialLean) ** 2) / 2;
}

function campaignFit(candidate: Position, audience: Position): number {
  return 0.2 + 0.8 * Math.exp(-distanceSquared(candidate, audience) / 18);
}

/** Project the demographic cells Native can author into Game's campaign-cell contract. */
export function campaignCellsForRegion(world: WorldState, stateId: string): CampaignCell[] {
  const demographics = world.stateDemographics[stateId];
  if (!demographics) return [];
  const categories = world.demographicCategories[demographics.countryId] ?? [];
  if (categories.length !== 1) return [];
  const turnoutRow = world.regionTurnouts[stateId];
  return categories.flatMap((category) => {
    const categoryShare = clamp(finiteOr(demographics.categoryWeights[category._id], 0), 0, 100) / 100;
    if (categoryShare === 0) return [];
    return category.groups.flatMap((group) => {
      const values = demographics.groups[group.id];
      const populationShare = clamp(finiteOr(values?.population, 0), 0, 100) / 100;
      if (populationShare === 0) return [];
      const position = {
        economicLean: finiteOr(values?.economicLean, finiteOr(group.defaultEconomicLean, 0)),
        socialLean: finiteOr(values?.socialLean, finiteOr(group.defaultSocialLean, 0)),
      };
      const campaignTurnout = turnoutRow?.campaignModifiers?.[category._id]?.[group.id];
      const legacyTurnout = turnoutRow?.modifiers[category._id]?.[group.id];
      const turnoutModifier = finiteOr(campaignTurnout, finiteOr(legacyTurnout, 0));
      const turnout = clamp(
        finiteOr(values?.turnout, finiteOr(group.defaultTurnout, 55)) + turnoutModifier,
        0,
        100,
      );
      return [{
        id: `${stateId}:${category._id}:${group.id}`,
        stateId,
        ...position,
        share: categoryShare * populationShare,
        turnout,
        buckets: { [category._id]: group.id },
        identities: { [category._id]: position },
      }];
    });
  });
}

export function adExposure(ad: TargetedAd, turn: number): number {
  if (turn < ad.lastPurchaseTurn) return 0;
  const initial = ad.bonus ?? (
    (Math.max(0, ad.exposure ?? 0) + Math.max(0, (ad.throughTurn ?? ad.lastPurchaseTurn) - ad.lastPurchaseTurn)) *
    5 * AD_BOOST_PER_ACTION
  );
  return clamp(initial, 0, AD_BONUS_CAP) * 2 ** (-(turn - ad.lastPurchaseTurn) / AD_HALF_LIFE);
}

function targetAudience(cells: CampaignCell[], dimension: string, bucket: string) {
  const members = cells.filter((cell) => cell.buckets[dimension] === bucket);
  const share = members.reduce((sum, cell) => sum + cell.share, 0);
  if (share <= 0) return null;
  const position = members.reduce(
    (mean, cell) => {
      const identity = cell.identities[dimension] ?? cell;
      return {
        economicLean: mean.economicLean + (cell.share * identity.economicLean) / share,
        socialLean: mean.socialLean + (cell.share * identity.socialLean) / share,
      };
    },
    { economicLean: 0, socialLean: 0 },
  );
  const variance = members.reduce(
    (sum, cell) => sum + (cell.share * distanceSquared(cell, position)) / share,
    0,
  );
  return { position, cohesion: 0.5 + 0.5 * Math.exp(-variance / 4.5) };
}

/** Game's source campaignResponse for Native's available one-dimension electorate cells. */
function campaignResponse(candidate: Position, cell: CampaignCell, ad: TargetedAd, audience: NonNullable<ReturnType<typeof targetAudience>>): number {
  if (cell.buckets[ad.dimension] !== ad.bucket) return 0;
  const identity = cell.identities[ad.dimension] ?? audience.position;
  const others = Object.entries(cell.identities).filter(([dimension]) => dimension !== ad.dimension);
  const conflict = others.length === 0
    ? 0
    : others.reduce((sum, [, position]) => sum + distanceSquared(identity, position), 0) / others.length;
  const agreement = 0.25 + 0.75 * Math.exp(-conflict / 12.5);
  return campaignFit(candidate, audience.position) * campaignFit(candidate, cell) * agreement * audience.cohesion;
}

/** Port of AHDGame campaignTargeting/rules.ts targetedAdBonuses. */
export function targetedAdBonuses(
  cells: CampaignCell[],
  candidate: Position,
  ads: TargetedAd[],
  stateId: string,
  turn: number,
): Record<string, number> {
  const regions = new Set(cells.map((cell) => cell.stateId).filter(Boolean));
  const active = ads
    .filter((ad) => ad.stateId === stateId || regions.has(ad.stateId))
    .map((ad) => ({ ad, audience: targetAudience(cells.filter((cell) => cell.stateId === ad.stateId), ad.dimension, ad.bucket), coverage: adExposure(ad, turn) / AD_BONUS_CAP }));
  return Object.fromEntries(cells.map((cell) => {
    let remaining = 1;
    for (const { ad, audience, coverage } of active) {
      if (cell.stateId && cell.stateId !== ad.stateId) continue;
      if (audience) remaining *= 1 - coverage * campaignResponse(candidate, cell, ad, audience);
    }
    return [cell.id, AD_BONUS_CAP * (1 - remaining)];
  }));
}

export function meanAdBonus(cells: CampaignCell[], bonuses: Record<string, number>): number {
  const pool = cells.reduce((sum, cell) => sum + cell.share * cell.turnout, 0);
  return pool > 0
    ? cells.reduce((sum, cell) => sum + cell.share * cell.turnout * (bonuses[cell.id] ?? 0), 0) / pool
    : 0;
}

export function campaignPrimaryScore(score: number, bonus: number, temperature: number): number {
  return score + temperature * Math.log1p(clamp(bonus, 0, AD_BONUS_CAP));
}

export function currentAdBonus(ads: TargetedAd[], target: AdTarget, turn: number): number {
  const previous = ads.find((ad) => ad.stateId === target.stateId && ad.dimension === target.dimension && ad.bucket === target.bucket);
  return previous ? adExposure(previous, turn) : 0;
}

export function planAdPurchase(ads: TargetedAd[], target: AdTarget, turn: number, count = 1): TargetedAd[] | null {
  if (!Number.isSafeInteger(count) || count < 1 || count > AD_MAX_ACTIONS) return null;
  const current = currentAdBonus(ads, target, turn);
  if (current >= AD_BONUS_CAP - 1e-10) return null;
  return [
    ...ads.filter((ad) => !(ad.stateId === target.stateId && ad.dimension === target.dimension && ad.bucket === target.bucket) && adExposure(ad, turn) >= 0.00001),
    { ...target, bonus: Math.min(AD_BONUS_CAP, current + AD_BOOST_PER_ACTION * count), lastPurchaseTurn: turn },
  ];
}

export function targetedAdBonusByGroup(
  world: WorldState,
  stateId: string,
  candidate: Position,
  ads: TargetedAd[],
  turn: number,
): Record<string, number> {
  const cells = campaignCellsForRegion(world, stateId);
  const alignedCandidate = {
    economicLean: finiteOr(candidate.economicLean, 0),
    socialLean: finiteOr(candidate.socialLean, 0),
  };
  const bonuses = targetedAdBonuses(cells, alignedCandidate, ads, stateId, turn);
  const weighted = new Map<string, { total: number; weight: number }>();
  for (const cell of cells) {
    const groupId = Object.values(cell.buckets)[0];
    if (!groupId) continue;
    const weight = cell.share * cell.turnout;
    const entry = weighted.get(groupId) ?? { total: 0, weight: 0 };
    entry.total += (bonuses[cell.id] ?? 0) * weight;
    entry.weight += weight;
    weighted.set(groupId, entry);
  }
  return Object.fromEntries([...weighted].map(([groupId, entry]) => [groupId, entry.weight > 0 ? entry.total / entry.weight : 0]));
}

export function validateTargetedAds(value: unknown, path: string, world?: WorldState): asserts value is TargetedAd[] {
  if (!Array.isArray(value)) throw new Error(`Invalid targetedAds at ${path}`);
  const seen = new Set<string>();
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid targeted ad at ${path}.${index}`);
    const ad = raw as Record<string, unknown>;
    const allowedKeys = ["bonus", "bucket", "dimension", "exposure", "lastPurchaseTurn", "stateId", "throughTurn"];
    if (Object.keys(ad).some((key) => !allowedKeys.includes(key)) ||
      typeof ad.stateId !== "string" || !ad.stateId ||
      typeof ad.dimension !== "string" || !ad.dimension ||
      typeof ad.bucket !== "string" || !ad.bucket ||
      !Number.isSafeInteger(ad.lastPurchaseTurn) || (ad.lastPurchaseTurn as number) < 0) {
      throw new Error(`Invalid targeted ad at ${path}.${index}`);
    }
    if ((ad.bonus !== undefined && (typeof ad.bonus !== "number" || !Number.isFinite(ad.bonus) || ad.bonus < 0 || ad.bonus > AD_BONUS_CAP)) ||
      (ad.exposure !== undefined && (typeof ad.exposure !== "number" || !Number.isFinite(ad.exposure) || ad.exposure < 0)) ||
      (ad.throughTurn !== undefined && (!Number.isSafeInteger(ad.throughTurn) || (ad.throughTurn as number) < (ad.lastPurchaseTurn as number)))) {
      throw new Error(`Invalid targeted ad exposure at ${path}.${index}`);
    }
    const key = `${ad.stateId}:${ad.dimension}:${ad.bucket}`;
    if (seen.has(key)) throw new Error(`Duplicate targeted ad at ${path}.${index}`);
    seen.add(key);
    if (world) {
      const state = world.regions[ad.stateId as string];
      const category = (world.demographicCategories[world.player.countryId] ?? []).find((row) => row._id === ad.dimension);
      const group = category?.groups.find((row) => row.id === ad.bucket);
      if (state?.countryId !== world.player.countryId || !group || !world.stateDemographics[ad.stateId as string]?.groups[group.id]) {
        throw new Error(`Invalid targeted ad region or audience at ${path}.${index}`);
      }
      if ((ad.lastPurchaseTurn as number) > world.meta.turn) throw new Error(`Future targeted ad purchase at ${path}.${index}`);
    }
  }
}
