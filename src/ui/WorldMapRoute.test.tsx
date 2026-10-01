/**
 * WorldMapRoute selected-country wiring (#73).
 *
 * The country picker re-queries through the existing client
 * loadRegions({countryId, ...}); the map and directory follow the selected
 * country, foreign selection stays local (never navigates to the
 * player-scoped Regions route), and player-country rows keep navigating.
 * Shards come from the real bundled files via the fetch seam.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWorld, type WorldState } from "@ahdclient/engine";
import { projectWorldOverview, type WorldOverviewView } from "../game/worldOverview";
import { projectHallOfFame } from "../game/hallOfFame";
import { projectRegions, type RegionsQuery } from "../game/regions";
import { clearRegionShardCache } from "../game/regionGeo";
import { WorldMapRoute } from "./WorldMapRoute";

const USA_SHARD = JSON.parse(
  readFileSync(join(process.cwd(), "public/geo/usa-regions.json"), "utf8"),
);
const BRITISH_ISLES_SHARD = JSON.parse(
  readFileSync(join(process.cwd(), "public/geo/british-isles-regions.json"), "utf8"),
);

const fetchImpl = async (url: string) => ({
  json: async () => structuredClone(url.includes("british-isles") ? BRITISH_ISLES_SHARD : USA_SHARD),
});

let world!: WorldState;
let overview!: WorldOverviewView;

beforeAll(() => {
  world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-map-country" });
  overview = projectWorldOverview(world);
}, 120000);

beforeEach(() => {
  clearRegionShardCache();
});

function renderRoute(loadRegions: (query?: RegionsQuery) => Promise<ReturnType<typeof projectRegions>>) {
  const onNavigate = vi.fn();
  const onOpenElection = vi.fn();
  render(
    <WorldMapRoute
      loadOverview={async () => overview}
      loadRegions={loadRegions}
      loadHallOfFame={async () => projectHallOfFame(world)}
      fetchImpl={fetchImpl}
      revision={{}}
      section="regions"
      onSectionChange={vi.fn()}
      view="country"
      onViewChange={vi.fn()}
      onNavigate={onNavigate}
      onOpenElection={onOpenElection}
      onOpenHallOfFame={vi.fn()}
    />,
  );
  return { onNavigate, onOpenElection };
}

describe("WorldMapRoute country context", () => {
  it("loads the player country first and re-queries on picker change", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    const loadRegions = vi.fn(async (query?: RegionsQuery) => projectRegions(world, query));
    renderRoute(loadRegions);

    // Player country scope first: real US shapes and directory rows.
    expect(await screen.findByRole("group", { name: /united states regions geographic map/i }, { timeout: 15000 })).toBeInTheDocument();
    expect(loadRegions).toHaveBeenCalledWith({ countryId: "US", directoryPage: 0, directoryPageSize: 100 });
    expect(screen.getByRole("button", { name: "Open California region details" })).toBeInTheDocument();

    // Switching the picker re-queries for the selected country.
    fireEvent.change(
      screen.getByRole("combobox", { name: "Choose country for the region map and directory" }),
      { target: { value: "UK" } },
    );
    expect(await screen.findByRole("group", { name: /united kingdom regions geographic map/i }, { timeout: 15000 })).toBeInTheDocument();
    expect(loadRegions).toHaveBeenLastCalledWith({ countryId: "UK", directoryPage: 0, directoryPageSize: 100 });
    expect(screen.getByRole("button", { name: "Select East Midlands region" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open California region details" })).not.toBeInTheDocument();
  }, 60000);

  it("keeps foreign selection local and player rows navigating", async () => {
    const loadRegions = vi.fn(async (query?: RegionsQuery) => projectRegions(world, query));
    const { onNavigate } = renderRoute(loadRegions);

    await screen.findByRole("group", { name: /united states regions geographic map/i }, { timeout: 15000 });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Choose country for the region map and directory" }),
      { target: { value: "UK" } },
    );
    const map = await screen.findByRole("group", { name: /united kingdom regions geographic map/i }, { timeout: 15000 });

    // Foreign shape click selects locally: no navigation to Regions. Map
    // buttons carry the shard's own name; rows carry the recorded name.
    fireEvent.click(within(map).getByRole("button", { name: /East Midlands/ }));
    expect(onNavigate).not.toHaveBeenCalledWith("regions", expect.anything());
    expect(screen.getByRole("button", { name: "Select East Midlands region" })).toHaveAttribute("aria-pressed", "true");

    // Foreign row click also selects locally and shows the recorded summary.
    // The map shape shares the row's accessible name, so scope to the directory.
    const directory = within(screen.getByRole("region", { name: "Regions on the world map" }));
    fireEvent.click(directory.getByRole("button", { name: "Select London region" }));
    expect(onNavigate).not.toHaveBeenCalledWith("regions", expect.anything());

    // Back on the player country, rows navigate to the Regions route again.
    fireEvent.change(
      screen.getByRole("combobox", { name: "Choose country for the region map and directory" }),
      { target: { value: "US" } },
    );
    await screen.findByRole("group", { name: /united states regions geographic map/i }, { timeout: 15000 });
    fireEvent.click(screen.getByRole("button", { name: "Open California region details" }));
    expect(onNavigate).toHaveBeenCalledWith("regions", "CA");
  }, 60000);

  it("states the gap honestly for a country with no bundled shard", async () => {
    const loadRegions = vi.fn(async (query?: RegionsQuery) => projectRegions(world, query));
    renderRoute(loadRegions);

    await screen.findByRole("group", { name: /united states regions geographic map/i }, { timeout: 15000 });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Choose country for the region map and directory" }),
      { target: { value: "FR" } },
    );
    expect(await screen.findByText(/not bundled offline/i, {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /regions geographic map/i })).toBeNull();
    expect(loadRegions).toHaveBeenLastCalledWith({ countryId: "FR", directoryPage: 0, directoryPageSize: 100 });
  }, 60000);
});
