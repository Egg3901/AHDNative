/**
 * RegionGeoMap real-shape interaction (#73).
 *
 * The fetch stub serves the actual bundled shard (public/geo/usa-regions.json,
 * verbatim source copy), and the recorded roster is the real engine directory
 * for a 1953 US world: every shape on the map is a recorded region, keyboard
 * and click select recorded ids, and the selected shape highlights. No
 * geometry is invented anywhere in this test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { clearRegionShardCache } from "../game/regionGeo";
import { projectRegions } from "../game/regions";
import { RegionGeoMap } from "./RegionGeoMap";

const SHARD = JSON.parse(
  readFileSync(join(process.cwd(), "public/geo/usa-regions.json"), "utf8"),
);

function fetchShard() {
  return async () => ({ json: async () => structuredClone(SHARD) });
}

function usRecorded(world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "region-geo-map" })) {
  const view = projectRegions(world, { directoryPage: 0, directoryPageSize: 100 });
  return new Map(view.directory.map((row) => [row.id, row.name] as const));
}

beforeEach(() => {
  clearRegionShardCache();
});

describe("RegionGeoMap", () => {
  it("renders real recorded shapes with click, keyboard, and selected highlight", async () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "region-geo-map" });
    const recorded = usRecorded(world);
    const onSelect = vi.fn();
    const { rerender } = render(
      <RegionGeoMap
        countryId="US"
        countryName="United States"
        recorded={recorded}
        selectedId={null}
        onSelect={onSelect}
        fetchImpl={fetchShard()}
      />,
    );

    const map = await screen.findByRole("group", { name: /united states regions geographic map/i });
    const shapes = map.querySelectorAll("path[data-region-id]");
    // AHDGame's usStates1953 records AK/HI as territories with no seats.
    // Geography includes those territories, 48 states, and the DC corporation HQ.
    expect(shapes.length).toBe(recorded.size);
    expect(shapes.length).toBe(51);
    for (const id of ["AK", "HI"]) {
      expect(world.regions[id]).toMatchObject({ countryId: "US", houseSeats: 0, senateSeats: 0 });
      expect(world.elections.some((race) => race.state === id)).toBe(false);
      expect(map.querySelector(`path[data-region-id='${id}']`)).not.toBeNull();
    }
    expect(map.querySelector("path[data-region-id='DC']")).not.toBeNull();
    // Source label override: the code sits on the map, full name in tooltip.
    const california = within(map).getByRole("button", { name: "Select California region" });
    expect(california.querySelector("title")?.textContent).toBe("California");
    expect(california.textContent).toContain("CA");

    fireEvent.click(california);
    expect(onSelect).toHaveBeenCalledWith("CA");

    fireEvent.keyDown(within(map).getByRole("button", { name: "Select Texas region" }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("TX");
    fireEvent.keyDown(within(map).getByRole("button", { name: "Select Ohio region" }), { key: " " });
    expect(onSelect).toHaveBeenCalledWith("OH");

    fireEvent.click(within(map).getByRole("button", { name: "Select Hawaii region" }));
    expect(onSelect).toHaveBeenCalledWith("HI");

    rerender(
      <RegionGeoMap
        countryId="US"
        countryName="United States"
        recorded={recorded}
        selectedId="CA"
        onSelect={onSelect}
        fetchImpl={fetchShard()}
      />,
    );
    const selected = within(map).getByRole("button", { name: "Select California region" });
    expect(selected.getAttribute("aria-current")).toBe("true");
    expect(selected.querySelector("path")?.getAttribute("class")).toContain("ahd-geo-spotlight");
  });

  it("states the gap honestly for countries with no bundled shard", () => {
    const onSelect = vi.fn();
    render(
      <RegionGeoMap
        countryId="FR"
        countryName="France"
        recorded={new Map([["IDF", "Ile-de-France"]])}
        onSelect={onSelect}
        fetchImpl={fetchShard()}
      />,
    );
    expect(screen.getByText(/not bundled offline/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /regions geographic map/i })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("states a failed shard load honestly instead of drawing placeholders", async () => {
    render(
      <RegionGeoMap
        countryId="US"
        countryName="United States"
        recorded={usRecorded()}
        fetchImpl={async () => { throw new Error("offline"); }}
      />,
    );
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /regions geographic map/i })).toBeNull();
  });
});
