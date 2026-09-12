import type { ProfileView } from "../game/profileTypes";
import { DEFAULT_PREFERENCES } from "../preferences";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import type { GameView } from "../game/types";
import type { NotificationItem } from "../game/notifications";

function notif(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "t1-a", key: "a", turn: 1, date: "1953-01-08", category: "election",
    title: "Filing open: Senate Race", body: "File soon.", unread: true,
    actionRequired: true, destination: { route: "electionDetails", detailId: "e1" },
    ...overrides,
  };
}

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1,
    date: "1953-01-08",
    era: "1953",
    countryId: "US",
    countryName: "United States",
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor" },
    legislature: {
      office: null,
      proposals: [],
      sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: false, disabledReason: "No seat" },
      bills: [],
    },
    metrics: [],
    parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [{ id: "e1", title: "Senate Race", status: "primary", date: "1954-11-02", filingDate: "1954-09-01",
      phase: "primary",
      playerCandidate: false, candidateNames: ["Ada"], winnerNames: [],
      candidacy: { id: "declareCandidacy", name: "Run", description: "Run", cost: 1, available: true } }],
    news: [],
    actions: [],
    regions: [],
    finance: { cash: 1200, savings: 300, currency: "USD", savingsHolder: "Bank",
      holdings: [],
      deposit: { id: "depositSavings", name: "Deposit", description: "", cost: 0, available: true },
      withdraw: { id: "withdrawSavings", name: "Withdraw", description: "", cost: 0, available: true } },
    nation: { countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: .04, inflationRate: .02, unemploymentRate: .05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: { fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD", taxRates: [], revenue: { components: [], total: 1000 }, spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800 }, surplus: 200, treasuryBalance: 4000, debt: { principal: 0, ceiling: 10000, interestRate: .02, debtToGdpRatio: 0, creditRating: "AA" } },
      policy: { taxRates: [], enacted: [] } },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, history: [] },
    notifications: { items: [], unread: 0 },
    ...overrides,
  };
}

const baseProps = {
  preferences: DEFAULT_PREFERENCES,
  onPreferencesChange: vi.fn(),
  onUpdateProfile: vi.fn(async () => true),
  onMarkNotificationRead: vi.fn(),
  onDeleteNotification: vi.fn(),
  onMarkAllNotificationsRead: vi.fn(),
};
const search = async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } });
const loadBondMarket = vi.fn();
const loadRegions = vi.fn();
const loadCaucusManagement = vi.fn();
const loadPartyManagement = vi.fn();
const loadMarkets = async () => ({ playerCountryId: "US", playerCash: 0, playerCurrency: "USD", playerActions: 0, turn: 0, marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [] });
const loadLegislation = async () => ({ office: null, playerChamberKey: null, chambers: [], proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const, sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "" });
const loadWorldOverview = async () => ({ era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null, nations: [], homeRegion: null });
const loadPolitics = async () => ({ countryId: "US", countryName: "United States", currency: "USD", playerPartyId: null, parties: [], elections: [], referendums: [], referendumRequest: { applicable: false, note: "Referendums are only available in the UK in this local slice.", regions: [], action: { id: "requestReferendum", name: "Request Referendum", description: "", cost: 0, available: false, disabledReason: "Referendums are UK-only." } }, politicians: [] });

function profileFor(world: GameView): ProfileView {
  return {
    name: world.player.name, bio: "", avatarUrl: null, campaignSongUrl: "", campaignSongAutoplay: false,
    country: { id: world.countryId, name: world.countryName }, homeRegion: null,
    party: world.player.partyName ? { id: "p1", name: world.player.partyName, color: "#dc2626" } : null,
    office: world.legislature.office,
    officeDestination: world.legislature.office ? { route: "legislature" } : null,
    policies: null, stats: null, careerHistory: [], achievements: [],
    achievementProgress: { earned: 0, available: 0 }, lockedAchievements: [],
    resourceDetails: world.resources,
    standing: { actions: world.player.actions, actionCap: 200, actionGain: 4,
      politicalInfluence: world.player.influence, nationalInfluence: null,
      favorability: world.player.favorability, infamy: 0, partyInfluence: null },
    finances: { currency: world.finance.currency, cash: world.finance.cash, savings: world.finance.savings,
      funds: world.player.funds, donorBaseLevel: 0, regularIncome: 9500, donorIncome: 0 },
  };
}

function renderGame(world: GameView, overrides = {}) {
  return render(<GameScreen {...baseProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics}
    search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement}
    loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation}
    loadWorldOverview={loadWorldOverview} world={world} busy={false}
    onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} {...overrides} />);
}

describe("GameScreen notifications", () => {
  it("shows the unread badge in the footer and opens the five-item preview", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      notifications: { items: [notif(), notif({ id: "t1-b", key: "b", title: "Funds arrived", category: "treasury", actionRequired: false })], unread: 2 },
    });
    const onMarkNotificationRead = vi.fn();
    renderGame(world, { onMarkNotificationRead });
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    const preview = screen.getByRole("dialog", { name: "Notification preview" });
    expect(within(preview).getByText("Filing open: Senate Race")).toBeInTheDocument();
    expect(within(preview).getByText("2 unread")).toBeInTheDocument();
    await user.click(within(preview).getByRole("button", { name: /mark read.*filing open/i }));
    expect(onMarkNotificationRead).toHaveBeenCalledWith("t1-a");
    await user.click(within(preview).getByRole("button", { name: /open inbox/i }));
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
  });

  it("reaches the inbox through the drawer with the unread badge", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ notifications: { items: [notif()], unread: 1 } });
    renderGame(world);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Game menu" });
    await user.click(within(menu).getByRole("button", { name: "Notifications" }));
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    const inbox = screen.getByRole("region", { name: "Notifications" });
    expect(within(inbox).getAllByText("Filing open: Senate Race").length).toBeGreaterThan(0);
  });

  it("opens a live election destination from the inbox", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ notifications: { items: [notif()], unread: 1 } });
    renderGame(world);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("button", { name: "Notifications" }));
    const inbox = screen.getByRole("region", { name: "Notifications" });
    await user.click(within(inbox).getByRole("button", { name: "Open notification: Filing open: Senate Race" }));
    await user.click(within(screen.getByRole("region", { name: "Notification detail" })).getByRole("button", { name: /view election/i }));
    expect(screen.getByRole("region", { name: "Election details" })).toBeInTheDocument();
  });

  it("hides the badge when the inbox is clear", () => {
    renderGame(makeWorld());
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unread/ })).not.toBeInTheDocument();
  });

  it("exposes preview open state on the bell and disables preview mutations when busy", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      notifications: { items: [notif()], unread: 1 },
    });
    renderGame(world);
    const bell = screen.getByRole("button", { name: "Notifications, 1 unread" });
    expect(bell).toHaveAttribute("aria-expanded", "false");
    await user.click(bell);
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toHaveAttribute("aria-expanded", "true");
  });

  it("disables the bell while busy", () => {
    const world = makeWorld({ notifications: { items: [notif()], unread: 1 } });
    renderGame(world, { busy: true });
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeDisabled();
  });
});
