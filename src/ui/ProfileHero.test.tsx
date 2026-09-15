/**
 * Profile route hero and identity composition (#371, child of #143).
 *
 * Rendered contract for the in-game Profile header: a `RouteHero` banner
 * using the bundled offline `public/static/heroes/politicians.webp`
 * (byte-identical to AHDGame, SHA-256
 * `bb3078558687f426d939f74672e339033147e241b21495b269b59cc12acb7a00` —
 * the same asset character creation uses) with a saved custom header
 * winning when present, plus one overlap identity block carrying the
 * projected portrait-or-initials, name, office, party and
 * region/country links. Edit controls stay in the Character card and are
 * never duplicated into the hero. No remote image source is used.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePanel } from "./ProfilePanel";
import { PROFILE_HERO_IMAGE, profileHeroImage } from "./RouteHero";
import type { ProfileView } from "../game/profileTypes";

const BASE: ProfileView = {
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
  corporations: [],
  lockedAchievements: [],
  unavailableAchievements: [],
  resourceDetails: {
    actions: { base: 4, seat: 2, cabinet: 0, chair: 0, office: 2, party: 0, penalty: 0, threshold: 100, cap: 200, next: 9, refresh: 6 },
    funds: { enabled: true, base: 10000, donor: 500, office: 0, tax: 500, regularNet: 10000 },
    partyInfluence: null,
    nationalInfluence: { current: 0, gain: 0 },
    favorability: { current: 61, decayThreshold: 60, aboveThresholdDecay: 0.05, tierFloor: 50, tierCost: 7 },
    history: [],
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

function renderPanel(overrides: Partial<ProfileView> = {}, props = {}) {
  const profile = {
    ...BASE,
    ...overrides,
    standing: { ...BASE.standing, ...(overrides.standing ?? {}) },
    finances: { ...BASE.finances, ...(overrides.finances ?? {}) },
  };
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

function heroHeader(): HTMLElement {
  const hero = document.querySelector(".ahd-profile-header .ahd-route-hero.ahd-profile-hero");
  if (!(hero instanceof HTMLElement)) throw new Error("profile route hero is not rendered");
  return hero;
}

describe("profileHeroImage", () => {
  it("resolves the bundled politicians asset when no custom header is saved", () => {
    expect(profileHeroImage(null)).toBe("/static/heroes/politicians.webp");
    expect(PROFILE_HERO_IMAGE).toBe("/static/heroes/politicians.webp");
  });

  it("prefers a saved custom header over the bundled asset", () => {
    expect(profileHeroImage("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
  });
});

describe("Profile hero imagery", () => {
  it("renders the offline politicians hero with the reference alt text by default", () => {
    renderPanel();
    const hero = within(heroHeader()).getByRole("img", { name: "Politicians meeting in a national chamber" });
    expect(hero).toHaveAttribute("src", "/static/heroes/politicians.webp");
    expect(screen.getByRole("heading", { name: "Ada Crane" })).toBeInTheDocument();
    expect(within(heroHeader()).getByText("United States")).toBeInTheDocument();
  });

  it("ships the byte-identical offline politicians asset", () => {
    const bytes = readFileSync("public/static/heroes/politicians.webp");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "bb3078558687f426d939f74672e339033147e241b21495b269b59cc12acb7a00",
    );
  });

  it("loads the hero from the local bundle only, never a remote CDN", () => {
    renderPanel();
    const hero = within(heroHeader()).getByRole("img", { name: "Politicians meeting in a national chamber" });
    const src = hero.getAttribute("src") ?? "";
    expect(src).toBe("/static/heroes/politicians.webp");
    expect(src).not.toMatch(/^https?:\/\//);
  });

  it("uses the saved custom header instead of the bundled asset when set", () => {
    renderPanel({ profileHeaderUrl: "data:image/png;base64,iVBORw0KGgo=" });
    expect(
      within(heroHeader()).getByRole("img", { name: "Ada Crane profile header" }),
    ).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    expect(
      within(heroHeader()).queryByRole("img", { name: "Politicians meeting in a national chamber" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the gradient and identity when the hero image fails, matching the reference fallback", () => {
    renderPanel();
    const hero = within(heroHeader()).getByRole("img", { name: "Politicians meeting in a national chamber" });
    fireEvent.error(hero);
    expect(
      within(heroHeader()).queryByRole("img", { name: "Politicians meeting in a national chamber" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ada Crane" })).toBeInTheDocument();
    expect(document.querySelector(".ahd-profile-hero .ahd-route-hero-shade")).not.toBeNull();
  });
});

describe("Profile hero identity composition", () => {
  it("composes exactly one identity block: portrait, name, office, party and country", () => {
    renderPanel({ avatarUrl: "data:image/png;base64,AAA" });
    expect(screen.getAllByRole("heading", { name: "Ada Crane" })).toHaveLength(1);
    expect(screen.getByAltText("Ada Crane profile picture")).toBeInTheDocument();
    expect(screen.getByText("Labor Caucus")).toBeInTheDocument();
    expect(screen.getByText("Councilor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New York" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "United States" })).toBeInTheDocument();
  });

  it("falls back to initials when no portrait is saved", () => {
    renderPanel({ avatarUrl: null });
    expect(screen.queryByAltText("Ada Crane profile picture")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("keeps every identity destination reachable from the hero block", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderPanel({}, { onNavigate });
    await user.click(screen.getByRole("button", { name: "Labor Caucus" }));
    expect(onNavigate).toHaveBeenCalledWith("partyDetails", "7");
    await user.click(screen.getByRole("button", { name: "Councilor" }));
    expect(onNavigate).toHaveBeenCalledWith("legislature", "lower");
    await user.click(screen.getByRole("button", { name: "New York" }));
    expect(onNavigate).toHaveBeenCalledWith("state", "US-NY");
    await user.click(screen.getByRole("button", { name: "United States" }));
    expect(onNavigate).toHaveBeenCalledWith("nations", "US");
  });

  it("names a missing office honestly instead of inventing one", () => {
    renderPanel({ office: null, officeDestination: null });
    expect(screen.getByText("No office")).toBeInTheDocument();
  });
});

describe("Profile hero boundaries", () => {
  it("keeps every edit control in the Character card and never duplicates it into the hero", () => {
    renderPanel();
    expect(screen.getAllByLabelText("Choose profile picture")).toHaveLength(1);
    expect(screen.getAllByLabelText("Choose profile header")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit biography" })).toBeInTheDocument();
    const hero = heroHeader();
    expect(within(hero).queryByLabelText(/Choose profile/)).not.toBeInTheDocument();
    expect(hero.querySelector('input[type="file"]')).toBeNull();
    expect(hero.querySelector("textarea")).toBeNull();
  });

  it("adapts crop and information density at 320px, 390px and desktop", () => {
    const css = readFileSync("src/ui/profile.css", "utf8");
    // 320px phones: compact overlap, portrait and chips.
    expect(css).toMatch(/@media\s*\(max-width:\s*360px\)[\s\S]*?\.ahd-profile-hero-id/);
    // Base phone column (390px): the overlap identity row and hero bleed.
    expect(css).toMatch(/\.ahd-profile-hero-id\s*\{[^}]*margin-top:\s*-2\.75rem/);
    expect(css).toMatch(/\.ahd-profile-header\s*>\s*\.ahd-route-hero\.ahd-profile-hero/);
    // Desktop: roomier overlap beside the 220px hero crop.
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)[\s\S]*?\.ahd-profile-hero-id/);
    // Reachability: identity chips and links keep 44px targets.
    expect(css).toMatch(/\.ahd-profile-chip\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.ahd-profile-link\s*\{[^}]*min-height:\s*44px/);
  });
});
