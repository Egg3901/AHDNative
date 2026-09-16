/**
 * MarketsPanel: searchable country/company list to company detail with
 * buyShares/sellShares.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/app/country/[code]/stockmarket/components/StockList.tsx (search
 *   filter, ticker/name/price/float rows) and
 *   src/components/corporation/shares/SharePurchaseModal.tsx (integer
 *   share quantity, at-market buy/sell). No server or Next.js imports;
 *   props arrive through MarketsView. Root owns routing and onAction.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CROSS_CURRENCY_UNAVAILABLE,
  evaluateShareTrade,
  parseShareCount,
} from "../game/shareTrade";
import { SECTOR_ACQUIRE_UNAVAILABLE, SECTOR_LIST_OWNER_ONLY, parseSalePrice } from "../game/markets";
import type { MarketListing, MarketsView, SectorSummary, ShareholderKind } from "../game/markets";
import type { GameScreenProps } from "../game/types";
import { formatFinanceMoney } from "./FinancePanel";
import { useDualPaneLayout } from "./dualPane";

export interface MarketsPanelProps {
  markets: MarketsView;
  initialId?: string | null;
  onSelect?: (id: string | null) => void;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
  onSectorSale?: GameScreenProps["onSectorSale"];
}

function AvailabilityHint({ cost, available, disabledReason }: { cost: number; available: boolean; disabledReason?: string }) {
  if (!available) return <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>{disabledReason ?? "Unavailable"}</span>;
  if (cost > 0) return <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>Cost {cost} actions</span>;
  return <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>No action-point cost</span>;
}

function matchesQuery(listing: MarketListing, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    listing.name.toLowerCase().includes(q) ||
    listing.ticker.toLowerCase().includes(q) ||
    listing.sectorLabel.toLowerCase().includes(q) ||
    listing.countryName.toLowerCase().includes(q) ||
    listing.countryId.toLowerCase().includes(q)
  );
}

function matchesSector(sector: SectorSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return sector.sectorLabel.toLowerCase().includes(q) || sector.sectorType.toLowerCase().includes(q);
}

/** Sector directory page size. Small enough to page comfortably on a phone. */
const SECTOR_PAGE_SIZE = 8;

type SectorOwnership = "all" | "unowned" | "owned";
type SectorSort = "name" | "revenue" | "margin" | "growth";
type SortDirection = "asc" | "desc";

/**
 * Ordering key for the Revenue sort. Sums the sector's recorded per-currency
 * revenues so sectors can be ranked; it is never displayed and performs no
 * currency conversion (Native has no FX/anchor system, so a sector that spans
 * currencies keeps its revenue split per currency in `values`).
 */
function sectorRevenueRank(sector: SectorSummary): number {
  return sector.values.reduce((sum, value) => sum + value.revenue, 0);
}

/** Reference-shaped sector sort: revenue / margin / growth / label, with a direction toggle. */
function sortSectors(sectors: SectorSummary[], sort: SectorSort, dir: SortDirection): SectorSummary[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...sectors].sort((a, b) => {
    switch (sort) {
      case "revenue":
        return (sectorRevenueRank(a) - sectorRevenueRank(b)) * sign || a.sectorLabel.localeCompare(b.sectorLabel);
      case "margin":
        return ((a.marginPct ?? 0) - (b.marginPct ?? 0)) * sign || a.sectorLabel.localeCompare(b.sectorLabel);
      case "growth":
        return ((a.growthPct ?? 0) - (b.growthPct ?? 0)) * sign || a.sectorLabel.localeCompare(b.sectorLabel);
      default:
        return a.sectorLabel.localeCompare(b.sectorLabel) * sign || a.sectorType.localeCompare(b.sectorType);
    }
  });
}

/** Percent cell shared by the sector metric rows; em dash when the engine records no value. */
function formatSectorPercent(value: number | null, signed: boolean): string {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${signed && rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

/**
 * Recorded holder kinds are the only owner identity in world state, so these
 * labels describe the recorded kind verbatim — no owner name is invented.
 */
function holderLabel(holder: ShareholderKind): string {
  return holder === "player" ? "You (player)" : "NPC founder";
}

function controllingLabel(holder: ShareholderKind | null): string {
  return holder ? holderLabel(holder) : "No recorded controlling holder";
}

function ListingList({
  listings,
  onSelect,
  emptyMessage = "No corporations match.",
}: {
  listings: MarketListing[];
  onSelect: (id: string) => void;
  emptyMessage?: string;
}) {
  if (listings.length === 0) {
    return <div className="ahd-empty">{emptyMessage}</div>;
  }
  return (
    <ul aria-label="Companies" className="ahd-grid ahd-grid-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {listings.map((listing) => (
        <li key={listing.id}>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            style={{ width: "100%", justifyContent: "space-between", textAlign: "left", minHeight: 44 }}
            onClick={() => onSelect(listing.id)}
            aria-label={`${listing.ticker} ${listing.name}`}
          >
            <span style={{ overflowWrap: "anywhere" }}>
              <strong>{listing.ticker}</strong>{" "}
              <span className="ahd-muted">{listing.name}</span>
            </span>
            <span className="ahd-mono" style={{ fontSize: "0.78rem" }}>
              {formatFinanceMoney(listing.sharePrice, listing.currency)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SectorMetricRow({ sector }: { sector: SectorSummary }) {
  return (
    <span style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", fontSize: "0.74rem" }}>
      <span>
        Revenue:{" "}
        <span className="ahd-mono">
          {sector.values.map((value) => formatFinanceMoney(value.revenue, value.currency)).join(" · ")}
        </span>
      </span>
      <span>
        Margin: <span className="ahd-mono">{formatSectorPercent(sector.marginPct, false)}</span>
      </span>
      <span>
        Growth: <span className="ahd-mono">{formatSectorPercent(sector.growthPct, true)}</span>
      </span>
    </span>
  );
}

/**
 * Sector directory: recorded company counts, per-currency market value and
 * revenue, sector revenue/margin/growth metrics, ownership tabs (derived from
 * the recorded shareholders), search, reference-shaped sorting and mobile
 * paging. Selecting a sector narrows the company list below to that sector, and
 * each company entry opens the existing company detail (the same onSelect the
 * market list already uses).
 *
 * There is deliberately no "For Sale" tab: AHDGame's sectors page reads
 * CorporateSector.forSale (src/app/sectors/page.tsx, /api/sectors route.ts),
 * and Native's recorded for-sale counts now move under the #294 session
 * commands. Sale filtering stays out of scope: the For Sale section below
 * reads each sector's `forSaleCount` instead.
 */
function SectorDirectory({
  sectors,
  activeSectorType,
  onSelectSector,
  emptyReason,
  resetKey,
}: {
  sectors: SectorSummary[];
  activeSectorType: string | null;
  onSelectSector: (sectorType: string | null) => void;
  /** Explicit reason to show instead of a silent empty list, e.g. a country with no records. */
  emptyReason: string | null;
  /** Changing this value (the country filter) resets paging. */
  resetKey: string;
}) {
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState<SectorOwnership>("all");
  const [sort, setSort] = useState<SectorSort>("name");
  const [dir, setDir] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [ownership, sort, dir, query, resetKey]);

  const counts = useMemo(
    () => ({
      all: sectors.length,
      unowned: sectors.filter((sector) => !sector.owned).length,
      owned: sectors.filter((sector) => sector.owned).length,
    }),
    [sectors],
  );

  const visible = useMemo(() => {
    const filtered = sectors.filter((sector) => {
      if (ownership === "owned" && !sector.owned) return false;
      if (ownership === "unowned" && sector.owned) return false;
      return matchesSector(sector, query);
    });
    return sortSectors(filtered, sort, dir);
  }, [sectors, ownership, query, sort, dir]);

  const tabs: { key: SectorOwnership; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unowned", label: "Unowned" },
    { key: "owned", label: "Owned" },
  ];

  const pageCount = Math.max(1, Math.ceil(visible.length / SECTOR_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * SECTOR_PAGE_SIZE;
  const pageItems = visible.slice(start, start + SECTOR_PAGE_SIZE);

  const emptyMessage =
    sectors.length === 0 && emptyReason
      ? emptyReason
      : ownership === "owned"
        ? "No owned sectors match."
        : ownership === "unowned"
          ? "No unowned sectors match."
          : "No sectors match.";

  return (
    <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Sector directory</h3>
      <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: 0 }}>
        {sectors.length} {sectors.length === 1 ? "sector" : "sectors"} with listed companies.
      </p>

      {/* Ownership tabs. Counts come from the same projection, so they can't drift. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {tabs.map((tab) => {
          const active = ownership === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className="ahd-btn ahd-btn-sm"
              aria-pressed={active}
              aria-label={`${tab.label} sectors, ${counts[tab.key]}`}
              onClick={() => setOwnership(tab.key)}
            >
              {tab.label} <span className="ahd-muted">({counts[tab.key]})</span>
            </button>
          );
        })}
      </div>

      <label className="ahd-field">
        <span className="ahd-label">Search sectors</span>
        <input
          className="ahd-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sectors..."
          aria-label="Search sectors"
        />
      </label>

      <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="ahd-field" style={{ flex: "1 1 8rem" }}>
          <span className="ahd-label">Sort sectors</span>
          <select
            className="ahd-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SectorSort)}
            aria-label="Sort sectors"
          >
            <option value="name">Name</option>
            <option value="revenue">Revenue</option>
            <option value="margin">Margin</option>
            <option value="growth">Growth</option>
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

      {visible.length === 0 ? (
        <div className="ahd-empty">{emptyMessage}</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {pageItems.map((sector) => {
            const active = sector.sectorType === activeSectorType;
            return (
              <li key={sector.sectorType}>
                <button
                  type="button"
                  className="ahd-btn ahd-btn-sm"
                  style={{ width: "100%", flexDirection: "column", alignItems: "stretch", textAlign: "left", minHeight: 44, gap: "0.2rem" }}
                  aria-pressed={active}
                  aria-label={`${sector.sectorLabel} sector, ${sector.companyCount} ${sector.companyCount === 1 ? "company" : "companies"}${sector.owned ? ", owned by you" : ", unowned"}`}
                  onClick={() => onSelectSector(active ? null : sector.sectorType)}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ overflowWrap: "anywhere" }}>
                      <strong>{sector.sectorLabel}</strong>{" "}
                      <span className="ahd-muted">
                        {sector.companyCount} {sector.companyCount === 1 ? "company" : "companies"}
                      </span>
                    </span>
                    <span className="ahd-muted" style={{ fontSize: "0.74rem", whiteSpace: "nowrap" }}>
                      {sector.owned ? `Owned · ${sector.playerShares.toLocaleString()} shares` : "Unowned"}
                    </span>
                  </span>
                  <SectorMetricRow sector={sector} />
                  <span className="ahd-mono" style={{ fontSize: "0.74rem" }}>
                    {sector.values.map((value) => formatFinanceMoney(value.marketValue, value.currency)).join(" · ")}
                  </span>
                  <span className="ahd-muted" style={{ fontSize: "0.74rem" }}>
                    For sale: {sector.forSaleCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
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
            onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
            aria-label="Next sector page"
          >
            Next →
          </button>
        </div>
      ) : null}

      <p className="ahd-muted" style={{ fontSize: "0.72rem", margin: 0 }}>
        Ownership reflects only the shareholders recorded in world state. There is no For Sale tab;
        sale listings written by the #294 commands surface per sector as For sale counts instead.
      </p>
    </div>
  );
}

/**
 * For Sale section: per-sector recorded for-sale counts with an honestly
 * disabled purchase control. AHDGame's sectors page tabs into a For Sale list
 * (src/app/sectors/page.tsx); Native counts live listings written by the #294
 * session commands, but buying one needs the acquisition commands (#295), so
 * the single control stays held with SECTOR_ACQUIRE_UNAVAILABLE instead of
 * pretending a purchase is possible. Listing itself happens on the company
 * detail card, restricted to recorded shareholders. Plain text rows, no tab
 * buttons — the directory keeps All/Unowned/Owned only.
 */
function ForSaleDirectory({ sectors }: { sectors: SectorSummary[] }) {
  const total = sectors.reduce((sum, sector) => sum + sector.forSaleCount, 0);
  return (
    <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>For sale</h3>
      <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: 0 }}>
        {total === 0
          ? "No sector listings are for sale."
          : `${total} ${total === 1 ? "sector listing is" : "sector listings are"} for sale.`}
      </p>
      {sectors.length === 0 ? null : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {sectors.map((sector) => (
            <li
              key={sector.sectorType}
              style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.78rem" }}
            >
              <span style={{ overflowWrap: "anywhere" }}>{sector.sectorLabel}</span>
              <span className="ahd-mono" style={{ whiteSpace: "nowrap" }}>
                For sale: {sector.forSaleCount}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <button
          type="button"
          className="ahd-btn ahd-btn-sm"
          disabled
          aria-disabled
          aria-label="Buy a sector listing (unavailable)"
          style={{ minHeight: 44, alignSelf: "flex-start" }}
        >
          Buy sector
        </button>
        <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>
          {SECTOR_ACQUIRE_UNAVAILABLE}
        </span>
      </div>
    </div>
  );
}

/**
 * Owner-only sale listing controls (#294). The engine authorizes only a
 * recorded shareholder of the corporation, so the player must hold at least
 * one share before list/update/unlist enable; everyone else sees the gate
 * reason instead. Buying a listed sector stays honestly disabled for all
 * viewers until the acquisition commands land (#295).
 */
function SectorSaleControls({
  listing,
  busy,
  onSectorSale,
}: {
  listing: MarketListing;
  busy: boolean;
  onSectorSale?: GameScreenProps["onSectorSale"];
}) {
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listed = listing.sectorAsset.forSale;
  const isOwner = listing.playerShares > 0;
  const disabled = busy || !isOwner || onSectorSale == null;

  const update = () => {
    const parsed = parseSalePrice(price);
    if (parsed == null) {
      setError("Enter a positive asking price.");
      return;
    }
    setError(null);
    onSectorSale?.("update", { assetId: listing.sectorAsset.id, priceAnchor: parsed });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      {listed ? (
        <>
          <label className="ahd-field" style={{ maxWidth: "16rem" }}>
            <span className="ahd-label">Asking price</span>
            <input
              className="ahd-input"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                if (error) setError(null);
              }}
              disabled={busy}
              aria-label="Asking price"
              aria-invalid={!!error}
              aria-describedby={error ? "markets-sale-error" : undefined}
            />
            {error ? (
              <span id="markets-sale-error" className="ahd-error-text" role="alert">
                {error}
              </span>
            ) : null}
          </label>
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <button
                type="button"
                className="ahd-btn ahd-btn-sm"
                onClick={update}
                disabled={disabled}
                aria-disabled={disabled}
                aria-label={`Update ${listing.sectorLabel} sector price`}
                style={{ minHeight: 44, alignSelf: "flex-start" }}
              >
                Update price
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <button
                type="button"
                className="ahd-btn ahd-btn-sm"
                onClick={() => onSectorSale?.("unlist", { assetId: listing.sectorAsset.id })}
                disabled={disabled}
                aria-disabled={disabled}
                aria-label={`Unlist ${listing.sectorLabel} sector`}
                style={{ minHeight: 44, alignSelf: "flex-start" }}
              >
                Unlist
              </button>
            </div>
          </div>
          {!isOwner ? (
            <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>
              {SECTOR_LIST_OWNER_ONLY}
            </span>
          ) : null}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            onClick={() => onSectorSale?.("list", { assetId: listing.sectorAsset.id })}
            disabled={disabled}
            aria-disabled={disabled}
            aria-label={`List ${listing.sectorLabel} sector for sale`}
            style={{ minHeight: 44, alignSelf: "flex-start" }}
          >
            List for sale
          </button>
          {!isOwner ? (
            <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>
              {SECTOR_LIST_OWNER_ONLY}
            </span>
          ) : null}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <button
          type="button"
          className="ahd-btn ahd-btn-sm"
          disabled
          aria-disabled
          aria-label={`Buy ${listing.sectorLabel} sector (unavailable)`}
          style={{ minHeight: 44, alignSelf: "flex-start" }}
        >
          Buy sector
        </button>
        <AvailabilityHint cost={0} available={false} disabledReason={SECTOR_ACQUIRE_UNAVAILABLE} />
      </div>
    </div>
  );
}

function CompanyDetail({
  listing,
  markets,
  busy,
  onAction,
  onSectorSale,
  onBack,
}: {
  listing: MarketListing;
  markets: MarketsView;
  initialId?: string | null;
  onSelect?: (id: string | null) => void;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
  onSectorSale?: GameScreenProps["onSectorSale"];
  onBack: () => void;
}) {
  const [shares, setShares] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsed = parseShareCount(shares);
  const buyEval = parsed == null ? null : evaluateShareTrade("buy", listing, parsed, markets, listing.buy);
  const sellEval = parsed == null ? null : evaluateShareTrade("sell", listing, parsed, markets, listing.sell);
  const fxBlocked = !listing.cashCurrencyMatches;

  const buyAvailable = !fxBlocked && (parsed != null ? !!buyEval?.available : listing.buy.available);
  const sellAvailable = !fxBlocked && (parsed != null ? !!sellEval?.available : listing.sell.available);
  const buyReason = fxBlocked ? CROSS_CURRENCY_UNAVAILABLE : parsed != null ? buyEval?.disabledReason : listing.buy.disabledReason;
  const sellReason = fxBlocked ? CROSS_CURRENCY_UNAVAILABLE : parsed != null ? sellEval?.disabledReason : listing.sell.disabledReason;
  const buyDisabled = busy || !buyAvailable;
  const sellDisabled = busy || !sellAvailable;

  const submit = (side: "buy" | "sell") => {
    if (!listing.cashCurrencyMatches) {
      setError(CROSS_CURRENCY_UNAVAILABLE);
      return;
    }
    const n = parseShareCount(shares);
    if (n == null) {
      setError("Enter a positive whole number of shares.");
      return;
    }
    const evaled = evaluateShareTrade(side, listing, n, markets, side === "buy" ? listing.buy : listing.sell);
    if (!evaled.available) {
      setError(evaled.disabledReason ?? "Unavailable");
      return;
    }
    setError(null);
    onAction(side === "buy" ? "buyShares" : "sellShares", { corpId: listing.id, shares: n });
  };

  return (
    <div className="ahd-stack" data-pane="detail">
      <div>
        <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={onBack} aria-label="Back to market list">
          Back
        </button>
      </div>

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Company</h2>
        <div style={{ fontWeight: 750, fontSize: "0.92rem", marginTop: "0.4rem", overflowWrap: "anywhere" }}>
          {listing.ticker} <span className="ahd-muted">({listing.name})</span>
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.25rem 0 0" }}>
          {listing.countryName} · {listing.sectorLabel}
          {listing.isBank ? " · bank" : ""}
          {listing.insolvent ? " · insolvent" : ""}
        </p>
        <dl style={{ display: "flex", flexDirection: "column", gap: "0.3rem", margin: "0.55rem 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Share price</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700 }}>
              {formatFinanceMoney(listing.sharePrice, listing.currency)}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Your shares</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>{listing.playerShares} {listing.playerShares === 1 ? "share" : "shares"}</dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Public float</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>{listing.publicFloat.toLocaleString()}</dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Total shares</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>{listing.totalShares.toLocaleString()}</dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Revenue</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>
              {formatFinanceMoney(listing.revenue, listing.currency)}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Treasury</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>
              {formatFinanceMoney(listing.liquidCapital, listing.currency)}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Growth</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>{listing.currentGrowthRate}%</dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Margin</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>{listing.effectiveProfitMargin}%</dd>
          </div>
        </dl>
        <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.55rem 0 0" }}>
          Quote {listing.currency}. Your cash: {formatFinanceMoney(markets.playerCash, markets.playerCurrency)} ({markets.playerCurrency}).
        </p>
        {fxBlocked ? (
          <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.35rem 0 0" }}>
            {CROSS_CURRENCY_UNAVAILABLE}
          </p>
        ) : null}
      </div>

      <div className="ahd-card ahd-card-pad">
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Ownership</h3>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.35rem 0 0" }}>
          Controlling holder: {controllingLabel(listing.controllingHolder)}
        </p>
        {listing.shareholders.length === 0 ? (
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.35rem 0 0" }}>No shareholders recorded.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: "0.35rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {listing.shareholders.map((shareholder) => (
              <li
                key={shareholder.holder}
                style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.78rem" }}
              >
                <span>{holderLabel(shareholder.holder)}</span>
                <span className="ahd-mono">
                  {shareholder.shares.toLocaleString()} shares
                  {shareholder.avgCostPerShare != null
                    ? ` · avg ${formatFinanceMoney(shareholder.avgCostPerShare, listing.currency)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.35rem 0 0" }}>
          Public float: {listing.publicFloat.toLocaleString()} shares. Ownership reflects only the holders recorded in world state.
        </p>
      </div>

      <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Sector asset</h3>
        <dl style={{ display: "flex", flexDirection: "column", gap: "0.3rem", margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Scope</dt>
            <dd style={{ margin: 0, fontSize: "0.82rem" }}>
              {listing.sectorAsset.scope === "national" ? "National" : "Regional"}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Region</dt>
            <dd style={{ margin: 0, fontSize: "0.82rem" }}>
              {listing.sectorAsset.regionName ?? "No region recorded"}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Workers</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>
              {listing.sectorAsset.workers.toLocaleString()}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>Union</dt>
            <dd style={{ margin: 0, fontSize: "0.82rem" }}>
              {listing.sectorAsset.unionName ?? "No representing union recorded"}
            </dd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <dt style={{ fontSize: "0.82rem" }}>For sale</dt>
            <dd className="ahd-mono" style={{ margin: 0, fontSize: "0.82rem" }}>
              {listing.sectorAsset.forSale
                ? `Anchor ${formatFinanceMoney(listing.sectorAsset.forSale.priceAnchor, listing.currency)}`
                : "Not for sale"}
            </dd>
          </div>
        </dl>
        <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: 0 }}>
          Recorded sector state only. Worker and union mechanics arrive with their own slices (#296-#298).
        </p>
        <SectorSaleControls listing={listing} busy={busy} onSectorSale={onSectorSale} />
      </div>

      <div className="ahd-card ahd-card-pad">
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Earnings history</h3>
        {listing.earningsHistory.length === 0 ? (
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.35rem 0 0" }}>No earnings recorded yet.</p>
        ) : (
          <ol style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.78rem" }} className="ahd-mono">
            {listing.earningsHistory.map((value, index) => (
              <li key={`${listing.id}-earn-${index}`}>{formatFinanceMoney(value, listing.currency)}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="ahd-card ahd-card-pad">
        <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Price history</h3>
        {listing.priceHistory.length === 0 ? (
          <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.35rem 0 0" }}>No recorded share-price history.</p>
        ) : (
          <ol style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.78rem" }} className="ahd-mono">
            {listing.priceHistory.map((point) => (
              <li key={`${listing.id}-px-${point.turn}`}>
                Turn {point.turn}: {formatFinanceMoney(point.price, listing.currency)}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Shares</span>
          <input
            className="ahd-input"
            type="text"
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            value={shares}
            onChange={(e) => {
              setShares(e.target.value);
              if (error) setError(null);
            }}
            disabled={busy}
            aria-label="Shares"
            aria-invalid={!!error}
            aria-describedby={error ? "markets-shares-error" : undefined}
          />
          {error ? (
            <span id="markets-shares-error" className="ahd-error-text" role="alert">
              {error}
            </span>
          ) : parsed != null && buyEval ? (
            <span className="ahd-muted" style={{ fontSize: "0.74rem" }}>
              Notional {formatFinanceMoney(buyEval.notional, listing.currency)}
            </span>
          ) : null}
        </label>

        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <button
              type="button"
              className="ahd-btn ahd-btn-primary ahd-btn-sm"
              onClick={() => submit("buy")}
              disabled={buyDisabled}
              aria-disabled={buyDisabled}
              aria-label={`Buy shares: ${listing.buy.name}`}
            >
              Buy
            </button>
            <AvailabilityHint
              cost={listing.buy.cost}
              available={buyAvailable}
              disabledReason={buyReason}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              onClick={() => submit("sell")}
              disabled={sellDisabled}
              aria-disabled={sellDisabled}
              aria-label={`Sell shares: ${listing.sell.name}`}
            >
              Sell
            </button>
            <AvailabilityHint
              cost={listing.sell.cost}
              available={sellAvailable}
              disabledReason={sellReason}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketsPanel({ markets, busy, onAction, onSectorSale, initialId = null, onSelect }: MarketsPanelProps) {
  const [query, setQuery] = useState("");
  // Default context: the player's own country, mirroring AHDGame's sectors page
  // (src/app/sectors/page.tsx), which preselects the corporation/character
  // country. Native has no player corporation, so the player's country is the
  // only available context. Falls back to "All countries" when the player's
  // country holds no listed corporations.
  const [countryId, setCountryId] = useState(() =>
    markets.countries.some((country) => country.id === markets.playerCountryId) ? markets.playerCountryId : "all",
  );
  const [sectorType, setSectorType] = useState<string | null>(null);
  const [selectedId, updateSelectedId] = useState<string | null>(initialId);
  const setSelectedId = (id: string | null) => { updateSelectedId(id); onSelect?.(id); };

  const selected = selectedId ? markets.listings.find((l) => l.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !markets.listings.some((l) => l.id === selectedId)) setSelectedId(null);
  }, [markets.listings, selectedId]);

  // A country that has been removed or absorbed no longer appears in the filter
  // list, so a preselected id would render with no matching option and silently
  // empty the list. Clear it so the player lands on the unfiltered world instead
  // (ticket #1271 in AHDGame's sectors page).
  useEffect(() => {
    if (countryId !== "all" && !markets.countries.some((country) => country.id === countryId)) {
      setCountryId("all");
    }
  }, [markets.countries, countryId]);

  const countryName =
    countryId === "all" ? null : markets.countries.find((country) => country.id === countryId)?.name ?? countryId;

  // Sectors whose recorded members include this country. Kept per-currency for
  // revenue/value; the country filter only narrows membership.
  const countrySectors = useMemo(
    () =>
      countryId === "all"
        ? markets.sectors
        : markets.sectors.filter((sector) => sector.countryIds.includes(countryId)),
    [markets.sectors, countryId],
  );

  // Explicit reason when a country filter has no records — never a silent empty screen.
  const directoryEmptyReason =
    countryId !== "all" && countrySectors.length === 0
      ? `No sectors are recorded in ${countryName}. Choose "All countries" to browse the rest of the world.`
      : null;

  const countryHasListings = countryId === "all" || markets.listings.some((listing) => listing.countryId === countryId);
  const listingEmptyMessage =
    countryId !== "all" && !countryHasListings
      ? `No corporations are recorded in ${countryName}.`
      : sectorType
        ? "No corporations match this sector filter."
        : "No corporations match.";

  const visible = useMemo(() => {
    return markets.listings.filter((listing) => {
      if (sectorType && listing.sectorType !== sectorType) return false;
      if (countryId !== "all" && listing.countryId !== countryId) return false;
      return matchesQuery(listing, query);
    });
  }, [markets.listings, countryId, sectorType, query]);

  // Dual-pane list/detail pairing (#438): the browse list below and the
  // selected-company detail share the existing selection, search, country,
  // and sector state; the shell places them on separate panes only when a
  // hinge is reported. Single-pane stacks the same flow as before, and the
  // Back control still clears the selection.
  const browse = (
    <>
      <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <label className="ahd-field">
          <span className="ahd-label">Search</span>
          <input
            className="ahd-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search corporations..."
            aria-label="Search corporations"
          />
        </label>
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Country</span>
          <select
            className="ahd-select"
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
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
      </div>

      <SectorDirectory
        sectors={countrySectors}
        activeSectorType={sectorType}
        onSelectSector={setSectorType}
        emptyReason={directoryEmptyReason}
        resetKey={countryId}
      />

      <ForSaleDirectory sectors={countrySectors} />

      <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {sectorType ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <span className="ahd-muted" style={{ fontSize: "0.78rem" }}>
              Sector: {markets.sectors.find((s) => s.sectorType === sectorType)?.sectorLabel ?? sectorType}
            </span>
            <button
              type="button"
              className="ahd-btn ahd-btn-ghost ahd-btn-sm"
              onClick={() => setSectorType(null)}
              aria-label="Show all sectors"
            >
              All sectors
            </button>
          </div>
        ) : null}
        <ListingList listings={visible} onSelect={setSelectedId} emptyMessage={listingEmptyMessage} />
      </div>
    </>
  );

  // The selected company renders detail-only in single-pane (the exact
  // pre-existing phone journey) and pairs the browse list beside the detail
  // only when a hinge is reported.
  const dual = useDualPaneLayout().mode === "dual";
  if (selected && !dual) {
    return (
      <CompanyDetail
        listing={selected}
        markets={markets}
        busy={busy}
        onAction={onAction}
        onSectorSale={onSectorSale}
        onBack={() => setSelectedId(null)}
      />
    );
  }
  if (selected) {
    return (
      <div className="ahd-dual-panes">
        <div data-pane="list" className="ahd-stack">{browse}</div>
        <CompanyDetail
          key={selected.id}
          listing={selected}
          markets={markets}
          busy={busy}
          onAction={onAction}
          onSectorSale={onSectorSale}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">Stock market</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.35rem 0 0" }}>
          {markets.listings.length} listed companies. Cash {formatFinanceMoney(markets.playerCash, markets.playerCurrency)}.
        </p>
        {!markets.marketsPhaseEnabled ? (
          <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.35rem 0 0" }}>
            Share prices are not updating this game.
          </p>
        ) : null}
        {!markets.economyPhaseEnabled ? (
          <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.35rem 0 0" }}>
            The economy is not updating this game.
          </p>
        ) : null}
      </div>

      {markets.listings.length === 0 ? (
        <div className="ahd-empty">No listed corporations.</div>
      ) : (
        <div data-pane="list" className="ahd-stack">{browse}</div>
      )}
    </div>
  );
}
