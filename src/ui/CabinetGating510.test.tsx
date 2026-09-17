/**
 * Cabinet drawer gating (#510).
 *
 * Native lacks the authoritative GameView membership signal AHDClient uses
 * (`myCabinetMember` through `resolveCabinetOfficeNavEntry` in
 * AHDGame `src/lib/navigation/cabinetOfficeNavEntry.ts` + `src/app/api/
 * client-nav/route.ts`): the drawer shows "Cabinet office" unconditionally,
 * so it cannot match role-aware reference behavior. These tests pin the
 * Native contract through the public boundaries:
 *
 * - session view projects the player's validated seat (or null),
 * - the drawer hides the row without a seat and keeps it with one,
 * - a deep/programmatic arrival on the route without a seat renders an
 *   honest recovery instead of a blank region.
 *
 * Session projection lives in src/game/cabinetMembership.test.ts (default
 * vitest config); this file keeps the rendered contract (UI config).
 */
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { GameDrawer, MENU_GROUPS } from "./MobileNavigation";
import type { CabinetOfficeView } from "../game/cabinetOffice";
import type { GameView } from "../game/types";
import { DEFAULT_PREFERENCES } from "../preferences";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";

const POSITION = "secretary_of_treasury";
const POSITION_NAME = "Secretary of the Treasury";

function drawerProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    route: "profile" as const,
    busy: false,
    playerName: "Alex",
    playerParty: "Labor",
    countryName: "United States",
    turn: 1,
    date: "1953-01-08",
    menuButtonRef: createRef<HTMLButtonElement | null>(),
    onNavigate: vi.fn(),
    onAdvanceTurn: vi.fn(),
    onSave: vi.fn(),
    onExit: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

async function expandNation(user: ReturnType<typeof userEvent.setup>, nation: HTMLElement) {
  const disclosure = within(nation).getByRole("button", { name: "Nation" });
  if (disclosure.getAttribute("aria-expanded") === "false") await user.click(disclosure);
}

async function governmentItems() {
  const menu = screen.getByRole("dialog", { name: "Game menu" });
  const nation = within(menu).getByRole("group", { name: "Nation" });
  const user = userEvent.setup();
  await expandNation(user, nation);
  const government = within(nation).getByRole("group", { name: "Government" });
  return within(government).getAllByRole("button").map((button) => button.textContent);
}

describe("cabinet drawer gating", () => {
  it("keeps the unconditional row when the signal is absent", async () => {
    render(<GameDrawer {...drawerProps()} />);
    expect(await governmentItems()).toContain("Cabinet office");
  });

  it("hides the Cabinet office row without a seat and keeps the sibling rows", async () => {
    render(<GameDrawer {...drawerProps({ cabinetAvailable: false })} />);
    const labels = await governmentItems();
    expect(labels).not.toContain("Cabinet office");
    expect(labels).toEqual(expect.arrayContaining(["Legislature", "Bills and proposals", "Policy"]));
  });

  it("shows the Cabinet office row with a seat", async () => {
    render(<GameDrawer {...drawerProps({ cabinetAvailable: true })} />);
    expect(await governmentItems()).toContain("Cabinet office");
  });

  it("still lists every drawer destination exactly once in the static hierarchy", () => {
    const ids = MENU_GROUPS.flatMap((group) => [
      ...group.items.map((item) => item.id),
      ...(group.sections ?? []).flatMap((section) => section.items.map((item) => item.id)),
    ]);
    expect(ids).toContain("government");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

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
    player: { name: "Alex", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor", mode: "career", hosPartyId: null, homeRegionId: null },
    legislature: {
      office: null,
      proposals: [],
      sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: true },
      bills: [],
    },
    finance: {
      cash: 1200, savings: 300, currency: "USD", savingsHolder: "First National Bank", holdings: [],
      deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
      withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
    },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, nationalInfluence: { current: 0, gain: 0 }, favorability: { current: 48, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 30, tierCost: 6 }, history: [] },
    nation: { countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: 0.04, inflationRate: 0.02, unemploymentRate: 0.05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: { fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD",
        labels: { title: "Federal Budget", revenueTitle: "Revenue Sources", spendingTitle: "Spending by Category", debtTitle: "National Debt", ceilingLabel: "Debt Ceiling", debtServiceLabel: "Debt Service", transferLabel: "State grants", revenue: {}, spending: {} },
        links: [], taxRates: [], revenue: { components: [], total: 1000 }, spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800, transfers: [] }, surplus: 200, treasuryBalance: 4000, debt: { principal: 0, ceiling: 10000, interestRate: 0.02, debtToGdpRatio: 0, creditRating: "AA" } },
      metrics: { total: 0, categories: [] },
      policy: { taxRates: [], enacted: [] } },
    metrics: [],
    parties: [],
    elections: [],
    polls: { quick: null, full: null },
    news: [],
    actions: [],
    regions: [{ id: "r1", name: "Midwest" }],
    notifications: { items: [], unread: 0 },
    ...overrides,
  };
}

const screenProps = {
  preferences: DEFAULT_PREFERENCES,
  onPreferencesChange: vi.fn(),
  onUpdateProfile: vi.fn(async () => true),
  onSelectConstituency: vi.fn(async () => true),
  onMarkNotificationRead: vi.fn(),
  onDeleteNotification: vi.fn(),
  onMarkAllNotificationsRead: vi.fn(),
};

const search = async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } });
const loadBondMarket = vi.fn();
const loadRegions = vi.fn();
const loadCaucusManagement = vi.fn();
const loadPartyManagement = vi.fn();
const loadMarkets = async () => ({ playerCountryId: "US", playerCash: 0, playerCurrency: "USD", playerActions: 0, turn: 0, marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [], sectors: [] });
const loadLegislation = async () => ({ office: null, playerChamberKey: null, countryId: "US", chambers: [], committees: [], schedule: [], proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const, sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "" });
const loadWorldOverview = async () => ({ era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null, nations: [], homeRegion: null });
const loadPolitics = async () => ({ countryId: "US", countryName: "United States", currency: "USD", playerPartyId: null, parties: [], elections: [], referendums: [], referendumRequest: { applicable: false, note: "Referendums are only available in the UK in this local slice.", regions: [], action: { id: "requestReferendum", name: "Request Referendum", description: "", cost: 0, available: false, disabledReason: "Referendums are UK-only." } }, politicians: [] });

function profileFor(world: GameView) {
  return {
    name: world.player.name, bio: "", avatarUrl: null, campaignSongUrl: "", campaignSongAutoplay: false,
    country: { id: world.countryId, name: world.countryName }, homeRegion: null,
    constituency: { eligible: false, officeType: null, regionId: null, selected: null, options: [], unavailableReason: "Unavailable." },
    party: world.player.partyName ? { id: "p1", name: world.player.partyName, color: "#dc2626" } : null,
    office: world.legislature.office,
    officeDestination: world.legislature.office ? { route: "legislature" as const } : null,
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

function officeLoader(): Promise<CabinetOfficeView> {
  return Promise.resolve({
    countryId: "US",
    countryName: "United States",
    turn: 1,
    isExecutive: false,
    positions: [],
    activeOrders: [],
    regions: [],
  });
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Menu" }));
}

describe("cabinet screen gating", () => {
  it("keeps the drawer row on pre-signal projections", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(
      <GameScreen
        {...screenProps}
        loadProfile={async () => profileFor(world)}
        loadPolitics={loadPolitics}
        search={search}
        loadBondMarket={loadBondMarket}
        loadRegions={loadRegions}
        loadCaucusManagement={loadCaucusManagement}
        loadPartyManagement={loadPartyManagement}
        loadMarkets={loadMarkets}
        loadLegislation={loadLegislation}
        loadWorldOverview={loadWorldOverview}
        loadCabinetOffice={officeLoader}
        onIssueCabinetOrder={vi.fn()}
        world={world}
        busy={false}
        onAdvanceTurn={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        onUpdateWorldFeatureFlags={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    await openDrawer(user);
    const menu = screen.getByRole("dialog", { name: "Game menu" });
    const nation = within(menu).getByRole("group", { name: "Nation" });
    await expandNation(user, nation);
    expect(within(within(nation).getByRole("group", { name: "Government" })).getByRole("button", { name: "Cabinet office" })).toBeInTheDocument();
  });

  it("hides the drawer row without a seat but recovers an in-flight route honestly", async () => {
    const user = userEvent.setup();
    const seated = makeWorld({ cabinet: { positionId: POSITION, positionName: POSITION_NAME } });
    const props = {
      ...screenProps,
      loadProfile: async () => profileFor(seated),
      loadPolitics,
      search,
      loadBondMarket,
      loadRegions,
      loadCaucusManagement,
      loadPartyManagement,
      loadMarkets,
      loadLegislation,
      loadWorldOverview,
      loadCabinetOffice: officeLoader,
      onIssueCabinetOrder: vi.fn(),
      busy: false,
      onAdvanceTurn: vi.fn(),
      onSave: vi.fn(),
      onExit: vi.fn(),
      onUpdateWorldFeatureFlags: vi.fn(),
      onAction: vi.fn(),
    };
    const { rerender } = render(<GameScreen {...props} world={seated} />);
    await openDrawer(user);
    let menu = screen.getByRole("dialog", { name: "Game menu" });
    let nation = within(menu).getByRole("group", { name: "Nation" });
    await expandNation(user, nation);
    await user.click(within(within(nation).getByRole("group", { name: "Government" })).getByRole("button", { name: "Cabinet office" }));
    expect(await screen.findByRole("heading", { name: "Cabinet office" })).toBeInTheDocument();

    // The seat is lost between turns (dismissal) while the route is open.
    const unseated = makeWorld({ cabinet: null });
    rerender(<GameScreen {...props} loadProfile={async () => profileFor(unseated)} world={unseated} />);
    const recovery = await screen.findByRole("region", { name: "Cabinet office" });
    expect(within(recovery).getByRole("button", { name: "Go to profile" })).toBeInTheDocument();
    expect(within(recovery).getByRole("button", { name: "Go to actions" })).toBeInTheDocument();
    await openDrawer(user);
    menu = screen.getByRole("dialog", { name: "Game menu" });
    nation = within(menu).getByRole("group", { name: "Nation" });
    await expandNation(user, nation);
    expect(within(within(nation).getByRole("group", { name: "Government" })).queryByRole("button", { name: "Cabinet office" })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: "Close menu" }));
    await user.click(within(recovery).getByRole("button", { name: "Go to profile" }));
    expect(await within(screen.getByRole("region", { name: "Profile" })).findByRole("heading", { name: "Alex" })).toBeInTheDocument();
  });
});
