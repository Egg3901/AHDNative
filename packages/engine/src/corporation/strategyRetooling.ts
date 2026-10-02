/**
 * CEO-directed sector strategy changes, ported from AHDGame's
 * `setSectorStrategy` command and `getEffectiveStrategyRates` (cb66acdf).
 * Values in the market book are lagged, exactly as the source command reads.
 */
import type { WorldState } from "../types.js";
import { DAYS_PER_TURN } from "../calendar.js";
import { EXTRACTABLE_RESOURCES, type CommodityType } from "../commodity/constants.js";
import {
  corporateSectorAssets,
  type CorporateSectorAsset,
} from "./corporateSectorAssets.js";
import {
  capacityPricePerUnitAnchor,
  corporateSectorBasePrices,
  getSectorStrategy,
  hasSectorStrategy,
  SECTOR_STRATEGIES,
} from "./plantCapacity.js";
import { isBaselineSourceStrategyAvailable } from "./sourceStrategyTechAvailability.js";

export const STRATEGY_TRANSITION_TURNS = 12;
export const STRATEGY_COOLDOWN_TURNS = 24;
export const STRATEGY_RETOOL_COST_FRACTION = 0.25;
const SHORTAGE_RETOOL_SD_THRESHOLD = 0.5;
const SHORTAGE_RETOOL_MIN_RATE = 0.1;
const SHORTAGE_TRANSITION_HEADSTART = 6;
export const STRATEGY_SHIFT_MARGIN_TRIGGER = -3;
export const STRATEGY_SHIFT_MIN_ADVANTAGE = 0.08;
export const STRATEGY_SHIFT_PROFIT_SEEK_ADVANTAGE = 0.25;

export interface EffectiveExtractionStrategyRates {
  supply: Partial<Record<CommodityType, number>>;
  demand: Partial<Record<CommodityType, number>>;
  isTransitioning: boolean;
  progress: number;
}

/** The source's sorted, four-decimal linear blend at a given world turn. */
export function effectiveSectorStrategyRates(
  asset: Pick<CorporateSectorAsset, "sectorType" | "strategyId" | "transitionFromStrategyId" | "transitionStartTurn">,
  currentTurn: number,
): EffectiveExtractionStrategyRates {
  const target = getSectorStrategy(asset.sectorType, asset.strategyId);
  const fromId = asset.transitionFromStrategyId;
  if (!fromId || asset.transitionStartTurn === undefined) {
    return { supply: { ...target.supply }, demand: { ...target.demand }, isTransitioning: false, progress: 1 };
  }
  const source = getSectorStrategy(asset.sectorType, fromId);
  const progress = Math.min(1, Math.max(0, (currentTurn - asset.transitionStartTurn) / STRATEGY_TRANSITION_TURNS));
  if (progress >= 1) {
    return { supply: { ...target.supply }, demand: { ...target.demand }, isTransitioning: false, progress: 1 };
  }
  return {
    supply: blendRates(source.supply, target.supply, progress),
    demand: blendRates(source.demand, target.demand, progress),
    isTransitioning: true,
    progress,
  };
}

/** Kept as a compatibility name for existing extraction source-vector callers. */
export const effectiveExtractionStrategyRates = effectiveSectorStrategyRates;

/**
 * Source retooling converts owned stock to target-strategy units once. During
 * the transition the sector operates that stock against the blended recipe,
 * preserving paid/nameplate value instead of minting extra capacity.
 */
export function effectiveSectorCapacity(
  asset: CorporateSectorAsset,
  basePrices: Partial<Record<CommodityType, number>>,
  currentTurn: number,
): number {
  const ownedStock = Math.max(0, asset.capitalStock ?? 0);
  if (asset.retoolRescaleApplied !== true || !asset.transitionFromStrategyId) return ownedStock;
  const effective = effectiveExtractionStrategyRates(asset, currentTurn);
  if (!effective.isTransitioning) return ownedStock;
  const effectiveYield = yieldFor(effective.supply, basePrices);
  const target = getSectorStrategy(asset.sectorType, asset.strategyId);
  const targetYield = yieldFor(target.supply, basePrices);
  const ratio = effectiveYield > 0 && targetYield > 0 ? effectiveYield / targetYield : 1;
  return Number.isFinite(ratio) && ratio > 0 ? ownedStock * ratio : ownedStock;
}

/** Kept as a compatibility name for existing extraction callers. */
export const effectiveExtractionCapacity = effectiveSectorCapacity;

/** Source's per-asset −5 margin points, linearly scaled by transition progress. */
export function strategyTransitionMarginModifier(world: WorldState, corporationId: string): number {
  const corporationAssets = Object.values(corporateSectorAssets(world)).filter(asset => asset.corporationId === corporationId);
  let modifierWeighted = 0;
  let revenueWeight = 0;
  for (const asset of corporationAssets) {
    if (!asset.transitionFromStrategyId || asset.transitionStartTurn === undefined) continue;
    const { isTransitioning, progress } = effectiveSectorStrategyRates(asset, world.meta.turn);
    if (!isTransitioning) continue;
    const weight = Math.max(0, asset.revenue ?? world.corporations[corporationId]?.revenue ?? 0);
    modifierWeighted += -5 * progress * weight;
    revenueWeight += weight;
  }
  return revenueWeight > 0 ? modifierWeighted / revenueWeight : 0;
}

type StrategyScoreView = Pick<ReturnType<typeof getSectorStrategy>, "supply" | "demand">;

/** Game strategyPriceScore: output price gains less input price penalties. */
export function sourceStrategyPriceScore(
  strategy: StrategyScoreView,
  priceRatioOf: (commodity: CommodityType) => number | null,
): number | null {
  let score = 0;
  let priced = false;
  for (const [rawCommodity, rate] of Object.entries(strategy.supply)) {
    if (typeof rate !== "number" || rate <= 0) continue;
    const ratio = priceRatioOf(rawCommodity as CommodityType);
    if (ratio === null) continue;
    score += rate * (ratio - 1);
    priced = true;
  }
  for (const [rawCommodity, rate] of Object.entries(strategy.demand)) {
    if (typeof rate !== "number" || rate <= 0) continue;
    const ratio = priceRatioOf(rawCommodity as CommodityType);
    if (ratio === null) continue;
    score -= rate * (ratio - 1);
    priced = true;
  }
  return priced ? score : null;
}

/** Exact source eight-turn cohort formula applied to Native's persisted issuer ID. */
export function sourceCorporateStrategyStaggerEligible(corporationId: string, turn: number): boolean {
  const tail = Number.parseInt(corporationId.slice(-6), 16);
  const hash = Number.isFinite(tail) ? tail : 0;
  return (hash + turn) % 8 === 0;
}

/**
 * Run Game's NPP input-squeeze strategy chooser over Native's represented
 * private NPP issuers. Native has global commodity prices only, so this reads
 * the exact source fallback used when reachable/national prices are absent;
 * it does not synthesize a country price. Research choices not represented by
 * Native remain locked, while source auto-granted baseline methods are usable.
 */
export function applyNppSourceStrategyRetools(world: WorldState): void {
  const year = Number(world.meta.date.slice(0, 4));
  const turn = world.meta.turn;
  const prices = corporateSectorBasePrices(world);
  const assets = Object.values(corporateSectorAssets(world));
  const priceRatioOf = (commodity: CommodityType): number | null => {
    const row = world.commodityPrices[commodity];
    if (!row || !(row.basePrice > 0) || !(row.globalPrice > 0) || !Number.isFinite(row.globalPrice)) return null;
    const ratio = row.globalPrice / row.basePrice;
    return Number.isFinite(ratio) ? ratio : null;
  };

  for (const corp of Object.values(world.corporations)) {
    if ((corp.ceoType ?? "npp") !== "npp" || corp.countryOwnerId || corp.suspended) continue;
    if (!sourceCorporateStrategyStaggerEligible(corp.id, turn)) continue;
    let best: { asset: CorporateSectorAsset; fromStrategyId: string; toStrategyId: string; advantage: number } | null = null;
    for (const asset of assets) {
      if (asset.corporationId !== corp.id || asset.owner === "player" || asset.sectorType === "extraction") continue;
      if (asset.transitionFromStrategyId) continue;
      if (asset.transitionCooldownUntilTurn !== undefined && turn < asset.transitionCooldownUntilTurn) continue;

      const currentStrategyId = asset.strategyId ?? "standard";
      if (!hasSectorStrategy(asset.sectorType, currentStrategyId)) continue;
      const currentScore = sourceStrategyPriceScore(getSectorStrategy(asset.sectorType, currentStrategyId), priceRatioOf);
      if (currentScore === null) continue;

      // Game uses each sector's effectiveProfitMargin here. Native currently
      // records that source output only at issuer level; use the issuer value
      // until the per-asset physical P&L writer is ported. This preserves the
      // source threshold for today's one-asset issuer model, while the missing
      // per-asset producer remains an explicit broader parity gap.
      const distressed = corp.effectiveProfitMargin <= STRATEGY_SHIFT_MARGIN_TRIGGER;
      const requiredAdvantage = distressed ? STRATEGY_SHIFT_MIN_ADVANTAGE : STRATEGY_SHIFT_PROFIT_SEEK_ADVANTAGE;
      for (const strategyId of Object.keys(SECTOR_STRATEGIES[asset.sectorType] ?? {})) {
        if (strategyId === currentStrategyId || !isBaselineSourceStrategyAvailable(asset.sectorType, strategyId, year)) continue;
        const score = sourceStrategyPriceScore(getSectorStrategy(asset.sectorType, strategyId), priceRatioOf);
        if (score === null) continue;
        const advantage = score - currentScore;
        if (advantage < requiredAdvantage) continue;
        if (best === null || advantage > best.advantage) {
          best = { asset, fromStrategyId: currentStrategyId, toStrategyId: strategyId, advantage };
        }
      }
    }
    if (!best) continue;

    const { asset, fromStrategyId, toStrategyId } = best;
    const fromPrice = capacityPricePerUnitAnchor(asset.sectorType, prices, fromStrategyId, year);
    const toPrice = capacityPricePerUnitAnchor(asset.sectorType, prices, toStrategyId, year);
    const ratio = fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 1;
    const nextStock = Math.max(0, asset.capitalStock ?? 0) * ratio;
    const nextQueue = (asset.buildQueue ?? []).map(order => ({ ...order, unitsOrdered: order.unitsOrdered * ratio }));
    if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(nextStock) || nextQueue.some(order => !Number.isFinite(order.unitsOrdered))) continue;

    asset.strategyId = toStrategyId;
    asset.transitionFromStrategyId = fromStrategyId;
    asset.transitionStartTurn = turn;
    asset.transitionCooldownUntilTurn = turn + STRATEGY_COOLDOWN_TURNS;
    asset.retoolRescaleApplied = true;
    asset.capitalStock = nextStock;
    asset.buildQueue = nextQueue;
  }
}

export type RetoolResult = { ok: true; feeLocal: number; transitionTurns: number } | { ok: false; error: string };

/** Source command eligibility, fee, unit-basis conversion and transition writer for supported domestic assets. */
export function setCorporateSectorStrategy(
  world: WorldState,
  actorId: string,
  corpId: string,
  sectorId: string,
  strategyId: string,
): RetoolResult {
  if (actorId !== "player") return { ok: false, error: "Only the active CEO may change a corporate sector strategy" };
  const corp = world.corporations[corpId];
  if (!corp) return { ok: false, error: `Unknown corporation: ${corpId}` };
  if (corp.ceoType !== "player" || corp.ceoId !== "player" || corp.ceoVacant === true) {
    return { ok: false, error: "Only the active CEO may change a corporate sector strategy" };
  }
  const asset = corporateSectorAssets(world)[sectorId];
  if (!asset || asset.corporationId !== corp.id) return { ok: false, error: "Sector not found for this corporation" };
  if (!hasSectorStrategy(asset.sectorType, strategyId)) return { ok: false, error: "Invalid strategy for this sector type" };
  const target = getSectorStrategy(asset.sectorType, strategyId);
  const currentYear = Number(world.meta.date.slice(0, 4));
  if (target.minDecade && currentYear < Number(target.minDecade)) {
    return { ok: false, error: "This production method is not available in this era yet." };
  }
  if (target.requiresTechUnlock && !isBaselineSourceStrategyAvailable(asset.sectorType, strategyId, currentYear)) {
    return { ok: false, error: "Unlock this production method in the corporate technology tree first." };
  }
  const targetSupply = target.supply;
  const currentStrategyId = asset.strategyId ?? "standard";
  if (currentStrategyId === strategyId && !asset.transitionFromStrategyId) {
    return { ok: false, error: "Already using this strategy" };
  }
  if (asset.transitionFromStrategyId) return { ok: false, error: "Already transitioning to a new strategy. Wait for completion." };
  if (asset.transitionCooldownUntilTurn !== undefined && world.meta.turn < asset.transitionCooldownUntilTurn) {
    return { ok: false, error: `Strategy change on cooldown. ${asset.transitionCooldownUntilTurn - world.meta.turn} turns remaining.` };
  }
  // The source command can bridge foreign-sector and issuer currencies with a
  // central-bank spread. Native's supported issuer aggregate is domestic;
  // refuse a cross-border asset until that fee-routing consumer is ported.
  if (asset.countryId !== corp.countryId) return { ok: false, error: "Cross-border sector retooling is not supported" };
  const resources = asset.stateId ? world.stateResourceCapacities[asset.stateId]?.resources : undefined;
  if (asset.sectorType === "extraction" && resources && !EXTRACTABLE_RESOURCES.some(resource =>
    (targetSupply[resource] ?? 0) > 0 && (resources[resource] ?? 0) > 0,
  )) {
    return { ok: false, error: "Selected extraction strategy has no matching resource deposits in this state." };
  }

  const candidateOutputs = EXTRACTABLE_RESOURCES
    .filter(resource => (targetSupply[resource] ?? 0) >= SHORTAGE_RETOOL_MIN_RATE)
    .sort((a, b) => (targetSupply[b] ?? 0) - (targetSupply[a] ?? 0));
  const shortage = candidateOutputs.some(resource => {
    const balance = world.commodityPrices[resource];
    return balance && balance.globalDemand > 0 && Math.max(0, balance.globalSupply) / balance.globalDemand < SHORTAGE_RETOOL_SD_THRESHOLD;
  });
  const feeLocal = shortage
    ? 0
    : Math.max(0, asset.revenue ?? corp.revenue) / DAYS_PER_TURN * STRATEGY_RETOOL_COST_FRACTION;
  if (![feeLocal, corp.liquidCapital].every(Number.isFinite) || corp.liquidCapital < feeLocal) {
    return { ok: false, error: "Insufficient corporation liquid capital for retooling" };
  }

  // The source converts owned units to destination RPU once, then operates
  // the stock on the blended recipe until the transition is complete.
  const basePrices = corporateSectorBasePrices(world);
  const year = Number(world.meta.date.slice(0, 4));
  const fromPrice = capacityPricePerUnitAnchor(asset.sectorType, basePrices, currentStrategyId, year);
  const toPrice = capacityPricePerUnitAnchor(asset.sectorType, basePrices, strategyId, year);
  const rescaleRatio = fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 1;
  if (!Number.isFinite(rescaleRatio) || rescaleRatio <= 0) return { ok: false, error: "Strategy capacity basis is unavailable" };
  const nextStock = (asset.capitalStock ?? 0) * rescaleRatio;
  const nextQueue = (asset.buildQueue ?? []).map(order => ({ ...order, unitsOrdered: order.unitsOrdered * rescaleRatio }));
  if (![nextStock, ...nextQueue.map(order => order.unitsOrdered)].every(Number.isFinite)) {
    return { ok: false, error: "Strategy capacity rescale is outside the supported range" };
  }

  const startTurn = world.meta.turn - (shortage ? SHORTAGE_TRANSITION_HEADSTART : 0);
  // No writes occur before all eligibility, money and rescale checks pass.
  corp.liquidCapital -= feeLocal;
  asset.strategyId = strategyId;
  asset.transitionFromStrategyId = currentStrategyId;
  asset.transitionStartTurn = startTurn;
  asset.transitionCooldownUntilTurn = world.meta.turn + STRATEGY_COOLDOWN_TURNS;
  asset.retoolRescaleApplied = true;
  asset.capitalStock = nextStock;
  asset.buildQueue = nextQueue;
  return { ok: true, feeLocal, transitionTurns: shortage ? 6 : STRATEGY_TRANSITION_TURNS };
}

function blendRates(
  from: Partial<Record<CommodityType, number>>,
  to: Partial<Record<CommodityType, number>>,
  progress: number,
): Partial<Record<CommodityType, number>> {
  const out: Partial<Record<CommodityType, number>> = {};
  for (const commodity of new Set([...Object.keys(from), ...Object.keys(to)] as CommodityType[])) {
    const value = (from[commodity] ?? 0) * (1 - progress) + (to[commodity] ?? 0) * progress;
    if (value > 0) out[commodity] = Math.round(value * 10_000) / 10_000;
  }
  return out;
}

function yieldFor(rates: Partial<Record<CommodityType, number>>, prices: Partial<Record<CommodityType, number>>): number {
  let result = 0;
  for (const [rawCommodity, rate] of Object.entries(rates)) {
    const price = prices[rawCommodity as CommodityType];
    if ((rate ?? 0) > 0 && Number.isFinite(price) && price! > 0) result += rate! / price!;
  }
  return result;
}
