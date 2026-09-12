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
import type { MarketListing, MarketsView, SectorSummary, ShareholderKind } from "../game/markets";
import type { GameScreenProps } from "../game/types";
import { formatFinanceMoney } from "./FinancePanel";

export interface MarketsPanelProps {
  markets: MarketsView;
  initialId?: string | null;
  onSelect?: (id: string | null) => void;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
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
}: {
  listings: MarketListing[];
  onSelect: (id: string) => void;
}) {
  if (listings.length === 0) {
    return <div className="ahd-empty">No corporations match.</div>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
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

/**
 * Sector directory: sectors with recorded company counts and per-currency
 * values, sorted by label, searchable. Selecting a sector narrows the company
 * list below to that sector, and each company entry opens the existing
 * company detail (the same onSelect the market list already uses).
 */
function SectorDirectory({
  sectors,
  query,
  onQueryChange,
  activeSectorType,
  onSelect,
}: {
  sectors: SectorSummary[];
  query: string;
  onQueryChange: (query: string) => void;
  activeSectorType: string | null;
  onSelect: (sectorType: string | null) => void;
}) {
  const visible = sectors.filter((sector) => matchesSector(sector, query));
  return (
    <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: 0 }}>Sector directory</h3>
      <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: 0 }}>
        {sectors.length} {sectors.length === 1 ? "sector" : "sectors"} with listed companies.
      </p>
      <label className="ahd-field">
        <span className="ahd-label">Search sectors</span>
        <input
          className="ahd-input"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search sectors..."
          aria-label="Search sectors"
        />
      </label>
      {visible.length === 0 ? (
        <div className="ahd-empty">No sectors match.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {visible.map((sector) => {
            const active = sector.sectorType === activeSectorType;
            return (
              <li key={sector.sectorType}>
                <button
                  type="button"
                  className="ahd-btn ahd-btn-sm"
                  style={{ width: "100%", justifyContent: "space-between", textAlign: "left", minHeight: 44 }}
                  aria-pressed={active}
                  aria-label={`${sector.sectorLabel} sector, ${sector.companyCount} ${sector.companyCount === 1 ? "company" : "companies"}`}
                  onClick={() => onSelect(active ? null : sector.sectorType)}
                >
                  <span style={{ overflowWrap: "anywhere" }}>
                    <strong>{sector.sectorLabel}</strong>{" "}
                    <span className="ahd-muted">
                      {sector.companyCount} {sector.companyCount === 1 ? "company" : "companies"}
                    </span>
                  </span>
                  <span className="ahd-mono" style={{ fontSize: "0.78rem" }}>
                    {sector.values.map((value) => formatFinanceMoney(value.marketValue, value.currency)).join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CompanyDetail({
  listing,
  markets,
  busy,
  onAction,
  onBack,
}: {
  listing: MarketListing;
  markets: MarketsView;
  initialId?: string | null;
  onSelect?: (id: string | null) => void;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
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
    <div className="ahd-stack">
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

export function MarketsPanel({ markets, busy, onAction, initialId = null, onSelect }: MarketsPanelProps) {
  const [query, setQuery] = useState("");
  const [countryId, setCountryId] = useState("all");
  const [sectorType, setSectorType] = useState<string | null>(null);
  const [sectorQuery, setSectorQuery] = useState("");
  const [selectedId, updateSelectedId] = useState<string | null>(initialId);
  const setSelectedId = (id: string | null) => { updateSelectedId(id); onSelect?.(id); };

  const selected = selectedId ? markets.listings.find((l) => l.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !markets.listings.some((l) => l.id === selectedId)) setSelectedId(null);
  }, [markets.listings, selectedId]);

  // Country and sector are mutually exclusive filters over the same list.
  const selectSector = (next: string | null) => {
    setSectorType(next);
    if (next) setCountryId("all");
  };

  const visible = useMemo(() => {
    return markets.listings.filter((listing) => {
      if (sectorType && listing.sectorType !== sectorType) return false;
      if (countryId !== "all" && listing.countryId !== countryId) return false;
      return matchesQuery(listing, query);
    });
  }, [markets.listings, countryId, sectorType, query]);

  if (selected) {
    return (
      <CompanyDetail
        listing={selected}
        markets={markets}
        busy={busy}
        onAction={onAction}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
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
                onChange={(e) => { setCountryId(e.target.value); setSectorType(null); }}
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
            sectors={markets.sectors}
            query={sectorQuery}
            onQueryChange={setSectorQuery}
            activeSectorType={sectorType}
            onSelect={selectSector}
          />

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
            <ListingList listings={visible} onSelect={setSelectedId} />
          </div>
        </>
      )}
    </div>
  );
}
