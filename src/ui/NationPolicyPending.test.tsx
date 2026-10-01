/**
 * Pending-directive Policy rendering (#65): the nation Policy surface lists
 * queued HoS fiscal directives with their directed targets and an honest
 * empty state, using the live session projection (no invented fixtures).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld, type WorldState } from "@ahdclient/engine";
import { projectNation } from "../game/nation";
import { GameSession } from "../game/session";
import { NationPanel } from "./NationPanel";
import { SubsidyLegislationControls } from "./NationPanel";

const CLOCK = { turn: 1, date: "1953-01-13" };

function worldOf(session: GameSession): WorldState {
  return (session as unknown as { requireWorld(): WorldState }).requireWorld();
}

function hosSession(): GameSession {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed: "policy-pending-ui", playerName: "Alex", mode: "hos" });
  return session;
}

describe("NationPanel pending directives (#65)", () => {
  it("lists the queued tax directive with its directed target", () => {
    const session = hosSession();
    const before = worldOf(session).budgets.US.taxRates.incomeTax;
    const target = Math.max(0, before - 5);
    expect(session.act("adjustTaxRate", { taxField: "incomeTax", taxRate: target }).ok).toBe(true);

    render(<NationPanel nation={projectNation(worldOf(session))} section="policy" clock={CLOCK} />);
    expect(screen.getByRole("heading", { name: "Pending directives" })).toBeInTheDocument();
    const card = screen.getByRole("article", { name: /pending income/i });
    expect(within(card).getByText("Pending")).toBeInTheDocument();
    expect(within(card).getByText(`${target.toFixed(1)}%`)).toBeInTheDocument();
    expect(within(card).getByText(/tax directive/i)).toBeInTheDocument();
  });

  it("lists the queued spending directive in absolute currency", () => {
    const session = hosSession();
    const defense = worldOf(session).budgets.US.spending.byCategory.defense ?? 0;
    expect(session.act("adjustBudgetSpending", { budgetCategory: "defense", budgetAmount: defense + 1_000_000 }).ok).toBe(true);

    render(<NationPanel nation={projectNation(worldOf(session))} section="policy" clock={CLOCK} />);
    const card = screen.getByRole("article", { name: /pending defense/i });
    expect(within(card).getByText(/\$[\d,]+/)).toBeInTheDocument();
    expect(within(card).getByText(/spending directive/i)).toBeInTheDocument();
  });

  it("shows the honest empty state with nothing queued and clears after enactment", () => {
    const session = hosSession();
    const { unmount } = render(<NationPanel nation={projectNation(worldOf(session))} section="policy" clock={CLOCK} />);
    expect(screen.getByText("No pending directives recorded.")).toBeInTheDocument();
    unmount();

    const defense = worldOf(session).budgets.US.spending.byCategory.defense ?? 0;
    expect(session.act("adjustBudgetSpending", { budgetCategory: "defense", budgetAmount: defense + 1_000_000 }).ok).toBe(true);
    session.advance();
    render(<NationPanel nation={projectNation(worldOf(session))} section="policy" clock={CLOCK} />);
    expect(screen.getByText("No pending directives recorded.")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });
});

describe("player economic controls (#94/#75)", () => {
  it("renders source-backed subsidy and Gosbank actions for a planned-economy HoS", async () => {
    const user = userEvent.setup();
    const session = new GameSession();
    session.create({ era: "1953", countryId: "RU", seed: "command-controls-ui", playerName: "Alex", mode: "hos" });
    const world = worldOf(session);
    const onAction = vi.fn();

    const { rerender } = render(<SubsidyLegislationControls nation={projectNation(world)} onAction={onAction} />);

    expect(screen.getByRole("heading", { level: 2, name: "National subsidies" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Command economy" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Subsidy scope"), "sector");
    const sector = screen.getByLabelText("Sector") as HTMLSelectElement;
    await user.selectOptions(sector, "energy");
    await user.type(screen.getByLabelText("Strategy filter (optional)"), "premium");
    await user.click(screen.getByRole("button", { name: "Propose subsidy bill" }));
    expect(onAction).toHaveBeenCalledWith("setSubsidyRate", {
      subsidyOp: "enact",
      subsidyScopeType: "sector",
      sectorType: "energy",
      targetStrategyId: "premium",
      domesticOnly: false,
    });

    rerender(<NationPanel nation={projectNation(world)} section="commandEconomy" clock={CLOCK} onAction={onAction} />);
    expect(screen.getByRole("heading", { name: "Command economy" })).toBeInTheDocument();
    expect(screen.getByText(/Marketization 10/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Credit aggressiveness"), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText("Budget softness"), { target: { value: "0.1" } });
    await user.click(screen.getByRole("button", { name: "Queue Gosbank directive" }));
    expect(onAction).toHaveBeenCalledWith("commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.1,
      budgetSoftness: 0.1,
      sectorCredit: {},
    });
  });

  it("keeps Gosbank controls out of market-country economies and gates career mode by bank-chair authority", () => {
    const us = createWorld({ era: "1953", countryId: "US", seed: "market-controls-ui", playerName: "Alex", mode: "hos" });
    const { rerender } = render(<SubsidyLegislationControls nation={projectNation(us)} onAction={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2, name: "National subsidies" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Command economy" })).not.toBeInTheDocument();

    const career = createWorld({ era: "1953", countryId: "RU", seed: "career-controls-ui", playerName: "Alex", mode: "career" });
    rerender(<SubsidyLegislationControls nation={projectNation(career)} onAction={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "National subsidies" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Command economy" })).not.toBeInTheDocument();

    career.cabinetMembers.push({
      countryId: "RU", positionId: "gosbank_liaison", characterId: "player", characterName: "Alex", partyId: null,
      appointedBy: null, appointedAtTurn: 0, confirmedAtTurn: 0,
    });
    rerender(<NationPanel nation={projectNation(career)} section="commandEconomy" clock={CLOCK} onAction={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Command economy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue Gosbank directive" })).toBeEnabled();
  });

  it("shows the resolved Gosbank posture when the live nation projection changes", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "RU", seed: "command-controls-resolved", playerName: "Alex", mode: "hos" });
    const { rerender } = render(<NationPanel nation={projectNation(worldOf(session))} section="commandEconomy" clock={CLOCK} onAction={(id, params) => { session.act(id, params); }} />);

    expect(session.act("commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.67,
      budgetSoftness: 0.23,
    }).ok).toBe(true);
    session.advance();
    rerender(<NationPanel nation={projectNation(worldOf(session))} section="commandEconomy" clock={CLOCK} onAction={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Credit aggressiveness")).toHaveValue("0.67");
      expect(screen.getByLabelText("Budget softness")).toHaveValue("0.23");
    });
  });
});
