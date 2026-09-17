import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { WorldPanel } from "./WorldPanel";
import type { WorldOverviewView } from "../game/worldOverview";

// Unbroken on purpose: no spaces, so only the row containment keeps it
// inside a 320px viewport next to its badges.
const LONG_NAME = `Filingopen:${"X".repeat(220)}`;

function makeOverview(): WorldOverviewView {
  const base = {
    era: "1953",
    turn: 4,
    date: "1953-02-03",
    playerCountryId: "US",
    playerHomeRegionId: "CA",
  } as const;
  return {
    ...base,
    nations: [
      {
        id: "US",
        name: "United States",
        playable: true,
        currency: "USD",
        economy: {
          gdpMillions: 387_000,
          growthRate: 0.046,
          inflationRate: 0.0075,
          unemploymentRate: 0.029,
          outputGap: -1.25,
        },
        government: {
          governmentType: "Presidential republic",
          regime: "presidential-republic",
          approval: 56.3,
          legitimacy: 38.5,
          unrest: 8.9,
          status: null,
          formationType: null,
          confidence: null,
          governingParty: null,
          headOfGovernment: null,
          executive: null,
          legislature: null,
        },
      },
      {
        id: "LN",
        name: LONG_NAME,
        playable: false,
        currency: "LNX",
        economy: {
          gdpMillions: 1_000,
          growthRate: 0.01,
          inflationRate: 0.02,
          unemploymentRate: 0.03,
          outputGap: 0,
        },
        government: {
          governmentType: null,
          regime: null,
          approval: null,
          legitimacy: null,
          unrest: null,
          status: null,
          formationType: null,
          confidence: null,
          governingParty: null,
          headOfGovernment: null,
          executive: null,
          legislature: null,
        },
      },
    ],
    homeRegion: null,
  };
}

/**
 * Long-name/badge/action row containment for the Nations directory at
 * 320/390px.
 *
 * Each directory row is a two-column flex line (name block + badge group).
 * The badge group must be a shrinkable flex item (min-width 0 with wrap) and
 * the name block must take the free space (flex grow + min-width 0 with
 * anywhere wrapping), or a long name forces the row — and its View action,
 * which is the row itself — past a 320px viewport. jsdom performs no layout,
 * so these cases pin the shipped containment styles plus that selection and
 * navigation still work through the long-name row. Nothing here is
 * physical-device evidence.
 */
describe("world panel long-name row containment", () => {
  it("keeps a long nation name inside the directory row next to its badges", () => {
    render(<WorldPanel overview={makeOverview()} section="nations" initialId="LN" />);

    fireEvent.click(screen.getByText("Browse nations"));
    const row = screen.getByRole("button", { name: `View ${LONG_NAME} details` });
    // The row itself is the View action: it stays a full-width 44px+ target.
    expect(row).toHaveStyle({ width: "100%", minHeight: "3.1rem" });
    expect(row).toHaveStyle({ justifyContent: "space-between" });

    const nameBlock = row.firstElementChild as HTMLElement;
    expect(nameBlock).toHaveStyle({ minWidth: "0", flex: "1 1 auto" });
    expect(within(row).getByText(LONG_NAME)).toHaveStyle({ overflowWrap: "anywhere" });

    const badges = within(row).getByText("Not playable").closest("span")?.parentElement as HTMLElement;
    expect(badges).toHaveStyle({ minWidth: "0", flexWrap: "wrap" });
    expect(within(row).getByText("Viewing")).toBeInTheDocument();
    expect(within(row).getByText("Not playable")).toBeInTheDocument();
  });

  it("keeps selection and navigation working through the long-name row", () => {
    const onSelectNation = vi.fn();
    const onNavigate = vi.fn();
    render(
      <WorldPanel
        overview={makeOverview()}
        section="nations"
        onSelectNation={onSelectNation}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByText("Browse nations"));
    fireEvent.click(screen.getByRole("button", { name: `View ${LONG_NAME} details` }));

    // Selecting the row only re-points the browse context and closes the
    // directory, exactly as with short names.
    expect(onSelectNation).toHaveBeenCalledWith("LN");
    expect(screen.getByText("Browse nations").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: LONG_NAME })).toBeVisible();
    expect(screen.getByText("No government record.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `Open ${LONG_NAME} in World map` }));
    expect(onNavigate).toHaveBeenCalledWith("worldMap");
  });

  it("keeps the long-name detail header inside the card next to its badges", () => {
    render(<WorldPanel overview={makeOverview()} section="nations" initialId="LN" />);

    const detail = screen.getByRole("article", { name: LONG_NAME });
    // The flag mark sits beside a stacked name/code block inside the flex
    // name block, so the heading is one div deeper than before that change.
    const heading = screen.getByRole("heading", { name: LONG_NAME });
    const header = heading.closest("div")?.parentElement?.parentElement as HTMLElement;
    expect(header).toHaveStyle({ justifyContent: "space-between" });
    const nameBlock = heading.closest("div")?.parentElement as HTMLElement;
    expect(nameBlock).toHaveStyle({ minWidth: "0", flex: "1 1 auto" });
    const badges = within(detail).getByText("Not playable").closest("span")?.parentElement as HTMLElement;
    expect(badges).toHaveStyle({ minWidth: "0" });
    expect(within(detail).getByText("Viewing")).toBeInTheDocument();
  });
});
