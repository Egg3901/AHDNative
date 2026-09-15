import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePanel } from "./ProfilePanel";
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
  careerHistory: [],
  achievements: [],
  achievementProgress: { earned: 0, available: 1 },
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

function renderHero(overrides: Partial<ProfileView> = {}, props: Record<string, unknown> = {}) {
  const profile: ProfileView = {
    ...BASE,
    ...overrides,
    standing: { ...BASE.standing, ...(overrides.standing ?? {}) },
    finances: { ...BASE.finances, ...(overrides.finances ?? {}) },
  };
  const onNavigate = vi.fn();
  const onUpdateProfile = vi.fn(async () => true);
  const onSelectConstituency = vi.fn(async () => true);
  render(
    <ProfilePanel
      profile={profile}
      busy={false}
      onNavigate={onNavigate}
      onUpdateProfile={onUpdateProfile}
      onSelectConstituency={onSelectConstituency}
      {...props}
    />,
  );
  return { onNavigate, onUpdateProfile };
}

describe("Profile hero and identity composition (#371)", () => {
  it("opens with the bundled offline politicians hero, never a remote image", () => {
    renderHero();
    const hero = screen.getByRole("img", { name: "Politicians meeting in a national chamber" });
    const src = hero.getAttribute("src") ?? "";
    expect(src).toBe("/static/heroes/politicians.webp");
    expect(src).not.toMatch(/^https?:\/\//);
    expect(document.querySelector(".ahd-profile-hero")).not.toBeNull();
  });

  it("composes name, office, party, country and initials fallback into one identity block", () => {
    renderHero();
    const hero = document.querySelector(".ahd-profile-hero");
    expect(hero).not.toBeNull();
    expect(hero).toHaveTextContent("Ada Crane");
    expect(hero).toHaveTextContent("Councilor");
    expect(hero).toHaveTextContent("Labor Caucus");
    expect(hero).toHaveTextContent("United States");
    // Initials fallback seam when no portrait is saved.
    expect(hero).toHaveTextContent("A");
    // PartyMark initials seam, no remote logo.
    const mark = hero!.querySelector("[data-party-mark]");
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute("data-party-mark")).toBe("LC");
    expect(hero!.querySelector("img[src^='http']")).toBeNull();
  });

  it("shows the saved portrait in the identity block with initials as the only fallback", () => {
    renderHero({ avatarUrl: "data:image/png;base64,AAA" });
    const hero = document.querySelector(".ahd-profile-hero");
    expect(screen.getByAltText("Ada Crane profile picture")).toBeInTheDocument();
    // One portrait: the hero owns it, so the name is announced once.
    expect(screen.getAllByAltText("Ada Crane profile picture")).toHaveLength(1);
    expect(hero).not.toHaveTextContent("Change picture");
  });

  it("names independents honestly and keeps the office/mode line without an office", () => {
    renderHero({ party: null, office: null, officeDestination: null });
    const hero = document.querySelector(".ahd-profile-hero");
    expect(hero).toHaveTextContent("Independent");
    expect(hero!.querySelector("[data-party-mark]")).toBeNull();
    expect(hero).toHaveTextContent("No office");
  });

  it("keeps every identity destination reachable from the hero", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderHero();
    expect(document.querySelector(".ahd-profile-hero")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Labor Caucus" }));
    expect(onNavigate).toHaveBeenCalledWith("partyDetails", "7");
    await user.click(screen.getByRole("button", { name: "Councilor" }));
    expect(onNavigate).toHaveBeenCalledWith("legislature", "lower");
    await user.click(screen.getByRole("button", { name: "New York" }));
    expect(onNavigate).toHaveBeenCalledWith("state", "US-NY");
    await user.click(screen.getByRole("button", { name: "United States" }));
    expect(onNavigate).toHaveBeenCalledWith("nations", "US");
  });

  it("does not duplicate editable fields inside the identity block", () => {
    renderHero();
    const hero = document.querySelector(".ahd-profile-hero")!;
    expect(hero.querySelector("textarea")).toBeNull();
    expect(hero.querySelector("input")).toBeNull();
    // The name is a single heading; editing stays in the Character card below.
    expect(screen.getAllByRole("heading", { name: "Ada Crane" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit biography" })).toBeInTheDocument();
  });

  it("adapts hero crop and density at 320px, 390px and desktop", () => {
    const css = readFileSync("src/ui/profile.css", "utf8");
    expect(css).toMatch(/\.ahd-profile-hero-identity/);
    expect(css).toMatch(/@media\s*\(max-width:\s*400px\)/);
    expect(css).toMatch(/\.ahd-profile-hero-portrait/);
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
  });
});
