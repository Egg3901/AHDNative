import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePanel } from "./ProfilePanel";
import { GameSession } from "../game/session";
import type { ProfileView } from "../game/profileTypes";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-profile-corp-card", playerName: "Alex" };
const SAVED_AT = "2026-09-15T00:00:00.000Z";

function freshSession(): GameSession {
  const session = new GameSession();
  session.create(OPTIONS);
  return session;
}

/** Profile of a player who owns the US-media sector through the public commands. */
function owningProfile(): ProfileView {
  const session = freshSession();
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  const assetId = session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
  const listed = session.listSectorForSale(assetId);
  expect(listed.ok).toBe(true);
  const raw = JSON.parse(session.serialize(SAVED_AT));
  raw.world.player.cash = listed.priceAnchor!;
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  expect(funded.buySectorForSale(assetId).ok).toBe(true);
  return funded.profile();
}

function renderPanel(profile: ProfileView, onNavigate: (route: never, id?: string) => void) {
  return render(
    <ProfilePanel
      profile={profile}
      busy={false}
      onNavigate={onNavigate}
      onUpdateProfile={async () => true}
      onSelectConstituency={async () => true}
    />,
  );
}

function corporationSection(): HTMLElement | null {
  return document.querySelector('section[aria-label="Corporation"]');
}

describe("#51 profile corporation card", () => {
  it("omits the card for an ordinary player", () => {
    renderPanel(freshSession().profile(), vi.fn());
    expect(corporationSection()).toBeNull();
  });

  it("shows the owned corporation with company-detail context and links to the company detail", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderPanel(owningProfile(), onNavigate);

    const card = corporationSection();
    expect(card).not.toBeNull();
    expect(card!.textContent).toMatch(/US-media/);
    expect(card!.textContent).toMatch(/Sector owner/);
    expect(card!.textContent).toMatch(/Market value/);

    await user.click(screen.getByRole("button", { name: "View company" }));
    expect(onNavigate).toHaveBeenCalledWith("markets", "US-media");
  });
});
