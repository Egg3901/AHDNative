import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("renders the role-gated Governor Office, My Election, and My Office rows with linked destinations", () => {
    const world = electedWorld();
    world.governors.AL.governorId = "player";
    world.governors.AL.governorName = "Muse";
    world.governors.AL.governorParty = "US_DEM";
    world.elections.find((election) => election.id === "house:US:AL:c2")!.candidates.push({
      id: "player",
      name: "Muse",
      partyId: "US_DEM",
      isNPP: false,
      incumbent: false,
    });
    const onNavigate = vi.fn();
    render(
      <RegionsPanel
        query={projectRegions(world, { regionId: "AL" })}
        onQueryChange={vi.fn()}
        directoryOpen={false}
        onDirectoryOpenChange={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("Governor Office")).toBeInTheDocument();
    expect(screen.getByText("My Election")).toBeInTheDocument();
    expect(screen.getByText("My Office")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open my active race" }));
    expect(onNavigate).toHaveBeenCalledWith("electionDetails", "house:US:AL:c2");
    fireEvent.click(screen.getByRole("button", { name: "Open my office" }));
    expect(onNavigate).toHaveBeenCalledWith("legislature", "house");
    fireEvent.click(screen.getByRole("button", { name: "Open governor office region" }));
    expect(onNavigate).toHaveBeenCalledWith("regions", "AL");
  });

  it("shows an honest empty role state and hides the rows the engine cannot support", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regions-panel-role-empty" });
    render(<RegionsPanel query={projectRegions(world)} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);

    expect(screen.getByText("You hold no office and have no active race recorded for this region.")).toBeInTheDocument();
    expect(screen.queryByText("Governor Office")).not.toBeInTheDocument();
    expect(screen.queryByText("My Election")).not.toBeInTheDocument();
    expect(screen.queryByText("My Office")).not.toBeInTheDocument();
  });

  it("renders the regional economy macro, budget, and sector rows", () => {
    const world = electedWorld();
    render(<RegionsPanel query={projectRegions(world, { regionId: "AL" })} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "National macro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Regional budget" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeInTheDocument();
    expect(screen.getAllByText(/revenue/).length).toBeGreaterThan(0);
    expect(screen.getByText("National macro")).toBeInTheDocument();
  });
});

describe("RegionsPanel election labels on 320px phones", () => {
  it("wraps a long chamber name and status badge instead of overflowing the card", () => {
    render(<RegionsPanel query={projectRegions(electedWorld(), { regionId: "AL" })} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);

    const row = screen.getByRole("listitem", { name: "house:US:AL:c1" });
    const name = within(row).getByText("House of Representatives");
    const header = name.closest("div")!;
    expect(header).toHaveStyle({ flexWrap: "wrap" });
    expect(name).toHaveStyle({ minWidth: "0", overflowWrap: "anywhere" });
    expect(within(row).getByText("Resolved").closest("span")).toHaveStyle({ flexShrink: "0" });
  });
});

describe("RegionsPanel dual-pane list/detail (#438)", () => {
  it("exposes directory list and selected-region detail panes sharing one query", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regions-dual-pane" });
    function Harness() {
      const [query, setQuery] = useState(projectRegions(world));
      const [directoryOpen, setDirectoryOpen] = useState(false);
      return (
        <RegionsPanel
          query={query}
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
    expect(screen.getByRole("article", { name: "Alabama" })).toHaveAttribute("data-pane", "detail");
    // One query drives both panes: picking another directory row moves the detail.
    fireEvent.click(screen.getByText("Browse regions"));
    fireEvent.click(screen.getByRole("button", { name: "View California details" }));
    expect(screen.getByRole("article", { name: "California" })).toHaveAttribute("data-pane", "detail");
  });

  it("marks the regions hero and the selected region with the offline identity", () => {
    const world = createWorld({ era: "1979", countryId: "RU", playerName: "Alex", seed: "regions-panel-flag" });
    const { container } = render(<RegionsPanel query={projectRegions(world)} onQueryChange={vi.fn()} directoryOpen={false} onDirectoryOpenChange={vi.fn()} />);
    const hero = container.querySelector(".ahd-hero");
    expect(hero?.querySelector("[data-country-flag]")).not.toBeNull();
    const detail = screen.getByRole("article", { name: "Moscow" });
    expect(detail.querySelector("[data-country-flag]")).not.toBeNull();
    const marks = container.querySelectorAll("[data-country-flag]");
    marks.forEach((mark) => expect(mark.getAttribute("aria-hidden")).toBe("true"));
    expect(container.innerHTML).not.toContain("flagcdn");
    expect(container.innerHTML).not.toContain("wikimedia");
  });
});
