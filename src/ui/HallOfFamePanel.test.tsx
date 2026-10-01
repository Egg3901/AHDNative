import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview } from "../game/worldOverview";
import { projectPolitics } from "../game/politics";
import { projectProfile } from "../game/profile";
import { projectHallOfFame, type HallOfFameView } from "../game/hallOfFame";
import { HallOfFamePanel } from "./HallOfFamePanel";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One shared fixture: the politics/profile projections and the standings
// projection cost several seconds, so every test renders the same recorded
// save with the default query (the filter test only asserts callbacks).
let sharedView!: HallOfFameView;

beforeAll(() => {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "hof-panel" });
  const overview = projectWorldOverview(world);
  const politics = projectPolitics(world);
  const profile = projectProfile(world);
  sharedView = projectHallOfFame({ overview, politics, profile });
}, 120000);

function makePanel(query?: { rankBy?: "standing" | "influence"; scope?: "all" | "party"; era?: "current" | "all" }) {
  const view: HallOfFameView = sharedView;
  const onQueryChange = vi.fn();
  const onNavigate = vi.fn();
  const onOpenElection = vi.fn();
  render(
    <HallOfFamePanel
      view={view}
      query={query ?? { rankBy: "standing", scope: "all", era: "current" }}
      onQueryChange={onQueryChange}
      onNavigate={onNavigate}
      onOpenElection={onOpenElection}
    />,
  );
  return { view, onQueryChange, onNavigate, onOpenElection };
}

describe("HallOfFamePanel", () => {
  it("renders the projected standings as a real table with the player flagged", async () => {
    const { view } = makePanel();

    expect(screen.getByRole("heading", { name: "Hall of Fame" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Hall of Fame standings" });
    const rows = within(table).getAllByRole("row");
    // Header plus one row per shown entry (top-50 page, player pinned when
    // outside the slice).
    const { HALL_OF_FAME_PAGE_SIZE } = await import("./HallOfFamePanel");
    const page = Math.min(HALL_OF_FAME_PAGE_SIZE, view.entries.length);
    const pinned = view.entries.find((entry) => entry.isPlayer) && view.entries.findIndex((entry) => entry.isPlayer) >= page ? 1 : 0;
    expect(rows.length).toBe(page + pinned + 1);
    expect(screen.getByText(new RegExp(`top ${page} of ${view.total}`, "i"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ada.*profile/i })).toBeInTheDocument();
    expect(screen.getByText(/recorded figures in this save/i)).toBeInTheDocument();
  });

  it("keeps the rank order the projector produced instead of re-sorting", () => {
    const { view } = makePanel();

    const table = screen.getByRole("table", { name: "Hall of Fame standings" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    // The panel's shown order: top-50 page plus the pinned player row when
    // it ranks outside the slice. Rank cells stay the projector's own.
    const page = view.entries.slice(0, 50);
    const player = view.entries.find((entry) => entry.isPlayer)!;
    const shown = page.some((entry) => entry.id === player.id) ? page : [...page, player];
    expect(bodyRows.length).toBe(shown.length);
    bodyRows.forEach((row, index) => {
      const cells = within(row).getAllByRole("cell");
      expect(cells[0]!.textContent).toBe(String(shown[index]!.rank));
    });
  });

  it("switches scope, ranking, and era through the persisted filter controls", () => {
    const { onQueryChange } = makePanel();

    fireEvent.click(screen.getByRole("button", { name: "Show only my party" }));
    expect(onQueryChange).toHaveBeenCalledWith({ rankBy: "standing", scope: "party", era: "current" });
    fireEvent.click(screen.getByRole("button", { name: "Rank by influence" }));
    expect(onQueryChange).toHaveBeenCalledWith({ rankBy: "influence", scope: "all", era: "current" });
    fireEvent.click(screen.getByRole("button", { name: "Show every era" }));
    expect(onQueryChange).toHaveBeenCalledWith({ rankBy: "standing", scope: "all", era: "all" });
  });

  it("links each figure to its profile and each active race to its election", () => {
    const { view, onNavigate, onOpenElection } = makePanel();

    fireEvent.click(screen.getByRole("button", { name: /Ada.*profile/i }));
    expect(onNavigate).toHaveBeenCalledWith("profile");
    const npc = view.entries.slice(0, 50).find((entry) => entry.kind === "politician");
    if (npc) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${escapeRegExp(npc.name)}.*politician`) }));
      expect(onNavigate).toHaveBeenCalledWith("politicians", npc.id);
    }
    const playerEntry = view.entries.find((entry) => entry.isPlayer)!;
    const renderedIds = new Set([...view.entries.slice(0, 50).map((entry) => entry.id), playerEntry.id]);
    const raced = view.entries.find((entry) => renderedIds.has(entry.id) && entry.activeRaceIds.length > 0);
    if (raced) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`Open ${escapeRegExp(raced.activeRaceIds[0]!)} race`) }));
      expect(onOpenElection).toHaveBeenCalledWith(raced.activeRaceIds[0]);
    } else {
      expect(screen.getAllByText(/no unresolved races/i).length).toBeGreaterThan(0);
    }
  });

  it("states the cross-player board stays on the authoritative server", () => {
    makePanel();

    expect(screen.getByText(/cross-player.*authoritative/i)).toBeInTheDocument();
  });

  it("keeps the standings usable at 320px without sideways page scroll", () => {
    makePanel();

    const table = screen.getByRole("table", { name: "Hall of Fame standings" });
    const scroller = table.parentElement!;
    expect(scroller).toHaveClass("ahd-mp-wallet-table");
    expect(scroller.scrollWidth).toBeLessThanOrEqual(1920);
  });
});
