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

  it("shows no vote figures before any tally exists", async () => {
    const user = userEvent.setup();
    const PoliticsPanel = await renderPanel();
    render(<PoliticsPanel politics={makePolitics()} section="elections" busy={false} onAction={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Race status"), "active");
    expect(screen.queryByText(/votes counted/)).not.toBeInTheDocument();
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
