import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterCreationScreen } from "./CharacterCreationScreen";
import type { CharacterCreationScreenProps } from "../game/types";

const PARTIES = [
  { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3B82F6", logoUrl: null, economicPosition: -3, socialPosition: -2 },
  { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", logoUrl: null, economicPosition: 3, socialPosition: 2 },
];

function props(overrides: Partial<CharacterCreationScreenProps> = {}): CharacterCreationScreenProps {
  return {
    selection: { era: "1953", countryId: "US", countryName: "United States", regionNoun: "state" },
    regions: [{ id: "NY", name: "New York" }, { id: "CA", name: "California" }],
    initialName: "Eleanor Vance",
    initialHomeRegionId: "NY",
    choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state" },
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

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

describe("CharacterCreationScreen mobile presentation (#335)", () => {
  it("lists all six canonical sections in order with the active step marked", () => {
    render(<CharacterCreationScreen {...props()} />);
    const nav = screen.getByRole("navigation", { name: /Creation progress/i });
    expect(nav).toBeInTheDocument();
    const items = nav.querySelectorAll("li");
    expect(items).toHaveLength(6);
    const current = screen.getByRole("button", { name: "Current step, step 1 of 6: Country" });
    expect(current).toHaveAttribute("aria-current", "step");
    for (const label of ["The politician", "Home state", "Where you stand", "Party", "Stats"]) {
      const pending = screen.getByRole("button", { name: new RegExp(`Step \\d of 6: ${label}, not reached yet`) });
      expect(pending).toBeDisabled();
    }
  });

  it("keeps reached steps directly reachable and preserves answers across jumps", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    await completeBackground(user);
    await user.click(screen.getByRole("button", { name: /Continue to Home state/i }));
    expect(screen.getByRole("button", { name: /Go to step 2 of 6: The politician/ })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Go to step 1 of 6: Country/ }));
    expect(screen.getByRole("heading", { name: /^Country/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 6: Country");

    await user.click(screen.getByRole("button", { name: /Go to step 2 of 6: The politician/ }));
    expect(screen.getByRole("heading", { name: /The politician/ })).toBeInTheDocument();
    // The earlier background answers survived the round trip.
    expect(screen.getByRole("button", { name: "Female" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Continue to Home state/i })).toBeEnabled();
  });

  it("preserves step Back and the outer Back action at Country", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<CharacterCreationScreen {...props({ onBack })} />);

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    await user.click(screen.getByRole("button", { name: /Go to step 1 of 6: Country/ }));
    // Step Back from a jumped-to step still walks the reached history.
    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(screen.getByRole("heading", { name: /^Country/ })).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("never steals focus on mount", () => {
    render(<CharacterCreationScreen {...props()} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("moves keyboard focus to the new step heading with a live announcement", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    const politicianHeading = screen.getByRole("heading", { name: /The politician/ });
    expect(document.activeElement).toBe(politicianHeading);
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 6: The politician");

    // Keyboard-only jump: focus the reached step and press Enter.
    screen.getByRole("button", { name: /Go to step 1 of 6: Country/ }).focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /^Country/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 6: Country");
  });

  it.each([320, 390])("renders the full touch flow identically at a %dpx viewport", async (width) => {
    const user = userEvent.setup();
    setViewportWidth(width);
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);

    // Compact guards are structural (pure CSS, no viewport JS): a scrollable
    // six-step progress strip, wrapping stat rows and a sticky action bar.
    expect(document.querySelector(".ahd-creation-progress")).toBeInTheDocument();
    expect(document.querySelector(".ahd-creation-actions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review all details/i }));
    // Every canonical control is present at the compact width: media pickers
    // with their caps, the region select, compass sliders, party choices and
    // the stat allocator with its helpers.
    expect(screen.getByLabelText(/portrait/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/header/i)).toBeInTheDocument();
    expect(screen.getByText(/under 2 MB/)).toBeInTheDocument();
    expect(screen.getByText(/under 4 MB/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByLabelText(/Economic position/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Social position/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DEM Democratic Party" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Independent" })).toBeInTheDocument();
    expect(document.querySelectorAll(".ahd-creation-stat-row")).toHaveLength(7);
    expect(screen.getByRole("button", { name: /Spread evenly/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create character/i })).toBeInTheDocument();
    // No creation control carries an inline fixed pixel width that could force
    // horizontal overflow on a compact phone.
    for (const element of document.querySelectorAll(".ahd-screen button, .ahd-screen input, .ahd-screen select")) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the exact CharacterCreation record through the touch flow", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    await completeBackground(user);
    await user.click(screen.getByRole("button", { name: /Continue to Home state/i }));
    await user.selectOptions(screen.getByRole("combobox"), "CA");
    await user.click(screen.getByRole("button", { name: /Continue to Where you stand/i }));
    fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Social position/), { target: { value: "-1" } });
    await user.click(screen.getByRole("button", { name: /Continue to Party/i }));
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Continue to Stats/i }));
    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    await user.click(screen.getByRole("button", { name: /Create character/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      name: "Eleanor Vance",
      homeRegionId: "CA",
      partyId: "US_DEM",
      policies: { economic: 1, social: -1 },
      demographics: { race: "white", gender: "female", education: "college", wealth: "middle" },
      stats: {
        charisma: 4,
        debate: 4,
        energy: 4,
        fundraising: 4,
        businessAcumen: 4,
        statecraft: 4,
        intellect: 4,
      },
      avatarUrl: null,
      profileHeaderUrl: null,
    });
  });
});
