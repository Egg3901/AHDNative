import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PollingPanel } from "./PollingPanel";
import type { PollingView, StoredPollView } from "../game/types";

const groups = (prefix: string): StoredPollView["topGroups"] =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix} Group ${i}`,
    appeal: 20 - i,
    weightedPotential: 5000 - i * 500,
    turnoutPct: 55 + i,
  }));

const quick: StoredPollView = {
  kind: "quick",
  takenAtTurn: 3,
  takenAt: "1953-01-22",
  homeRegion: "California",
  overallAppeal: 18.25,
  totalEstimatedVoters: 100000,
  totalPotentialVoters: 42000,
  topGroups: groups("Top"),
  bottomGroups: groups("Bottom"),
  granular: { dimensions: ["Voter Groups"], cells: [] },
};

const full: StoredPollView = {
  ...quick,
  kind: "full",
  categories: [
    {
      id: "voterGroups",
      name: "Voter Groups",
      weight: 100,
      totalPotentialVoters: 42000,
      groups: groups("Cat"),
    },
  ],
  inRace: {
    myVotes: 40000,
    opponents: [{ id: "opp-1", name: "Rival", party: "REP", votes: 35000 }],
  },
  granular: {
    dimensions: ["Voter Groups"],
    cells: [{ id: "moderates", label: "moderates", sharePct: 24.5, turnoutPct: 61, playerSharePct: 52.5, undecidedPct: 8 }],
  },
};

describe("PollingPanel", () => {
  it("invites the player to commission a poll when none exists", () => {
    render(<PollingPanel polls={{ quick: null, full: null }} />);
    expect(screen.getByRole("heading", { name: /latest polls/i })).toBeInTheDocument();
    expect(screen.getByText(/no polls yet/i)).toBeInTheDocument();
  });

  it("shows topline stats with best and worst groups for a quick poll", () => {
    render(<PollingPanel polls={{ quick, full: null } satisfies PollingView} />);
    const card = screen.getByRole("article", { name: "Quick Poll" });
    expect(within(card).getByText(/appeal 18\.25/i)).toBeInTheDocument();
    expect(within(card).getByText(/100,000 likely voters/i)).toBeInTheDocument();
    expect(within(card).getByText(/42,000 reachable/i)).toBeInTheDocument();
    expect(within(card).getByText("Top Group 0")).toBeInTheDocument();
    expect(within(card).getByText("Bottom Group 4")).toBeInTheDocument();
    expect(within(card).queryByText(/voter groups/i)).not.toBeInTheDocument();
  });

  it("shows the full breakdown and projected vote for a full poll", async () => {
    const user = userEvent.setup();
    render(<PollingPanel polls={{ quick: null, full } satisfies PollingView} />);
    const card = screen.getByRole("article", { name: "Full Demographic Poll" });
    expect(within(card).getByText(/projected vote/i)).toBeInTheDocument();
    expect(within(card).getByText(/rival.*35,000/i)).toBeInTheDocument();
    await user.click(within(card).getByText(/voter groups · 42,000 reachable/i));
    expect(within(card).getByText("Cat Group 2")).toBeInTheDocument();
    await user.click(within(card).getByText(/granular electorate/i));
    expect(within(card).getByText(/moderates.*24\.5% electorate.*you 52\.5%.*undecided 8%/i)).toBeInTheDocument();
  });

  it("gives every electorate disclosure a 44px phone touch target", () => {
    render(<PollingPanel polls={{ quick: null, full } satisfies PollingView} />);
    const card = screen.getByRole("article", { name: "Full Demographic Poll" });
    const disclosures = [
      within(card).getByText(/voter groups · 42,000 reachable/i).closest("summary")!,
      within(card).getByText(/granular electorate/i).closest("summary")!,
    ];
    expect(disclosures).toHaveLength(2);
    for (const disclosure of disclosures) {
      expect(disclosure.tagName).toBe("SUMMARY");
      expect(disclosure).toHaveStyle({ minHeight: "44px" });
    }
  });

  it("renders both polls when both exist", () => {
    render(<PollingPanel polls={{ quick, full } satisfies PollingView} />);
    expect(screen.getByRole("article", { name: "Quick Poll" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Full Demographic Poll" })).toBeInTheDocument();
  });
});
