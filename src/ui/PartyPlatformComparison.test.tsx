import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyPlatformComparison, type PartyPlatformPoint } from "./PartyPlatformComparison";

const PARTIES: PartyPlatformPoint[] = [
  {
    id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3333ff",
    economicPosition: -2, socialPosition: -1, isPlayerParty: true,
  },
  {
    id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#ff3333",
    economicPosition: 2, socialPosition: 2, isPlayerParty: false,
  },
];

describe("PartyPlatformComparison", () => {
  it("plots one compass marker per party from the real projected positions", () => {
    render(<PartyPlatformComparison parties={PARTIES} selectedId="US_DEM" onSelect={() => {}} />);
    const plot = screen.getByRole("img", { name: /political compass/i });
    expect(plot).toBeInTheDocument();
    // Text fallback names every party with its exact projected axes.
    expect(screen.getByText(/Democratic Party · economic -2\.0, social -1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Republican Party · economic 2\.0, social 2\.0/)).toBeInTheDocument();
  });

  it("renders a table fallback with bucket labels and exact values, and no invented metrics", () => {
    render(<PartyPlatformComparison parties={PARTIES} selectedId="US_DEM" onSelect={() => {}} />);
    const table = screen.getByRole("table", { name: /party platforms/i });
    const rows = within(table).getAllByRole("row");
    // Header + one row per party, nothing else.
    expect(rows).toHaveLength(3);
    expect(within(table).getByRole("columnheader", { name: /party/i })).toBeInTheDocument();
    expect(within(table).getByText(/Left \(-2\)/)).toBeInTheDocument();
    expect(within(table).getByText(/Right \(2\)/)).toBeInTheDocument();
    // No vote/share/strength figures are invented here: platform axes only.
    const section = screen.getByRole("region", { name: /party platform comparison/i });
    expect(within(section).queryByText(/vote/i)).toBeNull();
    expect(within(section).queryByText(/strength/i)).toBeNull();
    expect(within(section).queryByText(/%/)).toBeNull();
  });

  it("keeps every party mark and marks the selected party without dropping PartyMark", () => {
    const { container } = render(<PartyPlatformComparison parties={PARTIES} selectedId="US_DEM" onSelect={() => {}} />);
    const section = screen.getByRole("region", { name: /party platform comparison/i });
    // PartyMark initials render for both parties (chips + table).
    expect(container.querySelectorAll('[data-party-mark="DEM"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-party-mark="REP"]').length).toBeGreaterThan(0);
    expect(within(section).getAllByText("DEM").length).toBeGreaterThan(0);
    expect(within(section).getAllByText("REP").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /show democratic party detail/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /show republican party detail/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the detail selection through the one-tap party chips", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PartyPlatformComparison parties={PARTIES} selectedId="US_DEM" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /show republican party detail/i }));
    expect(onSelect).toHaveBeenCalledWith("US_REP");
  });

  it("renders nothing when the projection carries no parties", () => {
    const { container } = render(<PartyPlatformComparison parties={[]} selectedId="" onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("states the axis scale and the offline-marks note instead of inventing logos", () => {
    render(<PartyPlatformComparison parties={PARTIES} selectedId="US_DEM" onSelect={() => {}} />);
    expect(screen.getByText(/-5 to \+5/i)).toBeInTheDocument();
    expect(screen.getByText(/logo.*offline|offline.*logo/i)).toBeInTheDocument();
  });
});
