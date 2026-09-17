import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegislatureView } from "../game/types";
import { LEGISLATURE_NAV_STORAGE_KEY } from "../game/legislature";

// World clock anchoring the reference calendar for in-game dates (#226).
const CLOCK = { turn: 1, date: "1953-01-13" };

beforeEach(() => {
  window.localStorage.clear();
});

function makeLegislature(overrides: Partial<LegislatureView> = {}): LegislatureView {
  return {
    office: "Representative",
    proposals: [
      { id: "cat-a", title: "Labor Standards", description: "Workplace rules." },
      { id: "cat-b", title: "Rail Subsidy", description: "Rail funding." },
    ],
    sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: true },
    bills: [
      {
        id: "b1", title: "Wage Bill", status: "active", chamber: "house", sponsorName: "Ada",
        votesFor: 12, votesAgainst: 7, votesAbstain: 3,
        playerVote: null,
        voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 0, available: true },
      },
    ],
    ...overrides,
  };
}

const renderPanel = async () => {
  const { LegislaturePanel } = await import("./LegislaturePanel");
  return LegislaturePanel;
};

describe("LegislaturePanel", () => {
  it("shows the player office, or No legislative seat without one", async () => {
    const LegislaturePanel = await renderPanel();
    const { rerender } = render(
      <LegislaturePanel legislature={makeLegislature()} clock={CLOCK} busy={false} onAction={vi.fn()} />,
    );
    expect(screen.getByText("Representative")).toBeInTheDocument();
    rerender(<LegislaturePanel legislature={makeLegislature({ office: null })} clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("No legislative seat")).toBeInTheDocument();
  });

  it("sponsors the selected proposal via Legislation select with description", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislaturePanel = await renderPanel();
    render(<LegislaturePanel legislature={makeLegislature()} clock={CLOCK} busy={false} onAction={onAction} />);
    const select = screen.getByLabelText("Legislation") as HTMLSelectElement;
    expect(screen.getByText("Workplace rules.")).toBeInTheDocument();
    await user.selectOptions(select, "cat-b");
    expect(screen.getByText("Rail funding.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "cat-b" });
  });

  it("disables Sponsor bill when busy, sponsor unavailable, or nothing valid to sponsor", async () => {
    const LegislaturePanel = await renderPanel();
    const { rerender } = render(
      <LegislaturePanel legislature={makeLegislature()} clock={CLOCK} busy={true} onAction={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /sponsor bill/i })).toBeDisabled();
    rerender(
      <LegislaturePanel
        legislature={makeLegislature({
          sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: false, disabledReason: "Need a seat" },
        })}
        clock={CLOCK} busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /sponsor bill/i })).toBeDisabled();
    expect(screen.getAllByText(/need a seat/i).length).toBeGreaterThan(0);
    rerender(<LegislaturePanel legislature={makeLegislature({ proposals: [] })} clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /sponsor bill/i })).toBeDisabled();
  });

  it("shows bill status, chamber, sponsor, tallies and recorded vote; votes dispatch voteOnBill", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislaturePanel = await renderPanel();
    render(
      <LegislaturePanel
        legislature={makeLegislature({
          bills: [
            {
              id: "b1", title: "Wage Bill", status: "active", chamber: "house", sponsorName: "Ada",
              votesFor: 12, votesAgainst: 7, votesAbstain: 3,
              playerVote: "for",
              voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 1, available: true },
            },
          ],
        })}
        clock={CLOCK} busy={false}
        onAction={onAction}
      />,
    );
    const card = screen.getByRole("article", { name: "Wage Bill" });
    expect(within(card).getByText(/active/i)).toBeInTheDocument();
    expect(within(card).getByText(/house/i)).toBeInTheDocument();
    expect(within(card).getByText(/ada/i)).toBeInTheDocument();
    expect(within(card).getByText(/12.*for|for.*12/i)).toBeInTheDocument();
    expect(within(card).getByText(/7.*against|against.*7/i)).toBeInTheDocument();
    expect(within(card).getByText(/3.*abstain|abstain.*3/i)).toBeInTheDocument();
    expect(within(card).getByText(/your vote: for/i)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: /against on wage bill/i }));
    expect(onAction).toHaveBeenCalledWith("voteOnBill", { billId: "b1", vote: "against" });
  });

  it("gates vote buttons on voting availability and busy, showing the reason", async () => {
    const onAction = vi.fn();
    const LegislaturePanel = await renderPanel();
    const { rerender } = render(
      <LegislaturePanel
        legislature={makeLegislature({
          bills: [
            {
              id: "b1", title: "Wage Bill", status: "active", chamber: "senate", sponsorName: "Bob",
              votesFor: 1, votesAgainst: 2, votesAbstain: 0,
              playerVote: null,
              voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 0, available: false, disabledReason: "This bill is in another chamber." },
            },
          ],
        })}
        clock={CLOCK} busy={false}
        onAction={onAction}
      />,
    );
    const card = screen.getByRole("article", { name: "Wage Bill" });
    expect(within(card).getByRole("button", { name: /for on wage bill/i })).toBeDisabled();
    expect(within(card).getAllByText(/another chamber/i).length).toBeGreaterThan(0);
    rerender(
      <LegislaturePanel legislature={makeLegislature()} clock={CLOCK} busy={true} onAction={onAction} />,
    );
    expect(screen.getByRole("article", { name: "Wage Bill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /for on wage bill/i })).toBeDisabled();
    const signed = makeLegislature();
    signed.bills[0].status = "signed";
    signed.bills[0].playerVote = "for";
    rerender(<LegislaturePanel legislature={signed} clock={CLOCK} busy={false} onAction={onAction} />);
    expect(screen.queryByRole("button", { name: /for on wage bill/i })).not.toBeInTheDocument();
    expect(screen.getByText("Your vote: for")).toBeInTheDocument();
  });

  it("paginates bills 20 per page with clamping", async () => {
    const user = userEvent.setup();
    const LegislaturePanel = await renderPanel();
    const bills = Array.from({ length: 25 }, (_, i) => ({
      id: `b${i}`, title: `Bill ${i}`, status: "active", chamber: "house", sponsorName: "Ada",
      votesFor: 1, votesAgainst: 0, votesAbstain: 0,
      playerVote: null as null,
      voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 0, available: true },
    }));
    render(<LegislaturePanel legislature={makeLegislature({ bills })} clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByRole("article", { name: "Bill 0" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Bill 24" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("article", { name: "Bill 24" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Bill 0" })).not.toBeInTheDocument();
  });

  const houseChamber = {
    key: "house", name: "House of Representatives", shortName: "House", seats: 435, elected: true,
    description: "435 representatives, two-year terms.", activeCount: 1, completedCount: 0,
  };
  const senateChamber = {
    key: "senate", name: "Senate", shortName: "Senate", seats: 100, elected: true,
    description: null, activeCount: 0, completedCount: 0,
  };
  const chamberBill = (id: string, title: string, chamberKey: string, chamber: string) => ({
    id, title, status: "active", chamber, chamberKey, sponsorName: "Ada",
    votesFor: 1, votesAgainst: 0, votesAbstain: 0, playerVote: null as null,
    voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 0, available: true },
  });

  it("renders chamber destinations from config and filters bills to the selection", async () => {
    const user = userEvent.setup();
    const LegislaturePanel = await renderPanel();
    render(<LegislaturePanel
      legislature={makeLegislature({
        countryId: "US",
        chambers: [houseChamber, senateChamber],
        bills: [chamberBill("h1", "House Bill", "house", "House of Representatives"), chamberBill("s1", "Senate Bill", "senate", "Senate")],
      })}
      clock={CLOCK} busy={false}
      onAction={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "Show House of Representatives bills" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "House Bill" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Senate Bill" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Senate bills" }));
    expect(screen.getByRole("article", { name: "Senate Bill" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "House Bill" })).not.toBeInTheDocument();
    expect(screen.getByText(/100 seats/)).toBeInTheDocument();
  });

  it("shows chamber committees with their queues and the floor schedule", async () => {
    const LegislaturePanel = await renderPanel();
    render(<LegislaturePanel
      legislature={makeLegislature({
        countryId: "US",
        chambers: [houseChamber],
        committees: [{
          id: "com-US-house-finance", name: "House of Representatives Finance", chamberKey: "house",
          chamberName: "House of Representatives", jurisdiction: ["economy", "infrastructure"],
          chairName: "Ada", memberCount: 217, activeBillIds: ["b1"],
        }],
        schedule: [{
          billId: "b1", title: "Wage Bill", chamberKey: "house", chamberName: "House of Representatives",
          status: "active", statusLabel: "Voting Open", nextAction: "Origin-chamber vote closes", dueTurn: 12, overdue: false,
        }],
      })}
      clock={CLOCK} busy={false}
      onAction={vi.fn()}
    />);
    expect(screen.getByLabelText("Committee House of Representatives Finance")).toBeInTheDocument();
    expect(screen.getByText(/Queue: Wage Bill/)).toBeInTheDocument();
    expect(screen.getByText("Floor schedule")).toBeInTheDocument();
    expect(screen.getByText(/Origin-chamber vote closes \(April, Week 1, 1953\)/)).toBeInTheDocument();
  });

  it("sponsors a bill in the selected chamber", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislaturePanel = await renderPanel();
    render(<LegislaturePanel
      legislature={makeLegislature({ countryId: "US", chambers: [houseChamber, senateChamber] })}
      clock={CLOCK} busy={false}
      onAction={onAction}
    />);
    await user.click(screen.getByRole("button", { name: "Show Senate bills" }));
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "cat-a", originChamber: "senate" });
  });

  it("lets the bills pager wrap at 320px without losing pager semantics", async () => {
    const user = userEvent.setup();
    const LegislaturePanel = await renderPanel();
    const bills = Array.from({ length: 25 }, (_, i) => ({
      id: `b${i}`, title: `Bill ${i}`, status: "active", chamber: "house", sponsorName: "Ada",
      votesFor: 1, votesAgainst: 0, votesAbstain: 0,
      playerVote: null as null,
      voting: { id: "voteOnBill", name: "Vote", description: "Vote", cost: 0, available: true },
    }));
    render(<LegislaturePanel legislature={makeLegislature({ bills })} clock={CLOCK} busy={false} onAction={vi.fn()} />);
    const prev = screen.getByRole("button", { name: /previous page/i });
    const next = screen.getByRole("button", { name: /next page/i });
    const pager = prev.closest(".ahd-bills-pager");
    expect(pager).not.toBeNull();
    // Row wraps instead of clipping long or localized labels at 320px.
    expect(pager!).toHaveStyle({ flexWrap: "wrap" });
    // Full labels stay readable: no icon-only fallback with missing names.
    expect(prev).toHaveAccessibleName("Previous page");
    expect(next).toHaveAccessibleName("Next page");
    expect(prev.textContent).toMatch(/previous/i);
    expect(next.textContent).toMatch(/next/i);
    // Paging semantics preserved across the fix.
    await user.click(next);
    expect(screen.getByRole("article", { name: "Bill 24" })).toBeInTheDocument();
    await user.click(prev);
    expect(screen.getByRole("article", { name: "Bill 0" })).toBeInTheDocument();
    // Explicit timeout: the file's dynamic import plus first render can
    // exceed the 5s default on loaded hosts (transform cost, not behavior).
  }, 20000);

  it("restores the persisted chamber context across a reload", async () => {
    window.localStorage.setItem(LEGISLATURE_NAV_STORAGE_KEY, JSON.stringify({ US: { chamberKey: "senate", billId: null } }));
    const LegislaturePanel = await renderPanel();
    render(<LegislaturePanel
      legislature={makeLegislature({
        countryId: "US",
        chambers: [houseChamber, senateChamber],
        bills: [chamberBill("h1", "House Bill", "house", "House of Representatives"), chamberBill("s1", "Senate Bill", "senate", "Senate")],
      })}
      clock={CLOCK} busy={false}
      onAction={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "Show Senate bills" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("article", { name: "Senate Bill" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "House Bill" })).not.toBeInTheDocument();
  });
});
