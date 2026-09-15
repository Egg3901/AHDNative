/**
 * Elections hero band (#377, slice of #143).
 *
 * Rendered contract for the Elections hub hero: a RouteHero band with title,
 * tagline and a stat strip (Contested prominent, next filing deadline) above
 * the unchanged race lists. Zero contested races read as open ground, not an
 * empty page. Art is the provenance recorded offline
 * `public/static/heroes/politicians.webp` (SHA-256
 * `bb3078558687f426d939f74672e339033147e241b21495b269b59cc12acb7a00`);
 * no remote image is used.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ElectionsHero, summarizeElections } from "./ElectionsHero";
import { GameScreen } from "./GameScreen";
import { DEFAULT_PREFERENCES } from "../preferences";
import type { ProfileView } from "../game/profileTypes";
import type { ElectionView, FinanceView, GameView } from "../game/types";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { MENU_GROUPS } from "./MobileNavigation";

function makeFinance(): FinanceView {
  return {
    cash: 1200, savings: 300, currency: "USD", savingsHolder: "First National Bank",
    holdings: [],
    deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
  };
}

function makeElection(overrides: Partial<ElectionView> = {}): ElectionView {
  return {
    id: "e1", title: "General Election", status: "upcoming", date: "1954-11-02",
    filingDate: "1954-09-01", electionType: "house", phase: "upcoming",
    playerCandidate: false, candidateNames: ["Ada", "Bob"], winnerNames: [],
    countedVotes: null, leaderName: null, leaderShare: null, marginPct: null, seatProjection: null,
    candidacy: { id: "declareCandidacy", name: "Declare candidacy", description: "Run", cost: 1, available: true },
    ...overrides,
  };
}

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1, date: "1953-01-01", era: "1953", countryId: "US", countryName: "United States",
    difficulty: "normal", autonomyLevel: "v4",
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
    actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" }],
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

function renderGame(world: GameView, onAction: (id: string, params?: Record<string, string | number>) => void) {
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
      onAction={onAction}
    />,
  );
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

describe("summarizeElections", () => {
  it("counts contested races and picks the earliest open filing deadline", () => {
    const summary = summarizeElections([
      makeElection({ id: "e1", status: "upcoming", filingDate: "1954-09-01", candidateNames: ["Ada", "Bob"] }),
      makeElection({ id: "e2", status: "upcoming", filingDate: "1954-08-01", candidateNames: ["Solo"] }),
      makeElection({ id: "e3", status: "resolved", filingDate: "1952-09-01", candidateNames: ["A", "B"] }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.contested).toBe(1);
    expect(summary.nextDeadline).toBe("1954-08-01");
  });

  it("reports no deadline when every race is resolved", () => {
    const summary = summarizeElections([
      makeElection({ id: "e3", status: "resolved", filingDate: "1952-09-01", candidateNames: ["A", "B"] }),
    ]);
    expect(summary.nextDeadline).toBeNull();
  });
});

describe("ElectionsHero", () => {
  it("renders the offline hero band with tagline and a contested first stat strip", () => {
    render(
      <ElectionsHero
        countryName="United States"
        summary={{ total: 2, contested: 1, nextDeadline: "1954-09-01" }}
        nextDeadlineLabel="Sep 1954"
      />,
    );
    const hero = screen.getByRole("img", { name: "Elected representatives meeting in a national chamber" });
    expect(hero.getAttribute("src")).toBe("/static/heroes/politicians.webp");
    expect(hero.getAttribute("src")).not.toMatch(/^https?:\/\//);
    expect(screen.getByRole("heading", { name: "Elections" })).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeInTheDocument();
    const strip = screen.getByRole("list", { name: "Election overview" });
    const items = within(strip).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/contested/i);
    expect(within(strip).getByText("1")).toBeInTheDocument();
    expect(strip).toHaveTextContent(/next deadline/i);
    expect(strip).toHaveTextContent("Sep 1954");
  });

  it("frames zero contested races as open ground, not an empty page", () => {
    render(
      <ElectionsHero
        countryName="United States"
        summary={{ total: 2, contested: 0, nextDeadline: "1954-09-01" }}
        nextDeadlineLabel="Sep 1954"
      />,
    );
    expect(screen.getByText(/open ground/i)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("keeps the gradient and content when the hero image fails", () => {
    render(
      <ElectionsHero
        countryName="United States"
        summary={{ total: 1, contested: 1, nextDeadline: null }}
        nextDeadlineLabel={null}
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Elected representatives meeting in a national chamber" }));
    expect(screen.queryByRole("img", { name: "Elected representatives meeting in a national chamber" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elections" })).toBeInTheDocument();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
    expect(screen.getByText(/no filing deadline/i)).toBeInTheDocument();
  });

  it("adapts band crop and stat density without overflow from 320px to desktop", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/\.ahd-elections-stats[^{]*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.ahd-elections-stats[^{]*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)/);
  });

  it("keeps hero controls at touch size", () => {
    const onOpenPresidential = vi.fn();
    render(
      <ElectionsHero
        countryName="United States"
        summary={{ total: 1, contested: 1, nextDeadline: null }}
        nextDeadlineLabel={null}
        hasPresidential
        onOpenPresidential={onOpenPresidential}
        busy={false}
      />,
    );
    const button = screen.getByRole("button", { name: "Presidential race" });
    expect(button).toBeEnabled();
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-btn-sm[^{]*\{[^}]*min-height:\s*44px/);
  });
});

describe("Elections hub composition", () => {
  it("shows the hero band above the unchanged race list with run and withdraw intact", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      elections: [
        makeElection({ id: "e1", title: "General Election", candidateNames: ["Ada", "Bob"] }),
        makeElection({
          id: "e2", title: "Senate Race", status: "upcoming", phase: "upcoming",
          date: "1954-11-02", filingDate: "1954-10-01",
          candidacy: { id: "withdrawCandidacy", name: "Withdraw", description: "Out", cost: 1, available: true },
          candidateNames: ["Ada"], winnerNames: [],
        }),
      ],
    });
    renderGame(world, onAction);
    await navigate(user, "Elections");

    const region = screen.getByRole("region", { name: "Elections" });
    expect(within(region).getByRole("img", { name: "Elected representatives meeting in a national chamber" })).toHaveAttribute("src", "/static/heroes/politicians.webp");
    expect(within(region).getByRole("heading", { name: "Elections" })).toBeInTheDocument();
    const strip = within(region).getByRole("list", { name: "Election overview" });
    expect(strip).toHaveTextContent(/contested/i);

    const hero = within(region).getByRole("heading", { name: "Elections" }).closest("header")!;
    const firstRace = within(region).getByRole("article", { name: "General Election" });
    expect(hero.compareDocumentPosition(firstRace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(within(region).getByRole("article", { name: "General Election" })).getByRole("button", { name: /run for office/i }));
    expect(onAction).toHaveBeenCalledWith("declareCandidacy", { electionId: "e1" });
    await user.click(within(within(region).getByRole("article", { name: "Senate Race" })).getByRole("button", { name: /withdraw candidacy/i }));
    expect(onAction).toHaveBeenCalledWith("withdrawCandidacy", { electionId: "e2" });
  });

  it("keeps pagination and winner rows below the hero", async () => {
    const user = userEvent.setup();
    const elections = Array.from({ length: 25 }, (_, i) =>
      makeElection({ id: `e${i}`, title: `Race ${i}`, filingDate: "1954-09-01" }),
    );
    elections[24] = makeElection({ id: "e24", title: "Race 24", filingDate: "1954-09-01", winnerNames: ["Bob"] });
    renderGame(makeWorld({ elections }), vi.fn());
    await navigate(user, "Elections");

    const region = screen.getByRole("region", { name: "Elections" });
    expect(within(region).getByRole("heading", { name: "Elections" })).toBeInTheDocument();
    expect(within(region).getByRole("article", { name: "Race 0" })).toBeInTheDocument();
    expect(within(region).queryByRole("article", { name: "Race 24" })).not.toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: /next page/i }));
    expect(within(region).getByRole("article", { name: "Race 24" })).toBeInTheDocument();
    expect(within(region).getByText(/winners:.*bob/i)).toBeInTheDocument();
  });

  it("keeps the empty schedule framed by the hero instead of a bare list", async () => {
    const user = userEvent.setup();
    renderGame(makeWorld({ elections: [] }), vi.fn());
    await navigate(user, "Elections");
    const region = screen.getByRole("region", { name: "Elections" });
    expect(within(region).getByRole("heading", { name: "Elections" })).toBeInTheDocument();
    expect(within(region).getByText("No elections scheduled.")).toBeInTheDocument();
    expect(within(region).getByText(/open ground/i)).toBeInTheDocument();
  });
});
