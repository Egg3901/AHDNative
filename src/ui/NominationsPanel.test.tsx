import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld, serializeSave } from "@ahdclient/engine";
import { GameSession } from "../game/session";
import type { LegislatureView } from "../game/types";
import { NominationsPanel } from "./NominationsPanel";

const SAVED_AT = "2026-09-15T00:00:00.000Z";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

describe("NominationsPanel live session flow (#272/#273)", () => {
  function liveSession() {
    const world = createWorld({ era: "1953", countryId: "US", seed: "nom-ui-1", playerName: "President", mode: "hos" });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    const sponsored = session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    });
    expect(sponsored.ok).toBe(true);
    return { session, nominationId: session.view().legislature.nominations![0]!.id, nomineeName: nominee.name };
  }

  it("renders the sponsored detail, casts a ballot through the session, and keeps it across save/reload and a turn at 320/390/desktop widths", async () => {
    const user = userEvent.setup();
    const { session, nominationId, nomineeName } = liveSession();
    const onAction = vi.fn((id: string, params?: Record<string, string | number>) => {
      session.act(id, params as never);
    });

    const rowName = new RegExp(`secretary of state: ${escapeRegExp(nomineeName)}`, "i");
    const ballotName = new RegExp(`for on ${escapeRegExp(nomineeName)}`, "i");
    for (const width of [320, 390, 1280]) {
      const { unmount } = render(
        <div style={{ width }}>
          <NominationsPanel legislature={session.view().legislature} busy={false} onAction={onAction} />
        </div>,
      );
      await user.click(screen.getByRole("button", { name: rowName }));
      const detail = document.querySelector('[data-pane="detail"]') as HTMLElement;
      expect(within(detail).getByText("Secretary of State")).toBeInTheDocument();
      expect(within(detail).getByText(/senate/i)).toBeInTheDocument();
      expect(within(detail).getByText(/vote closes turn/i)).toBeInTheDocument();
      expect(within(detail).getByText(/sponsored by/i)).toBeInTheDocument();
      expect(within(detail).getByText(new RegExp(escapeRegExp(nomineeName), "i"))).toBeInTheDocument();
      unmount();
    }

    const { rerender } = render(
      <NominationsPanel legislature={session.view().legislature} busy={false} onAction={onAction} />,
    );
    await user.click(screen.getByRole("button", { name: rowName }));
    await user.click(screen.getByRole("button", { name: ballotName }));
    expect(onAction).toHaveBeenCalledWith("voteCabinetNomination", { nominationId, vote: "for" });
    rerender(<NominationsPanel legislature={session.view().legislature} busy={false} onAction={onAction} />);
    expect(screen.getByText(/your vote: for/i)).toBeInTheDocument();

    // Save/reload keeps the rendered ballot; one turn boundary keeps the
    // nomination pending with the vote intact.
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    rerender(<NominationsPanel legislature={reloaded.view().legislature} busy={false} onAction={onAction} />);
    expect(screen.getByText(/your vote: for/i)).toBeInTheDocument();
    reloaded.advance();
    rerender(<NominationsPanel legislature={reloaded.view().legislature} busy={false} onAction={onAction} />);
    expect(screen.getAllByText(/vote open/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/your vote: for/i)).toBeInTheDocument();
  }, 120000);

  it("shows empty, ineligible-ballot, and resolved states", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    const empty = makeLegislature();
    empty.nominations = [];
    const { unmount } = render(<NominationsPanel legislature={empty} busy={false} onAction={onAction} />);
    expect(screen.getByText("No nominations before the legislature.")).toBeInTheDocument();
    unmount();

    const gated = makeLegislature();
    const gatedNomination = gated.nominations?.[0];
    expect(gatedNomination).toBeDefined();
    gated.nominations = [{
      ...gatedNomination!,
      voting: { available: false, disabledReason: "Only Senators can vote on cabinet nominations" },
    }];
    const { unmount: unmountGated } = render(
      <NominationsPanel legislature={gated} busy={false} onAction={onAction} />,
    );
    await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee/i }));
    expect(screen.getByText("Only Senators can vote on cabinet nominations")).toBeInTheDocument();
    for (const control of screen.getAllByRole("button", { name: /for on ada nominee|against on ada nominee|abstain on ada nominee/i })) {
      expect(control).toBeDisabled();
    }
    expect(onAction).not.toHaveBeenCalled();
    unmountGated();

    const resolved = makeLegislature();
    const resolvedNomination = resolved.nominations?.[0];
    expect(resolvedNomination).toBeDefined();
    resolved.nominations = [{
      ...resolvedNomination!,
      status: "confirmed",
      statusLabel: "Confirmed",
      resolvedAtTurn: 24,
      playerVote: "for",
      voting: { available: false, disabledReason: "Nomination not found or voting closed" },
    }];
    const { unmount: unmountResolved } = render(
      <NominationsPanel legislature={resolved} busy={false} onAction={onAction} />,
    );
    expect(screen.getByRole("button", { name: /secretary of state: ada nominee, confirmed/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /secretary of state: ada nominee, confirmed/i }));
    expect(screen.getByText(/your vote: for/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /for on ada nominee/i })).not.toBeInTheDocument();
    unmountResolved();
  });
});
