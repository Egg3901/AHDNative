import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { buildLegislationDetails } from "../game/legislationDetails";
import type { LegislationDetailsQuery, LegislationBillDetails } from "../game/legislationDetails";

function makeQuery(): LegislationDetailsQuery {
  return {
    office: "House of Representatives · United States",
    playerChamberKey: "house",
    countryId: "US",
    chambers: [
      {
        chamberKey: "house",
        chamberName: "House of Representatives",
        shortName: "House",
        seats: 435,
        elected: true,
        description: "435 representatives, two-year terms.",
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
        shortName: "Senate",
        seats: 100,
        elected: true,
        description: "100 senators, six-year terms.",
        active: [],
        completed: [],
      },
    ],
    committees: [],
    schedule: [],
    proposals: [
      {
        id: "us.economy.workerSecurity.primary",
        title: "Fair Labor Standards and Employment Security Act",
        description: "Federal wage floors, hours rules, and workplace protections.",
        kind: "primary", category: "economy", allowedScope: "both",
        baselineLevel: 1,
        regions: [{ id: "US-CA", name: "California" }, { id: "US-NY", name: "New York" }],
        levels: [
          { index: 0, name: "No Federal Standards", description: "No standards." },
          { index: 1, name: "Basic Standards", description: "Minimum wage and hours.", gdpCostFraction: 0.00025 },
          { index: 2, name: "National Standards", description: "Broader coverage.", gdpCostFraction: 0.0006 },
          { index: 3, name: "Strong Protections", description: "Bargaining enforced.", gdpCostFraction: 0.0011 },
          { index: 4, name: "Comprehensive Guarantees", description: "Universal coverage.", gdpCostFraction: 0.0018 },
        ],
        targets: [{ metricId: "economy.workerSecurity", weight: 1 }],
        effect: { economy: { unemploymentRate: -0.002 }, partySupport: { supportDelta: 1 } },
        sponsorAvailable: true, sponsorCost: 10, sponsorNpiCost: 5,
      },
      {
        id: "us.tax.incomeTax",
        title: "Federal Income Tax Structure",
        description: "Federal levy on personal incomes.",
        kind: "tax", category: "economy", allowedScope: "national",
        taxPolicy: { scope: "federal", taxType: "incomeTax", minRate: 0, maxRate: 60, step: 1, baselineRate: 35 },
        targets: [],
        effect: { economy: { growthRate: -0.0005 } },
        sponsorAvailable: true, sponsorCost: 10, sponsorNpiCost: 5,
      },
    ],
    selectedBill: null,
    selectedProposal: null,
    sponsorSupportsLevelChoice: true,
    sponsorSupportsTaxRateChoice: true,
    levelChoiceNote: "Choose an authored level when sponsoring a law.",
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

  it("opens real bill details on selection and keeps the enacted level distinct from the new proposal control", async () => {
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedBill = { ...wageBillDetails() };
    render(<LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("Workplace rules.")).toBeInTheDocument();
    expect(screen.getByText("Bill details: Wage Bill")).toBeInTheDocument();
    expect(screen.getAllByText("Basic Standards")).toHaveLength(3);
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
    expect(screen.getByRole("combobox", { name: "Policy level" })).toBeInTheDocument();
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

  it("sponsors the selected catalog proposal at its authored baseline level", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedProposal = query.proposals[0];
    render(<LegislationDetailsPanel query={query} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
      originChamber: "house",
      policyOptionId: "l1",
    });
  });

  it("lets the player select an authored law level and regional scope under the existing sponsor gate", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedProposal = query.proposals[0];
    render(<LegislationDetailsPanel query={query} busy={false} onAction={onAction} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Policy level" }), "l3");
    await user.selectOptions(screen.getByRole("combobox", { name: "Legislation scope" }), "region:US-CA");
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
      policyOptionId: "l3",
      regionId: "US-CA",
      originChamber: "house",
    });
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
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "us.tax.incomeTax", taxRate: 42, originChamber: "house" });
  });

  it("lets an Irish player choose the authored 23% VAT option", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.selectedProposal = {
      id: "ie_vat_rate", title: "Value Added Tax", description: "Irish VAT rate",
      kind: "tax", category: "economy", allowedScope: "national", targets: [],
      taxPolicy: { scope: "federal", taxType: "salesTax", minRate: 0, maxRate: 35, step: 2, baselineRate: 21,
        options: [{ id: "ie_vat_rate_opt_5", rate: 21, economic: 0, social: 0 }, { id: "ie_vat_rate_opt_6", rate: 23, economic: 0, social: 0 }] },
      sponsorAvailable: true, sponsorCost: 10, sponsorNpiCost: 5,
    };
    query.proposals.push(query.selectedProposal);
    render(<LegislationDetailsPanel query={query} busy={false} onAction={onAction} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Tax rate" }), "23");
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "ie_vat_rate", taxRate: 23, originChamber: "house" });
  });

  it("proposes the source 0% VAT option through the public bill path for an enacted law", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.enactedLaws = [{
      id: "ie_vat_rate", title: "Statutory Value-Added Tax Act", level: 0,
      enactedAtTurn: 4, scope: "national",
    }];
    const vatProposal = {
      id: "ie_vat_rate", title: "Value Added Tax", description: "Irish VAT rate",
      kind: "tax" as const, category: "economy", allowedScope: "national" as const,
      taxPolicy: { scope: "federal" as const, taxType: "salesTax", minRate: 0, maxRate: 35, step: 2, baselineRate: 21,
        options: [{ id: "ie_vat_rate_opt_0", rate: 0, economic: -5, social: -2 }] },
      targets: [], sponsorAvailable: true, sponsorCost: 10, sponsorNpiCost: 5,
    };
    query.proposals.push(vatProposal);
    render(<LegislationDetailsPanel query={query} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Propose 0% VAT: Statutory Value-Added Tax Act" }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", { catalogId: "ie_vat_rate", taxRate: 0, originChamber: "house" });
  });

  it("renders the parliamentary formation freeze as the reason the proposal is unavailable", async () => {
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.proposals[0] = {
      ...query.proposals[0]!,
      sponsorAvailable: false,
      sponsorDisabledReason: "Government is in formation; legislation is frozen until a PM is seated",
    };
    query.selectedProposal = query.proposals[0];
    render(<LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sponsor bill" })).toBeDisabled();
    expect(screen.getByText("Government is in formation; legislation is frozen until a PM is seated")).toBeInTheDocument();
  });

  it("lets a Chinese Head of State propose an authored VAT option", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const world = createWorld({
      seed: "cn-law-ui-2019",
      playerName: "China Player",
      countryId: "CN",
      era: "2019",
      mode: "hos",
    });
    world.player.nationalInfluence = 5;
    const freshQuery = buildLegislationDetails(world);
    freshQuery.selectedProposal = freshQuery.proposals.find((proposal) => proposal.id === "cn_value_added_tax") ?? null;
    expect(freshQuery.office).toBe("Head of state");
    expect(freshQuery.selectedProposal?.taxPolicy?.options?.map((option) => option.rate)).toContain(15);
    expect(freshQuery.selectedProposal).toMatchObject({ sponsorAvailable: true, sponsorCost: 10, sponsorNpiCost: 5 });
    render(<LegislationDetailsPanel query={freshQuery} busy={false} onAction={onAction} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Tax rate" }), "15");
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(onAction).toHaveBeenCalledWith("sponsorBill", {
      catalogId: "cn_value_added_tax",
      taxRate: 15,
      originChamber: freshQuery.chambers[0]?.chamberKey,
    });
  });

  it("keeps a zero-NPI source tariff proposal available while gating a five-NPI tax proposal", async () => {
    const LegislationDetailsPanel = await renderPanel();
    const world = createWorld({
      seed: "cn-law-ui-source-cost-gate",
      playerName: "China Player",
      countryId: "CN",
      era: "2019",
      mode: "hos",
    });
    const query = buildLegislationDetails(world);
    const vat = query.proposals.find((proposal) => proposal.id === "cn_value_added_tax");
    const tariff = query.proposals.find((proposal) => proposal.id === "cn_customs_tariff");
    expect(vat).toMatchObject({ sponsorAvailable: false, sponsorNpiCost: 5 });
    expect(vat?.sponsorDisabledReason).toContain("national influence");
    expect(tariff).toMatchObject({ sponsorAvailable: true, sponsorCost: 10, sponsorNpiCost: 0 });
    query.selectedProposal = vat ?? null;
    render(<LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("Cost 10 actions + 5 national influence")).toBeInTheDocument();
    expect(screen.getByText(/Not enough national influence/)).toBeInTheDocument();
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

  it("labels chambers from config and shows committees with queues plus the floor schedule", async () => {
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    query.committees = [{
      id: "com-US-house-finance", name: "House of Representatives Finance", chamberKey: "house",
      chamberName: "House of Representatives", jurisdiction: ["economy", "infrastructure"],
      chairName: "Ada", memberCount: 217,
      active: [{
        id: "bill-1", title: "Wage Bill", status: "active", chamberKey: "house", chamberName: "House of Representatives",
        sponsorName: "Ada", votesFor: 12, votesAgainst: 7, votesAbstain: 3, playerVote: null,
        votingOpen: true, votingAvailable: true, voteCost: 1,
      }],
      completed: [],
    }];
    query.schedule = [{
      billId: "bill-1", title: "Wage Bill", chamberKey: "house", chamberName: "House of Representatives",
      status: "active", statusLabel: "Voting Open", nextAction: "Origin-chamber vote closes", dueTurn: 7, overdue: false,
    }];
    render(<LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/435 seats/)).toBeInTheDocument();
    expect(screen.getByLabelText("Committee House of Representatives Finance")).toBeInTheDocument();
    expect(screen.getByText(/Queue: Wage Bill/)).toBeInTheDocument();
    expect(screen.getByText("Floor schedule")).toBeInTheDocument();
    expect(screen.getByText(/Origin-chamber vote closes \(turn 7\)/)).toBeInTheDocument();
  });

  it("restores the persisted chamber selection and reports chamber changes", async () => {
    const user = userEvent.setup();
    const onSelectChamber = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    render(<LegislationDetailsPanel
      query={makeQuery()}
      busy={false}
      onAction={vi.fn()}
      initialChamberKey="senate"
      onSelectChamber={onSelectChamber}
    />);
    expect(screen.getByRole("button", { name: "Show Senate bills" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Show House of Representatives bills" }));
    expect(onSelectChamber).toHaveBeenCalledWith("house");
  });
});

describe("LegislationDetailsPanel dual-pane list/detail (#438)", () => {
  it("pairs the chamber bill list with the selected bill detail sharing one selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const LegislationDetailsPanel = await renderPanel();
    const query = makeQuery();
    const { rerender } = render(
      <LegislationDetailsPanel query={query} busy={false} onAction={vi.fn()} onSelectBill={onSelect} />,
    );
    const list = document.querySelector('[data-pane="list"]');
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getByRole("article", { name: "Wage Bill" })).toBeInTheDocument();
    expect(screen.queryByText("Bill details: Wage Bill")).not.toBeInTheDocument();
    // One selection drives both panes: expanding the card reports the bill,
    // and the fetched detail lands in the detail pane.
    await user.click(within(list as HTMLElement).getByRole("button", { name: "Show details for Wage Bill" }));
    expect(onSelect).toHaveBeenCalledWith("bill-1");
    const fetched: LegislationDetailsQuery = { ...query, selectedBill: { ...wageBillDetails() } };
    rerender(<LegislationDetailsPanel query={fetched} busy={false} onAction={vi.fn()} onSelectBill={onSelect} />);
    const detail = document.querySelector('[data-pane="detail"]');
    expect(detail).not.toBeNull();
    expect(within(detail as HTMLElement).getByText("Bill details: Wage Bill")).toBeInTheDocument();
  });
});
