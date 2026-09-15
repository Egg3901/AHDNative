import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { DEFAULT_PREFERENCES } from "../preferences";
import { projectWorldOverview } from "../game/worldOverview";
import { projectRegions } from "../game/regions";
import type { GameView } from "../game/types";
import { GameScreen } from "./GameScreen";
import { MENU_GROUPS } from "./MobileNavigation";

const engineWorld = () =>
  createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "nation-context-84" });

function makeShell(): GameView {
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
    legislature: { office: null, proposals: [], sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: true }, bills: [] },
    metrics: [],
    parties: [],
    elections: [],
    news: [],
    actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true }],
    regions: [{ id: "r1", name: "Midwest" }],
    finance: {
      cash: 1200, savings: 300, currency: "USD", savingsHolder: "First National Bank", holdings: [],
      deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
      withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
    },
    polls: { quick: null, full: null },
    notifications: { items: [], unread: 0 },
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
      metrics: { total: 0, categories: [] },
      policy: { taxRates: [], enacted: [] },
    },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, nationalInfluence: { current: 0, gain: 0 }, favorability: { current: 48, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 30, tierCost: 6 }, history: [] },
  } as unknown as GameView;
}

function shellProps(world: GameView, spies: { onSave: ReturnType<typeof vi.fn>; onAction: ReturnType<typeof vi.fn>; onAdvanceTurn: ReturnType<typeof vi.fn> }) {
  const source = engineWorld();
  return {
    preferences: DEFAULT_PREFERENCES,
    onPreferencesChange: vi.fn(),
    onUpdateProfile: vi.fn(async () => true),
    onSelectConstituency: vi.fn(async () => true),
    onMarkNotificationRead: vi.fn(),
    onDeleteNotification: vi.fn(),
    onMarkAllNotificationsRead: vi.fn(),
    loadProfile: async () => ({
      name: world.player.name, bio: "", avatarUrl: null, campaignSongUrl: "", campaignSongAutoplay: false,
      country: { id: world.countryId, name: world.countryName }, homeRegion: null,
      constituency: { eligible: false, officeType: null, regionId: null, selected: null, options: [], unavailableReason: "Unavailable." },
      party: null, office: null, officeDestination: null, policies: null, stats: null, demographics: null,
      profileHeaderUrl: null, careerHistory: [], achievements: [],
      achievementProgress: { earned: 0, available: 0 }, lockedAchievements: [], unavailableAchievements: [],
      resourceDetails: world.resources,
      standing: { actions: 3, actionCap: 200, actionGain: 4, politicalInfluence: 12, nationalInfluence: null, favorability: 48, infamy: 0, partyInfluence: null },
      finances: { currency: "USD", cash: 1200, savings: 300, funds: 5000, donorBaseLevel: 0, regularIncome: 9500, donorIncome: 0 },
    }),
    search: async (query: string) => ({ query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } }),
    loadBondMarket: vi.fn(),
    loadRegions: async (query?: Parameters<typeof projectRegions>[1]) => projectRegions(source, query),
    loadCaucusManagement: vi.fn(),
    loadPartyManagement: vi.fn(),
    loadMarkets: async () => ({ playerCountryId: "US", playerCash: 0, playerCurrency: "USD", playerActions: 0, turn: 0, marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [], sectors: [] }),
    loadLegislation: async () => ({ office: null, playerChamberKey: null, countryId: "US", chambers: [], committees: [], schedule: [], proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const, sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "" }),
    loadPolitics: async () => ({ countryId: "US", countryName: "United States", currency: "USD", playerPartyId: null, parties: [], elections: [], referendums: [], referendumRequest: { applicable: false, note: "Unavailable.", regions: [], action: { id: "requestReferendum", name: "Request", description: "", cost: 0, available: false, disabledReason: "Unavailable." } }, politicians: [] }),
    loadWorldOverview: async () => projectWorldOverview(source),
    world,
    busy: false,
    onAdvanceTurn: spies.onAdvanceTurn,
    onSave: spies.onSave,
    onExit: vi.fn(),
    onUpdateWorldFeatureFlags: vi.fn(),
    onAction: spies.onAction,
  };
}

async function navigate(user: ReturnType<typeof userEvent.setup>, name: string) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  const direct = primary.queryByRole("button", { name });
  if (direct) { await user.click(direct); return; }
  await user.click(primary.getByRole("button", { name: "Menu" }));
  const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
  let destination = menu.queryByRole("button", { name });
  if (!destination) {
    const collapsedGroup = MENU_GROUPS.find((group) =>
      group.sections?.some((section) => section.items.some((item) => item.label === name)),
    );
    if (collapsedGroup) {
      await user.click(menu.getByRole("button", { name: collapsedGroup.label }));
      destination = menu.getByRole("button", { name });
    }
  }
  expect(destination).not.toBeNull();
  await user.click(destination!);
}

describe("issue #84 nation context, wallet, and map links", () => {
  it("keeps the browsed nation across the World map round trip without touching save or turn", async () => {
    const user = userEvent.setup();
    const world = makeShell();
    const spies = { onSave: vi.fn(), onAction: vi.fn(), onAdvanceTurn: vi.fn() };
    render(<GameScreen {...shellProps(world, spies)} />);

    await navigate(user, "Nations");
    await user.selectOptions(await screen.findByRole("combobox", { name: "Nation view" }), "FR");
    expect(await screen.findByRole("heading", { name: "France" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open France in World map" }));
    expect(await screen.findByRole("heading", { name: "World map" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open France nation details" }));
    expect(await screen.findByRole("heading", { name: "France" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Nation context" })).getByRole("note"))
      .toHaveTextContent("Your country is United States (US)");

    expect(spies.onSave).not.toHaveBeenCalled();
    expect(spies.onAction).not.toHaveBeenCalled();
    expect(spies.onAdvanceTurn).not.toHaveBeenCalled();
    expect(world.turn).toBe(1);
    expect(world.date).toBe("1953-01-01");
    expect(world.countryId).toBe("US");
  });

  it("exposes Profile, Actions, and Wallet in the drawer identity without corp/union rows", async () => {
    const user = userEvent.setup();
    const world = makeShell();
    const spies = { onSave: vi.fn(), onAction: vi.fn(), onAdvanceTurn: vi.fn() };
    render(<GameScreen {...shellProps(world, spies)} />);

    await user.click(screen.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
    expect(menu.queryByText(/My Corporation/)).not.toBeInTheDocument();
    expect(menu.queryByText(/My Union/)).not.toBeInTheDocument();

    await user.click(menu.getByRole("button", { name: "Go to wallet" }));
    expect(await screen.findByRole("region", { name: "Portfolio" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("button", { name: "Go to actions" }));
    expect(await screen.findByRole("region", { name: "Actions" })).toBeInTheDocument();

    expect(spies.onSave).not.toHaveBeenCalled();
    expect(spies.onAction).not.toHaveBeenCalled();
    expect(spies.onAdvanceTurn).not.toHaveBeenCalled();
    expect(world.countryId).toBe("US");
  });

  it("cross-links the explicit wallet/portfolio and banking destinations", async () => {
    const user = userEvent.setup();
    const world = makeShell();
    const spies = { onSave: vi.fn(), onAction: vi.fn(), onAdvanceTurn: vi.fn() };
    render(<GameScreen {...shellProps(world, spies)} />);

    await navigate(user, "Portfolio");
    expect(screen.getByRole("region", { name: "Portfolio" })).toHaveTextContent("Wallet balances");
    await user.click(screen.getByRole("button", { name: "Go to banking" }));
    expect(await screen.findByRole("region", { name: "Banking" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to portfolio" }));
    expect(await screen.findByRole("region", { name: "Portfolio" })).toBeInTheDocument();

    expect(spies.onSave).not.toHaveBeenCalled();
    expect(spies.onAction).not.toHaveBeenCalled();
    expect(spies.onAdvanceTurn).not.toHaveBeenCalled();
    expect(world.turn).toBe(1);
  });
});
