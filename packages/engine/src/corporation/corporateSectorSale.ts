import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import type { WorldState } from "../types.js";
import type { ShareholderKind } from "./types.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";

/**
 * Corporate-sector sale listings and price anchors (#294).
 *
 * Reference (AHDGame e364c04954ed628beef73a993a8e9e156650a31e):
 * - Sale state: db/types/corporation.ts CorporateSector.forSale
 *   ({ listedAt, priceAnchor, npvAnchor } | null). Asking price is locked at
 *   listing time so buyers see a stable quote even if margins shift.
 * - Valuation: corporations/sectorValuation.ts computeSectorListingValuation
 *   over the corporations/sectorProfitBasis.ts profit identity
 *   (dailyProfit = revenue x margin - stored currentGrowthCost), with
 *   NPV_ANNUAL_DISCOUNT_RATE = 0.15 and SECTOR_FOR_SALE_PRICE_FRACTION = 0.75
 *   from lib/constants/corporations.ts:879-886. Loss-making sectors
 *   (no positive price) cannot be listed; the listing route enforces that
 *   explicitly (commands/sectorOperations/listSectorForSale.ts). Unlist is
 *   CEO-only and clears forSale
 *   (commands/sectorOperations/unlistSectorForSale.ts).
 * - Authority: the reference gates on requireCeo (the corporation's CEO
 *   identity). Native has no CEO user: corporations are NPC-run and ownership
 *   is only the recorded Corporation.shareholders roster (npc founder block
 *   plus the single player block, see corporation/types.ts ShareholderKind).
 *   The port therefore gates on that roster: the actor must hold a positive
 *   recorded block. Requiring the controlling block instead would dead-end
 *   the player flow (the NPC founder holds 51% while the public float is
 *   only 49%, so the player can never out-hold the founder through market
 *   purchases); any-positive-block keeps buy-a-share-then-list real and
 *   matches the SectorSummary.owned (>= 1 player share) signal the directory
 *   already uses.
 * - Annualizer: the reference annualizes DAILY revenue by
 *   GAME_DAYS_PER_YEAR = TURNS_PER_YEAR / TURNS_PER_DAY (48/24 = 2, see
 *   sectorValuation.ts and turnTime.ts "48 turns = 1 year, 1 turn = 1 week").
 *   Native stores PER-TURN (weekly game-calendar: calendar.ts DAYS_PER_TURN
 *   = 7, economy/macroConstants.ts TURNS_PER_YEAR = 48; founding.ts
 *   perTurnRevenue = annual / 48), so the corresponding annualizer is
 *   TURNS_PER_YEAR. Same discount rate and sale fraction as the reference.
 * - Margin basis: the reference quotes off the CEO-set BASE profitMargin
 *   (stable by design; effective margin is the buyer's diligence). The port
 *   does the same: Corporation.profitMargin, not effectiveProfitMargin.
 * - Persisted shape: the issue (#294) ports forSale + priceAnchor onto the
 *   existing CorporateSectorAsset record, so only priceAnchor is stored;
 *   npvAnchor is returned for transparency but not persisted. No acquisition
 *   or ownership transfer here (that is #295).
 */

export const SECTOR_SALE_NPV_ANNUAL_DISCOUNT_RATE = 0.15;
export const SECTOR_SALE_PRICE_FRACTION = 0.75;

export interface SectorSaleValuationInput {
  revenue: number;
  profitMargin: number;
  currentGrowthCost: number;
}

export interface SectorSaleValuation {
  perTurnProfitAnchor: number;
  yearlyProfitAnchor: number;
  npvAnchor: number;
  priceAnchor: number;
}

export function computeSectorSaleValuation(input: SectorSaleValuationInput): SectorSaleValuation {
  const perTurnProfitAnchor = input.revenue * (input.profitMargin / 100) - input.currentGrowthCost;
  const yearlyProfitAnchor = perTurnProfitAnchor * TURNS_PER_YEAR;
  const npvAnchor = yearlyProfitAnchor > 0 ? Math.round(yearlyProfitAnchor / SECTOR_SALE_NPV_ANNUAL_DISCOUNT_RATE) : 0;
  const priceAnchor = npvAnchor > 0 ? Math.round(npvAnchor * SECTOR_SALE_PRICE_FRACTION) : 0;
  return { perTurnProfitAnchor, yearlyProfitAnchor, npvAnchor, priceAnchor };
}

export type SectorSaleActor = ShareholderKind;

export interface SectorSaleResult {
  ok: boolean;
  error?: string;
  priceAnchor?: number;
  npvAnchor?: number;
}

function isSaleActor(actor: unknown): actor is SectorSaleActor {
  return actor === "player" || actor === "npc";
}

/** Resolve and authorize before any mutation; returns the asset id or the refusal. */
function resolveSaleAsset(
  world: WorldState,
  assetId: string,
  actor: unknown,
): { ok: true; assetId: string } | { ok: false; error: string } {
  const assets = corporateSectorAssets(world);
  const asset = assets[assetId];
  if (!asset) return { ok: false, error: `Sector listing not found: ${assetId}` };
  if (!isSaleActor(actor)) return { ok: false, error: `Unknown seller: ${String(actor)}` };
  const corporation = world.corporations[asset.corporationId];
  const holds = corporation?.shareholders.some((entry) => entry.holder === actor && entry.shares > 0) ?? false;
  if (!holds) return { ok: false, error: `Only a recorded shareholder of ${asset.corporationId} can manage its sale listing` };
  return { ok: true, assetId };
}

function liveValuation(world: WorldState, corporationId: string): SectorSaleValuation {
  const corporation = world.corporations[corporationId]!;
  return computeSectorSaleValuation({
    revenue: corporation.revenue,
    profitMargin: corporation.profitMargin,
    currentGrowthCost: corporation.currentGrowthCost,
  });
}

/**
 * List a sector at its live computed anchor. Refuses (atomically: no state
 * touched) when the asset is unknown, the actor holds no recorded shares,
 * the sector is already listed, or the computed price is not positive.
 */
export function listCorporateSectorForSale(
  world: WorldState,
  assetId: string,
  actor: SectorSaleActor,
): SectorSaleResult {
  const resolved = resolveSaleAsset(world, assetId, actor);
  if (!resolved.ok) return resolved;
  const assets = corporateSectorAssets(world);
  const asset = assets[resolved.assetId]!;
  if (asset.forSale) return { ok: false, error: `Sector listing is already for sale: ${asset.id}` };
  const valuation = liveValuation(world, asset.corporationId);
  if (!Number.isFinite(valuation.priceAnchor) || valuation.priceAnchor <= 0) {
    return { ok: false, error: `Cannot list a sector with no positive profitability. Improve base margin or reduce growth cost first` };
  }
  asset.forSale = { priceAnchor: valuation.priceAnchor };
  return { ok: true, priceAnchor: valuation.priceAnchor, npvAnchor: valuation.npvAnchor };
}

/**
 * Update a live listing: explicit positive finite price, or re-anchor from
 * live corporation state when omitted. Refusals leave the anchor untouched.
 */
export function updateCorporateSectorListing(
  world: WorldState,
  assetId: string,
  actor: SectorSaleActor,
  priceAnchor?: number,
): SectorSaleResult {
  const resolved = resolveSaleAsset(world, assetId, actor);
  if (!resolved.ok) return resolved;
  const assets = corporateSectorAssets(world);
  const asset = assets[resolved.assetId]!;
  if (!asset.forSale) return { ok: false, error: `Sector listing is not currently for sale: ${asset.id}` };
  if (priceAnchor === undefined) {
    const valuation = liveValuation(world, asset.corporationId);
    if (!Number.isFinite(valuation.priceAnchor) || valuation.priceAnchor <= 0) {
      return { ok: false, error: `Cannot re-anchor a sector with no positive profitability` };
    }
    asset.forSale = { priceAnchor: valuation.priceAnchor };
    return { ok: true, priceAnchor: valuation.priceAnchor, npvAnchor: valuation.npvAnchor };
  }
  if (typeof priceAnchor !== "number" || !Number.isFinite(priceAnchor) || priceAnchor <= 0) {
    return { ok: false, error: `Asking price must be a positive finite number` };
  }
  asset.forSale = { priceAnchor };
  return { ok: true, priceAnchor };
}

/** Clear a live listing. Refuses when the asset is unknown, unauthorized, or not listed. */
export function unlistCorporateSectorForSale(
  world: WorldState,
  assetId: string,
  actor: SectorSaleActor,
): SectorSaleResult {
  const resolved = resolveSaleAsset(world, assetId, actor);
  if (!resolved.ok) return resolved;
  const assets = corporateSectorAssets(world);
  const asset = assets[resolved.assetId]!;
  if (!asset.forSale) return { ok: false, error: `Sector listing is not currently for sale: ${asset.id}` };
  asset.forSale = null;
  return { ok: true };
}
