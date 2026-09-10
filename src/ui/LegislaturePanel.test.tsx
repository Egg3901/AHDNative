import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegislatureView } from "../game/types";

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
      <LegislaturePanel legislature={makeLegislature()} busy={false} onAction={vi.fn()} />,
    );
    expect(screen.getByText("Representative")).toBeInTheDocument();
    rerender(<LegislaturePanel legislature={makeLegislature({ office: null })} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("No legislative seat")).toBeInTheDocument();
  });

  it("sponsors the selected proposal via Legislation select with description", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislaturePanel = await renderPanel();
    render(<LegislaturePanel legislature={makeLegislature()} busy={false} onAction={onAction} />);
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
      <LegislaturePanel legislature={makeLegislature()} busy={true} onAction={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /sponsor bill/i })).toBeDisabled();
    rerender(
      <LegislaturePanel
        legislature={makeLegislature({
          sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "Sponsor", cost: 2, available: false, disabledReason: "Need a seat" },
        })}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /sponsor bill/i })).toBeDisabled();
    expect(screen.getAllByText(/need a seat/i).length).toBeGreaterThan(0);
    rerender(<LegislaturePanel legislature={makeLegislature({ proposals: [] })} busy={false} onAction={vi.fn()} />);
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
        busy={false}
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
        busy={false}
        onAction={onAction}
      />,
    );
    const card = screen.getByRole("article", { name: "Wage Bill" });
    expect(within(card).getByRole("button", { name: /for on wage bill/i })).toBeDisabled();
    expect(within(card).getAllByText(/another chamber/i).length).toBeGreaterThan(0);
    rerender(
      <LegislaturePanel legislature={makeLegislature()} busy={true} onAction={onAction} />,
    );
    expect(screen.getByRole("article", { name: "Wage Bill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /for on wage bill/i })).toBeDisabled();
    const signed = makeLegislature();
    signed.bills[0].status = "signed";
    signed.bills[0].playerVote = "for";
    rerender(<LegislaturePanel legislature={signed} busy={false} onAction={onAction} />);
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
    render(<LegislaturePanel legislature={makeLegislature({ bills })} busy={false} onAction={vi.fn()} />);
    expect(screen.getByRole("article", { name: "Bill 0" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Bill 24" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("article", { name: "Bill 24" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Bill 0" })).not.toBeInTheDocument();
  });
});
