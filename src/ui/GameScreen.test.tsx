import type { ProfileView } from "../game/profileTypes";
import { DEFAULT_PREFERENCES } from "../preferences";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { MENU_GROUPS } from "./MobileNavigation";
import type { ElectionView, FinanceView, GameView } from "../game/types";
import { DEFAULT_WORLD_FEATURE_FLAGS, WORLD_FEATURE_FLAG_DEFINITIONS } from "@ahdclient/engine";

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 1200,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [
      { id: "h1", name: "Acme Steel", ticker: "ACME", shares: 10, price: 25, currency: "USD" },
    ],
    deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
    ...overrides,
  };
}

function makeElection(overrides: Partial<ElectionView> = {}): ElectionView {
  return {
    id: "e1",
    title: "General Election",
    status: "upcoming",
    date: "1954-11-02",
    filingDate: "1954-09-01",
    electionType: "house",
    phase: "upcoming",
    playerCandidate: false,
    candidateNames: ["Ada", "Bob"],
    winnerNames: [],
    countedVotes: null, leaderName: null, leaderShare: null, marginPct: null, seatProjection: null,
    candidacy: { id: "declareCandidacy", name: "Declare candidacy", description: "Run", cost: 1, available: true },
    ...overrides,
  };
}

const preferencesProps = { preferences: DEFAULT_PREFERENCES, onPreferencesChange: vi.fn(), onUpdateProfile: vi.fn(async () => true), onSelectConstituency: vi.fn(async () => true),
  onMarkNotificationRead: vi.fn(), onDeleteNotification: vi.fn(), onMarkAllNotificationsRead: vi.fn() };
function profileFor(world: GameView): ProfileView {
  return {
    name: world.player.name, bio: "", avatarUrl: null, campaignSongUrl: "", campaignSongAutoplay: false,
    country: { id: world.countryId, name: world.countryName }, homeRegion: null,
    constituency: { eligible: false, officeType: null, regionId: null, selected: null, options: [], unavailableReason: "Unavailable." },
    party: world.player.partyName ? { id: "p1", name: world.player.partyName, color: "#dc2626" } : null,
    office: world.legislature.office,
    officeDestination: world.legislature.office ? { route: "legislature" } : null,
    policies: null, stats: null, demographics: null, profileHeaderUrl: null, careerHistory: [], achievements: [],
    achievementProgress: { earned: 0, available: 0 }, lockedAchievements: [],
    unavailableAchievements: [],
    resourceDetails: world.resources,
    standing: { actions: world.player.actions, actionCap: 200, actionGain: 4,
      politicalInfluence: world.player.influence, nationalInfluence: null,
      favorability: world.player.favorability, infamy: 0, partyInfluence: null },
    finances: { currency: world.finance.currency, cash: world.finance.cash, savings: world.finance.savings,
      funds: world.player.funds, donorBaseLevel: 0, regularIncome: 9500, donorIncome: 0 },
  };
}
const search = async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } });
const loadBondMarket = vi.fn();
const loadRegions = vi.fn();
const loadCaucusManagement = vi.fn();
const loadPartyManagement = vi.fn();
const loadMarkets = async () => ({ playerCountryId: "US", playerCash: 0, playerCurrency: "USD", playerActions: 0, turn: 0, marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [], sectors: [] });
const loadLegislation = async () => ({ office: null, playerChamberKey: null, countryId: "US", chambers: [], committees: [], schedule: [], proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const, sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "" });
const loadWorldOverview = async () => ({ era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null, nations: [], homeRegion: null });
const loadPolitics = async () => ({ countryId: "US", countryName: "United States", currency: "USD", playerPartyId: null, parties: [], elections: [], referendums: [], referendumRequest: { applicable: false, note: "Referendums are only available in the UK in this local slice.", regions: [], action: { id: "requestReferendum", name: "Request Referendum", description: "", cost: 0, available: false, disabledReason: "Referendums are UK-only." } }, politicians: [] });

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1,
    date: "1953-01-01",
    era: "1953",
    countryId: "US",
    countryName: "United States",
    difficulty: "normal",
    autonomyLevel: "v4",
    featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS },
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor", mode: "career", hosPartyId: null, homeRegionId: null },
    legislature: {
      office: "Representative",
      proposals: [{ id: "cat-a", title: "Labor Standards", description: "Workplace rules." }],
      sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: true },
      bills: [
        {
          id: "b1", title: "Wage Bill", status: "active", chamber: "house", sponsorName: "Ada",
          votesFor: 12, votesAgainst: 7, votesAbstain: 3,
          playerVote: null,
          voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 0, available: true },
        },
      ],
    },
    metrics: [{ id: "gdp", label: "GDP", value: 12345, format: "money" }],
    parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [makeElection()],
    news: [{ id: "n1", title: "Markets rally", body: "Stocks up.", date: "1953-02-01" }],
    actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" }],
    regions: [{ id: "r1", name: "Midwest" }],
    finance: makeFinance(),
    polls: { quick: null, full: null },
    notifications: { items: [], unread: 0 },
    nation: { countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: .04, inflationRate: .02, unemploymentRate: .05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: { fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD",
        labels: { title: "Federal Budget", revenueTitle: "Revenue Sources", spendingTitle: "Spending by Category", debtTitle: "National Debt", ceilingLabel: "Debt Ceiling", debtServiceLabel: "Debt Service", transferLabel: "State grants", revenue: {}, spending: {} },
        links: [{ label: "Policy", route: "policy" as const }, { label: "Legislature", route: "legislature" as const }],
        taxRates: [], revenue: { components: [], total: 1000 }, spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800, transfers: [] }, surplus: 200, treasuryBalance: 4000, debt: { principal: 0, ceiling: 10000, interestRate: .02, debtToGdpRatio: 0, creditRating: "AA" } },
      metrics: { total: 1, categories: [{ id: "economic", label: "Economic", metrics: [{ id: "economic.gdpGrowth", category: "economic", label: "GDP growth", value: 4, format: "percent" as const, history: [], modifiers: [], links: [{ label: "Economy", route: "economy" as const }] }] }] },
      policy: { taxRates: [], enacted: [] } },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, nationalInfluence: { current: 0, gain: 0 }, favorability: { current: 48, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 30, tierCost: 6 }, history: [] },
    ...overrides,
  };
}

async function navigate(user: ReturnType<typeof userEvent.setup>, name: string) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  const direct = primary.queryByRole("button", { name });
  if (direct) { await user.click(direct); return; }
  await user.click(primary.getByRole("button", { name: "Menu" }));
  const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
  let destination = menu.queryByRole("button", { name });
  if (!destination) {
    const collapsedGroup = MENU_GROUPS.find((group) =>
      group.sections?.some((section) => section.items.some((item) => item.label === name)),
    );
    if (collapsedGroup) {
      await user.click(menu.getByRole("button", { name: collapsedGroup.label }));
      destination = menu.getByRole("button", { name });
    }
  }
  expect(destination).not.toBeNull();
  await user.click(destination!);
}

describe("GameScreen", () => {
  it("opens on the player profile, matching the existing game entry flow", async () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /end turn/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save game/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(await within(profile).findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(profile).toHaveTextContent("Representative");
    expect(profile).toHaveTextContent("Political standing");
    expect(screen.queryByText("GDP")).not.toBeInTheDocument();
    expect(screen.getAllByText(/united states/i).length).toBeGreaterThan(0);
  });

  it("keeps single-pane phone navigation when no hinge is reported (#438)", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const shell = document.querySelector(".ahd-screen");
    expect(shell).toHaveAttribute("data-dual-pane", "single");
    expect(shell).toHaveAttribute("data-dual-capability", "none");
    // Modal drawer stays closed; bottom navigation is the phone flow.
    expect(screen.queryByRole("complementary", { name: "Game navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("docks navigation beside content when separated segments are reported (#438)", () => {
    (window as unknown as { getViewportSegments: () => unknown }).getViewportSegments = () => [
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 416, y: 0, width: 400, height: 800 },
    ];
    try {
      const world = makeWorld();
      render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
      const shell = document.querySelector(".ahd-screen");
      expect(shell).toHaveAttribute("data-dual-pane", "dual");
      expect(shell).toHaveAttribute("data-hinge", "vertical");
      expect(shell).toHaveAttribute("data-dual-capability", "segments");
      // Navigation/content pairing with no modal sheet and no duplicated chrome.
      expect(screen.getByRole("complementary", { name: "Game navigation" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
    } finally {
      delete (window as unknown as { getViewportSegments?: unknown }).getViewportSegments;
    }
  });

  it("keeps the own-profile context across linked destinations and return", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const profile = screen.getByRole("region", { name: "Profile" });
    await user.click(await within(profile).findByRole("button", { name: "Representative" }));
    expect(screen.getByRole("region", { name: "Legislature" })).toBeInTheDocument();
    await navigate(user, "Profile");
    expect(await within(screen.getByRole("region", { name: "Profile" })).findByRole("heading", { name: "Ada" })).toBeInTheDocument();
  });

  it("switches between bottom destinations and drawer destinations", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Parties");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByText("Labor")).toBeInTheDocument();
    await navigate(user, "Elections");
    expect(screen.getByText("General Election")).toBeInTheDocument();
    await navigate(user, "News");
    expect(screen.getByText("Markets rally")).toBeInTheDocument();
  });

  it("filters the offline wire and restores the selected read article with related links", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const world = makeWorld({
      news: [
        {
          id: "turn-4-election",
          title: "General election called",
          body: "Voters will choose a new House.",
          date: "1953-02-01",
          category: "Election",
          country: { id: "US", name: "United States" },
          party: { id: "p1", name: "Labor" },
          election: { id: "e1", name: "General Election" },
          event: { id: "event-election-call", name: "Election call" },
        },
        {
          id: "turn-3-economy",
          title: "Markets rally",
          body: "Stocks moved higher after the budget.",
          date: "1953-01-31",
          category: "Economy",
          country: { id: "US", name: "United States" },
        },
      ],
    } as Partial<GameView>);
    const props = { ...preferencesProps, newsStorageKey: "save-slot-a", loadProfile: async () => profileFor(world), loadPolitics, search, loadBondMarket, loadRegions, loadCaucusManagement, loadPartyManagement, loadMarkets, loadLegislation, loadWorldOverview, world, busy: false, onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onUpdateWorldFeatureFlags: vi.fn(), onAction: vi.fn() };
    const first = render(<GameScreen {...props} />);

    await navigate(user, "News");
    await user.selectOptions(screen.getByRole("combobox", { name: "News category" }), "Election");
    await user.selectOptions(screen.getByRole("combobox", { name: "News country" }), "US");
    await user.selectOptions(screen.getByRole("combobox", { name: "News date" }), "1953-02-01");
    expect(screen.getByText("General election called")).toBeInTheDocument();
    expect(screen.queryByText("Markets rally")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    const article = screen.getByRole("article", { name: "General election called" });
    expect(article).toHaveTextContent("Voters will choose a new House.");
    expect(within(article).getByRole("button", { name: "View United States" })).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "View Labor" })).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "View General Election" })).toBeInTheDocument();
    expect(within(article).getByRole("region", { name: "Event context" })).toHaveTextContent("Election call");
    expect(fetchSpy).not.toHaveBeenCalled();

    first.unmount();
    const reloaded = render(<GameScreen {...props} />);
    await navigate(user, "News");
    expect(screen.getByRole("article", { name: "General election called" })).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();

    reloaded.unmount();
    render(<GameScreen {...props} newsStorageKey="save-slot-b" />);
    await navigate(user, "News");
    expect(screen.queryByRole("article", { name: "General election called" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read General election called" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("lands article related links on real country, party, and election destinations", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      news: [
        {
          id: "turn-4-election",
          title: "General election called",
          body: "Voters will choose a new House.",
          date: "1953-02-01",
          category: "Election",
          country: { id: "US", name: "United States" },
          party: { id: "p1", name: "Labor" },
          election: { id: "e1", name: "General Election" },
          event: { id: "event-election-call", name: "Election call" },
        },
      ],
    } as Partial<GameView>);
    const props = { ...preferencesProps, newsStorageKey: "article-links-slot", loadProfile: async () => profileFor(world), loadPolitics, search, loadBondMarket, loadRegions, loadCaucusManagement, loadPartyManagement, loadMarkets, loadLegislation, loadWorldOverview, world, busy: false, onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onUpdateWorldFeatureFlags: vi.fn(), onAction: vi.fn() };
    render(<GameScreen {...props} />);

    await navigate(user, "News");
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View Labor" }));
    expect(screen.getByRole("button", { name: "Back to parties" })).toBeInTheDocument();

    await navigate(user, "News");
    expect(screen.getByRole("article", { name: "General election called" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to news" }));
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View General Election" }));
    expect(screen.getByRole("button", { name: "Back to elections" })).toBeInTheDocument();

    await navigate(user, "News");
    await user.click(screen.getByRole("button", { name: "Back to news" }));
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View United States" }));
    expect(await screen.findByRole("region", { name: "Nations" })).toBeInTheDocument();
  });

  it("lands event detail coverage and related links on real destinations", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      news: [
        {
          id: "turn-4-election",
          title: "General election called",
          body: "Voters will choose a new House.",
          date: "1953-02-01",
          category: "Election",
          country: { id: "US", name: "United States" },
          party: { id: "p1", name: "Labor" },
          election: { id: "e1", name: "General Election" },
          event: { id: "event-election-call", name: "Election call" },
        },
        {
          id: "turn-5-election-aftermath",
          title: "Election aftermath",
          body: "Coalition talks begin after the result.",
          date: "1953-02-02",
          category: "Politics",
          country: { id: "US", name: "United States" },
          election: { id: "e1", name: "General Election" },
          event: { id: "event-election-call", name: "Election call" },
        },
      ],
    } as Partial<GameView>);
    const props = { ...preferencesProps, newsStorageKey: "event-links-slot", loadProfile: async () => profileFor(world), loadPolitics, search, loadBondMarket, loadRegions, loadCaucusManagement, loadPartyManagement, loadMarkets, loadLegislation, loadWorldOverview, world, busy: false, onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onUpdateWorldFeatureFlags: vi.fn(), onAction: vi.fn() };
    render(<GameScreen {...props} />);

    await navigate(user, "News");
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View Election call" }));
    const event = screen.getByRole("article", { name: "Election call" });
    expect(event).toHaveTextContent("2 articles");
    await user.click(within(event).getByRole("button", { name: "Read Election aftermath" }));
    expect(screen.getByRole("article", { name: "Election aftermath" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to news" }));
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View Election call" }));
    await user.click(screen.getByRole("button", { name: "View Labor" }));
    expect(screen.getByRole("button", { name: "Back to parties" })).toBeInTheDocument();
  });

  it("bottom navigation opens its destination with page focus", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("region", { name: "Actions" })).toHaveFocus();
  });

  it("supports keyboard arrow navigation", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const profile = screen.getByRole("button", { name: "Profile" });
    profile.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Actions" })).toHaveAttribute("aria-current", "page");
  });

  it("has four keyboard-reachable bottom destinations", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const buttons = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons.every(button => button.tabIndex === 0)).toBe(true);
  });

  it("preserves the viewed nation and player state across a Nations browse round trip", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    const onSave = vi.fn();
    const onAction = vi.fn();
    const onAdvanceTurn = vi.fn();
    const emptyGovernment = {
      governmentType: null, regime: null, approval: null, legitimacy: null, unrest: null,
      status: null, formationType: null, confidence: null, governingParty: null,
      headOfGovernment: null, executive: null, legislature: null,
    };
    // Real nation data reaches the Nations surface through loadWorldOverview.
    const loadNations = async () => ({
      era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: "CA",
      nations: [
        { id: "US", name: "United States", playable: true, currency: "USD",
          economy: { gdpMillions: 387_000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: -1.25 },
          government: emptyGovernment },
        { id: "FR", name: "France", playable: false, currency: "FRF",
          economy: { gdpMillions: 47_000, growthRate: 0.035, inflationRate: 0.025, unemploymentRate: 0.02, outputGap: 0 },
          government: emptyGovernment },
      ],
      homeRegion: null,
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadNations} world={world} busy={false} onAdvanceTurn={onAdvanceTurn} onSave={onSave} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);

    await navigate(user, "Nations");
    // The reference "switch nation view": changes only the viewed nation.
    const view = await screen.findByRole("combobox", { name: "Nation view" });
    await user.selectOptions(view, "FR");
    expect(await screen.findByRole("heading", { name: "France" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Nation context" })).getByRole("note")).toHaveTextContent("Your country is United States (US)");

    // Leaving and returning keeps the original nation browse context...
    await navigate(user, "Profile");
    await navigate(user, "Nations");
    expect(await screen.findByRole("heading", { name: "France" })).toBeInTheDocument();

    // ...and switching the nation view never touched save, actions or the turn.
    expect(onSave).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    expect(onAdvanceTurn).not.toHaveBeenCalled();
    expect(world.turn).toBe(1);
    expect(world.countryId).toBe("US");
  });

  it("shows empty states explicitly for each collection", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ metrics: [], parties: [], elections: [], news: [], actions: [] });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Actions");
    expect(screen.getByText("No actions available.")).toBeInTheDocument();
    await navigate(user, "Parties");
    expect(screen.getByText("No parties in this world.")).toBeInTheDocument();
    await navigate(user, "Elections");
    expect(screen.getByText("No elections scheduled.")).toBeInTheDocument();
    await navigate(user, "News");
    expect(screen.getByText("No news yet.")).toBeInTheDocument();
  });

  it("reflects busy disabling actions and shows message and error", async () => {
    const world = makeWorld();
    const onAction = vi.fn();
    const { rerender } = render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={true} message="Advancing" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    expect(screen.getByText("Advancing")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("button", { name: /end turn/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save game/i })).toBeDisabled();
    rerender(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} error="Save failed" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    expect(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("alert")).toHaveTextContent("Save failed");
  });

  it("invokes onAdvanceTurn, onSave, onExit", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    const onAdvanceTurn = vi.fn();
    const onSave = vi.fn();
    const onExit = vi.fn();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={onAdvanceTurn} onSave={onSave} onExit={onExit} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: /end turn/i }));
    await user.click(screen.getByRole("button", { name: /save game/i }));
    await user.click(screen.getByRole("button", { name: /exit game/i }));
    expect(onAdvanceTurn).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("performs action with params and respects disabledReason", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      actions: [
        { id: "blocked", name: "Blocked", description: "no", cost: 1, available: false, disabledReason: "Need more influence" },
        { id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    expect(screen.getAllByText("Need more influence").length).toBeGreaterThan(0);
    const takeButtons = screen.getAllByRole("button", { name: /take action/i });
    const available = takeButtons.find((b) => b.textContent?.includes("Fundraise"));
    expect(available).toBeTruthy();
    const amountInput = screen.getByLabelText(/amount for fundraise/i) as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "25");
    await user.click(available!);
    expect(onAction).toHaveBeenCalledWith("fundraise", expect.objectContaining({ amount: 25 }));
  });

  it("validates amount before invocation and shows error for invalid", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" }],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    const amountInput = screen.getByLabelText(/amount for fundraise/i) as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.click(screen.getByRole("button", { name: /take action: fundraise/i }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText(/positive whole amount/i)).toBeInTheDocument();
  });

  it("action labels distinguish which action", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      actions: [
        { id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" },
        { id: "advertise", name: "Advertise", description: "Run ads", cost: 1, available: true },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Actions");
    expect(screen.getByRole("button", { name: /take action: fundraise/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take action: advertise/i })).toBeInTheDocument();
  });

  it("handles party and region required actions via actual props", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [{ id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", logoUrl: null, members: 80, treasury: 4000, isPlayerParty: false }],
      regions: [{ id: "r2", name: "North" }],
      actions: [
        { id: "endorse", name: "Endorse", description: "Endorse party", cost: 1, available: true, requires: "party" },
        { id: "tour", name: "Tour", description: "Tour region", cost: 1, available: true, requires: "region" },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    const buttons = screen.getAllByRole("button", { name: /take action:/i });
    await user.click(buttons[0]!);
    expect(onAction).toHaveBeenCalledWith("endorse", expect.objectContaining({ partyId: "p2" }));
    await user.click(buttons[1]!);
    expect(onAction).toHaveBeenCalledWith("tour", expect.objectContaining({ regionId: "r2" }));
  });

  it("does not invoke when party or region selection missing", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [],
      regions: [],
      actions: [
        { id: "joinParty", name: "Join Party", description: "Join", cost: 1, available: true, requires: "party" },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    await user.click(screen.getByRole("button", { name: /take action: join party/i }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not render fake disabled feature pages", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const tabs = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("button");
    tabs.forEach((t) => expect(t).not.toBeDisabled());
    expect(tabs.map((t) => t.textContent)).toEqual(["Profile", "Actions", "Ask", "Menu"]);
  });

  it("keeps national figures on Economy, reached through the game menu", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    world.nation.economy.growthRate = 0.031;
    world.nation.economy.inflationRate = 0.046;
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByText("GDP")).not.toBeInTheDocument();
    await navigate(user, "Economy");
    expect(screen.getByRole("region", { name: "Economy" })).toHaveTextContent("GDP");
    expect(screen.getByText("3.1%")).toBeInTheDocument();
    expect(screen.getByText("4.6%")).toBeInTheDocument();
  });

  it("opens World settings from the game menu and submits the complete flag map", async () => {
    const user = userEvent.setup();
    const eventsLabel = WORLD_FEATURE_FLAG_DEFINITIONS.find((definition) => definition.key === "events")!.label;
    const world = makeWorld({ featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS, events: false } });
    const onUpdateWorldFeatureFlags = vi.fn();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={onUpdateWorldFeatureFlags} onAction={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "World settings" })).not.toBeInTheDocument();
    await navigate(user, "World settings");
    expect(screen.getByRole("region", { name: "World settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(WORLD_FEATURE_FLAG_DEFINITIONS.length);
    expect(screen.getByRole("checkbox", { name: eventsLabel })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: eventsLabel }));
    expect(onUpdateWorldFeatureFlags).toHaveBeenCalledTimes(1);
    expect(onUpdateWorldFeatureFlags).toHaveBeenCalledWith({ ...DEFAULT_WORLD_FEATURE_FLAGS, events: true });
  });

  it("disables World settings while busy", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={true} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "World settings");
    for (const toggle of screen.getAllByRole("checkbox")) expect(toggle).toBeDisabled();
  });

  it("opens the national metrics registry and follows its linked destinations", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);

    await navigate(user, "National Metrics");
    const metrics = screen.getByRole("region", { name: "National metrics" });
    expect(within(metrics).getByText("National metrics registry")).toBeInTheDocument();
    expect(within(metrics).getByText("GDP growth")).toBeInTheDocument();

    await navigate(user, "National Budget");
    const budget = screen.getByRole("region", { name: "Budget" });
    await user.click(within(budget).getByRole("button", { name: "Policy" }));
    expect(screen.getByRole("region", { name: "Policy" })).toBeInTheDocument();
  });

  it("election card shows filing deadline, badge, candidates and runs for office", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      elections: [makeElection({ playerCandidate: true, candidateNames: ["Ada", "Bob"] })],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Elections");
    const card = screen.getByRole("article", { name: "General Election" });
    expect(within(card).getByText(/November, Week 1, 1953/)).toBeInTheDocument();
    expect(within(card).getByText("Upcoming")).toBeInTheDocument();
    expect(within(card).getByText("Candidate")).toBeInTheDocument();
    expect(within(card).getByText(/Ada/)).toBeInTheDocument();
    const run = within(card).getByRole("button", { name: /run for office/i });
    expect(run).toBeEnabled();
    await user.click(run);
    expect(onAction).toHaveBeenCalledWith("declareCandidacy", { electionId: "e1" });
  });

  it("shows counted tally, margin and seat chips when the tally has data", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      elections: [makeElection({
        countedVotes: 10000, leaderName: "Ada", leaderShare: 0.6, marginPct: 0.2,
        seatProjection: [{ name: "Ada", seats: 6 }],
      })],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Elections");
    const card = screen.getByRole("article", { name: "General Election" });
    expect(within(card).getByText(/10,000 counted · Ada 60\.0% \(\+20\.0pt\) · seats Ada 6/)).toBeInTheDocument();
  });

  it("shows a corporation holdings strip in the footer when the player holds shares", async () => {
    const world = makeWorld();
    world.finance.holdings = [{ id: "c1", name: "Acme", ticker: "ACM", shares: 3, price: 100, currency: "USD" }];
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const strip = screen.getByLabelText("Corporation holdings");
    expect(within(strip).getByText(/Holdings: 1 position · \$300\.00/)).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Portfolio" })).toBeEnabled();
  });

  it("withdraw candidacy dispatches with electionId and shows reason when unavailable", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      elections: [
        makeElection({
          id: "e9",
          title: "Senate Race",
          candidacy: { id: "withdrawCandidacy", name: "Withdraw", description: "Out", cost: 0, available: false, disabledReason: "Filing closed" },
          winnerNames: ["Bob"],
        }),
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Elections");
    const card = screen.getByRole("article", { name: "Senate Race" });
    expect(within(card).getByText(/winners:.*bob/i)).toBeInTheDocument();
    const withdraw = within(card).getByRole("button", { name: /withdraw candidacy/i });
    expect(withdraw).toBeDisabled();
    expect(within(card).getAllByText(/filing closed/i).length).toBeGreaterThan(0);
    await user.click(withdraw).catch(() => undefined);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("candidacy button is disabled while busy", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={true} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Elections");
    const card = screen.getByRole("article", { name: "General Election" });
    expect(within(card).getByRole("button", { name: /run for office/i })).toBeDisabled();
  });

  it("paginates elections 20 per page so every election stays reachable", async () => {
    const user = userEvent.setup();
    const elections = Array.from({ length: 25 }, (_, i) =>
      makeElection({ id: `e${i}`, title: `Race ${i}`, filingDate: "1954-09-01" }),
    );
    const world = makeWorld({ elections });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Elections");
    expect(screen.getByRole("article", { name: "Race 0" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Race 24" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("article", { name: "Race 24" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Race 0" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /previous page/i }));
    expect(screen.getByRole("article", { name: "Race 0" })).toBeInTheDocument();
  });

  it("party cards join and leave via world.actions availability with candidacy warning", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [
        { id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true },
        { id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", logoUrl: null, members: 80, treasury: 4000, isPlayerParty: false },
      ],
      actions: [
        { id: "joinParty", name: "Join Party", description: "Join", cost: 2, available: true, requires: "party" },
        { id: "leaveParty", name: "Leave Party", description: "Leave", cost: 0, available: true },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    await navigate(user, "Parties");
    expect(screen.getByText(/withdraws your candidacy/i)).toBeInTheDocument();
    for (const p of world.parties) {
      const card = screen.getByText(p.name).closest(".ahd-card") as HTMLElement;
      expect(card.querySelector(`.ahd-mark[data-party-mark="${p.abbreviation}"]`)).not.toBeNull();
    }
    await user.click(screen.getByRole("button", { name: /join tories/i }));
    expect(onAction).toHaveBeenCalledWith("joinParty", { partyId: "p2" });
    await user.click(screen.getByRole("button", { name: /leave labor/i }));
    expect(onAction).toHaveBeenCalledWith("leaveParty", undefined);
  });

  it("shows the legislature office on Profile and through the Legislature tab", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    expect(await screen.findByText("Representative")).toBeInTheDocument();
    await navigate(user, "Legislature");
    expect(screen.getByLabelText("Legislation")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Wage Bill" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "cat-a" });
  });

  it("shows no office on Profile without an office", async () => {
    const world = makeWorld({ legislature: { ...makeWorld().legislature, office: null } });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    expect(await screen.findByText("No office")).toBeInTheDocument();
  });

  it("party join button surfaces disabled reason from world.actions", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      parties: [{ id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", logoUrl: null, members: 80, treasury: 4000, isPlayerParty: false }],
      actions: [{ id: "joinParty", name: "Join Party", description: "Join", cost: 2, available: false, disabledReason: "Cooldown", requires: "party" }],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Parties");
    expect(screen.getByRole("button", { name: /join tories/i })).toBeDisabled();
    expect(screen.getAllByText(/cooldown/i).length).toBeGreaterThan(0);
  });

  it("deep-links from Profile finances into Fundraising and preserves the filter on return", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      actions: [
        { id: "campaign", name: "Campaign", description: "Influence work.", cost: 1, available: true, category: "influence", fundCost: 20000, cooldownTurns: 0 },
        { id: "fundraise", name: "Fundraise", description: "Raise money.", cost: 3, available: true, category: "fundraising", fundCost: 0, cooldownTurns: 0 },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Fundraising actions" }));
    const hub = screen.getByRole("region", { name: "Actions" });
    expect(within(hub).getByRole("tab", { name: /fundraising/i })).toHaveAttribute("aria-selected", "true");
    expect(within(hub).queryByText("Campaign")).not.toBeInTheDocument();
    expect(within(hub).getByText("Fundraise")).toBeInTheDocument();
    await navigate(user, "Profile");
    expect(screen.getByText(/turn 1/i)).toBeInTheDocument();
    await navigate(user, "Actions");
    expect(screen.getByRole("tab", { name: /fundraising/i })).toHaveAttribute("aria-selected", "true");
  });

  it("deep-links from footer funds details into Fundraising", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      actions: [
        { id: "campaign", name: "Campaign", description: "Influence work.", cost: 1, available: true, category: "influence", fundCost: 20000, cooldownTurns: 0 },
        { id: "fundraise", name: "Fundraise", description: "Raise money.", cost: 3, available: true, category: "fundraising", fundCost: 0, cooldownTurns: 0 },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /campaign funds:/i }));
    await user.click(screen.getByRole("button", { name: "Go to Actions" }));
    expect(screen.getByRole("tab", { name: /fundraising/i })).toHaveAttribute("aria-selected", "true");
  });
});

describe("GameScreen navigation menu", () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Menu" }));
    return screen.getByRole("dialog", { name: "Game menu" });
  }

  it("opens a grouped menu with all destinations and closes on selection", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const menuButton = screen.getByRole("button", { name: "Menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    const menu = await openMenu(user);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    // Reference hierarchy: Profile header links, Actions (top-level tab), State,
    // Nation and World (with their sub-groups), Help. No "Character" group.
    expect(within(menu).queryByRole("group", { name: "Character" })).not.toBeInTheDocument();
    for (const label of ["Profile", "Actions", "State", "Nation", "World", "Help"]) {
      expect(within(menu).getByRole("group", { name: label })).toBeInTheDocument();
    }
    const profile = within(menu).getByRole("group", { name: "Profile" });
    expect(within(profile).getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(within(profile).getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(profile).getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(within(profile).getByRole("button", { name: "Portfolio" })).toBeInTheDocument();
    // Actions is its own top-level group, not a member of a "Character" group.
    const actions = within(menu).getByRole("group", { name: "Actions" });
    expect(within(actions).getByRole("button", { name: "Actions" })).toBeInTheDocument();
    const nation = within(menu).getByRole("group", { name: "Nation" });
    await user.click(within(nation).getByRole("button", { name: "Nation" }));
    expect(within(nation).getByRole("group", { name: "Politics" })).toBeInTheDocument();
    expect(within(nation).getByRole("group", { name: "Government" })).toBeInTheDocument();
    expect(within(nation).getByRole("group", { name: "Economy" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Parties" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Legislature" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Elections" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "National Budget" })).toBeInTheDocument();
    const worldGroup = within(menu).getByRole("group", { name: "World" });
    await user.click(within(worldGroup).getByRole("button", { name: "World" }));
    expect(within(worldGroup).getByRole("group", { name: "Economy" })).toBeInTheDocument();
    expect(within(worldGroup).getByRole("button", { name: "Stock market" })).toBeInTheDocument();
    expect(within(worldGroup).getByRole("button", { name: "Bonds" })).toBeInTheDocument();
    expect(within(worldGroup).getByRole("button", { name: "Banking" })).toBeInTheDocument();
    expect(within(worldGroup).getByRole("button", { name: "News" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: "News" }));
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    expect(screen.getByText("Markets rally")).toBeInTheDocument();
  });

  it("closes the menu on Escape and returns focus to the Menu button", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await openMenu(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
  });

  it("navigates to a real Profile route with player data", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Profile" }));
    const region = screen.getByRole("region", { name: "Profile" });
    expect(await within(region).findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(within(region).getByText(/labor/i)).toBeInTheDocument();
    expect(within(region).getByText("Representative")).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("renders Portfolio from world.finance in a region with no tab selected", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Portfolio" }));
    const region = screen.getByRole("region", { name: "Portfolio" });
    expect(within(region).getByText("Acme Steel")).toBeInTheDocument();
    expect(within(region).getByText(/ACME/)).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("button").forEach(t => expect(t).not.toHaveAttribute("aria-current", "page"));
  });

  it("maps the reference Wallet destination to the Portfolio/Finance surface", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    // Reference ExperimentalMobileMenu.tsx:191-197: Wallet -> /portfolio?tab=currency.
    // Native has no forex tab; the wallet surface is Portfolio + Banking.
    await user.click(within(menu).getByRole("button", { name: "Portfolio" }));
    const portfolio = screen.getByRole("region", { name: "Portfolio" });
    expect(within(portfolio).getByText("Cash")).toBeInTheDocument();
    expect(within(portfolio).getByText("Savings")).toBeInTheDocument();
    expect(within(portfolio).getByText("Stock holdings")).toBeInTheDocument();
  });

  it("exposes the avatar/profile identity flow and keeps unreachable reference rows absent", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    // Actions stays reachable from the identity flow: bottom nav + drawer group.
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Actions" })).toBeInTheDocument();
    const menu = await openMenu(user);
    // The avatar/profile menu entry is Native's Profile group (reference profile
    // card links at ExperimentalMobileMenu.tsx:169-197), with Wallet -> Portfolio.
    const identity = within(menu).getByRole("group", { name: "Profile" });
    for (const label of ["Profile", "Notifications", "Settings", "Portfolio"]) {
      expect(within(identity).getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(within(menu).getByRole("group", { name: "Actions" })).toBeInTheDocument();
    // Reference destinations with no Native surface (Hall of Fame, My
    // Corporation, Unions, Crises, Sectors) must not appear as placeholder rows.
    // World map now exists as its own directory route (#73).
    for (const label of ["Hall of Fame", "My Corporation", "Unions", "Crises", "Sectors", "Currency Exchange", "Trade", "IMF"]) {
      expect(within(menu).queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });

  it("renders Banking from world.finance and deposits through the real action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={onAction} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "World" }));
    await user.click(within(menu).getByRole("button", { name: "Banking" }));
    const region = screen.getByRole("region", { name: "Banking" });
    expect(within(region).getByText("First National Bank")).toBeInTheDocument();
    await user.clear(within(region).getByLabelText(/amount/i));
    await user.type(within(region).getByLabelText(/amount/i), "200");
    await user.click(within(region).getByRole("button", { name: /deposit/i }));
    expect(onAction).toHaveBeenCalledWith("depositSavings", { amount: 200 });
  });

  it("menu Actions destination opens the Actions page", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("button", { name: "Actions" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("returns to a tab route from a region route", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Portfolio" }));
    expect(screen.getByRole("region", { name: "Portfolio" })).toBeInTheDocument();
    await navigate(user, "Profile");
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Portfolio" })).not.toBeInTheDocument();
  });
});

describe("GameScreen search", () => {
  it("restores the last query and results, and keeps the opened result selected across route changes", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    const results = {
      query: "France",
      results: [
        { kind: "nation" as const, id: "FR", title: "France", description: "Nation", countryId: "FR" },
        { kind: "nation" as const, id: "US", title: "United States", description: "Nation", countryId: "US" },
      ],
      total: 2,
      facets: {
        kinds: [{ id: "nation", label: "Nations", count: 2 }],
        countries: [{ id: "FR", label: "France", count: 1 }, { id: "US", label: "United States", count: 1 }],
        regions: [],
      },
    };
    const searchWithResults = vi.fn(async () => results);
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={searchWithResults} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Search");
    await user.type(screen.getByLabelText("Search your world"), "France{Enter}");
    await screen.findByRole("button", { name: /France Nation/ });
    await user.selectOptions(screen.getByLabelText("Result kind"), "nation");
    const france = await screen.findByRole("button", { name: /France Nation/ });
    // Opening a result routes to the searched entity.
    await user.click(france);
    expect(screen.getByRole("region", { name: "Nations" })).toBeInTheDocument();
    // Returning to Search restores the query, the filter, the result list and the selection mark.
    await navigate(user, "Search");
    expect(screen.getByLabelText("Search your world")).toHaveValue("France");
    const restored = await screen.findByRole("button", { name: /France Nation/ });
    expect(screen.getByLabelText("Result kind")).toHaveValue("nation");
    expect(restored).toHaveAttribute("aria-current", "true");
    expect(restored).toHaveTextContent("Selected");
    expect(screen.getByRole("button", { name: "United States Nation" })).toBeInTheDocument();
  });

  it("opens the exact referendum record a result points at", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ countryId: "UK", countryName: "United Kingdom" });
    const base = await loadPolitics();
    const loadReferendums = async () => ({
      ...base,
      countryId: "UK", countryName: "United Kingdom",
      referendums: [
        { id: "referendum-SCO-1", kind: "independence" as const, regionId: "SCO", regionName: "Scotland", question: "Should Scotland become an independent country?", status: "completed", phase: "Completed", scope: "Scotland · devolved region", yesShare: 55.1, finalYesShare: 55.1, passed: true, turnout: 68.1, requestedTurn: 10, campaignOpenTurn: 10, campaignCloseTurn: 58, conversionDeadlineTurn: 70, cooldownReadyAtTurn: 130, latestPollTurn: 57, campaign: { active: false, yesUnits: 0, noUnits: 0, playerSide: null, spend: { side: "yes" as const, step: 10, psPerUnit: 1, psAvailable: 0, cost: 10, available: false }, groundGame: { presets: [], cohorts: [], available: false } } },
        { id: "referendum-WAL-1", kind: "independence" as const, regionId: "WAL", regionName: "Wales", question: "Should Wales become an independent country?", status: "polling", phase: "Polling", scope: "Wales · devolved region", yesShare: 30, finalYesShare: null, passed: null, turnout: null, requestedTurn: 20, campaignOpenTurn: 20, campaignCloseTurn: 78, conversionDeadlineTurn: null, cooldownReadyAtTurn: null, latestPollTurn: 30, campaign: { active: false, yesUnits: 0, noUnits: 0, playerSide: null, spend: { side: "yes" as const, step: 10, psPerUnit: 1, psAvailable: 0, cost: 10, available: false }, groundGame: { presets: [], cohorts: [], available: false } } },
      ],
    });
    const searchReferendum = vi.fn(async () => ({
      query: "Scotland",
      results: [{ kind: "referendum" as const, id: "referendum-SCO-1", title: "Should Scotland become an independent country?", description: "Referendum · Scotland", countryId: "UK", regionId: "SCO" }],
      total: 1,
      facets: { kinds: [{ id: "referendum", label: "Referendums", count: 1 }], countries: [{ id: "UK", label: "United Kingdom", count: 1 }], regions: [{ id: "SCO", label: "Scotland", count: 1 }] },
    }));
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadReferendums} search={searchReferendum} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Search");
    await user.type(screen.getByLabelText("Search your world"), "Scotland{Enter}");
    await user.click(await screen.findByRole("button", { name: /Should Scotland/ }));
    expect(screen.getByRole("region", { name: "Referendums" })).toBeInTheDocument();
    // The section selects the record the result pointed at, not the first record.
    expect(screen.getByLabelText("Referendum")).toHaveValue("referendum-SCO-1");
    expect(screen.getByRole("article", { name: "Should Scotland become an independent country?" })).toBeInTheDocument();
  });
});

describe("GameScreen status footer", () => {
  it("persists turn, date, player-paced status and five resource buttons", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    expect(within(footer).getByText(/turn 1/i)).toBeInTheDocument();
    expect(within(footer).getByText(/January, Week 2, 1952/)).toBeInTheDocument();
    expect(within(footer).getByText(/player paced/i)).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /action points/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /campaign funds/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /cash/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /influence/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /favorability/i })).toBeInTheDocument();
  });

  it("leads the footer with the character identity linking to Profile, with the reference-calendar date", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    const identity = within(footer).getByRole("button", { name: "Profile: Ada" });
    expect(identity).toHaveTextContent("Ada");
    expect(within(footer).getByText(/Labor · United States/)).toBeInTheDocument();
    // In-game date on the reference calendar, never the raw ISO clock (#226).
    expect(within(footer).getByText(/January, Week 2, 1952/)).toBeInTheDocument();
    expect(within(footer).queryByText("1953-01-01")).not.toBeInTheDocument();
    // The identity links to Profile from every game route.
    await navigate(user, "Actions");
    expect(screen.getByRole("region", { name: "Actions" })).toBeInTheDocument();
    await user.click(within(footer).getByRole("button", { name: "Profile: Ada" }));
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("captions the resource chips with the reference Profile label ahead of the resource buttons (#223)", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    const group = within(footer).getByRole("group", { name: "Resources" });
    const caption = within(group).getByText("Profile");
    const firstResource = within(group).getByRole("button", { name: /action points/i });
    expect(caption.compareDocumentPosition(firstResource) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no Founding badge without a persisted pre-iteration lifecycle (#223)", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    expect(within(footer).queryByText("Founding")).not.toBeInTheDocument();
  });

  it("renders the Founding badge and pins the frozen era-start date (#223)", () => {
    const world = makeWorld({ foundingActive: true, date: "1953-01-06", turn: 30 });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    const badge = within(footer).getByText("Founding");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/ahd-founding-badge/);
    expect(badge.parentElement?.textContent).toMatch(/January, Week 1, 1953/);
    expect(within(footer).getByRole("button", { name: "Profile: Ada" })).toBeInTheDocument();
  });

  it("maps the resumed calendar through the stamped founding offset with no badge (#223)", () => {
    const world = makeWorld({ turn: 52, date: "1953-02-03", foundingOffset: 48 });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    expect(within(footer).queryByText("Founding")).not.toBeInTheDocument();
    expect(within(footer).getByText(/February, Week 1, 1953/)).toBeInTheDocument();
  });

  it("shows processing status while busy", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={true} message="Advancing" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    expect(within(footer).getByText(/processing/i)).toBeInTheDocument();
    expect(within(footer).queryByText(/player paced/i)).not.toBeInTheDocument();
  });

  it("formats money with finance.currency", () => {
    const world = makeWorld({ finance: makeFinance({ currency: "EUR", cash: 1200, savings: 300 }) });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    const cash = within(footer).getByRole("button", { name: /cash/i });
    expect(cash.getAttribute("aria-label")).toMatch(/€|EUR/);
  });

  it("opens nonmodal cash details with close, real data, and links to Actions, Profile and Portfolio", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    const cash = within(footer).getByRole("button", { name: /cash/i });
    await user.click(cash);
    const dialog = screen.getByRole("dialog", { name: /cash details/i });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(within(dialog).getByText(/1,200/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/per turn/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /go to actions/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /go to profile/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /go to portfolio/i })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo", { name: "Status and primary navigation" })).getByRole("button", { name: /cash/i })).toHaveFocus();
  });

  it("closes resource details on Escape and returns focus", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    await user.click(within(footer).getByRole("button", { name: /influence/i }));
    expect(screen.getByRole("dialog", { name: /influence details/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo", { name: "Status and primary navigation" })).getByRole("button", { name: /influence/i })).toHaveFocus();
  });

  it("opens the local Ask panel from the game menu without leaving the offline game", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    const onSave = vi.fn();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={onSave} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Ask");
    expect(screen.getByRole("region", { name: "Ask" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeInTheDocument();
    // Opening the panel performs no save and no navigation of its own; the
    // offline world stays mounted behind it.
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
  });

  it("lets the elections pager wrap at 320px without losing pager semantics", async () => {
    const user = userEvent.setup();
    const elections = Array.from({ length: 25 }, (_, i) =>
      makeElection({ id: `e${i}`, title: `Race ${i}`, filingDate: "1954-09-01" }),
    );
    const world = makeWorld({ elections });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Elections");
    const prev = screen.getByRole("button", { name: /previous page/i });
    const next = screen.getByRole("button", { name: /next page/i });
    const pager = prev.closest(".ahd-election-pager");
    expect(pager).not.toBeNull();
    // Row wraps instead of clipping long or localized labels at 320px.
    expect(pager!).toHaveStyle({ flexWrap: "wrap" });
    // Full labels stay readable: no icon-only fallback with missing names.
    expect(prev).toHaveAccessibleName("Previous page");
    expect(next).toHaveAccessibleName("Next page");
    expect(prev.textContent).toMatch(/previous/i);
    expect(next.textContent).toMatch(/next/i);
    // Paging semantics preserved across the fix.
    await user.click(next);
    expect(screen.getByRole("article", { name: "Race 24" })).toBeInTheDocument();
    await user.click(prev);
    expect(screen.getByRole("article", { name: "Race 0" })).toBeInTheDocument();
  });

  it("details links navigate to real destinations", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    await user.click(within(footer).getByRole("button", { name: /campaign funds/i }));
    const dialog = screen.getByRole("dialog", { name: /campaign funds details/i });
    await user.click(within(dialog).getByRole("button", { name: /go to portfolio/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Portfolio" })).toBeInTheDocument();
  });
});

describe("GameScreen menu keyboard flow", () => {
  it("focuses and moves between destinations, then focuses the selected page", async () => {
    const user = userEvent.setup();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(makeWorld())} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={makeWorld()} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const drawer = screen.getByRole("dialog", { name: "Game menu" });
    // Profile group order is Profile, Notifications, Settings, Portfolio.
    within(drawer).getByRole("button", { name: "Profile" }).focus();
    await user.keyboard("{Tab}{Tab}{Tab}{Enter}");
    expect(screen.getByRole("region", { name: "Portfolio" })).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
  });
});
