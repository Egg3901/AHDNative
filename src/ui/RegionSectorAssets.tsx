/**
 * RegionSectorAssets: region-scoped corporate-sector ownership and For Sale
 * inventory for one region detail (issue #299).
 *
 * Source: the recorded markets projection only. Each row is a MarketListing
 * whose `sectorAsset.regionId` equals the selected region id — the engine's
 * CorporateSectorAsset.stateId joined against the region table on read
 * (markets.ts projectSectorAsset). Ownership, workers, union, and for-sale
 * state render verbatim from that projection. The sale controls shared with
 * company detail dispatch list/update/unlist/buy to the same session commands,
 * so the regional flow preserves shareholder, cash, and ownership gates.
 *
 * National assets (stateId null) belong to the country scope and stay in the
 * Sectors directory and Markets detail — this card never claims them. Fresh
 * worlds seed every asset national, so the card honestly reports no regional
 * sectors until a save records a regional split.
 *
 * Layout follows the sector directory rows: column flex, wrapping action row,
 * 44px minimum touch targets, anywhere wrapping for long ids. Safe at 320px,
 * 390px with Dynamic Island clearance, and desktop widths; jsdom performs no
 * layout, so the viewport tests pin identical content and containment styles.
 */
import type { MarketListing } from "../game/markets";
import type { GameScreenProps } from "../game/types";
import { formatFinanceMoney } from "./FinancePanel";
import { SectorSaleControls } from "./MarketsPanel";

/**
 * Regional assets recorded for one region, sorted by sector label. Pure view
 * logic over the recorded projection: no ownership math, no invented rows.
 */
export function selectRegionSectorAssets(
  listings: MarketListing[],
  regionId: string,
): MarketListing[] {
  return listings
    .flatMap((listing) => [listing.sectorAsset, ...(listing.sectorAssets ?? [])].filter((asset) => asset.recorded !== false).map((asset) => ({
      ...listing,
      sectorType: asset.sectorType,
      sectorLabel: asset.sectorType,
      sectorAsset: asset,
    })))
    .filter((listing) => listing.sectorAsset.regionId === regionId)
    .sort(
      (a, b) =>
        a.sectorLabel.localeCompare(b.sectorLabel) || a.id.localeCompare(b.id),
    );
}

export interface RegionSectorAssetsProps {
  regionId: string;
  regionName: string;
  /** Recorded markets projection; the card selects its own regional rows. */
  listings: MarketListing[];
  playerCash: number;
  busy: boolean;
  onSectorSale?: GameScreenProps["onSectorSale"];
  /** Opens the linked company detail (the existing markets destination). */
  onOpenCompany?: (listingId: string) => void;
}

export function RegionSectorAssetsCard({
  regionId,
  regionName,
  listings,
  playerCash,
  busy,
  onSectorSale,
  onOpenCompany,
}: RegionSectorAssetsProps) {
  const assets = selectRegionSectorAssets(listings, regionId);
  const forSaleCount = assets.filter(
    (listing) => listing.sectorAsset.forSale != null,
  ).length;
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Corporate sectors</h2>
      <p className="ahd-muted" style={{ margin: "0.3rem 0 0", fontSize: "0.72rem" }}>
        {assets.length === 0
          ? `No corporate sectors are recorded for ${regionName}. National assets appear in the Sectors directory.`
          : `${assets.length} regional ${assets.length === 1 ? "sector" : "sectors"} recorded for ${regionName} · ${forSaleCount} for sale.`}
      </p>
      {assets.length === 0 ? (
        <div className="ahd-empty" style={{ marginTop: "0.6rem" }}>
          No regional sector assets recorded for this region.
        </div>
      ) : (
        <ul
          aria-label={`Corporate sectors recorded for ${regionName}`}
          style={{
            listStyle: "none",
            margin: "0.6rem 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.55rem",
          }}
        >
          {assets.map((listing) => {
            const asset = listing.sectorAsset;
            const ownedByPlayer = asset.owner === "player";
            return (
              <li
                key={asset.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  minWidth: 0,
                  borderTop: "1px solid var(--ahd-border)",
                  paddingTop: "0.55rem",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                  <span style={{ minWidth: 0, overflowWrap: "normal", wordBreak: "normal" }}>
                    <strong>{listing.sectorLabel}</strong>{" "}
                    <span className="ahd-muted">{listing.name}</span>
                  </span>
                  <span
                    className="ahd-mono"
                    style={{ fontSize: "0.78rem", whiteSpace: "normal", overflowWrap: "anywhere" }}
                  >
                    {formatFinanceMoney(listing.revenue, listing.currency)}/day
                  </span>
                </div>
                <span
                  style={{
                    display: "flex",
                    gap: "0.65rem",
                    flexWrap: "wrap",
                    fontSize: "0.74rem",
                  }}
                >
                  <span>{ownedByPlayer ? "Owned by you" : `Owned by ${listing.name}`}</span>
                  {listing.playerShares > 0 ? (
                    <span>
                      You hold {listing.playerShares.toLocaleString("en-US")} {listing.playerShares === 1 ? "share" : "shares"}
                    </span>
                  ) : null}
                  <span>
                    Workers:{" "}
                    <span className="ahd-mono">
                      {asset.workers.toLocaleString("en-US")}
                    </span>
                  </span>
                  <span>
                    {asset.unionName ? `Union: ${asset.unionName}` : "No union recorded"}
                  </span>
                  <span>
                    {asset.forSale ? (
                      <>
                        For sale:{" "}
                        <span className="ahd-mono">
                          {formatFinanceMoney(asset.forSale.priceAnchor, listing.currency)}
                        </span>
                      </>
                    ) : (
                      "Not for sale"
                    )}
                  </span>
                </span>
                <span style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  {onOpenCompany ? (
                    <button
                      type="button"
                      className="ahd-btn ahd-btn-sm"
                      style={{ minHeight: 44 }}
                      onClick={() => onOpenCompany(listing.id)}
                      aria-label={`View ${listing.name} company`}
                    >
                      View company
                    </button>
                  ) : null}
                </span>
                <SectorSaleControls
                  listing={listing}
                  playerCash={playerCash}
                  busy={busy}
                  onSectorSale={onSectorSale}
                  showBuy={asset.forSale != null}
                  labelSuffix={` (${listing.ticker})`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
