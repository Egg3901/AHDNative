import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { ProfilePanel } from "./ProfilePanel";
import { HelpPanel } from "./HelpPanel";
import type { ProfileView } from "../game/profileTypes";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-onboarding-48", playerName: "Alex" };
const SAVED_AT = "2026-09-15T00:00:00.000Z";

describe("profile onboarding through the saved game session (#48)", () => {
  it("starts with four undone save-scoped steps and an undismissed tutorial", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const profile = session.profile();
    expect(profile.onboarding.dismissed).toBe(false);
    expect(profile.onboarding.total).toBe(4);
    expect(profile.onboarding.completedCount).toBe(0);
    expect(profile.onboarding.steps.map((step) => step.id)).toEqual([
      "join-party", "first-action", "file-for-race", "grow-resources",
    ]);
    expect(profile.onboarding.steps.every((step) => step.done === false)).toBe(true);
    expect(profile.tutorial.dismissed).toBe(false);
  });

  it("completes join-party and first-action from live state and keeps them across save/reload", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const partyId = session.view().parties[0]?.id;
    expect(partyId).toBeTruthy();
    expect(session.act("joinParty", { partyId: partyId! })).toMatchObject({ ok: true });
    expect(session.profile().onboarding.steps.find((step) => step.id === "join-party")?.done).toBe(true);
    expect(session.act("convertCash", { amount: 10_000 })).toMatchObject({ ok: true });
    expect(session.act("buildDonorBase")).toMatchObject({ ok: true });
    const profile = session.profile();
    expect(profile.onboarding.steps.find((step) => step.id === "first-action")?.done).toBe(true);
    expect(profile.onboarding.steps.find((step) => step.id === "grow-resources")?.done).toBe(true);
    expect(profile.onboarding.completedCount).toBe(3);

    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    expect(loaded.profile().onboarding).toEqual(profile.onboarding);
    const resumed = new GameSession();
    resumed.load(loaded.serialize(SAVED_AT));
    expect(resumed.profile().onboarding.completedCount).toBe(3);
  });

  it("persists onboarding and tutorial dismissal per save and rejects invalid patches atomically", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const before = session.serialize(SAVED_AT);
    expect(() => session.updateProfile({ onboardingDismissed: "yes" as unknown as boolean })).toThrow();
    expect(session.serialize(SAVED_AT)).toBe(before);
    session.updateProfile({ onboardingDismissed: true, tutorialDismissed: true });
    expect(session.profile().onboarding.dismissed).toBe(true);
    expect(session.profile().tutorial.dismissed).toBe(true);

    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    expect(loaded.profile().onboarding.dismissed).toBe(true);
    expect(loaded.profile().tutorial.dismissed).toBe(true);

    // Legacy saves without the flags load as not dismissed; no migration needed.
    const raw = JSON.parse(before) as { world: { player: Record<string, unknown> } };
    delete raw.world.player.onboardingDismissed;
    delete raw.world.player.tutorialDismissed;
    const legacy = new GameSession();
    legacy.load(JSON.stringify(raw));
    expect(legacy.profile().onboarding.dismissed).toBe(false);
    expect(legacy.profile().tutorial.dismissed).toBe(false);
  });
});

function fixture(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    name: "Alex",
    bio: "",
    avatarUrl: null,
    campaignSongUrl: "",
    campaignSongAutoplay: false,
    country: { id: "US", name: "United States" },
    homeRegion: { id: "US-NY", name: "New York" },
    constituency: {
      eligible: false, officeType: null, regionId: null, selected: null, options: [],
      unavailableReason: "Constituency selection is available only to sitting UK Commons members.",
    },
    party: null,
    office: null,
    officeDestination: null,
    onboarding: {
      dismissed: false,
      completedCount: 0,
      total: 4,
      steps: [
        { id: "join-party", title: "Join a party", body: "Pick one that fits.", route: "parties", done: false },
        { id: "first-action", title: "Take your first action", body: "Acts save automatically.", route: "actions", done: false },
        { id: "file-for-race", title: "File for a race", body: "Then run for office.", route: "elections", done: false },
        { id: "grow-resources", title: "Grow your resources", body: "Either clears this step.", route: "portfolio", done: false },
      ],
    },
    tutorial: { dismissed: false },
    policies: null,
    stats: { charisma: 7, debate: 4, energy: 6, fundraising: 5, businessAcumen: 4, statecraft: 5, intellect: 5 },
    demographics: null,
    profileHeaderUrl: null,
    careerHistory: [],
    achievements: [],
    achievementProgress: { earned: 0, available: 0 },
    lockedAchievements: [],
    unavailableAchievements: [],
    resourceDetails: {
      actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, party: 0, penalty: 0, threshold: 100, cap: 200, next: 4, refresh: 4 },
      funds: { enabled: true, base: 0, donor: 0, office: 0, tax: 0, regularNet: 0 },
      partyInfluence: null,
      nationalInfluence: { current: 0, gain: 0 },
      favorability: { current: 50, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 50, tierCost: 7 },
      history: [],
    },
    standing: {
      actions: 4, actionCap: 200, actionGain: 0, politicalInfluence: 0,
      nationalInfluence: 0, favorability: 50, infamy: 0, partyInfluence: 0,
    },
    finances: { currency: "USD", cash: 100, savings: 0, funds: 0, donorBaseLevel: 0, regularIncome: 0, donorIncome: 0 },
    ...overrides,
  };
}

describe("profile onboarding prompts at phone width (#48)", () => {
  it.each([320, 390])("shows Getting started and Tutorial near the top at %dpx", (width) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    render(
      <ProfilePanel
        profile={fixture()}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={vi.fn(async () => true)}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    const sections = Array.from(document.querySelectorAll(".ahd-profile > section"))
      .map((node) => node.getAttribute("aria-label"));
    expect(sections.slice(0, 4)).toEqual(["Character", "Constituency", "Getting started", "Tutorial"]);
    expect(screen.getByText("0 of 4 steps complete")).toBeInTheDocument();
  });

  it("dismisses the checklist into persisted state and opens reachable step destinations", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onUpdateProfile = vi.fn(async () => true);
    render(
      <ProfilePanel
        profile={fixture()}
        busy={false}
        onNavigate={onNavigate}
        onUpdateProfile={onUpdateProfile}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Join a party, step 1 of 4" }));
    expect(onNavigate).toHaveBeenCalledWith("parties");
    await user.click(screen.getByRole("button", { name: "Dismiss checklist" }));
    expect(onUpdateProfile).toHaveBeenCalledWith({ onboardingDismissed: true });
  });

  it("opens the tutorial from the replay prompt and keeps a replay link after dismissal", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onUpdateProfile = vi.fn(async () => true);
    const { rerender } = render(
      <ProfilePanel
        profile={fixture()}
        busy={false}
        onNavigate={onNavigate}
        onUpdateProfile={onUpdateProfile}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    await user.click(screen.getByRole("button", { name: /open tutorial/i }));
    expect(onNavigate).toHaveBeenCalledWith("help");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onUpdateProfile).toHaveBeenCalledWith({ tutorialDismissed: true });

    rerender(
      <ProfilePanel
        profile={fixture({ tutorial: { dismissed: true } })}
        busy={false}
        onNavigate={onNavigate}
        onUpdateProfile={onUpdateProfile}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    expect(screen.getByRole("button", { name: /replay tutorial/i })).toBeInTheDocument();
  });

  it("shows wired stat effects and names unwired stats honestly", () => {
    render(
      <ProfilePanel
        profile={fixture()}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={vi.fn(async () => true)}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    const card = screen.getByRole("region", { name: "Character stats" });
    expect(within(card).getByText(/scales campaign, advertise and canvass/i)).toBeInTheDocument();
    expect(within(card).getAllByText("No local effect yet in this build.")).toHaveLength(2);
    expect(within(card).getByText(/reallocation is not available yet/i)).toBeInTheDocument();
  });

  it("hides the checklist once dismissed or complete", () => {
    const done = fixture();
    done.onboarding.steps = done.onboarding.steps.map((step) => ({ ...step, done: true }));
    done.onboarding.completedCount = 4;
    const { rerender } = render(
      <ProfilePanel
        profile={fixture({ onboarding: { ...done.onboarding, dismissed: true } })}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={vi.fn(async () => true)}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    rerender(
      <ProfilePanel
        profile={done}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={vi.fn(async () => true)}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
  });

  it("renders a tutorial flow whose chapters all reach existing destinations", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<HelpPanel onNavigate={onNavigate} />);
    expect(screen.getByRole("heading", { name: "Tutorial" })).toBeInTheDocument();
    const buttons = within(screen.getByText("Tutorial").closest("section")!).getAllByRole("button");
    expect(buttons).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: "Open home region" }));
    expect(onNavigate).toHaveBeenCalledWith("state");
  });
});
