import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    scotusSponsor: { available: false, disabledReason: "Only the President of this country can propose Supreme Court nominations", seats: [], nominees: [] },
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
      expect(screen.getByText(/only the president of this country can propose cabinet nominations/i)).toBeInTheDocument();
      expect(screen.getByText(/only the president of this country can propose supreme court nominations/i)).toBeInTheDocument();
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

  it("sponsors a SCOTUS nomination from a vacant seat through the session command", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const legislature = makeLegislature();
    legislature.scotusSponsor = {
      available: true,
      seats: [{ seatNumber: 1, vacant: true, hasActiveNomination: false, available: true }],
      nominees: [{ id: "nom-1", name: "June Nominee" }],
    };
    render(<NominationsPanel legislature={legislature} busy={false} onAction={onAction} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /supreme court seat/i }), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: /justice nominee/i }), "nom-1");
    await user.click(screen.getByRole("button", { name: /sponsor justice nomination/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: 1,
      nomineeId: "nom-1",
    });
    for (const control of [
      screen.getByRole("combobox", { name: /supreme court seat/i }),
      screen.getByRole("combobox", { name: /justice nominee/i }),
      screen.getByRole("button", { name: /sponsor justice nomination/i }),
    ]) {
      expect(control.style.minHeight).toBe("44px");
    }
  });

  it("shows the exact SCOTUS refusal reason when sponsorship is unavailable", () => {
    const onAction = vi.fn();
    const legislature = makeLegislature();
    legislature.scotusSponsor = {
      available: false,
      disabledReason: "Only the President of this country can propose Supreme Court nominations",
      seats: [],
      nominees: [],
    };
    render(<NominationsPanel legislature={legislature} busy={false} onAction={onAction} />);
    expect(screen.getByText(/only the president of this country can propose supreme court nominations/i))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sponsor justice nomination/i })).not.toBeInTheDocument();
  });

  it("shows the exact seat-level refusal when an occupied seat is chosen", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const legislature = makeLegislature();
    legislature.scotusSponsor = {
      available: true,
      seats: [
        { seatNumber: 1, vacant: false, hasActiveNomination: false, available: false },
        { seatNumber: 2, vacant: true, hasActiveNomination: false, available: true },
      ],
      nominees: [{ id: "nom-1", name: "June Nominee" }],
    };
    render(<NominationsPanel legislature={legislature} busy={false} onAction={onAction} />);
    const seatCombo = screen.getByRole("combobox", { name: /supreme court seat/i });
    expect(screen.getByRole("option", { name: "Seat #1 (unavailable)" })).toBeDisabled();
    await user.selectOptions(seatCombo, "1");
    await user.selectOptions(screen.getByRole("combobox", { name: /justice nominee/i }), "nom-1");
    expect(seatCombo).toHaveValue("");
    expect(screen.getByText("Choose a seat and a nominee.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sponsor justice nomination/i })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows the exact seat-level refusal when a seat with an active nomination is chosen", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const legislature = makeLegislature();
    legislature.scotusSponsor = {
      available: true,
      seats: [
        { seatNumber: 1, vacant: true, hasActiveNomination: true, available: false },
        { seatNumber: 2, vacant: true, hasActiveNomination: false, available: true },
      ],
      nominees: [{ id: "nom-1", name: "June Nominee" }],
    };
    render(<NominationsPanel legislature={legislature} busy={false} onAction={onAction} />);
    const seatCombo = screen.getByRole("combobox", { name: /supreme court seat/i });
    expect(screen.getByRole("option", { name: "Seat #1 (unavailable)" })).toBeDisabled();
    await user.selectOptions(seatCombo, "1");
    await user.selectOptions(screen.getByRole("combobox", { name: /justice nominee/i }), "nom-1");
    expect(seatCombo).toHaveValue("");
    expect(screen.getByText("Choose a seat and a nominee.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sponsor justice nomination/i })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("links a SCOTUS nomination to its seat, Senate window, and ballot", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const legislature = makeLegislature();
    legislature.nominations = [
      {
        id: "sco-1", kind: "scotus", countryId: "US", chamber: "senate", chamberLabel: "Senate",
        office: "Supreme Court Seat #2", seatNumber: 2,
        nominee: "June Nominee", nomineeParty: null, sponsor: "player",
        status: "active", statusLabel: "Vote Open", proposedAtTurn: 0, votingEndsOnTurn: 24,
        resolvedAtTurn: null, tally: { for: 1, against: 0, abstain: 0 },
        playerVote: null, voting: { available: true },
      },
    ];
    render(<NominationsPanel legislature={legislature} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /supreme court seat #2: june nominee/i }));
    expect(screen.getByText("Supreme Court Seat #2")).toBeInTheDocument();
    expect(screen.getByText(/senate/i)).toBeInTheDocument();
    expect(screen.getByText(/vote closes turn 24/i)).toBeInTheDocument();
    expect(screen.getByText(/1 for · 0 against · 0 abstain/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /for on june nominee/i }));
    expect(onAction).toHaveBeenCalledWith("voteScotusNomination", { nominationId: "sco-1", vote: "for" });
  });
});
