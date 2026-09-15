import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import type { PoliticsPresidentialView, PoliticsView } from "../game/politics";
import { projectNation } from "../game/nation";

// World clock anchoring the reference calendar for in-game dates (#226).
const CLOCK = { turn: 1, date: "1953-01-13" };

type RaceDetail = PoliticsView["elections"][number];

const raceStages = (current: string): RaceDetail["stages"] => [
  { key: "filing", label: "Filing", state: "done", when: "1954-09-01", detail: "Filing has closed." },
  { key: "primary", label: "Primary", state: current === "primary" ? "current" : "done", when: "1954-09-01", detail: "Primary detail." },
  { key: "general", label: "General", state: current === "general" ? "current" : "upcoming", when: "1954-11-02", detail: "General detail." },
  { key: "results", label: "Results", state: current === "resolved" ? "current" : "upcoming", when: "1954-11-02", detail: "Results detail." },
];

const primaryOpen = (): RaceDetail["primary"] => ({
  applicable: true, open: true, resolved: false, endTurn: 10, endDate: "1954-09-01",
  snapshotTurn: null, totalBallots: null, parties: [],
});

const primaryResolved = (): RaceDetail["primary"] => ({
  applicable: true, open: false, resolved: true, endTurn: 10, endDate: "1952-09-01",
  snapshotTurn: 8, totalBallots: 1200,
  parties: [{
    partyId: "US_DEM", partyName: "Democratic Party",
    entries: [
      { candidateId: "US-3", name: "Sam Winner", ballots: 800, sharePct: 66.7, won: true },
      { candidateId: "US-4", name: "Lou Loser", ballots: 400, sharePct: 33.3, won: false },
    ],
  }],
});

function makePolitics(): PoliticsView {
  return {
    countryId: "US",
    countryName: "United States", currency: "USD",
    playerPartyId: "US_DEM",
    parties: [
      {
        id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3333ff", logoUrl: null,
        members: 260, treasury: 1000000, isPlayerParty: true,
        economicPosition: -2, socialPosition: -1, tier: "major", organization: 60, politicalStrength: 10,
        leaderName: "Jane Chair", viceLeaderName: null, treasurerName: null,
        memberNames: ["Jane Chair", "Sam Member"],
        join: { id: "joinParty", name: "Join", description: "", cost: 1, available: false, disabledReason: "You are already a member of this party." },
        leave: { id: "leaveParty", name: "Leave", description: "", cost: 1, available: true },
      },
      {
        id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#ff3333", logoUrl: null,
        members: 269, treasury: 1000000, isPlayerParty: false,
        economicPosition: 2, socialPosition: 2, tier: "major", organization: 62, politicalStrength: 12,
        leaderName: null, viceLeaderName: null, treasurerName: null,
        memberNames: ["Ron Member"],
        join: { id: "joinParty", name: "Join", description: "", cost: 1, available: true },
        leave: { id: "leaveParty", name: "Leave", description: "", cost: 1, available: false, disabledReason: "You are not a member of this party." },
      },
    ],
    elections: [
      {
        id: "house:US:AL:c1", title: "house · AL", status: "active", date: "1954-11-02", filingDate: "1954-09-01",
        phase: "primary",
        playerCandidate: true,
        candidates: [
          { id: "player", name: "Alex", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: true, votes: null, voteShare: null, winner: false },
          { id: "US-9", name: "Ron Rival", partyId: "US_REP", partyName: "Republican Party", incumbent: true, isPlayer: false, votes: null, voteShare: null, winner: false },
        ],
        winnerNames: [], winnerIds: [], totalVotes: null,
        stages: raceStages("primary"),
        primary: primaryOpen(),
        candidacy: { id: "withdrawCandidacy", name: "Withdraw candidacy", description: "", cost: 1, available: true },
        playerCampaign: null,
        presidential: null,
        projection: {
          resolved: false, countedVotes: null,
          leaderName: null, leaderShare: null, runnerUpName: null, marginPct: null,
          seats: null, snapshotTurn: null, drivers: [], projected: null,
        },
      },
      {
        id: "senate:US:TX:c1", title: "senate · TX", status: "resolved", date: "1952-11-04", filingDate: "1952-09-01",
        phase: "resolved",
        playerCandidate: false,
        candidates: [
          { id: "US-3", name: "Sam Winner", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: false, votes: 6000, voteShare: 0.6, winner: true },
          { id: "US-4", name: "Lou Loser", partyId: "US_REP", partyName: "Republican Party", incumbent: true, isPlayer: false, votes: 4000, voteShare: 0.4, winner: false },
        ],
        winnerNames: ["Sam Winner"], winnerIds: ["US-3"], totalVotes: 10000,
        stages: raceStages("resolved"),
        primary: primaryResolved(),
        candidacy: { id: "declareCandidacy", name: "Run for office", description: "", cost: 1, available: false, disabledReason: "This election has ended." },
        playerCampaign: null,
        presidential: null,
        projection: {
          resolved: true, countedVotes: 10000,
          leaderName: "Sam Winner", leaderShare: 0.6, runnerUpName: "Lou Loser", marginPct: 0.2,
          seats: null, snapshotTurn: 90,
          drivers: [{ kind: "support", label: "Sam Winner support", refId: "US-3" }],
          projected: null,
        },
      },
    ],
    referendums: [],
    referendumRequest: {
      applicable: true,
      note: "A request needs 60 independence desire and costs 3 action points.",
      regions: [
        { regionId: "SCO", regionName: "Scotland", desire: 61, eligible: true },
        { regionId: "WAL", regionName: "Wales", desire: 20, eligible: false, reason: "Independence desire must reach 60 to request a referendum." },
        { regionId: "NIR", regionName: "Northern Ireland", desire: 12, eligible: false, reason: "Independence desire must reach 60 to request a referendum." },
      ],
      action: { id: "requestReferendum", name: "Request Referendum", description: "", cost: 3, available: true },
    },
    politicians: [
      { id: "US-3", name: "Sam Winner", partyId: "US_DEM", partyName: "Democratic Party", office: "Senate · TX", age: 55, economic: -2, social: -1, influence: 40, favorability: 60, infamy: 0, activeRaceIds: [] },
      { id: "US-4", name: "Lou Loser", partyId: "US_REP", partyName: "Republican Party", office: null, age: 61, economic: 2, social: 3, influence: 20, favorability: 45, infamy: 5, activeRaceIds: ["house:US:AL:c1"] },
    ],
  };
}

const renderPanel = async () => {
  const { PoliticsPanel } = await import("./PoliticsPanel");
  return PoliticsPanel;
};

describe("PoliticsPanel parties", () => {
  it("shows platform, tier, leadership and roster with join/leave controls", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="parties" clock={CLOCK} busy={false} onAction={onAction} />);
    expect(screen.getByText("Democratic Party")).toBeInTheDocument();
    expect(screen.getAllByText(/Jane Chair/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Left/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Party"), "US_REP");
    expect(screen.getByRole("button", { name: "Join Republican Party" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join Republican Party" }));
    expect(onAction).toHaveBeenCalledWith("joinParty", { partyId: "US_REP" });
    await user.selectOptions(screen.getByLabelText("Party"), "US_DEM");
    await user.click(screen.getByRole("button", { name: "Leave Democratic Party" }));
    expect(onAction).toHaveBeenCalledWith("leaveParty", undefined);
  });

  it("disables join when busy and shows the reason", async () => {
    const PoliticsPanel = await renderPanel();
    const { rerender } = render(<PoliticsPanel politics={makePolitics()} section="parties" clock={CLOCK} busy={true} onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /leave democratic party/i })).toBeDisabled();
    rerender(<PoliticsPanel politics={{ ...makePolitics(), playerPartyId: null }} section="parties" clock={CLOCK} busy={false} onAction={vi.fn()} />);
  });

  it("reaches every saved roster name through paging and search, and resets those on party change", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    const names = Array.from({ length: 25 }, (_, i) => `Member ${String(i + 1).padStart(2, "0")}`);
    const base = makePolitics();
    const dem = { ...base.parties[0], memberNames: names };
    const rep = { ...base.parties[1], memberNames: ["Ron Member", "Unique Rival"] };
    const view = { ...base, parties: [dem, rep] };
    const { rerender } = render(<PoliticsPanel politics={view} section="parties" clock={CLOCK} busy={false} onAction={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Leave Democratic Party" })).toBeInTheDocument();
    expect(screen.getByText(/Left/)).toBeInTheDocument();
    expect(screen.getByText("Roster (25)")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search roster" })).not.toBeInTheDocument();
    expect(screen.queryByText("Member 13")).not.toBeInTheDocument();

    await user.click(screen.getByText("Roster (25)"));
    expect(screen.getByText("Member 01")).toBeInTheDocument();
    expect(screen.getByText("Member 12")).toBeInTheDocument();
    expect(screen.queryByText("Member 13")).not.toBeInTheDocument();
    expect(screen.queryByText("and 13 more")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next roster page" }));
    expect(screen.getByText("Member 13")).toBeInTheDocument();
    expect(screen.queryByText("Member 01")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next roster page" }));
    expect(screen.getByText("Member 25")).toBeInTheDocument();
    expect(screen.queryByText("Member 13")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search roster" }));
    await user.type(screen.getByRole("searchbox", { name: "Search roster" }), "Member 07");
    expect(screen.getByText("Member 07")).toBeInTheDocument();
    expect(screen.queryByText("Member 25")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next roster page" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Party"), "US_REP");
    expect(screen.getByRole("button", { name: "Join Republican Party" })).toBeInTheDocument();
    expect(screen.getByText("Roster (2)")).toBeInTheDocument();
    await user.click(screen.getByText("Roster (2)"));
    expect(screen.getByRole("searchbox", { name: "Search roster" })).toHaveValue("");
    expect(screen.getByText("Ron Member")).toBeInTheDocument();
    expect(screen.getByText("Unique Rival")).toBeInTheDocument();
    expect(screen.queryByText("Member 07")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Party"), "US_DEM");
    await user.click(screen.getByText("Roster (25)"));
    await user.click(screen.getByRole("button", { name: "Next roster page" }));
    expect(screen.getByText("Member 13")).toBeInTheDocument();
    rerender(<PoliticsPanel politics={{ ...view, parties: [{ ...dem, memberNames: names.slice(0, 5) }, rep] }} section="parties" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("Roster (5)")).toBeInTheDocument();
    expect(screen.getByText("Member 01")).toBeInTheDocument();
    expect(screen.getByText("Member 05")).toBeInTheDocument();
    expect(screen.queryByText("Member 13")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next roster page" })).not.toBeInTheDocument();
  });
});

describe("PoliticsPanel elections", () => {
  it("filters by status and decided races, then files or withdraws with real params", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="elections" clock={CLOCK} busy={false} onAction={onAction} />);
    expect(screen.getByText(/2 of 2 races/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Race status"), "resolved");
    expect(screen.getByText(/1 of 2 races/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sam Winner/).length).toBeGreaterThan(0);
    expect(screen.getByText(/6,000 votes/)).toBeInTheDocument();
    expect(screen.getByText(/Winners: Sam Winner/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run for office" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Race status"), "all");
    await user.click(screen.getByLabelText("Only my races"));
    expect(screen.getByText(/1 of 2 races/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw candidacy" }));
    expect(onAction).toHaveBeenCalledWith("withdrawCandidacy", { electionId: "house:US:AL:c1" });
  });

  it("labels the strength projection separately from counted results", async () => {
    const PoliticsPanel = await renderPanel();
    const politics = makePolitics();
    politics.elections[0]!.projection = {
      ...politics.elections[0]!.projection,
      projected: {
        note: "Projection applies each campaign's current strength to the counted votes. It is an estimate from saved state, not a result.",
        leaderName: "Alex", leaderShare: 0.52, marginPct: 0.04,
      },
    };
    render(<PoliticsPanel politics={politics} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/Projected leader: Alex \(52\.0%\), margin \+4\.0pt/)).toBeInTheDocument();
    expect(screen.getByText(/not a result/i)).toBeInTheDocument();
  });

  it("groups races by stage, shows the primary ledger, and links winners to profiles", async () => {
    const user = userEvent.setup();
    const onOpenPolitician = vi.fn();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} onOpenPolitician={onOpenPolitician} />);

    const raceSelect = screen.getByLabelText("Race");
    const groupLabels = Array.from(raceSelect.querySelectorAll("optgroup")).map((group) => group.getAttribute("label"));
    expect(groupLabels).toEqual(["Primary", "Resolved"]);

    expect(screen.getByText("Race stages")).toBeInTheDocument();
    expect(screen.getByText("Primary is open; no ballots counted yet.")).toBeInTheDocument();

    await user.selectOptions(raceSelect, "senate:US:TX:c1");
    expect(screen.getByText("Nominees recorded.")).toBeInTheDocument();
    expect(screen.getByText("1,200 party ballots counted (turn 8)")).toBeInTheDocument();
    expect(screen.getByText(/66\.7% · nominee/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sam Winner" }));
    expect(onOpenPolitician).toHaveBeenCalledWith("US-3");
  });

  it("labels counted standing and seat availability without forecasting", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Race status"), "resolved");
    expect(screen.getByText(/10,000 votes counted so far/)).toBeInTheDocument();
    expect(screen.getByText(/Counted leader: Sam Winner \(60\.0%\), margin \+20\.0pt over Lou Loser/)).toBeInTheDocument();
    expect(screen.queryByText(/Projected seats/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Race status"), "active");
    expect(screen.getByText("No votes counted yet.")).toBeInTheDocument();
    expect(screen.getByText(/Seat projection unavailable/)).toBeInTheDocument();
  });

  it("manages the player campaign with real upgrade params", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const PoliticsPanel = await renderPanel();
    const politics = makePolitics();
    politics.elections[0]!.playerCampaign = {
      status: "active", funds: 50000, actions: 20,
      spendThisTurn: 0, spendStock: 0,
      totalFundsGenerated: 12000, totalFundsSpent: 0,
      incomePerTurn: 6000, maintenancePerTurn: 0,
      support: 52, generalPhase: false,
      strength: {
        value: 1500, voteBoostPct: 2.96, eligible: true,
        nationalInfluence: 400, strengthPerClick: 300,
        single: { clicks: 1, strengthAdded: 300, costFunds: 24900.3, costActions: 1, affordable: true },
        batch: { clicks: 5, strengthAdded: 1500, costFunds: 124500, costActions: 5, affordable: true },
        max: { clicks: 6, strengthAdded: 1800, costFunds: 149400, costActions: 6, affordable: true },
        targets: [
          { candidateId: "player", name: "Alex", partyName: "Democratic Party", strength: 1500, isPlayer: true },
          { candidateId: "US-9", name: "Ron Rival", partyName: "Republican Party", strength: 0, isPlayer: false },
        ],
        contribute: { id: "campaignContribute", name: "Contribute Campaign Strength", description: "", cost: 1, available: true },
      },
      blend: {
        levers: [
          { category: "fundraising", started: true, effect: "+$35,000/turn income" },
          { category: "oppositionResearch", started: false, effect: "Not yet unlocked" },
          { category: "groundGame", started: false, effect: "Not yet unlocked" },
          { category: "mediaSpending", started: false, effect: "Not yet unlocked" },
        ],
        voteBoostPct: 2.96,
        currencySymbol: "$",
      },
      rally: {
        action: { id: "campaignRally", name: "Campaign Rally", description: "", cost: 6, available: true },
        immediateSupport: 1.8, pendingPerTurn: 0.3, pendingTurns: 4,
        tour: {
          active: false,
          tickCost: 3,
          action: { id: "campaignRallyTour", name: "Start campaign rally tour", description: "", cost: 0, available: true },
        },
      },
      oppositionResearch: {
        targetId: "US-9",
        targetName: "Ron Rival",
        cooldownTurns: 0,
        targets: [{ id: "US-9", name: "Ron Rival", partyName: "Republican Party" }],
        action: { id: "campaignRetarget", name: "Change opposition target", description: "", cost: 0, available: true },
      },
      manager: {
        managerId: "US-9",
        managerName: "Ron Rival",
        managers: [{ id: "US-9", name: "Ron Rival", office: "House · AL" }],
        action: { id: "campaignManager", name: "Update campaign manager", description: "", cost: 0, available: true },
      },
      canvassing: {
        regionId: "AL",
        targets: [{ category: "voterGroups", categoryName: "Voter Groups", group: "young_renters", groupName: "Young Renters", modifier: 0 }],
        action: { id: "campaignCanvass", name: "Canvass voters", description: "", cost: 1, available: true },
      },
      targetedAds: {
        regionId: "AL",
        targets: [{ category: "voterGroups", categoryName: "Voter Groups", group: "young_renters", groupName: "Young Renters", bonus: 0, maxed: false }],
        action: { id: "campaignTargetedAd", name: "Buy targeted ads", description: "", cost: 1, available: true },
      },
      activity: [{
        type: "upgrade", category: "fundraising", branch: null,
        fromLevel: null, newLevel: 1, costFunds: 15000, costActions: 10,
        reason: null, turnNumber: 4,
      }],
      levers: [{
        category: "fundraising", started: false,
        starterFunds: 15000, starterActions: 10, starterEffect: "+$35k/turn base income",
        starterAffordable: true,
        starterUpgrade: { id: "campaignUpgrade", name: "Campaign Upgrade", description: "", cost: 0, available: true },
        branches: [],
      }],
    };
    render(<PoliticsPanel politics={politics} section="campaign" initialId="house:US:AL:c1" clock={CLOCK} busy={false} onAction={onAction} />);
    expect(screen.getByRole("heading", { name: "house · AL" })).toBeInTheDocument();
    expect(screen.getByText(/Your campaign \[active\]/)).toBeInTheDocument();
    expect(screen.getByText(/mood input, not a vote forecast/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.8 support now/)).toBeInTheDocument();
    expect(screen.getByText(/Turn 4 · upgraded fundraising starter to level 1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unlock fundraising starter" }));
    expect(onAction).toHaveBeenCalledWith("campaignUpgrade", { electionId: "house:US:AL:c1", category: "fundraising" });
    await user.click(screen.getByRole("button", { name: "Fire campaign rally" }));
    expect(onAction).toHaveBeenCalledWith("campaignRally", { electionId: "house:US:AL:c1" });
    await user.click(screen.getByRole("button", { name: "Start campaign rally tour" }));
    expect(onAction).toHaveBeenCalledWith("campaignRallyTour", { electionId: "house:US:AL:c1", rallyTour: "start" });
    await user.click(screen.getByRole("button", { name: "Change opposition target" }));
    expect(onAction).toHaveBeenCalledWith("campaignRetarget", { electionId: "house:US:AL:c1", oppositionTargetId: "US-9" });
    await user.click(screen.getByRole("button", { name: "Save campaign manager" }));
    expect(onAction).toHaveBeenCalledWith("campaignManager", { electionId: "house:US:AL:c1", managerId: "US-9" });
    await user.selectOptions(screen.getByLabelText("Canvass target"), "voterGroups:young_renters");
    await user.click(screen.getByRole("button", { name: "Canvass selected target" }));
    expect(onAction).toHaveBeenCalledWith("campaignCanvass", {
      electionId: "house:US:AL:c1",
      regionId: "AL",
      demographicCategory: "voterGroups",
      demographicGroup: "young_renters",
    });
    await user.selectOptions(screen.getByLabelText("Targeted ad target"), "voterGroups:young_renters");
    await user.click(screen.getByRole("button", { name: "Buy targeted ads for selected target" }));
    expect(onAction).toHaveBeenCalledWith("campaignTargetedAd", {
      electionId: "house:US:AL:c1",
      regionId: "AL",
      demographicCategory: "voterGroups",
      demographicGroup: "young_renters",
    });
    expect(screen.getByText(/1,500 strength · \+3\.0% vote boost/)).toBeInTheDocument();
    expect(screen.getByText(/Contribute x1/)).toBeInTheDocument();
    // The operations blend renders each lever's CURRENT standing effect plus the
    // strength boost, clearly labelled as the blend and not a vote forecast.
    expect(screen.getByRole("heading", { name: "Operations blend" })).toBeInTheDocument();
    expect(screen.getByText(/35,000\/turn income/)).toBeInTheDocument();
    expect(screen.getAllByText(/Not yet unlocked/)).toHaveLength(3);
    expect(screen.getByText(/Strength vote boost: \+3\.0% · operations blend, not a vote forecast/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Contribute x1" }));
    expect(onAction).toHaveBeenCalledWith("campaignContribute", { electionId: "house:US:AL:c1", clicks: 1 });
    await user.click(screen.getByRole("button", { name: "Contribute x5" }));
    expect(onAction).toHaveBeenCalledWith("campaignContribute", { electionId: "house:US:AL:c1", clicks: 5 });
    await user.click(screen.getByRole("button", { name: "Contribute Max" }));
    expect(onAction).toHaveBeenCalledWith("campaignContribute", { electionId: "house:US:AL:c1", clicks: "max" });
    // The x1/x5/Max quotes surface their strength and cost from the DTO.
    expect(screen.getByText(/x1: \+300 strength for 1 action and/)).toBeInTheDocument();
    expect(screen.getByText(/x5: \+1,500 strength for 5 actions and/)).toBeInTheDocument();
    // Selecting a rival target aims the contribution at their campaign.
    await user.selectOptions(screen.getByLabelText("Contribution target"), "US-9");
    await user.click(screen.getByRole("button", { name: "Contribute x1" }));
    expect(onAction).toHaveBeenCalledWith("campaignContribute", {
      electionId: "house:US:AL:c1", clicks: 1, targetCandidateId: "US-9",
    });
  });

  it("shows archived campaign detail without management controls", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onOpenCampaign = vi.fn();
    const PoliticsPanel = await renderPanel();
    const politics = makePolitics();
    politics.elections[0]!.playerCampaign = {
      status: "archived", funds: 50000, actions: 20,
      spendThisTurn: 0, spendStock: 0,
      totalFundsGenerated: 12000, totalFundsSpent: 0,
      incomePerTurn: 6000, maintenancePerTurn: 0,
      support: null, generalPhase: false,
      strength: {
        value: 0, voteBoostPct: 0, eligible: false, reason: "Campaign is archived and read-only.",
        nationalInfluence: 400, strengthPerClick: 300,
        single: { clicks: 1, strengthAdded: 300, costFunds: 24900.3, costActions: 1, affordable: false },
        batch: { clicks: 5, strengthAdded: 1500, costFunds: 124500, costActions: 5, affordable: false },
        max: { clicks: 0, strengthAdded: 0, costFunds: 0, costActions: 0, affordable: false },
        targets: [],
        contribute: { id: "campaignContribute", name: "Contribute Campaign Strength", description: "", cost: 1, available: false, disabledReason: "Campaign is archived and read-only." },
      },
      blend: {
        levers: [
          { category: "fundraising", started: false, effect: "Not yet unlocked" },
          { category: "oppositionResearch", started: false, effect: "Not yet unlocked" },
          { category: "groundGame", started: false, effect: "Not yet unlocked" },
          { category: "mediaSpending", started: false, effect: "Not yet unlocked" },
        ],
        voteBoostPct: 0,
        currencySymbol: "$",
      },
      rally: {
        action: {
          id: "campaignRally", name: "Campaign Rally", description: "", cost: 6,
          available: false, disabledReason: "Campaign is archived and read-only.",
        },
        immediateSupport: 1.8, pendingPerTurn: 0.3, pendingTurns: 4,
        tour: {
          active: false,
          tickCost: 3,
          action: {
            id: "campaignRallyTour", name: "Start campaign rally tour", description: "", cost: 0,
            available: false, disabledReason: "Campaign is archived and read-only.",
          },
        },
      },
      oppositionResearch: {
        targetId: null,
        targetName: null,
        cooldownTurns: 0,
        targets: [],
        action: {
          id: "campaignRetarget", name: "Set opposition target", description: "", cost: 0,
          available: false, disabledReason: "Campaign is archived and read-only.",
        },
      },
      manager: {
        managerId: null,
        managerName: null,
        managers: [],
        action: {
          id: "campaignManager", name: "Set campaign manager", description: "", cost: 0,
          available: false, disabledReason: "Campaign is archived and read-only.",
        },
      },
      canvassing: {
        regionId: "AL",
        targets: [],
        action: {
          id: "campaignCanvass", name: "Canvass voters", description: "", cost: 1,
          available: false, disabledReason: "Campaign is archived and read-only.",
        },
      },
      targetedAds: {
        regionId: "AL",
        targets: [],
        action: {
          id: "campaignTargetedAd", name: "Buy targeted ads", description: "", cost: 1,
          available: false, disabledReason: "Campaign is archived and read-only.",
        },
      },
      activity: [],
      levers: [{
        category: "fundraising", started: false,
        starterFunds: 15000, starterActions: 10, starterEffect: "+$35k/turn base income",
        starterAffordable: false,
        starterUpgrade: {
          id: "campaignUpgrade", name: "Campaign Upgrade", description: "", cost: 0,
          available: false, disabledReason: "Campaign is archived and read-only.",
        },
        branches: [{
          branch: "a", level: 0, maxLevel: 3, nextFunds: 10000, nextActions: 5,
          nextEffect: "", affordable: false, maxed: false,
          upgrade: {
            id: "campaignUpgrade", name: "Campaign Upgrade", description: "", cost: 0,
            available: false, disabledReason: "Campaign is archived and read-only.",
          },
        }],
      }],
    };

    render(<PoliticsPanel politics={politics} section="campaign" initialId="house:US:AL:c1" clock={CLOCK} busy={false} onAction={onAction} />);
    expect(screen.getByText("Archived campaign: management is read-only.")).toBeInTheDocument();
    // The operations blend is a read-only summary, so it still renders archived.
    expect(screen.getByRole("heading", { name: "Operations blend" })).toBeInTheDocument();
    expect(screen.getAllByText(/Not yet unlocked/)).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Fire campaign rally" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start campaign rally tour" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set opposition target" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save campaign manager" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Canvass selected target" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buy targeted ads for selected target" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unlock fundraising starter" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Contribute x1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Contribute Max" })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();

    render(<PoliticsPanel politics={politics} section="elections" clock={CLOCK} busy={false} onAction={onAction} onOpenCampaign={onOpenCampaign} />);
    await user.click(screen.getByRole("button", { name: "View campaign" }));
    expect(onOpenCampaign).toHaveBeenCalledWith("house:US:AL:c1");
  });

  it("shows no vote figures before any tally exists", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Race status"), "active");
    expect(screen.getByText("No votes counted yet.")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByText("Ron Rival")).toBeInTheDocument();
    expect(screen.getByText(/incumbent/)).toBeInTheDocument();
  });
});

describe("PoliticsPanel politicians", () => {
  it("filters by party and shows actual fields with active races", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="politicians" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/2 of 2/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Politician party"), "US_REP");
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    const card = screen.getByLabelText("Lou Loser");
    expect(within(card).getByText("Age")).toBeInTheDocument();
    expect(within(card).getByText("Outlook")).toBeInTheDocument();
    expect(within(card).getByText(/house · AL/)).toBeInTheDocument();
  });
});

it("opens an active race from a politician's details", async () => {
  const user = userEvent.setup();
  const PoliticsPanel = await renderPanel();
  const onOpenElection = vi.fn();
  render(<PoliticsPanel politics={makePolitics()} section="politicians" clock={CLOCK} busy={false} onAction={vi.fn()} onOpenElection={onOpenElection} />);
  await user.selectOptions(screen.getByLabelText('Politician'), 'US-4');
  await user.click(screen.getByRole('button', { name: 'View house · AL' }));
  expect(onOpenElection).toHaveBeenCalledWith('house:US:AL:c1');
});

describe("PoliticsPanel referendums", () => {
  const makeReferendum = (
    overrides: Partial<PoliticsView["referendums"][number]> = {},
  ): PoliticsView["referendums"][number] => ({
    id: "referendum-SCO-10", kind: "independence", regionId: "SCO", regionName: "Scotland",
    question: "Should Scotland become an independent country?",
    status: "campaigning", phase: "Campaigning", scope: "Scotland · devolved region",
    yesShare: 55.1, finalYesShare: null, passed: null, turnout: null,
    requestedTurn: 10, campaignOpenTurn: 10, campaignCloseTurn: 58,
    conversionDeadlineTurn: null, cooldownReadyAtTurn: null, latestPollTurn: 12,
    campaign: {
      active: true, yesUnits: 0, noUnits: 0, playerSide: "yes",
      spend: { side: "yes", step: 1, psPerUnit: 1, psAvailable: 30, cost: 1, available: true },
      groundGame: {
        presets: [
          { id: "broadcast_ads", label: "Broadcast & digital ads", effect: "persuade", funds: 380000, actions: 2, nominalSwing: 1.5, affordable: true },
          { id: "mass_rally", label: "Mass rally", effect: "mobilize", funds: 620000, actions: 3, nominalSwing: 3.1, affordable: true },
        ],
        cohorts: [
          { groupId: "age:young", name: "Young (age)", turnoutMod: 0, leanMod: 0 },
          { groupId: "age:senior", name: "Senior (age)", turnoutMod: 0, leanMod: 0 },
        ],
        available: true,
      },
    },
    ...overrides,
  });

  it("requests an eligible region and shows every ineligible reason", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="referendums" clock={CLOCK} busy={false} onAction={onAction} />);
    expect(screen.getByRole("heading", { name: "Referendums" })).toBeInTheDocument();
    expect(screen.getByText("No referendums have been requested.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request referendum in Scotland" }));
    expect(onAction).toHaveBeenCalledWith("requestReferendum", { regionId: "SCO" });
    expect(screen.getByRole("button", { name: "Request referendum in Wales" })).toBeDisabled();
    expect(screen.getAllByText(/must reach 60/i).length).toBeGreaterThan(0);
  });

  it("shows a recorded referendum result from persisted state", async () => {
    const PoliticsPanel = await renderPanel();
    const view = makePolitics();
    view.referendums = [makeReferendum({
      id: "referendum-SCO-10",
      status: "completed", phase: "Completed",
      yesShare: 55.1, finalYesShare: 55.1, passed: true, turnout: 68.1,
      conversionDeadlineTurn: 70, cooldownReadyAtTurn: 130, latestPollTurn: 57,
      campaign: { ...makeReferendum().campaign, active: false },
    })];
    render(<PoliticsPanel politics={view} section="referendums" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("Should Scotland become an independent country?")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getAllByText("55.1%").length).toBe(2);
    expect(screen.getByText("March, Week 3, 1954")).toBeInTheDocument();
  });

  it("spends Political Strength on the player's side and blocks the other side", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const PoliticsPanel = await renderPanel();
    const view = makePolitics();
    const record = makeReferendum({ campaign: { ...makeReferendum().campaign, yesUnits: 4, playerSide: "yes" } });
    view.referendums = [record];
    render(<PoliticsPanel politics={view} section="referendums" clock={CLOCK} busy={false} onAction={onAction} />);
    const card = within(screen.getByLabelText(record.question));

    expect(card.getByText(/Your position: Yes/)).toBeInTheDocument();
    expect(card.getByText(/Yes spend 4/)).toBeInTheDocument();

    await user.selectOptions(card.getByLabelText(`Campaign side (${record.question})`), "yes");
    fireEvent.change(card.getByLabelText(`Campaign spend units (${record.question})`), { target: { value: "3" } });
    await user.click(card.getByRole("button", { name: `Spend on campaign (${record.question})` }));
    expect(onAction).toHaveBeenCalledWith("referendumCampaignSpend", {
      referendumId: record.id, referendumSide: "yes", units: 3,
    });

    // Selecting the party's non-mapped side disables the button with a reason.
    await user.selectOptions(card.getByLabelText(`Campaign side (${record.question})`), "no");
    expect(card.getByRole("button", { name: `Spend on campaign (${record.question})` })).toBeDisabled();
    expect(card.getByText(/Your party campaigns for the Yes side/)).toBeInTheDocument();
  });

  it("runs a ground game from the real cohort list onto a targeted cohort", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const PoliticsPanel = await renderPanel();
    const view = makePolitics();
    const record = makeReferendum();
    view.referendums = [record];
    render(<PoliticsPanel politics={view} section="referendums" clock={CLOCK} busy={false} onAction={onAction} />);
    const card = within(screen.getByLabelText(record.question));

    // The target list is the record's real cohorts, not an invented set.
    expect(card.getByRole("option", { name: "Young (age)" })).toBeInTheDocument();
    expect(card.getByRole("option", { name: "Senior (age)" })).toBeInTheDocument();

    await user.selectOptions(card.getByLabelText(`Ground-game action (${record.question})`), "mass_rally");
    await user.selectOptions(card.getByLabelText(`Ground-game side (${record.question})`), "no");
    await user.selectOptions(card.getByLabelText(`Ground-game target (${record.question})`), "age:young");
    await user.click(card.getByRole("button", { name: `Run ground game (${record.question})` }));
    expect(onAction).toHaveBeenCalledWith("referendumGroundGame", {
      referendumId: record.id, referendumSide: "no", presetId: "mass_rally", cohortGroupId: "age:young",
    });
  });

  it("shows campaign disabled reasons and unaffordable presets", async () => {
    const PoliticsPanel = await renderPanel();
    const view = makePolitics();
    const record = makeReferendum({
      campaign: {
        ...makeReferendum().campaign,
        playerSide: null,
        spend: { side: "yes", step: 1, psPerUnit: 1, psAvailable: 0, cost: 1, available: false, disabledReason: "You must belong to a party to campaign." },
        groundGame: {
          presets: [
            { id: "mass_rally", label: "Mass rally", effect: "mobilize", funds: 620000, actions: 3, nominalSwing: 3.1, affordable: false },
          ],
          cohorts: [{ groupId: "age:young", name: "Young (age)", turnoutMod: 0, leanMod: 0 }],
          available: true,
        },
      },
    });
    view.referendums = [record];
    render(<PoliticsPanel politics={view} section="referendums" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    const card = within(screen.getByLabelText(record.question));
    expect(card.getByText("You must belong to a party to campaign.")).toBeInTheDocument();
    expect(card.getByRole("button", { name: `Spend on campaign (${record.question})` })).toBeDisabled();
    expect(card.getByText("Not enough funds or actions for this action.")).toBeInTheDocument();
    expect(card.getByRole("button", { name: `Run ground game (${record.question})` })).toBeDisabled();
  });
});

function makeCampaignView(): NonNullable<RaceDetail["playerCampaign"]> {
  return {
    status: "active", funds: 50000, actions: 20,
    spendThisTurn: 0, spendStock: 0,
    totalFundsGenerated: 12000, totalFundsSpent: 0,
    incomePerTurn: 6000, maintenancePerTurn: 0,
    support: 52, generalPhase: true,
    strength: {
      value: 1500, voteBoostPct: 2.96, eligible: true,
      nationalInfluence: 400, strengthPerClick: 300,
      single: { clicks: 1, strengthAdded: 300, costFunds: 24900.3, costActions: 1, affordable: true },
      batch: { clicks: 5, strengthAdded: 1500, costFunds: 124500, costActions: 5, affordable: true },
      max: { clicks: 6, strengthAdded: 1800, costFunds: 149400, costActions: 6, affordable: true },
      targets: [],
      contribute: { id: "campaignContribute", name: "Contribute", description: "", cost: 1, available: true },
    },
    blend: { levers: [{ category: "fundraising", started: true, effect: "+$35,000/turn income" }], voteBoostPct: 2.96, currencySymbol: "$" },
    rally: {
      action: { id: "campaignRally", name: "Campaign Rally", description: "", cost: 6, available: true },
      immediateSupport: 1.8, pendingPerTurn: 0.3, pendingTurns: 4,
      tour: { active: false, tickCost: 3, action: { id: "campaignRallyTour", name: "Start tour", description: "", cost: 0, available: true } },
    },
    oppositionResearch: { targetId: null, targetName: null, cooldownTurns: 0, targets: [], action: { id: "campaignRetarget", name: "Set opposition target", description: "", cost: 0, available: true } },
    manager: { managerId: null, managerName: null, managers: [], action: { id: "campaignManager", name: "Set campaign manager", description: "", cost: 0, available: true } },
    canvassing: { regionId: null, targets: [], action: { id: "campaignCanvass", name: "Canvass", description: "", cost: 1, available: true } },
    targetedAds: { regionId: null, targets: [], action: { id: "campaignTargetedAd", name: "Buy targeted ads", description: "", cost: 1, available: true } },
    activity: [],
    levers: [],
  };
}

const makePresidentialView = (overrides: Partial<PoliticsPresidentialView> = {}): PoliticsPresidentialView => ({
  applicable: true, hasStateTallies: true,
  totalElectoralVotes: 59, majorityThreshold: 30,
  electors: [
    { candidateId: "US-3", name: "Sam Winner", partyId: "US_DEM", partyName: "Democratic Party", electoralVotes: 35, popularVotes: 3000 },
    { candidateId: "US-4", name: "Lou Loser", partyId: "US_REP", partyName: "Republican Party", electoralVotes: 24, popularVotes: 2000 },
  ],
  states: [
    { stateId: "CA", stateName: "California", electoralVotes: 32, winnerId: "US-3", winnerName: "Sam Winner", votes: [{ candidateId: "US-3", name: "Sam Winner", votes: 1000 }, { candidateId: "US-4", name: "Lou Loser", votes: 400 }] },
    { stateId: "TX", stateName: "Texas", electoralVotes: 24, winnerId: "US-4", winnerName: "Lou Loser", votes: [{ candidateId: "US-4", name: "Lou Loser", votes: 700 }] },
    { stateId: "WY", stateName: "Wyoming", electoralVotes: 3, winnerId: "US-3", winnerName: "Sam Winner", votes: [{ candidateId: "US-3", name: "Sam Winner", votes: 50 }] },
  ],
  resolved: false, winnerId: null, winnerName: null,
  note: "Each state awards its whole electoral-vote block to its plurality winner. A candidate needs 30 of 59 electoral votes to win the presidency.",
  ...overrides,
});

const makePresidentialRace = (overrides: Partial<RaceDetail> = {}): RaceDetail => ({
  id: "president:US:-:c1", title: "president", status: "active", date: "1956-11-06", filingDate: "1956-09-01",
  phase: "general",
  playerCandidate: true,
  candidates: [
    { id: "US-3", name: "Sam Winner", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: false, votes: 3000, voteShare: 0.6, winner: false },
    { id: "US-4", name: "Lou Loser", partyId: "US_REP", partyName: "Republican Party", incumbent: false, isPlayer: false, votes: 2000, voteShare: 0.4, winner: false },
  ],
  winnerNames: [], winnerIds: [], totalVotes: 5000,
  stages: raceStages("general"),
  primary: { applicable: false, open: false, resolved: false, endTurn: 20, endDate: "1956-09-01", snapshotTurn: null, totalBallots: null, parties: [] },
  candidacy: { id: "withdrawCandidacy", name: "Withdraw candidacy", description: "", cost: 1, available: true },
  playerCampaign: makeCampaignView(),
  presidential: makePresidentialView(),
  projection: { resolved: false, countedVotes: 5000, leaderName: "Sam Winner", leaderShare: 0.6, runnerUpName: "Lou Loser", marginPct: 0.2, seats: null, snapshotTurn: null, drivers: [], projected: null },
  ...overrides,
});

describe("PoliticsPanel presidential race", () => {
  it("renders the recorded Electoral College, per-state accumulation, timers and campaign link", async () => {
    const user = userEvent.setup();
    const onOpenCampaign = vi.fn();
    const PoliticsPanel = await renderPanel();
    const view = makePolitics();
    view.elections = [makePresidentialRace()];
    render(<PoliticsPanel politics={view} section="presidential" clock={CLOCK} busy={false} onAction={vi.fn()} onOpenCampaign={onOpenCampaign} />);

    expect(screen.getByRole("heading", { name: "Presidential election" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Electoral College" })).toBeInTheDocument();
    expect(screen.getByText(/59 electoral votes recorded · 30 needed to win/)).toBeInTheDocument();
    expect(screen.getByText(/35 EV/)).toBeInTheDocument();
    expect(screen.getByText(/Each state awards its whole electoral-vote block/)).toBeInTheDocument();
    expect(screen.getByText("Race stages")).toBeInTheDocument();

    // Per-state accumulation is behind the recorded state names and votes.
    await user.click(screen.getByText("Per-state tally (3)"));
    expect(screen.getByText("California")).toBeInTheDocument();
    expect(screen.getByText("Texas")).toBeInTheDocument();
    expect(screen.getByText("Sam Winner 1,000 · Lou Loser 400")).toBeInTheDocument();

    // Campaign link carries the recorded Profile influence that feeds strength.
    expect(screen.getByText(/400 national influence feeds campaign strength/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manage campaign" }));
    expect(onOpenCampaign).toHaveBeenCalledWith("president:US:-:c1");
  });

  it("shows the recorded result after resolution", () => {
    const PoliticsPanel = renderPanel();
    const view = makePolitics();
    view.elections = [makePresidentialRace({
      status: "resolved", phase: "resolved",
      stages: raceStages("resolved"),
      winnerNames: ["Sam Winner"], winnerIds: ["US-3"],
      candidates: [
        { id: "US-3", name: "Sam Winner", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: false, votes: 3000, voteShare: 0.6, winner: true },
        { id: "US-4", name: "Lou Loser", partyId: "US_REP", partyName: "Republican Party", incumbent: false, isPlayer: false, votes: 2000, voteShare: 0.4, winner: false },
      ],
      presidential: makePresidentialView({ resolved: true, winnerId: "US-3", winnerName: "Sam Winner" }),
    })];
    return PoliticsPanel.then((Panel) => {
      render(<Panel politics={view} section="presidential" clock={CLOCK} busy={false} onAction={vi.fn()} />);
      expect(screen.getByText("Result: Sam Winner won the presidency.")).toBeInTheDocument();
      expect(screen.getByText("Winners: Sam Winner")).toBeInTheDocument();
    });
  });

  it("reports the fallback when the engine recorded no per-state tallies", () => {
    const PoliticsPanel = renderPanel();
    const view = makePolitics();
    view.elections = [makePresidentialRace({
      presidential: makePresidentialView({
        hasStateTallies: false, totalElectoralVotes: 0, majorityThreshold: 0, states: [],
        electors: [{ candidateId: "US-3", name: "Sam Winner", partyId: "US_DEM", partyName: "Democratic Party", electoralVotes: 0, popularVotes: 3000 }],
        note: "This race has no recorded per-state tallies, so no state-by-state or electoral-vote accumulation is available; only the counted national tally is shown.",
      }),
    })];
    return PoliticsPanel.then((Panel) => {
      render(<Panel politics={view} section="presidential" clock={CLOCK} busy={false} onAction={vi.fn()} />);
      expect(screen.queryByText(/needed to win/)).not.toBeInTheDocument();
      expect(screen.getByText(/no recorded per-state tallies/)).toBeInTheDocument();
      expect(screen.queryByText(/Per-state tally/)).not.toBeInTheDocument();
    });
  });

  it("links from the Elections surface to the presidential race destination", async () => {
    const user = userEvent.setup();
    const onOpenPresidential = vi.fn();
    const PoliticsPanel = await renderPanel();
    const view = makePolitics();
    view.elections = [makePresidentialRace()];
    render(<PoliticsPanel politics={view} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} onOpenPresidential={onOpenPresidential} />);
    await user.click(screen.getByRole("button", { name: "Presidential race" }));
    expect(onOpenPresidential).toHaveBeenCalledWith("president:US:-:c1");
    await user.click(screen.getByRole("button", { name: "View presidential race" }));
    expect(onOpenPresidential).toHaveBeenCalledWith("president:US:-:c1");
  });
});

describe("PoliticsPanel political metrics", () => {
  it("renders the registry Native already projects through the reused nation view", () => {
    const PoliticsPanel = renderPanel();
    const nation = projectNation(createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "politics-metrics-view" }));
    return PoliticsPanel.then((Panel) => {
      render(<Panel politics={makePolitics()} section="metrics" clock={CLOCK} busy={false} onAction={vi.fn()} nation={nation} />);
      expect(screen.getByRole("heading", { name: "Metrics" })).toBeInTheDocument();
      expect(screen.getByText("National metrics registry")).toBeInTheDocument();
      expect(screen.getByText(`${nation.metrics.total} recorded`)).toBeInTheDocument();
    });
  });

  it("shows an honest empty state when no nation registry is available", () => {
    const PoliticsPanel = renderPanel();
    return PoliticsPanel.then((Panel) => {
      render(<Panel politics={makePolitics()} section="metrics" clock={CLOCK} busy={false} onAction={vi.fn()} />);
      expect(screen.getByRole("heading", { name: "Political metrics" })).toBeInTheDocument();
      expect(screen.getByText(/No national metrics are recorded/)).toBeInTheDocument();
    });
  });
});
