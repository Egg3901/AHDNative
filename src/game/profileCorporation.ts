/**
 * Player-owned corporation entries for the Native Profile (#51).
 *
 * Reference (AHDGame e364c049 src/app/profile/page.tsx + components/
 * CeoCorporationCard.tsx): the profile shows a corporation card gated on a
 * recorded CEO relationship — `corporations.findOne({ ceoId: character._id,
 * ceoVacant: { $ne: true } })` — and links it to `/corporation/[id]`. Share
 * holdings play no part in that gate: the reference never infers CEO status
 * from shares, so neither does this projection.
 *
 * Native's engine records no CEO relationship at all (Corporation carries no
 * ceoId/ceoVacant fields; corps are single-sector and NPC-run — see
 * packages/engine/src/corporation/types.ts). The only real ownership state
 * the corporate stack records is the #295 sector-asset owner
 * (`CorporateSectorAsset.owner === "player"`). This projection therefore
 * lists exactly the markets-projection listings whose recorded sector asset
 * is player-owned — the same `MarketListing` objects the Markets company
 * detail renders — narrowed to the card fields. A player who merely holds
 * shares is not an owner and gets no entry, matching the reference's refusal
 * to infer authority from share counts.
 *
 * Salary and dividends are deliberately absent: the engine has no dividend
 * system and no CEO-salary flow (corporationTurn.ts runs growth/margin/costs
 * only; routing operating income to the player owner is explicitly out of
 * scope in corporateSectorAssets.ts), so neither the company detail nor this
 * card can show them. The card renders honest unavailable notes instead and
 * invents no zeros.
 */
import type { WorldState } from "@ahdclient/engine";
import { projectMarkets, type MarketListing } from "./markets";

/**
 * One player-owned corporation for the Profile card. A narrowed view of the
 * Markets company-detail projection (`MarketListing`); every field is copied
 * verbatim, nothing is derived.
 */
export type ProfileCorporationEntry = Pick<
  MarketListing,
  | "id"
  | "ticker"
  | "name"
  | "countryId"
  | "countryName"
  | "sectorType"
  | "sectorLabel"
  | "currency"
  | "sharePrice"
  | "totalShares"
  | "liquidCapital"
  | "revenue"
  | "playerShares"
  | "playerAvgCostPerShare"
  | "controllingHolder"
> & {
  /** Recorded asset scope verbatim. */
  scope: MarketListing["sectorAsset"]["scope"];
  /** Recorded region name for a regional asset; null for national assets. */
  regionName: MarketListing["sectorAsset"]["regionName"];
};

function toEntry(listing: MarketListing): ProfileCorporationEntry {
  return {
    id: listing.id,
    ticker: listing.ticker,
    name: listing.name,
    countryId: listing.countryId,
    countryName: listing.countryName,
    sectorType: listing.sectorType,
    sectorLabel: listing.sectorLabel,
    currency: listing.currency,
    sharePrice: listing.sharePrice,
    totalShares: listing.totalShares,
    liquidCapital: listing.liquidCapital,
    revenue: listing.revenue,
    playerShares: listing.playerShares,
    playerAvgCostPerShare: listing.playerAvgCostPerShare,
    controllingHolder: listing.controllingHolder,
    scope: listing.sectorAsset.scope,
    regionName: listing.sectorAsset.regionName,
  };
}

/**
 * Player-owned corporation entries, projected from the same listings the
 * Markets route renders. Empty for ordinary players (no recorded sector
 * acquisition), so the Profile omits the card entirely. Entries vanish
 * honestly when the relationship is gone: a removed corporation has no
 * listing, and a reverted owner no longer passes the filter.
 */
export function projectProfileCorporations(world: WorldState): ProfileCorporationEntry[] {
  return projectMarkets(world)
    .listings.filter((listing) => listing.sectorAsset.owner === "player")
    .map(toEntry);
}
