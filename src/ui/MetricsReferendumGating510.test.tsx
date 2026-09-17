/**
 * #510 metrics/referendum drawer and screen gating.
 *
 * Reference (public Egg3901/AHDGame): nationDetailsSections shows Political
 * Metrics only for the playable pipeline and Referendums only with an active
 * campaign; /referendums/active gates on `status === "campaigning"`.
 *
 * Native consumes the projected `GameView.capabilityNav` signal only. Absent
 * (pre-signal saves) keeps today's rows; false hides the row; hidden rows
 * stay reachable through real deep links (search) with honest screens, and
 * metrics routes with the flag off recover explicitly instead of showing a
 * frozen registry. Rendered at 320px and desktop width. No overlap with #520
 * role rows or #523 cabinet seat gating.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { GameView, ActionView } from "../game/types";
import type { ProfileView } from "../game/profileTypes";
import type { PoliticsView, PoliticsPartyDetail } from "../game/politics";
import type { SearchResults } from "../game/search";
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

function makeFinance() {
  return {
    cash: 1200, savings: 300, currency: "USD", savingsHolder: "First National Bank",
    holdings: [], deposit: action("depositSavings"), withdraw: action("withdrawSavings"),
  };
}

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1, date: "1953-01-01", era: "1953", countryId: "US", countryName: "United States",
    difficulty: "normal", autonomyLevel: "v4", featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS },
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor", mode: "career", hosPartyId: null, homeRegionId: null },
    legislature: { office: "Representative", proposals: [], sponsor: action("sponsorBill", true, 2), bills: [] },
    metrics: [], parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [],
    news: [],
    actions: [action("fundraise", true, 1)], regions: [{ id: "r1", name: "Midwest" }],
    finance: makeFinance(), polls: { quick: null, full: null }, notifications: { items: [], unread: 0 },
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
    parties: [partyDetail], elections: [],
    referendums: [],
    referendumRequest: { applicable: false, note: "Referendums are only available in the UK in this local slice.", regions: [], action: action("requestReferendum", false, 0, "Referendums are UK-only.") },
    politicians: [],
  };
}

function baseProps(world: GameView, searchResults?: SearchResults) {
  const searchFn = async (query: string) => searchResults ?? ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } });
  return {
    loadProfile: async () => profileFor(world), search: searchFn,
    loadBondMarket: async () => ({ turn: 1, date: "1953-01-01", playerCountryId: "US", playerCash: 10000, currency: "USD", buy: { cost: 1 }, sell: { cost: 1 }, bonds: [] }),
    loadRegions: async () => ({
      era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerCountryName: "United States",
      playerHomeRegionId: null, currency: "USD", directoryQuery: "", directoryPage: 0, directoryPageSize: 20,
      directoryTotal: 0, directoryPageCount: 1, directory: [], selected: null,
    }),
    loadCaucusManagement: async (): Promise<CaucusManagementView> => ({
      countryId: "US", countryName: "United States", currency: "USD", playerPartyId: "p1",
      playerPartyName: "Labor", playerCaucusId: null, playerCaucusName: null, caucusCount: 0,
      create: { actionCost: 4, fundCost: 25000, fundsRequired: 25000, funds: 152000, actions: 9, cooldownRemaining: 0, taxMin: 0, taxMax: 5, nameMinLength: 3, available: true,
        effect: { partyFundsDelta: -25000, partyMembership: "none", caucusMembership: "create", clearsCaucusMembership: false, startsPartySwitchCooldown: false },
        consequences: [], action: action("createCaucus", true, 4) },
      caucuses: [],
    }),
    loadPartyManagement: async (): Promise<PartyManagementView> => ({
      countryId: "US", countryName: "United States", currency: "USD", playerPartyName: "Labor",
      partyCount: 1, foundedCount: 0, charterDeadlineTurns: 14,
      founding: { actionCost: 8, fundCost: 100000, fundsRequired: 100000, funds: 152000, actions: 9, cooldownRemaining: 0, charterDeadlineTurns: 14, available: true,
        effect: { partyFundsDelta: -100000, partyMembership: "found", caucusMembership: "none", clearsCaucusMembership: true, startsPartySwitchCooldown: true },
        consequences: [], action: action("foundParty", true, 8) },
      parties: [], charters: [],
    }),
    loadMarkets: async () => ({
      playerCountryId: "US", playerCash: 1200, playerCurrency: "USD", playerActions: 3, turn: 1,
      marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [], sectors: [],
    }),
    loadLegislation: async () => ({
      office: null, playerChamberKey: null, countryId: "US", chambers: [], committees: [], schedule: [],
      proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const,
      sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "",
    }),
    loadPolitics: async () => makePolitics(),
    loadWorldOverview: async () => ({
      era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null, nations: [], homeRegion: null,
    }),
    world, busy: false, onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(),
    onUpdateWorldFeatureFlags: vi.fn(), onAction: vi.fn(), preferences: DEFAULT_PREFERENCES,
    onPreferencesChange: vi.fn(), onUpdateProfile: vi.fn(async () => true),
    onSelectConstituency: vi.fn(async () => true),
    onMarkNotificationRead: vi.fn(), onDeleteNotification: vi.fn(), onMarkAllNotificationsRead: vi.fn(),
  };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Menu" }));
  return within(screen.getByRole("dialog", { name: "Game menu" }));
}

async function expandNation(user: ReturnType<typeof userEvent.setup>, menu: ReturnType<typeof within>) {
  const toggle = menu.queryByRole("button", { name: "Nation" });
  if (toggle) await user.click(toggle);
}

function mainRegion(): HTMLElement {
  const el = document.querySelector(".ahd-main [role='region']");
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe.each([320, 1280])("metrics/referendum gating at %spx (#510)", (width) => {
  it("keeps today's rows when the signal is absent (pre-signal saves)", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    const menu = await openMenu(user);
    await expandNation(user, menu);
    expect(menu.queryByRole("button", { name: "Political metrics" })).not.toBeNull();
    expect(menu.queryByRole("button", { name: "National Metrics" })).not.toBeNull();
    expect(menu.queryByRole("button", { name: "Referendums" })).not.toBeNull();
  });

  it("hides unsupported rows when the signal denies them", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld({ capabilityNav: { metricsAvailable: false, referendumsAvailable: false } }))} />);
    const menu = await openMenu(user);
    await expandNation(user, menu);
    expect(menu.queryByRole("button", { name: "Political metrics" })).toBeNull();
    expect(menu.queryByRole("button", { name: "National Metrics" })).toBeNull();
    expect(menu.queryByRole("button", { name: "Referendums" })).toBeNull();
    // Neighbors stay reachable.
    expect(menu.queryByRole("button", { name: "Elections" })).not.toBeNull();
    expect(menu.queryByRole("button", { name: "Economy" })).not.toBeNull();
  });

  it("shows every row when the signal grants them", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld({ capabilityNav: { metricsAvailable: true, referendumsAvailable: true } }))} />);
    const menu = await openMenu(user);
    await expandNation(user, menu);
    expect(menu.queryByRole("button", { name: "Political metrics" })).not.toBeNull();
    expect(menu.queryByRole("button", { name: "National Metrics" })).not.toBeNull();
    expect(menu.queryByRole("button", { name: "Referendums" })).not.toBeNull();
  });

  it("recovers honestly on a metrics deep link with the flag off", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const onWorld = makeWorld({ capabilityNav: { metricsAvailable: true, referendumsAvailable: false } });
    const { rerender } = render(<GameScreen {...baseProps(onWorld)} />);
    // Arrive while supported, then the save arrives with the flag off (World
    // settings toggle or restored route): the frozen registry must not pose
    // as live data.
    let menu = await openMenu(user);
    await expandNation(user, menu);
    await user.click(menu.getByRole("button", { name: "National Metrics" }));
    expect(await within(mainRegion()).findByRole("heading", { name: "National metrics registry" })).toBeInTheDocument();
    rerender(<GameScreen {...baseProps(makeWorld({ capabilityNav: { metricsAvailable: false, referendumsAvailable: false } }))} />);
    const main = mainRegion();
    expect(await within(main).findByRole("heading", { name: "National metrics" })).toBeInTheDocument();
    expect(within(main).getByRole("note")).toHaveTextContent(/turned off/i);
    await user.click(within(main).getByRole("button", { name: "Go to economy" }));
    expect(await within(mainRegion()).findByRole("heading", { name: /economy/i })).toBeInTheDocument();
  });

  it("recovers honestly on a political-metrics deep link with the flag off", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const onWorld = makeWorld({ capabilityNav: { metricsAvailable: true, referendumsAvailable: false } });
    const { rerender } = render(<GameScreen {...baseProps(onWorld)} />);
    let menu = await openMenu(user);
    await expandNation(user, menu);
    await user.click(menu.getByRole("button", { name: "Political metrics" }));
    expect(await within(mainRegion()).findByText("No national metrics recorded.")).toBeInTheDocument();
    rerender(<GameScreen {...baseProps(makeWorld({ capabilityNav: { metricsAvailable: false, referendumsAvailable: false } }))} />);
    const main = mainRegion();
    expect(await within(main).findByRole("heading", { name: "Political metrics" })).toBeInTheDocument();
    expect(within(main).getByRole("note")).toHaveTextContent(/turned off/i);
    await user.click(within(main).getByRole("button", { name: "Go to elections" }));
    expect(await within(mainRegion()).findByRole("heading", { name: /elections/i })).toBeInTheDocument();
  });

  it("keeps a hidden referendum row reachable by search with an honest screen", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const query = "independence";
    const searchResults: SearchResults = {
      query,
      total: 1,
      results: [{ kind: "referendum", id: "ref-1", title: "Should SCO become independent?", description: "Referendum · Scotland" }],
      facets: { kinds: [], countries: [], regions: [] },
    };
    render(<GameScreen {...baseProps(makeWorld({ capabilityNav: { metricsAvailable: true, referendumsAvailable: false } }), searchResults)} />);
    // The drawer offers no Referendums row without an active campaign.
    let menu = await openMenu(user);
    await expandNation(user, menu);
    expect(menu.queryByRole("button", { name: "Referendums" })).toBeNull();
    await user.click(menu.getByRole("button", { name: "Close menu" }));
    // Search still deep-links to the destination with honest content.
    menu = await openMenu(user);
    await user.click(menu.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search your world"), { target: { value: query } });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /Should SCO become independent\?/ }));
    const main = mainRegion();
    expect(await within(main).findByRole("heading", { name: "Referendums" })).toBeInTheDocument();
    expect(within(main).getByText("No referendums have been requested.")).toBeInTheDocument();
    expect(main.textContent?.trim().length).toBeGreaterThan(0);
  });
});
