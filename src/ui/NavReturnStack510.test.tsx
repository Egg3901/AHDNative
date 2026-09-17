/**
 * #510 multi-level detail returns: the next layer above PR #517's single-slot
 * origin. A bounded return stack (never browser history) walks chains such as
 * race -> politician -> race and search -> result -> nested detail -> search,
 * restoring each level's selection (race/politician detail id, search snapshot)
 * step by step. Drawer, deep-link, and notification entry clear the whole
 * stack back to canonical parents; frames whose detail id no longer exists in
 * the world are skipped instead of restoring stale details. Rendered at
 * 320/390px and desktop width.
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
import type { NotificationItem } from "../game/notifications";
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
    news: [
      {
        id: "n1",
        title: "Markets rally",
        body: "Stocks up.",
        date: "1953-02-01",
      },
    ],
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

/** One live race with a winner link into the politicians surface, and back. */
function makePolitics(): PoliticsView {
  return {
    countryId: "US",
    countryName: "United States",
    currency: "USD",
    playerPartyId: "p1",
    parties: [partyDetail],
    elections: [
      {
        id: "e1",
        title: "General Election",
        status: "active",
        date: "1954-11-02",
        filingDate: "1954-09-01",
        phase: "primary",
        playerCandidate: false,
        candidates: [
          {
            id: "pol1",
            name: "Polly",
            partyId: "p1",
            partyName: "Labor",
            incumbent: false,
            isPlayer: false,
            votes: 60,
            voteShare: 0.6,
            winner: true,
          },
        ],
        winnerNames: ["Polly"],
        winnerIds: ["pol1"],
        totalVotes: 100,
        stages: [],
        primary: {
          applicable: false,
          open: false,
          resolved: false,
          endTurn: 0,
          endDate: "",
          snapshotTurn: null,
          totalBallots: null,
          parties: [],
        },
        candidacy: action("declareCandidacy", true, 1),
        playerCampaign: null,
        presidential: null,
        projection: {
          resolved: false,
          countedVotes: null,
          leaderName: null,
          leaderShare: null,
          runnerUpName: null,
          marginPct: null,
          seats: null,
          snapshotTurn: null,
          drivers: [],
          projected: null,
        },
      },
    ],
    referendums: [],
    referendumRequest: {
      applicable: false,
      note: "Referendums are only available in the UK in this local slice.",
      regions: [],
      action: action("requestReferendum", false, 0, "Referendums are UK-only."),
    },
    politicians: [
      {
        id: "pol1",
        name: "Polly",
        partyId: "p1",
        partyName: "Labor",
        office: null,
        age: 40,
        economic: 0,
        social: 0,
        influence: 10,
        favorability: 50,
        infamy: 0,
        activeRaceIds: ["e1"],
      },
    ],
  };
}

function notif(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "t1-a",
    key: "a",
    turn: 1,
    date: "1953-01-01",
    category: "election",
    title: "Filing open: General Election",
    body: "File soon.",
    unread: true,
    actionRequired: true,
    destination: { route: "electionDetails", detailId: "e1" },
    ...overrides,
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
const loadCabinetOffice = async () => ({
  countryId: "US",
  countryName: "United States",
  turn: 1,
  isExecutive: false,
  regions: [{ id: "CA", name: "California" }],
  positions: [
    {
      id: "treasury",
      name: "Secretary of the Treasury",
      holderName: "Ada",
      isPlayerHolder: true,
      isVacant: false,
      actionsRemaining: 3,
      canIssue: true,
      orders: [],
    },
  ],
  activeOrders: [],
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
const searchFn = async (query: string) =>
  query.trim() === ""
    ? {
        query,
        results: [],
        total: 0,
        facets: { kinds: [], countries: [], regions: [] },
      }
    : {
        query,
        results: [
          {
            kind: "election" as const,
            id: "e1",
            title: "General Election",
            description: "Election · active",
            countryId: "US",
          },
        ],
        total: 1,
        facets: { kinds: [], countries: [], regions: [] },
      };

function baseProps(world: GameView) {
  return {
    loadProfile: async () => profileFor(world),
    search: searchFn,
    loadBondMarket,
    loadRegions,
    loadCaucusManagement,
    loadCabinetOffice,
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

/** Drill two levels: elections list -> race detail -> politician detail. */
async function drillToPolitician(user: ReturnType<typeof userEvent.setup>) {
  await gotoDrawer(user, "Elections");
  await user.click(
    await screen.findByRole("button", { name: "View race details" }),
  );
  await user.click(await screen.findByRole("button", { name: "Polly" }));
  expect(
    screen.getByRole("region", { name: "Politicians" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Back to election details" }),
  ).toBeInTheDocument();
}

describe.each([320, 390, 1280])(
  "multi-level detail returns at %spx (#510)",
  (width) => {
    it("walks race -> politician -> race and steps back through every level", async () => {
      setViewport(width);
      const user = userEvent.setup();
      render(<GameScreen {...baseProps(makeWorld())} />);
      await gotoDrawer(user, "Elections");
      await user.click(
        await screen.findByRole("button", { name: "View race details" }),
      );
      expect(
        screen.getByRole("region", { name: "Election details" }),
      ).toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Polly" }));
      expect(
        screen.getByRole("region", { name: "Politicians" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to election details" }),
      ).toBeInTheDocument();
      // Nested detail: politician back into the same race pushes a third level.
      await user.click(
        screen.getByRole("button", { name: "View General Election" }),
      );
      expect(
        screen.getByRole("region", { name: "Election details" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to politicians" }),
      ).toBeInTheDocument();
      // Step back one level: the politician selection is restored, and the
      // stack still holds the race below it (single-slot implementations lose it).
      await user.click(
        screen.getByRole("button", { name: "Back to politicians" }),
      );
      expect(
        screen.getByRole("region", { name: "Politicians" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("article", { name: "Polly" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to election details" }),
      ).toBeInTheDocument();
      // Step back again: the race selection is restored, then the list root.
      await user.click(
        screen.getByRole("button", { name: "Back to election details" }),
      );
      expect(
        screen.getByRole("region", { name: "Election details" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("article", { name: "General Election" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to elections" }),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Back to elections" }),
      );
      expect(
        screen.getByRole("region", { name: "Elections" }),
      ).toBeInTheDocument();
    });

    it("returns search -> result -> nested detail -> search with the snapshot intact", async () => {
      setViewport(width);
      const user = userEvent.setup();
      render(<GameScreen {...baseProps(makeWorld())} />);
      await gotoDrawer(user, "Search");
      await user.type(
        screen.getByRole("searchbox", { name: "Search your world" }),
        "e1",
      );
      await user.click(screen.getByRole("button", { name: "Search" }));
      await user.click(
        await screen.findByRole("button", { name: /General Election/ }),
      );
      expect(
        screen.getByRole("region", { name: "Election details" }),
      ).toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Polly" }));
      expect(
        screen.getByRole("region", { name: "Politicians" }),
      ).toBeInTheDocument();
      // Nested Back restores the race, and the search surface is still stacked
      // below it (single-slot implementations fall back to the elections list).
      await user.click(
        screen.getByRole("button", { name: "Back to election details" }),
      );
      expect(
        screen.getByRole("region", { name: "Election details" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to search" }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Back to search" }));
      expect(
        screen.getByRole("region", { name: "Search" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("searchbox", { name: "Search your world" }),
      ).toHaveValue("e1");
      expect(screen.getByText(/1 of 1 matches for e1/)).toBeInTheDocument();
      expect(screen.getByText(/· Selected/)).toBeInTheDocument();
    });
  },
);

describe("return-stack entry and staleness (#510)", () => {
  it("resets notification and drawer entry from depth to canonical parents", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const world = makeWorld({ notifications: { items: [notif()], unread: 1 } });
    render(<GameScreen {...baseProps(world)} />);
    await drillToPolitician(user);
    // One more nested level: politician back into the race, three frames deep.
    await user.click(
      screen.getByRole("button", { name: "View General Election" }),
    );
    expect(
      screen.getByRole("button", { name: "Back to politicians" }),
    ).toBeInTheDocument();
    // Notification entry clears the whole stack: the race keeps its pinned
    // canonical parent instead of the politicians surface above it.
    await gotoDrawer(user, "Notifications");
    const inbox = screen.getByRole("region", { name: "Notifications" });
    await user.click(
      within(inbox).getByRole("button", {
        name: "Open notification: Filing open: General Election",
      }),
    );
    await user.click(
      within(
        screen.getByRole("region", { name: "Notification detail" }),
      ).getByRole("button", { name: /view election/i }),
    );
    expect(
      screen.getByRole("region", { name: "Election details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to elections" }),
    ).toBeInTheDocument();
    // Drawer entry clears again: a fresh party drill keeps the list parent.
    await drillToPolitician(user);
    await gotoDrawer(user, "Parties");
    await user.click(
      screen.getByRole("button", { name: "View Labor details" }),
    );
    expect(
      screen.getByRole("button", { name: "Back to parties" }),
    ).toBeInTheDocument();
  });

  it("caps deep chains and still unwinds to the canonical list", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Elections");
    await user.click(
      await screen.findByRole("button", { name: "View race details" }),
    );
    // Bounce race <-> politician past the 5-frame cap: each round trip
    // pushes two frames, so the oldest (the elections list origin) drops.
    for (let i = 0; i < 4; i += 1) {
      await user.click(await screen.findByRole("button", { name: "Polly" }));
      await user.click(
        await screen.findByRole("button", { name: "View General Election" }),
      );
    }
    // Unwind: every Back restores a live surface and the chain terminates at
    // the canonical elections list instead of looping on evicted frames.
    let backs = 0;
    while (!screen.queryByRole("region", { name: "Elections" }) && backs < 10) {
      await user.click(screen.getByRole("button", { name: /^Back to / }));
      backs += 1;
    }
    expect(
      screen.getByRole("region", { name: "Elections" }),
    ).toBeInTheDocument();
    // 5 capped pops plus the canonical fallback back to the list.
    expect(backs).toBeLessThanOrEqual(6);
  });

  it("skips return frames whose detail no longer exists", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const props = baseProps(makeWorld());
    const { rerender } = render(<GameScreen {...props} />);
    await drillToPolitician(user);
    // The race is gone from the world (resolved/removed under the stack): the
    // stale race frame is skipped to the live elections list, never restored.
    rerender(<GameScreen {...props} world={makeWorld({ elections: [] })} />);
    expect(
      screen.getByRole("button", { name: "Back to elections" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to elections" }));
    expect(
      screen.getByRole("region", { name: "Elections" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No elections scheduled.")).toBeInTheDocument();
  });
});
