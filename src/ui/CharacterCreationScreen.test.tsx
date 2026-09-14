import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterCreationScreen } from "./CharacterCreationScreen";
import type { CharacterCreationScreenProps } from "../game/types";

const PARTIES = [
  { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3B82F6", economicPosition: -3, socialPosition: -2 },
  { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", economicPosition: 3, socialPosition: 2 },
];

function props(overrides: Partial<CharacterCreationScreenProps> = {}): CharacterCreationScreenProps {
  return {
    selection: { era: "1953", countryId: "US", countryName: "United States", regionNoun: "state" },
    regions: [{ id: "NY", name: "New York" }, { id: "CA", name: "California" }],
    initialName: "Eleanor Vance",
    initialHomeRegionId: "NY",
    choices: { parties: PARTIES, isOnePartyState: false, imperialEligible: false, regionNoun: "state" },
    loading: false,
    busy: false,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

async function completeBackground(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Female" }));
  await user.click(screen.getByRole("button", { name: "White" }));
  await user.click(screen.getByRole("button", { name: "College" }));
  await user.click(screen.getByRole("button", { name: "Middle Income" }));
}

describe("CharacterCreationScreen reference flow (#242)", () => {
  it("renders the six reference steps in order with their labels", () => {
    render(<CharacterCreationScreen {...props()} />);
    // The reference step order and titles: Country, The politician, Home state,
    // Where you stand, Party, Stats.
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
    for (const label of ["Country", "The politician", "Home state", "Where you stand", "Party", "Stats"]) {
      expect(headings.some((h) => h.includes(label))).toBe(true);
    }
    const regionStep = screen.getByRole("heading", { name: /Home state/ });
    const compassStep = screen.getByRole("heading", { name: /Where you stand/ });
    expect(regionStep.compareDocumentPosition(compassStep)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("requires a deliberate party choice and a full stat allocation before submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);
    const submit = screen.getByRole("button", { name: /Create character|Finish/i });
    await user.type(screen.getByLabelText(/Name/i), "Eleanor Vance");
    await completeBackground(user);
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const creation = onSubmit.mock.calls[0]![0];
    expect(creation.policies).toEqual({ economic: -3, social: -2 });
    expect(creation.demographics).toMatchObject({ race: expect.any(String), gender: expect.any(String) });
    const total = Object.values(creation.stats as Record<string, number>).reduce((s, v) => s + v, 0);
    expect(total).toBe(28);
  });

  it("blocks submit until all stat points are allocated", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);
    await user.type(screen.getByLabelText(/Name/i), "Eleanor Vance");
    await completeBackground(user);
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Create character|Finish/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/allocate all .*remaining stat point/i)).toBeInTheDocument();
  });

  it("shows the one-party briefing for a one-party country instead of a generic party list", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "RU", countryName: "Soviet Union", regionNoun: "region" },
      choices: { parties: [{ id: "RU_CPSU", name: "Communist Party", abbreviation: "CPSU", color: "#CC0000", economicPosition: -4, socialPosition: 2 }], isOnePartyState: true, imperialEligible: false, regionNoun: "region" },
    })} />);
    expect(screen.getByText(/one-party state/i)).toBeInTheDocument();
  });

  it("shows the imperial notice for an imperial-eligible country", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "UK", countryName: "United Kingdom", regionNoun: "region" },
      choices: { parties: PARTIES, isOnePartyState: false, imperialEligible: true, regionNoun: "region" },
    })} />);
    expect(screen.getByText(/imperial/i)).toBeInTheDocument();
  });
});
