import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview } from "../game/worldOverview";
import { WorldPanel } from "./WorldPanel";
import type { WorldOverviewView, WorldPartyRef } from "../game/worldOverview";

const dem: WorldPartyRef = {
  id: "US_DEM",
  name: "Democratic Party",
  abbreviation: "DEM",
  color: "#3B82F6",
};

const rep: WorldPartyRef = {
  id: "US_REP",
  name: "Republican Party",
  abbreviation: "REP",
  color: "#EF4444",
};

function makeOverview(overrides: Partial<WorldOverviewView> = {}): WorldOverviewView {
  return {
    era: "1953",
    turn: 4,
    date: "1953-02-03",
    playerCountryId: "US",
    playerHomeRegionId: "CA",
    nations: [
      {
        id: "US",
        name: "United States",
        playable: true,
        currency: "USD",
        economy: {
          gdpMillions: 387_000,
          growthRate: 0.046,
          inflationRate: 0.0075,
          unemploymentRate: 0.029,
          outputGap: -1.25,
        },
        government: {
          governmentType: "Presidential republic",
          regime: "presidential-republic",
          approval: 56.3,
          legitimacy: 38.5,
          unrest: 8.9,
          status: null,
          formationType: null,
          confidence: null,
          governingParty: null,
          headOfGovernment: null,
          executive: {
            president: { id: "US-1", name: "President Person", party: rep },
            vicePresident: null,
            termStartTurn: 0,
          },
          legislature: {
            name: "Congress",
            bicameral: true,
            chambers: [
              {
                key: "house",
                name: "House of Representatives",
                shortName: "House",
                seats: 435,
                elected: true,
                vacancies: 1,
                seatsByParty: [
                  { party: dem, seats: 213 },
                  { party: rep, seats: 221 },
                ],
              },
            ],
          },
        },
      },
      {
        id: "FR",
        name: "France",
        playable: false,
        currency: "FRF",
        economy: {
          gdpMillions: 47_000,
          growthRate: 0.035,
          inflationRate: 0.025,
          unemploymentRate: 0.02,
          outputGap: 0,
        },
        government: {
          governmentType: null,
          regime: null,
          approval: null,
          legitimacy: null,
          unrest: null,
          status: null,
          formationType: null,
          confidence: null,
          governingParty: null,
          headOfGovernment: null,
          executive: null,
          legislature: null,
        },
      },
    ],
    homeRegion: {
      id: "CA",
      name: "California",
      countryId: "US",
      population: 10_586_223,
      gdpMillions: 38_000,
      houseSeats: 30,
      senateSeats: 40,
      senateClasses: [1, 3],
      censusRegion: "West",
      votingEligiblePopulation: 7_410_356,
      workingAgePopulation: 6_139_009,
      militaryServicePopulation: 0,
      laborForce: 5_000_000,
      capitalStockMillions: 95_000,
      budget: {
        revenue: { councilTax: 1_200, businessRates: 800, grant: 600, total: 2_600 },
        spending: [{ id: "education", label: "Education", amount: 1_500 }],
        spendingTotal: 2_400,
        balance: 200,
        consecutiveDeficits: 0,
      },
      macro: {
        gdpMillions: 387_000,
        growthRate: 0.046,
        inflationRate: 0.0075,
        unemploymentRate: 0.029,
        outputGap: -1.25,
      },
      sectors: [
        { sectorType: "manufacturing", label: "Manufacturing", companyCount: 1, revenue: 12_000, marginPct: 12.5, growthPct: 3.2 },
      ],
      partySupport: [
        { party: dem, organization: 28, registration: 42 },
        { party: rep, organization: 31, registration: 44 },
      ],
      electoratePool: { independent: 8, unregistered: 6 },
      elections: [
        {
          id: "house:US:CA:c1",
          electionType: "house",
          status: "upcoming",
          cycle: 1,
          startTurn: 8,
          primaryEndTurn: 10,
          endTurn: 12,
          totalSeats: 1,
          chamberKey: "house",
          candidates: [
            { id: "US-1", name: "Candidate Person", party: rep, incumbent: true },
          ],
          winnerNames: [],
        },
      ],
      office: {
        kind: "governor",
        holder: null,
        termStartTurn: null,
        availableActions: 3,
        lastAddressTurn: null,
      },
      viewer: { governorOffice: null, myElection: null, myOffice: null },
    },
    ...overrides,
  };
}

describe("WorldPanel", () => {
  it("renders a browsable nation directory with source metrics and available government metadata", () => {
    render(<WorldPanel overview={makeOverview()} section="nations" />);

    expect(screen.getByRole("heading", { name: "Nations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "United States" })).toBeInTheDocument();
    expect(screen.getByText("Browse nations")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Browse nations"));
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText("387,000 million")).toBeInTheDocument();
    expect(screen.getByText("Presidential republic")).toBeInTheDocument();
    expect(screen.getByText("President Person")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search nations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View France details" })).toBeInTheDocument();
    expect(screen.queryByText("No government record.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search nations" }), { target: { value: "France" } });
    expect(screen.queryByRole("option", { name: "View United States details" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View France details" }));
    expect(screen.getByText("No government record.")).toBeInTheDocument();
  });

  it("keeps the nation directory closed until opened with selected details visible", () => {
    render(<WorldPanel overview={makeOverview()} section="nations" />);

    expect(screen.getByRole("heading", { name: "United States" })).toBeVisible();
    const directory = screen.getByText("Browse nations").closest("details");
    expect(directory).not.toBeNull();
    expect(directory).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "View France details" })).not.toBeVisible();
  });

  it("opens, filters, selects, and closes the nation directory", () => {
    render(<WorldPanel overview={makeOverview()} section="nations" />);

    fireEvent.click(screen.getByText("Browse nations"));
    const directory = screen.getByText("Browse nations").closest("details");
    expect(directory).toHaveAttribute("open");
    const summary = screen.getByText("Browse nations");
    expect(summary).toHaveStyle({ minHeight: "44px" });
    expect(screen.getByRole("button", { name: "View France details" })).toHaveStyle({ minHeight: "3.1rem" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search nations" }), { target: { value: "France" } });
    expect(directory).toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: "View United States details" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View France details" }));
    expect(directory).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "France" })).toBeVisible();
    expect(screen.getByText("No government record.")).toBeInTheDocument();
  });

  it("shows the deep-linked nation even while the directory stays closed", () => {
    render(<WorldPanel overview={makeOverview()} section="nations" initialId="FR" />);

    const directory = screen.getByText("Browse nations").closest("details");
    expect(directory).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "France" })).toBeVisible();
    expect(screen.getByText("No government record.")).toBeInTheDocument();
  });

  it("renders home region population, party support, election, and office data", () => {
    render(<WorldPanel overview={makeOverview()} section="state" />);

    expect(screen.getByRole("heading", { name: "California" })).toBeInTheDocument();
    expect(screen.getByText("10,586,223")).toBeInTheDocument();
    expect(screen.getByText("38,000 million")).toBeInTheDocument();
    expect(screen.getByText("Democratic Party")).toBeInTheDocument();
    expect(screen.getByText("28.0% organization")).toBeInTheDocument();
    expect(screen.getByText("42.0% registration")).toBeInTheDocument();
    expect(screen.getByText("Candidate Person")).toBeInTheDocument();
    expect(screen.getByText("Governor")).toBeInTheDocument();
    expect(screen.getByText("Vacant")).toBeInTheDocument();
    expect(screen.getByText("3 actions available")).toBeInTheDocument();
  });

  it("projects all countries and the player's valid home region without mutating the world", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-overview" });
    const before = JSON.stringify(world);
    const overview = projectWorldOverview(world);

    expect(overview.playerCountryId).toBe("US");
    expect(overview.playerHomeRegionId).toBe("AL");
    expect(overview.nations.length).toBe(27);
    expect(overview.nations.find((nation) => nation.id === "US")?.economy.gdpMillions).toBe(387_000);
    expect(overview.nations.find((nation) => nation.id === "US")?.government.governmentType).toBe("Presidential republic");
    expect(overview.nations.find((nation) => nation.id === "FR")?.currency).toBe("FRF");
    expect(overview.homeRegion).toMatchObject({ id: "AL", population: 3_061_743, gdpMillions: 4_500 });
    expect(overview.homeRegion?.partySupport.find((row) => row.party.id === "US_DEM")).toMatchObject({ organization: 36, registration: 67 });
    expect(overview.homeRegion?.office).toMatchObject({ kind: "governor", holder: null, availableActions: 3 });
    expect(JSON.stringify(world)).toBe(before);
  });

  it("uses honest unavailable states when a migrated save has no home region", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "world-overview-empty" });
    const migrated = structuredClone(world);
    migrated.player.homeRegionId = null;
    const overview = projectWorldOverview(migrated);

    expect(overview.playerHomeRegionId).toBeNull();
    expect(overview.homeRegion).toBeNull();

    render(<WorldPanel overview={overview} section="state" />);
    expect(screen.getByText("No home region is recorded for this save.")).toBeInTheDocument();
    expect(screen.getByText("No region detail is available.")).toBeInTheDocument();
  });

  it("shows an honest empty role row and the regional economy surface", () => {
    render(<WorldPanel overview={makeOverview()} section="state" />);

    expect(screen.getByText("You hold no office and have no active race recorded for this region.")).toBeInTheDocument();
    expect(screen.queryByText("Governor Office")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "National macro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Regional budget" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeInTheDocument();
    expect(screen.getByText("Manufacturing")).toBeInTheDocument();
    expect(screen.getByText("5,000,000")).toBeInTheDocument();
  });

  it("renders the role-gated home-region rows and links their destinations", () => {
    const base = makeOverview();
    const overview = makeOverview({
      homeRegion: {
        ...base.homeRegion!,
        viewer: {
          governorOffice: {
            kind: "governor",
            label: "Governor",
            termStartTurn: 96,
            availableActions: 3,
            lastAddressTurn: null,
            destination: { route: "regions", id: "CA" },
          },
          myElection: {
            id: "house:US:CA:c1",
            electionType: "house",
            chamberKey: "house",
            chamberName: "House of Representatives",
            status: "active",
            phase: "primary",
            scope: "region",
            destination: { route: "electionDetails", id: "house:US:CA:c1" },
          },
          myOffice: {
            kind: "legislature",
            label: "House of Representatives",
            detail: "United States",
            destination: { route: "legislature", id: "house" },
          },
        },
      },
    });
    const onNavigate = vi.fn();
    render(<WorldPanel overview={overview} section="state" onNavigate={onNavigate} />);

    expect(screen.getByText("Governor Office")).toBeInTheDocument();
    expect(screen.getByText("My Election")).toBeInTheDocument();
    expect(screen.getByText("My Office")).toBeInTheDocument();
    expect(screen.queryByText("You hold no office and have no active race recorded for this region.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open my active race" }));
    expect(onNavigate).toHaveBeenCalledWith("electionDetails", "house:US:CA:c1");
    fireEvent.click(screen.getByRole("button", { name: "Open my office" }));
    expect(onNavigate).toHaveBeenCalledWith("legislature", "house");
    fireEvent.click(screen.getByRole("button", { name: "Open governor office region" }));
    expect(onNavigate).toHaveBeenCalledWith("regions", "CA");
  });
});

it('keeps US congressional labels out of a UK regional profile', () => {
  const world = createWorld({ era: '1953', countryId: 'UK', playerName: 'Alex', seed: 'uk-region' });
  render(<WorldPanel overview={projectWorldOverview(world)} section="state" />);
  expect(screen.getByRole('heading', { name: 'Regional profile' })).toBeVisible();
  expect(screen.queryByText('Senate seats')).not.toBeInTheDocument();
  expect(screen.queryByText('Senate classes')).not.toBeInTheDocument();
  expect(screen.queryByText('House seats')).not.toBeInTheDocument();
});
