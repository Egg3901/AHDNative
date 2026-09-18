/**
 * #510 MP Ask honesty: the MP footer Ask entry without a host `onAsk`
 * callback is an unsupported destination, so it renders disabled with an
 * honest title instead of a live-looking dead control. The four-item
 * hierarchy never shifts (same precedent as the SP drawer disabled
 * "My election" row). Rendered at 320/390px phone and 1280px desktop;
 * the SP drawer Ask entry stays enabled and keeps its offline composer.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { MpModeScreen } from "./MpModeScreen";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { FinanceView, GameView } from "../game/types";
import type { ProfileView } from "../game/profileTypes";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

function makeFinance(): FinanceView {
  return {
    cash: 1200, savings: 300, currency: "USD", savingsHolder: "First National Bank",
    holdings: [],
    deposit: { id: "depositSavings", name: "Deposit", description: "", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "", cost: 0, available: true },
  };
}

function makeWorld(): GameView {
  return {
    turn: 1, date: "1953-01-01", era: "1953", countryId: "US", countryName: "United States",
    difficulty: "normal", autonomyLevel: "v4", featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS },
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor", mode: "career", hosPartyId: null, homeRegionId: null },
    legislature: { office: "Representative", proposals: [], sponsor: { id: "sponsorBill", name: "Sponsor", description: "", cost: 2, available: true }, bills: [] },
    metrics: [],
    parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [],
    news: [], actions: [], regions: [{ id: "r1", name: "Midwest" }],
    finance: makeFinance(), polls: { quick: null, full: null }, notifications: { items: [], unread: 0 },
    nation: {
      countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: 0.04, inflationRate: 0.02, unemploymentRate: 0.05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: {
        fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD",
        labels: { title: "Federal Budget", revenueTitle: "Revenue", spendingTitle: "Spending", debtTitle: "Debt", ceilingLabel: "Ceiling", debtServiceLabel: "Service", transferLabel: "Grants", revenue: {}, spending: {} },
        links: [], taxRates: [], revenue: { components: [], total: 1000 },
        spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800, transfers: [] },
        surplus: 200, treasuryBalance: 4000,
        debt: { principal: 0, ceiling: 10000, interestRate: 0.02, debtToGdpRatio: 0, creditRating: "AA" },
      },
      metrics: { total: 0, categories: [] }, policy: { taxRates: [], enacted: [] },
    },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, nationalInfluence: { current: 0, gain: 0 }, favorability: { current: 48, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 30, tierCost: 6 }, history: [] },
  } as GameView;
}

function renderSp() {
  const world = makeWorld();
  const profile: ProfileView = {
    name: world.player.name, bio: "", avatarUrl: null, campaignSongUrl: "", campaignSongAutoplay: false,
    country: { id: world.countryId, name: world.countryName }, homeRegion: null,
    constituency: { eligible: false, officeType: null, regionId: null, selected: null, options: [], unavailableReason: "Unavailable." },
    party: { id: "p1", name: "Labor", color: "#dc2626" },
    office: world.legislature.office,
    officeDestination: world.legislature.office ? { route: "legislature" } : null,
    policies: null, stats: null, demographics: null, profileHeaderUrl: null, careerHistory: [], achievements: [],
    achievementProgress: { earned: 0, available: 0 }, lockedAchievements: [], unavailableAchievements: [],
    resourceDetails: world.resources,
    standing: { actions: world.player.actions, actionCap: 200, actionGain: 4, politicalInfluence: world.player.influence, nationalInfluence: null, favorability: world.player.favorability, infamy: 0, partyInfluence: null },
    finances: { currency: world.finance.currency, cash: world.finance.cash, savings: world.finance.savings, funds: world.player.funds, donorBaseLevel: 0, regularIncome: 9500, donorIncome: 0 },
  };
  const noop = vi.fn();
  const loadAsync = vi.fn();
  return render(
    <GameScreen
      preferences={DEFAULT_PREFERENCES} onPreferencesChange={noop}
      onUpdateProfile={vi.fn(async () => true)} onSelectConstituency={vi.fn(async () => true)}
      onMarkNotificationRead={noop} onDeleteNotification={noop} onMarkAllNotificationsRead={noop}
      loadProfile={async () => profile}
      loadPolitics={loadAsync} search={loadAsync} loadBondMarket={loadAsync} loadRegions={loadAsync}
      loadCaucusManagement={loadAsync} loadPartyManagement={loadAsync} loadMarkets={loadMarketsStub}
      loadLegislation={loadAsync} loadWorldOverview={loadAsync}
      world={world} busy={false} onAdvanceTurn={noop} onSave={noop} onExit={noop}
      onUpdateWorldFeatureFlags={noop} onAction={noop}
    />,
  );
}

const loadMarketsStub = async () => ({
  playerCountryId: "US", playerCash: 0, playerCurrency: "USD", playerActions: 0, turn: 0,
  marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true,
  countries: [], listings: [], sectors: [],
});

describe.each([320, 390, 1280])("MP Ask without a host callback at %spx (#510)", (width) => {
  it("renders disabled with an honest title, keeping the four destinations", async () => {
    setViewport(width);
    render(<MpModeScreen host={readyHost()} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    const primary = within(screen.getByRole("navigation", { name: "Primary" }));
    const ask = primary.getByRole("button", { name: "Ask" });
    expect(ask).toBeDisabled();
    expect(ask).toHaveAttribute("title", "Ask is unavailable here");
    // The hierarchy never shifts: all four destinations stay in place.
    expect(primary.getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(primary.getByRole("link", { name: "Actions" })).toBeInTheDocument();
    expect(primary.getByRole("button", { name: "Menu" })).toBeEnabled();
  });
});

describe("MP Ask with a host callback (#510)", () => {
  it("stays enabled and routes without an honest-title marker", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const onAsk = vi.fn();
    render(<MpModeScreen host={readyHost()} onAsk={onAsk} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    const ask = within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Ask" });
    expect(ask).toBeEnabled();
    expect(ask).not.toHaveAttribute("title");
    await user.click(ask);
    expect(onAsk).toHaveBeenCalledTimes(1);
  });
});

describe.each([390, 1280])("SP Ask stays reachable at %spx (#510)", (width) => {
  it("opens the offline composer from the bottom tab", async () => {
    setViewport(width);
    const user = userEvent.setup();
    renderSp();
    const primary = within(screen.getByRole("navigation", { name: "Primary" }));
    const ask = primary.getByRole("button", { name: "Ask" });
    expect(ask).toBeEnabled();
    await user.click(ask);
    expect(await screen.findByRole("textbox", { name: "Ask a question" })).toBeInTheDocument();
  });
});
