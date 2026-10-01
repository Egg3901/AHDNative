import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview, type WorldOverviewView } from "../game/worldOverview";
import { projectRegions, type RegionDirectoryRow } from "../game/regions";
import { projectPolitics } from "../game/politics";
import { projectProfile } from "../game/profile";
import { projectHallOfFame, type HallOfFameView } from "../game/hallOfFame";
import type { WorldMapSection, WorldMapView } from "../preferences";
import { WorldMapPanel } from "./WorldMapPanel";

// One shared world: the politics/profile projections behind the Hall of
// Fame summary cost several seconds, so every test renders the same save.
let fixture!: { overview: WorldOverviewView; regions: RegionDirectoryRow[]; regionsTotal: number; regionsCountryName: string; hallOfFame: HallOfFameView };

beforeAll(() => {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-map" });
  const overview = projectWorldOverview(world);
  const regions = projectRegions(world, { directoryPage: 0, directoryPageSize: 100 });
  const hallOfFame = projectHallOfFame({
    overview,
    politics: projectPolitics(world),
    profile: projectProfile(world),
  });
  fixture = {
    overview,
    regions: regions.directory,
    regionsTotal: regions.directoryTotal,
    regionsCountryName: regions.playerCountryName,
    hallOfFame,
  };
}, 120000);

function makeMap(section: WorldMapSection = "nations", view: WorldMapView = "world") {
  const onSectionChange = vi.fn();
  const onViewChange = vi.fn();
  const onNavigate = vi.fn();
  const onOpenElection = vi.fn();
  const onOpenHallOfFame = vi.fn();
  render(
    <WorldMapPanel
      overview={fixture.overview}
      regions={fixture.regions}
      regionsTotal={fixture.regionsTotal}
      regionsCountryName={fixture.regionsCountryName}
      section={section}
      onSectionChange={onSectionChange}
      view={view}
      onViewChange={onViewChange}
      hallOfFame={fixture.hallOfFame}
      onOpenHallOfFame={onOpenHallOfFame}
      onNavigate={onNavigate}
      onOpenElection={onOpenElection}
    />,
  );
  return { overview: fixture.overview, regions: fixture.regions, onSectionChange, onViewChange, onNavigate, onOpenElection, onOpenHallOfFame };
}

describe("WorldMapPanel", () => {
  it("lists the actual projected nations and regions over real geography", () => {
    const { overview, regions } = makeMap();

    expect(screen.getByRole("heading", { name: "World map" })).toBeInTheDocument();
    expect(screen.getByText(`${overview.nations.length} nations · ${fixture.regionsTotal} regions in ${fixture.regionsCountryName}`)).toBeInTheDocument();
    // Every projected nation is selectable into the existing Nations route.
    expect(screen.getByRole("button", { name: "Open United States nation details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open France nation details" })).toBeInTheDocument();
    // Every projected region row is selectable into the existing Regions route.
    expect(screen.getByRole("button", { name: `Open ${regions[0]!.name} region details` })).toBeInTheDocument();
    // Real geography: the bundled country shapes render, with no invented grid.
    expect(screen.getByRole("group", { name: /world nations geographic map/i })).toBeInTheDocument();
    expect(screen.queryByText(/schematic/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/latitude|longitude/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-lat],[data-lon],[data-coordinates]")).toBeNull();
  });

  it("opens nation and region details through the existing routes", () => {
    const { onNavigate } = makeMap();

    // The geographic shape carries its own label; the directory row opens Nations.
    expect(screen.getByRole("button", { name: "Open France on the map" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open France on the map" }));
    expect(onNavigate).toHaveBeenCalledWith("nations", "FR");
    fireEvent.click(screen.getByRole("button", { name: "Open France nation details" }));
    expect(onNavigate).toHaveBeenCalledWith("nations", "FR");
    fireEvent.click(screen.getByRole("button", { name: "Open California region details" }));
    expect(onNavigate).toHaveBeenCalledWith("regions", "CA");
  });

  it("searches the nation directory without touching the region directory", () => {
    makeMap();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search nations on the world map" }), { target: { value: "France" } });
    expect(screen.queryByRole("button", { name: "Open United States nation details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open France nation details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open California region details" })).toBeInTheDocument();
  });

  it("persists only the supported section choice and reorders the sections", () => {
    const { onSectionChange } = makeMap();

    const toggle = screen.getByRole("group", { name: "World map section" });
    expect(within(toggle).getByRole("button", { name: "Show nations section first" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(toggle).getByRole("button", { name: "Show regions section first" }));
    expect(onSectionChange).toHaveBeenCalledWith("regions");
  });

  it("renders the regions section first when that is the stored preference", () => {
    makeMap("regions");

    const sections = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(sections.indexOf("Regions")).toBeLessThan(sections.indexOf("Nations"));
  });

  it("switches the geography between world nations and the country spotlight", () => {
    const { onViewChange, onNavigate } = makeMap("nations", "world");

    // World context: real shapes for registered nations, selectable into Nations.
    expect(screen.getByRole("heading", { name: "World geography" })).toBeInTheDocument();
    const map = screen.getByRole("group", { name: /world nations geographic map/i });
    expect(within(map).getByRole("button", { name: "Open France on the map" })).toBeInTheDocument();
    fireEvent.click(within(map).getByRole("button", { name: "Open France on the map" }));
    expect(onNavigate).toHaveBeenCalledWith("nations", "FR");

    const toggle = screen.getByRole("group", { name: "World map geographic context" });
    expect(within(toggle).getByRole("button", { name: "Show world nations geography" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(toggle).getByRole("button", { name: "Show country spotlight geography" }));
    expect(onViewChange).toHaveBeenCalledWith("country");
  });

  it("spotlights the player country and keeps region selection in the directory", () => {
    const { regions, onNavigate } = makeMap("nations", "country");

    expect(screen.getByRole("heading", { name: `${fixture.regionsCountryName} spotlight` })).toBeInTheDocument();
    // No sub-region polygons are invented: the gap is stated honestly.
    expect(screen.getByText(/sub-region shapes are not bundled offline/i)).toBeInTheDocument();
    const map = screen.getByRole("group", { name: /on the world map, flat projection/i });
    expect(within(map).getAllByRole("button").length).toBe(1);
    fireEvent.click(within(map).getByRole("button", { name: `Open ${fixture.regionsCountryName} on the map` }));
    expect(onNavigate).toHaveBeenCalledWith("nations", fixture.overview.playerCountryId);
    // Region rows still open the existing Regions route with country+region ids.
    fireEvent.click(screen.getByRole("button", { name: `Open ${regions[0]!.name} region details` }));
    expect(onNavigate).toHaveBeenCalledWith("regions", regions[0]!.id);
  });

  it("links recorded nation leaders and races to their real destinations", () => {
    const { overview, onNavigate, onOpenElection } = makeMap();
    const nation = overview.nations.find((candidate) => candidate.leader !== null);
    // A fresh world may record no leader yet; then the row says so honestly.
    if (!nation) {
      expect(screen.getAllByText("No recorded leader").length).toBeGreaterThan(0);
      return;
    }

    fireEvent.click(screen.getByRole("button", {
      name: nation!.leader!.isPlayer
        ? `Open your profile, ${nation!.leader!.name}`
        : `Open ${nation!.leader!.name} politician details`,
    }));
    if (nation!.leader!.isPlayer) {
      expect(onNavigate).toHaveBeenCalledWith("profile");
    } else {
      expect(onNavigate).toHaveBeenCalledWith("politicians", nation!.leader!.id);
    }
    if (nation!.races.length > 0) {
      // Chamber labels repeat across nations, so any matching race button
      // must open one of this nation's recorded race ids.
      const raceButtons = screen.getAllByRole("button", { name: `Open ${nation!.races[0]!.label} race details` });
      expect(raceButtons.length).toBeGreaterThan(0);
      fireEvent.click(raceButtons[0]!);
      expect(onOpenElection).toHaveBeenCalled();
      const opened: string = onOpenElection.mock.calls[0]![0];
      expect(nation!.races.map((race) => race.id)).toContain(opened);
    }
  });

  it("links recorded region holders and races to their real destinations", () => {
    const { regions, onNavigate, onOpenElection } = makeMap();
    const row = regions.find((candidate) => candidate.officeHolder !== null);
    // A fresh world may record no holder yet; then the row says so honestly.
    if (!row) {
      expect(screen.getAllByText("No recorded holder").length).toBeGreaterThan(0);
      return;
    }

    fireEvent.click(screen.getByRole("button", {
      name: row!.officeHolder!.isPlayer
        ? `Open your profile, ${row!.officeHolder!.name}`
        : `Open ${row!.officeHolder!.name} politician details`,
    }));
    if (row!.officeHolder!.isPlayer) {
      expect(onNavigate).toHaveBeenCalledWith("profile");
    } else {
      expect(onNavigate).toHaveBeenCalledWith("politicians", row!.officeHolder!.id);
    }
    const raced = regions.find((candidate) => candidate.races.length > 0);
    if (raced) {
      const raceButtons = screen.getAllByRole("button", { name: `Open ${raced.races[0]!.label} race details` });
      expect(raceButtons.length).toBeGreaterThan(0);
      fireEvent.click(raceButtons[0]!);
      expect(onOpenElection).toHaveBeenCalled();
      const opened: string = onOpenElection.mock.calls[0]![0];
      expect(regions.flatMap((candidate) => candidate.races.map((race) => race.id))).toContain(opened);
    }
  });

  it("shows the Hall of Fame summary and opens the real standings route", () => {
    const { onOpenHallOfFame } = makeMap();

    expect(screen.getByRole("heading", { name: "Hall of Fame" })).toBeInTheDocument();
    expect(screen.queryByText(/not available offline/)).not.toBeInTheDocument();
    const top = fixture.hallOfFame.entries[0]!;
    expect(screen.getByText(new RegExp(top.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open the Hall of Fame standings" }));
    expect(onOpenHallOfFame).toHaveBeenCalledTimes(1);
  });

  it("uses phone-sized touch targets on directory rows", () => {
    makeMap();

    // France renders as a geographic shape plus a directory row; the row keeps the touch target.
    for (const button of screen.getAllByRole("button", { name: "Open France nation details" })) {
      expect(button).toHaveStyle({ minHeight: "3.1rem" });
    }
    expect(screen.getByRole("button", { name: "Open California region details" })).toBeInTheDocument();
  });
});
