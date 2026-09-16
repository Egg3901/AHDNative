import type { ProfileView } from "../game/profileTypes";
import { DEFAULT_PREFERENCES } from "../preferences";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import type { ElectionView, FinanceView, GameView } from "../game/types";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";

/**
 * Dynamic Island / modern iPhone safe-area composition (#436).
 *
 * Browser-geometry contract only: jsdom performs no layout, so the rendered
 * cases assert that every persistent and transient control stays mounted and
 * visible at 320/390 widths, in landscape shape, and under large text, while
 * the CSS cases pin the env(safe-area-inset-*) geometry that puts them there.
 * Nothing here is physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");
const indexHtml = readFileSync("index.html", "utf8");

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
      office: null,
      proposals: [],
      sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: true },
      bills: [],
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

function renderShell(world: GameView) {
  render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onUpdateWorldFeatureFlags={vi.fn()} onAction={vi.fn()} />);
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

afterEach(() => {
  setViewport(1024, 768);
  delete document.documentElement.dataset.textSize;
});

describe("SafeAreaComposition geometry contract (#436)", () => {
  it("top chrome starts below the island/cutout inset", () => {
    expect(css).toMatch(/\.ahd-main[^{]*\{[^}]*env\(safe-area-inset-top\)/);
    expect(css).toMatch(/\.ahd-drawer[^{]*\{[^}]*env\(safe-area-inset-top\)/);
    expect(css).toMatch(/\.ahd-landing-layout[^{]*\{[^}]*env\(safe-area-inset-top\)/);
  });

  it("bottom chrome clears the home indicator", () => {
    expect(css).toMatch(/\.ahd-footer[^{]*\{[^}]*env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.ahd-creation-actions[^{]*\{[^}]*env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.ahd-drawer-quick\s*\{[^}]*env\(safe-area-inset-bottom\)/);
  });

  it("side chrome clears rounded corners and the landscape cutout", () => {
    expect(css).toMatch(/\.ahd-container[^{]*\{[^}]*env\(safe-area-inset-left\)/);
    expect(css).toMatch(/\.ahd-container[^{]*\{[^}]*env\(safe-area-inset-right\)/);
    expect(css).toMatch(/\.ahd-bottomnav[^{]*\{[^}]*env\(safe-area-inset-left\)/);
    expect(css).toMatch(/\.ahd-bottomnav[^{]*\{[^}]*env\(safe-area-inset-right\)/);
    expect(css).toMatch(/\.ahd-drawer\s*\{[^}]*env\(safe-area-inset-left\)/);
  });

  it("overlays stay inside the insets and scroll instead of covering controls", () => {
    expect(css).toMatch(/\.ahd-resource-popover[^{]*\{[^}]*env\(safe-area-inset-top\)/);
    expect(css).toMatch(/\.ahd-resource-popover[^{]*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.ahd-drawer-backdrop\s*\{[^}]*position:\s*fixed;\s*inset:\s*0/);
  });

  it("landscape pins the fixed footer to the side insets", () => {
    expect(css).toMatch(/@media\s*\(orientation:\s*landscape\)[\s\S]*?\.ahd-footer[\s\S]*?env\(safe-area-inset-left\)/);
    expect(css).toMatch(/@media\s*\(orientation:\s*landscape\)[\s\S]*?\.ahd-footer[\s\S]*?env\(safe-area-inset-right\)/);
  });

  it("keyboard-adjacent layouts resize rather than hide behind the keyboard", () => {
    expect(indexHtml).toMatch(/viewport-fit=cover/);
    expect(indexHtml).toMatch(/interactive-widget=resizes-content/);
    expect(css).toMatch(/\.ahd-input,\s*\.ahd-select\s*\{[^}]*font-size:\s*16px/);
    expect(css).toMatch(/\.ahd-creation-actions\s*\{[^}]*position:\s*sticky/);
  });

  it("large text scales type without hiding controls", () => {
    const largeTextBlocks = css.match(/:root\[data-text-size="large"\][^{]*\{[^}]*\}/g) ?? [];
    expect(largeTextBlocks.length).toBeGreaterThan(0);
    for (const block of largeTextBlocks) expect(block).not.toMatch(/display:\s*none/);
  });
});

describe.each([
  { width: 320, height: 568 },
  { width: 390, height: 844 },
])("SafeAreaComposition rendered shell at $width px (#436)", ({ width, height }) => {
  it("keeps every persistent control visible", () => {
    setViewport(width, height);
    renderShell(makeWorld());
    const footer = screen.getByRole("contentinfo");
    for (const name of ["Action points", "Campaign funds", "Cash", "Influence", "Favorability", "Notifications"]) {
      expect(within(footer).getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["Profile", "Actions", "Ask", "Menu"]) {
      expect(within(primary).getByRole("button", { name })).toBeVisible();
    }
  });

  it("keeps drawer turn controls and resource overlays reachable", async () => {
    const user = userEvent.setup();
    setViewport(width, height);
    renderShell(makeWorld());
    await user.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Menu" }));
    const drawer = screen.getByRole("dialog", { name: "Game menu" });
    for (const name of ["End turn", "Save game", "Exit game", "Close menu"]) {
      expect(within(drawer).getByRole("button", { name })).toBeVisible();
    }
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^Action points/ }));
    const details = screen.getByRole("dialog", { name: "Action points details" });
    expect(details).toBeVisible();
    expect(within(details).getByRole("button", { name: "Close details" })).toBeVisible();
    for (const name of ["Go to Actions", "Go to Profile", "Go to Portfolio"]) {
      expect(within(details).getByRole("button", { name })).toBeVisible();
    }
    expect(screen.getByRole("button", { name: /^Campaign funds/ })).toBeInTheDocument();
  });
});

describe("SafeAreaComposition landscape shape (#436)", () => {
  it("keeps every persistent control mounted at 844x390", () => {
    setViewport(844, 390);
    renderShell(makeWorld());
    const footer = screen.getByRole("contentinfo");
    for (const name of ["Action points", "Campaign funds", "Cash", "Influence", "Favorability"]) {
      expect(within(footer).getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["Profile", "Actions", "Ask", "Menu"]) {
      expect(within(primary).getByRole("button", { name })).toBeInTheDocument();
    }
  });
});

describe("SafeAreaComposition large text (#436)", () => {
  it("keeps every persistent control visible with no hidden fallback", () => {
    document.documentElement.dataset.textSize = "large";
    setViewport(320, 568);
    renderShell(makeWorld());
    const footer = screen.getByRole("contentinfo");
    for (const name of ["Action points", "Campaign funds", "Cash", "Influence", "Favorability", "Notifications"]) {
      expect(within(footer).getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["Profile", "Actions", "Ask", "Menu"]) {
      expect(within(primary).getByRole("button", { name })).toBeVisible();
    }
  });
});
