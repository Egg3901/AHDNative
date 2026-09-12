import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CROSS_CURRENCY_UNAVAILABLE, type MarketListing, type MarketsView, type SectorSummary } from "../game/markets";

function makeListing(overrides: Partial<MarketListing> = {}): MarketListing {
  return {
    id: "US-media",
    ticker: "US.MEDI",
    name: "US-media",
    countryId: "US",
    countryName: "United States",
    sectorType: "media",
    sectorLabel: "media",
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
    ...overrides,
  };
}

const loadPanel = async () => (await import("./MarketsPanel")).MarketsPanel;

function makeSector(overrides: Partial<SectorSummary> = {}): SectorSummary {
  return {
    sectorType: "media",
    sectorLabel: "media",
    companyCount: 1,
    values: [{ currency: "USD", companyCount: 1, marketValue: 7_740_000_000 }],
    companyIds: ["US-media"],
    ...overrides,
  };
}

const manufacturingSector = makeSector({
  sectorType: "manufacturing",
  sectorLabel: "manufacturing",
  values: [{ currency: "GBP", companyCount: 1, marketValue: 1_200 }],
  companyIds: ["UK-manufacturing"],
});

describe("MarketsPanel list", () => {
  it("lists tickers and prices without a USD aggregate, and searches by ticker and country", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();
    expect(screen.queryByText(/total market cap/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /found|ipo|create corporation/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search corporations"), "UK.MANU");
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();
    expect(screen.queryByText("US.MEDI")).not.toBeInTheDocument();
  });

  it("filters by country", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Country"), "US");
    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.queryByText("UK.MANU")).not.toBeInTheDocument();
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
  it("lists sectors with recorded company counts and values, and filters them by search", async () => {
    const MarketsPanel = await loadPanel();
    const user = userEvent.setup();
    render(
      <MarketsPanel
        markets={makeMarkets({ sectors: [makeSector(), manufacturingSector] })}
        busy={false}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Sector directory")).toBeInTheDocument();
    const media = screen.getByRole("button", { name: /media sector, 1 company/i });
    expect(within(media).getByText(/1 company/)).toBeInTheDocument();
    expect(within(media).getByText(/7,740,000,000/)).toBeInTheDocument();
    const manufacturing = screen.getByRole("button", { name: /manufacturing sector, 1 company/i });
    expect(within(manufacturing).getByText(/1,200/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search sectors"), "manu");
    expect(screen.getByRole("button", { name: /manufacturing sector/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /media sector/i })).not.toBeInTheDocument();
  });

  it("shows an empty directory when no sectors match", async () => {
    const MarketsPanel = await loadPanel();
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("Sector directory")).toBeInTheDocument();
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

    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /media sector/i }));
    expect(screen.getByText(/sector: media/i)).toBeInTheDocument();
    expect(screen.getByText("US.MEDI")).toBeInTheDocument();
    expect(screen.queryByText("UK.MANU")).not.toBeInTheDocument();

    // Each company entry opens the existing detail with the market list's Back control.
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    expect(screen.getByText(/share price/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to market list/i })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /media sector/i }));
    expect(screen.queryByText("UK.MANU")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show all sectors/i }));
    expect(screen.getByText("UK.MANU")).toBeInTheDocument();
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
