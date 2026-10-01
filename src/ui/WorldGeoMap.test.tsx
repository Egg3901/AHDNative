import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview } from "../game/worldOverview";
import { WorldGeoMap } from "./WorldGeoMap";

// RED: the invented schematic tile grid is not map parity. The world view
// must render the actual Natural Earth country shapes (one path per
// bundled feature), with registered nations selectable into the existing
// Nations route and unregistered land drawn but inert.
describe("WorldGeoMap", () => {
  it("renders real geographic country shapes with selectable nations", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-geo" });
    const overview = projectWorldOverview(world);
    const onSelect = vi.fn();
    render(<WorldGeoMap overview={overview} spotlightCountryId={null} onSelect={onSelect} />);

    const map = screen.getByRole("group", { name: /world nations geographic map/i });
    const paths = map.querySelectorAll("path[data-feature-id]");
    // The bundled 110m asset carries ~177 country features: every one drawn.
    expect(paths.length).toBeGreaterThan(100);

    // Registered nations are real buttons on real shapes.
    const france = screen.getByRole("button", { name: "Open France on the map" });
    expect(france.tagName).toBe("g");
    expect(france.querySelector("path[data-feature-id='250']")).not.toBeNull();
    fireEvent.click(france);
    expect(onSelect).toHaveBeenCalledWith("FR");

    // Keyboard selection matches the reference click/keyboard entities.
    const us = screen.getByRole("button", { name: "Open United States on the map" });
    fireEvent.keyDown(us, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("US");

    // Unregistered land (e.g. Tanzania, ISO 834) is drawn but inert.
    const tanzania = map.querySelector("path[data-feature-id='834']");
    expect(tanzania).not.toBeNull();
    expect(tanzania!.closest("[role='button']")).toBeNull();

    // No schematic grid, no invented coordinates.
    expect(screen.queryByText(/not to geographic scale/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-lat],[data-lon]")).toBeNull();
  });

  it("spotlights the player country and states the sub-region gap honestly", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-geo" });
    const overview = projectWorldOverview(world);
    render(<WorldGeoMap overview={overview} spotlightCountryId="US" onSelect={vi.fn()} />);

    expect(screen.getByText(/sub-region shapes are not bundled offline/i)).toBeInTheDocument();
    const us = screen.getByRole("button", { name: "Open United States on the map" });
    expect(us.getAttribute("aria-current")).toBe("true");
    expect(us.querySelector("title")).not.toBeNull();
  });
});
