/**
 * Nation overview hero imagery (slice of #143).
 *
 * Rendered contract for the Nation surfaces (`NationPanel` economy/budget/
 * policy/metrics): the approved offline
 * `public/static/heroes/us-overview-mount-rushmore.webp` (byte-identical to
 * AHDGame, SHA-256
 * `208e3eadeb480c0e5d26673c1e34db3af29e25e3906b1b91b9e8a44aa90e3a19`)
 * renders above the unchanged nation hierarchy via the shared `RouteHero`
 * (reference image-error gradient fallback, 172px phones to 220px wider
 * screens). Countries without a bundled overview hero fall back to the
 * existing `actions.webp`. No remote/CDN source is used and no flag
 * thumbnail is ported (flags stay tracked in #373).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NationPanel } from "./NationPanel";
import { nationOverviewHero } from "./RouteHero";
import type { NationView } from "../game/nation";

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
      macroHistory: [],
      primeRateHistory: [],
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
      links: [],
      taxRates: [],
      revenue: { components: [], total: 0 },
      spending: { categories: [], stateGrants: 0, debtInterest: 0, total: 0, transfers: [] },
      debt: {
        principal: 0,
        interestRate: 0,
        ceiling: 0,
        debtToGdpRatio: 0,
        creditRating: "AA",
      },
      surplus: 0,
      treasuryBalance: 0,
    },
    metrics: { total: 0, categories: [] },
    policy: { taxRates: [], enacted: [] },
    ...overrides,
  };
}

describe("Nation overview hero", () => {
  it("resolves the bundled US overview hero and falls back for other countries", () => {
    expect(nationOverviewHero("US")).toBe("/static/heroes/us-overview-mount-rushmore.webp");
    expect(nationOverviewHero("XX")).toBe("/static/heroes/actions.webp");
  });

  it("ships the byte-identical offline asset", () => {
    const bytes = readFileSync("public/static/heroes/us-overview-mount-rushmore.webp");
    expect(bytes.length).toBeGreaterThan(0);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "208e3eadeb480c0e5d26673c1e34db3af29e25e3906b1b91b9e8a44aa90e3a19",
    );
  });

  it("renders the overview photo above the unchanged economy hierarchy", () => {
    render(<NationPanel nation={makeNation()} section="economy" clock={CLOCK} />);
    const hero = screen.getByRole("img", { name: "United States national overview" });
    expect(hero).toHaveAttribute("src", "/static/heroes/us-overview-mount-rushmore.webp");
    expect(screen.getByRole("heading", { name: "Economy" })).toBeInTheDocument();
  });

  it("falls back to actions art when no overview hero is bundled", () => {
    render(
      <NationPanel
        nation={makeNation({ countryId: "XX", countryName: "Nowhereland" })}
        section="budget"
        clock={CLOCK}
      />,
    );
    expect(screen.getByRole("img", { name: "Nowhereland national overview" })).toHaveAttribute(
      "src",
      "/static/heroes/actions.webp",
    );
    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
  });

  it("keeps the reference image-error gradient fallback", () => {
    render(<NationPanel nation={makeNation()} section="economy" clock={CLOCK} />);
    const hero = screen.getByRole("img", { name: "United States national overview" });
    fireEvent.error(hero);
    expect(screen.queryByRole("img", { name: "United States national overview" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Economy" })).toBeInTheDocument();
  });
});
