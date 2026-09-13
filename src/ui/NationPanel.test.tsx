import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { projectNation } from "../game/nation";
import { NationPanel } from "./NationPanel";
import type { NationView } from "../game/nation";

// World clock anchoring the reference calendar for in-game dates (#226).
const CLOCK = { turn: 1, date: "1953-01-13" };

function makeNation(overrides: Partial<NationView> = {}): NationView {
  return {
    countryId: "US",
    countryName: "United States",
    currency: "USD",
    economy: {
      gdpMillions: 387_000,
      growthRate: 0.046,
      inflationRate: 0.0075,
      unemploymentRate: 0.029,
      outputGap: -1.25,
      primeRate: 3,
      macroHistory: [
        {
          turn: 1,
          gdpMillions: 380_000,
          growthRate: 0.04,
          inflationRate: 0.006,
          unemploymentRate: 0.03,
          outputGap: 0,
        },
      ],
      primeRateHistory: [{ turn: 1, primeRate: 2.75 }],
    },
    budget: {
      fiscalYear: 1953,
      gdpAbsolute: 387_000_000_000,
      population: 160_000_000,
      currency: "USD",
      labels: {
        title: "Federal Budget",
        revenueTitle: "Revenue Sources",
        spendingTitle: "Spending by Category",
        debtTitle: "National Debt",
        ceilingLabel: "Debt Ceiling",
        debtServiceLabel: "Debt Service",
        transferLabel: "State grants",
        revenue: { incomeTax: "Income Tax", other: "Other Revenue" },
        spending: { defense: "Defense" },
      },
      links: [
        { label: "Policy", route: "policy" },
        { label: "Government & executive", route: "nations" },
        { label: "Legislature", route: "legislature" },
        { label: "Elections", route: "elections" },
      ],
      taxRates: [
        { id: "incomeTax", label: "Income tax", ratePercent: 35 },
        { id: "salesTax", label: "Sales tax", ratePercent: 10 },
      ],
      revenue: {
        components: [
          { id: "incomeTax", label: "Income Tax", amount: 50_000_000_000, taxRatePercent: 35, taxBase: 142_857_142_857 },
          { id: "other", label: "Other Revenue", amount: 5_000_000_000 },
        ],
        total: 55_000_000_000,
      },
      spending: {
        categories: [{ id: "defense", label: "Defense", amount: 52_800_000_000 }],
        stateGrants: 3_000_000_000,
        debtInterest: 1_000_000_000,
        total: 56_800_000_000,
        transfers: [{ id: "ca", name: "California", amount: 2_000_000_000 }],
      },
      debt: {
        principal: 100_000_000_000,
        interestRate: 0.02,
        ceiling: 200_000_000_000,
        debtToGdpRatio: 100_000_000_000 / 387_000_000_000,
        creditRating: "AA",
      },
      surplus: -1_800_000_000,
      treasuryBalance: -100_000_000_000,
    },
    metrics: {
      total: 3,
      categories: [
        {
          id: "economic",
          label: "Economic",
          metrics: [
            {
              id: "economic.gdpGrowth",
              category: "economic",
              label: "GDP growth",
              value: 4.6,
              format: "percent",
              history: [{ turn: 1, value: 4.2 }],
              modifiers: [],
              links: [{ label: "Economy", route: "economy" }, { label: "Budget", route: "budget" }],
            },
            {
              id: "economic.inflationRate",
              category: "economic",
              label: "Inflation",
              value: 2.32,
              format: "percent",
              history: [],
              modifiers: [],
              links: [{ label: "Economy", route: "economy" }],
            },
          ],
        },
        {
          id: "governance",
          label: "Governance",
          metrics: [
            {
              id: "governance.approval",
              category: "governance",
              label: "Government approval",
              value: 55.5,
              format: "percent",
              history: [{ turn: 0, value: 56.3 }, { turn: 1, value: 54.8 }],
              modifiers: [{ id: "c1:approval", label: "Recession", effect: -4, effectType: "tick", source: "crisis" }],
              links: [{ label: "Policy", route: "policy" }, { label: "Elections", route: "elections" }],
            },
          ],
        },
      ],
    },
    policy: {
      taxRates: [
        { id: "incomeTax", label: "Income tax", ratePercent: 35 },
      ],
      enacted: [
        {
          id: "us.economy.workerSecurity.primary",
          title: "Fair Labor Standards and Employment Security Act",
          category: "economy",
          scope: "national",
          level: 2,
          optionName: "National Standards",
          optionDescription: "Broader coverage.",
          enactedTurn: 4,
          enactedAt: "1953-02-03",
        },
      ],
    },
    ...overrides,
  };
}

describe("NationPanel", () => {
  it("renders economy metrics with their source units and recorded history", () => {
    render(<NationPanel nation={makeNation()} section="economy" clock={CLOCK} />);

    expect(screen.getByRole("heading", { name: "Economy" })).toBeInTheDocument();
    expect(screen.getByText("387,000 million USD")).toBeInTheDocument();
    expect(screen.getByText("4.6%")).toBeInTheDocument();
    expect(screen.getByText("0.8%")).toBeInTheDocument();
    expect(screen.getByText("2.9%")).toBeInTheDocument();
    expect(screen.getByText("-1.3%")).toBeInTheDocument();
    expect(screen.getAllByText(/Turn 1/).length).toBeGreaterThan(0);
    expect(screen.getByText("2.75%")).toBeInTheDocument();
  });

  it("renders budget flows and debt in absolute local currency", () => {
    render(<NationPanel nation={makeNation()} section="budget" clock={CLOCK} />);

    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
    expect(screen.getByText("Fiscal year 1953")).toBeInTheDocument();
    expect(screen.getByText("$387,000,000,000")).toBeInTheDocument();
    expect(screen.getByText("$50,000,000,000")).toBeInTheDocument();
    expect(screen.getByText("$52,800,000,000")).toBeInTheDocument();
    expect(screen.getByText("$100,000,000,000")).toBeInTheDocument();
    expect(screen.getByText("25.8%")).toBeInTheDocument();
    expect(screen.getByText("2.00%")).toBeInTheDocument();
    expect(screen.getByText("AA")).toBeInTheDocument();
  });

  it("renders country-specific budget vocabulary and consequence links", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NationPanel nation={makeNation()} section="budget" clock={CLOCK} onNavigate={onNavigate} />);

    expect(screen.getByText("Federal Budget")).toBeInTheDocument();
    expect(screen.getByText("Revenue Sources")).toBeInTheDocument();
    expect(screen.getByText("Spending by Category")).toBeInTheDocument();
    expect(screen.getByText("National Debt")).toBeInTheDocument();
    expect(screen.getByText("Defense")).toBeInTheDocument();
    expect(screen.getByText("State grants")).toBeInTheDocument();
    expect(screen.getByText("Debt Service")).toBeInTheDocument();
    expect(screen.getByText("Recorded transfer recipients")).toBeInTheDocument();
    expect(screen.getByText("California")).toBeInTheDocument();
    expect(screen.getByText("$2,000,000,000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Legislature" }));
    expect(onNavigate).toHaveBeenCalledWith("legislature");
  });

  it("renders the metric registry with formats, history, modifiers, and destinations", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NationPanel nation={makeNation()} section="metrics" clock={CLOCK} onNavigate={onNavigate} />);

    expect(screen.getByRole("heading", { name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByText("National metrics registry")).toBeInTheDocument();
    expect(screen.getByText("3 recorded")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Economic" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Governance" })).toBeInTheDocument();
    expect(screen.getByText("GDP growth")).toBeInTheDocument();
    expect(screen.getByText("4.60%")).toBeInTheDocument();

    const approval = screen.getByRole("article", { name: "Government approval" });
    expect(within(approval).getByText("55.50%")).toBeInTheDocument();
    await user.click(within(approval).getByText("Details"));
    expect(within(approval).getByText("Recession")).toBeInTheDocument();
    expect(within(approval).getByText("-4")).toBeInTheDocument();
    expect(within(approval).getByText(/Turn 1/)).toBeInTheDocument();

    const inflation = screen.getByRole("article", { name: "Inflation" });
    await user.click(within(inflation).getByText("Details"));
    expect(within(inflation).getByText("No history recorded.")).toBeInTheDocument();

    const growth = screen.getByRole("article", { name: "GDP growth" });
    await user.click(within(growth).getByText("Details"));
    expect(within(growth).getByText(/Turn 1/)).toBeInTheDocument();
    expect(within(growth).getByText("4.20%")).toBeInTheDocument();
    expect(within(growth).getByText("No modifiers recorded.")).toBeInTheDocument();

    await user.click(within(approval).getByRole("button", { name: "Elections" }));
    expect(onNavigate).toHaveBeenCalledWith("elections");
  });

  it("shows current tax settings and enacted policy option details", () => {
    render(<NationPanel nation={makeNation()} section="policy" clock={CLOCK} />);

    expect(screen.getByRole("heading", { name: "Policy" })).toBeInTheDocument();
    expect(screen.getByText("Income tax")).toBeInTheDocument();
    expect(screen.getByText("35.0%")).toBeInTheDocument();
    const law = screen.getByRole("article", {
      name: "Fair Labor Standards and Employment Security Act",
    });
    expect(within(law).getByText("National Standards")).toBeInTheDocument();
    expect(within(law).getByText("Broader coverage.")).toBeInTheDocument();
    expect(within(law).getByText("Enacted turn")).toBeInTheDocument();
    expect(within(law).getByText("4")).toBeInTheDocument();
  });

  it("uses honest empty states when no history or national law is recorded", () => {
    const nation = makeNation({
      economy: { ...makeNation().economy, macroHistory: [], primeRateHistory: [], primeRate: null },
      policy: { taxRates: [], enacted: [] },
      metrics: { total: 0, categories: [] },
    });
    const { rerender } = render(<NationPanel nation={nation} section="economy" clock={CLOCK} />);
    expect(screen.getByText("No macro history recorded.")).toBeInTheDocument();
    expect(screen.getByText("No prime-rate history recorded.")).toBeInTheDocument();

    rerender(<NationPanel nation={nation} section="metrics" clock={CLOCK} />);
    expect(screen.getByText("No national metrics recorded.")).toBeInTheDocument();

    rerender(<NationPanel nation={nation} section="policy" clock={CLOCK} />);
    expect(screen.getByText("No current tax settings recorded.")).toBeInTheDocument();
    expect(screen.getByText("No enacted national policies recorded.")).toBeInTheDocument();
  });

  it("projects the country's economy and budget without collapsing their units", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "nation-view" });
    const nation = projectNation(world);

    expect(nation.economy.gdpMillions).toBe(387_000);
    expect(nation.budget.gdpAbsolute).toBe(387_000_000_000);
    expect(nation.budget.currency).toBe("USD");
    expect(nation.budget.debt.debtToGdpRatio).toBeNull();
    expect(nation.policy.enacted).toEqual([]);
    expect(nation.policy.taxRates.find((tax) => tax.id === "incomeTax")?.ratePercent).toBe(35);
  });

  it("renders the projected country budget labels through the real session data", () => {
    const world = createWorld({ era: "1953", countryId: "UK", playerName: "Ada", seed: "nation-uk" });
    const nation = projectNation(world);
    render(<NationPanel nation={nation} section="budget" clock={CLOCK} />);

    expect(screen.getByText("HM Treasury Budget")).toBeInTheDocument();
    expect(screen.getByText("Receipts")).toBeInTheDocument();
    expect(screen.getByText("Health / NHS")).toBeInTheDocument();
    expect(screen.getByText("National Insurance")).toBeInTheDocument();
  });
});
