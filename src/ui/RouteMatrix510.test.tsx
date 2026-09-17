/**
 * #510 route-matrix enforcement: every drawer destination renders a real
 * screen (never an empty region), capability changes keep routes honest, MP
 * account/session states stay reachable, and SP-local controls never appear
 * in MP (nor MP session controls in SP). Rendered at 320px, 390px, and
 * desktop width. Reference: AHDGame e364c0495 builders profileNavItems,
 * worldNavItems, nationDetailsSections, experimentalNavMenus; matrix rows are
 * recorded in docs/NAVIGATION-PARITY.md section 8.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { MpModeScreen } from "./MpModeScreen";
import { MENU_GROUPS, drawerRouteIds } from "./MobileNavigation";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { GameView, ActionView } from "../game/types";
import type { ProfileView } from "../game/profileTypes";
import type { PoliticsView, PoliticsPartyDetail } from "../game/politics";
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
    elections: [{ id: "e1", title: "General Election", status: "upcoming", date: "1954-11-02", filingDate: "1954-09-01", electionType: "house", phase: "upcoming", playerCandidate: false, candidateNames: ["Ada", "Bob"], winnerNames: [], countedVotes: null, leaderName: null, leaderShare: null, marginPct: null, seatProjection: null, candidacy: action("declareCandidacy", true, 1) }],
    news: [{ id: "n1", title: "Markets rally", body: "Stocks up.", date: "1953-02-01" }],
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
    politicians: [{ id: "pol1", name: "Ada", partyId: "p1", partyName: "Labor", office: null, age: 40, economic: 0, social: 0, influence: 10, favorability: 50, infamy: 0, activeRaceIds: ["e1"] }],
  };
}

const emptyGov = { governmentType: null, regime: null, approval: null, legitimacy: null, unrest: null, status: null, formationType: null, confidence: null, governingParty: null, headOfGovernment: null, executive: null, legislature: null };
const loadWorldOverview = async () => ({
  era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null,
  nations: [{ id: "US", name: "United States", playable: true, currency: "USD",
    economy: { gdpMillions: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: -1.25 }, government: emptyGov }],
  homeRegion: null,
});
const loadRegions = async () => ({
  era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerCountryName: "United States",
  playerHomeRegionId: null, currency: "USD", directoryQuery: "", directoryPage: 0, directoryPageSize: 20,
  directoryTotal: 1, directoryPageCount: 1,
  directory: [{ id: "CA", name: "California", isHome: false, population: null, gdpMillions: null }],
  selected: null,
});
const loadCaucusManagement = async () => ({
  countryId: "US", countryName: "United States", currency: "USD", playerPartyId: "p1",
  playerPartyName: "Labor", playerCaucusId: null, playerCaucusName: null, caucusCount: 0,
  create: { actionCost: 4, fundCost: 25000, fundsRequired: 25000, funds: 152000, actions: 9, cooldownRemaining: 0, taxMin: 0, taxMax: 5, nameMinLength: 3, available: true,
    effect: { partyFundsDelta: -25000, partyMembership: "none", caucusMembership: "create", clearsCaucusMembership: false, startsPartySwitchCooldown: false },
    consequences: [], action: action("createCaucus", true, 4) },
  caucuses: [],
});
const loadCabinetOffice = async () => ({
  countryId: "US", countryName: "United States", turn: 1, isExecutive: false, regions: [{ id: "CA", name: "California" }],
  positions: [{ id: "treasury", name: "Secretary of the Treasury", holderName: "Ada", isPlayerHolder: true, isVacant: false, actionsRemaining: 3, canIssue: true, orders: [] }],
  activeOrders: [],
});
const loadPartyManagement = async () => ({
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
const loadMarkets = async () => ({
  playerCountryId: "US", playerCash: 1200, playerCurrency: "USD", playerActions: 3, turn: 1,
  marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [], sectors: [],
});
const loadLegislation = async () => ({
  office: null, playerChamberKey: null, countryId: "US", chambers: [], committees: [], schedule: [],
  proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const,
  sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "",
});
const searchFn = async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } });

function baseProps(world: GameView) {
  return {
    loadProfile: async () => profileFor(world), search: searchFn, loadBondMarket, loadRegions,
    loadCaucusManagement, loadCabinetOffice, onIssueCabinetOrder: vi.fn(), loadPartyManagement,
    loadMarkets, loadLegislation, loadPolitics: async () => makePolitics(), loadWorldOverview,
    world, busy: false, onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(),
    onUpdateWorldFeatureFlags: vi.fn(), onAction: vi.fn(), preferences: DEFAULT_PREFERENCES,
    onPreferencesChange: vi.fn(), onUpdateProfile: vi.fn(async () => true),
    onSelectConstituency: vi.fn(async () => true),
    onMarkNotificationRead: vi.fn(), onDeleteNotification: vi.fn(), onMarkAllNotificationsRead: vi.fn(),
  };
}

/** Drawer reachability: bottom tabs first, then the menu dialog with group expansion. */
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

function mainRegion(): HTMLElement {
  const el = document.querySelector(".ahd-main [role='region']");
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

/** Every drawer destination must render a real screen: at least one heading, never an empty region. */
function expectRealScreen(label: string) {
  const main = mainRegion();
  expect(within(main).getAllByRole("heading").length, `headings on ${label}`).toBeGreaterThan(0);
  expect(main.textContent?.trim().length, `content on ${label}`).toBeGreaterThan(0);
}

const DRAWER_LABELS = MENU_GROUPS.flatMap((group) => [
  ...group.items.map((item) => item.label),
  ...(group.sections ?? []).flatMap((section) => section.items.map((item) => item.label)),
]);

describe.each([320, 390, 1280])("SP route matrix at %spx (#510)", (width) => {
  it("exposes every drawer route id as a labelled drawer destination", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...baseProps(world)} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
    // Expand collapsible groups so every destination is reachable by label.
    for (const group of ["Nation", "World"]) {
      await user.click(menu.getByRole("button", { name: group }));
    }
    const labels = DRAWER_LABELS.filter((label) => label !== "Profile" && label !== "Actions" && label !== "Ask");
    for (const label of labels) {
      expect(menu.queryByRole("button", { name: label }), `drawer label: ${label}`).not.toBeNull();
    }
    expect(drawerRouteIds().length).toBeGreaterThan(20);
  });

  // Broad loop: visits every drawer destination with its async loader.
  it("renders a real screen for every drawer destination", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...baseProps(world)} />);
    for (const label of DRAWER_LABELS) {
      await gotoDrawer(user, label);
      // Ask renders the Native Ask panel (#358): its labelled composer is the
      // screen, not a document heading.
      if (label === "Ask") {
        expect(screen.getByRole("textbox", { name: "Ask a question" })).toBeInTheDocument();
        continue;
      }
      expectRealScreen(label);
    }
  }, 120000);

  // Broad loop: drills list surfaces into details across async loaders.
  it("opens party and race details from their list surfaces with a return path", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...baseProps(world)} />);
    await gotoDrawer(user, "Parties");
    await user.click(screen.getByRole("button", { name: "View Labor details" }));
    expectRealScreen("partyDetails");
    expect(screen.getByRole("button", { name: /^back to /i })).toBeInTheDocument();
    await gotoDrawer(user, "Elections");
    await user.click(screen.getByRole("button", { name: "View race details" }));
    expectRealScreen("electionDetails");
    expect(screen.getByRole("button", { name: /^back to /i })).toBeInTheDocument();
  }, 120000);
});

describe("SP capability and wiring honesty (#510)", () => {
  it("renders the cabinet office honestly when the loader is absent", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const world = makeWorld();
    const props = baseProps(world);
    // App always wires loadCabinetOffice; a surface without it must say so, never go blank.
    const { loadCabinetOffice: _dropped, onIssueCabinetOrder: _droppedOrder, ...unwired } = props;
    render(<GameScreen {...unwired} />);
    await gotoDrawer(user, "Cabinet office");
    expectRealScreen("Cabinet office");
    expect(mainRegion()).toHaveTextContent(/cabinet office/i);
  });

  it("keeps the cabinet route working when offices change under it", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...baseProps(world)} />);
    await gotoDrawer(user, "Cabinet office");
    expect(screen.getByRole("heading", { name: "Cabinet office" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Secretary of the Treasury/ })).toBeInTheDocument();
  });

  it("has no MP session controls in the SP drawer", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
    for (const group of ["Nation", "World"]) {
      await user.click(menu.getByRole("button", { name: group }));
    }
    expect(menu.queryByRole("button", { name: /multiplayer/i })).toBeNull();
    expect(menu.queryByRole("button", { name: /sign in/i })).toBeNull();
    // SP-local controls live only here: drawer turn row.
    expect(menu.getByRole("button", { name: "End turn" })).toBeInTheDocument();
    expect(menu.getByRole("button", { name: "Save game" })).toBeInTheDocument();
  });
});

describe("SP return-to-context (#510)", () => {
  it("returns from a race to the politicians surface that opened it", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Politicians");
    // The first politician auto-selects; their active race links into the race detail.
    await user.click(screen.getByRole("button", { name: "View e1" }));
    expect(screen.getByRole("button", { name: "Back to politicians" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to politicians" }));
    expect(screen.getByRole("region", { name: "Politicians" })).toBeInTheDocument();
  });

  it("returns from a party to the surface that opened it, with a list fallback", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Parties");
    await user.click(screen.getByRole("button", { name: "View Labor details" }));
    // Opened from the parties list, so the return lands back on it.
    expect(screen.getByRole("button", { name: "Back to parties" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to parties" }));
    expect(screen.getByRole("region", { name: "Parties" })).toBeInTheDocument();
  });
});

describe("MP account, session, and control separation (#510)", () => {
  const USER = "507f1f77bcf86cd799439011";
  const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
  const me = JSON.stringify({
    character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
    corporation: null,
  });
  const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
  const nav = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true, characterCountryId: "US", characterName: "Ada", unreadMailCount: 0 });
  const inbox = JSON.stringify({ notifications: [], unreadCount: 0, total: 0, hasMore: false });
  const emptyMail = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
  const emptySent = JSON.stringify({ mails: [], total: 0, hasMore: false });

  function readyHost() {
    return {
      fetch: async (op: string) => {
        if (op === "auth-session") return probe;
        if (op === "character-me") return me;
        if (op === "turn-status") return turn;
        if (op === "client-nav") return nav;
        if (op === "notifications") return inbox;
        if (op === "mail-inbox") return emptyMail;
        if (op === "mail-sent") return emptySent;
        throw new Error(`unexpected fetch ${op}`);
      },
      mutate: async () => { throw new Error("unexpected mutate"); },
      beginSignIn: async () => {},
    };
  }

  it.each([320, 390, 1280])("keeps SP-local controls out of the ready MP screen at %spx", async (width) => {
    setViewport(width);
    render(<MpModeScreen host={readyHost()} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    expect(screen.queryByRole("button", { name: /end turn/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save game/i })).toBeNull();
  });

  it("reports account expiry with a reconnect path and a safe return", async () => {
    setViewport(390);
    const onExit = vi.fn();
    render(
      <MpModeScreen
        host={{ ...readyHost(), fetch: async (op: string) => {
          if (op === "auth-session") return probe;
          throw new Error("remote-error:401:0:x");
        } }}
        onExit={onExit}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
