import type { WorldState } from "../types.js";
import { anchorToLocal, getRateForCountry } from "../forex/conversion.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { mergeCorporateSectorPhysicalLedger } from "./physicalAssetMerge.js";

/**
 * Corporate-sector acquisition (#295), sourced from AHDGame's
 * corporations/commands/sectorOperations/buyListedSector.ts. A buyer CEO
 * authorizes the purchase, buyer and seller corporate cash are converted from
 * the recorded anchor price into their own local currencies, and the asset is
 * transferred to the buyer with its host-region identity intact.
 *
 * Native's issuer economics remain aggregate: this ownership transfer does
 * not reallocate issuer-wide revenue or turn costs. Sector workers, region,
 * union representation and other asset state remain attached to the asset.
 */
export interface SectorAcquireResult {
  ok: boolean;
  error?: string;
  priceAnchor?: number;
  merged?: boolean;
}

/** Buy a listed sector. All failure paths return before any world mutation. */
export function buyCorporateSectorForSale(
  world: WorldState,
  assetId: string,
  buyerCorporationId: string,
): SectorAcquireResult {
  const asset = corporateSectorAssets(world)[assetId];
  if (!asset) return { ok: false, error: `Sector listing not found: ${assetId}` };
  if (asset.owner === "player") return { ok: false, error: `You already own this sector: ${asset.id}` };
  if (!asset.forSale) return { ok: false, error: `Sector is not currently listed for sale: ${asset.id}` };
  const price = asset.forSale.priceAnchor;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Listing price is invalid; ask the seller to relist." };
  }

  const seller = world.corporations[asset.corporationId];
  if (!seller) return { ok: false, error: `Seller corporation not found: ${asset.corporationId}` };
  const buyer = world.corporations[buyerCorporationId];
  if (!buyer) return { ok: false, error: `Buyer corporation not found: ${buyerCorporationId}` };
  if (buyer.id === seller.id) return { ok: false, error: "A corporation cannot buy its own sector." };
  if (buyer.ceoId !== "player" || buyer.ceoVacant === true) {
    return { ok: false, error: "You must be the active CEO of the buying corporation." };
  }
  if (!privateEnterprisePermittedInCountry(world, asset.countryId)) {
    return { ok: false, error: "This market is state-controlled under a command economy and is closed to private sector expansion." };
  }

  const buyerDebit = Math.round(anchorToLocal(price, getRateForCountry(world, buyer.countryId)));
  const sellerCredit = Math.round(anchorToLocal(price, getRateForCountry(world, seller.countryId)));
  if (buyer.liquidCapital < buyerDebit) {
    return { ok: false, error: `Insufficient corporate funds. Need ${buyerDebit} to purchase this sector.` };
  }

  const assets = corporateSectorAssets(world);
  const existingBuyerAsset = Object.values(assets).find((candidate) => candidate.id !== asset.id
    && candidate.corporationId === buyer.id
    && candidate.countryId === asset.countryId
    && candidate.stateId === asset.stateId
    && candidate.sectorType === asset.sectorType);
  const mergedWorkers = existingBuyerAsset ? existingBuyerAsset.workers + asset.workers : undefined;
  const mergedUnionization = existingBuyerAsset
    ? (existingBuyerAsset.unionization ?? 0) * existingBuyerAsset.workers / mergedWorkers!
      + (asset.unionization ?? 0) * asset.workers / mergedWorkers!
    : undefined;

  // Validation is complete. Update both corporate ledgers and the asset as one
  // synchronous world mutation, preserving the source sector's host identity.
  buyer.liquidCapital -= buyerDebit;
  seller.liquidCapital += sellerCredit;
  if (existingBuyerAsset) {
    existingBuyerAsset.workers = mergedWorkers!;
    existingBuyerAsset.unionization = mergedUnionization!;
    mergeCorporateSectorPhysicalLedger(existingBuyerAsset, asset);
    existingBuyerAsset.representingUnionId ??= asset.representingUnionId;
    if (existingBuyerAsset.strikeStartedAtTurn == null && asset.strikeStartedAtTurn !== undefined) {
      existingBuyerAsset.strikeStartedAtTurn = asset.strikeStartedAtTurn;
    }
    existingBuyerAsset.strikeCooldownUntilTurn = Math.max(existingBuyerAsset.strikeCooldownUntilTurn ?? 0, asset.strikeCooldownUntilTurn ?? 0) || null;
    delete assets[asset.id];
    return { ok: true, priceAnchor: price, merged: true };
  }
  asset.corporationId = buyer.id;
  asset.forSale = null;
  asset.owner = "corporation";
  return { ok: true, priceAnchor: price, merged: false };
}
