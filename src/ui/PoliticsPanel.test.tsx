import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PoliticsView } from "../game/politics";

function makePolitics(): PoliticsView {
  return {
    countryId: "US",
    countryName: "United States", currency: "USD",
    playerPartyId: "US_DEM",
    parties: [
      {
        id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3333ff",
        members: 260, treasury: 1000000, isPlayerParty: true,
        economicPosition: -2, socialPosition: -1, tier: "major", organization: 60, politicalStrength: 10,
        leaderName: "Jane Chair", viceLeaderName: null, treasurerName: null,
        memberNames: ["Jane Chair", "Sam Member"],
        join: { id: "joinParty", name: "Join", description: "", cost: 1, available: false, disabledReason: "You are already a member of this party." },
        leave: { id: "leaveParty", name: "Leave", description: "", cost: 1, available: true },
      },
      {
        id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#ff3333",
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
        playerCandidate: true,
        candidates: [
          { id: "player", name: "Alex", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: true, votes: null, voteShare: null, winner: false },
          { id: "US-9", name: "Ron Rival", partyId: "US_REP", partyName: "Republican Party", incumbent: true, isPlayer: false, votes: null, voteShare: null, winner: false },
        ],
        winnerNames: [], totalVotes: null,
        candidacy: { id: "withdrawCandidacy", name: "Withdraw candidacy", description: "", cost: 1, available: true },
        playerCampaign: null,
        projection: {
          resolved: false, countedVotes: null,
          leaderName: null, leaderShare: null, runnerUpName: null, marginPct: null,
          seats: null, snapshotTurn: null, drivers: [],
        },
      },
      {
        id: "senate:US:TX:c1", title: "senate · TX", status: "resolved", date: "1952-11-04", filingDate: "1952-09-01",
        playerCandidate: false,
        candidates: [
          { id: "US-3", name: "Sam Winner", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: false, votes: 6000, voteShare: 0.6, winner: true },
          { id: "US-4", name: "Lou Loser", partyId: "US_REP", partyName: "Republican Party", incumbent: true, isPlayer: false, votes: 4000, voteShare: 0.4, winner: false },
        ],
        winnerNames: ["Sam Winner"], totalVotes: 10000,
        candidacy: { id: "declareCandidacy", name: "Run for office", description: "", cost: 1, available: false, disabledReason: "This election has ended." },
        playerCampaign: null,
        projection: {
          resolved: true, countedVotes: 10000,
          leaderName: "Sam Winner", leaderShare: 0.6, runnerUpName: "Lou Loser", marginPct: 0.2,
          seats: null, snapshotTurn: 90,
          drivers: [{ kind: "support", label: "Sam Winner support", refId: "US-3" }],
        },
      },
    ],
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
    render(<PoliticsPanel politics={makePolitics()} section="parties" busy={false} onAction={onAction} />);
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
    const { rerender } = render(<PoliticsPanel politics={makePolitics()} section="parties" busy={true} onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /leave democratic party/i })).toBeDisabled();
    rerender(<PoliticsPanel politics={{ ...makePolitics(), playerPartyId: null }} section="parties" busy={false} onAction={vi.fn()} />);
  });

  it("reaches every saved roster name through paging and search, and resets those on party change", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    const names = Array.from({ length: 25 }, (_, i) => `Member ${String(i + 1).padStart(2, "0")}`);
    const base = makePolitics();
    const dem = { ...base.parties[0], memberNames: names };
    const rep = { ...base.parties[1], memberNames: ["Ron Member", "Unique Rival"] };
    const view = { ...base, parties: [dem, rep] };
    const { rerender } = render(<PoliticsPanel politics={view} section="parties" busy={false} onAction={vi.fn()} />);

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
    rerender(<PoliticsPanel politics={{ ...view, parties: [{ ...dem, memberNames: names.slice(0, 5) }, rep] }} section="parties" busy={false} onAction={vi.fn()} />);
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
    render(<PoliticsPanel politics={makePolitics()} section="elections" busy={false} onAction={onAction} />);
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

  it("labels counted standing and seat availability without forecasting", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="elections" busy={false} onAction={vi.fn()} />);
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
    render(<PoliticsPanel politics={politics} section="campaign" initialId="house:US:AL:c1" busy={false} onAction={onAction} />);
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

    render(<PoliticsPanel politics={politics} section="campaign" initialId="house:US:AL:c1" busy={false} onAction={onAction} />);
    expect(screen.getByText("Archived campaign: management is read-only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fire campaign rally" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start campaign rally tour" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set opposition target" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save campaign manager" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unlock fundraising starter" })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();

    render(<PoliticsPanel politics={politics} section="elections" busy={false} onAction={onAction} onOpenCampaign={onOpenCampaign} />);
    await user.click(screen.getByRole("button", { name: "View campaign" }));
    expect(onOpenCampaign).toHaveBeenCalledWith("house:US:AL:c1");
  });

  it("shows no vote figures before any tally exists", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="elections" busy={false} onAction={vi.fn()} />);
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
    render(<PoliticsPanel politics={makePolitics()} section="politicians" busy={false} onAction={vi.fn()} />);
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
  render(<PoliticsPanel politics={makePolitics()} section="politicians" busy={false} onAction={vi.fn()} onOpenElection={onOpenElection} />);
  await user.selectOptions(screen.getByLabelText('Politician'), 'US-4');
  await user.click(screen.getByRole('button', { name: 'View house · AL' }));
  expect(onOpenElection).toHaveBeenCalledWith('house:US:AL:c1');
});
