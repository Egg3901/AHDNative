import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegislationDetailsQuery, LegislationBillDetails } from "../game/legislationDetails";

function makeQuery(): LegislationDetailsQuery {
  return {
    office: "House of Representatives · United States",
    playerChamberKey: "house",
    chambers: [
      {
        chamberKey: "house",
        chamberName: "House of Representatives",
        active: [
          {
            id: "bill-1", title: "Wage Bill", status: "active",
            chamberKey: "house", chamberName: "House of Representatives",
            sponsorName: "Ada", votesFor: 12, votesAgainst: 7, votesAbstain: 3,
            playerVote: null, votingOpen: true,
            votingAvailable: true, voteCost: 1,
          },
        ],
        completed: [
          {
            id: "bill-0", title: "Old Roads Bill", status: "signed",
            chamberKey: "house", chamberName: "House of Representatives",
            sponsorName: "Bo", votesFor: 200, votesAgainst: 100, votesAbstain: 5,
            playerVote: "for", votingOpen: false,
            votingAvailable: false, voteDisabledReason: "Voting is not open on this bill.",
            voteCost: 1,
          },
        ],
      },
      {
        chamberKey: "senate",
        chamberName: "Senate",
        active: [],
        completed: [],
      },
    ],
    proposals: [
      {
        id: "us.economy.workerSecurity.primary",
        title: "Fair Labor Standards and Employment Security Act",
        description: "Federal wage floors, hours rules, and workplace protections.",
        kind: "primary", category: "economy", allowedScope: "both",
        baselineLevel: 1,
        levels: [
          { index: 0, name: "No Federal Standards", description: "No standards." },
          { index: 1, name: "Basic Standards", description: "Minimum wage and hours.", gdpCostFraction: 0.00025 },
          { index: 2, name: "National Standards", description: "Broader coverage.", gdpCostFraction: 0.0006 },
          { index: 3, name: "Strong Protections", description: "Bargaining enforced.", gdpCostFraction: 0.0011 },
          { index: 4, name: "Comprehensive Guarantees", description: "Universal coverage.", gdpCostFraction: 0.0018 },
        ],
        targets: [{ metricId: "economy.workerSecurity", weight: 1 }],
        effect: { economy: { unemploymentRate: -0.002 }, partySupport: { supportDelta: 1 } },
        sponsorAvailable: true, sponsorCost: 4,
      },
      {
        id: "us.tax.incomeTax",
        title: "Federal Income Tax Structure",
        description: "Federal levy on personal incomes.",
        kind: "tax", category: "economy", allowedScope: "national",
        taxPolicy: { scope: "federal", taxType: "incomeTax", minRate: 0, maxRate: 60, step: 1, baselineRate: 35 },
        targets: [],
        effect: { economy: { growthRate: -0.0005 } },
        sponsorAvailable: true, sponsorCost: 4,
      },
    ],
    selectedBill: null,
    selectedProposal: null,
    sponsorSupportsLevelChoice: false,
    sponsorSupportsTaxRateChoice: true,
    levelChoiceNote: "Legal options are shown as reference. Level selection is unavailable in this single-player version.",
  };
}

function wageBillDetails(): LegislationBillDetails {
  return {
    id: "bill-1", title: "Wage Bill", status: "active",
    chamberKey: "house", chamberName: "House of Representatives",
    sponsorName: "Ada", votesFor: 12, votesAgainst: 7, votesAbstain: 3,
    playerVote: null, votingOpen: true,
    votingAvailable: true, voteCost: 1,
    summary: "Workplace rules.",
    category: "economy",
    legislationTypeId: "us.economy.workerSecurity.primary",
    provisions: [{ type: "policy", legislationTypeId: "us.economy.workerSecurity.primary", effectDirection: 1 }],
    proposedAtTurn: 97, updatedAtTurn: 98,
    catalogLevels: [
      { index: 0, name: "No Federal Standards", description: "No standards." },
      { index: 1, name: "Basic Standards", description: "Minimum wage and hours.", gdpCostFraction: 0.00025 },
    ],
  };
}

const renderPanel = async () => {
  const { LegislationDetailsPanel } = await import("./LegislationDetailsPanel");
  return LegislationDetailsPanel;
};

describe("LegislationDetailsPanel", () => {
  it("lists chamber-specific active and completed bills", async () => {
    const LegislationDetailsPanel = await renderPanel();
    render(<LegislationDetailsPanel query={makeQuery()} busy={false} onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show House of Representatives bills" })).toBeInTheDocument();
    expect(screen.getByText("Wage Bill")).toBeInTheDocument();
    expect(screen.getByText("Old Roads Bill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Senate bills" })).toBeInTheDocument();
  });

  it("opens real bill details on selection, with read-only levels and no level action", async () => {
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedBill = { ...wageBillDetails() };
    render(<LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("Workplace rules.")).toBeInTheDocument();
    expect(screen.getByText("Bill details: Wage Bill")).toBeInTheDocument();
    expect(screen.getAllByText("Basic Standards")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /sponsor at this level/i })).not.toBeInTheDocument();
  });

  it("shows human-friendly copy with no engine internals or raw JSON", async () => {
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedBill = { ...wageBillDetails() };
    query.selectedProposal = query.proposals[0];
    const { container } = render(<LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/sponsorBill/);
    expect(text).not.toMatch(/catalogId/);
    expect(text).not.toMatch(/effectDirection/);
    expect(text).not.toMatch(/legislationTypeId/);
    expect(text).not.toMatch(/us\.economy\.workerSecurity\.primary/);
    expect(text).not.toContain('{"unemploymentRate"');
    expect(screen.getByText(/Unemployment rate -0\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/Support \+1/)).toBeInTheDocument();
    expect(screen.getByText(/Starting option: Basic Standards/)).toBeInTheDocument();
    expect(screen.getByText(/Legal options are shown as reference/)).toBeInTheDocument();
  });

  it("reports bill selection and shows fetched detail only while its card stays expanded", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    const { rerender } = render(
      <LegislationDetailsPanel query={query} busy={false} onAction={onAction} onSelectBill={onSelect} />,
    );
    const card = screen.getByRole("article", { name: "Wage Bill" });
    await user.click(within(card).getByRole("button", { name: "Show details for Wage Bill" }));
    expect(onSelect).toHaveBeenCalledWith("bill-1");
    expect(screen.queryByText("Bill details: Wage Bill")).not.toBeInTheDocument();

    const fetched: LegislationDetailsQuery = { ...query, selectedBill: { ...wageBillDetails() } };
    rerender(<LegislationDetailsPanel query={fetched} busy={false} onAction={onAction} onSelectBill={onSelect} />);
    expect(screen.getByText("Bill details: Wage Bill")).toBeInTheDocument();
    expect(screen.getByText("Workplace rules.")).toBeInTheDocument();

    const openCard = screen.getByRole("article", { name: "Wage Bill" });
    await user.click(within(openCard).getByRole("button", { name: "Hide details for Wage Bill" }));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(screen.queryByText("Bill details: Wage Bill")).not.toBeInTheDocument();
  });

  it("never displays a stale selection for a different bill", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedBill = {
      id: "bill-0", title: "Old Roads Bill", status: "signed",
      chamberKey: "house", chamberName: "House of Representatives",
      sponsorName: "Bo", votesFor: 200, votesAgainst: 100, votesAbstain: 5,
      playerVote: "for", votingOpen: false,
      votingAvailable: false, voteDisabledReason: "Voting is not open on this bill.",
      voteCost: 1,
      summary: "Old roads summary.",
      category: "economy",
      provisions: [],
      proposedAtTurn: 10, updatedAtTurn: 11,
    };
    render(<LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} onSelectBill={onSelect} />);
    expect(screen.getByText("Bill details: Old Roads Bill")).toBeInTheDocument();

    const wageCard = screen.getByRole("article", { name: "Wage Bill" });
    await user.click(within(wageCard).getByRole("button", { name: "Show details for Wage Bill" }));
    expect(onSelect).toHaveBeenCalledWith("bill-1");
    expect(screen.queryByText("Bill details: Old Roads Bill")).not.toBeInTheDocument();
    expect(screen.queryByText("Bill details: Wage Bill")).not.toBeInTheDocument();
  });

  it("keeps the user legislation choice until a new external selection arrives", async () => {
    const user = userEvent.setup();
    const LegislationDetailsPanel = await renderPanel();
    const base = makeQuery();
    const { rerender } = render(<LegislationDetailsPanel query={base} busy={false} onAction={vi.fn()} />);
    const select = screen.getByLabelText("Available legislation") as HTMLSelectElement;
    await user.selectOptions(select, "us.tax.incomeTax");
    expect(select.value).toBe("us.tax.incomeTax");

    rerender(<LegislationDetailsPanel query={{ ...base, proposals: [...base.proposals] }} busy={false} onAction={vi.fn()} />);
    expect((screen.getByLabelText("Available legislation") as HTMLSelectElement).value).toBe("us.tax.incomeTax");

    const external = { ...base, proposals: [...base.proposals], selectedProposal: base.proposals[0] };
    rerender(<LegislationDetailsPanel query={external} busy={false} onAction={vi.fn()} />);
    expect((screen.getByLabelText("Available legislation") as HTMLSelectElement).value).toBe(
      "us.economy.workerSecurity.primary",
    );
  });

  it("sponsors the selected catalog proposal at the default engine level", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedProposal = query.proposals[0];
    render(<LegislationDetailsPanel query={query} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "us.economy.workerSecurity.primary" });
  });

  it("sponsors a tax proposal with the supported rate param", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedProposal = query.proposals[1];
    render(<LegislationDetailsPanel query={query} busy={false} onAction={onAction} />);
    const rate = screen.getByLabelText("Tax rate") as HTMLInputElement;
    await user.clear(rate);
    await user.type(rate, "42");
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "us.tax.incomeTax", taxRate: 42 });
  });

  it("votes on an open bill through the supported vote action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    render(<LegislationDetailsPanel query={makeQuery()} busy={false} onAction={onAction} />);
    const card = screen.getByRole("article", { name: "Wage Bill" });
    await user.click(within(card).getByRole("button", { name: "For on Wage Bill" }));
    expect(onAction).toHaveBeenCalledWith("voteOnBill", { billId: "bill-1", vote: "for" });
  });

  it("disables every action while busy", async () => {
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedProposal = query.proposals[0];
    render(<LegislationDetailsPanel query={query} busy={true} onAction={vi.fn()} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
