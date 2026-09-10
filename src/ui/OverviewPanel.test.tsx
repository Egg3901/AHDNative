import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewPanel, type OverviewPanelProps } from "./OverviewPanel";
type OverviewWorld = OverviewPanelProps["world"];
function makeWorld(overrides: Partial<OverviewWorld> = {}): OverviewWorld {
  return {
    turn: 12,
    date: "January 1861",
    era: "Civil War",
    countryName: "United States",
    player: {
      name: "A. Player",
      cash: 1234.5,
      funds: 98765,
      actions: 4,
      influence: 12.5,
      favorability: 48.2,
      partyName: "Republican",
    },
    legislature: { office: "Senator" },
    finance: { currency: "USD" },
    metrics: [
      { id: "gdp", label: "GDP", value: 123456789, format: "money" },
      { id: "approval", label: "Approval", value: 0.523, format: "percent" },
      { id: "population", label: "Population", value: 31415926, format: "number" },
    ],
    ...overrides,
  };
}

describe("OverviewPanel player flow", () => {
  it("preserves identity, office, resources, and world context", () => {
    render(<OverviewPanel world={makeWorld()} onNavigate={() => undefined} />);
    expect(screen.getByText("A. Player")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "Republican · Senator")).toBeInTheDocument();
    expect(screen.getByText("$1,234.50")).toBeInTheDocument();
    expect(screen.getByText("$98,765.00")).toBeInTheDocument();
    expect(screen.getByText("12.5")).toBeInTheDocument();
    expect(screen.getByText("48.2")).toBeInTheDocument();
    expect(screen.getByText(/United States/)).toBeInTheDocument();
    expect(screen.getByText(/Civil War/)).toBeInTheDocument();
    expect(screen.getByText(/Turn 12/)).toBeInTheDocument();
    expect(screen.getByText(/January 1861/)).toBeInTheDocument();
  });

  it("shows exact full metric values", () => {
    render(<OverviewPanel world={makeWorld()} onNavigate={() => undefined} />);
    expect(screen.getByText("GDP")).toBeInTheDocument();
    expect(screen.getByText("$123,456,789")).toBeInTheDocument();
    expect(screen.getByText("$123.5M")).toBeInTheDocument();
    expect(screen.getByText("52.3%")).toBeInTheDocument();
    expect(screen.getByText("31,415,926")).toBeInTheDocument();
  });

  it("keeps engine GDP units distinct from local player balances", () => {
    const world = makeWorld();
    world.finance.currency = "GBP";
    render(<OverviewPanel world={world} onNavigate={vi.fn()} />);
    expect(screen.getByText("£1,234.50")).toBeInTheDocument();
    expect(screen.getByText("$123,456,789")).toBeInTheDocument();
  });

  it("links to real destinations and never ends the turn", () => {
    const onNavigate = vi.fn();
    render(<OverviewPanel world={makeWorld()} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /action/i }));
    fireEvent.click(screen.getByRole("button", { name: /election/i }));
    fireEvent.click(screen.getByRole("button", { name: /economy/i }));
    fireEvent.click(screen.getByRole("button", { name: /region/i }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, "actions");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "elections");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "economy");
    expect(onNavigate).toHaveBeenNthCalledWith(4, "regions");
    expect(screen.queryByRole("button", { name: /end turn/i })).toBeNull();
  });

  it("retains no seat and empty metric states", () => {
    const world = makeWorld({
      legislature: { office: null },
      metrics: [],
    });
    render(<OverviewPanel world={world} onNavigate={() => undefined} />);
    expect(screen.getByText((_, el) => el?.textContent === "Republican · No legislative seat")).toBeInTheDocument();
    expect(screen.getByText("No metrics for this world.")).toBeInTheDocument();
  });
});
