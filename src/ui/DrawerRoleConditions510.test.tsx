import { createRef } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { GameDrawer, MENU_GROUPS } from "./MobileNavigation";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { ElectionView, FinanceView, GameView } from "../game/types";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";

/**
 * Drawer role/country/capability conditions (#510).
 *
 * Reference matrix (Egg3901/AHDGame, public):
 * - Nation loose links: My Party only with a current party
 *   (ExperimentalMobileMenu.tsx:413-421).
 * - Politics group: Presidential Election only for a direct-election country
 *   with an active race (nationDetailsSections.ts:116-123). Native gates on
 *   the save recording a presidential race, which implies the country runs one.
 * - State section: My Election links the active race, otherwise a disabled
 *   honest label (ExperimentalMobileMenu.tsx:330-345, state.myElectionNone).
 * - Elections submenu US legacy-congress extras (Primaries, Results,
 *   Political Operations) have no offline equivalent
 *   (experimentalNavMenus.ts:91-109, usesLegacyCongressRoutes).
 */

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 1200,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [],
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
const search = async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } });
const loadBondMarket = vi.fn();
const loadRegions = vi.fn();
const loadCaucusManagement = vi.fn();
const loadPartyManagement = vi.fn();
const loadMarkets = async () => ({ playerCountryId: "US", playerCash: 0, playerCurrency: "USD", playerActions: 0, turn: 0, marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [], sectors: [] });
const loadLegislation = async () => ({ office: null, playerChamberKey: null, countryId: "US", chambers: [], committees: [], schedule: [], proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const, sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "" });
const loadWorldOverview = async () => ({ era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null, nations: [], homeRegion: null });
const loadPolitics = async () => ({ countryId: "US", countryName: "United States", currency: "USD", playerPartyId: null, parties: [], elections: [], referendums: [], referendumRequest: { applicable: false, note: "Referendums are UK-only.", regions: [], action: { id: "requestReferendum", name: "Request Referendum", description: "", cost: 0, available: false, disabledReason: "Referendums are UK-only." } }, politicians: [] });

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
      bills: [],
    },
    metrics: [],
    parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [makeElection()],
    news: [],
    actions: [],
    regions: [{ id: "r1", name: "Midwest" }],
    finance: makeFinance(),
    polls: { quick: null, full: null },
    notifications: { items: [], unread: 0 },
    nation: { countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: .04, inflationRate: .02, unemploymentRate: .05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: { fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD",
        labels: { title: "Federal Budget", revenueTitle: "Revenue Sources", spendingTitle: "Spending by Category", debtTitle: "National Debt", ceilingLabel: "Debt Ceiling", debtServiceLabel: "Debt Service", transferLabel: "State grants", revenue: {}, spending: {} },
        links: [], taxRates: [], revenue: { components: [], total: 1000 }, spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800, transfers: [] }, surplus: 200, treasuryBalance: 4000, debt: { principal: 0, ceiling: 10000, interestRate: .02, debtToGdpRatio: 0, creditRating: "AA" } },
      metrics: { total: 0, categories: [] },
      policy: { taxRates: [], enacted: [] } },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, nationalInfluence: { current: 0, gain: 0 }, favorability: { current: 48, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 30, tierCost: 6 }, history: [] },
    ...overrides,
  };
}

function profileFor(world: GameView) {
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

function renderScreen(world: GameView) {
  return render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  await user.click(primary.getByRole("button", { name: "Menu" }));
  return within(screen.getByRole("dialog", { name: "Game menu" }));
}

async function expandGroup(menu: ReturnType<typeof within>, label: "State" | "Nation" | "World", user: ReturnType<typeof userEvent.setup>) {
  const group = menu.getByRole("group", { name: label });
  const toggle = within(group).getByRole("button", { name: label });
  if (toggle.getAttribute("aria-expanded") === "false") await user.click(toggle);
  return within(group);
}

describe("drawer role/country conditions (#510)", () => {
  it("shows the member-only My party loose link and deep-links to the player party", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    renderScreen(world);
    const menu = await openMenu(user);
    const nation = menu.getByRole("group", { name: "Nation" });
    const myParty = within(nation).getByRole("button", { name: "My party · Labor" });
    expect(myParty).toHaveClass("ahd-drawer-item");
    await user.click(myParty);
    expect(screen.getByRole("region", { name: "Party details" })).toBeInTheDocument();
  });

  it("omits My party when the player holds no party membership", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: false }],
      player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "", mode: "career", hosPartyId: null, homeRegionId: null },
    });
    renderScreen(world);
    const menu = await openMenu(user);
    expect(menu.queryByRole("button", { name: /My party/ })).not.toBeInTheDocument();
    // The unconditional party directory stays reachable.
    const nation = await expandGroup(menu, "Nation", user);
    expect(nation.getByRole("button", { name: "Parties" })).toBeInTheDocument();
  });

  it("gates Presidential election on a recorded presidential race", async () => {
    const user = userEvent.setup();
    renderScreen(makeWorld());
    let menu = await openMenu(user);
    let nation = await expandGroup(menu, "Nation", user);
    expect(within(nation.getByRole("group", { name: "Politics" })).queryByRole("button", { name: "Presidential election" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
  });

  it("lists Presidential election when the save records a presidential race", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ elections: [makeElection({ id: "pres1", title: "Presidential Election", electionType: "president" })] });
    renderScreen(world);
    const menu = await openMenu(user);
    const nation = await expandGroup(menu, "Nation", user);
    expect(within(nation.getByRole("group", { name: "Politics" })).getByRole("button", { name: "Presidential election" })).toBeInTheDocument();
  });

  it("links My election to the active race, and disables it honestly otherwise", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ elections: [makeElection({ id: "race9", title: "House Race 9", playerCandidate: true, status: "upcoming" })] });
    renderScreen(world);
    const menu = await openMenu(user);
    const state = menu.getByRole("group", { name: "State" });
    const myElection = within(state).getByRole("button", { name: "My election" });
    expect(myElection).toHaveClass("ahd-drawer-item");
    await user.click(myElection);
    expect(screen.getByRole("region", { name: "Election details" })).toBeInTheDocument();
  });

  it("renders My election disabled with an honest note when the player fields no candidacy", async () => {
    const user = userEvent.setup();
    renderScreen(makeWorld());
    const menu = await openMenu(user);
    const state = menu.getByRole("group", { name: "State" });
    const myElection = within(state).getByRole("button", { name: "My election" });
    expect(myElection).toBeDisabled();
    expect(within(state).getByText(/no active candidacy/i)).toBeInTheDocument();
  });

  it("names the US-only legacy elections surface honestly on the Elections route", async () => {
    const user = userEvent.setup();
    renderScreen(makeWorld());
    const primary = within(screen.getByRole("navigation", { name: "Primary" }));
    await user.click(primary.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
    const nation = menu.getByRole("group", { name: "Nation" });
    await user.click(within(nation).getByRole("button", { name: "Nation" }));
    await user.click(within(nation).getByRole("button", { name: "Elections" }));
    const elections = screen.getByRole("region", { name: "Elections" });
    expect(within(elections).getByRole("note")).toHaveTextContent(/Primaries.*Results.*Political Operations/i);
  });

  it("omits the legacy-route note outside the US", async () => {
    const user = userEvent.setup();
    const base = makeWorld();
    const world = makeWorld({ countryId: "UK", countryName: "United Kingdom", nation: { ...base.nation, countryId: "UK", countryName: "United Kingdom" } });
    renderScreen(world);
    const primary = within(screen.getByRole("navigation", { name: "Primary" }));
    await user.click(primary.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
    const nation = menu.getByRole("group", { name: "Nation" });
    await user.click(within(nation).getByRole("button", { name: "Nation" }));
    await user.click(within(nation).getByRole("button", { name: "Elections" }));
    expect(screen.queryByText(/legacy.*congress/i)).not.toBeInTheDocument();
  });

  it("carries the conditional rows into the docked desktop pane with deep-link args", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <GameDrawer open docked route="profile" busy={false} playerName="Ada" playerParty="Labor"
        countryName="United States" turn={1} date="1953-01-08" menuButtonRef={createRef()}
        onNavigate={onNavigate} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onClose={vi.fn()}
        roleConditions={{ myParty: { partyId: "p1", partyName: "Labor" }, presidentialAvailable: true, myElectionRaceId: "race9" }} />,
    );
    const nation = within(screen.getByRole("complementary")).getByRole("group", { name: "Nation" });
    await user.click(within(nation).getByRole("button", { name: "My party · Labor" }));
    expect(onNavigate).toHaveBeenCalledWith("partyDetails", "p1");
    const state = within(screen.getByRole("complementary")).getByRole("group", { name: "State" });
    await user.click(within(state).getByRole("button", { name: "My election" }));
    expect(onNavigate).toHaveBeenCalledWith("electionDetails", "race9");
  });

  it("keeps conditional rows inside the 320px truncation and disabled-row contracts", () => {
    const css = readFileSync(join(__dirname, "ui.css"), "utf8");
    expect(css).toMatch(/\.ahd-drawer-item-label\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.ahd-drawer-item:disabled\s*\{[^}]*opacity/);
    expect(MENU_GROUPS.flatMap((g) => [...g.items, ...(g.sections ?? []).flatMap((s) => s.items)]).map((i) => i.id)).toContain("presidentialDetails");
  });
});
