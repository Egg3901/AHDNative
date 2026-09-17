/**
 * #510 search-originated detail returns: the remaining navigation-return gap
 * recorded by PR #524. Search-originated markets, bills/legislation, bonds,
 * regions, nations, and referendum details must return to the preserved
 * search query/filters/results (never browser history) instead of a
 * canonical parent or a lost selection. Plain drawer/deep-link entry keeps
 * today's chromeless surface (no invented parent), and stale result ids
 * render their safe fallbacks with Back to search still intact. Rendered at
 * 320/390px and desktop width. Stacks atop PR #524's bounded return stack.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

function action(
  id: string,
  available = true,
  cost = 0,
  disabledReason?: string,
): ActionView {
  return {
    id,
    name: id,
    description: "",
    cost,
    available,
    ...(disabledReason ? { disabledReason } : {}),
  };
}

function makeFinance() {
  return {
    cash: 1200,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [],
    deposit: action("depositSavings"),
    withdraw: action("withdrawSavings"),
  };
}

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
    player: {
      name: "Ada",
      cash: 1200,
      funds: 5000,
      actions: 3,
      influence: 12,
      favorability: 48,
      partyName: "Labor",
      mode: "career",
      hosPartyId: null,
      homeRegionId: null,
    },
    legislature: {
      office: "Representative",
      proposals: [],
      sponsor: action("sponsorBill", true, 2),
      bills: [],
    },
    metrics: [],
    parties: [
      {
        id: "p1",
        name: "Labor",
        abbreviation: "LAB",
        color: "#dc2626",
        logoUrl: null,
        members: 120,
        treasury: 9000,
        isPlayerParty: true,
      },
    ],
    elections: [
      {
        id: "e1",
        title: "General Election",
        status: "active",
        date: "1954-11-02",
        filingDate: "1954-09-01",
        electionType: "house",
        phase: "upcoming",
        playerCandidate: false,
        candidateNames: ["Polly", "Bob"],
        winnerNames: ["Polly"],
        countedVotes: 100,
        leaderName: "Polly",
        leaderShare: 0.6,
        marginPct: 0.2,
        seatProjection: null,
        candidacy: action("declareCandidacy", true, 1),
      },
    ],
    news: [],
    actions: [action("fundraise", true, 1)],
    regions: [{ id: "r1", name: "Midwest" }],
    finance: makeFinance(),
    polls: { quick: null, full: null },
    notifications: { items: [], unread: 0 },
    nation: {
      countryId: "US",
      countryName: "United States",
      currency: "USD",
      economy: {
        gdpMillions: 100,
        growthRate: 0.04,
        inflationRate: 0.02,
        unemploymentRate: 0.05,
        outputGap: 0,
        primeRate: 3,
        macroHistory: [],
        primeRateHistory: [],
      },
      budget: {
        fiscalYear: 1953,
        gdpAbsolute: 100000000,
        population: 1000000,
        currency: "USD",
        labels: {
          title: "Federal Budget",
          revenueTitle: "Revenue",
          spendingTitle: "Spending",
          debtTitle: "Debt",
          ceilingLabel: "Ceiling",
          debtServiceLabel: "Service",
          transferLabel: "Grants",
          revenue: {},
          spending: {},
        },
        links: [],
        taxRates: [],
        revenue: { components: [], total: 1000 },
        spending: {
          categories: [],
          stateGrants: 0,
          debtInterest: 0,
          total: 800,
          transfers: [],
        },
        surplus: 200,
        treasuryBalance: 4000,
        debt: {
          principal: 0,
          ceiling: 10000,
          interestRate: 0.02,
          debtToGdpRatio: 0,
          creditRating: "AA",
        },
      },
      metrics: { total: 0, categories: [] },
      policy: { taxRates: [], enacted: [] },
    },
    resources: {
      actions: {
        base: 4,
        seat: 0,
        cabinet: 0,
        chair: 0,
        office: 0,
        penalty: 0,
        threshold: 100,
        cap: 200,
        next: 7,
        refresh: 4,
      },
      funds: {
        enabled: true,
        base: 10000,
        donor: 0,
        office: 0,
        tax: 500,
        regularNet: 9500,
      },
      partyInfluence: null,
      nationalInfluence: { current: 0, gain: 0 },
      favorability: {
        current: 48,
        decayThreshold: 60,
        aboveThresholdDecay: 0,
        tierFloor: 30,
        tierCost: 6,
      },
      history: [],
    },
    ...overrides,
  } as GameView;
}

function profileFor(world: GameView): ProfileView {
  return {
    name: world.player.name,
    bio: "",
    avatarUrl: null,
    campaignSongUrl: "",
    campaignSongAutoplay: false,
    country: { id: world.countryId, name: world.countryName },
    homeRegion: null,
    constituency: {
      eligible: false,
      officeType: null,
      regionId: null,
      selected: null,
      options: [],
      unavailableReason: "Unavailable.",
    },
    party: world.player.partyName
      ? { id: "p1", name: world.player.partyName, color: "#dc2626" }
      : null,
    office: world.legislature.office,
    officeDestination: world.legislature.office
      ? { route: "legislature" }
      : null,
    policies: null,
    stats: null,
    demographics: null,
    profileHeaderUrl: null,
    careerHistory: [],
    achievements: [],
    achievementProgress: { earned: 0, available: 0 },
    lockedAchievements: [],
    unavailableAchievements: [],
    resourceDetails: world.resources,
    standing: {
      actions: world.player.actions,
      actionCap: 200,
      actionGain: 4,
      politicalInfluence: world.player.influence,
      nationalInfluence: null,
      favorability: world.player.favorability,
      infamy: 0,
      partyInfluence: null,
    },
    finances: {
      currency: world.finance.currency,
      cash: world.finance.cash,
      savings: world.finance.savings,
      funds: world.player.funds,
      donorBaseLevel: 0,
      regularIncome: 9500,
      donorIncome: 0,
    },
  };
}

const partyDetail: PoliticsPartyDetail = {
  id: "p1",
  name: "Labor",
  abbreviation: "LAB",
  color: "#dc2626",
  logoUrl: null,
  members: 120,
  treasury: 9000,
  isPlayerParty: true,
  economicPosition: -2,
  socialPosition: -1,
  tier: "major",
  organization: 5,
  politicalStrength: 7,
  leaderName: "Ada",
  viceLeaderName: null,
  treasurerName: null,
  memberNames: ["Ada"],
  join: action("joinParty", false, 0, "Already a member."),
  leave: action("leaveParty", true, 1),
};

function makePolitics(): PoliticsView {
  return {
    countryId: "US",
    countryName: "United States",
    currency: "USD",
    playerPartyId: "p1",
    parties: [partyDetail],
    elections: [],
    referendums: [],
    referendumRequest: {
      applicable: false,
      note: "Referendums are only available in the UK in this local slice.",
      regions: [],
      action: action("requestReferendum", false, 0, "Referendums are UK-only."),
    },
    politicians: [],
  };
}

const emptyGov = {
  governmentType: null,
  regime: null,
  approval: null,
  legitimacy: null,
  unrest: null,
  status: null,
  formationType: null,
  confidence: null,
  governingParty: null,
  headOfGovernment: null,
  executive: null,
  legislature: null,
};
const loadWorldOverview = async () => ({
  era: "1953",
  turn: 1,
  date: "1953-01-01",
  playerCountryId: "US",
  playerHomeRegionId: null,
  nations: [
    {
      id: "US",
      name: "United States",
      playable: true,
      currency: "USD",
      economy: {
        gdpMillions: 387000,
        growthRate: 0.046,
        inflationRate: 0.0075,
        unemploymentRate: 0.029,
        outputGap: -1.25,
      },
      government: emptyGov,
    },
  ],
  homeRegion: null,
});
const loadRegions = async () => ({
  era: "1953",
  turn: 1,
  date: "1953-01-01",
  playerCountryId: "US",
  playerCountryName: "United States",
  playerHomeRegionId: null,
  currency: "USD",
  directoryQuery: "",
  directoryPage: 0,
  directoryPageSize: 20,
  directoryTotal: 1,
  directoryPageCount: 1,
  directory: [
    {
      id: "CA",
      name: "California",
      isHome: false,
      population: 120,
      gdpMillions: 50,
    },
  ],
  selected: null,
});
const loadCaucusManagement = async (): Promise<CaucusManagementView> => ({
  countryId: "US",
  countryName: "United States",
  currency: "USD",
  playerPartyId: "p1",
  playerPartyName: "Labor",
  playerCaucusId: null,
  playerCaucusName: null,
  caucusCount: 0,
  create: {
    actionCost: 4,
    fundCost: 25000,
    fundsRequired: 25000,
    funds: 152000,
    actions: 9,
    cooldownRemaining: 0,
    taxMin: 0,
    taxMax: 5,
    nameMinLength: 3,
    available: true,
    effect: {
      partyFundsDelta: -25000,
      partyMembership: "none",
      caucusMembership: "create",
      clearsCaucusMembership: false,
      startsPartySwitchCooldown: false,
    },
    consequences: [],
    action: action("createCaucus", true, 4),
  },
  caucuses: [],
});
const loadPartyManagement = async (): Promise<PartyManagementView> => ({
  countryId: "US",
  countryName: "United States",
  currency: "USD",
  playerPartyName: "Labor",
  partyCount: 1,
  foundedCount: 0,
  charterDeadlineTurns: 14,
  founding: {
    actionCost: 8,
    fundCost: 100000,
    fundsRequired: 100000,
    funds: 152000,
    actions: 9,
    cooldownRemaining: 0,
    charterDeadlineTurns: 14,
    available: true,
    effect: {
      partyFundsDelta: -100000,
      partyMembership: "found",
      caucusMembership: "none",
      clearsCaucusMembership: true,
      startsPartySwitchCooldown: true,
    },
    consequences: [],
    action: action("foundParty", true, 8),
  },
  parties: [],
  charters: [],
});
const loadBondMarket = async () => ({
  turn: 1,
  date: "1953-01-01",
  playerCountryId: "US",
  playerCash: 10000,
  currency: "USD",
  buy: { cost: 1 },
  sell: { cost: 1 },
  bonds: [],
});
const loadMarkets = async () => ({
  playerCountryId: "US",
  playerCash: 1200,
  playerCurrency: "USD",
  playerActions: 3,
  turn: 1,
  marketsPhaseEnabled: true,
  economyPhaseEnabled: true,
  corporationsPhaseEnabled: true,
  countries: [],
  listings: [],
  sectors: [],
});
const loadLegislation = async () => ({
  office: null,
  playerChamberKey: null,
  countryId: "US",
  chambers: [],
  committees: [],
  schedule: [],
  proposals: [],
  selectedBill: null,
  selectedProposal: null,
  sponsorSupportsLevelChoice: false as const,
  sponsorSupportsTaxRateChoice: true as const,
  levelChoiceNote: "",
});

/** One result per gap-route kind, plus a stale company id under "ghost". */
const searchFn = async (query: string) => {
  const empty = {
    query,
    results: [],
    total: 0,
    facets: { kinds: [], countries: [], regions: [] },
  };
  if (query.trim() === "") return empty;
  if (query.trim() === "ghost") {
    return {
      query,
      results: [
        {
          kind: "company" as const,
          id: "ghost-co",
          title: "Ghost Corp",
          description: "Company · dissolved",
          countryId: "US",
        },
      ],
      total: 1,
      facets: { kinds: [], countries: [], regions: [] },
    };
  }
  return {
    query,
    results: [
      {
        kind: "company" as const,
        id: "c1",
        title: "Acme Corp",
        description: "US · media",
        countryId: "US",
      },
      {
        kind: "bill" as const,
        id: "b1",
        title: "Acme Bill",
        description: "Bill · proposed",
        countryId: "US",
      },
      {
        kind: "bond" as const,
        id: "bd1",
        title: "Acme bond",
        description: "Bond · 5% · matures turn 9",
        countryId: "US",
      },
      {
        kind: "region" as const,
        id: "CA",
        title: "California",
        description: "Region · United States",
        countryId: "US",
        regionId: "CA",
      },
      {
        kind: "nation" as const,
        id: "US",
        title: "United States",
        description: "Nation",
        countryId: "US",
      },
      {
        kind: "referendum" as const,
        id: "ref1",
        title: "Acme Referendum",
        description: "Referendum · California",
        countryId: "US",
        regionId: "CA",
      },
    ],
    total: 6,
    facets: {
      kinds: [{ id: "company", label: "Companies", count: 1 }],
      countries: [],
      regions: [],
    },
  };
};

function baseProps(world: GameView) {
  return {
    loadProfile: async () => profileFor(world),
    search: searchFn,
    loadBondMarket,
    loadRegions,
    loadCaucusManagement,
    loadCabinetOffice: async () => ({
      countryId: "US",
      countryName: "United States",
      turn: 1,
      isExecutive: false,
      regions: [{ id: "CA", name: "California" }],
      positions: [],
      activeOrders: [],
    }),
    onIssueCabinetOrder: vi.fn(),
    loadPartyManagement,
    loadMarkets,
    loadLegislation,
    loadPolitics: async () => makePolitics(),
    loadWorldOverview,
    world,
    busy: false,
    onAdvanceTurn: vi.fn(),
    onSave: vi.fn(),
    onExit: vi.fn(),
    onUpdateWorldFeatureFlags: vi.fn(),
    onAction: vi.fn(),
    preferences: DEFAULT_PREFERENCES,
    onPreferencesChange: vi.fn(),
    onUpdateProfile: vi.fn(async () => true),
    onSelectConstituency: vi.fn(async () => true),
    onMarkNotificationRead: vi.fn(),
    onDeleteNotification: vi.fn(),
    onMarkAllNotificationsRead: vi.fn(),
  };
}

/** Drawer reachability: bottom tabs first, then the menu dialog with group expansion. */
async function gotoDrawer(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  const direct = primary.queryByRole("button", { name: label });
  if (direct) {
    await user.click(direct);
    return;
  }
  await user.click(primary.getByRole("button", { name: "Menu" }));
  const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
  let destination = menu.queryByRole("button", { name: label });
  if (!destination) {
    const collapsed = MENU_GROUPS.find((group) =>
      group.sections?.some((section) =>
        section.items.some((item) => item.label === label),
      ),
    );
    if (collapsed) {
      await user.click(menu.getByRole("button", { name: collapsed.label }));
      destination = menu.getByRole("button", { name: label });
    }
  }
  expect(destination).not.toBeNull();
  await user.click(destination!);
}

/** Search for the shared fixture query and open the result with the given title. */
async function searchAndOpen(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  title: string,
) {
  await gotoDrawer(user, "Search");
  await user.type(
    screen.getByRole("searchbox", { name: "Search your world" }),
    query,
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  // Anchor on the title start: descriptions ("Region · United States")
  // would otherwise match several result buttons at once.
  await user.click(
    await screen.findByRole("button", { name: new RegExp(`^${title}`) }),
  );
}

/** Back to search restores the preserved query, result list, and selection. */
async function expectSearchRestored(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  countText: RegExp,
  openedKind: string,
) {
  await user.click(screen.getByRole("button", { name: "Back to search" }));
  expect(screen.getByRole("region", { name: "Search" })).toBeInTheDocument();
  expect(
    screen.getByRole("searchbox", { name: "Search your world" }),
  ).toHaveValue(query);
  expect(screen.getByText(countText)).toBeInTheDocument();
  expect(screen.getByText(/· Selected/)).toBeInTheDocument();
  expect(
    screen
      .getByRole("region", { name: "Search" })
      .textContent?.includes(openedKind),
  ).toBe(true);
}

const SEARCH_ORIGIN_CASES = [
  { drawer: "Stock market", region: "Stock market", title: "Acme Corp" },
  {
    drawer: "Bills and proposals",
    region: "Legislation details",
    title: "Acme Bill",
  },
  { drawer: "Bonds", region: "Bond market", title: "Acme bond" },
  { drawer: "Regions", region: "Regions", title: "California" },
  { drawer: "Nations", region: "Nations", title: "United States" },
  { drawer: "Referendums", region: "Referendums", title: "Acme Referendum" },
];

describe("search-originated detail returns (#510)", () => {
  it.each(SEARCH_ORIGIN_CASES)(
    "returns from search-opened $region to the preserved query/results",
    async ({ region, title }) => {
      setViewport(390);
      const user = userEvent.setup();
      render(<GameScreen {...baseProps(makeWorld())} />);
      await searchAndOpen(user, "acme", title);
      expect(screen.getByRole("region", { name: region })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to search" }),
      ).toBeInTheDocument();
      await expectSearchRestored(
        user,
        "acme",
        /6 of 6 matches for acme/,
        title,
      );
    },
  );

  it.each([320, 1280])(
    "returns from a search-opened company at %spx with the snapshot intact",
    async (width) => {
      setViewport(width);
      const user = userEvent.setup();
      render(<GameScreen {...baseProps(makeWorld())} />);
      await searchAndOpen(user, "acme", "Acme Corp");
      expect(
        screen.getByRole("region", { name: "Stock market" }),
      ).toBeInTheDocument();
      await expectSearchRestored(
        user,
        "acme",
        /6 of 6 matches for acme/,
        "Acme Corp",
      );
    },
  );

  it("keeps plain drawer visits chromeless with no invented search parent", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    for (const { drawer, region } of SEARCH_ORIGIN_CASES) {
      await gotoDrawer(user, drawer);
      expect(
        await screen.findByRole("region", { name: region }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Back to search" }),
      ).not.toBeInTheDocument();
    }
  });

  it("renders a stale search result id safely and still returns to search", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await searchAndOpen(user, "ghost", "Ghost Corp");
    // The dissolved company falls back to the market empty state, never a
    // crash, and the stacked search surface is still live below it.
    expect(
      screen.getByRole("region", { name: "Stock market" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to search" }),
    ).toBeInTheDocument();
    await expectSearchRestored(
      user,
      "ghost",
      /1 of 1 matches for ghost/,
      "Ghost Corp",
    );
  });

  it("preserves the selected result-kind filter across the round trip", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Search");
    await user.type(
      screen.getByRole("searchbox", { name: "Search your world" }),
      "acme",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Result kind" }),
      "company",
    );
    await user.click(await screen.findByRole("button", { name: /^Acme Corp/ }));
    expect(
      screen.getByRole("region", { name: "Stock market" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to search" }));
    expect(screen.getByRole("region", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Result kind" })).toHaveValue(
      "company",
    );
    expect(screen.getByText(/· Selected/)).toBeInTheDocument();
  });
});
