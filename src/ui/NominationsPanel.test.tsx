import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegislatureView } from "../game/types";
import { NominationsPanel } from "./NominationsPanel";

function makeLegislature(): LegislatureView {
  return {
    office: "Senate · United States",
    countryId: "US",
    proposals: [],
    sponsor: { id: "sponsorBill", name: "Sponsor bill", description: "", cost: 0, available: false },
    bills: [],
    nominations: [
      {
        id: "cab-1", kind: "cabinet", countryId: "US", chamber: "senate", chamberLabel: "Senate",
        office: "Secretary of State", positionId: "secretary_of_state",
        nominee: "Ada Nominee", nomineeParty: "US_DEM", sponsor: "President",
        status: "active", statusLabel: "Vote Open", proposedAtTurn: 0, votingEndsOnTurn: 24,
        resolvedAtTurn: null, tally: { for: 3, against: 1, abstain: 0 },
        playerVote: null, voting: { available: true },
      },
    ],
    cabinetSponsor: { available: false, disabledReason: "Only the President of this country can propose cabinet nominations", positions: [], nominees: [] },
    scotusSponsor: { available: false, disabledReason: "Supreme Court nominations are unavailable until vacancy and sponsorship rules land (#270)." },
  };
}

describe("NominationsPanel", () => {
  it("shows status, nominee, office, vote bar, player vote, and refusal reasons at 320/390/desktop widths", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    for (const width of [320, 390, 1280]) {
      const { unmount } = render(
        <div style={{ width }}>
          <NominationsPanel legislature={makeLegislature()} busy={false} onAction={onAction} />
        </div>,
      );
      expect(screen.getByText("Nominations")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee/i }));
      expect(screen.getAllByText(/vote open/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/3 for · 1 against · 0 abstain/)).toBeInTheDocument();
      expect(screen.getByText(/not yet voted/i)).toBeInTheDocument();
      expect(screen.getByText(/only the president of this country/i)).toBeInTheDocument();
      expect(screen.getByText(/#270/)).toBeInTheDocument();
      for (const control of screen.getAllByRole("button", { name: /for on ada nominee|against on ada nominee|abstain on ada nominee/i })) {
        expect(control.style.minHeight).toBe("44px");
      }
      unmount();
    }
  });

  it("casts a cabinet ballot through the session command", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<NominationsPanel legislature={makeLegislature()} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee/i }));
    await user.click(screen.getByRole("button", { name: /for on ada nominee/i }));
    expect(onAction).toHaveBeenCalledWith("voteCabinetNomination", { nominationId: "cab-1", vote: "for" });
  });
});

describe("NominationsPanel dual-pane list/detail (#438)", () => {
  it("pairs the nomination list with the selected detail sharing one selection", async () => {
    const user = userEvent.setup();
    render(<NominationsPanel legislature={makeLegislature()} busy={false} onAction={vi.fn()} />);
    const list = document.querySelector('[data-pane="list"]');
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getByRole("button", { name: /secretary of state: ada nominee/i })).toBeInTheDocument();
    expect(document.querySelector('[data-pane="detail"]')).toBeNull();
    // One selection drives both panes: expanding keeps the list mounted and
    // lands the detail beside it.
    await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee/i }));
    const detail = document.querySelector('[data-pane="detail"]');
    expect(detail).not.toBeNull();
    expect(within(detail as HTMLElement).getByText(/3 for · 1 against · 0 abstain/)).toBeInTheDocument();
    expect(document.querySelector('[data-pane="list"]')).not.toBeNull();
  });

  it("keeps the single-pane stacked toggle journey with unchanged ballot semantics", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<NominationsPanel legislature={makeLegislature()} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee/i }));
    const list = document.querySelector('[data-pane="list"]') as HTMLElement;
    const detail = document.querySelector('[data-pane="detail"]') as HTMLElement;
    // Single-pane stacks the detail below the list in the same order as before.
    expect(list.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Toggling the row off returns to the list-only stack, exactly as before.
    await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee/i }));
    expect(document.querySelector('[data-pane="detail"]')).toBeNull();
    expect(screen.getByRole("button", { name: /secretary of state: ada nominee/i })).toBeInTheDocument();
    // Re-selecting restores the detail and ballots still route unchanged.
    await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee/i }));
    await user.click(screen.getByRole("button", { name: /against on ada nominee/i }));
    expect(onAction).toHaveBeenCalledWith("voteCabinetNomination", { nominationId: "cab-1", vote: "against" });
  });
});
