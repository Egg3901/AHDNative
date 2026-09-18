import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ProfileRoute } from "./ProfileRoute";
import type { ProfileUpdate, ProfileView } from "../game/profileTypes";
import type { ImperialProfileView } from "../game/profileTypes";

const PROFILE: ProfileView = {
  name: "Ada Crane",
  bio: "Organizer from the north ward.",
  avatarUrl: null,
  campaignSongUrl: "",
  campaignSongAutoplay: false,
  country: { id: "US", name: "United States" },
  homeRegion: { id: "US-NY", name: "New York" },
  constituency: {
    eligible: false,
    officeType: null,
    regionId: null,
    selected: null,
    options: [],
    unavailableReason: "Constituency selection is available only to sitting UK Commons members and Prime Ministers.",
  },
  party: { id: "7", name: "Labor Caucus", color: "#2563eb", economicPosition: -2, socialPosition: 1 },
  office: "Councilor",
  officeDestination: { route: "legislature", id: "lower" },
  policies: { economic: -1.5, social: 2 },
  stats: { charisma: 7, debate: 4, energy: 6, fundraising: 5, businessAcumen: 4, statecraft: 5, intellect: 5 },
  demographics: { race: "white", gender: "female", education: "college", wealth: "middle" },
  profileHeaderUrl: null,
  careerHistory: [{ id: "race-1", office: "House", result: "Elected", turn: 12 }],
  achievements: [{ slug: "turn_one", name: "In at the Ground Floor", description: "Took an action in turn one" }],
  achievementProgress: { earned: 1, available: 3 },
  lockedAchievements: [
    { slug: "first_fundraise", name: "Passing the Hat", description: "Completed your first fundraise", progress: { current: 4, target: 10 } },
  ],
  unavailableAchievements: [
    { slug: "pollster", name: "Gallup's Ghost", description: "Commissioned 5 polls", blockingSystem: "polling/election polling" },
  ],
  resourceDetails: {
    actions: { base: 4, seat: 2, cabinet: 0, chair: 0, office: 2, party: 0, penalty: 0, threshold: 100, cap: 200, next: 9, refresh: 6 },
    funds: { enabled: true, base: 10000, donor: 500, office: 0, tax: 500, regularNet: 10000 },
    partyInfluence: null,
    nationalInfluence: { current: 0, gain: 0 },
    favorability: { current: 61, decayThreshold: 60, aboveThresholdDecay: 0.05, tierFloor: 50, tierCost: 7 },
    history: [
      { turn: 11, cash: 1000, savings: 300, funds: 5000 },
      { turn: 12, cash: 1200, savings: 300, funds: 5400 },
    ],
  },
  standing: {
    actions: 5,
    actionCap: 12,
    actionGain: 4,
    politicalInfluence: 32.5,
    nationalInfluence: null,
    favorability: 61,
    infamy: 4,
    partyInfluence: null,
  },
  finances: {
    currency: "USD",
    cash: 1200,
    savings: 300,
    funds: 5400,
    donorBaseLevel: 3,
    regularIncome: 150,
    donorIncome: 90,
  },
};

const IMPERIAL: ImperialProfileView = {
  id: "IMP-1",
  sequentialId: 7,
  name: "George",
  fullName: "King George",
  title: "King",
  country: { id: "UK", name: "United Kingdom" },
  royalHouse: "Windsor",
  bio: "Ceremonial head of state.",
  notice: "Imperial characters are created separately by an administrator on the live game; this offline career cannot create one.",
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    load: vi.fn(async () => PROFILE),
    revision: {},
    busy: false,
    onNavigate: vi.fn(),
    onUpdateProfile: vi.fn(async (_update: ProfileUpdate) => true),
    onSelectConstituency: vi.fn(async (_id: string) => true),
    ...overrides,
  };
}

describe("ProfileRoute bootstrap guard (#243)", () => {
  it("falls back to the ordinary profile when the imperial destination has no persisted identity, never a blank screen", async () => {
    const load = vi.fn(async () => PROFILE);
    const { container } = render(
      <ProfileRoute
        {...baseProps({ load, loadDestination: vi.fn(async () => "imperial" as const), loadImperial: vi.fn(async () => null) })}
      />,
    );
    await waitFor(() => expect(screen.getByText("Ada Crane")).toBeInTheDocument());
    expect(load).toHaveBeenCalled();
    expect(container.textContent).toContain("Ada Crane");
  });

  it("renders the imperial notice when marker and record resolve together", async () => {
    render(
      <ProfileRoute
        {...baseProps({ loadDestination: vi.fn(async () => "imperial" as const), loadImperial: vi.fn(async () => IMPERIAL) })}
      />,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "King George" })).toBeInTheDocument());
  });

  it("recovers through Retry after a failed profile load instead of stranding the route", async () => {
    const load = vi.fn(async () => PROFILE);
    load.mockRejectedValueOnce(new Error("Profile could not load."));
    render(<ProfileRoute {...baseProps({ load })} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /retry profile/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /retry profile/i }));
    await waitFor(() => expect(screen.getByText("Ada Crane")).toBeInTheDocument());
    expect(load).toHaveBeenCalledTimes(2);
  });
});
