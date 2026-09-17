import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectRegions } from "../game/regions";
import { RegionsPanel } from "./RegionsPanel";

/**
 * Long-name containment for the RegionsPanel directory rows at 320/390px.
 *
 * Each directory row is a space-between flex line: a label column (region
 * name plus id/population sub-line) plus the Home badge. The label must be
 * the shrinkable flex item (min-width 0 + flex 1 1 auto, name
 * overflow-wrap anywhere) and the badge must keep flexShrink 0, or a long
 * region name pushes the row past a 320px viewport. jsdom performs no
 * layout, so the style cases pin the shipped containment rules and the
 * markup cases pin that a long-named home row ships inside them with
 * selection and list/detail semantics intact. Nothing here is
 * physical-device evidence.
 */

// Unbroken on purpose: no spaces, so only the containment rule keeps it inside the row.
const LONG_REGION = `Autonomous-District-of-${"Y".repeat(120)}`;

function longDirectoryView() {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "regions-directory-rows" });
  const base = projectRegions(world, { directoryPageSize: 100 });
  const view = {
    ...base,
    directory: base.directory.map((row, index) =>
      index === 0 ? { ...row, name: LONG_REGION, isHome: true } : row,
    ),
  };
  return { world, view, homeId: view.directory[0]!.id };
}

describe("RegionsPanel directory row containment", () => {
  it("keeps a long home-region name and badge inside the row without squeezing either", () => {
    const { view } = longDirectoryView();
    render(
      <RegionsPanel
        query={view}
        onQueryChange={vi.fn()}
        directoryOpen
        onDirectoryOpenChange={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: `View ${LONG_REGION} details` });
    expect(row).toHaveStyle({
      justifyContent: "space-between",
      textAlign: "left",
      alignItems: "flex-start",
      minHeight: "3.1rem",
    });
    const name = within(row).getByText(LONG_REGION);
    expect(name).toHaveStyle({ minWidth: "0", overflowWrap: "anywhere" });
    expect(name.parentElement).toHaveStyle({ minWidth: "0", flex: "1 1 auto" });
    expect(within(row).getByText("Home")).toHaveStyle({ flexShrink: "0" });
  });

  it("preserves selection and collapses the directory when a long-named row is chosen", () => {
    const { world, view } = longDirectoryView();
    const onQueryChange = vi.fn();
    const onDirectoryOpenChange = vi.fn();
    render(
      <RegionsPanel
        query={{ ...view, selected: projectRegions(world, { regionId: view.directory[0]!.id }).selected }}
        onQueryChange={onQueryChange}
        directoryOpen
        onDirectoryOpenChange={onDirectoryOpenChange}
      />,
    );

    const row = screen.getByRole("button", { name: `View ${LONG_REGION} details` });
    expect(row).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(row);
    expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({ regionId: view.directory[0]!.id }));
    expect(onDirectoryOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps list/detail panes sharing one query after a long-named row is chosen", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "regions-directory-dual" });
    const initial = projectRegions(world, { directoryPageSize: 100 });
    // Fake a long name on a non-selected row so choosing it genuinely moves
    // the detail; the detail then carries the engine's real name for that id.
    const longId = initial.directory[1]!.id;
    const longRealName = initial.directory[1]!.name;
    function Harness() {
      const [query, setQuery] = useState(initial);
      const [directoryOpen, setDirectoryOpen] = useState(true);
      const longQuery = {
        ...query,
        directory: query.directory.map((row) => (row.id === longId ? { ...row, name: LONG_REGION } : row)),
      };
      return (
        <RegionsPanel
          query={longQuery}
          onQueryChange={(next) => setQuery(projectRegions(world, next))}
          directoryOpen={directoryOpen}
          onDirectoryOpenChange={setDirectoryOpen}
        />
      );
    }
    render(<Harness />);

    const list = document.querySelector('[data-pane="list"]');
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getByRole("searchbox", { name: "Search regions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `View ${LONG_REGION} details` }));
    // One query drives both panes: picking the long-named row moves the detail
    // to that region while the single-pane stack keeps both landmarks.
    expect(screen.getByRole("article", { name: longRealName })).toHaveAttribute("data-pane", "detail");
    expect(screen.getByText("Browse regions").closest("details")).not.toHaveAttribute("open");
  });
});
