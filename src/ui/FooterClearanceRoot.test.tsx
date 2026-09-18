import type { ProfileView } from "../game/profileTypes";
import { DEFAULT_PREFERENCES } from "../preferences";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GameScreen } from "./GameScreen";
import type { ElectionView, FinanceView, GameView } from "../game/types";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { FOOTER_HEIGHT_VAR, installFooterClearance } from "./footerClearance";

/**
 * Document-scope footer clearance (#436).
 *
 * Both shells measured the fixed footer and published `--ahd-footer-height`
 * on the screen element only. That covers descendant consumers (`.ahd-main`
 * padding, popover max-height), but the document rule
 * `html { scroll-padding-bottom: ... }` reads the variable at document
 * scope, where a descendant publication is invisible: it always fell back
 * to 9rem. On a phone whose footer grows past the 160px budget (home
 * indicator + large text), keyboard-focus scrolling could park page content
 * under the footer. The shared helper publishes to `documentElement` too.
 *
 * Geometry-only: jsdom performs no layout, so the rendered cases drive the
 * measurement with an arbitrary footer height and assert both scopes track
 * it. Nothing here is physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

type ResizeCallback = () => void;

let resizeCallbacks: ResizeCallback[];
let disconnectCalls: number;

function stubResizeObserver() {
  resizeCallbacks = [];
  disconnectCalls = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: ResizeCallback) {
        resizeCallbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnectCalls += 1;
      }
    },
  );
}

function mockFooterHeight(px: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: px,
  } as DOMRect);
}

function rootFooterHeight(): string {
  return document.documentElement.style.getPropertyValue(FOOTER_HEIGHT_VAR);
}

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
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(FOOTER_HEIGHT_VAR);
  setViewport(1024, 768);
});

describe("installFooterClearance helper (#436)", () => {
  it("publishes the measured footer height to the screen element and documentElement", () => {
    stubResizeObserver();
    mockFooterHeight(172);
    const footer = document.createElement("footer");
    const screenEl = document.createElement("div");
    installFooterClearance(footer, screenEl);
    expect(screenEl.style.getPropertyValue(FOOTER_HEIGHT_VAR)).toBe("172px");
    expect(rootFooterHeight()).toBe("172px");
  });

  it("re-publishes to both scopes when the footer resizes", () => {
    stubResizeObserver();
    mockFooterHeight(160);
    const footer = document.createElement("footer");
    const screenEl = document.createElement("div");
    installFooterClearance(footer, screenEl);
    expect(resizeCallbacks.length).toBe(1);
    mockFooterHeight(196);
    resizeCallbacks[0]();
    expect(screenEl.style.getPropertyValue(FOOTER_HEIGHT_VAR)).toBe("196px");
    expect(rootFooterHeight()).toBe("196px");
  });

  it("disconnects the observer and clears the shared root value on uninstall", () => {
    stubResizeObserver();
    mockFooterHeight(172);
    const uninstall = installFooterClearance(document.createElement("footer"), document.createElement("div"));
    expect(rootFooterHeight()).toBe("172px");
    uninstall();
    expect(disconnectCalls).toBe(1);
    expect(rootFooterHeight()).toBe("");
  });

  it("ignores a missing footer without publishing", () => {
    stubResizeObserver();
    const uninstall = installFooterClearance(null, document.createElement("div"));
    expect(() => uninstall()).not.toThrow();
    expect(rootFooterHeight()).toBe("");
    expect(resizeCallbacks.length).toBe(0);
  });
});

describe("document scroll-padding consumer (#436)", () => {
  it("reads the same variable the helper publishes", () => {
    expect(css).toContain(`scroll-padding-bottom: calc(var(${FOOTER_HEIGHT_VAR}, 9rem) + 1rem);`);
  });
});

describe.each([
  { width: 390, height: 844, label: "phone" },
  { width: 1280, height: 800, label: "desktop" },
])("GameScreen root footer publication at $width px (#436, $label)", ({ width, height }) => {
  it("tracks a grown footer on documentElement so focus scroll clears it", () => {
    stubResizeObserver();
    // 172px: past the 160px footer budget (home indicator + large text
    // growth). Before the root publication the document rule could only see
    // the 9rem fallback (144px + 16px breathing room), so keyboard-focus
    // scrolling could park page content under the grown footer.
    mockFooterHeight(172);
    setViewport(width, height);
    renderShell(makeWorld());
    const footer = screen.getByRole("contentinfo");
    const screenEl = footer.closest("div.ahd-screen") as HTMLElement | null;
    expect(screenEl, "missing game screen element").toBeTruthy();
    expect(screenEl!.style.getPropertyValue(FOOTER_HEIGHT_VAR)).toBe("172px");
    expect(rootFooterHeight()).toBe("172px");
  });

  it("clears the shared root value on unmount instead of leaking it", () => {
    stubResizeObserver();
    mockFooterHeight(172);
    setViewport(width, height);
    renderShell(makeWorld());
    screen.getByRole("contentinfo");
    expect(rootFooterHeight()).toBe("172px");
    cleanup();
    expect(rootFooterHeight()).toBe("");
  });
});
