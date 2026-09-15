/**
 * Player-owned corporation entries for the Native Profile (#51).
 *
 * Reference (AHDGame e364c049 at src/app/profile/page.tsx + components/
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
 * detail renders — mapped to the card fields. A player who merely holds
 * shares is not an owner and gets no card, matching the reference's refusal
 * to infer authority from share counts.
 *
 * Salary and dividends are deliberately absent: the engine has no dividend
 * system and routing operating income to the player owner is explicitly out
 * of scope (corporateSectorAssets.ts), so neither the company detail nor
 * this card can show them. Every value here is a verbatim copy of the
 * listing the company detail shows, except `marketValue`, which multiplies
 * the two recorded fields (`sharePrice * totalShares`) exactly as the
 * sector directory's per-currency market value does.
 */
import type { WorldState } from "@ahdclient/engine";
import { projectMarkets } from "./markets";

/**
 * One player-owned corporation for the Profile card. Every field copies the
 * Markets company-detail projection (`MarketListing`); nothing is derived
 * beyond `marketValue` (see module doc).
 */
export interface ProfileCorporationEntry {
  /** Corporation id — also the display name (the engine records no authored company name). */
  id: string;
  ticker: string;
  name: string;
  countryId: string;
  countryName: string;
  sectorType: string;
  sectorLabel: string;
  currency: string;
  sharePrice: number;
  totalShares: number;
  /** Recorded share price times recorded total shares, in `currency`. */
  marketValue: number;
  /** Recorded corporate treasury (`liquidCapital`), in `currency`. */
  liquidCapital: number;
  /** Recorded per-turn revenue, in `currency`. */
  revenue: number;
  playerShares: number;
  playerAvgCostPerShare: number | null;
  /** Recorded asset scope verbatim. */
  scope: "national" | "regional";
  /** Recorded region name for a regional asset; null for national assets. */
  regionName: string | null;
}

/**
 * Player-owned corporation entries, projected from the same listings the
 * Markets route renders. Empty for ordinary players (no recorded sector
 * acquisition), so the Profile omits the card entirely.
 */
export function projectProfileCorporations(world: WorldState): ProfileCorporationEntry[] {
  const markets = projectMarkets(world);
  return markets.listings
    .filter((listing) => listing.sectorAsset.owner === "player")
    .map((listing) => ({
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
      marketValue: Math.round(listing.sharePrice * listing.totalShares * 100) / 100,
      liquidCapital: listing.liquidCapital,
      revenue: listing.revenue,
      playerShares: listing.playerShares,
      playerAvgCostPerShare: listing.playerAvgCostPerShare,
      scope: listing.sectorAsset.scope,
      regionName: listing.sectorAsset.regionName,
    }));
}
