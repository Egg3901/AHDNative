import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav, GameDrawer, MENU_GROUPS } from "./MobileNavigation";

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

  it("drawer groups keep full parity and end turn stays open", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement | null>();
    const onNavigate = vi.fn();
    const onAdvanceTurn = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const flat = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    for (const id of ["actions", "parties", "legislature", "elections", "news", "profile", "portfolio", "banking", "politicians", "economy", "budget", "policy", "nations", "state", "help", "settings", "legislationDetails", "markets", "search", "partyManagement", "bonds", "caucuses"]) {
      expect(flat).toContain(id);
    }
    render(
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
    expect(screen.getByRole("dialog", { name: "Game menu" })).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
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
