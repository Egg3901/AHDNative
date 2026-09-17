import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STAT_FREE_POINTS } from "@ahdclient/engine";
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

async function openDirectReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Review all details/i }));
}

async function reachStep(user: ReturnType<typeof userEvent.setup>, step: 3 | 4 | 5 | 6) {
  await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
  await completeBackground(user);
  await user.click(screen.getByRole("button", { name: /Continue to Home state/i }));
  if (step === 3) return;
  await user.click(screen.getByRole("button", { name: /Continue to Where you stand/i }));
  if (step === 4) return;
  fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText(/Social position/), { target: { value: "-1" } });
  await user.click(screen.getByRole("button", { name: /Continue to Party/i }));
  if (step === 5) return;
  await user.click(screen.getByRole("button", { name: "REP Republican Party" }));
  await user.click(screen.getByRole("button", { name: /Continue to Stats/i }));
}

describe("CharacterCreationScreen phone-first refinement (#242)", () => {
  it("shows a country summary card with era, home options and party count", () => {
    render(<CharacterCreationScreen {...props()} />);
    const card = screen.getByTestId("creation-country-card");
    expect(card).toHaveTextContent("United States");
    expect(card).toHaveTextContent("1953");
    expect(card).toHaveTextContent("2 states");
    expect(card).toHaveTextContent("Parties");
  });

  it("guides each step with a hint that names what still blocks Continue", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);
    expect(screen.getByTestId("creation-step-hint")).toHaveTextContent(/set in world setup/i);

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    const hint = screen.getByTestId("creation-step-hint");
    expect(hint).toHaveTextContent("Still to choose: Gender, Race, Education, Wealth.");
    expect(screen.getByRole("button", { name: /Continue to Home state/i })).toBeDisabled();

    await completeBackground(user);
    expect(hint).toHaveTextContent("Politician details complete.");
    expect(screen.getByRole("button", { name: /Continue to Home state/i })).toBeEnabled();
  });

  it("tracks background progress and the name length without changing the rules", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props({ initialName: "" })} />);
    await openDirectReview(user);
    expect(screen.getByTestId("background-progress")).toHaveTextContent("Background: 0 of 4 chosen");
    expect(screen.getByText("0 of 80 characters. At least two to continue.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Female" }));
    expect(screen.getByTestId("background-progress")).toHaveTextContent("Background: 1 of 4 chosen");
    expect(screen.getByTestId("background-progress")).toHaveTextContent("Race");
  });

  it("chooses the home region through the electorate-aware picker without losing the choice", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);
    await reachStep(user, 3);
    const group = screen.getByRole("radiogroup", { name: /Home state/i });
    expect(screen.getByPlaceholderText("Filter 2 states…")).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /New York/ })).toHaveAttribute("aria-checked", "true");
    await user.click(within(group).getByRole("radio", { name: /California/ }));
    expect(within(group).getByRole("radio", { name: /California/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Continue to Where you stand/i })).toBeEnabled();
  });

  it("answers the compass with keyboard steppers that mark the step complete", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);
    await reachStep(user, 4);
    expect(screen.getByTestId("creation-step-hint")).toHaveTextContent(/move either slider/i);
    expect(screen.getByRole("button", { name: /Continue to Party/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Increase Economic" }));
    expect(screen.getByTestId("creation-economic-value")).toHaveTextContent("+1");
    expect(screen.getByTestId("creation-step-hint")).toHaveTextContent(/position set/i);
    expect(screen.getByRole("button", { name: /Continue to Party/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Decrease Social" }));
    expect(screen.getByTestId("creation-social-value")).toHaveTextContent("-1");
  });

  it("measures each party platform against the answered compass and names the best match", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);
    await reachStep(user, 5);
    // Position (1, -1) sits closer to REP (3, 2) than to DEM (-3, -2).
    const dem = screen.getByRole("button", { name: "DEM Democratic Party" });
    const rep = screen.getByRole("button", { name: "REP Republican Party" });
    expect(dem).toHaveTextContent("4.1 away");
    expect(rep).toHaveTextContent("3.6 away");
    expect(within(rep).getByText("Best match")).toBeInTheDocument();
    expect(within(dem).queryByText("Best match")).not.toBeInTheDocument();

    await user.click(rep);
    expect(rep).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("creation-step-hint")).toHaveTextContent("Party choice recorded.");
  });

  it("shows no platform distances before the compass is answered", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);
    await openDirectReview(user);
    expect(screen.queryByText(/away/)).not.toBeInTheDocument();
    expect(screen.queryByText("Best match")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REP Republican Party" })).toHaveTextContent("REP");
  });

  it("tracks stat spending with a progressbar using the same budget", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);
    await openDirectReview(user);
    const meter = screen.getByRole("progressbar", { name: /Stat points spent/i });
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect(meter).toHaveAttribute("aria-valuemax", String(STAT_FREE_POINTS));

    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    expect(screen.getByRole("progressbar", { name: /Stat points spent/i })).toHaveAttribute("aria-valuenow", String(STAT_FREE_POINTS));
    expect(screen.getByTestId("creation-step-hint")).toHaveTextContent("Reviewing all six sections");
  });

  it.each([320, 390])("keeps every refined control reachable at a %dpx viewport", async (width) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    window.dispatchEvent(new Event("resize"));
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);
    await openDirectReview(user);

    expect(screen.getByTestId("creation-country-card")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByTestId("background-progress")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /Home state/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Filter 2 states/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease Economic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase Social" })).toBeInTheDocument();
    expect(screen.getByTestId("creation-economic-value")).toBeInTheDocument();
    expect(document.querySelectorAll(".ahd-creation-party-card")).toHaveLength(3);
    expect(screen.getByRole("progressbar", { name: /Stat points spent/i })).toBeInTheDocument();
    expect(screen.getByTestId("creation-step-hint")).toBeInTheDocument();
    expect(document.querySelectorAll(".ahd-creation-stat-row")).toHaveLength(7);

    for (const element of document.querySelectorAll(".ahd-screen button, .ahd-screen input, .ahd-screen select")) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
  });
});
