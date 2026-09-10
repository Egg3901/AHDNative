import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createWorld, deserializeSave, type WorldState } from "@ahdclient/engine";
import { projectRegions } from "../game/regions";
import { RegionsPanel } from "./RegionsPanel";

function electedWorld(): WorldState {
  return deserializeSave(gunzipSync(readFileSync("fixtures/career-elected-1953-US.save.json.gz")).toString("utf8"));
}

describe("RegionsPanel", () => {
  it("searches the country directory and reports browsing without changing home", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regions-panel-search" });
    const onQueryChange = vi.fn();
    function Harness() {
      const [query, setQuery] = useState(projectRegions(world));
      const [directoryOpen, setDirectoryOpen] = useState(false);
      return (
        <RegionsPanel
          query={query}
          onQueryChange={(next) => {
            onQueryChange(next);
            setQuery(projectRegions(world, next));
          }}
          directoryOpen={directoryOpen}
          onDirectoryOpenChange={setDirectoryOpen}
        />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByText("Browse regions"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search regions" }), {
      target: { value: "California" },
    });
    fireEvent.submit(screen.getByRole("searchbox", { name: "Search regions" }).closest("form")!);
    expect(onQueryChange).toHaveBeenCalledWith(
      expect.objectContaining({ regionId: "AL", directoryQuery: "California", directoryPage: 0 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "View California details" }));
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ regionId: "CA" }));
    expect(world.player.countryId).toBe("US");
    expect(world.player.homeRegionId).toBe("AL");
    expect(screen.getByText("Browse regions").closest("details")).not.toHaveAttribute("open");
  });

  it("shows recorded US regional facts and honest vacancy and race empties", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regions-panel-us" });
    render(<RegionsPanel query={projectRegions(world)} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Alabama" })).toBeInTheDocument();
    expect(screen.getAllByText("Southeast").length).toBeGreaterThan(0);
    expect(screen.getByText("Vacant")).toBeInTheDocument();
    expect(screen.getByText("No elections recorded for this region.")).toBeInTheDocument();
    expect(screen.getByText("No members seated.")).toBeInTheDocument();
    expect(screen.getAllByText("3,061,743").length).toBeGreaterThan(0);
  });

  it("renders the genuine elected fixture's office, chambers, and recorded winner", () => {
    const view = projectRegions(electedWorld(), { regionId: "AL" });
    render(<RegionsPanel query={view} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);

    expect(screen.getByText("Janet Rodriguez")).toBeInTheDocument();
    expect(screen.getByText(/Winners: Janet Rodriguez/)).toBeInTheDocument();
    expect(screen.getAllByText("House of Representatives").length).toBeGreaterThan(0);
    expect(screen.getAllByText("State Senate").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("House of Representatives").find((element) => element.closest("summary"))!.closest("summary")!);
    expect(screen.getByText("Muse")).toBeInTheDocument();
    expect(screen.getByText(/9 seated/)).toBeInTheDocument();
  });

  it("opens recorded budget and demographic detail through counted disclosures", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regions-panel-detail" });
    render(<RegionsPanel query={projectRegions(world)} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);

    const budgetSummary = screen.getByText(/Revenue and spending detail/);
    expect(budgetSummary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(budgetSummary);
    expect(budgetSummary.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Spending by category")).toBeInTheDocument();
    expect(screen.getByText("Council tax")).toBeInTheDocument();

    const demographicsSummary = screen.getByText(/Demographic detail/);
    expect(demographicsSummary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(demographicsSummary);
    expect(demographicsSummary.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Military service population")).toBeInTheDocument();
    expect(screen.getByText("Demographic groups")).toBeInTheDocument();
  });

  it("pages long chamber rosters and resets the page when the selected region changes", () => {
    const world = electedWorld();
    const { rerender } = render(
      <RegionsPanel query={projectRegions(world, { regionId: "AL" })} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getAllByText("State Senate").find((element) => element.closest("summary"))!.closest("summary")!);
    expect(screen.getByText(/Page 1 of 3 · 35 members/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next State Senate members" }));
    expect(screen.getByText(/Page 2 of 3 · 35 members/)).toBeInTheDocument();

    rerender(
      <RegionsPanel query={projectRegions(world, { regionId: "CA" })} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByText("State Senate").find((element) => element.closest("summary"))!.closest("summary")!);
    expect(screen.getByText(/Page 1 of 4 · 40 members/)).toBeInTheDocument();
  });

  it("shows UK Commons and regional data without inventing a governor", () => {
    const world = createWorld({ era: "1953", countryId: "UK", playerName: "Alex", seed: "regions-panel-uk" });
    render(<RegionsPanel query={projectRegions(world, { regionId: "EMI" })} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "East Midlands" })).toBeInTheDocument();
    expect(screen.getByText("House of Commons")).toBeInTheDocument();
    expect(screen.getByText("Regional Council")).toBeInTheDocument();
    expect(screen.getByText("No regional office recorded.")).toBeInTheDocument();
    expect(screen.getByText("No elections recorded for this region.")).toBeInTheDocument();
    expect(screen.queryByText("House of Representatives")).not.toBeInTheDocument();
  });
});
