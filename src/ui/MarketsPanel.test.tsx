import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CROSS_CURRENCY_UNAVAILABLE,
  SECTOR_BUY_ALREADY_OWNED,
  SECTOR_BUY_NOT_LISTED,
  SECTOR_LIST_OWNER_ONLY,
  type MarketListing,
  type MarketsView,
  type SectorSummary,
} from "../game/markets";
import { COMPANY_HERO_FALLBACK_ALT, companyHeroAlt } from "./RouteHero";

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
      workers: 0,
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
    orderFlow: {
      buyWindow: 0,
      sellWindow: 0,
      flowMultiplier: 1,
      sentimentMultiplier: 1,
      insolventSinceTurn: null,
    },
    earningsHistory: [],
    priceHistory: [],
    buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
    sell: {
      id: "sellShares",
      name: "Sell Shares",
      cost: 0,
      available: false,
      disabledReason: "You only own 0 shares of US.MEDI",
    },
    ...overrides,
  };
}

function makeMarkets(overrides: Partial<MarketsView> = {}): MarketsView {
  const listings = overrides.listings ?? [
    makeListing(),
    makeListing({
      id: "UK-manufacturing",
      ticker: "UK.MANU",
      name: "UK-manufacturing",
      countryId: "UK",
      countryName: "United Kingdom",
      sectorType: "manufacturing",
      sectorLabel: "manufacturing",
      currency: "GBP",
      cashCurrencyMatches: false,
      sharePrice: 1200,
    }),
  ];
  return {
    playerCountryId: "US",
    playerCash: 10_000,
    playerCurrency: "USD",
    playerActions: 4,
    turn: 0,
    marketsPhaseEnabled: true,
    economyPhaseEnabled: true,
    corporationsPhaseEnabled: true,
    countries: [
      { id: "US", name: "United States", currency: "USD", listingCount: 1 },
      { id: "UK", name: "United Kingdom", currency: "GBP", listingCount: 1 },
    ],
    listings,
    sectors: [],
    tradeRoutes: [
      {
        countryId: "US",
        countryName: "United States",
        currency: "USD",
        listingCount: 1,
        tradeGrowth: 2.5,
        fx: { available: true, rate: 1, baseRate: 1, regime: "pegged", updatedTurn: 0 },
      },
      {
        countryId: "UK",
        countryName: "United Kingdom",
        currency: "GBP",
        listingCount: 1,
        tradeGrowth: 1.5,
        fx: { available: true, rate: 0.357, baseRate: 0.357, regime: "pegged", updatedTurn: 0 },
      },
    ],
    ...overrides,
  };
}

const loadPanel = async () => (await import("./MarketsPanel")).MarketsPanel;

function makeSector(overrides: Partial<SectorSummary> = {}): SectorSummary {
  return {
    sectorType: "media",
    sectorLabel: "media",
    companyCount: 1,
    values: [{ currency: "USD", companyCount: 1, marketValue: 7_740_000_000, revenue: 1_000 }],
    companyIds: ["US-media"],
    countryIds: ["US"],
    owned: false,
    ownedCompanyCount: 0,
    playerShares: 0,
    marginPct: 8,
    growthPct: 3,
    forSale: null,
    forSaleCount: 0,
    ...overrides,
  };
}

const manufacturingSector = makeSector({
  sectorType: "manufacturing",
  sectorLabel: "manufacturing",
  values: [{ currency: "GBP", companyCount: 1, marketValue: 1_200, revenue: 500 }],
  companyIds: ["UK-manufacturing"],
  countryIds: ["UK"],
});

describe("MarketsPanel list", () => {
  it("lists tickers and prices without a USD aggregate, and searches by ticker and country", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    // The default context is the player's country (US), so browse the world first.
    await user.selectOptions(screen.getByLabelText("Country"), "all");
    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();
    expect(screen.queryByText(/total market cap/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /found|ipo|create corporation/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search corporations"), "UK.MANU");
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();
    expect(screen.queryByText("US.MEDI")).not.toBeInTheDocument();
  });

  it("defaults the country filter to the player's country and switches it", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    // Default context: the player's country (US) is preselected.
    expect(screen.getByLabelText("Country")).toHaveValue("US");
    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.queryByText("UK.MANU")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Country"), "UK");
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();
    expect(screen.queryByText("US.MEDI")).not.toBeInTheDocument();
  });

  it("shows an empty state when the DTO has no listings", async () => {
    const MarketsPanel = await loadPanel();
    render(<MarketsPanel markets={makeMarkets({ listings: [], countries: [] })} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/no listed corporations/i)).toBeInTheDocument();
  });
});

describe("MarketsPanel detail and actions", () => {
  it("opens company detail with recorded price, currency, and zero shares held", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/share price/i)).toBeInTheDocument();
    expect(screen.getByText("Your shares")).toBeInTheDocument();
    expect(screen.getAllByText(/0 shares/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/no recorded share-price history/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buy shares/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sell shares/i })).toBeDisabled();
    expect(screen.getByText(/You only own 0 shares of US.MEDI/)).toBeInTheDocument();
  });

  it("sends buyShares with corpId and integer shares", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const MarketsPanel = await loadPanel();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    await user.type(screen.getByLabelText("Shares"), "2");
    await user.click(screen.getByRole("button", { name: /buy shares/i }));
    expect(onAction).toHaveBeenCalledWith("buyShares", { corpId: "US-media", shares: 2 });
  });

  it("sends sellShares only when the player actually holds shares", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const MarketsPanel = await loadPanel();
    const held = makeListing({
      playerShares: 5,
      playerAvgCostPerShare: 774,
      buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
      sell: { id: "sellShares", name: "Sell Shares", cost: 0, available: true },
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [held] })} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/5 shares/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Shares"), "3");
    await user.click(screen.getByRole("button", { name: /sell shares/i }));
    expect(onAction).toHaveBeenCalledWith("sellShares", { corpId: "US-media", shares: 3 });
  });

  it("rejects non-integer shares without calling onAction", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const MarketsPanel = await loadPanel();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    await user.click(screen.getByRole("button", { name: /buy shares/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/positive whole number/i);
    expect(onAction).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Shares"), "1.5");
    await user.click(screen.getByRole("button", { name: /buy shares/i }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("disables buy and sell when busy", async () => {
    const MarketsPanel = await loadPanel();
    const held = makeListing({
      playerShares: 2,
      sell: { id: "sellShares", name: "Sell Shares", cost: 0, available: true },
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [held] })} busy={true} onAction={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByRole("button", { name: /buy shares/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /sell shares/i })).toBeDisabled();
    expect(screen.getByLabelText("Shares")).toBeDisabled();
  });

  it("does not convert a foreign listing into USD", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Country"), "all");
    await user.click(screen.getByRole("button", { name: /UK\.MANU UK-manufacturing/i }));
    expect(screen.getByText(/quote GBP/i)).toBeInTheDocument();
    expect(screen.getByText(/\(USD\)/)).toBeInTheDocument();
    expect(screen.getAllByText(CROSS_CURRENCY_UNAVAILABLE).length).toBeGreaterThan(0);
    expect(screen.queryByText(/converted to usd/i)).not.toBeInTheDocument();
  });

  it("holds buy and sell on a foreign quote and never calls onAction", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const MarketsPanel = await loadPanel();
    const foreign = makeListing({
      id: "UK-manufacturing",
      ticker: "UK.MANU",
      name: "UK-manufacturing",
      countryId: "UK",
      countryName: "United Kingdom",
      currency: "GBP",
      cashCurrencyMatches: false,
      playerShares: 5,
      playerAvgCostPerShare: 1200,
      buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
      sell: { id: "sellShares", name: "Sell Shares", cost: 0, available: true },
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [foreign] })} busy={false} onAction={onAction} />);
    await user.selectOptions(screen.getByLabelText("Country"), "all");
    await user.click(screen.getByRole("button", { name: /UK\.MANU UK-manufacturing/i }));
    expect(screen.getByText(/quote GBP/i)).toBeInTheDocument();
    expect(screen.getByText(/\(USD\)/)).toBeInTheDocument();
    expect(screen.getAllByText(CROSS_CURRENCY_UNAVAILABLE).length).toBeGreaterThan(0);
    const buy = screen.getByRole("button", { name: /buy shares/i });
    const sell = screen.getByRole("button", { name: /sell shares/i });
    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    await user.type(screen.getByLabelText("Shares"), "1");
    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    await user.click(buy);
    await user.click(sell);
    fireEvent.click(buy);
    fireEvent.click(sell);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("MarketsPanel sector directory", () => {
  it("lists sectors with recorded company counts, per-currency value/revenue and metrics, and filters by search", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(
      <MarketsPanel
        markets={makeMarkets({ sectors: [makeSector(), manufacturingSector] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Country"), "all");

    expect(screen.getByText("Sector directory")).toBeInTheDocument();
    const media = screen.getByRole("button", { name: /media sector, 1 company/i });
    expect(within(media).getByText(/1 company/)).toBeInTheDocument();
    expect(within(media).getByText(/7,740,000,000/)).toBeInTheDocument();
    // Source-backed sector metrics from the recorded corporation fields.
    expect(within(media).getByText(/Revenue:/)).toBeInTheDocument();
    expect(within(media).getByText(/Margin:/)).toBeInTheDocument();
    expect(within(media).getByText(/Growth:/)).toBeInTheDocument();
    const manufacturing = screen.getByRole("button", { name: /manufacturing sector, 1 company/i });
    expect(within(manufacturing).getByText(/1,200/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search sectors"), "manu");
    expect(screen.getByRole("button", { name: /manufacturing sector/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /media sector/i })).not.toBeInTheDocument();
  });

  it("shows an explicit reason instead of a silent empty screen when the filtered country has no sectors", async () => {
    const MarketsPanel = await loadPanel();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    // Default context is US, and the DTO records no sectors.
    expect(screen.getByText("Sector directory")).toBeInTheDocument();
    expect(screen.getByText(/No sectors are recorded in United States/i)).toBeInTheDocument();
  });

  it("shows a no-match empty state when the search excludes every sector", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(
      <MarketsPanel
        markets={makeMarkets({ sectors: [makeSector(), manufacturingSector] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Search sectors"), "zzzz");
    expect(screen.getByText(/no sectors match/i)).toBeInTheDocument();
  });

  it("narrows the company list to a selected sector and opens the existing company detail", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(
      <MarketsPanel
        markets={makeMarkets({ sectors: [makeSector(), manufacturingSector] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Country"), "all");

    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /media sector/i }));
    expect(screen.getByText(/sector: media/i)).toBeInTheDocument();
    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.queryByText("UK.MANU")).not.toBeInTheDocument();

    // Each company entry opens the existing detail with the reachable trade actions.
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/share price/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to market list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buy shares/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sell shares/i })).toBeInTheDocument();
  });

  it("clears the active sector from the All sectors control", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(
      <MarketsPanel
        markets={makeMarkets({ sectors: [makeSector(), manufacturingSector] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Country"), "all");

    await user.click(screen.getByRole("button", { name: /media sector/i }));
    expect(screen.queryByText("UK.MANU")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show all sectors/i }));
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();
  });

  it("has no For Sale tab because sale filtering stays out of scope, and states that plainly", async () => {
    const MarketsPanel = await loadPanel();
    render(<MarketsPanel markets={makeMarkets({ sectors: [makeSector()] })} busy={false} onAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /for sale/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no For Sale tab/i)).toBeInTheDocument();
  });
});

describe("MarketsPanel sector ownership tabs and sorting", () => {
  const ownedSector = makeSector({
    sectorType: "energy",
    sectorLabel: "energy",
    owned: true,
    ownedCompanyCount: 1,
    playerShares: 40,
    companyIds: ["US-energy"],
    values: [{ currency: "USD", companyCount: 1, marketValue: 2_000, revenue: 2_000 }],
    marginPct: 20,
    growthPct: 5,
  });

  it("shows tab counts derived from the recorded shareholders and filters by them", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(
      <MarketsPanel
        markets={makeMarkets({ sectors: [makeSector(), ownedSector] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /All sectors, 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unowned sectors, 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Owned sectors, 1/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Owned sectors, 1/ }));
    expect(screen.getByRole("button", { name: /energy sector/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /media sector/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Unowned sectors, 1/ }));
    expect(screen.getByRole("button", { name: /media sector/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /energy sector/i })).not.toBeInTheDocument();
  });

  it("sorts sectors by revenue, margin and growth with a direction toggle", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(
      <MarketsPanel
        markets={makeMarkets({ sectors: [makeSector(), ownedSector] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );

    const labels = () => screen.getAllByRole("button", { name: / sector, / }).map((b) => b.getAttribute("aria-label"));

    // Default label sort (asc): energy before media.
    expect(labels()[0]).toMatch(/energy sector/);

    // Revenue ascending (default direction): media revenue 1000 < energy revenue 2000.
    await user.selectOptions(screen.getByLabelText("Sort sectors"), "revenue");
    expect(labels()[0]).toMatch(/media sector/);
    await user.click(screen.getByRole("button", { name: /sort direction: ascending/i }));
    expect(labels()[0]).toMatch(/energy sector/);

    // Margin ascending (back to asc): media margin 8 < energy margin 20.
    await user.click(screen.getByRole("button", { name: /sort direction: descending/i }));
    await user.selectOptions(screen.getByLabelText("Sort sectors"), "margin");
    expect(labels()[0]).toMatch(/media sector/);
    await user.click(screen.getByRole("button", { name: /sort direction: ascending/i }));
    expect(labels()[0]).toMatch(/energy sector/);
  });

  it("pages the sector directory on small screens", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const many = Array.from({ length: 10 }, (_, i) =>
      makeSector({
        sectorType: `sector_${i}`,
        sectorLabel: `sector ${i}`,
        companyIds: [`US-sector_${i}`],
      }),
    );
    render(<MarketsPanel markets={makeMarkets({ sectors: many })} busy={false} onAction={vi.fn()} />);

    // Page size is 8, so 10 sectors span two pages.
    expect(screen.getByText(/Page 1 \/ 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next sector page/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sector 9 sector/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next sector page/i }));
    expect(screen.getByText(/Page 2 \/ 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sector 9 sector/i })).toBeInTheDocument();
  });

  it("renders no region link because a corporation records only its country", async () => {
    const MarketsPanel = await loadPanel();
    render(<MarketsPanel markets={makeMarkets({ sectors: [makeSector()] })} busy={false} onAction={vi.fn()} />);
    // Reference sector rows link regionUrl(countryId, stateId); Native's
    // Corporation has no region/state field, so there is no region link to render.
    expect(screen.queryByRole("button", { name: /region/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /region/i })).not.toBeInTheDocument();
  });
});

describe("MarketsPanel ownership discovery", () => {
  it("shows the recorded holder/controller and never a fabricated owner name", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const held = makeListing({
      npcShares: 5_100_000,
      playerShares: 25,
      playerAvgCostPerShare: 774,
      shareholders: [
        { holder: "npc", shares: 5_100_000, avgCostPerShare: null },
        { holder: "player", shares: 25, avgCostPerShare: 774 },
      ],
      controllingHolder: "npc",
    });
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [held], sectors: [makeSector()] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText("Ownership")).toBeInTheDocument();
    expect(screen.getByText(/controlling holder: npc founder/i)).toBeInTheDocument();
    expect(screen.getByText("NPC founder")).toBeInTheDocument();
    expect(screen.getByText("You (player)")).toBeInTheDocument();
    expect(screen.getByText(/5,100,000 shares/)).toBeInTheDocument();
    expect(screen.getByText(/25 shares · avg/)).toBeInTheDocument();
    // The engine records holder kinds only — no personal owner identity is invented.
    expect(screen.queryByText(/owned by|ceo|chief executive|john smith/i)).not.toBeInTheDocument();
  });

  it("states plainly when a corporation has no recorded shareholders", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const ownerless = makeListing({ shareholders: [], controllingHolder: null, npcShares: 0, publicFloat: 10_000_000 });
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [ownerless], sectors: [makeSector()] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/controlling holder: no recorded controlling holder/i)).toBeInTheDocument();
    expect(screen.getByText(/no shareholders recorded/i)).toBeInTheDocument();
  });
});

describe("MarketsPanel For Sale and sector asset (#299)", () => {
  it("shows an empty For Sale section with no dead purchase control", async () => {
    const MarketsPanel = await loadPanel();
    const onAction = vi.fn();
    render(<MarketsPanel markets={makeMarkets({ sectors: [makeSector()] })} busy={false} onAction={onAction} />);

    expect(screen.getByRole("heading", { name: "For sale" })).toBeInTheDocument();
    expect(screen.getByText(/no sector listings are for sale/i)).toBeInTheDocument();
    expect(screen.getByText("For sale: 0")).toBeInTheDocument();
    // No listings, no Buy buttons anywhere; the directory keeps
    // All/Unowned/Owned tabs only.
    expect(screen.queryByRole("button", { name: /for sale/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buy .* sector/i })).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows the recorded sector asset in company detail with a disabled sale control", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [makeListing()], sectors: [makeSector()] })}
        busy={false}
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByRole("heading", { name: "Sector asset" })).toBeInTheDocument();
    expect(screen.getByText("National")).toBeInTheDocument();
    expect(screen.getByText(/no region recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/no representing union recorded/i)).toBeInTheDocument();
    expect(screen.getByText("Not for sale")).toBeInTheDocument();
    // Recorded zero workers render verbatim, not hidden.
    expect(screen.getByText("Workers")).toBeInTheDocument();

    // No recorded shares: the listing control is held with the owner gate.
    const listForSale = screen.getByRole("button", { name: /list media sector for sale/i });
    expect(listForSale).toBeDisabled();
    expect(screen.getByText(SECTOR_LIST_OWNER_ONLY)).toBeInTheDocument();

    // Unlisted: Buy is held with its exact gate reason, and the recorded
    // operating corporation reads as the owner.
    expect(screen.getByText("US-media (corporation)")).toBeInTheDocument();
    const buySector = screen.getByRole("button", { name: /^buy media sector$/i });
    expect(buySector).toBeDisabled();
    expect(screen.getByText(SECTOR_BUY_NOT_LISTED)).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("resolves a regional asset to its recorded region name and union", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const regional = makeListing({
      sectorAsset: {
        id: "corporate-sector:US:media:US-media",
        corporationId: "US-media",
        countryId: "US",
        sectorType: "media",
        scope: "regional",
        regionId: "US-CA",
        regionName: "California",
        workers: 0,
        unionId: "US-media",
        unionName: "Federated Media Workers",
        forSale: null,
        owner: "corporation",
      },
    });
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [regional], sectors: [makeSector()] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText("Regional")).toBeInTheDocument();
    expect(screen.getByText("California")).toBeInTheDocument();
    expect(screen.getByText("Federated Media Workers")).toBeInTheDocument();
  });

  it("surfaces a recorded for-sale listing with a live Buy that sends the asset id", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const onSectorSale = vi.fn();
    const listed = makeListing({
      sectorAsset: {
        id: "corporate-sector:US:media:US-media",
        corporationId: "US-media",
        countryId: "US",
        sectorType: "media",
        scope: "national",
        regionId: null,
        regionName: null,
        workers: 0,
        unionId: null,
        unionName: null,
        owner: "corporation",
        forSale: { priceAnchor: 5000 },
      },
    });
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [listed], sectors: [makeSector({ forSaleCount: 1 })] })}
        busy={false}
        onAction={vi.fn()}
        onSectorSale={onSectorSale}
      />,
    );

    expect(screen.getByText(/1 sector listing is for sale/i)).toBeInTheDocument();
    // The For Sale row carries the asking price and a live Buy.
    const directoryBuy = screen.getByRole("button", { name: /buy media sector \(US\.MEDI\)/i });
    expect(directoryBuy).toBeEnabled();
    await user.click(directoryBuy);
    expect(onSectorSale).toHaveBeenCalledWith("buy", { assetId: "corporate-sector:US:media:US-media" });

    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/anchor/i)).toBeInTheDocument();
    // Recorded without player shares: update and unlist stay held with the owner gate,
    // but buying needs no shares, so Buy is live.
    expect(screen.getByRole("button", { name: /update media sector price/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /unlist media sector/i })).toBeDisabled();
    expect(screen.getByText(SECTOR_LIST_OWNER_ONLY)).toBeInTheDocument();
    const detailBuy = screen.getByRole("button", { name: /^buy media sector$/i });
    expect(detailBuy).toBeEnabled();
    await user.click(detailBuy);
    expect(onSectorSale).toHaveBeenCalledWith("buy", { assetId: "corporate-sector:US:media:US-media" });
  });
});

describe("MarketsPanel sector sale listing controls (#294)", () => {
  const ASSET_ID = "corporate-sector:US:media:US-media";
  const ownerListing = (overrides: Partial<MarketListing> = {}) =>
    makeListing({ playerShares: 2, ...overrides });

  async function openDetail(listing: MarketListing, onSectorSale = vi.fn()) {
    const MarketsPanel = await loadPanel();
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [listing], sectors: [makeSector()] })}
        busy={false}
        onAction={vi.fn()}
        onSectorSale={onSectorSale}
      />,
    );
    const user = userEvent.setup();
    if (listing.countryId !== "US") await user.selectOptions(screen.getByLabelText("Country"), listing.countryId);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    return onSectorSale;
  }

  it("enables List for sale for a recorded shareholder and sends the asset id", async () => {
    const onSectorSale = await openDetail(ownerListing());
    expect(screen.getByText("Not for sale")).toBeInTheDocument();
    const list = screen.getByRole("button", { name: /list media sector for sale/i });
    expect(list).toBeEnabled();
    expect(screen.queryByText(SECTOR_LIST_OWNER_ONLY)).not.toBeInTheDocument();
    await userEvent.setup().click(list);
    expect(onSectorSale).toHaveBeenCalledWith("list", { assetId: ASSET_ID });
  });

  it("enables Update price and Unlist on a live listing and sends the parsed price", async () => {
    const listed = ownerListing({
      sectorAsset: { ...makeListing().sectorAsset, forSale: { priceAnchor: 5000 } },
    });
    const onSectorSale = await openDetail(listed);
    expect(screen.getByText(/anchor/i)).toBeInTheDocument();
    await userEvent.setup().type(screen.getByLabelText("Asking price"), "12345");
    await userEvent.setup().click(screen.getByRole("button", { name: /update media sector price/i }));
    expect(onSectorSale).toHaveBeenCalledWith("update", { assetId: ASSET_ID, priceAnchor: 12345 });

    await userEvent.setup().click(screen.getByRole("button", { name: /unlist media sector/i }));
    expect(onSectorSale).toHaveBeenCalledWith("unlist", { assetId: ASSET_ID });
  });

  it("rejects a non-positive asking price locally without calling onSectorSale", async () => {
    const listed = ownerListing({
      sectorAsset: { ...makeListing().sectorAsset, forSale: { priceAnchor: 5000 } },
    });
    const onSectorSale = await openDetail(listed);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Asking price"), "0");
    await user.click(screen.getByRole("button", { name: /update media sector price/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/positive asking price/i);
    expect(onSectorSale).not.toHaveBeenCalled();
  });

  it("holds every listing control for a non-shareholder while keeping Buy unavailable (#295)", async () => {
    const MarketsPanel = await loadPanel();
    const onSectorSale = vi.fn();
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [makeListing()], sectors: [makeSector()] })}
        busy={false}
        onAction={vi.fn()}
        onSectorSale={onSectorSale}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    const list = screen.getByRole("button", { name: /list media sector for sale/i });
    expect(list).toBeDisabled();
    fireEvent.click(list);
    expect(onSectorSale).not.toHaveBeenCalled();
    expect(screen.getByText(SECTOR_LIST_OWNER_ONLY)).toBeInTheDocument();
    const buy = screen.getByRole("button", { name: /^buy media sector$/i });
    expect(buy).toBeDisabled();
    expect(screen.getByText(SECTOR_BUY_NOT_LISTED)).toBeInTheDocument();
  });

  describe("MarketsPanel sector acquisition (#295)", () => {
    const ASSET_ID = "corporate-sector:US:media:US-media";
    const affordable = (overrides: Partial<MarketListing> = {}) => {
      const base = makeListing().sectorAsset;
      return makeListing({
        ...overrides,
        sectorAsset: { ...base, owner: "corporation" as const, forSale: { priceAnchor: 5000 } },
      });
    };

    async function openDetail(listing: MarketListing, cash = 10_000, onSectorSale = vi.fn()) {
      const MarketsPanel = await loadPanel();
      render(
        <MarketsPanel
          markets={makeMarkets({ playerCash: cash, listings: [listing], sectors: [makeSector({ forSaleCount: 1 })] })}
          busy={false}
          onAction={vi.fn()}
          onSectorSale={onSectorSale}
        />,
      );
      const user = userEvent.setup();
      if (listing.countryId !== "US") await user.selectOptions(screen.getByLabelText("Country"), listing.countryId);
      await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
      return onSectorSale;
    }

    it("reads the recorded operating corporation as owner on an affordable listing", async () => {
      const onSectorSale = await openDetail(affordable());
      expect(screen.getByText("US-media (corporation)")).toBeInTheDocument();
      const buy = screen.getByRole("button", { name: /^buy media sector$/i });
      expect(buy).toBeEnabled();
      await userEvent.setup().click(buy);
      expect(onSectorSale).toHaveBeenCalledWith("buy", { assetId: ASSET_ID });
    });

    it("reads you as owner and holds relist and buy with the already-owned reason", async () => {
      const base = makeListing().sectorAsset;
      await openDetail(makeListing({ playerShares: 3, sectorAsset: { ...base, owner: "player" as const } }));
      expect(screen.getByText("You (player)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /list media sector for sale/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^buy media sector$/i })).toBeDisabled();
      expect(screen.getAllByText(SECTOR_BUY_ALREADY_OWNED).length).toBeGreaterThanOrEqual(2);
    });

    it("holds buy with the exact short-cash numbers", async () => {
      await openDetail(affordable(), 1000);
      const buy = screen.getByRole("button", { name: /^buy media sector$/i });
      expect(buy).toBeDisabled();
      expect(screen.getByText(/required: 5000, available: 1000/i)).toBeInTheDocument();
    });

    it("holds buy with the currency gate on a foreign listing", async () => {
      const base = makeListing().sectorAsset;
      const foreign = makeListing({
        countryId: "UK",
        currency: "GBP",
        cashCurrencyMatches: false,
        sectorAsset: { ...base, countryId: "UK", owner: "corporation" as const, forSale: { priceAnchor: 5000 } },
      });
      await openDetail(foreign);
      expect(screen.getByRole("button", { name: /^buy media sector$/i })).toBeDisabled();
      expect(screen.getAllByText(CROSS_CURRENCY_UNAVAILABLE).length).toBeGreaterThanOrEqual(1);
    });

    it("disables listing controls when busy", async () => {
    const MarketsPanel = await loadPanel();
    render(
      <MarketsPanel
        markets={makeMarkets({ listings: [ownerListing()], sectors: [makeSector()] })}
        busy={true}
        onAction={vi.fn()}
        onSectorSale={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByRole("button", { name: /list media sector for sale/i })).toBeDisabled();
  });
  });
});

describe("MarketsPanel dual-pane list/detail (#438)", () => {
  it("pairs the company list with the selected company detail sharing one selection", async () => {
    // Dual posture via the documented QA override; single-pane keeps the
    // exact pre-existing detail-only journey (covered by the suites above).
    window.history.replaceState({}, "", "?ahd-span=vertical");
    try {
      const MarketsPanel = await loadPanel();
      const user = userEvent.setup();
      render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
      const list = document.querySelector('[data-pane="list"]');
      expect(list).not.toBeNull();
      expect(within(list as HTMLElement).getByLabelText("Search corporations")).toBeInTheDocument();
      expect(document.querySelector('[data-pane="detail"]')).toBeNull();
      // One selection drives both panes: opening a company keeps the list mounted.
      await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
      const detail = document.querySelector('[data-pane="detail"]');
      expect(detail).not.toBeNull();
      expect(within(detail as HTMLElement).getByText("Your shares")).toBeInTheDocument();
      expect(within(document.querySelector('[data-pane="list"]') as HTMLElement).getByLabelText("Search corporations")).toBeInTheDocument();
      // The journey is unchanged: Back clears the selection.
      await user.click(screen.getByRole("button", { name: "Back to market list" }));
      expect(document.querySelector('[data-pane="detail"]')).toBeNull();
      expect(screen.getByRole("button", { name: /US\.MEDI US-media/i })).toBeInTheDocument();
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
});

describe("MarketsPanel trend charts", () => {
  it("charts recorded price and earnings history on company detail with data tables", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const listed = makeListing({
      priceHistory: [
        { turn: 1, price: 700 },
        { turn: 2, price: 774 },
      ],
      earningsHistory: [900, 1000],
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [listed] })} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByRole("img", { name: /price trend/i })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /price trend data/i })).toHaveTextContent("Turn 2");
    expect(screen.getByRole("img", { name: /earnings trend/i })).toBeInTheDocument();
    // Earnings carry no engine turn stamp, so positions read as records, never turns.
    expect(screen.getByRole("table", { name: /earnings trend data/i })).toHaveTextContent("Record 1");
    expect(screen.getByText(/no turn stamp/i)).toBeInTheDocument();
  });

  it("keeps the explicit unavailable states when no price or earnings history is recorded", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/no recorded share-price history/i)).toBeInTheDocument();
    expect(screen.getByText(/no earnings recorded yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /price trend/i })).not.toBeInTheDocument();
  });
});

describe("MarketsPanel company hero (#378)", () => {
  it("renders the bundled company hero for a reachable sector with a nonempty exact-key alt", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const energy = makeListing({
      id: "US-energy",
      ticker: "US.ENRG",
      name: "US-energy",
      sectorType: "energy",
      sectorLabel: "energy",
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [energy] })} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.ENRG US-energy/i }));
    // Reachable bundled art: the energy sector keys the offline company set.
    const hero = screen.getByRole("img", { name: companyHeroAlt("energy") });
    expect(hero.getAttribute("src")).toBe("/static/heroes/commodity-energy.webp");
    expect(companyHeroAlt("energy").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "US-energy" })).toBeInTheDocument();
  });

  it("renders the aliased company hero for a sector outside the commodity keys", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    // Engine sector "media" aliases to the bundled advertising art, no longer
    // the generic Actions fallback.
    const hero = screen.getByRole("img", { name: companyHeroAlt("media") });
    expect(hero.getAttribute("src")).toBe("/static/heroes/commodity-advertising.webp");
    expect(companyHeroAlt("media").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "US-media" })).toBeInTheDocument();
  });

  it("falls back to Actions art with the fallback accessible name outside the company set", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const defense = makeListing({
      id: "US-defense",
      ticker: "US.DEFN",
      name: "US-defense",
      sectorType: "defense",
      sectorLabel: "defense",
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [defense] })} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.DEFN US-defense/i }));
    // Engine sector "defense" has no bundled depiction: fallback art, never a
    // broken image.
    const hero = screen.getByRole("img", { name: COMPANY_HERO_FALLBACK_ALT });
    expect(hero.getAttribute("src")).toBe("/static/heroes/actions.webp");
    expect(COMPANY_HERO_FALLBACK_ALT.length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "US-defense" })).toBeInTheDocument();
  });
});

describe("MarketsPanel trade routes (#77)", () => {
  it("lists recorded routes with trade growth and FX, following the country filter", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Trade routes" })).toBeInTheDocument();
    // Default context is the player's country (US).
    expect(screen.getByLabelText("United States trade route")).toBeInTheDocument();
    expect(screen.queryByLabelText("United Kingdom trade route")).not.toBeInTheDocument();
    expect(screen.getByText(/Trade growth: 2\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/FX: 1 USD per anchor/)).toBeInTheDocument();
    // Read-only: no bid/ask, spread, quote, or settlement affordance.
    expect(screen.queryByRole("button", { name: /convert|settle|quote|order book/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Country"), "all");
    expect(screen.getByLabelText("United States trade route")).toBeInTheDocument();
    expect(screen.getByLabelText("United Kingdom trade route")).toBeInTheDocument();
    expect(screen.getByText(/FX: 0\.357 GBP per anchor/)).toBeInTheDocument();
  });

  it("shows explicit unavailable copy for missing growth and FX rows", async () => {
    const MarketsPanel = await loadPanel();
    render(
      <MarketsPanel
        markets={makeMarkets({
          tradeRoutes: [
            {
              countryId: "US",
              countryName: "United States",
              currency: "USD",
              listingCount: 1,
              tradeGrowth: null,
              fx: { available: false, rate: null, baseRate: null, regime: null, updatedTurn: null },
            },
          ],
        })}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/No trade growth recorded/)).toBeInTheDocument();
    expect(screen.getByText(/No FX record/)).toBeInTheDocument();
  });

  it("shows an explicit empty state when the filtered country has no routes", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const usOnly = (makeMarkets().tradeRoutes ?? []).filter((route) => route.countryId === "US");
    render(<MarketsPanel markets={makeMarkets({ tradeRoutes: usOnly })} busy={false} onAction={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Country"), "UK");
    expect(screen.getByText(/No trade routes recorded in United Kingdom/)).toBeInTheDocument();
    expect(screen.queryByLabelText("United States trade route")).not.toBeInTheDocument();
  });

  it("shows an explicit empty state when the DTO records no routes at all", async () => {
    const MarketsPanel = await loadPanel();
    render(
      <MarketsPanel
        markets={makeMarkets({ tradeRoutes: [] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    // Default context is the player's country, so the empty state names it.
    expect(screen.getByText(/No trade routes recorded in United States/)).toBeInTheDocument();
  });
});

describe("MarketsPanel recorded trade context (#77)", () => {
  it("shows executed flow, fundamental price, multipliers, and solvency without touching trade actions", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const onAction = vi.fn();
    const flowed = makeListing({
      fundamentalSharePrice: 700,
      orderFlow: {
        buyWindow: 1548,
        sellWindow: 0,
        flowMultiplier: 1.02,
        sentimentMultiplier: 0.98,
        insolventSinceTurn: null,
      },
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [flowed] })} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByRole("heading", { name: "Recorded trade context" })).toBeInTheDocument();
    expect(screen.getByText(/Executed-trade notionals await the next market phase/)).toBeInTheDocument();
    expect(screen.getByText(/Solvent \(no insolvency recorded\)/)).toBeInTheDocument();
    expect(screen.queryByText(/bid\/ask book is recorded\./)).toBeInTheDocument();
    // Trade actions stay exactly as before.
    expect(screen.getByRole("button", { name: /buy shares/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sell shares/i })).toBeInTheDocument();
  });

  it("states the zero-flow and insolvent states plainly", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const insolvent = makeListing({
      insolvent: true,
      orderFlow: {
        buyWindow: 0,
        sellWindow: 0,
        flowMultiplier: 1,
        sentimentMultiplier: 1,
        insolventSinceTurn: 7,
      },
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [insolvent] })} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/No executed trades are awaiting the market phase yet/)).toBeInTheDocument();
    expect(screen.getByText(/Insolvent since turn 7/)).toBeInTheDocument();
  });

  it("states plainly when no flow was ever recorded", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    const unrecorded = makeListing({
      orderFlow: {
        buyWindow: null,
        sellWindow: null,
        flowMultiplier: null,
        sentimentMultiplier: null,
        insolventSinceTurn: null,
      },
    });
    render(<MarketsPanel markets={makeMarkets({ listings: [unrecorded] })} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/No executed trade flow recorded yet/)).toBeInTheDocument();
    expect(screen.getAllByText("Not recorded").length).toBe(2);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
