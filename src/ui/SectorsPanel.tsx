/**
 * SectorsPanel: standalone sector directory route (issue #89).
 *
 * Reference: AHDGame e364c0495 src/app/sectors/page.tsx (Unowned / Owned /
 * For Sale tabs, country + sector-type filters, revenue / type / state /
 * country / margin / growth sorting with direction toggle, tab counts,
 * paging) backed by src/app/api/sectors/route.ts (state-first country
 * scope, removed-country filter clearing per ticket #1271, anchor revenue,
 * margin, growth, workers, ownership, sale state, corporation + region
 * links).
 *
 * Native grain differs and stays documented: the offline engine keeps one
 * Corporation record per (country, sectorType) plus one recorded
 * CorporateSectorAsset per corporation (#293/#299), not a per-state sector
 * roster, so each row is a MarketListing with its joined sectorAsset rather
 * than a state-level SectorRow. Every number, state flag, and link on the
 * row is read verbatim from that projection — revenue, effectiveProfitMargin,
 * currentGrowthRate, workers, owner, forSale, region join — and sorted with
 * the reference key set. No ownership math is duplicated: the Buy control
 * reuses evaluateSectorBuy, and list / update / unlist plus share trades run
 * from the linked company detail through the same #294/#295 session commands
 * the MarketsPanel detail already wires. There is no separate unowned-sector
 * roster to tab into: Unowned means no recorded player shares and no
 * player-owned asset (mirroring the markets.ts SectorSummary `owned`
 * derivation, which reads Corporation.shareholders only).
 *
 * Default context mirrors the reference: the player's country is preselected
 * when it holds listings, otherwise All countries. A removed or absorbed
 * country clears back to All with an explicit notice instead of a silent
 * empty screen (reference ticket #1271). A sector-type preselect has no
 * Native counterpart — Native records no player corporation type — so the
 * type filter always starts at All sector types.
 */
import { useEffect, useMemo, useState } from "react";
import { evaluateSectorBuy } from "../game/markets";
import { COMMODITY_HERO_ALT, RouteHero, SECTORS_LIST_HERO_IMAGE } from "./RouteHero";
import type { GameScreenProps } from "../game/types";
import type { MarketListing, MarketsView } from "../game/markets";
import { formatFinanceMoney } from "./FinancePanel";

export type SectorDirectoryView = "unowned" | "owned" | "forSale";
export type SectorDirectorySort =
  "revenue" | "type" | "state" | "country" | "margin" | "growth";
type SortDirection = "asc" | "desc";

/** Sector directory page size. Small enough to page comfortably on a phone. */
export const SECTOR_DIRECTORY_PAGE_SIZE = 8;

const VIEW_TABS: { key: SectorDirectoryView; label: string }[] = [
  { key: "unowned", label: "Unowned" },
  { key: "owned", label: "Owned" },
  { key: "forSale", label: "For Sale" },
];

const SORT_OPTIONS: { value: SectorDirectorySort; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "type", label: "Sector Type" },
  { value: "state", label: "State" },
  { value: "country", label: "Country" },
  { value: "margin", label: "Margin" },
  { value: "growth", label: "Growth" },
];

/**
 * Reference-shaped ownership split over the recorded projection. Owned means
 * a recorded player share block or a player-acquired asset (#295); every
 * other listing is unowned. Mirrors the SectorSummary `owned` derivation in
 * markets.ts — shareholders only, no invented roster.
 */
export function isSectorDirectoryOwned(listing: MarketListing): boolean {
  return listing.sectorAsset.owner === "player" || listing.playerShares > 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reference sort set (route.ts rows.sort) applied to listing-grain rows:
 * revenue on the recorded revenue, type on the sector label, state on the
 * recorded region name (national assets sort first as ""), country on the
 * recorded country name, margin/growth on the recorded unitless percentages
 * with the reference `?? 0` null handling.
 */
export function sortSectorDirectory(
  listings: MarketListing[],
  sort: SectorDirectorySort,
  dir: SortDirection,
): MarketListing[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...listings].sort((a, b) => {
    switch (sort) {
      case "type":
        return (
          a.sectorLabel.localeCompare(b.sectorLabel) * sign ||
          a.id.localeCompare(b.id)
        );
      case "state":
        return (
          (a.sectorAsset.regionName ?? "").localeCompare(
            b.sectorAsset.regionName ?? "",
          ) * sign || a.id.localeCompare(b.id)
        );
      case "country":
        return (
          a.countryName.localeCompare(b.countryName) * sign ||
          a.id.localeCompare(b.id)
        );
      case "margin":
        return (
          (finiteOrZero(a.effectiveProfitMargin) -
            finiteOrZero(b.effectiveProfitMargin)) *
            sign || a.id.localeCompare(b.id)
        );
      case "growth":
        return (
          (finiteOrZero(a.currentGrowthRate) -
            finiteOrZero(b.currentGrowthRate)) *
            sign || a.id.localeCompare(b.id)
        );
      case "revenue":
      default:
        return (
          (finiteOrZero(a.revenue) - finiteOrZero(b.revenue)) * sign ||
          a.id.localeCompare(b.id)
        );
    }
  });
}

function matchesQuery(listing: MarketListing, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    listing.sectorLabel.toLowerCase().includes(q) ||
    listing.sectorType.toLowerCase().includes(q) ||
    listing.ticker.toLowerCase().includes(q) ||
    listing.name.toLowerCase().includes(q) ||
    listing.countryName.toLowerCase().includes(q) ||
    listing.countryId.toLowerCase().includes(q) ||
    (listing.sectorAsset.regionName ?? "").toLowerCase().includes(q)
  );
}

/** Percent cell; em dash when the engine records no value. */
function formatSectorPercent(value: number | null, signed: boolean): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${signed && rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

function SectorRow({
  listing,
  playerCash,
  busy,
  onSectorSale,
  onOpenCompany,
  onOpenRegion,
}: {
  listing: MarketListing;
  playerCash: number;
  busy: boolean;
  onSectorSale?: GameScreenProps["onSectorSale"];
  onOpenCompany: (listingId: string) => void;
  onOpenRegion: (regionId: string) => void;
}) {
  const owned = isSectorDirectoryOwned(listing);
  const asset = listing.sectorAsset;
  const forSale = asset.forSale;
  const buyEval = evaluateSectorBuy(listing, { playerCash });
  // Fail closed: an enabled-looking Buy must always reach the session command.
  const buyDisabled = busy || !buyEval.available || onSectorSale == null;
  const regionId = asset.regionId;
  return (
    <li
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.3rem",
        minWidth: 0,
        borderTop: "1px solid var(--ahd-border)",
        paddingTop: "0.55rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.5rem",
          minWidth: 0,
        }}
      >
        <span
          style={{ minWidth: 0, flex: "1 1 auto", overflowWrap: "anywhere" }}
        >
          <strong>{listing.sectorLabel}</strong>{" "}
          <span className="ahd-muted">
            {asset.regionName ?? "National"} · {listing.countryName}
          </span>
        </span>
        <span
          className="ahd-mono"
          style={{ fontSize: "0.78rem", whiteSpace: "nowrap", flexShrink: 0 }}
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
        <span>
          Margin:{" "}
          <span className="ahd-mono">
            {formatSectorPercent(listing.effectiveProfitMargin, false)}
          </span>
        </span>
        <span>
          Growth:{" "}
          <span className="ahd-mono">
            {formatSectorPercent(listing.currentGrowthRate, true)}/yr
          </span>
        </span>
        <span>
          Workers:{" "}
          <span className="ahd-mono">
            {asset.workers.toLocaleString("en-US")}
          </span>
        </span>
        <span>
          {asset.owner === "player"
            ? "Owned by you"
            : listing.playerShares > 0
              ? `You hold ${listing.playerShares.toLocaleString("en-US")} ${listing.playerShares === 1 ? "share" : "shares"}`
              : "Unowned"}
        </span>
        <span>
          {forSale ? (
            <>
              For sale:{" "}
              <span className="ahd-mono">
                {formatFinanceMoney(forSale.priceAnchor, listing.currency)}
              </span>
            </>
          ) : (
            "Not for sale"
          )}
        </span>
      </span>
      <span style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="ahd-btn ahd-btn-sm"
          style={{ minHeight: 44 }}
          onClick={() => onOpenCompany(listing.id)}
          aria-label={`View ${listing.name} company`}
        >
          View company
        </button>
        {regionId ? (
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            style={{ minHeight: 44 }}
            onClick={() => onOpenRegion(regionId)}
            aria-label={`View ${asset.regionName ?? regionId} region`}
          >
            View region
          </button>
        ) : (
          <span
            className="ahd-muted"
            style={{ fontSize: "0.74rem", alignSelf: "center" }}
          >
            National asset · no region recorded
          </span>
        )}
      </span>
      {forSale ? (
        <span
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
        >
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            style={{ minHeight: 44, alignSelf: "flex-start" }}
            onClick={() => onSectorSale?.("buy", { assetId: asset.id })}
            disabled={buyDisabled}
            aria-disabled={buyDisabled}
            aria-label={`Buy ${listing.sectorLabel} sector (${listing.ticker})`}
          >
            Buy sector
          </button>
          {buyEval.available && onSectorSale ? (
            <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>
              Asking{" "}
              {formatFinanceMoney(buyEval.priceAnchor ?? 0, listing.currency)} ·
              No action-point cost
            </span>
          ) : (
            <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>
              {onSectorSale == null && buyEval.available
                ? "Sector purchase is unavailable in this view."
                : buyEval.disabledReason}
            </span>
          )}
        </span>
      ) : null}
      {!owned ? (
        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>
          Share purchases and sale listings run from the company detail through
          the same engine commands.
        </span>
      ) : null}
    </li>
  );
}

export interface SectorsPanelProps {
  markets: MarketsView;
  busy: boolean;
  onSectorSale?: GameScreenProps["onSectorSale"];
  /** Opens the linked company detail (the existing markets destination). */
  onOpenCompany: (listingId: string) => void;
  /** Opens the linked region detail (the existing regions destination). */
  onOpenRegion: (regionId: string) => void;
}

export function SectorsPanel({
  markets,
  busy,
  onSectorSale,
  onOpenCompany,
  onOpenRegion,
}: SectorsPanelProps) {
  const [view, setView] = useState<SectorDirectoryView>("unowned");
  const [sort, setSort] = useState<SectorDirectorySort>("revenue");
  const [dir, setDir] = useState<SortDirection>("desc");
  // Default context: the player's own country, mirroring AHDGame's sectors
  // page (which preselects the corporation/character country). Falls back to
  // All countries when the player's country holds no listed corporations.
  const [countryId, setCountryId] = useState<string>(() =>
    markets.countries.some((country) => country.id === markets.playerCountryId)
      ? markets.playerCountryId
      : "all",
  );
  const [sectorType, setSectorType] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [removedCountryNotice, setRemovedCountryNotice] = useState<
    string | null
  >(null);

  // A country that has been removed or absorbed no longer appears in the
  // filter list, so a preselected id would render with no matching option
  // and silently empty the list. Clear it to the unfiltered world with an
  // explicit notice instead (ticket #1271 in AHDGame's sectors page).
  useEffect(() => {
    if (
      countryId !== "all" &&
      !markets.countries.some((country) => country.id === countryId)
    ) {
      setRemovedCountryNotice(
        `"${countryId}" is no longer listed — its country was removed or absorbed. Showing all countries instead.`,
      );
      setCountryId("all");
    }
  }, [markets.countries, countryId]);

  useEffect(() => {
    setPage(1);
  }, [view, sort, dir, countryId, sectorType, query]);

  const selectCountry = (id: string) => {
    setCountryId(id);
    setRemovedCountryNotice(null);
  };

  const handleViewChange = (next: SectorDirectoryView) => {
    setView(next);
    setSort("revenue");
    setDir("desc");
  };

  const sectorTypes = useMemo(() => {
    const byType = new Map<string, string>();
    for (const listing of markets.listings) {
      if (!byType.has(listing.sectorType))
        byType.set(listing.sectorType, listing.sectorLabel);
    }
    return [...byType.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort(
        (a, b) =>
          a.label.localeCompare(b.label) || a.value.localeCompare(b.value),
      );
  }, [markets.listings]);

  // Tab counts follow the reference: they respect the country filter (and the
  // sector-type filter narrowing this directory) but never the tab itself.
  const scoped = useMemo(
    () =>
      markets.listings.filter(
        (listing) =>
          (countryId === "all" || listing.countryId === countryId) &&
          (!sectorType || listing.sectorType === sectorType),
      ),
    [markets.listings, countryId, sectorType],
  );

  const counts = useMemo(
    () => ({
      unowned: scoped.filter((listing) => !isSectorDirectoryOwned(listing))
        .length,
      owned: scoped.filter((listing) => isSectorDirectoryOwned(listing)).length,
      forSale: scoped.filter((listing) => listing.sectorAsset.forSale != null)
        .length,
    }),
    [scoped],
  );

  const visible = useMemo(() => {
    const filtered = scoped.filter((listing) => {
      if (view === "owned" && !isSectorDirectoryOwned(listing)) return false;
      if (view === "unowned" && isSectorDirectoryOwned(listing)) return false;
      if (view === "forSale" && listing.sectorAsset.forSale == null)
        return false;
      return matchesQuery(listing, query);
    });
    return sortSectorDirectory(filtered, sort, dir);
  }, [scoped, view, query, sort, dir]);

  const pageCount = Math.max(
    1,
    Math.ceil(visible.length / SECTOR_DIRECTORY_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * SECTOR_DIRECTORY_PAGE_SIZE;
  const pageItems = visible.slice(start, start + SECTOR_DIRECTORY_PAGE_SIZE);

  const countryName =
    countryId === "all"
      ? null
      : (markets.countries.find((country) => country.id === countryId)?.name ??
        countryId);

  const emptyMessage =
    markets.listings.length === 0
      ? "No sectors are recorded in this world."
      : countryId !== "all" &&
          !markets.listings.some((listing) => listing.countryId === countryId)
        ? `No sectors are recorded in ${countryName}. Choose "All countries" to browse the rest of the world.`
        : view === "owned"
          ? "No owned sectors match these filters. Buy shares or a sector listing to see it here."
          : view === "forSale"
            ? "No sector listings are for sale under these filters."
            : "No unowned sectors match these filters.";

  return (
    <div className="ahd-stack">
      {/*
        Sectors list band (#378): the directory previously opened on a plain
        text card. The reference ships no dedicated sectors hero, so the band
        reuses the bundled steel-works art through `RouteHero` (reference
        image-error gradient fallback). The turn/count line rides as hero
        children in inherited white at 0.85 opacity, mirroring the Markets
        list, so contrast never depends on the muted card palette.
      */}
      <RouteHero
        image={SECTORS_LIST_HERO_IMAGE}
        alt={COMMODITY_HERO_ALT["steel"]}
        eyebrow="World"
        title="Sectors"
      >
        <p style={{ fontSize: "0.76rem", margin: "0.35rem 0 0", opacity: 0.85 }}>
          Browse every recorded corporate sector across the world. Turn{" "}
          {markets.turn} · {markets.listings.length}{" "}
          {markets.listings.length === 1 ? "listing" : "listings"}.
        </p>
      </RouteHero>

      {removedCountryNotice ? (
        <div className="ahd-card ahd-card-pad" role="note">
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: 0 }}>
            {removedCountryNotice}
          </p>
        </div>
      ) : null}

      <div
        className="ahd-card ahd-card-pad"
        style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
      >
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}
          role="group"
          aria-label="Sector views"
        >
          {VIEW_TABS.map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className="ahd-btn ahd-btn-sm"
                aria-pressed={active}
                aria-label={`${tab.label} sectors, ${counts[tab.key]}`}
                onClick={() => handleViewChange(tab.key)}
              >
                {tab.label}{" "}
                <span className="ahd-muted">({counts[tab.key]})</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <label className="ahd-field" style={{ flex: "1 1 8rem" }}>
            <span className="ahd-label">Country</span>
            <select
              className="ahd-select"
              value={countryId}
              onChange={(e) => selectCountry(e.target.value)}
              aria-label="Country"
            >
              <option value="all">All countries</option>
              {markets.countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name} ({country.currency})
                </option>
              ))}
            </select>
          </label>
          <label className="ahd-field" style={{ flex: "1 1 8rem" }}>
            <span className="ahd-label">Sector type</span>
            <select
              className="ahd-select"
              value={sectorType}
              onChange={(e) => setSectorType(e.target.value)}
              aria-label="Sector type"
            >
              <option value="">All sector types</option>
              {sectorTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="ahd-field">
          <span className="ahd-label">Search sectors</span>
          <input
            className="ahd-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sector, company, country, or region..."
            aria-label="Search sectors"
          />
        </label>

        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <label className="ahd-field" style={{ flex: "1 1 8rem" }}>
            <span className="ahd-label">Sort sectors</span>
            <select
              className="ahd-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SectorDirectorySort)}
              aria-label="Sort sectors"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
            aria-label={`Sort direction: ${dir === "asc" ? "ascending" : "descending"}`}
          >
            {dir === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      <div
        className="ahd-card ahd-card-pad"
        style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}
      >
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>
          {VIEW_TABS.find((tab) => tab.key === view)!.label} sectors
        </h3>
        {visible.length === 0 ? (
          <div className="ahd-empty">{emptyMessage}</div>
        ) : (
          <>
            <ul
              aria-label="Sectors"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}
            >
              {pageItems.map((listing) => (
                <SectorRow
                  key={listing.id}
                  listing={listing}
                  playerCash={markets.playerCash}
                  busy={busy}
                  onSectorSale={onSectorSale}
                  onOpenCompany={onOpenCompany}
                  onOpenRegion={onOpenRegion}
                />
              ))}
            </ul>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <p
                className="ahd-muted"
                style={{ fontSize: "0.72rem", margin: 0 }}
              >
                Showing {start + 1}–
                {Math.min(start + SECTOR_DIRECTORY_PAGE_SIZE, visible.length)}{" "}
                of {visible.length}{" "}
                {visible.length === 1 ? "sector" : "sectors"}
              </p>
              {pageCount > 1 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <button
                    type="button"
                    className="ahd-btn ahd-btn-sm"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    aria-label="Previous sector page"
                  >
                    ← Prev
                  </button>
                  <span className="ahd-muted" style={{ fontSize: "0.74rem" }}>
                    Page {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="ahd-btn ahd-btn-sm"
                    onClick={() =>
                      setPage(Math.min(pageCount, currentPage + 1))
                    }
                    disabled={currentPage >= pageCount}
                    aria-label="Next sector page"
                  >
                    Next →
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
        <p className="ahd-muted" style={{ fontSize: "0.72rem", margin: 0 }}>
          Ownership reflects only the shareholders recorded in world state.
          Listing, price updates, unlisting, and share trades run from the
          linked company detail through the engine&apos;s ownership commands —
          this directory never changes ownership itself.
        </p>
      </div>
    </div>
  );
}
