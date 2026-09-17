import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview } from "../game/worldOverview";
import { projectRegions } from "../game/regions";
import { WorldMapPanel } from "./WorldMapPanel";

/**
 * Long-name containment for WorldMapPanel directory rows at 320/390px.
 *
 * Each row is a no-wrap space-between flex line: a label column plus a badge
 * cluster (two badges on nations: home/viewing plus playable status). The
 * label must be the shrinkable flex item (min-width 0 + flex 1 1 auto, text
 * overflow-wrap anywhere) and the badge cluster must yield (min-width 0 with
 * internal wrap), or a long name pushes the row past a 320px viewport.
 * jsdom performs no layout, so the CSS case pins the shipped containment
 * rules and the markup cases pin that long-named rows ship inside them with
 * selection intact. Nothing here is physical-device evidence.
 */

// Unbroken on purpose: no spaces, so only the containment rule keeps it inside the row.
const LONG_NATION = `Democratic-Republic-of-${"X".repeat(120)}`;
const LONG_REGION = `Autonomous-District-of-${"Y".repeat(120)}`;

function makeLongMap() {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-map-rows" });
  const base = projectWorldOverview(world);
  // Widest badge cluster on the player row: home/viewing plus "Not playable".
  const overview = {
    ...base,
    nations: base.nations.map((nation) =>
      nation.id === base.playerCountryId ? { ...nation, name: LONG_NATION, playable: false } : nation,
    ),
  };
  const projected = projectRegions(world, { directoryPage: 0, directoryPageSize: 100 });
  const regions = projected.directory.map((row, index) =>
    index === 0 ? { ...row, name: LONG_REGION, isHome: true } : row,
  );
  const onSectionChange = vi.fn();
  const onNavigate = vi.fn();
  render(
    <WorldMapPanel
      overview={overview}
      regions={regions}
      regionsTotal={projected.directoryTotal}
      regionsCountryName={projected.playerCountryName}
      section="nations"
      onSectionChange={onSectionChange}
      onNavigate={onNavigate}
    />,
  );
  return { overview, onNavigate, homeId: regions[0]!.id };
}

const css = readFileSync("src/ui/ui.css", "utf8");

describe("world map directory row containment", () => {
  it("ships the shrink containment for directory row labels and badge clusters", () => {
    expect(css).toMatch(/\.ahd-world-row-label[^{]*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.ahd-world-row-label-text[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.ahd-world-row-badges[^{]*\{[^}]*min-width:\s*0/);
  });

  it("keeps a long nation name with two badges inside the row and selectable", () => {
    const { onNavigate } = makeLongMap();

    const row = screen.getByRole("button", { name: `Open ${LONG_NATION} nation details` });
    expect(row).toBeEnabled();
    // Label ships inside the shrink containment; both badges stay on the row.
    const label = row.querySelector(".ahd-world-row-label-text");
    expect(label?.textContent).toBe(LONG_NATION);
    expect(row.querySelector(".ahd-world-row-label")).not.toBeNull();
    const badges = row.querySelector(".ahd-world-row-badges");
    expect(badges).not.toBeNull();
    expect(within(badges as HTMLElement).getByText("Your country")).toBeInTheDocument();
    expect(within(badges as HTMLElement).getByText("Not playable")).toBeInTheDocument();
    fireEvent.click(row);
    expect(onNavigate).toHaveBeenCalledWith("nations", "US");
  });

  it("keeps a long region name with the home badge inside the row and selectable", () => {
    const { onNavigate, homeId } = makeLongMap();

    const row = screen.getByRole("button", { name: `Open ${LONG_REGION} region details` });
    expect(row).toBeEnabled();
    expect(row.querySelector(".ahd-world-row-label-text")?.textContent).toBe(LONG_REGION);
    expect(within(row).getByText("Home")).toBeInTheDocument();
    fireEvent.click(row);
    expect(onNavigate).toHaveBeenCalledWith("regions", homeId);
  });

  it("preserves the desktop row treatment: touch target, split alignment, left text", () => {
    makeLongMap();

    const row = screen.getByRole("button", { name: `Open ${LONG_NATION} nation details` });
    expect(row).toHaveStyle({ minHeight: "3.1rem", justifyContent: "space-between", textAlign: "left" });
    const regionRow = screen.getByRole("button", { name: `Open ${LONG_REGION} region details` });
    expect(regionRow).toHaveStyle({ minHeight: "3.1rem", justifyContent: "space-between", textAlign: "left" });
  });
});
