import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionsHub, type ActionsCategoryFilter } from "./ActionsHub";
import type { ActionView } from "../game/types";

function StatefulHub({ actions }: { actions: ActionView[] }) {
  const [category, setCategory] = useState<ActionsCategoryFilter>("all");
  return <ActionsHub actions={actions} {...props} category={category} onCategoryChange={setCategory} />;
}

const actions: ActionView[] = [
  { id: "campaign", name: "Campaign", description: "Influence work.", cost: 1, available: true, requires: "region", category: "influence", fundCost: 20000, cooldownTurns: 0, prerequisite: "Choose a region." },
  { id: "advertise", name: "Run Advertisements", description: "Ads.", cost: 5, available: false, disabledReason: "Not enough action points.", category: "influence", fundCost: 100000, cooldownTurns: 0 },
  { id: "fundraise", name: "Fundraise", description: "Raise money.", cost: 3, available: false, disabledReason: "No donor base. Use Build Donor Network first.", category: "fundraising", fundCost: 0, cooldownTurns: 0, prerequisite: "Requires a donor network." },
  { id: "poll", name: "Quick Poll", description: "Poll.", cost: 2, available: false, disabledReason: "Not yet available: requires the polling/election polling system.", category: "intelligence", fundCost: 25000, cooldownTurns: 0 },
];

const props = {
  regions: [{ id: "r1", name: "Midwest" }],
  parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", members: 1, treasury: 0, isPlayerParty: true }],
  busy: false,
  currency: "USD",
  onAction: vi.fn(),
};

describe("ActionsHub", () => {
  it("shows category tabs with eligible-of-total counts from current availability", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} />);
    const tabs = screen.getByRole("tablist", { name: /filter actions by category/i });
    expect(within(tabs).getByRole("tab", { name: /all, 1 of 4 available/i })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /influence, 1 of 2 available/i })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /fundraising, 0 of 1 available/i })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /intelligence, 0 of 1 available/i })).toBeInTheDocument();
  });

  it("filters to the selected category and shows projection details on each card", async () => {
    const user = userEvent.setup();
    render(<StatefulHub actions={actions} />);
    await user.click(screen.getByRole("tab", { name: /intelligence/i }));
    expect(screen.getByText("Quick Poll")).toBeInTheDocument();
    expect(screen.queryByText("Fundraise")).not.toBeInTheDocument();
    const card = screen.getByRole("article", { name: /quick poll/i });
    expect(within(card).getByText(/2 AP/i)).toBeInTheDocument();
    expect(within(card).getByText(/25,000/)).toBeInTheDocument();
    expect(within(card).getByText(/polling\/election polling/)).toBeInTheDocument();
  });

  it("shows cooldown, prerequisite and funds cost from the projection", () => {
    const cooling: ActionView[] = [
      { id: "advertise", name: "Run Advertisements", description: "Ads.", cost: 5, available: false, disabledReason: "Available in 2 turns.", category: "influence", fundCost: 100000, cooldownTurns: 2 },
    ];
    render(<ActionsHub actions={cooling} {...props} category="all" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /run advertisements/i });
    expect(within(card).getByText(/available in 2 turns/i)).toBeInTheDocument();
    expect(within(card).queryByText(/cooldown: ready/i)).not.toBeInTheDocument();
  });

  it("keeps every supported action reachable through All", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} />);
    for (const action of actions) {
      expect(screen.getByRole("article", { name: new RegExp(action.name, "i") })).toBeInTheDocument();
    }
  });
});
