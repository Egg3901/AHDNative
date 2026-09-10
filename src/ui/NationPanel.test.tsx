import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectNation } from "../game/nation";
import { NationPanel } from "./NationPanel";
import type { NationView } from "../game/nation";

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
      taxRates: [
        { id: "incomeTax", label: "Income tax", ratePercent: 35 },
        { id: "salesTax", label: "Sales tax", ratePercent: 10 },
      ],
      revenue: {
        components: [
          { id: "incomeTax", label: "Income tax", amount: 50_000_000_000, taxRatePercent: 35, taxBase: 142_857_142_857 },
          { id: "other", label: "Other", amount: 5_000_000_000 },
        ],
        total: 55_000_000_000,
      },
      spending: {
        categories: [{ id: "defense", label: "Defense", amount: 52_800_000_000 }],
        stateGrants: 3_000_000_000,
        debtInterest: 1_000_000_000,
        total: 56_800_000_000,
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
    render(<NationPanel nation={makeNation()} section="economy" />);

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
    render(<NationPanel nation={makeNation()} section="budget" />);

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

  it("shows current tax settings and enacted policy option details", () => {
    render(<NationPanel nation={makeNation()} section="policy" />);

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
    });
    const { rerender } = render(<NationPanel nation={nation} section="economy" />);
    expect(screen.getByText("No macro history recorded.")).toBeInTheDocument();
    expect(screen.getByText("No prime-rate history recorded.")).toBeInTheDocument();

    rerender(<NationPanel nation={nation} section="policy" />);
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
});
