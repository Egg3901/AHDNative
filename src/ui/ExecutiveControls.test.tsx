/**
 * Executive-tab reachability (#65): the live HoS session projection feeds
 * ActionsHub with two available executive actions; a career projection feeds
 * none. Layout stays phone-first (single-column grid at 390px) with the
 * executive banner styled like every other category, and the cards keep the
 * shared Liquid Glass surface (no per-tab chrome).
 */
import { readFileSync } from "node:fs";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionsHub, type ActionsCategoryFilter } from "./ActionsHub";
import { GameSession } from "../game/session";
import type { ActionView } from "../game/types";

function liveActions(mode: "hos" | "career"): ActionView[] {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed: "executive-hub-test", playerName: "Alex", ...(mode === "hos" ? { mode: "hos" as const } : {}) });
  return session.view().actions;
}

function StatefulHub({ actions }: { actions: ActionView[] }) {
  const [category, setCategory] = useState<ActionsCategoryFilter>("all");
  return (
    <ActionsHub
      actions={actions}
      regions={[{ id: "r1", name: "Midwest" }]}
      parties={[]}
      busy={false}
      currency="USD"
      category={category}
      onCategoryChange={setCategory}
      onAction={vi.fn()}
    />
  );
}

describe("executive tab reachability (#65)", () => {
  it("offers the executive tab with both HoS actions available from the live projection", async () => {
    const user = userEvent.setup();
    render(<StatefulHub actions={liveActions("hos")} />);
    const tabs = screen.getByRole("tablist", { name: /filter actions by category/i });
    expect(within(tabs).getByRole("tab", { name: /executive, 2 of 2 available/i })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /executive/i }));
    for (const name of [/direct spending/i, /set tax rate/i]) {
      const card = screen.getByRole("article", { name });
      expect(within(card).getByRole("button", { name: /take action/i })).toBeEnabled();
    }
    expect(screen.getByRole("article", { name: /set tax rate/i })).toHaveTextContent(/phase/i);
  });

  it("executes the tax action from the executive card and surfaces the queued result", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "executive-hub-test", playerName: "Alex", mode: "hos" });
    render(
      <ActionsHub
        actions={session.view().actions}
        regions={[{ id: "r1", name: "Midwest" }]}
        parties={[]}
        busy={false}
        currency="USD"
        category="executive"
        onCategoryChange={() => {}}
        onAction={(id, params) => { onAction(id, params); session.act(id, params); }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /take action: set tax rate/i }));
    expect(onAction).toHaveBeenCalledWith("adjustTaxRate", expect.objectContaining({ taxRate: expect.any(Number) }));
  });

  it("offers only tax fields the engine can enact (no silent no-op option)", () => {
    render(<StatefulHub actions={liveActions("hos")} />);
    const card = screen.getByRole("article", { name: /set tax rate/i });
    const select = within(card).getByRole("combobox", { name: /tax field for set tax rate/i });
    const values = within(select).getAllByRole("option").map((option) => (option as HTMLOptionElement).value);
    expect(values).toEqual([
      "incomeTax",
      "domesticCorporateTax",
      "foreignCorporateTax",
      "payrollTax",
      "tariffs",
      "salesTax",
    ]);
    expect(values).not.toContain("corporateTax");
  });

  it("shows an honest empty executive tab for career players (no invented controls)", () => {
    render(<StatefulHub actions={liveActions("career")} />);
    const tabs = screen.getByRole("tablist", { name: /filter actions by category/i });
    expect(within(tabs).getByRole("tab", { name: /executive, 0 of 0 available/i })).toBeInTheDocument();
  });

  it("keeps the executive cards phone-first: single column at 390px with a styled banner", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    // Base rule (no media query) is the 390px layout: one column.
    expect(css).toMatch(/\.ahd-grid-3\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.ahd-action-banner\[data-category="executive"\]/);
  });
});
