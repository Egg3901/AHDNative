import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { PoliticsPanel } from "./PoliticsPanel";

describe("source political metric destination (#263)", () => {
  it("opens the source category and metric then shows the saved regional order consequence", async () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "cabinet-political-263", playerName: "Alex" });
    session.allocateStats({ charisma: 1, debate: 1, energy: 1, fundraising: 1, businessAcumen: 4, statecraft: 10, intellect: 10 });
    const saved = JSON.parse(session.serialize("2026-10-01T00:00:00.000Z"));
    // The recorded minister isolates the existing order flow. Appointment
    // eligibility remains separately audited; this does not grant an office.
    saved.world.cabinetMembers.push({ countryId: "UK", positionId: "defence_secretary", characterId: "player", characterName: "Alex", partyId: "UK_CON", appointedBy: null, appointedAtTurn: 0, confirmedAtTurn: 0, ministerialActions: 4, lastMinisterialActionRefillTurn: 0 });
    session.load(JSON.stringify(saved));
    expect(session.issueCabinetOrder({ positionId: "defence_secretary", orderId: "veterans_support_programme", targetRegionId: "LON" }).result.ok).toBe(true);
    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    resumed.advance();
    const user = userEvent.setup();
    render(<PoliticsPanel politics={resumed.politics()} nation={resumed.view().nation} section="metrics" clock={{ turn: 2, date: "2019-01-13" }} busy={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Economy & Labour" }));
    await user.click(screen.getByRole("button", { name: "Trade Union Strength and Worker Protections" }));
    expect(screen.getByRole("heading", { name: "Trade Union Strength and Worker Protections" })).toBeInTheDocument();
    const regions = screen.getByRole("table", { name: "Regional breakdown" });
    // Game political dynamics at 96831835, replayed with these two public
    // turns, yields 53.84 then 54.094044000000004. Its query serves one decimal.
    expect(within(regions).getByRole("row", { name: /London.*54\.1/ })).toBeInTheDocument();
    expect(screen.getByText("Ministerial orders")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Economy & Labour" }));
    expect(screen.getByRole("heading", { name: "Economy & Labour" })).toBeInTheDocument();
  }, 60_000);
});
