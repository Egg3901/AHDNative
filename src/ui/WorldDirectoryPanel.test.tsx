import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview } from "../game/worldOverview";
import { WorldDirectoryPanel } from "./WorldDirectoryPanel";
import { GameDrawer } from "./MobileNavigation";

function makeDirectory() {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-directory" });
  const overview = projectWorldOverview(world);
  const onNavigate = vi.fn();
  render(<WorldDirectoryPanel overview={overview} onNavigate={onNavigate} />);
  return { overview, onNavigate };
}

describe("WorldDirectoryPanel", () => {
  it("lists every recorded nation from the authoritative projection with stable names", () => {
    const { overview } = makeDirectory();

    expect(screen.getByRole("heading", { name: "World directory" })).toBeInTheDocument();
    expect(screen.getByText(`${overview.nations.length} recorded nations`, { exact: false })).toBeInTheDocument();
    const rows = screen.getAllByRole("button", { name: /Open .+ nation details/ });
    expect(rows).toHaveLength(overview.nations.length);
    // Row order follows the projection (playable first, then by name).
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(
      overview.nations.map((nation) => `Open ${nation.name} nation details`),
    );
    expect(screen.getByRole("button", { name: "Open United States nation details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open France nation details" })).toBeInTheDocument();
  });

  it("opens the existing nation detail route and nothing else", () => {
    const { onNavigate } = makeDirectory();

    fireEvent.click(screen.getByRole("button", { name: "Open France nation details" }));
    expect(onNavigate).toHaveBeenCalledWith("nations", "FR");
    const destinations = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "")
      .filter((label) => label.startsWith("Open "));
    expect(destinations.length).toBeGreaterThan(0);
    for (const label of destinations) {
      expect(label).toMatch(/Open .+ nation details/);
    }
  });

  it("searches the recorded nations without inventing rows", () => {
    const { overview } = makeDirectory();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search nations in the world directory" }), { target: { value: "France" } });
    expect(screen.queryByRole("button", { name: "Open United States nation details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open France nation details" })).toBeInTheDocument();
    expect(screen.getByText(`1 of ${overview.nations.length} nations`)).toBeInTheDocument();
  });

  it("states an explicit no-match without implying a map or leaderboard", () => {
    makeDirectory();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search nations in the world directory" }), { target: { value: "zzz-no-such-nation" } });
    expect(screen.getByText("No nations match this search.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open .+ nation details/ })).not.toBeInTheDocument();
  });

  it("states an explicit empty save without implying a map or live leaderboard", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-directory-empty" });
    render(<WorldDirectoryPanel overview={{ ...projectWorldOverview(world), nations: [] }} />);

    expect(screen.getByText(/No nations recorded in this save/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open .+ nation details/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.querySelector("[data-lat],[data-lon],[data-coordinates]")).toBeNull();
  });

  it("never plots coordinates or fabricates a leaderboard", () => {
    makeDirectory();

    expect(screen.queryByText(/latitude|longitude/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-lat],[data-lon],[data-coordinates]")).toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hall of fame|leaderboard/i })).not.toBeInTheDocument();
    expect(screen.getByText(/not a map/)).toBeInTheDocument();
  });

  it("uses phone-sized touch targets on directory rows", () => {
    makeDirectory();

    expect(screen.getByRole("button", { name: "Open France nation details" })).toHaveStyle({ minHeight: "3.1rem" });
  });

  it.each([false, true])("is reachable from the World group in the %s drawer shell", async (docked) => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const ref = createRef<HTMLButtonElement | null>();
    render(
      <GameDrawer
        docked={docked || undefined}
        open={!docked}
        route="profile"
        busy={false}
        playerName="Ada"
        playerParty="Labor"
        countryName="United States"
        turn={1}
        date="1953-01-08"
        menuButtonRef={ref}
        onNavigate={onNavigate}
        onAdvanceTurn={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const scope = docked
      ? within(screen.getByRole("complementary", { name: "Game navigation" }))
      : within(screen.getByRole("dialog", { name: "Game menu" }));
    await user.click(scope.getByRole("button", { name: "World" }));
    await user.click(scope.getByRole("button", { name: "World directory" }));
    expect(onNavigate).toHaveBeenCalledWith("worldDirectory");
  });
});
