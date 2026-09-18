/**
 * #510 economy detail entry (#84 economy/regions audit): the drawer "My
 * Corporation" row deep-links the Stock market route with the owned
 * company's id, but the route kept its mounted selection — tapping the row
 * while already viewing another company silently kept the old detail, so
 * the entry never landed. The reference MP shell has no economy/regions
 * surfaces at all (server reads only, nothing invented), so this slice
 * covers the SP entry: a same-route deep link re-points the company
 * selection, a stale corp id still falls back to the market list, and a
 * plain drawer revisit keeps the current browse selection. Rendered at
 * 320px, 390px, and desktop width.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { MarketListing, MarketsView } from "../game/markets";
import type { GameView, ActionView } from "../game/types";
import { GameScreen } from "./GameScreen";
import { MENU_GROUPS } from "./MobileNavigation";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

function action(id: string, available = true): ActionView {
  return { id, name: id, description: "", cost: 0, available };
}

function makeListing(id: string, ticker: string, name: string): MarketListing {
  return {
    id, ticker, name, countryId: "US", countryName: "United States",
    sectorType: "media", sectorLabel: "Media",
    sectorAsset: {
      id: `corporate-sector:US:media:${id}`, corporationId: id, countryId: "US",
      sectorType: "media", scope: "national",
      regionId: null, regionName: null,
      workers: 120, unionId: null, unionName: null, forSale: null, owner: "corporation",
    },
    currency: "USD", cashCurrencyMatches: true, sharePrice: 774, fundamentalSharePrice: 774,
    totalShares: 10_000_000, publicFloat: 4_900_000, liquidCapital: 50_000, revenue: 1000,
    currentGrowthRate: 3, profitMargin: 8, effectiveProfitMargin: 8, insolvent: false,
    foundedAtTurn: 0, isBank: false, playerShares: 0, playerAvgCostPerShare: null,
    npcShares: 5_100_000, shareholders: [{ holder: "npc", shares: 5_100_000, avgCostPerShare: null }],
    controllingHolder: "npc",
    orderFlow: { buyWindow: 0, sellWindow: 0, flowMultiplier: 1, sentimentMultiplier: 1, insolventSinceTurn: null },
    earningsHistory: [], priceHistory: [],
    buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
    sell: { id: "sellShares", name: "Sell Shares", cost: 0, available: false, disabledReason: "You only own 0 shares." },
  };
}

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1, date: "1953-01-01", era: "1953", countryId: "US", countryName: "United States",
    difficulty: "normal", autonomyLevel: "v4", featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS },
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor", mode: "career", hosPartyId: null, homeRegionId: null },
    legislature: { office: null, proposals: [], sponsor: action("sponsorBill"), bills: [] },
    metrics: [], parties: [], elections: [], news: [],
    actions: [action("fundraise")], regions: [{ id: "r1", name: "Midwest" }],
    finance: {
      cash: 1200, savings: 300, currency: "USD", savingsHolder: "First National Bank",
      holdings: [], deposit: action("depositSavings"), withdraw: action("withdrawSavings"),
    },
    polls: { quick: null, full: null }, notifications: { items: [], unread: 0 },
    myCorporation: { id: "US-corp", name: "Ada Corp" },
    nation: {
      countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: 0.04, inflationRate: 0.02, unemploymentRate: 0.05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: { fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD",
        labels: { title: "Federal Budget", revenueTitle: "Revenue", spendingTitle: "Spending", debtTitle: "Debt", ceilingLabel: "Ceiling", debtServiceLabel: "Service", transferLabel: "Grants", revenue: {}, spending: {} },
        links: [], taxRates: [], revenue: { components: [], total: 1000 },
        spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800, transfers: [] },
        surplus: 200, treasuryBalance: 4000,
        debt: { principal: 0, ceiling: 10000, interestRate: 0.02, debtToGdpRatio: 0, creditRating: "AA" } },
      metrics: { total: 0, categories: [] }, policy: { taxRates: [], enacted: [] },
    },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, nationalInfluence: { current: 0, gain: 0 }, favorability: { current: 48, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 30, tierCost: 6 }, history: [] },
    ...overrides,
  } as unknown as GameView;
}

function baseProps(world: GameView, listings: MarketListing[]) {
  const markets: MarketsView = {
    playerCountryId: "US", playerCash: 10_000, playerCurrency: "USD", playerActions: 4, turn: 1,
    marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true,
    countries: [{ id: "US", name: "United States", currency: "USD", listingCount: listings.length }],
    listings, sectors: [],
  };
  return {
    loadProfile: async () => { throw new Error("unused"); },
    search: async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } }),
    loadBondMarket: async () => { throw new Error("unused"); },
    loadRegions: async () => { throw new Error("unused"); },
    loadCaucusManagement: async () => { throw new Error("unused"); },
    loadPartyManagement: async () => { throw new Error("unused"); },
    loadMarkets: async () => markets,
    loadLegislation: async () => { throw new Error("unused"); },
    loadPolitics: async () => { throw new Error("unused"); },
    loadWorldOverview: async () => { throw new Error("unused"); },
    world, busy: false, onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(),
    onUpdateWorldFeatureFlags: vi.fn(), onAction: vi.fn(), preferences: DEFAULT_PREFERENCES,
    onPreferencesChange: vi.fn(), onUpdateProfile: vi.fn(async () => true),
    onSelectConstituency: vi.fn(async () => true),
    onMarkNotificationRead: vi.fn(), onDeleteNotification: vi.fn(), onMarkAllNotificationsRead: vi.fn(),
  };
}

async function gotoDrawer(user: ReturnType<typeof userEvent.setup>, label: string) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  const direct = primary.queryByRole("button", { name: label });
  if (direct) { await user.click(direct); return; }
  await user.click(primary.getByRole("button", { name: "Menu" }));
  const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
  let destination = menu.queryByRole("button", { name: label });
  if (!destination) {
    const collapsed = MENU_GROUPS.find((group) =>
      group.sections?.some((section) => section.items.some((item) => item.label === label)));
    if (collapsed) {
      await user.click(menu.getByRole("button", { name: collapsed.label }));
      destination = menu.getByRole("button", { name: label });
    }
  }
  expect(destination).not.toBeNull();
  await user.click(destination!);
}

async function openCorpRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Menu" }));
  const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
  await user.click(menu.getByRole("button", { name: "Go to My Corporation" }));
}

describe.each([320, 390, 1280])("same-route My Corporation entry at %spx (#510)", (width) => {
  it("re-points the company detail instead of keeping the mounted one", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const world = makeWorld();
    const listings = [makeListing("US-corp", "ACORP", "Ada Corp"), makeListing("US-other", "OTH", "Other Inc")];
    const props = baseProps(world, listings);
    render(<GameScreen {...props} />);

    await gotoDrawer(user, "Stock market");
    expect(await screen.findByRole("region", { name: "Stock market" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "OTH Other Inc" }));
    expect(screen.getByText("(Other Inc)")).toBeInTheDocument();

    await openCorpRow(user);
    expect(await screen.findByText("(Ada Corp)")).toBeInTheDocument();
    expect(screen.queryByText("(Other Inc)")).not.toBeInTheDocument();

    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onAction).not.toHaveBeenCalled();
    expect(props.onAdvanceTurn).not.toHaveBeenCalled();
    expect(world.turn).toBe(1);
    expect(world.countryId).toBe("US");
  });
});

describe("same-route market deep-link edges (#510)", () => {
  it("keeps the browse selection on a plain drawer revisit with no id", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const world = makeWorld();
    const listings = [makeListing("US-corp", "ACORP", "Ada Corp"), makeListing("US-other", "OTH", "Other Inc")];
    render(<GameScreen {...baseProps(world, listings)} />);

    await gotoDrawer(user, "Stock market");
    await user.click(await screen.findByRole("button", { name: "OTH Other Inc" }));
    expect(screen.getByText("(Other Inc)")).toBeInTheDocument();

    await gotoDrawer(user, "Stock market");
    expect(await screen.findByRole("region", { name: "Stock market" })).toBeInTheDocument();
    expect(screen.getByText("(Other Inc)")).toBeInTheDocument();
  });

  it("falls back to the market list when the linked corp id is stale", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const world = makeWorld({ myCorporation: { id: "US-ghost", name: "Ghost Corp" } });
    const listings = [makeListing("US-other", "OTH", "Other Inc")];
    render(<GameScreen {...baseProps(world, listings)} />);

    await gotoDrawer(user, "Stock market");
    await user.click(await screen.findByRole("button", { name: "OTH Other Inc" }));
    expect(screen.getByText("(Other Inc)")).toBeInTheDocument();

    await openCorpRow(user);
    expect(await screen.findByRole("region", { name: "Stock market" })).toBeInTheDocument();
    expect(screen.queryByText("(Other Inc)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OTH Other Inc" })).toBeInTheDocument();
  });
});
