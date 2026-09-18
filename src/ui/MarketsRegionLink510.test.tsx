/**
 * #510 markets company -> regions link (#84 economy/regions audit): the
 * company detail renders its recorded sector-asset region as inert text, so a
 * regional company is a dead end — the Sectors directory and the Regions
 * detail both link to the company, but the company links nowhere back. The
 * reference MP shell has no economy/regions surfaces at all (server reads
 * only, nothing invented), so this slice covers the SP entry/return: a
 * recorded region drills to the Regions destination with the company as the
 * return frame, and Back restores the company. Rendered at 320px, 390px, and
 * desktop width.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { projectRegions, type RegionsQuery } from "../game/regions";
import type { MarketListing, MarketsView } from "../game/markets";
import { GameScreen } from "./GameScreen";
import { MENU_GROUPS } from "./MobileNavigation";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { GameView, ActionView } from "../game/types";
import type { ProfileView } from "../game/profileTypes";
import type { PoliticsView, PoliticsPartyDetail } from "../game/politics";
import type { CaucusManagementView } from "../game/caucusManagement";
import type { PartyManagementView } from "../game/partyManagement";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

function action(id: string, available = true, cost = 0, disabledReason?: string): ActionView {
  return { id, name: id, description: "", cost, available, ...(disabledReason ? { disabledReason } : {}) };
}

const engine = () =>
  createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "markets-region-link" });

function firstRegion(): { id: string; name: string } {
  const directory = projectRegions(engine(), {}).directory;
  expect(directory.length).toBeGreaterThan(0);
  return { id: directory[0]!.id, name: directory[0]!.name };
}

function makeListing(region: { id: string; name: string } | null): MarketListing {
  return {
    id: "US-media", ticker: "CA.MEDI", name: "CalMedia", countryId: "US", countryName: "United States",
    sectorType: "media", sectorLabel: "Media",
    sectorAsset: {
      id: "corporate-sector:US:media:US-media", corporationId: "US-media", countryId: "US",
      sectorType: "media", scope: region ? "regional" : "national",
      regionId: region?.id ?? null, regionName: region?.name ?? null,
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

function makeMarketsView(listings: MarketListing[]): MarketsView {
  return {
    playerCountryId: "US", playerCash: 10_000, playerCurrency: "USD", playerActions: 4, turn: 1,
    marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true,
    countries: [{ id: "US", name: "United States", currency: "USD", listingCount: listings.length }],
    listings, sectors: [],
  };
}

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1, date: "1953-01-01", era: "1953", countryId: "US", countryName: "United States",
    difficulty: "normal", autonomyLevel: "v4", featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS },
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor", mode: "career", hosPartyId: null, homeRegionId: null },
    legislature: { office: "Representative", proposals: [], sponsor: action("sponsorBill", true, 2), bills: [] },
    metrics: [], parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [], news: [], actions: [action("fundraise", true, 1)], regions: [{ id: "r1", name: "Midwest" }],
    finance: {
      cash: 1200, savings: 300, currency: "USD", savingsHolder: "First National Bank",
      holdings: [], deposit: action("depositSavings"), withdraw: action("withdrawSavings"),
    },
    polls: { quick: null, full: null }, notifications: { items: [], unread: 0 },
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
  } as GameView;
}

function profileFor(world: GameView): ProfileView {
  return {
    name: world.player.name, bio: "", avatarUrl: null, campaignSongUrl: "", campaignSongAutoplay: false,
    country: { id: world.countryId, name: world.countryName }, homeRegion: null,
    constituency: { eligible: false, officeType: null, regionId: null, selected: null, options: [], unavailableReason: "Unavailable." },
    party: world.player.partyName ? { id: "p1", name: world.player.partyName, color: "#dc2626" } : null,
    office: world.legislature.office,
    officeDestination: world.legislature.office ? { route: "legislature" } : null,
    policies: null, stats: null, demographics: null, profileHeaderUrl: null, careerHistory: [], achievements: [],
    achievementProgress: { earned: 0, available: 0 }, lockedAchievements: [], unavailableAchievements: [],
    resourceDetails: world.resources,
    standing: { actions: world.player.actions, actionCap: 200, actionGain: 4, politicalInfluence: world.player.influence, nationalInfluence: null, favorability: world.player.favorability, infamy: 0, partyInfluence: null },
    finances: { currency: world.finance.currency, cash: world.finance.cash, savings: world.finance.savings, funds: world.player.funds, donorBaseLevel: 0, regularIncome: 9500, donorIncome: 0 },
  };
}

const partyDetail: PoliticsPartyDetail = {
  id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null,
  members: 120, treasury: 9000, isPlayerParty: true, economicPosition: -2, socialPosition: -1,
  tier: "major", organization: 5, politicalStrength: 7, leaderName: "Ada", viceLeaderName: null,
  treasurerName: null, memberNames: ["Ada"], join: action("joinParty", false, 0, "Already a member."), leave: action("leaveParty", true, 1),
};

function makePolitics(): PoliticsView {
  return {
    countryId: "US", countryName: "United States", currency: "USD", playerPartyId: "p1",
    parties: [partyDetail], elections: [], referendums: [],
    referendumRequest: { applicable: false, note: "UK-only.", regions: [], action: action("requestReferendum", false, 0, "UK-only.") },
    politicians: [],
  };
}

const loadWorldOverview = async () => ({
  era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null,
  nations: [{ id: "US", name: "United States", playable: true, currency: "USD",
    economy: { gdpMillions: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: -1.25 },
    government: { governmentType: null, regime: null, approval: null, legitimacy: null, unrest: null, status: null, formationType: null, confidence: null, governingParty: null, headOfGovernment: null, executive: null, legislature: null } }],
  homeRegion: null,
});
const loadCaucusManagement = async (): Promise<CaucusManagementView> => ({
  countryId: "US", countryName: "United States", currency: "USD", playerPartyId: "p1",
  playerPartyName: "Labor", playerCaucusId: null, playerCaucusName: null, caucusCount: 0,
  create: { actionCost: 4, fundCost: 25000, fundsRequired: 25000, funds: 152000, actions: 9, cooldownRemaining: 0, taxMin: 0, taxMax: 5, nameMinLength: 3, available: true,
    effect: { partyFundsDelta: -25000, partyMembership: "none", caucusMembership: "create", clearsCaucusMembership: false, startsPartySwitchCooldown: false },
    consequences: [], action: action("createCaucus", true, 4) },
  caucuses: [],
});
const loadCabinetOffice = async () => ({
  countryId: "US", countryName: "United States", turn: 1, isExecutive: false, regions: [{ id: "CA", name: "California" }],
  positions: [], activeOrders: [],
});
const loadPartyManagement = async (): Promise<PartyManagementView> => ({
  countryId: "US", countryName: "United States", currency: "USD", playerPartyName: "Labor",
  partyCount: 1, foundedCount: 0, charterDeadlineTurns: 14,
  founding: { actionCost: 8, fundCost: 100000, fundsRequired: 100000, funds: 152000, actions: 9, cooldownRemaining: 0, charterDeadlineTurns: 14, available: true,
    effect: { partyFundsDelta: -100000, partyMembership: "found", caucusMembership: "none", clearsCaucusMembership: true, startsPartySwitchCooldown: true },
    consequences: [], action: action("foundParty", true, 8) },
  parties: [], charters: [],
});
const loadBondMarket = async () => ({
  turn: 1, date: "1953-01-01", playerCountryId: "US", playerCash: 10000, currency: "USD",
  buy: { cost: 1 }, sell: { cost: 1 }, bonds: [],
});
const loadLegislation = async () => ({
  office: null, playerChamberKey: null, countryId: "US", chambers: [], committees: [], schedule: [],
  proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const,
  sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "",
});
const searchFn = async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } });

function baseProps(world: GameView, listings: MarketListing[]) {
  const engineWorld = engine();
  return {
    loadProfile: async () => profileFor(world), search: searchFn, loadBondMarket,
    loadRegions: async (query?: RegionsQuery) => projectRegions(engineWorld, query ?? {}),
    loadCaucusManagement, loadCabinetOffice, onIssueCabinetOrder: vi.fn(), loadPartyManagement,
    loadMarkets: async () => makeMarketsView(listings),
    loadLegislation, loadPolitics: async () => makePolitics(), loadWorldOverview,
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

describe.each([320, 390, 1280])("markets company region link at %spx (#510)", (width) => {
  it("drills from a regional company to its region and back to the company", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const region = firstRegion();
    render(<GameScreen {...baseProps(makeWorld(), [makeListing(region)])} />);
    await gotoDrawer(user, "Stock market");
    await user.click(await screen.findByRole("button", { name: "CA.MEDI CalMedia" }, { timeout: 15000 }));
    await user.click(await screen.findByRole("button", { name: `View ${region.name} region` }, { timeout: 15000 }));
    expect(await screen.findByRole("article", { name: region.name }, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to stock market" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to stock market" }));
    expect(await screen.findByRole("button", { name: "Back to market list" }, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `View ${region.name} region` })).toBeInTheDocument();
  }, 120000);

  it("keeps the national-asset region fact read-only with no dead link", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), [makeListing(null)])} />);
    await gotoDrawer(user, "Stock market");
    await user.click(await screen.findByRole("button", { name: "CA.MEDI CalMedia" }, { timeout: 15000 }));
    expect(await screen.findByText("No region recorded", undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View .* region/ })).toBeNull();
  }, 120000);
});
