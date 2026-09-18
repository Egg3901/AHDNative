import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld, ensureScotusSeats, serializeSave } from "@ahdclient/engine";
import { GameSession } from "../game/session";
import type { NominationView } from "../game/nominations";
import { NominationsPanel } from "./NominationsPanel";

const SAVED_AT = "2026-09-15T00:00:00.000Z";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Live session with one pending cabinet, one VP, and one SCOTUS nomination. */
function unifiedSession() {
  const world = createWorld({ era: "1953", countryId: "US", seed: "nom-271-ui", playerName: "President", mode: "hos" });
  world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
  ensureScotusSeats(world);
  const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
  Object.assign(seat, {
    justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
    economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
  });
  const politicians = world.politicians.filter((p) => p.countryId === "US");
  const session = new GameSession();
  session.load(serializeSave(world, SAVED_AT));
  expect(session.act("sponsorCabinetNomination", {
    countryId: "US", positionId: "secretary_of_state", nomineeId: politicians[0]!.id,
  }).ok).toBe(true);
  expect(session.act("sponsorCabinetNomination", {
    countryId: "US", positionId: "vicePresident", nomineeId: politicians[1]!.id,
  }).ok).toBe(true);
  expect(session.act("sponsorScotusNomination", {
    countryId: "US", seatNumber: seat.seatNumber, nomineeId: politicians[2]!.id,
  }).ok).toBe(true);
  return { session, names: politicians.slice(0, 3).map((p) => p.name), seatNumber: seat.seatNumber };
}

describe("Nomination list/detail unified projection (#271)", () => {
  it("renders the pending cabinet, VP, and SCOTUS entries with chamber, sponsor, and deadline at 320/390 widths", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { session, names, seatNumber } = unifiedSession();
    const legislature = session.view().legislature;
    expect(legislature.nominations).toHaveLength(3);

    for (const width of [320, 390]) {
      const { unmount } = render(
        <div style={{ width }}>
          <NominationsPanel legislature={legislature} busy={false} onAction={onAction} />
        </div>,
      );
      expect(screen.getByText("Nominations")).toBeInTheDocument();
      // Every projected entry is reachable in the list.
      for (const name of names) {
        expect(screen.getByRole("button", { name: new RegExp(escapeRegExp(name), "i") })).toBeInTheDocument();
      }

      // VP detail exposes both chambers with House totals.
      await user.click(screen.getByRole("button", { name: new RegExp(`vice president[\\s\\S]*${escapeRegExp(names[1]!)}`, "i") }));
      const detail = document.querySelector('[data-pane="detail"]') as HTMLElement;
      expect(within(detail).getByText(/house and senate/i)).toBeInTheDocument();
      expect(within(detail).getByText(/house: \d+ for/i)).toBeInTheDocument();
      expect(within(detail).getByText(/sponsored by president/i)).toBeInTheDocument();
      expect(within(detail).getByText(/vote closes turn/i)).toBeInTheDocument();
      // Toggling back off restores the list-only stack.
      await user.click(screen.getByRole("button", { name: new RegExp(`vice president[\\s\\S]*${escapeRegExp(names[1]!)}`, "i") }));
      expect(document.querySelector('[data-pane="detail"]')).toBeNull();

      // SCOTUS detail names the seat, the Senate chamber, and the president sponsor.
      await user.click(screen.getByRole("button", { name: new RegExp(`supreme court seat #${seatNumber}[\\s\\S]*${escapeRegExp(names[2]!)}`, "i") }));
      const scotusDetail = document.querySelector('[data-pane="detail"]') as HTMLElement;
      expect(within(scotusDetail).getByText(`Supreme Court Seat #${seatNumber}`)).toBeInTheDocument();
      expect(within(scotusDetail).getByText(/sponsored by president/i)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the nominee party name in the selected detail at 390px and omits it when unknown", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { session, names } = unifiedSession();
    const probe = createWorld({ era: "1953", countryId: "US", seed: "nom-271-ui", playerName: "President", mode: "hos" });
    const nominee = probe.politicians.find((p) => p.name === names[0])!;
    const partyName = probe.parties[nominee.partyId]?.name ?? nominee.partyId;

    const { unmount } = render(
      <div style={{ width: 390 }}>
        <NominationsPanel legislature={session.view().legislature} busy={false} onAction={onAction} />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: new RegExp(escapeRegExp(names[0]!), "i") }));
    const detail = document.querySelector('[data-pane="detail"]') as HTMLElement;
    expect(within(detail).getByText(new RegExp(escapeRegExp(partyName), "i"))).toBeInTheDocument();
    unmount();

    // A null party name renders no party fragment in the same detail slot.
    const legislature = session.view().legislature;
    const nulled = {
      ...legislature,
      nominations: legislature.nominations!.map((entry) => ({ ...entry, nomineeParty: null, nomineePartyName: null })),
    };
    render(<NominationsPanel legislature={nulled} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: new RegExp(escapeRegExp(names[0]!), "i") }));
    const nullDetail = document.querySelector('[data-pane="detail"]') as HTMLElement;
    expect(within(nullDetail).queryByText(new RegExp(escapeRegExp(partyName), "i"))).toBeNull();
  });

  it("renders an honest empty state when no nominations are projected", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "nom-271-empty", playerName: "Alex", mode: "hos" });
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.view().legislature.nominations).toEqual([]);
    render(<NominationsPanel legislature={session.view().legislature} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("No nominations before the legislature.")).toBeInTheDocument();
    expect(document.querySelector('[data-pane="detail"]')).toBeNull();
  });

  it("keeps the rendered VP ballot across save/reload", async () => {
    const user = userEvent.setup();
    const { session, names } = unifiedSession();
    const vp = session.view().legislature.nominations!.find((entry) => entry.positionId === "vicePresident")!;
    const onAction = vi.fn(() => {
      session.act("voteCabinetNomination", { nominationId: vp.id, vote: "for" });
    });
    const { rerender } = render(
      <NominationsPanel legislature={session.view().legislature} busy={false} onAction={onAction} />,
    );
    await user.click(screen.getByRole("button", { name: new RegExp(escapeRegExp(names[1]!), "i") }));
    await user.click(screen.getByRole("button", { name: new RegExp(`for on ${escapeRegExp(names[1]!)}`, "i") }));
    rerender(<NominationsPanel legislature={session.view().legislature} busy={false} onAction={onAction} />);
    expect(screen.getByText(/your vote: for/i)).toBeInTheDocument();

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    rerender(<NominationsPanel legislature={reloaded.view().legislature} busy={false} onAction={onAction} />);
    expect(screen.getByText(/your vote: for/i)).toBeInTheDocument();
  });

  it("recovers to the list when the selected nomination leaves the projection", async () => {
    // Fixture-built legislature: avoids the session commit path so this
    // recovery check stays independent of unrelated projection breakage.
    const user = userEvent.setup();
    const onAction = vi.fn();
    const entry = (id: string, nominee: string): NominationView => ({
      id,
      kind: "cabinet",
      countryId: "US",
      chamber: "senate",
      chamberLabel: "Senate",
      office: "Secretary of State",
      positionId: "secretary_of_state",
      nominee,
      nomineeParty: "US_REP",
      nomineePartyName: "Republican",
      sponsor: "President",
      status: "active",
      statusLabel: "Vote Open",
      proposedAtTurn: 1,
      votingEndsOnTurn: 25,
      resolvedAtTurn: null,
      tally: { for: 1, against: 0, abstain: 0 },
      playerVote: null,
      voting: { available: true },
    });
    const legislature = {
      office: null,
      countryId: "US",
      proposals: [],
      sponsor: { id: "sponsorBill", name: "Sponsor", description: "", cost: 0, available: false },
      bills: [],
      nominations: [entry("nom-a", "Alice Example"), entry("nom-b", "Bob Example")],
    };
    const { rerender } = render(
      <NominationsPanel legislature={legislature} busy={false} onAction={onAction} />,
    );
    await user.click(screen.getByRole("button", { name: /alice example/i }));
    expect(document.querySelector('[data-pane="detail"]')).not.toBeNull();

    // The selection goes stale (turn resolution withdrew it): no stale detail,
    // and the remaining list stays usable.
    const withoutSelected = {
      ...legislature,
      nominations: legislature.nominations.filter((candidate) => candidate.id !== "nom-a"),
    };
    rerender(<NominationsPanel legislature={withoutSelected} busy={false} onAction={onAction} />);
    expect(document.querySelector('[data-pane="detail"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: /bob example/i }));
    expect(document.querySelector('[data-pane="detail"]')).not.toBeNull();

    // An emptied projection recovers to the honest empty state.
    rerender(<NominationsPanel legislature={{ ...legislature, nominations: [] }} busy={false} onAction={onAction} />);
    expect(document.querySelector('[data-pane="detail"]')).toBeNull();
    expect(screen.getByText("No nominations before the legislature.")).toBeInTheDocument();
  });
});
