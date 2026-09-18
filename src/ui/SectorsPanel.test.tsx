/**
 * SectorsPanel directory tests (#89).
 *
 * The panel reads the recorded markets projection only — tabs, counts,
 * filters, sorting, and paging are view logic over MarketListing rows, so
 * fixtures carry the same recorded fields a real projectMarkets() view does
 * (country, sector, revenue, margins, growth, workers, owner, forSale,
 * region join). Rendered at 320px, 390px, and desktop width; jsdom performs
 * no layout, so the viewport cases pin identical content and the shipped
 * containment styles rather than physical-device evidence.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MarketListing, MarketsView } from "../game/markets";
import {
  SectorsPanel,
  isSectorDirectoryOwned,
  sortSectorDirectory,
} from "./SectorsPanel";

function makeListing(overrides: Partial<MarketListing> = {}): MarketListing {
  return {
    id: "US-media",
    ticker: "US.MEDI",
    name: "US-media",
    countryId: "US",
    countryName: "United States",
    sectorType: "media",
    sectorLabel: "media",
    sectorAsset: {
      id: "corporate-sector:US:media:US-media",
      corporationId: "US-media",
      countryId: "US",
      sectorType: "media",
      scope: "national",
      regionId: null,
      regionName: null,
      workers: 1200,
      unionId: null,
      unionName: null,
      forSale: null,
      owner: "corporation",
    },
    currency: "USD",
    cashCurrencyMatches: true,
    sharePrice: 774,
    fundamentalSharePrice: 774,
    totalShares: 10_000_000,
    publicFloat: 4_900_000,
    liquidCapital: 50_000,
    revenue: 1000,
    currentGrowthRate: 3,
    profitMargin: 8,
    effectiveProfitMargin: 8,
    insolvent: false,
    foundedAtTurn: 0,
    isBank: false,
    playerShares: 0,
    playerAvgCostPerShare: null,
    npcShares: 5_100_000,
    shareholders: [{ holder: "npc", shares: 5_100_000, avgCostPerShare: null }],
    controllingHolder: "npc",
    earningsHistory: [],
    priceHistory: [],
    buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
    sell: { id: "sellShares", name: "Sell Shares", cost: 0, available: false },
    ...overrides,
  };
}

const ukListing = () =>
  makeListing({
    id: "UK-manufacturing",
    ticker: "UK.MANU",
    name: "UK-manufacturing",
    countryId: "UK",
    countryName: "United Kingdom",
    sectorType: "manufacturing",
    sectorLabel: "manufacturing",
    sectorAsset: {
      id: "corporate-sector:UK:manufacturing:UK-manufacturing",
      corporationId: "UK-manufacturing",
      countryId: "UK",
      sectorType: "manufacturing",
      scope: "national",
      regionId: null,
      regionName: null,
      workers: 800,
      unionId: null,
      unionName: null,
      forSale: null,
      owner: "corporation",
    },
    currency: "GBP",
    cashCurrencyMatches: false,
    sharePrice: 1200,
    revenue: 500,
  });

function makeMarkets(overrides: Partial<MarketsView> = {}): MarketsView {
  const listings = overrides.listings ?? [makeListing(), ukListing()];
  return {
    playerCountryId: "US",
    playerCash: 10_000,
    playerCurrency: "USD",
    playerActions: 4,
    turn: 3,
    marketsPhaseEnabled: true,
    economyPhaseEnabled: true,
    corporationsPhaseEnabled: true,
    countries: [
      { id: "US", name: "United States", currency: "USD", listingCount: 1 },
      { id: "UK", name: "United Kingdom", currency: "GBP", listingCount: 1 },
    ],
    listings,
    sectors: [],
    ...overrides,
  };
}

function renderPanel(
  markets: MarketsView,
  props: Partial<Parameters<typeof SectorsPanel>[0]> = {},
) {
  return render(
    <SectorsPanel
      markets={markets}
      busy={false}
      onSectorSale={vi.fn()}
      onOpenCompany={vi.fn()}
      onOpenRegion={vi.fn()}
      {...props}
    />,
  );
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("SectorsPanel directory", () => {
  it.each([320, 390, 1280])(
    "renders tabs, counts, rows, and links identically at a %dpx viewport",
    (width) => {
      setViewport(width);
      const onOpenCompany = vi.fn();
      const onOpenRegion = vi.fn();
      renderPanel(makeMarkets(), { onOpenCompany, onOpenRegion });

      expect(
        screen.getByRole("heading", { name: "Sectors" }),
      ).toBeInTheDocument();
      // Default context is the player's country: the US row shows, the UK row does not.
      expect(
        screen.getByRole("button", { name: "Unowned sectors, 1" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Owned sectors, 0" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "For Sale sectors, 0" }),
      ).toBeInTheDocument();
      const list = screen.getByRole("list", { name: "Sectors" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(1);
      expect(
        screen.getByRole("button", { name: "View US-media company" }),
      ).toBeInTheDocument();
      // National asset: no region button, explicit recorded state instead.
      expect(screen.getByText(/no region recorded/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /view .* region/i }),
      ).not.toBeInTheDocument();
      // Recorded sector facts ride on the row: margin, growth, workers, ownership, sale state.
      expect(within(list).getByText("Unowned")).toBeInTheDocument();
      expect(within(list).getByText("Not for sale")).toBeInTheDocument();
      // Rows wrap instead of clipping at 320px: the row is a min-width-0 column.
      const row = within(list).getAllByRole("listitem")[0]!;
      expect(row).toHaveStyle({ flexDirection: "column", minWidth: "0" });
    },
  );

  it("tabs between Unowned, Owned, and For Sale with source-backed counts", async () => {
    const user = userEvent.setup();
    const markets = makeMarkets({
      listings: [
        makeListing(),
        makeListing({
          id: "US-energy",
          ticker: "US.ENER",
          name: "US-energy",
          sectorType: "energy",
          sectorLabel: "energy",
          playerShares: 2,
          revenue: 200,
        }),
        makeListing({
          id: "US-retail",
          ticker: "US.RETA",
          name: "US-retail",
          sectorType: "retail",
          sectorLabel: "retail",
          revenue: 100,
          sectorAsset: {
            ...makeListing().sectorAsset,
            id: "corporate-sector:US:retail:US-retail",
            corporationId: "US-retail",
            sectorType: "retail",
            forSale: { priceAnchor: 500 },
          },
        }),
      ],
    });
    renderPanel(markets);

    expect(
      screen.getByRole("button", { name: "Unowned sectors, 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Owned sectors, 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "For Sale sectors, 1" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Owned sectors, 1" }));
    expect(
      screen.getByRole("button", { name: "View US-energy company" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View US-media company" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/you hold 2 shares/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "For Sale sectors, 1" }),
    );
    expect(
      screen.getByRole("button", { name: "View US-retail company" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Buy retail sector (US.RETA)" }),
    ).toBeInTheDocument();
  });

  it("filters by country, sector type, and search", async () => {
    const user = userEvent.setup();
    renderPanel(makeMarkets());

    // Default context hides the UK row; All countries reveals it.
    expect(
      screen.queryByRole("button", { name: "View UK-manufacturing company" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "all" },
    });
    expect(
      screen.getByRole("button", { name: "View UK-manufacturing company" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sector type"), {
      target: { value: "manufacturing" },
    });
    expect(
      screen.getByRole("button", { name: "View UK-manufacturing company" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View US-media company" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sector type"), {
      target: { value: "" },
    });
    await user.type(screen.getByLabelText("Search sectors"), "zzz-no-match");
    expect(screen.getByText(/no unowned sectors match/i)).toBeInTheDocument();
  });

  it("sorts by revenue descending by default and flips with the direction toggle", async () => {
    const user = userEvent.setup();
    const markets = makeMarkets({
      countries: [
        { id: "US", name: "United States", currency: "USD", listingCount: 2 },
      ],
      listings: [
        makeListing({ revenue: 100 }),
        makeListing({
          id: "US-energy",
          ticker: "US.ENER",
          name: "US-energy",
          sectorType: "energy",
          sectorLabel: "energy",
          revenue: 900,
        }),
      ],
    });
    renderPanel(markets);

    const order = () =>
      within(screen.getByRole("list", { name: "Sectors" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent);
    expect(order()[0]).toMatch(/energy/);
    await user.click(
      screen.getByRole("button", { name: /sort direction: descending/i }),
    );
    expect(order()[0]).toMatch(/media/);
  });

  it("pages eight rows at a time with a showing line", async () => {
    const user = userEvent.setup();
    const listings = Array.from({ length: 9 }, (_, index) =>
      makeListing({
        id: `US-sector-${index}`,
        ticker: `US.S${index}`,
        name: `US-sector-${index}`,
        sectorType: `sector_${index}`,
        sectorLabel: `sector ${index}`,
        revenue: 100 + index,
      }),
    );
    renderPanel(
      makeMarkets({
        countries: [
          { id: "US", name: "United States", currency: "USD", listingCount: 9 },
        ],
        listings,
      }),
    );

    expect(screen.getByText(/showing 1–8 of 9 sectors/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next sector page" }));
    expect(screen.getByText(/showing 9–9 of 9 sectors/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Previous sector page" }),
    );
    expect(screen.getByText(/showing 1–8 of 9 sectors/i)).toBeInTheDocument();
  });

  it("states empty results explicitly per view", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel(
      makeMarkets({ listings: [], countries: [] }),
    );
    expect(
      screen.getByText(/no sectors are recorded in this world/i),
    ).toBeInTheDocument();
    unmount();

    renderPanel(makeMarkets());
    await user.click(screen.getByRole("button", { name: "Owned sectors, 0" }));
    expect(screen.getByText(/no owned sectors match/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "For Sale sectors, 0" }),
    );
    expect(
      screen.getByText(/no sector listings are for sale/i),
    ).toBeInTheDocument();
  });

  it("clears a removed country back to All with an explicit notice", () => {
    const base = makeMarkets();
    const { rerender } = render(
      <SectorsPanel
        markets={base}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
        onOpenRegion={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "UK" },
    });
    expect(
      screen.getByRole("button", { name: "View UK-manufacturing company" }),
    ).toBeInTheDocument();

    // The UK is absorbed: it leaves the filter list while still selected.
    rerender(
      <SectorsPanel
        markets={{
          ...base,
          countries: [
            {
              id: "US",
              name: "United States",
              currency: "USD",
              listingCount: 1,
            },
          ],
        }}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
        onOpenRegion={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no longer listed.*showing all countries instead/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Country")).toHaveValue("all");
    expect(
      screen.getByRole("button", { name: "View US-media company" }),
    ).toBeInTheDocument();
  });

  it("opens the company detail and the recorded region from a regional row", async () => {
    const user = userEvent.setup();
    const onOpenCompany = vi.fn();
    const onOpenRegion = vi.fn();
    renderPanel(
      makeMarkets({
        listings: [
          makeListing({
            sectorAsset: {
              ...makeListing().sectorAsset,
              scope: "regional",
              regionId: "us-ca",
              regionName: "California",
              unionName: "Teamsters",
            },
          }),
        ],
      }),
      { onOpenCompany, onOpenRegion },
    );

    await user.click(
      screen.getByRole("button", { name: "View US-media company" }),
    );
    expect(onOpenCompany).toHaveBeenCalledWith("US-media");
    await user.click(
      screen.getByRole("button", { name: "View California region" }),
    );
    expect(onOpenRegion).toHaveBeenCalledWith("us-ca");
  });

  it("buys an affordable listing, refuses short cash, and fails closed without a handler", async () => {
    const user = userEvent.setup();
    const onSectorSale = vi.fn();
    const assetId = "corporate-sector:US:retail:US-retail";
    const listed = () =>
      makeListing({
        id: "US-retail",
        ticker: "US.RETA",
        name: "US-retail",
        sectorType: "retail",
        sectorLabel: "retail",
        sectorAsset: {
          ...makeListing().sectorAsset,
          id: assetId,
          corporationId: "US-retail",
          sectorType: "retail",
          forSale: { priceAnchor: 500 },
        },
      });
    const markets = makeMarkets({
      countries: [
        { id: "US", name: "United States", currency: "USD", listingCount: 1 },
      ],
      listings: [listed()],
    });
    const { unmount } = renderPanel(markets, { onSectorSale });
    await user.click(
      screen.getByRole("button", { name: "For Sale sectors, 1" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Buy retail sector (US.RETA)" }),
    );
    expect(onSectorSale).toHaveBeenCalledWith("buy", { assetId });
    unmount();

    renderPanel(
      makeMarkets({
        playerCash: 10,
        countries: [
          { id: "US", name: "United States", currency: "USD", listingCount: 1 },
        ],
        listings: [listed()],
      }),
      { onSectorSale },
    );
    await user.click(
      screen.getByRole("button", { name: "For Sale sectors, 1" }),
    );
    const refused = screen.getByRole("button", {
      name: "Buy retail sector (US.RETA)",
    });
    expect(refused).toBeDisabled();
    expect(screen.getByText(/not enough cash/i)).toBeInTheDocument();
  });

  it("holds the Buy control disabled with a reason when sector actions are unwired", async () => {
    const user = userEvent.setup();
    const assetId = "corporate-sector:US:retail:US-retail";
    renderPanel(
      makeMarkets({
        countries: [
          { id: "US", name: "United States", currency: "USD", listingCount: 1 },
        ],
        listings: [
          makeListing({
            id: "US-retail",
            ticker: "US.RETA",
            name: "US-retail",
            sectorType: "retail",
            sectorLabel: "retail",
            sectorAsset: {
              ...makeListing().sectorAsset,
              id: assetId,
              corporationId: "US-retail",
              sectorType: "retail",
              forSale: { priceAnchor: 500 },
            },
          }),
        ],
      }),
      { onSectorSale: undefined },
    );
    await user.click(
      screen.getByRole("button", { name: "For Sale sectors, 1" }),
    );
    expect(
      screen.getByRole("button", { name: "Buy retail sector (US.RETA)" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/sector purchase is unavailable in this view/i),
    ).toBeInTheDocument();
  });
});

describe("sector directory view helpers", () => {
  it("treats recorded shares and player-owned assets as owned", () => {
    expect(isSectorDirectoryOwned(makeListing())).toBe(false);
    expect(isSectorDirectoryOwned(makeListing({ playerShares: 3 }))).toBe(true);
    expect(
      isSectorDirectoryOwned(
        makeListing({
          sectorAsset: { ...makeListing().sectorAsset, owner: "player" },
        }),
      ),
    ).toBe(true);
  });

  it("sorts revenue, margin, and growth with the reference null handling", () => {
    const low = makeListing({
      id: "a",
      revenue: 10,
      effectiveProfitMargin: 1,
      currentGrowthRate: 1,
    });
    const high = makeListing({
      id: "b",
      revenue: 90,
      effectiveProfitMargin: 9,
      currentGrowthRate: 9,
    });
    expect(sortSectorDirectory([low, high], "revenue", "desc")[0]!.id).toBe(
      "b",
    );
    expect(sortSectorDirectory([low, high], "margin", "asc")[0]!.id).toBe("a");
    expect(sortSectorDirectory([low, high], "growth", "desc")[0]!.id).toBe("b");
    expect(
      sortSectorDirectory([low, high], "country", "asc").map((row) => row.id),
    ).toEqual(["a", "b"]);
  });
});
