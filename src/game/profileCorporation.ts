/**
 * Player CEO/sector-owner entries for Native Profile (#51).
 *
 * Reference (AHDGame e364c049 src/app/profile/page.tsx + components/
 * CeoCorporationCard.tsx): the profile shows a corporation card gated on a
 * recorded CEO relationship — `corporations.findOne({ ceoId: character._id,
 * ceoVacant: { $ne: true } })` — and links it to `/corporation/[id]`. Share
 * holdings play no part in that gate: the reference never infers CEO status
 * from shares, so neither does this projection.
 *
 * Native records the solo player's CEO identity as `ceoId: "player"`, with
 * explicit vacancy, shareholder vote, acceptance and resignation transitions.
 * Corporation turns also settle recorded CEO salary and shareholder dividends.
 * The same MarketListing projection used by company detail supplies issuer,
 * quote, holder and last-turn cash outputs. Share ownership alone never
 * implies CEO status.
 */
import type { WorldState } from "@ahdclient/engine";
import { projectMarkets, type MarketListing } from "./markets";

/**
 * One player CEO/sector-owner entry for the Profile card. A narrowed view of
 * the Markets company-detail projection (`MarketListing`), with explicit role
 * mapping and recorded per-turn payout values. CEO status is never inferred
 * from share control.
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
  role: "ceo" | "sector owner" | "ceo and sector owner";
  ceoSalaryPerTurn: number;
  dividendIncomePerTurn: number;
  /** Recorded asset scope verbatim. */
  scope: MarketListing["sectorAsset"]["scope"];
  /** Recorded region name for a regional asset; null for national assets. */
  regionName: MarketListing["sectorAsset"]["regionName"];
};

function toEntry(listing: MarketListing): ProfileCorporationEntry {
  const ceo = listing.ceoId === "player" && listing.ceoVacant !== true;
  const owner = listing.sectorAsset.owner === "player";
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
    role: ceo && owner ? "ceo and sector owner" : ceo ? "ceo" : "sector owner",
    ceoSalaryPerTurn: ceo ? (listing.lastCeoSalaryPaid ?? 0) : 0,
    dividendIncomePerTurn: listing.lastPlayerDividendPaid ?? 0,
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
    .listings.filter((listing) =>
      listing.sectorAsset.owner === "player" || (listing.ceoId === "player" && listing.ceoVacant !== true),
    )
    .map(toEntry);
}
