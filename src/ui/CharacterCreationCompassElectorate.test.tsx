import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CharacterCreationScreen } from "./CharacterCreationScreen";
import type { CharacterCreationScreenProps } from "../game/types";

const PARTIES = [
  { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3B82F6", logoUrl: null, economicPosition: -3, socialPosition: -2 },
  { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", logoUrl: null, economicPosition: 3, socialPosition: 2 },
];

// California carries a derived lean; New York has none yet, matching the
// engine's null-lean display contract ("Lean not yet derived").
const HOME_REGIONS = [
  { id: "NY", name: "New York", population: null, electorateLean: null, seeded: false },
  { id: "CA", name: "California", population: 10672500, electorateLean: { economic: -1, social: -1 }, seeded: true },
];

function props(overrides: Partial<CharacterCreationScreenProps> = {}): CharacterCreationScreenProps {
  return {
    selection: { era: "1953", countryId: "US", countryName: "United States", regionNoun: "state" },
    regions: [{ id: "NY", name: "New York" }, { id: "CA", name: "California" }],
    initialName: "Eleanor Vance",
    initialHomeRegionId: "CA",
    choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state", homeRegions: HOME_REGIONS },
    loading: false,
    busy: false,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

function openReviewAll() {
  fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
}

describe("creation compass electorate row (#242 CompassLegend parity)", () => {
  it("names the home electorate and waits for the compass before measuring", () => {
    render(<CharacterCreationScreen {...props()} />);
    openReviewAll();
    const row = screen.getByTestId("creation-electorate-distance");
    expect(row).toHaveTextContent("California electorate:");
    expect(row).toHaveTextContent("move either slider to measure the distance.");
    expect(row).not.toHaveTextContent("away");
  });

  it("measures the home-electorate distance with the reference band once answered", () => {
    render(<CharacterCreationScreen {...props()} />);
    openReviewAll();
    // Pin at (1, -1) against the (-1, -1) lean: hypot(2, 0) = 2.0, band "close".
    fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Social position/), { target: { value: "-1" } });
    const row = screen.getByTestId("creation-electorate-distance");
    expect(row).toHaveTextContent("California electorate:");
    expect(row).toHaveTextContent("2.0 away (Close)");
  });

  it("states an underived lean honestly instead of measuring zero", () => {
    render(<CharacterCreationScreen {...props({ initialHomeRegionId: "NY" })} />);
    openReviewAll();
    fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "1" } });
    const row = screen.getByTestId("creation-electorate-distance");
    expect(row).toHaveTextContent("New York electorate:");
    expect(row).toHaveTextContent("lean not yet derived");
    expect(row).not.toHaveTextContent("away");
  });

  it("falls back to the reference pick-a-home prompt when no region exists", () => {
    render(<CharacterCreationScreen {...props({
      regions: [],
      initialHomeRegionId: undefined,
      choices: { parties: [], rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state", homeRegions: [] },
    })} />);
    openReviewAll();
    expect(screen.getByTestId("creation-electorate-distance")).toHaveTextContent(
      "Pick a home state to plot its electorate.",
    );
  });

  it.each([320, 390])("keeps the electorate row wrapping-safe at a %dpx phone width", (width) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    render(<CharacterCreationScreen {...props()} />);
    openReviewAll();
    const row = screen.getByTestId("creation-electorate-distance");
    // Structural guard (jsdom has no layout): the row carries no inline fixed
    // pixel width or nowrap that could force horizontal overflow on a compact
    // phone, matching the existing creation compact-width guards.
    expect((row as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    expect((row as HTMLElement).style.whiteSpace).not.toBe("nowrap");
    expect(screen.getByLabelText(/Economic position/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Social position/)).toBeInTheDocument();
  });
});
