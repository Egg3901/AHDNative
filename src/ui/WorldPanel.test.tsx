import { describe, expect, it } from "vitest";
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
    },
    ...overrides,
  };
}

describe("WorldPanel", () => {
  it("renders a browsable nation directory with source metrics and available government metadata", () => {
    render(<WorldPanel overview={makeOverview()} section="nations" />);

    expect(screen.getByRole("heading", { name: "Nations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "United States" })).toBeInTheDocument();
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
});

it('keeps US congressional labels out of a UK regional profile', () => {
  const world = createWorld({ era: '1953', countryId: 'UK', playerName: 'Alex', seed: 'uk-region' });
  render(<WorldPanel overview={projectWorldOverview(world)} section="state" />);
  expect(screen.getByRole('heading', { name: 'Regional profile' })).toBeVisible();
  expect(screen.queryByText('Senate seats')).not.toBeInTheDocument();
  expect(screen.queryByText('Senate classes')).not.toBeInTheDocument();
  expect(screen.queryByText('House seats')).not.toBeInTheDocument();
});
