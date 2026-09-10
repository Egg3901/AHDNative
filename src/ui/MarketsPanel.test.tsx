import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CROSS_CURRENCY_UNAVAILABLE, type MarketListing, type MarketsView } from "../game/markets";

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
    ...overrides,
  };
}

const loadPanel = async () => (await import("./MarketsPanel")).MarketsPanel;

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
