/**
 * #510 home-region office/race rows: the Governor Office (office-holder) and
 * My Office / My Election (player) rows open their implemented Native
 * destinations and Back restores the opening surface with its selection.
 *
 * Reference: AHDGame StateDropdown.tsx — Governor Office only for the holder
 * (region office page), My Election for an active candidacy (race page), My
 * Office only for a cabinet holder (cabinet position page). Native maps these
 * to its implemented destinations (regions detail, electionDetails,
 * legislature/profile/policy) and omits inapplicable rows instead of showing
 * inert controls. Rendered at 320/390px and desktop width.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createWorld,
  deserializeSave,
  type WorldState,
} from "@ahdclient/engine";
import { GameScreen } from "./GameScreen";
import { MENU_GROUPS } from "./MobileNavigation";
import { DEFAULT_PREFERENCES } from "../preferences";
import { loadLegislatureNav } from "../game/legislature";
import { projectRegions, type RegionsQuery } from "../game/regions";
import { projectWorldOverview } from "../game/worldOverview";
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

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ELECTED = "fixtures/career-elected-1953-US.save.json.gz";

function electedWorld(): WorldState {
  return deserializeSave(gunzipSync(readFileSync(ELECTED)).toString("utf8"));
}

/**
 * One engine world where Alabama shows every applicable row: the player
 * holds the governor office, is a candidate in the active house race, and
 * holds the AL house seat. DTO-level role gating is unit-tested in
 * regions.test.ts; here the combined card exercises the wiring.
 */
function viewerWorld(): WorldState {
  const world = electedWorld();
  const race = world.elections.find((election) => election.id === "house:US:AL:c2")!;
  race.candidates.push({ id: "player", name: "Muse", partyId: "US_DEM", isNPP: false, incumbent: false });
  world.governors.AL.governorId = "player";
  world.governors.AL.governorName = "Muse";
  world.governors.AL.governorParty = "US_DEM";
  return world;
}

function cabinetWorld(): WorldState {
  const world = electedWorld();
  world.cabinetMembers.push({
    countryId: "US",
    positionId: "secretaryOfState",
    characterId: "player",
    characterName: "Muse",
    partyId: "US_DEM",
    appointedBy: "US-1",
    appointedAtTurn: 90,
    confirmedAtTurn: 95,
  });
  return world;
}

function hosWorld(): WorldState {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "viewer-hos" });
  world.player.mode = "hos";
  return world;
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
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor", mode: "career", hosPartyId: null, homeRegionId: null },
    legislature: {
      office: "Representative", countryId: "US", proposals: [], sponsor: action("sponsorBill", true, 2), bills: [],
      chambers: [{ key: "house", name: "House of Representatives", shortName: "House", seats: 435, elected: true, description: null, activeCount: 435, completedCount: 0 }],
    },
    metrics: [], parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [{ id: "e1", title: "General Election", status: "upcoming", date: "1954-11-02", filingDate: "1954-09-01", electionType: "president", phase: "upcoming", playerCandidate: false, candidateNames: ["Ada", "Bob"], winnerNames: [], countedVotes: null, leaderName: null, leaderShare: null, marginPct: null, seatProjection: null, candidacy: action("declareCandidacy", true, 1) }],
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

/** The AL house race the viewer world's player entered, so the race row lands on a live race. */
function makePolitics(): PoliticsView {
  return {
    countryId: "US", countryName: "United States", currency: "USD", playerPartyId: "p1",
    parties: [partyDetail],
    elections: [{
      id: "house:US:AL:c2", title: "Alabama House Race", status: "active", date: "1954-11-02",
      filingDate: "1954-09-01", phase: "primary", playerCandidate: true,
      candidates: [{ id: "player", name: "Muse", partyId: "p1", partyName: "Labor", incumbent: false, isPlayer: true, votes: 0, voteShare: 0, winner: false }],
      winnerNames: [], winnerIds: [], totalVotes: null, stages: [],
      primary: { applicable: false, open: false, resolved: false, endTurn: 0, endDate: "", snapshotTurn: null, totalBallots: null, parties: [] },
      candidacy: action("withdrawCandidacy", true, 1), playerCampaign: null, presidential: null,
      projection: { resolved: false, countedVotes: null, leaderName: null, leaderShare: null, runnerUpName: null, marginPct: null, seats: null, snapshotTurn: null, drivers: [], projected: null },
    }],
    referendums: [],
    referendumRequest: { applicable: false, note: "Referendums are only available in the UK in this local slice.", regions: [], action: action("requestReferendum", false, 0, "Referendums are UK-only.") },
    politicians: [{ id: "pol1", name: "Polly", partyId: "p1", partyName: "Labor", office: null, age: 40, economic: 0, social: 0, influence: 10, favorability: 50, infamy: 0, activeRaceIds: ["house:US:AL:c2"] }],
  };
}

const emptyGov = { governmentType: null, regime: null, approval: null, legitimacy: null, unrest: null, status: null, formationType: null, confidence: null, governingParty: null, headOfGovernment: null, executive: null, legislature: null };

function loadsFor(engine: WorldState, regionsQuery?: RegionsQuery) {
  return {
    loadWorldOverview: async () => projectWorldOverview(engine),
    loadRegions: async (query?: RegionsQuery) => projectRegions(engine, regionsQuery ?? query ?? {}),
  };
}

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

function baseProps(world: GameView, engine: WorldState, regionsQuery?: RegionsQuery) {
  return {
    loadProfile: async () => profileFor(world), search: searchFn, loadBondMarket,
    ...loadsFor(engine, regionsQuery),
    loadCaucusManagement, loadCabinetOffice, onIssueCabinetOrder: vi.fn(), loadPartyManagement,
    loadMarkets, loadLegislation, loadPolitics: async () => makePolitics(),
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

function backButtons(): string[] {
  return screen.queryAllByRole("button", { name: /Back to/ }).map((button) => button.textContent ?? "");
}

// Explicit timeout: full GameScreen renders plus first-block transform cost
// can exceed the 5s default on loaded hosts (load, not behavior).
describe.each([320, 390, 1280])("home-region office rows at %spx (#510)", (width) => {
  it("opens each applicable row destination from the regions surface", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld())} />);
    await gotoDrawer(user, "Regions");
    await screen.findByText("Your role in this region");

    await user.click(screen.getByRole("button", { name: "Open my active race" }));
    expect(await screen.findByRole("region", { name: "Election details" })).toBeInTheDocument();
    expect(screen.getByText("Alabama House Race")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to regions" })).toBeInTheDocument();
  });

  it("returns from the race to the selected region", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld())} />);
    await gotoDrawer(user, "Regions");
    await user.click(await screen.findByRole("button", { name: "Open my active race" }));
    await screen.findByRole("region", { name: "Election details" });

    await user.click(screen.getByRole("button", { name: "Back to regions" }));
    expect(await screen.findByRole("region", { name: "Regions" })).toBeInTheDocument();
    // The Alabama selection survives the round trip: its rows are back.
    expect(await screen.findByRole("button", { name: "Open my active race" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open my office" })).toBeInTheDocument();
    expect(backButtons()).toEqual([]);
  });

  it("opens the legislature seat with its chamber and returns to the region", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld())} />);
    await gotoDrawer(user, "Regions");
    await user.click(await screen.findByRole("button", { name: "Open my office" }));
    await screen.findByRole("button", { name: "Browse bills and proposals" });
    expect(screen.getByText("Representative")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to regions" })).toBeInTheDocument();
    // The row id is honored through the legislature nav store, never dropped.
    expect(loadLegislatureNav("US").chamberKey).toBe("house");

    await user.click(screen.getByRole("button", { name: "Back to regions" }));
    expect(await screen.findByRole("region", { name: "Regions" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Open my office" })).toBeInTheDocument();
  });

  it("restores a browsed non-home region from the race", async () => {
    setViewport(width);
    const user = userEvent.setup();
    // California shows only the national-fallback My Election row, so the
    // return frame must carry the browsed region explicitly, not the default.
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld(), { regionId: "CA" })} />);
    await gotoDrawer(user, "Regions");
    expect(await screen.findByText("My Election")).toBeInTheDocument();
    expect(screen.queryByText("My Office")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open my active race" }));
    expect(await screen.findByRole("region", { name: "Election details" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to regions" }));
    expect(await screen.findByRole("region", { name: "Regions" })).toBeInTheDocument();
    expect(await screen.findByText("My Election")).toBeInTheDocument();
    expect(screen.queryByText("My Office")).not.toBeInTheDocument();
  });

  it("treats the governor self-link as a reselect with no return frame", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld())} />);
    await gotoDrawer(user, "Regions");
    await user.click(await screen.findByRole("button", { name: "Open governor office region" }));
    expect(await screen.findByRole("region", { name: "Regions" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Open governor office region" })).toBeInTheDocument();
    expect(backButtons()).toEqual([]);
  });

  it("opens the home-region governor row across surfaces and returns home", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld())} />);
    await gotoDrawer(user, "Home region");
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open governor office region" }));

    expect(await screen.findByRole("region", { name: "Regions" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Open governor office region" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
    expect(backButtons()).toEqual([]);
  });

  it("returns from the home-region race to the home region", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld())} />);
    await gotoDrawer(user, "Home region");
    await user.click(await screen.findByRole("button", { name: "Open my active race" }));
    expect(await screen.findByRole("region", { name: "Election details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
  });

  it("opens the cabinet row on profile and returns to the home region", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), cabinetWorld())} />);
    await gotoDrawer(user, "Home region");
    await user.click(await screen.findByRole("button", { name: "Open my office" }));
    expect(await screen.findByRole("region", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
  });

  it("opens the head-of-state row on policy and returns to the home region", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), hosWorld())} />);
    await gotoDrawer(user, "Home region");
    await user.click(await screen.findByRole("button", { name: "Open my office" }));
    expect(await screen.findByRole("region", { name: "Policy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to home region" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to home region" }));
    expect(await screen.findByRole("heading", { name: "Regional profile" })).toBeInTheDocument();
  });

  it("shows an honest empty card with no rows when nothing applies", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const bare = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "viewer-null" });
    render(<GameScreen {...baseProps(makeWorld(), bare, { regionId: "CA" })} />);
    await gotoDrawer(user, "Regions");
    expect(await screen.findByText("You hold no office and have no active race recorded for this region.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open my active race" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open my office" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open governor office region" })).not.toBeInTheDocument();
  });

  it("gates rows on role: an NPC holder and no candidacy leave only My Office", async () => {
    setViewport(width);
    const user = userEvent.setup();
    // Plain elected save: AL's governor is an NPC and the player entered no
    // race, but the player holds the AL house seat.
    render(<GameScreen {...baseProps(makeWorld(), electedWorld())} />);
    await gotoDrawer(user, "Regions");
    expect(await screen.findByText("Your role in this region")).toBeInTheDocument();
    expect(screen.queryByText("Governor Office")).not.toBeInTheDocument();
    expect(screen.queryByText("My Election")).not.toBeInTheDocument();
    expect(screen.getByText("My Office")).toBeInTheDocument();
  });

  it("keeps drawer visits to legislature, profile, and policy chromeless", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...baseProps(makeWorld(), viewerWorld())} />);
    await gotoDrawer(user, "Legislature");
    await screen.findByRole("button", { name: "Browse bills and proposals" });
    expect(backButtons()).toEqual([]);

    await gotoDrawer(user, "Profile");
    await screen.findByRole("region", { name: "Profile" });
    expect(backButtons()).toEqual([]);

    await gotoDrawer(user, "Policy");
    await screen.findByRole("region", { name: "Policy" });
    expect(backButtons()).toEqual([]);
  });
}, 20000);
