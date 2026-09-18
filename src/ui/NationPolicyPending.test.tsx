/**
 * Pending-directive Policy rendering (#65): the nation Policy surface lists
 * queued HoS fiscal directives with their directed targets and an honest
 * empty state, using the live session projection (no invented fixtures).
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { WorldState } from "@ahdclient/engine";
import { projectNation } from "../game/nation";
import { GameSession } from "../game/session";
import { NationPanel } from "./NationPanel";

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
