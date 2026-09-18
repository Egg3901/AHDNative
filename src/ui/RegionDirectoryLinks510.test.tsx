/**
 * #510 Regions-directory surface links: the reference State/region pages link
 * the state party page and regional elections
 * (AHDGame e364c0495 ExperimentalMobileMenu.tsx state rows, regionUrl pages).
 * The Native Regions directory detail rendered party support and elections as
 * dead text. It now opens the national party/race detail for the same
 * recorded engine id through the shell drill, so Back restores the browsed
 * region with its selection through the bounded return stack. The directory
 * is player-country scoped (projectRegions), so listed ids resolve in the
 * player-country politics projection; stale recorded ids fall back to the
 * first live row with Back intact. Rendered at 320/390px and desktop width.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deserializeSave, type WorldState } from "@ahdclient/engine";
import { projectRegions, type RegionsQuery } from "../game/regions";
import { projectWorldOverview } from "../game/worldOverview";
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

const ELECTED = "fixtures/career-elected-1953-US.save.json.gz";

function electedWorld(): WorldState {
  return deserializeSave(gunzipSync(readFileSync(ELECTED)).toString("utf8"));
}

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
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Democratic Party", mode: "career", hosPartyId: null, homeRegionId: "AL" },
    legislature: { office: "Representative", proposals: [], sponsor: action("sponsorBill", true, 2), bills: [] },
    metrics: [],
    parties: [
      { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#2563eb", logoUrl: null, members: 200, treasury: 9000, isPlayerParty: true },
      { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#dc2626", logoUrl: null, members: 180, treasury: 8000, isPlayerParty: false },
    ],
    elections: [{ id: "house:US:AL:c2", title: "Alabama House Race", status: "active", date: "1954-11-02", filingDate: "1954-09-01", electionType: "house", phase: "primary", playerCandidate: false, candidateNames: ["Janet Rodriguez"], winnerNames: [], countedVotes: null, leaderName: null, leaderShare: null, marginPct: null, seatProjection: null, candidacy: action("declareCandidacy", true, 1) }],
    news: [{ id: "n1", title: "Markets rally", body: "Stocks up.", date: "1953-02-01" }],
    actions: [action("fundraise", true, 1)], regions: [{ id: "AL", name: "Alabama" }],
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
    party: world.player.partyName ? { id: "US_DEM", name: world.player.partyName, color: "#2563eb" } : null,
    office: world.legislature.office,
    officeDestination: world.legislature.office ? { route: "legislature" } : null,
    policies: null, stats: null, demographics: null, profileHeaderUrl: null, careerHistory: [], achievements: [],
    achievementProgress: { earned: 0, available: 0 }, lockedAchievements: [], unavailableAchievements: [],
    resourceDetails: world.resources,
    standing: { actions: world.player.actions, actionCap: 200, actionGain: 4, politicalInfluence: world.player.influence, nationalInfluence: null, favorability: world.player.favorability, infamy: 0, partyInfluence: null },
    finances: { currency: world.finance.currency, cash: world.finance.cash, savings: world.finance.savings, funds: world.player.funds, donorBaseLevel: 0, regularIncome: 9500, donorIncome: 0 },
  };
}

function partyDetail(id: string, name: string, isPlayerParty: boolean): PoliticsPartyDetail {
  return {
    id, name, abbreviation: id === "US_DEM" ? "DEM" : "REP", color: id === "US_DEM" ? "#2563eb" : "#dc2626", logoUrl: null,
    members: 200, treasury: 9000, isPlayerParty, economicPosition: -2, socialPosition: -1,
    tier: "major", organization: 5, politicalStrength: 7, leaderName: "Ada", viceLeaderName: null,
    treasurerName: null, memberNames: ["Ada"], join: action("joinParty", false, 0, "Already a member."), leave: action("leaveParty", true, 1),
  };
}

function raceDetail(id: string) {
  return {
    id, title: "Alabama House Race", status: "active" as const, date: "1954-11-02", filingDate: "1954-09-01",
    phase: "primary", playerCandidate: false,
    candidates: [{ id: "janet", name: "Janet Rodriguez", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: false, votes: 60, voteShare: 0.6, winner: false }],
    winnerNames: [], winnerIds: [], totalVotes: null, stages: [],
    primary: { applicable: false, open: false, resolved: false, endTurn: 0, endDate: "", snapshotTurn: null, totalBallots: null, parties: [] },
    candidacy: action("declareCandidacy", true, 1), playerCampaign: null, presidential: null,
    projection: { resolved: false, countedVotes: null, leaderName: null, leaderShare: null, runnerUpName: null, marginPct: null, seats: null, snapshotTurn: null, drivers: [], projected: null },
  };
}

function makePolitics(): PoliticsView {
  return {
    countryId: "US", countryName: "United States", currency: "USD", playerPartyId: "US_DEM",
    parties: [partyDetail("US_DEM", "Democratic Party", true), partyDetail("US_REP", "Republican Party", false)],
    elections: [raceDetail("house:US:AL:c2")],
    referendums: [],
    referendumRequest: { applicable: false, note: "Referendums are only available in the UK in this local slice.", regions: [], action: action("requestReferendum", false, 0, "Referendums are UK-only.") },
    politicians: [],
  } as unknown as PoliticsView;
}

const emptyGov = { governmentType: null, regime: null, approval: null, legitimacy: null, unrest: null, status: null, formationType: null, confidence: null, governingParty: null, headOfGovernment: null, executive: null, legislature: null };

const loadCaucusManagement = async (): Promise<CaucusManagementView> => ({
  countryId: "US", countryName: "United States", currency: "USD", playerPartyId: "US_DEM",
  playerPartyName: "Democratic Party", playerCaucusId: null, playerCaucusName: null, caucusCount: 0,
  create: { actionCost: 4, fundCost: 25000, fundsRequired: 25000, funds: 152000, actions: 9, cooldownRemaining: 0, taxMin: 0, taxMax: 5, nameMinLength: 3, available: true,
    effect: { partyFundsDelta: -25000, partyMembership: "none", caucusMembership: "create", clearsCaucusMembership: false, startsPartySwitchCooldown: false },
    consequences: [], action: action("createCaucus", true, 4) },
  caucuses: [],
});
const loadCabinetOffice = async () => ({
  countryId: "US", countryName: "United States", turn: 1, isExecutive: false, regions: [{ id: "AL", name: "Alabama" }],
  positions: [],
  activeOrders: [],
});
const loadPartyManagement = async (): Promise<PartyManagementView> => ({
  countryId: "US", countryName: "United States", currency: "USD", playerPartyName: "Democratic Party",
  partyCount: 2, foundedCount: 0, charterDeadlineTurns: 14,
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

function loads(engine: WorldState, politics: PoliticsView) {
  return {
    loadProfile: async () => profileFor(makeWorld()),
    search: searchFn, loadBondMarket,
    loadRegions: async (query?: RegionsQuery) => projectRegions(engine, query ?? {}),
    loadCaucusManagement, loadCabinetOffice, onIssueCabinetOrder: vi.fn(), loadPartyManagement,
    loadMarkets, loadLegislation, loadPolitics: async () => politics,
    loadWorldOverview: async () => projectWorldOverview(engine),
  };
}

function baseProps(world: GameView, loaderOverrides: Record<string, unknown> = {}) {
  return {
    ...loads(electedWorld(), makePolitics()),
    ...loaderOverrides,
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

/** Narrow the region elections list to active races so the house row is unique. */
async function filterActiveRaces(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox", { name: "Election status" }), "active");
}

describe.each([320, 390, 1280])("regions-directory surface links at %spx (#510)", (width) => {
  it("opens party details from a browsed region and restores its selection", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Regions");
    expect(await screen.findByRole("article", { name: "Alabama" })).toBeInTheDocument();
    await user.click(screen.getByText("Browse regions"));
    await user.click(await screen.findByRole("button", { name: "View California details" }));
    expect(await screen.findByRole("article", { name: "California" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Democratic Party details" }));
    expect(screen.getByRole("article", { name: "Democratic Party" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to regions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to regions" }));
    // The browsed region (California) returns, not the home default (Alabama).
    expect(await screen.findByRole("article", { name: "California" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to regions" })).toBeNull();
  });

  it("opens race details from the home default and restores it", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld())} />);
    await gotoDrawer(user, "Regions");
    expect(await screen.findByRole("article", { name: "Alabama" })).toBeInTheDocument();
    await filterActiveRaces(user);
    await user.click(await screen.findByRole("button", { name: "View House race details" }));
    expect(screen.getByRole("region", { name: "Election details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to regions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to regions" }));
    expect(await screen.findByRole("article", { name: "Alabama" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to regions" })).toBeNull();
  });
});

describe("regions-directory link safety (#510)", () => {
  it("falls back safely when recorded region ids leave the politics projection", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const ghostPolitics: PoliticsView = {
      ...makePolitics(),
      parties: [partyDetail("US_REP", "Republican Party", false)],
      elections: [{ ...raceDetail("house:US:AL:c2"), id: "other-race", title: "Other Race" }],
    } as unknown as PoliticsView;
    render(<GameScreen {...baseProps(makeWorld(), { loadPolitics: async () => ghostPolitics })} />);
    await gotoDrawer(user, "Regions");
    expect(await screen.findByRole("article", { name: "Alabama" })).toBeInTheDocument();
    // Unknown party id falls back to the first live party; Back still restores the region.
    await user.click(screen.getByRole("button", { name: "View Democratic Party details" }));
    expect(screen.getByRole("article", { name: "Republican Party" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to regions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to regions" }));
    expect(await screen.findByRole("article", { name: "Alabama" })).toBeInTheDocument();
    // Unknown race id falls back to the first live race; Back still restores the region.
    await filterActiveRaces(user);
    const houseButtons = screen.getAllByRole("button", { name: "View House race details" });
    expect(houseButtons.length).toBeGreaterThan(0);
    await user.click(houseButtons[0]!);
    expect(screen.getByRole("region", { name: "Election details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to regions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to regions" }));
    expect(await screen.findByRole("article", { name: "Alabama" })).toBeInTheDocument();
  });
});
