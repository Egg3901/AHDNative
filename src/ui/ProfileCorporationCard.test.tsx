import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { GameSession } from "../game/session";
import type { ProfileView } from "../game/profileTypes";
import type { ProfileCorporationEntry } from "../game/profileCorporation";
import { ProfilePanel } from "./ProfilePanel";
import { MarketsPanel } from "./MarketsPanel";
import type { DrawerRouteId } from "./MobileNavigation";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-profile-ceo-card", playerName: "Alex" };
const CEO_OPTIONS = { era: "1953", countryId: "US", homeRegionId: "DC", seed: "native-profile-ceo-card", playerName: "Alex" };
const SAVED_AT = "2026-09-18T00:00:00.000Z";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A live ordinary profile: no recorded ownership, so no card. */
function plainProfile(): ProfileView {
  const session = new GameSession();
  session.create(OPTIONS);
  return session.profile();
}

/** A live owner profile through the public sector-acquisition flow. */
function owningProfile(): ProfileView {
  const session = new GameSession();
  session.create(OPTIONS);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  const assetId = session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
  const listed = session.listSectorForSale(assetId);
  expect(listed.ok).toBe(true);
  const raw = JSON.parse(session.serialize(SAVED_AT));
  raw.world.player.cash = listed.ok ? listed.priceAnchor : 0;
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  expect(funded.buySectorForSale(assetId).ok).toBe(true);
  return funded.profile();
}

function renderPanel(profile: ProfileView, onNavigate: (route: DrawerRouteId, id?: string) => void) {
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
  it("omits the card for an ordinary player and for an empty list", () => {
    renderPanel(plainProfile(), vi.fn());
    expect(corporationSection()).toBeNull();
    document.body.innerHTML = "";
    renderPanel({ ...plainProfile(), corporations: [] }, vi.fn());
    expect(corporationSection()).toBeNull();
  });

  it("omits the card for a recorded shareholder with no sector ownership", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    renderPanel(session.profile(), vi.fn());
    expect(corporationSection()).toBeNull();
  });

  it("shows the owned corporation with company-detail values and settled salary/dividends", () => {
    const profile = owningProfile();
    expect(profile.corporations).toHaveLength(1);
    renderPanel(profile, vi.fn());

    const card = corporationSection();
    expect(card).not.toBeNull();
    const text = card!.textContent ?? "";
    const entry = profile.corporations![0]!;
    expect(text).toMatch(new RegExp(entry.ticker));
    expect(text).toContain(entry.name);
    expect(getComputedStyle(card!.querySelector("[data-corporation-brand]")!).color).toBe("rgb(6, 182, 212)");
    expect(text).toMatch(/Sector owner/);
    expect(text).toMatch(/Corporate cash/);
    expect(text).toMatch(/Your shares/);
    expect(text).toMatch(/Controlling holder/);
    expect(text).toMatch(/CEO salary/);
    expect(text).toMatch(/Dividends/);
    expect(text).toMatch(/Paid last turn/);
    expect(text).toMatch(/Received last turn/);
  });

  it("shows a real CEO identity without sector ownership and opens the company detail", () => {
    const session = new GameSession();
    session.create(CEO_OPTIONS);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(session.act("voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
    expect(session.act("acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
    const profile = session.profile();
    expect(profile.corporations?.[0]).toMatchObject({ role: "ceo", id: "US-media" });
    const onNavigate = vi.fn();
    renderPanel(profile, onNavigate);
    const card = corporationSection()!;
    expect(card.textContent).toMatch(/CEO/);
    screen.getByRole("button", { name: "View company: Daily Media" }).click();
    expect(onNavigate).toHaveBeenCalledWith("markets", "US-media");
  });

  it("shows the source national-enterprise note for a recorded state-enterprise CEO", () => {
    const session = new GameSession();
    session.create(CEO_OPTIONS);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(session.act("voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
    expect(session.act("acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
    // Nationalization is outside this card slice. Load a valid recorded
    // state-enterprise fixture through the public save boundary.
    const saved = JSON.parse(session.serialize(SAVED_AT));
    saved.world.corporations["US-media"].ownershipState = "stateOwned";
    saved.world.corporations["US-media"].countryOwnerId = "US";
    session.load(JSON.stringify(saved));
    renderPanel(session.profile(), vi.fn());
    expect(corporationSection()!.textContent).toContain("National enterprise");
  });

  it("supports the complete shareholder CEO and compensation path on the company detail", async () => {
    const session = new GameSession();
    session.create(CEO_OPTIONS);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    const user = userEvent.setup();
    const onAction = vi.fn((id: string, params?: Record<string, string | number>) => { session.act(id, params); });
    const page = render(<MarketsPanel markets={session.markets()} initialId="US-media" busy={false} onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "Vote yourself as CEO" }));
    expect(session.markets().listings.find((entry) => entry.id === "US-media")!.pendingCeoId).toBe("player");
    page.rerender(<MarketsPanel markets={session.markets()} initialId="US-media" busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Accept CEO appointment" }));
    expect(session.markets().listings.find((entry) => entry.id === "US-media")!.ceoId).toBe("player");

    page.rerender(<MarketsPanel markets={session.markets()} initialId="US-media" busy={false} onAction={onAction} />);
    await user.clear(screen.getByRole("spinbutton", { name: "CEO salary per turn" }));
    await user.type(screen.getByRole("spinbutton", { name: "CEO salary per turn" }), "1000");
    await user.clear(screen.getByRole("spinbutton", { name: "Dividend rate" }));
    await user.type(screen.getByRole("spinbutton", { name: "Dividend rate" }), "25");
    await user.click(screen.getByRole("button", { name: "Save compensation" }));
    expect(session.markets().listings.find((entry) => entry.id === "US-media")).toMatchObject({ ceoSalaryPerTurn: 1_000, dividendRate: 25 });
    expect(onAction.mock.calls.map(([id]) => id)).toEqual([
      "voteCeo",
      "acceptCeoAppointment",
      "setCorporationCompensation",
    ]);
  });

  it("renders empty values honestly instead of fabricating them", () => {
    const base = owningProfile().corporations![0]!;
    const emptied: ProfileCorporationEntry = {
      ...base,
      playerAvgCostPerShare: null,
      controllingHolder: null,
      scope: "regional",
      regionName: null,
    };
    renderPanel({ ...owningProfile(), corporations: [emptied] }, vi.fn());
    const card = corporationSection();
    expect(card).not.toBeNull();
    const text = card!.textContent ?? "";
    expect(text).toMatch(/No recorded average cost/);
    expect(text).toMatch(/No recorded controlling holder/);
    expect(text).toMatch(/Region not recorded/);
  });

  it("follows the role being gained and lost across renders", () => {
    const owned = owningProfile();
    const plain = plainProfile();
    const { rerender } = render(
      <ProfilePanel
        profile={plain}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={async () => true}
        onSelectConstituency={async () => true}
      />,
    );
    expect(corporationSection()).toBeNull();
    rerender(
      <ProfilePanel
        profile={owned}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={async () => true}
        onSelectConstituency={async () => true}
      />,
    );
    expect(corporationSection()).not.toBeNull();
    rerender(
      <ProfilePanel
        profile={plain}
        busy={false}
        onNavigate={vi.fn()}
        onUpdateProfile={async () => true}
        onSelectConstituency={async () => true}
      />,
    );
    expect(corporationSection()).toBeNull();
  });

  it("links the card to the working company destination", async () => {
    const onNavigate: (route: DrawerRouteId, id?: string) => void = vi.fn();
    const user = userEvent.setup();
    renderPanel(owningProfile(), onNavigate);
    await user.click(screen.getByRole("button", { name: "View company: Daily Media" }));
    expect(onNavigate).toHaveBeenCalledWith("markets", "US-media");
  });

  it("opens the linked company detail with a working Back control", async () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const markets = session.markets();
    const user = userEvent.setup();
    render(
      <MarketsPanel markets={markets} busy={false} onAction={vi.fn(async () => {})} initialId="US-media" />,
    );
    // The deep link lands on the company detail, not the list.
    expect(screen.getByRole("button", { name: "Back to market list" })).not.toBeNull();
    expect(screen.getByText("Company")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Back to market list" }));
    expect(screen.getByLabelText("Search corporations")).not.toBeNull();
  });

  it("degrades a stale company link to the market list instead of a dead detail", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    render(
      <MarketsPanel markets={session.markets()} busy={false} onAction={vi.fn(async () => {})} initialId="US-gone" />,
    );
    expect(screen.queryByRole("button", { name: "Back to market list" })).toBeNull();
    expect(screen.getByLabelText("Search corporations")).not.toBeNull();
  });

  it("uses the responsive profile row layout that holds at 320/390px and desktop large text", () => {
    renderPanel(owningProfile(), vi.fn());
    const card = corporationSection();
    expect(card).not.toBeNull();
    // Narrow phones, 390px phones, desktop and large dynamic text all share
    // these classes; the shipped rules below keep them wrapping.
    expect(card!.querySelector(".ahd-profile-rows")).not.toBeNull();
    expect(card!.querySelectorAll(".ahd-profile-row").length).toBeGreaterThan(0);
    expect(card!.querySelector(".ahd-profile-actions")).not.toBeNull();

    const css = readFileSync("src/ui/profile.css", "utf8");
    // Rows never force a fixed track: minmax(0, ...) plus anywhere-wrapping
    // values, so long tickers and large-text money figures wrap in place.
    expect(css).toMatch(/\.ahd-profile-row\s*\{[^}]*minmax\(0,\s*1fr\)[^}]*minmax\(0,\s*1\.2fr\)/);
    expect(css).toMatch(/\.ahd-profile-row dd\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.ahd-profile-actions\s*\{[^}]*flex-wrap:\s*wrap/);
    // Touch target floor on the destination link.
    const button = within(card!).getByRole("button", { name: /View company/ });
    expect(button.getAttribute("style")).toMatch(/min-height:\s*44/);
  });
});
