import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav, GameDrawer, MENU_GROUPS, drawerRouteIds } from "./MobileNavigation";

describe("MobileNavigation", () => {
  it("bottom nav has exactly four labeled items", () => {
    const ref = createRef<HTMLButtonElement | null>();
    render(
      <BottomNav route="profile" menuOpen={false} menuButtonRef={ref} onNavigate={vi.fn()} onOpenMenu={vi.fn()} />,
    );
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    for (const label of ["Profile", "Actions", "Parties", "Menu"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["portfolio", "Profile"], ["markets", "Profile"],
    ["partyDetails", "Parties"], ["caucuses", "Parties"],
    ["regions", "Menu"], ["economy", "Menu"],
  ] as const)("keeps the parent destination marked while viewing %s", (route, label) => {
    render(<BottomNav route={route} menuOpen={false} menuButtonRef={createRef()} onNavigate={vi.fn()} onOpenMenu={vi.fn()} />);
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("mirrors the reference menu hierarchy: no Character group, Actions top-level, Nation/World sub-groups", () => {
    // Top-level order matches the reference menu: profile header links, the
    // Actions tab, State, Nation, World, Help (ExperimentalMobileMenu).
    expect(MENU_GROUPS.map((g) => g.label)).toEqual(["Profile", "Actions", "State", "Nation", "World", "Help"]);
    expect(MENU_GROUPS.some((g) => g.label === "Character")).toBe(false);

    // Nation sections and their in-section order match nationDetailsSections.
    const nation = MENU_GROUPS.find((g) => g.label === "Nation")!;
    expect(nation.sections?.map((s) => s.label)).toEqual(["Politics", "Government", "Economy"]);
    expect(nation.sections?.[0]!.items.map((i) => i.label)).toEqual([
      "Elections", "Parties", "Start a party", "Caucuses", "Politicians",
      "Presidential election", "Political metrics", "Referendums",
    ]);
    expect(nation.sections?.[1]!.items.map((i) => i.label)).toEqual(["Legislature", "Bills and proposals", "Policy"]);
    expect(nation.sections?.[2]!.items.map((i) => i.label)).toEqual(["Economy", "National Budget", "National Metrics"]);

    // World sections and their in-section order match worldNavItems groupings;
    // Stock market and Bonds sit under World, not a "Character" group.
    const world = MENU_GROUPS.find((g) => g.label === "World")!;
    expect(world.sections?.map((s) => s.label)).toEqual(["Economy", "Diplomacy", "Other"]);
    expect(world.sections?.[0]!.items.map((i) => i.id)).toEqual(["markets", "bonds", "banking"]);
    expect(world.sections?.[1]!.items.map((i) => i.id)).toEqual(["nations"]);
    expect(world.sections?.[2]!.items.map((i) => i.id)).toEqual(["news"]);
  });

  it("drawer exposes every reachable destination exactly once", () => {
    const ids = drawerRouteIds();
    for (const id of [
      "actions", "parties", "legislature", "elections", "news", "profile", "portfolio", "banking",
      "politicians", "economy", "budget", "policy", "nations", "state", "help", "settings",
      "legislationDetails", "markets", "search", "partyManagement", "bonds", "caucuses",
      "referendums", "notifications", "regions", "presidentialDetails", "politicalMetrics",
    ]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("drawer renders the reference group and sub-section headings and keeps turn actions open", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement | null>();
    const onNavigate = vi.fn();
    const onAdvanceTurn = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <GameDrawer
        open
        route="profile"
        busy={false}
        playerName="Ada"
        playerParty="Labor"
        countryName="United States"
        turn={1}
        date="1953-01-08"
        menuButtonRef={ref}
        onNavigate={onNavigate}
        onAdvanceTurn={onAdvanceTurn}
        onSave={onSave}
        onExit={vi.fn()}
        onClose={onClose}
      />,
    );
    const menu = screen.getByRole("dialog", { name: "Game menu" });
    expect(menu).toBe(container.querySelector("#ahd-drawer"));
    expect(screen.getByText("Ada")).toBeInTheDocument();
    for (const label of ["Profile", "Actions", "State", "Nation", "World", "Help"]) {
      expect(within(menu).getByRole("group", { name: label })).toBeInTheDocument();
    }
    const nation = within(menu).getByRole("group", { name: "Nation" });
    for (const label of ["Politics", "Government", "Economy"]) {
      expect(within(nation).getByRole("group", { name: label })).toBeInTheDocument();
    }
    const world = within(menu).getByRole("group", { name: "World" });
    expect(within(world).getByRole("group", { name: "Economy" })).toBeInTheDocument();
    expect(within(world).getByRole("button", { name: "Stock market" })).toBeInTheDocument();
    expect(within(world).getByRole("button", { name: "Bonds" })).toBeInTheDocument();
    expect(within(world).getByRole("button", { name: "Banking" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "National Budget" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "National Metrics" })).toBeInTheDocument();
    // #69: the reference Politics group also carries the presidential race page
    // and the political-metrics registry.
    expect(within(nation).getByRole("button", { name: "Presidential election" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Political metrics" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "End turn" }));
    expect(onAdvanceTurn).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save game" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Bills and proposals" }));
    expect(onNavigate).toHaveBeenCalledWith("legislationDetails");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("drawer busy state disables turn actions", () => {
    const ref = createRef<HTMLButtonElement | null>();
    render(
      <GameDrawer
        open
        route="profile"
        busy
        playerName="Ada"
        playerParty="Labor"
        countryName="United States"
        turn={1}
        date="1953-01-08"
        menuButtonRef={ref}
        onNavigate={vi.fn()}
        onAdvanceTurn={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "End turn" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save game" })).toBeDisabled();
  });
});
