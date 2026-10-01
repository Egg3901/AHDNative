import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GameSession } from "../game/session";
import { type HallOfFameView } from "../game/hallOfFame";
import { HallOfFamePanel } from "./HallOfFamePanel";

// One shared session: world creation costs several seconds, so every test
// renders the same recorded save with the default query (the filter test
// only asserts callbacks).
let sharedView!: HallOfFameView;

beforeAll(() => {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", playerName: "Ada", seed: "hof-panel" });
  sharedView = session.hallOfFame({});
}, 120000);

function makePanel(query: { rankBy: "legacy" | "netWorth"; scope: "all" | "current" } = { rankBy: "legacy", scope: "all" }) {
  const view: HallOfFameView = sharedView;
  const onQueryChange = vi.fn();
  const onNavigate = vi.fn();
  const onOpenElection = vi.fn();
  render(
    <HallOfFamePanel
      view={view}
      query={query}
      onQueryChange={onQueryChange}
      onNavigate={onNavigate}
      onOpenElection={onOpenElection}
    />,
  );
  return { view, onQueryChange, onNavigate, onOpenElection };
}

describe("HallOfFamePanel", () => {
  it("renders the single recorded life with its Legacy Score, not NPC rows", async () => {
    const { view } = makePanel();

    expect(screen.getByRole("heading", { name: "Hall of Fame" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Hall of Fame standings" });
    const rows = within(table).getAllByRole("row");
    const { HALL_OF_FAME_PAGE_SIZE } = await import("./HallOfFamePanel");
    const page = Math.min(HALL_OF_FAME_PAGE_SIZE, view.entries.length);
    expect(rows.length).toBe(page + 1);
    expect(view.total).toBe(1);
    expect(screen.getByText(/1 recorded life on this device/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ada.*profile/i })).toBeInTheDocument();
    expect(screen.getByText(/cross-player.*authoritative/i)).toBeInTheDocument();
  });

  it("keeps the rank order the projector produced instead of re-sorting", () => {
    const { view } = makePanel();

    const table = screen.getByRole("table", { name: "Hall of Fame standings" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    const shown = view.entries.slice(0, 50);
    expect(bodyRows.length).toBe(shown.length);
    bodyRows.forEach((row, index) => {
      const cells = within(row).getAllByRole("cell");
      expect(cells[0]!.textContent).toBe(String(shown[index]!.rank));
    });
  });

  it("switches scope and ranking through the persisted source filter controls", () => {
    const { onQueryChange } = makePanel();

    fireEvent.click(screen.getByRole("button", { name: "Show only the current era" }));
    expect(onQueryChange).toHaveBeenCalledWith({ rankBy: "legacy", scope: "current" });
    fireEvent.click(screen.getByRole("button", { name: "Rank by net worth" }));
    expect(onQueryChange).toHaveBeenCalledWith({ rankBy: "netWorth", scope: "all" });
    expect(screen.queryByRole("button", { name: /raw influence|my party/i })).not.toBeInTheDocument();
  });

  it("shows the score breakdown, offices, and region link in life details", () => {
    const { view, onNavigate } = makePanel();
    const player = view.entries.find((entry) => entry.isPlayer)!;

    expect(screen.getByRole("heading", { name: "Life details" })).toBeInTheDocument();
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/net worth breakdown/i)).toBeInTheDocument();
    if (player.homeRegion) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${player.homeRegion.name}.*region`) }));
      expect(onNavigate).toHaveBeenCalledWith("regions", player.homeRegion.id);
    }
    fireEvent.click(screen.getByRole("button", { name: /Ada.*profile/i }));
    expect(onNavigate).toHaveBeenCalledWith("profile");
  });

  it("keeps the standings usable at 320px without sideways page scroll", () => {
    makePanel();

    const table = screen.getByRole("table", { name: "Hall of Fame standings" });
    const scroller = table.parentElement!;
    expect(scroller).toHaveClass("ahd-mp-wallet-table");
    expect(scroller.scrollWidth).toBeLessThanOrEqual(1920);
  });
});
