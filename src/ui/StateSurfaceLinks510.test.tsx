/**
 * #510 home-region surface links: the reference State submenu links the
 * state party page and regional elections
 * (AHDGame e364c0495 ExperimentalMobileMenu.tsx state rows). The offline
 * equivalent opens the national party/race detail for the same recorded
 * engine id through the shell drill callbacks, so Back restores the
 * home-region surface through the return stack instead of a canonical
 * parent. Stale recorded ids fall back to the first live row with Back
 * intact. Rendered at 320/390px and desktop width.
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
    elections: [{ id: "e1", title: "General Election", status: "active", date: "1954-11-02", filingDate: "1954-09-01", electionType: "house", phase: "upcoming", playerCandidate: false, candidateNames: ["Polly", "Bob"], winnerNames: [], countedVotes: null, leaderName: null, leaderShare: null, marginPct: null, seatProjection: null, candidacy: action("declareCandidacy", true, 1) }],
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
    parties: [partyDetail],
    elections: [
      {
        id: "e1", title: "General Election", status: "active", date: "1954-11-02", filingDate: "1954-09-01",
        phase: "primary", playerCandidate: false,
        candidates: [{ id: "pol1", name: "Polly", partyId: "p1", partyName: "Labor", incumbent: false, isPlayer: false, votes: 60, voteShare: 0.6, winner: true }],
        winnerNames: ["Polly"], winnerIds: ["pol1"], totalVotes: 100, stages: [],
        primary: { applicable: false, open: false, resolved: false, endTurn: 0, endDate: "", snapshotTurn: null, totalBallots: null, parties: [] },
        candidacy: action("declareCandidacy", true, 1), playerCampaign: null, presidential: null,
        projection: { resolved: false, countedVotes: null, leaderName: null, leaderShare: null, runnerUpName: null, marginPct: null, seats: null, snapshotTurn: null, drivers: [], projected: null },
      },
    ],
    referendums: [],
    referendumRequest: { applicable: false, note: "Referendums are only available in the UK in this local slice.", regions: [], action: action("requestReferendum", false, 0, "Referendums are UK-only.") },
    politicians: [{ id: "pol1", name: "Polly", partyId: "p1", partyName: "Labor", office: null, age: 40, economic: 0, social: 0, influence: 10, favorability: 50, infamy: 0, activeRaceIds: ["e1"] }],
  };
}

const emptyGov = { governmentType: null, regime: null, approval: null, legitimacy: null, unrest: null, status: null, formationType: null, confidence: null, governingParty: null, headOfGovernment: null, executive: null, legislature: null };

function homeRegion(overrides = {}) {
  return {
    id: "CA", name: "California", countryId: "US",
    population: 1000000, gdpMillions: 50000, houseSeats: 20, senateSeats: 2, senateClasses: null,
    censusRegion: null, votingEligiblePopulation: 800000, workingAgePopulation: 700000,
    militaryServicePopulation: 50000, laborForce: 600000, capitalStockMillions: 40000,
    budget: null, macro: null, sectors: [],
    partySupport: [{ party: { id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626" }, organization: 60, registration: 55 }],
    electoratePool: null,
    elections: [{ id: "e1", electionType: "house", status: "active", cycle: 1, startTurn: 1, primaryEndTurn: 2, endTurn: 5, totalSeats: 1, chamberKey: "house", candidates: [], winnerNames: [] }],
    office: null,
    viewer: { governorOffice: null, myElection: null, myOffice: null },
    ...overrides,
  };
}

function overviewLoader(region: unknown) {
  return async () => ({
    era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: "CA",
    nations: [{ id: "US", name: "United States", playable: true, currency: "USD",
      economy: { gdpMillions: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: -1.25 }, government: emptyGov }],
    homeRegion: region,
  });
}

const loadRegions = async () => ({
  era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerCountryName: "United States",
  playerHomeRegionId: "CA", currency: "USD", directoryQuery: "", directoryPage: 0, directoryPageSize: 20,
  directoryTotal: 1, directoryPageCount: 1,
  directory: [{ id: "CA", name: "California", isHome: true, population: 120, gdpMillions: 50 }],
  selected: null,
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
  positions: [{ id: "treasury", name: "Secretary of the Treasury", holderName: "Ada", isPlayerHolder: true, isVacant: false, actionsRemaining: 3, canIssue: true, orders: [] }],
  activeOrders: [],
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

function baseProps(world: GameView, loaders: { loadWorldOverview?: () => Promise<any> } = {}) {
  return {
    loadProfile: async () => profileFor(world), search: searchFn, loadBondMarket, loadRegions,
    loadCaucusManagement, loadCabinetOffice, onIssueCabinetOrder: vi.fn(), loadPartyManagement,
    loadMarkets, loadLegislation, loadPolitics: async () => makePolitics(),
    loadWorldOverview: loaders.loadWorldOverview ?? overviewLoader(homeRegion()),
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

describe.each([320, 390, 1280])("home-region surface links at %spx (#510)", (width) => {
  it("opens party details from party support with a return path", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Home region");
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Labor details" }));
    expect(screen.getByRole("article", { name: "Labor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
  });

  it("opens race details from region elections with a return path", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Home region");
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View House race details" }));
    expect(screen.getByRole("region", { name: "Election details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
  });
});

describe("home-region link safety (#510)", () => {
  it("falls back safely when recorded region ids leave the world", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const ghost = homeRegion({
      partySupport: [{ party: { id: "px", name: "Ghost", abbreviation: "GHO", color: null }, organization: 1, registration: 1 }],
      elections: [{ id: "e-ghost", electionType: "house", status: "active", cycle: 1, startTurn: 1, primaryEndTurn: 2, endTurn: 5, totalSeats: 1, chamberKey: "house", candidates: [], winnerNames: [] }],
    });
    render(<GameScreen {...baseProps(makeWorld(), { loadWorldOverview: overviewLoader(ghost) })} />);
    await gotoDrawer(user, "Home region");
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
    // Unknown party id falls back to the first live party; Back still restores the region.
    await user.click(screen.getByRole("button", { name: "View Ghost details" }));
    expect(screen.getByRole("article", { name: "Labor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
    // Unknown race id falls back to the first live race; Back still restores the region.
    await user.click(screen.getByRole("button", { name: "View House race details" }));
    expect(screen.getByRole("region", { name: "Election details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
  });

  it("keeps the honest empty state with no home region", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), { loadWorldOverview: overviewLoader(null) })} />);
    await gotoDrawer(user, "Home region");
    expect(await screen.findByText("No home region is recorded for this save.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view .* details/i })).toBeNull();
  });
});
