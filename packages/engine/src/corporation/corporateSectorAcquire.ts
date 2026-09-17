import type { WorldState } from "../types.js";
import type { ShareholderKind } from "./types.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";

/**
 * Corporate-sector acquisition and ownership transfer (#295).
 *
 * Reference (AHDGame e364c04954ed628beef73a993a8e9e156650a31e):
 * - Buy route: commands/sectorOperations/buyListedSector.ts
 *   (POST /api/corporations/[id]/sectors/[sectorId]/buy). The buyer's CEO
 *   authorizes; the buyer corp's `liquidCapital` is debited and the seller
 *   corp's credited (each converted through the anchor at live FX); sector
 *   ownership transfers to the buyer corp (merged when the buyer already
 *   operates that type in that state: revenue/workers summed, margin
 *   revenue-weighted, purchased doc deleted); `forSale` clears on transfer
 *   (db/types/corporation.ts: "cleared on unlist or when ownership
 *   transfers"); the asking price is the anchor locked at listing time; an
 *   invalid anchor refuses with "ask the seller to relist"; a raced
 *   listing (unlisted/sold mid-flight) refunds and reports 409.
 * - Listing: commands/sectorOperations/listSectorForSale.ts (CEO-only,
 *   ported in #294 against the shareholder roster instead).
 *
 * Native adaptations (nothing beyond them is ported):
 * - Buyer is the player character, not a corporation. Native has no
 *   player-run corporations and no CEO users (corporation/types.ts: corps
 *   are single-sector and NPC-run; a player-corporation surface is a later
 *   wave), so there is no buyer corp to authorize, debit, or receive the
 *   asset — and corp-to-corp transfer is structurally impossible (one
 *   aggregate corporation per country/sector, so any same-country same-type
 *   buyer IS the seller). Authority is therefore the actor kind: only
 *   "player". No shareholding in the seller is required (the reference
 *   requires none of the buyer either) and none is blocked (the reference
 *   blocks only buyer == seller, which has no Native counterpart).
 * - Funds are personal cash in a single currency. The reference converts
 *   both sides through the anchor at live FX; Native has no FX (share
 *   trades gate on cashCurrencyMatches instead — src/game/shareTrade.ts),
 *   so cross-currency purchases refuse rather than convert, and the seller
 *   corporation's `liquidCapital` is credited the exact recorded anchor.
 *   No acquisition spread exists without FX, so none is charged.
 * - Ownership is recorded on the asset (`owner: "player"`); operation stays
 *   with the recorded corporation, which remains the turn-math SSOT and
 *   keeps its revenue, workers, margin, and union state. The reference
 *   merge path has no counterpart (the player operates no sector to merge
 *   into). Routing operating income to the player owner is out of scope.
 * - Atomicity is validate-then-mutate: every refusal is returned before any
 *   field is touched, so a refused buy leaves cash, corporate capital, the
 *   listing, and ownership exactly as they were.
 */

export type SectorAcquireActor = ShareholderKind;

export interface SectorAcquireResult {
  ok: boolean;
  error?: string;
  priceAnchor?: number;
}

function homeCurrency(world: WorldState, countryId: string): string | undefined {
  return world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode;
}

/**
 * Buy a listed sector at its recorded asking price. Refuses (atomically: no
 * state touched) when the asset is unknown, the actor is not the player, the
 * player already owns the sector, the sector is not listed, the recorded
 * anchor is not a positive finite price, the seller prices in a foreign
 * currency, or personal cash cannot cover the anchor.
 */
export function buyCorporateSectorForSale(
  world: WorldState,
  assetId: string,
  actor: SectorAcquireActor,
): SectorAcquireResult {
  const assets = corporateSectorAssets(world);
  const asset = assets[assetId];
  if (!asset) return { ok: false, error: `Sector listing not found: ${assetId}` };
  if (actor !== "player") {
    return actor === "npc"
      ? { ok: false, error: `Only the player character can buy a listed sector` }
      : { ok: false, error: `Unknown buyer: ${String(actor)}` };
  }
  if (asset.owner === "player") {
    return { ok: false, error: `You already own this sector: ${asset.id}` };
  }
  if (!asset.forSale) {
    return { ok: false, error: `Sector is not currently listed for sale: ${asset.id}` };
  }
  const price = asset.forSale.priceAnchor;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return { ok: false, error: `Listing price is invalid; ask the seller to relist.` };
  }
  const corporation = world.corporations[asset.corporationId];
  const sellerCurrency = homeCurrency(world, asset.countryId);
  const playerCurrency = homeCurrency(world, world.player.countryId);
  if (sellerCurrency !== playerCurrency) {
    return {
      ok: false,
      error: `Buying a ${sellerCurrency ?? "unknown-currency"} sector with ${playerCurrency ?? "unknown-currency"} cash is not available yet.`,
    };
  }
  if (world.player.cash < price) {
    return { ok: false, error: `Insufficient cash. Need ${price} to buy this sector.` };
  }
  world.player.cash -= price;
  if (corporation) corporation.liquidCapital += price;
  asset.forSale = null;
  asset.owner = "player";
  return { ok: true, priceAnchor: price };
}
