/**
 * Actions hero imagery (#340, slice of #244).
 *
 * Rendered contract for the career Actions route hero: the approved offline
 * `public/static/heroes/actions.webp` (byte-identical to AHDGame, SHA-256
 * `cad398e81644f9ea924c511c649487bd139bf7612a391502205ebea6be86ed80`)
 * renders above the unchanged ActionsHub hierarchy, with the reference
 * image-error gradient fallback and the `actions.webp` fallback for
 * executive countries without bundled art. No remote/CDN source is used.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { RouteHero, executiveHero } from "./RouteHero";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { ProfileView } from "../game/profileTypes";
import type { ElectionView, FinanceView, GameView } from "../game/types";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";

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

function makeElection(): ElectionView {
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
      office: "Representative",
      proposals: [{ id: "cat-a", title: "Labor Standards", description: "Workplace rules." }],
      sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: true },
      bills: [],
    },
    metrics: [],
    parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [makeElection()],
    news: [],
    actions: [
      { id: "campaign", name: "Campaign", description: "Influence work.", cost: 1, available: true, requires: "region", category: "influence", fundCost: 20000, cooldownTurns: 0 },
      { id: "fundraise", name: "Fundraise", description: "Raise money.", cost: 1, available: true, requires: "amount", category: "fundraising", fundCost: 0, cooldownTurns: 0 },
    ],
    regions: [{ id: "r1", name: "Midwest" }],
    finance: makeFinance(),
    polls: { quick: null, full: null },
    notifications: { items: [], unread: 0 },
    nation: { countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: .04, inflationRate: .02, unemploymentRate: .05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: { fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD",
        labels: { title: "Federal Budget", revenueTitle: "Revenue Sources", spendingTitle: "Spending by Category", debtTitle: "National Debt", ceilingLabel: "Debt Ceiling", debtServiceLabel: "Debt Service", transferLabel: "State grants", revenue: {}, spending: {} },
        links: [], taxRates: [], revenue: { components: [], total: 1000 },
        spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800, transfers: [] },
        surplus: 200, treasuryBalance: 4000,
        debt: { principal: 0, ceiling: 10000, interestRate: .02, debtToGdpRatio: 0, creditRating: "AA" } },
      metrics: { total: 0, categories: [] },
      policy: { taxRates: [], enacted: [] } },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, nationalInfluence: { current: 0, gain: 0 }, favorability: { current: 48, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 30, tierCost: 6 }, history: [] },
    ...overrides,
  };
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

function renderGame(world: GameView) {
  return render(
    <GameScreen
      preferences={DEFAULT_PREFERENCES}
      onPreferencesChange={vi.fn()}
      onUpdateProfile={vi.fn(async () => true)}
      onSelectConstituency={vi.fn(async () => true)}
      onMarkNotificationRead={vi.fn()}
      onDeleteNotification={vi.fn()}
      onMarkAllNotificationsRead={vi.fn()}
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
      world={world}
      busy={false}
      onAdvanceTurn={vi.fn()}
      onSave={vi.fn()}
      onExit={vi.fn()}
      onUpdateWorldFeatureFlags={vi.fn()}
      onAction={vi.fn()}
    />,
  );
}

async function goToActions(user: ReturnType<typeof userEvent.setup>) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  const direct = primary.queryByRole("button", { name: "Actions" });
  if (direct) {
    await user.click(direct);
    return;
  }
  await user.click(primary.getByRole("button", { name: "Menu" }));
  await user.click(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("button", { name: "Actions" }));
}

describe("Actions hero imagery", () => {
  it("renders the offline actions hero above the intact ActionsHub hierarchy on the career route", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    renderGame(world);
    await goToActions(user);

    const region = screen.getByRole("region", { name: "Actions" });
    const hero = within(region).getByRole("img", { name: "Political campaign operations" });
    expect(hero.getAttribute("src")).toBe("/static/heroes/actions.webp");
    expect(within(region).getByRole("heading", { name: "Campaign operations" })).toBeInTheDocument();
    expect(within(region).getByText("1953")).toBeInTheDocument();
    expect(within(region).getByText("Ada")).toBeInTheDocument();

    const tabs = within(region).getByRole("tablist", { name: /filter actions by category/i });
    expect(within(tabs).getByRole("tab", { name: /all, 2 of 2 available/i })).toBeInTheDocument();
    expect(within(region).getByRole("article", { name: /^campaign$/i })).toBeInTheDocument();
    expect(within(region).getByRole("article", { name: /^fundraise$/i })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: /take action: campaign/i })).toBeEnabled();
  });

  it("loads the hero from the local bundle only, never a remote CDN", async () => {
    const user = userEvent.setup();
    renderGame(makeWorld());
    await goToActions(user);

    const hero = screen.getByRole("img", { name: "Political campaign operations" });
    const src = hero.getAttribute("src") ?? "";
    expect(src).toBe("/static/heroes/actions.webp");
    expect(src).not.toMatch(/^https?:\/\//);
  });

  it("keeps the gradient and content when the hero image fails, matching the reference fallback", () => {
    render(
      <RouteHero image="/static/heroes/actions.webp" alt="Political campaign operations" eyebrow="1953" title="Campaign operations">
        <span>status</span>
      </RouteHero>,
    );
    const hero = screen.getByRole("img", { name: "Political campaign operations" });
    fireEvent.error(hero);
    expect(screen.queryByRole("img", { name: "Political campaign operations" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campaign operations" })).toBeInTheDocument();
    expect(screen.getByText("1953")).toBeInTheDocument();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
  });

  it("falls back to the Actions artwork for executive countries without bundled art", () => {
    expect(executiveHero("XX")).toBe("/static/heroes/actions.webp");
    expect(executiveHero("US")).toBe("/static/heroes/white-house.webp");
  });

  it("adapts the hero crop from phones to wider screens (320/390 use the compact crop)", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)/);
    expect(css).toMatch(/min-height:\s*220px/);
  });
});
