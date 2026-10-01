import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GameSession } from "../game/session";
import { RegionsPanel } from "./RegionsPanel";

describe("regional ministerial result (#263)", () => {
  it("shows the source regional unemployment result before and after the order and normal reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "regional-orders-visible-263", playerName: "Alex" });
    session.allocateStats({ charisma: 1, debate: 1, energy: 1, fundraising: 1, businessAcumen: 4, statecraft: 10, intellect: 10 });
    // Controlled held-office eligibility isolates the public order contract.
    // It does not claim an earned cabinet appointment.
    const saved = JSON.parse(session.serialize("2026-10-01T00:00:00.000Z"));
    saved.world.cabinetMembers.push({
      countryId: "UK", positionId: "defence_secretary", characterId: "player",
      characterName: "Alex", partyId: "UK_CON", appointedBy: null,
      appointedAtTurn: 0, confirmedAtTurn: 0, ministerialActions: 4,
      lastMinisterialActionRefillTurn: 0,
    });
    session.load(JSON.stringify(saved));
    const props = { onQueryChange: vi.fn(), directoryOpen: false, onDirectoryOpenChange: vi.fn() };
    const view = render(<RegionsPanel {...props} query={session.regions({ regionId: "LON" })} />);
    const card = () => screen.getByRole("heading", { name: "Economic indicators" }).closest("section")!;
    expect(within(card()).getByText("Unemployment Rate")).toBeInTheDocument();
    expect(within(card()).getByText("4.5%")).toBeInTheDocument();

    expect(session.issueCabinetOrder({ positionId: "defence_secretary", orderId: "veterans_support_programme", targetRegionId: "LON" }).result.ok).toBe(true);
    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    view.rerender(<RegionsPanel {...props} query={resumed.regions({ regionId: "LON" })} />);
    // Actual source StateMetrics 4.441, formatted at the source's one decimal.
    expect(within(card()).getByText("4.4%")).toBeInTheDocument();
    expect(within(card()).queryByText("4.5%")).not.toBeInTheDocument();
    view.rerender(<RegionsPanel {...props} query={resumed.regions({ regionId: "SCO" })} />);
    expect(within(card()).getByText("3.8%")).toBeInTheDocument();
  }, 120_000);
});
