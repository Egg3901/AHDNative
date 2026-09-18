/**
 * Profile onboarding/tutorial acceptance (#48).
 *
 * Rendered tests against the real ProfilePanel: the getting-started and
 * guided-tour prompts sit after the constituency card with readable copy and
 * real-destination links, dismiss/complete/replay persist through
 * onUpdateProfile, and resolved or inapplicable prompts stay hidden. Rendered
 * viewport cases pin the prompts at 320/390px phone widths, 1280px desktop,
 * and large text; the final cases drive the real GameSession
 * (create/update/serialize/load) and render the reloaded profile through the
 * panel, so prompt save-reload behavior is covered through the actual screen.
 * RPG stat effects render from the engine's own statBonus table, and
 * reallocation stays an explicit unavailable note because the local ruleset
 * exposes no allocation action.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePanel } from "./ProfilePanel";
import type { ProfileView } from "../game/profileTypes";
import { GameSession } from "../game/session";
import { STAT_KEYS, type CharacterStats } from "@ahdclient/engine";
import type { CharacterCreation } from "../game/types";

function setViewportWidth(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  setViewportWidth(1024, 768);
  delete document.documentElement.dataset.textSize;
});

function makeProfile(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
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
    party: null,
    office: null,
    officeDestination: null,
    policies: null,
    stats: { charisma: 7, debate: 4, energy: 6, fundraising: 5, businessAcumen: 4, statecraft: 5, intellect: 5 },
    demographics: null,
    profileHeaderUrl: null,
    careerHistory: [],
    achievements: [],
    achievementProgress: { earned: 0, available: 1 },
    lockedAchievements: [],
    unavailableAchievements: [],
    resourceDetails: {
      actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, party: 0, penalty: 0, threshold: 100, cap: 200, next: 8, refresh: 4 },
      funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 0, regularNet: 10000 },
      partyInfluence: null,
      nationalInfluence: { current: 0, gain: 0 },
      favorability: { current: 50, decayThreshold: 60, aboveThresholdDecay: 0, tierFloor: 50, tierCost: 7 },
      history: [],
    },
    standing: {
      actions: 5, actionCap: 200, actionGain: 4, politicalInfluence: 0,
      nationalInfluence: null, favorability: 50, infamy: 0, partyInfluence: null,
    },
    finances: {
      currency: "USD", cash: 1200, savings: 300, funds: 5400,
      donorBaseLevel: 1, regularIncome: 150, donorIncome: 0,
    },
    onboarding: { dismissed: false, showPrompt: true },
    tutorial: { completed: false, dismissed: false, showPrompt: true },
    ...overrides,
  };
}

function renderPanel(profile: ProfileView, props: Record<string, unknown> = {}) {
  return render(
    <ProfilePanel
      profile={profile}
      busy={false}
      onNavigate={vi.fn()}
      onUpdateProfile={vi.fn(async () => true)}
      onSelectConstituency={vi.fn(async () => true)}
      {...props}
    />,
  );
}

describe("profile onboarding and guided-tour prompts", () => {
  it("renders both prompts with readable copy after the constituency card", () => {
    const onNavigate = vi.fn();
    renderPanel(makeProfile(), { onNavigate });

    const gettingStarted = screen.getByRole("region", { name: "Getting started" });
    expect(within(gettingStarted).getByText(/New to the campaign trail\?/)).toBeInTheDocument();
    expect(within(gettingStarted).getByRole("button", { name: "Open Campaign Office" })).toBeInTheDocument();
    expect(within(gettingStarted).getByRole("button", { name: "Browse parties" })).toBeInTheDocument();

    const tour = screen.getByRole("region", { name: "Guided tour" });
    expect(within(tour).getByText(/mark the tour complete/i)).toBeInTheDocument();

    // Reference order (AHDGame profile page): constituency, onboarding, tutorial.
    const sections = Array.from(document.querySelectorAll("section[aria-label]")).map((s) =>
      s.getAttribute("aria-label"),
    );
    expect(sections.indexOf("Constituency")).toBeGreaterThan(-1);
    expect(sections.indexOf("Getting started")).toBeGreaterThan(sections.indexOf("Constituency"));
    expect(sections.indexOf("Guided tour")).toBeGreaterThan(sections.indexOf("Getting started"));
  });

  it("links the prompts to the real Campaign Office and party destinations", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderPanel(makeProfile(), { onNavigate });
    await user.click(screen.getByRole("button", { name: "Open Campaign Office" }));
    expect(onNavigate).toHaveBeenCalledWith("actions");
    await user.click(screen.getByRole("button", { name: "Browse parties" }));
    expect(onNavigate).toHaveBeenCalledWith("parties");
  });

  it("dismisses getting started through onUpdateProfile and clears the card", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel(makeProfile(), { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Dismiss getting started" }));
    expect(onUpdateProfile).toHaveBeenCalledWith({ onboardingDismissed: true });
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    // The tour stays open so it can still be completed.
    expect(screen.getByRole("region", { name: "Guided tour" })).toBeInTheDocument();
  });

  it("keeps the card with an alert when dismissal is refused", async () => {
    const user = userEvent.setup();
    renderPanel(makeProfile(), { onUpdateProfile: vi.fn(async () => false) });
    await user.click(screen.getByRole("button", { name: "Dismiss getting started" }));
    expect(screen.getByRole("region", { name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("completes and dismisses the tour through onUpdateProfile", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel(makeProfile(), { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Mark tour complete" }));
    expect(onUpdateProfile).toHaveBeenCalledWith({ tutorialCompleted: true });
    expect(screen.queryByRole("region", { name: "Guided tour" })).not.toBeInTheDocument();
  });

  it("dismisses the tour without completing it", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel(makeProfile(), { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Dismiss tour" }));
    expect(onUpdateProfile).toHaveBeenCalledWith({ tutorialDismissed: true });
    expect(screen.queryByRole("region", { name: "Guided tour" })).not.toBeInTheDocument();
  });

  it("reopens getting started from the tour when it was dismissed", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel(
      makeProfile({
        onboarding: { dismissed: true, showPrompt: false },
        tutorial: { completed: false, dismissed: false, showPrompt: true },
      }),
      { onUpdateProfile },
    );
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show getting started again" }));
    expect(onUpdateProfile).toHaveBeenCalledWith({ onboardingDismissed: false });
    // Replaying does not resolve the tour itself.
    expect(screen.getByRole("region", { name: "Guided tour" })).toBeInTheDocument();
  });

  it("shows getting started again after a dismiss then replay round trip", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    const view = render(
      <ProfilePanel
        profile={makeProfile()}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={onUpdateProfile}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Dismiss getting started" }));
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    });

    // Parent refetches: the save now reports the prompt dismissed.
    view.rerender(
      <ProfilePanel
        profile={makeProfile({
          onboarding: { dismissed: true, showPrompt: false },
        })}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={onUpdateProfile}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show getting started again" }));
    expect(onUpdateProfile).toHaveBeenCalledWith({ onboardingDismissed: false });

    // Parent refetches: the save reports the prompt applicable again, so the
    // card must return even though it was dismissed in this same mount.
    view.rerender(
      <ProfilePanel
        profile={makeProfile({
          onboarding: { dismissed: false, showPrompt: true },
        })}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={onUpdateProfile}
        onSelectConstituency={vi.fn(async () => true)}
      />,
    );
    expect(await screen.findByRole("region", { name: "Getting started" })).toBeInTheDocument();
  });

  it("hides inapplicable prompts and legacy profiles without prompt state", () => {
    const { unmount } = renderPanel(
      makeProfile({
        onboarding: { dismissed: true, showPrompt: false },
        tutorial: { completed: true, dismissed: false, showPrompt: false },
      }),
    );
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Guided tour" })).not.toBeInTheDocument();
    unmount();

    const legacy = makeProfile();
    delete legacy.onboarding;
    delete legacy.tutorial;
    renderPanel(legacy);
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Guided tour" })).not.toBeInTheDocument();
  });
});

describe("profile RPG stat effects", () => {
  it("renders source-backed effect readouts with the reallocation boundary", () => {
    renderPanel(makeProfile());
    const stats = screen.getByRole("region", { name: "Character stats" });
    // Engine statBonus table: charisma 7 is a 1.06x outcome multiplier, energy 6
    // reports its concrete action-cap/bank numbers.
    expect(
      within(stats).getByText("1.06x effectiveness (+6% vs. the baseline at 5.5)"),
    ).toBeInTheDocument();
    expect(
      within(stats).getByText("228 action stockpile cap · bank up to 114"),
    ).toBeInTheDocument();
    expect(
      within(stats).getByText("Stat reallocation is not available in offline play yet."),
    ).toBeInTheDocument();
  });
});

describe.each([320, 390])("profile onboarding rendered phone viewport at %dpx", (width) => {
  it("keeps both prompts and their controls mounted without fixed widths", async () => {
    const user = userEvent.setup();
    setViewportWidth(width, 844);
    const onNavigate = vi.fn();
    renderPanel(makeProfile(), { onNavigate });

    expect(screen.getByRole("region", { name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Guided tour" })).toBeInTheDocument();
    for (const element of document.querySelectorAll(".ahd-profile button, .ahd-profile .ahd-card")) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
    await user.click(screen.getByRole("button", { name: "Open Campaign Office" }));
    expect(onNavigate).toHaveBeenCalledWith("actions");
    await user.click(screen.getByRole("button", { name: "Mark tour complete" }));
    expect(screen.queryByRole("region", { name: "Guided tour" })).not.toBeInTheDocument();
  });
});

describe("profile onboarding rendered desktop", () => {
  it("renders the prompts and stat effects at 1280px", () => {
    setViewportWidth(1280, 800);
    renderPanel(makeProfile());
    expect(screen.getByRole("region", { name: "Getting started" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Guided tour" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Character stats" })).toBeVisible();
    expect(screen.getByText("1.06x effectiveness (+6% vs. the baseline at 5.5)")).toBeVisible();
  });
});

describe("profile onboarding rendered large text", () => {
  it("keeps every prompt control mounted at 320px under large text", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.textSize = "large";
    setViewportWidth(320, 568);
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel(makeProfile(), { onUpdateProfile });

    for (const name of [
      "Open Campaign Office",
      "Browse parties",
      "Dismiss getting started",
      "Mark tour complete",
      "Dismiss tour",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    const dismiss = screen.getByRole("button", { name: "Dismiss getting started" });
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);
    await user.click(dismiss);
    expect(onUpdateProfile).toHaveBeenCalledWith({ onboardingDismissed: true });
  });
});

const SAVED_AT = "2026-09-10T00:00:00.000Z";

/**
 * The real session only records RPG stats when the character-creation file
 * allocates them (#242), so the save-reload cases below create through that
 * real path. A bare world-setup create carries no stats and the Character
 * stats section stays hidden, which is the ruleset boundary, not a prompt bug.
 */
function createSessionWithStats(seed: string): GameSession {
  const stats = Object.fromEntries(STAT_KEYS.map((key) => [key, 4])) as CharacterStats;
  const creation: CharacterCreation = {
    partyId: null,
    policies: { economic: -2, social: 3 },
    demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
    stats,
  };
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed, playerName: "Alex", homeRegionId: "NY", creation });
  return session;
}

/** Prompt dismiss/complete through the real GameSession, rendered after reload. */
describe("profile onboarding save-reload through the real session", () => {
  it("renders the reloaded profile without a dismissed prompt and keeps the tour", () => {
    const session = createSessionWithStats("native-profile-onboarding-ui");
    session.updateProfile({ onboardingDismissed: true });

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    renderPanel(reloaded.profile());

    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Guided tour" })).toBeInTheDocument();
  });

  it("renders neither prompt after a real tour completion, turn, and reload", () => {
    const session = createSessionWithStats("native-profile-onboarding-ui");
    session.updateProfile({ onboardingDismissed: true });
    session.updateProfile({ tutorialCompleted: true });
    session.advance();

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    const view = reloaded.profile();
    expect(view.onboarding?.showPrompt).toBe(false);
    expect(view.tutorial?.showPrompt).toBe(false);
    renderPanel(view);

    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Guided tour" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Character stats" })).toBeInTheDocument();
  });
});
