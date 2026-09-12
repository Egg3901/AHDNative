import type { ProfileView } from "../game/profileTypes";
import { DEFAULT_PREFERENCES } from "../preferences";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import type { ElectionView, FinanceView, GameView } from "../game/types";

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
    phase: "upcoming",
    playerCandidate: false,
    candidateNames: ["Ada", "Bob"],
    winnerNames: [],
    candidacy: { id: "declareCandidacy", name: "Declare candidacy", description: "Run", cost: 1, available: true },
    ...overrides,
  };
}

const preferencesProps = { preferences: DEFAULT_PREFERENCES, onPreferencesChange: vi.fn(), onUpdateProfile: vi.fn(async () => true),
  onMarkNotificationRead: vi.fn(), onDeleteNotification: vi.fn(), onMarkAllNotificationsRead: vi.fn() };
function profileFor(world: GameView): ProfileView {
  return {
    name: world.player.name, bio: "", avatarUrl: null, campaignSongUrl: "", campaignSongAutoplay: false,
    country: { id: world.countryId, name: world.countryName }, homeRegion: null,
    party: world.player.partyName ? { id: "p1", name: world.player.partyName, color: "#dc2626" } : null,
    office: world.legislature.office,
    officeDestination: world.legislature.office ? { route: "legislature" } : null,
    policies: null, stats: null, careerHistory: [], achievements: [],
    resourceDetails: world.resources,
    standing: { actions: world.player.actions, actionCap: 200, actionGain: 4,
      politicalInfluence: world.player.influence, nationalInfluence: null,
      favorability: world.player.favorability, infamy: 0, partyInfluence: null },
    finances: { currency: world.finance.currency, cash: world.finance.cash, savings: world.finance.savings,
      funds: world.player.funds, donorBaseLevel: 0, regularIncome: 9500, donorIncome: 0 },
  };
}
const search = async (query: string) => ({ query, results: [], total: 0 });
const loadBondMarket = vi.fn();
const loadRegions = vi.fn();
const loadCaucusManagement = vi.fn();
const loadPartyManagement = vi.fn();
const loadMarkets = async () => ({ playerCountryId: "US", playerCash: 0, playerCurrency: "USD", playerActions: 0, turn: 0, marketsPhaseEnabled: true, economyPhaseEnabled: true, corporationsPhaseEnabled: true, countries: [], listings: [] });
const loadLegislation = async () => ({ office: null, playerChamberKey: null, chambers: [], proposals: [], selectedBill: null, selectedProposal: null, sponsorSupportsLevelChoice: false as const, sponsorSupportsTaxRateChoice: true as const, levelChoiceNote: "" });
const loadWorldOverview = async () => ({ era: "1953", turn: 1, date: "1953-01-01", playerCountryId: "US", playerHomeRegionId: null, nations: [], homeRegion: null });
const loadPolitics = async () => ({ countryId: "US", countryName: "United States", currency: "USD", playerPartyId: null, parties: [], elections: [], politicians: [] });

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1,
    date: "1953-01-01",
    era: "1953",
    countryId: "US",
    countryName: "United States",
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor" },
    legislature: {
      office: "Representative",
      proposals: [{ id: "cat-a", title: "Labor Standards", description: "Workplace rules." }],
      sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: true },
      bills: [
        {
          id: "b1", title: "Wage Bill", status: "active", chamber: "house", sponsorName: "Ada",
          votesFor: 12, votesAgainst: 7, votesAbstain: 3,
          playerVote: null,
          voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 0, available: true },
        },
      ],
    },
    metrics: [{ id: "gdp", label: "GDP", value: 12345, format: "money" }],
    parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [makeElection()],
    news: [{ id: "n1", title: "Markets rally", body: "Stocks up.", date: "1953-02-01" }],
    actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" }],
    regions: [{ id: "r1", name: "Midwest" }],
    finance: makeFinance(),
    notifications: { items: [], unread: 0 },
    nation: { countryId: "US", countryName: "United States", currency: "USD",
      economy: { gdpMillions: 100, growthRate: .04, inflationRate: .02, unemploymentRate: .05, outputGap: 0, primeRate: 3, macroHistory: [], primeRateHistory: [] },
      budget: { fiscalYear: 1953, gdpAbsolute: 100000000, population: 1000000, currency: "USD", taxRates: [], revenue: { components: [], total: 1000 }, spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 800 }, surplus: 200, treasuryBalance: 4000, debt: { principal: 0, ceiling: 10000, interestRate: .02, debtToGdpRatio: 0, creditRating: "AA" } },
      policy: { taxRates: [], enacted: [] } },
    resources: { actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 7, refresh: 4 }, funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, partyInfluence: null, history: [] },
    ...overrides,
  };
}

async function navigate(user: ReturnType<typeof userEvent.setup>, name: string) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  const direct = primary.queryByRole("button", { name });
  if (direct) { await user.click(direct); return; }
  await user.click(primary.getByRole("button", { name: "Menu" }));
  await user.click(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("button", { name }));
}

describe("GameScreen", () => {
  it("opens on the player profile, matching the existing game entry flow", async () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /end turn/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save game/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(await within(profile).findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(profile).toHaveTextContent("Representative");
    expect(profile).toHaveTextContent("Political standing");
    expect(screen.queryByText("GDP")).not.toBeInTheDocument();
    expect(screen.getAllByText(/united states/i).length).toBeGreaterThan(0);
  });

  it("keeps the own-profile context across linked destinations and return", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const profile = screen.getByRole("region", { name: "Profile" });
    await user.click(await within(profile).findByRole("button", { name: "Representative" }));
    expect(screen.getByRole("region", { name: "Legislature" })).toBeInTheDocument();
    await navigate(user, "Profile");
    expect(await within(screen.getByRole("region", { name: "Profile" })).findByRole("heading", { name: "Ada" })).toBeInTheDocument();
  });

  it("switches between bottom destinations and drawer destinations", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Parties");
    expect(screen.getByRole("button", { name: "Parties" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Labor")).toBeInTheDocument();
    await navigate(user, "Elections");
    expect(screen.getByText("General Election")).toBeInTheDocument();
    await navigate(user, "News");
    expect(screen.getByText("Markets rally")).toBeInTheDocument();
  });

  it("bottom navigation opens its destination with page focus", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("region", { name: "Actions" })).toHaveFocus();
  });

  it("supports keyboard arrow navigation", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const profile = screen.getByRole("button", { name: "Profile" });
    profile.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Actions" })).toHaveAttribute("aria-current", "page");
  });

  it("has four keyboard-reachable bottom destinations", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const buttons = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons.every(button => button.tabIndex === 0)).toBe(true);
  });

  it("shows empty states explicitly for each collection", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ metrics: [], parties: [], elections: [], news: [], actions: [] });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Actions");
    expect(screen.getByText("No actions available.")).toBeInTheDocument();
    await navigate(user, "Parties");
    expect(screen.getByText("No parties in this world.")).toBeInTheDocument();
    await navigate(user, "Elections");
    expect(screen.getByText("No elections scheduled.")).toBeInTheDocument();
    await navigate(user, "News");
    expect(screen.getByText("No news yet.")).toBeInTheDocument();
  });

  it("reflects busy disabling actions and shows message and error", async () => {
    const world = makeWorld();
    const onAction = vi.fn();
    const { rerender } = render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={true} message="Advancing" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    expect(screen.getByText("Advancing")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("button", { name: /end turn/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save game/i })).toBeDisabled();
    rerender(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} error="Save failed" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    expect(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("alert")).toHaveTextContent("Save failed");
  });

  it("invokes onAdvanceTurn, onSave, onExit", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    const onAdvanceTurn = vi.fn();
    const onSave = vi.fn();
    const onExit = vi.fn();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={onAdvanceTurn} onSave={onSave} onExit={onExit} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: /end turn/i }));
    await user.click(screen.getByRole("button", { name: /save game/i }));
    await user.click(screen.getByRole("button", { name: /exit game/i }));
    expect(onAdvanceTurn).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("performs action with params and respects disabledReason", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      actions: [
        { id: "blocked", name: "Blocked", description: "no", cost: 1, available: false, disabledReason: "Need more influence" },
        { id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    expect(screen.getAllByText("Need more influence").length).toBeGreaterThan(0);
    const takeButtons = screen.getAllByRole("button", { name: /take action/i });
    const available = takeButtons.find((b) => b.textContent?.includes("Fundraise"));
    expect(available).toBeTruthy();
    const amountInput = screen.getByLabelText(/amount for fundraise/i) as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "25");
    await user.click(available!);
    expect(onAction).toHaveBeenCalledWith("fundraise", expect.objectContaining({ amount: 25 }));
  });

  it("validates amount before invocation and shows error for invalid", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" }],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    const amountInput = screen.getByLabelText(/amount for fundraise/i) as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.click(screen.getByRole("button", { name: /take action: fundraise/i }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText(/positive whole amount/i)).toBeInTheDocument();
  });

  it("action labels distinguish which action", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      actions: [
        { id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" },
        { id: "advertise", name: "Advertise", description: "Run ads", cost: 1, available: true },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Actions");
    expect(screen.getByRole("button", { name: /take action: fundraise/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take action: advertise/i })).toBeInTheDocument();
  });

  it("handles party and region required actions via actual props", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [{ id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", members: 80, treasury: 4000, isPlayerParty: false }],
      regions: [{ id: "r2", name: "North" }],
      actions: [
        { id: "endorse", name: "Endorse", description: "Endorse party", cost: 1, available: true, requires: "party" },
        { id: "tour", name: "Tour", description: "Tour region", cost: 1, available: true, requires: "region" },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    const buttons = screen.getAllByRole("button", { name: /take action:/i });
    await user.click(buttons[0]!);
    expect(onAction).toHaveBeenCalledWith("endorse", expect.objectContaining({ partyId: "p2" }));
    await user.click(buttons[1]!);
    expect(onAction).toHaveBeenCalledWith("tour", expect.objectContaining({ regionId: "r2" }));
  });

  it("does not invoke when party or region selection missing", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [],
      regions: [],
      actions: [
        { id: "joinParty", name: "Join Party", description: "Join", cost: 1, available: true, requires: "party" },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Actions");
    await user.click(screen.getByRole("button", { name: /take action: join party/i }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not render fake disabled feature pages", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const tabs = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("button");
    tabs.forEach((t) => expect(t).not.toBeDisabled());
    expect(tabs.map((t) => t.textContent)).toEqual(["Profile", "Actions", "Parties", "Menu"]);
  });

  it("keeps national figures on Economy, reached through the game menu", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    world.nation.economy.growthRate = 0.031;
    world.nation.economy.inflationRate = 0.046;
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByText("GDP")).not.toBeInTheDocument();
    await navigate(user, "Economy");
    expect(screen.getByRole("region", { name: "Economy" })).toHaveTextContent("GDP");
    expect(screen.getByText("3.1%")).toBeInTheDocument();
    expect(screen.getByText("4.6%")).toBeInTheDocument();
  });

  it("election card shows filing deadline, badge, candidates and runs for office", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      elections: [makeElection({ playerCandidate: true, candidateNames: ["Ada", "Bob"] })],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Elections");
    const card = screen.getByRole("article", { name: "General Election" });
    expect(within(card).getByText(/1954-09-01/)).toBeInTheDocument();
    expect(within(card).getByText("Upcoming")).toBeInTheDocument();
    expect(within(card).getByText("Candidate")).toBeInTheDocument();
    expect(within(card).getByText(/Ada/)).toBeInTheDocument();
    const run = within(card).getByRole("button", { name: /run for office/i });
    expect(run).toBeEnabled();
    await user.click(run);
    expect(onAction).toHaveBeenCalledWith("declareCandidacy", { electionId: "e1" });
  });

  it("withdraw candidacy dispatches with electionId and shows reason when unavailable", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      elections: [
        makeElection({
          id: "e9",
          title: "Senate Race",
          candidacy: { id: "withdrawCandidacy", name: "Withdraw", description: "Out", cost: 0, available: false, disabledReason: "Filing closed" },
          winnerNames: ["Bob"],
        }),
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Elections");
    const card = screen.getByRole("article", { name: "Senate Race" });
    expect(within(card).getByText(/winners:.*bob/i)).toBeInTheDocument();
    const withdraw = within(card).getByRole("button", { name: /withdraw candidacy/i });
    expect(withdraw).toBeDisabled();
    expect(within(card).getAllByText(/filing closed/i).length).toBeGreaterThan(0);
    await user.click(withdraw).catch(() => undefined);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("candidacy button is disabled while busy", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={true} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Elections");
    const card = screen.getByRole("article", { name: "General Election" });
    expect(within(card).getByRole("button", { name: /run for office/i })).toBeDisabled();
  });

  it("paginates elections 20 per page so every election stays reachable", async () => {
    const user = userEvent.setup();
    const elections = Array.from({ length: 25 }, (_, i) =>
      makeElection({ id: `e${i}`, title: `Race ${i}`, filingDate: "1954-09-01" }),
    );
    const world = makeWorld({ elections });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Elections");
    expect(screen.getByRole("article", { name: "Race 0" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Race 24" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("article", { name: "Race 24" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Race 0" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /previous page/i }));
    expect(screen.getByRole("article", { name: "Race 0" })).toBeInTheDocument();
  });

  it("party cards join and leave via world.actions availability with candidacy warning", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [
        { id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", members: 120, treasury: 9000, isPlayerParty: true },
        { id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", members: 80, treasury: 4000, isPlayerParty: false },
      ],
      actions: [
        { id: "joinParty", name: "Join Party", description: "Join", cost: 2, available: true, requires: "party" },
        { id: "leaveParty", name: "Leave Party", description: "Leave", cost: 0, available: true },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await navigate(user, "Parties");
    expect(screen.getByText(/withdraws your candidacy/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /join tories/i }));
    expect(onAction).toHaveBeenCalledWith("joinParty", { partyId: "p2" });
    await user.click(screen.getByRole("button", { name: /leave labor/i }));
    expect(onAction).toHaveBeenCalledWith("leaveParty", undefined);
  });

  it("shows the legislature office on Profile and through the Legislature tab", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    expect(await screen.findByText("Representative")).toBeInTheDocument();
    await navigate(user, "Legislature");
    expect(screen.getByLabelText("Legislation")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Wage Bill" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "cat-a" });
  });

  it("shows no office on Profile without an office", async () => {
    const world = makeWorld({ legislature: { ...makeWorld().legislature, office: null } });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    expect(await screen.findByText("No office")).toBeInTheDocument();
  });

  it("party join button surfaces disabled reason from world.actions", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      parties: [{ id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", members: 80, treasury: 4000, isPlayerParty: false }],
      actions: [{ id: "joinParty", name: "Join Party", description: "Join", cost: 2, available: false, disabledReason: "Cooldown", requires: "party" }],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await navigate(user, "Parties");
    expect(screen.getByRole("button", { name: /join tories/i })).toBeDisabled();
    expect(screen.getAllByText(/cooldown/i).length).toBeGreaterThan(0);
  });

  it("deep-links from Profile finances into Fundraising and preserves the filter on return", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      actions: [
        { id: "campaign", name: "Campaign", description: "Influence work.", cost: 1, available: true, category: "influence", fundCost: 20000, cooldownTurns: 0 },
        { id: "fundraise", name: "Fundraise", description: "Raise money.", cost: 3, available: true, category: "fundraising", fundCost: 0, cooldownTurns: 0 },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Fundraising actions" }));
    const hub = screen.getByRole("region", { name: "Actions" });
    expect(within(hub).getByRole("tab", { name: /fundraising/i })).toHaveAttribute("aria-selected", "true");
    expect(within(hub).queryByText("Campaign")).not.toBeInTheDocument();
    expect(within(hub).getByText("Fundraise")).toBeInTheDocument();
    await navigate(user, "Profile");
    expect(screen.getByText(/turn 1/i)).toBeInTheDocument();
    await navigate(user, "Actions");
    expect(screen.getByRole("tab", { name: /fundraising/i })).toHaveAttribute("aria-selected", "true");
  });

  it("deep-links from footer funds details into Fundraising", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      actions: [
        { id: "campaign", name: "Campaign", description: "Influence work.", cost: 1, available: true, category: "influence", fundCost: 20000, cooldownTurns: 0 },
        { id: "fundraise", name: "Fundraise", description: "Raise money.", cost: 3, available: true, category: "fundraising", fundCost: 0, cooldownTurns: 0 },
      ],
    });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /campaign funds:/i }));
    await user.click(screen.getByRole("button", { name: "Go to Actions" }));
    expect(screen.getByRole("tab", { name: /fundraising/i })).toHaveAttribute("aria-selected", "true");
  });
});

describe("GameScreen navigation menu", () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Menu" }));
    return screen.getByRole("dialog", { name: "Game menu" });
  }

  it("opens a grouped menu with all destinations and closes on selection", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const menuButton = screen.getByRole("button", { name: "Menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    const menu = await openMenu(user);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("group", { name: "Character" })).toBeInTheDocument();
    expect(within(menu).getByRole("group", { name: "Nation" })).toBeInTheDocument();
    expect(within(menu).getByRole("group", { name: "World" })).toBeInTheDocument();
    const character = within(menu).getByRole("group", { name: "Character" });
    expect(within(character).getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(within(character).getByRole("button", { name: "Actions" })).toBeInTheDocument();
    expect(within(character).getByRole("button", { name: "Portfolio" })).toBeInTheDocument();
    const nation = within(menu).getByRole("group", { name: "Nation" });
    expect(within(nation).getByRole("button", { name: "Economy" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Parties" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Legislature" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Elections" })).toBeInTheDocument();
    const worldGroup = within(menu).getByRole("group", { name: "World" });
    expect(within(worldGroup).getByRole("button", { name: "Banking" })).toBeInTheDocument();
    expect(within(worldGroup).getByRole("button", { name: "News" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: "News" }));
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    expect(screen.getByText("Markets rally")).toBeInTheDocument();
  });

  it("closes the menu on Escape and returns focus to the Menu button", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await openMenu(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
  });

  it("navigates to a real Profile route with player data", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Profile" }));
    const region = screen.getByRole("region", { name: "Profile" });
    expect(await within(region).findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(within(region).getByText(/labor/i)).toBeInTheDocument();
    expect(within(region).getByText("Representative")).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("renders Portfolio from world.finance in a region with no tab selected", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Portfolio" }));
    const region = screen.getByRole("region", { name: "Portfolio" });
    expect(within(region).getByText("Acme Steel")).toBeInTheDocument();
    expect(within(region).getByText(/ACME/)).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("button").forEach(t => expect(t).not.toHaveAttribute("aria-current", "page"));
  });

  it("renders Banking from world.finance and deposits through the real action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Banking" }));
    const region = screen.getByRole("region", { name: "Banking" });
    expect(within(region).getByText("First National Bank")).toBeInTheDocument();
    await user.clear(within(region).getByLabelText(/amount/i));
    await user.type(within(region).getByLabelText(/amount/i), "200");
    await user.click(within(region).getByRole("button", { name: /deposit/i }));
    expect(onAction).toHaveBeenCalledWith("depositSavings", { amount: 200 });
  });

  it("menu Actions destination opens the Actions page", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("button", { name: "Actions" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("returns to a tab route from a region route", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("button", { name: "Portfolio" }));
    expect(screen.getByRole("region", { name: "Portfolio" })).toBeInTheDocument();
    await navigate(user, "Profile");
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Portfolio" })).not.toBeInTheDocument();
  });
});

describe("GameScreen status footer", () => {
  it("persists turn, date, player-paced status and five resource buttons", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    expect(within(footer).getByText(/turn 1/i)).toBeInTheDocument();
    expect(within(footer).getByText(/1953-01-01/)).toBeInTheDocument();
    expect(within(footer).getByText(/player paced/i)).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /action points/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /campaign funds/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /cash/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /influence/i })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: /favorability/i })).toBeInTheDocument();
  });

  it("shows processing status while busy", () => {
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={true} message="Advancing" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    expect(within(footer).getByText(/processing/i)).toBeInTheDocument();
    expect(within(footer).queryByText(/player paced/i)).not.toBeInTheDocument();
  });

  it("formats money with finance.currency", () => {
    const world = makeWorld({ finance: makeFinance({ currency: "EUR", cash: 1200, savings: 300 }) });
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    const cash = within(footer).getByRole("button", { name: /cash/i });
    expect(cash.getAttribute("aria-label")).toMatch(/€|EUR/);
  });

  it("opens nonmodal cash details with close, real data, and links to Actions, Profile and Portfolio", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    const cash = within(footer).getByRole("button", { name: /cash/i });
    await user.click(cash);
    const dialog = screen.getByRole("dialog", { name: /cash details/i });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(within(dialog).getByText(/1,200/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/per turn/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /go to actions/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /go to profile/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /go to portfolio/i })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo", { name: "Status and primary navigation" })).getByRole("button", { name: /cash/i })).toHaveFocus();
  });

  it("closes resource details on Escape and returns focus", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    await user.click(within(footer).getByRole("button", { name: /influence/i }));
    expect(screen.getByRole("dialog", { name: /influence details/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo", { name: "Status and primary navigation" })).getByRole("button", { name: /influence/i })).toHaveFocus();
  });

  it("details links navigate to real destinations", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(world)} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const footer = screen.getByRole("contentinfo", { name: "Status and primary navigation" });
    await user.click(within(footer).getByRole("button", { name: /campaign funds/i }));
    const dialog = screen.getByRole("dialog", { name: /campaign funds details/i });
    await user.click(within(dialog).getByRole("button", { name: /go to portfolio/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Portfolio" })).toBeInTheDocument();
  });
});

describe("GameScreen menu keyboard flow", () => {
  it("focuses and moves between destinations, then focuses the selected page", async () => {
    const user = userEvent.setup();
    render(<GameScreen {...preferencesProps} loadProfile={async () => profileFor(makeWorld())} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={makeWorld()} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const drawer = screen.getByRole("dialog", { name: "Game menu" });
    within(drawer).getByRole("button", { name: "Profile" }).focus();
    await user.keyboard("{Tab}{Tab}{Enter}");
    expect(screen.getByRole("region", { name: "Portfolio" })).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
  });
});
