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

  it("keeps the macro-history table keyboard-reachable at phone widths", () => {
    // The table declares a 32rem minimum width, so at 320/390px its trailing
    // columns sit inside a horizontal scroll container. Touch users swipe;
    // keyboard and switch-control users need a tab stop on that container,
    // otherwise GDP/growth/inflation/unemployment/output-gap data is
    // unreachable. jsdom performs no layout, so the case asserts the shipped
    // focusable-region contract around the real table.
    render(<NationPanel nation={makeNation()} section="economy" clock={CLOCK} />);

    const region = screen.getByRole("region", { name: "Macro history table" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getByRole("table")).toBeInTheDocument();
    for (const name of ["Turn", "GDP", "Growth", "Inflation", "Unemployment", "Output gap"]) {
      expect(within(region).getByRole("columnheader", { name })).toBeInTheDocument();
    }
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
    // The chart above Details also names Turn 1, so scope to the registry record.
    const registryDetails = within(approval).getByText("Details").closest("details")!;
    expect(within(registryDetails as HTMLElement).getByText(/Turn 1/)).toBeInTheDocument();

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

  it("wraps a long metric label with its value/trend badge instead of clipping at 320px", () => {
    // MetricCard headers pair the registry label with a value + nowrap trend
    // badge in one flex row. With no wrap and no shrink on the label, a long
    // label plus the badge exceeds a 320/390px phone and clips. The row now
    // wraps and the label shrinks/wraps (the .ahd-notification-title and
    // elections-pager sibling convention); the trend keeps its nowrap unit
    // and drops to the next line. jsdom performs no layout, so the case
    // asserts the shipped inline-style contract around the real header.
    const longLabel = "Intergovernmental fiscal equalization coefficient rating index";
    const nation = makeNation({
      metrics: {
        total: 1,
        categories: [
          {
            id: "economic",
            label: "Economic",
            metrics: [
              {
                id: "economic.equalization",
                category: "economic",
                label: longLabel,
                value: 54.8,
                format: "percent",
                history: [{ turn: 0, value: 56.3 }, { turn: 1, value: 54.8 }],
                modifiers: [],
                links: [{ label: "Economy", route: "economy" }],
              },
            ],
          },
        ],
      },
    });
    render(<NationPanel nation={nation} section="metrics" clock={CLOCK} />);

    const card = screen.getByRole("article", { name: longLabel });
    const heading = within(card).getByRole("heading", { name: longLabel });
    const row = heading.parentElement;
    expect(row).not.toBeNull();
    expect(row!.style.flexWrap).toBe("wrap");
    expect(row!.style.minWidth).toBe("0");
    expect(heading.style.minWidth).toBe("0");
    expect(heading.style.overflowWrap).toBe("anywhere");
    // Value and trend badge stay rendered (the value also appears in the
    // recorded-history list, so both instances must survive).
    expect(within(card).getAllByText("54.80%").length).toBeGreaterThan(0);
    expect(within(card).getByText(/▼/)).toBeInTheDocument();
  });

  it("contains long debt and policy titles without losing the badge at 320/390px", () => {
    // jsdom performs no layout, so the case asserts the shipped flex
    // containment contract around the real headers: the title is the flex
    // item that shrinks/wraps in place, while the badge keeps its own box
    // beside it. Unconstrained desktop widths render identically because the
    // wrap only engages under constraint. MetricCard headers are covered by
    // the sibling case above (PR #485) and are deliberately not duplicated
    // here.
    const longDebtTitle = "National Debt and Public Borrowing Obligations Authority";
    const longPolicyTitle =
      "Fair Labor Standards and Employment Security Administration Act";
    const nation = makeNation({
      budget: {
        ...makeNation().budget,
        labels: { ...makeNation().budget.labels, debtTitle: longDebtTitle },
        debt: { ...makeNation().budget.debt, creditRating: "AAA Stable" },
      },
      policy: {
        ...makeNation().policy,
        enacted: [
          { ...makeNation().policy.enacted[0], title: longPolicyTitle },
        ],
      },
    });

    const { unmount } = render(<NationPanel nation={nation} section="budget" clock={CLOCK} />);
    const debtTitle = screen.getByRole("heading", { name: longDebtTitle });
    expect(debtTitle.style.minWidth).toBe("0");
    expect(debtTitle.style.flex).toBe("1 1 auto");
    expect(debtTitle.style.overflowWrap).toBe("anywhere");
    const rating = screen.getByText("AAA Stable");
    expect(rating).toHaveClass("ahd-badge");
    expect(rating.style.flex).toBe("0 0 auto");
    expect(rating.style.whiteSpace).toBe("nowrap");
    // Data and desktop composition are unchanged: same row treatment,
    // badge text intact, debt figures still rendered.
    expect(screen.getByText("$100,000,000,000")).toBeInTheDocument();
    unmount();

    render(<NationPanel nation={nation} section="policy" clock={CLOCK} />);
    const law = screen.getByRole("article", { name: longPolicyTitle });
    const policyTitle = within(law).getByRole("heading", { name: longPolicyTitle });
    expect(policyTitle.style.overflowWrap).toBe("anywhere");
    const current = within(law).getByText("Current");
    expect(current).toHaveClass("ahd-badge");
    expect(current.style.flex).toBe("0 0 auto");
    expect(current.style.whiteSpace).toBe("nowrap");
    // Policy data/actions unchanged: option details still rendered.
    expect(within(law).getByText("National Standards")).toBeInTheDocument();
    expect(within(law).getByText("Broader coverage.")).toBeInTheDocument();
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

describe("NationPanel approval history chart (#385)", () => {
  it("charts recorded approval history with turns and an accessible data table", () => {
    render(<NationPanel nation={makeNation()} section="metrics" clock={CLOCK} />);

    const approval = screen.getByRole("article", { name: "Government approval" });
    const img = within(approval).getByRole("img", { name: /government approval trend/i });
    // Two recorded points produce two vertices and nothing invented.
    expect(img.querySelector('polyline[data-series="approval"]')!.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(2);
    const table = within(approval).getByRole("table", { name: /government approval trend data/i });
    expect(table).toHaveTextContent("Turn 0");
    expect(table).toHaveTextContent("56.30%");
    expect(table).toHaveTextContent("Turn 1");
    expect(table).toHaveTextContent("54.80%");
  });

  it("keeps the honest unavailable state when no approval history is recorded", () => {
    const nation = makeNation();
    const governance = nation.metrics.categories.find((category) => category.id === "governance")!;
    const empty = makeNation({
      metrics: {
        total: nation.metrics.total,
        categories: nation.metrics.categories.map((category) =>
          category.id === "governance"
            ? {
              ...category,
              metrics: category.metrics.map((metric) =>
                metric.id === "governance.approval" ? { ...metric, history: [] } : metric,
              ),
            }
            : category,
        ),
      },
    });
    expect(governance.metrics.some((metric) => metric.id === "governance.approval")).toBe(true);
    render(<NationPanel nation={empty} section="metrics" clock={CLOCK} />);

    const approval = screen.getByRole("article", { name: "Government approval" });
    expect(within(approval).getByText("No approval history recorded.")).toBeInTheDocument();
    expect(within(approval).queryByRole("img")).toBeNull();
  });

  it("renders a single recorded point as a marker, never an invented line", () => {
    const nation = makeNation({
      metrics: {
        total: 1,
        categories: [
          {
            id: "governance",
            label: "Governance",
            metrics: [
              {
                id: "governance.approval",
                category: "governance",
                label: "Government approval",
                value: 56.3,
                format: "percent",
                history: [{ turn: 0, value: 56.3 }],
                modifiers: [],
                links: [],
              },
            ],
          },
        ],
      },
    });
    render(<NationPanel nation={nation} section="metrics" clock={CLOCK} />);

    const approval = screen.getByRole("article", { name: "Government approval" });
    const img = within(approval).getByRole("img", { name: /government approval trend/i });
    expect(img.querySelector("polyline")).toBeNull();
    expect(img.querySelector('circle[data-point="approval-0"]')).not.toBeNull();
    expect(within(approval).getByText(/one recorded point/i)).toBeInTheDocument();
  });

  it("holds at 320px and 390px with touch-safe chart controls", () => {
    render(<NationPanel nation={makeNation()} section="metrics" clock={CLOCK} />);

    const approval = screen.getByRole("article", { name: "Government approval" });
    // No fixed pixel width anywhere in the card, so narrow phones cannot overflow.
    expect(approval.innerHTML).not.toMatch(/width:\s*\d+px/);
    expect(approval.innerHTML).not.toMatch(/min-width:\s*\d+(px|rem)/);
    expect(within(approval).getByRole("img", { name: /government approval trend/i })).toHaveAttribute("width", "100%");
    // The chart data disclosure stays usable by touch.
    const disclosure = within(approval).getByText("Chart data table");
    expect(disclosure.tagName.toLowerCase()).toBe("summary");
    expect((disclosure as HTMLElement).style.minHeight).toBe("44px");
  });
});
