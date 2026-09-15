import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview } from "../game/worldOverview";
import { projectRegions } from "../game/regions";
import { WorldMapPanel } from "./WorldMapPanel";

function makeMap(section: "nations" | "regions" = "nations") {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-map" });
  const overview = projectWorldOverview(world);
  const regions = projectRegions(world, { directoryPage: 0, directoryPageSize: 100 });
  const onSectionChange = vi.fn();
  const onNavigate = vi.fn();
  render(
    <WorldMapPanel
      overview={overview}
      regions={regions.directory}
      regionsTotal={regions.directoryTotal}
      regionsCountryName={regions.playerCountryName}
      section={section}
      onSectionChange={onSectionChange}
      onNavigate={onNavigate}
    />,
  );
  return { overview, regions, onSectionChange, onNavigate };
}

describe("WorldMapPanel", () => {
  it("lists the actual projected nations and regions with no plotted coordinates", () => {
    const { overview, regions } = makeMap();

    expect(screen.getByRole("heading", { name: "World map" })).toBeInTheDocument();
    expect(screen.getByText(`${overview.nations.length} nations · ${regions.directoryTotal} regions in ${regions.playerCountryName}`)).toBeInTheDocument();
    // Every projected nation is selectable into the existing Nations route.
    expect(screen.getByRole("button", { name: "Open United States nation details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open France nation details" })).toBeInTheDocument();
    // Every projected region row is selectable into the existing Regions route.
    expect(screen.getByRole("button", { name: `Open ${regions.directory[0]!.name} region details` })).toBeInTheDocument();
    // Nothing is plotted: no coordinate text or coordinate hooks anywhere.
    expect(screen.queryByText(/latitude|longitude/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-lat],[data-lon],[data-coordinates]")).toBeNull();
    expect(screen.getByText(/the save records no coordinates/)).toBeInTheDocument();
  });

  it("opens nation and region details through the existing routes", () => {
    const { onNavigate } = makeMap();

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

  it("keeps Hall of Fame explicitly unavailable instead of fabricating a leaderboard", () => {
    makeMap();

    expect(screen.getByRole("heading", { name: "Hall of Fame" })).toBeInTheDocument();
    expect(screen.getByText(/not available offline/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hall of fame|leaderboard/i })).not.toBeInTheDocument();
  });

  it("links only to nation and region details, never to fabricated election or profile rows", () => {
    makeMap();

    const destinations = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "")
      .filter((label) => label.startsWith("Open "));
    expect(destinations.length).toBeGreaterThan(0);
    for (const label of destinations) {
      expect(label).toMatch(/Open .+ (nation|region) details/);
    }
    expect(screen.queryByRole("button", { name: /election|profile|leaderboard/i })).not.toBeInTheDocument();
  });

  it("uses phone-sized touch targets on directory rows", () => {
    makeMap();

    expect(screen.getByRole("button", { name: "Open France nation details" })).toHaveStyle({ minHeight: "3.1rem" });
    expect(screen.getByRole("button", { name: "Open California region details" })).toHaveStyle({ minHeight: "3.1rem" });
  });
});
