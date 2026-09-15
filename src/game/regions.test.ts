import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createWorld,
  deserializeSave,
  serializeSave,
  type WorldState,
} from "@ahdclient/engine";
import { GameSession } from "./session";
import {
  REGION_DIRECTORY_PAGE_SIZE,
  REGION_ELECTION_PAGE_SIZE,
  projectRegions,
} from "./regions";

const SAVED_AT = "2026-09-10T00:00:00.000Z";
const ELECTED = new URL("../../fixtures/career-elected-1953-US.save.json.gz", import.meta.url);

function electedWorld(): WorldState {
  return deserializeSave(gunzipSync(readFileSync(ELECTED)).toString("utf8"));
}

describe("projectRegions", () => {
  it("projects recorded regional metrics without attaching mutable engine state", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regional-order-projection" });
    (world.regionalMetrics ??= {}).AL = { "economic.unemploymentRate": { value: 9.92 } };

    const view = projectRegions(world, { regionId: "AL" });

    expect(view.selected?.metrics).toEqual({ "economic.unemploymentRate": 9.92 });
    view.selected!.metrics["economic.unemploymentRate"] = 99;
    expect(world.regionalMetrics.AL["economic.unemploymentRate"]?.value).toBe(9.92);
  });

  it("keeps country-scoped browsing detached from home after one turn and save/reload", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", playerName: "Alex", seed: "region-depth" });
    session.advance();
    const saved = session.serialize(SAVED_AT);
    const world = deserializeSave(saved);
    const home = world.player.homeRegionId;
    expect(home).toBe("AL");

    const view = projectRegions(world, { regionId: "CA" });
    expect(view.playerCountryId).toBe("US");
    expect(view.playerHomeRegionId).toBe("AL");
    expect(view.selected?.id).toBe("CA");
    expect(view.selected?.isHome).toBe(false);
    expect(view.directory.some((row) => row.id === "CA")).toBe(true);
    expect(view.directory.every((row) => !row.id.startsWith("LON"))).toBe(true);
    expect(world.player.homeRegionId).toBe("AL");
    expect(world.player.countryId).toBe("US");

    view.directory.length = 0;
    if (view.selected) view.selected.name = "Changed display";
    expect(deserializeSave(session.serialize(SAVED_AT)).player.homeRegionId).toBe("AL");

    const loaded = new GameSession();
    loaded.load(saved);
    const resumed = projectRegions(deserializeSave(loaded.serialize(SAVED_AT)), { regionId: "CA" });
    expect(resumed.playerHomeRegionId).toBe("AL");
    expect(resumed.selected?.id).toBe("CA");
    expect(resumed.selected?.elections.length).toBeGreaterThan(0);
  });

  it("paginates and filters the player-country directory", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "region-dir" });
    const all = projectRegions(world);
    expect(all.directoryTotal).toBe(48);
    expect(all.directoryPageSize).toBe(REGION_DIRECTORY_PAGE_SIZE);
    expect(all.directory).toHaveLength(REGION_DIRECTORY_PAGE_SIZE);
    expect(all.directoryPageCount).toBe(3);
    expect(all.selected?.id).toBe("AL");
    expect(all.directory[0]?.id).toBe("AL");

    const page2 = projectRegions(world, { directoryPage: 1 });
    expect(page2.directory).toHaveLength(REGION_DIRECTORY_PAGE_SIZE);
    expect(page2.directory[0]?.id).not.toBe(all.directory[0]?.id);
    expect(page2.selected?.id).toBe("AL");

    const page3 = projectRegions(world, { directoryPage: 2 });
    expect(page3.directory).toHaveLength(8);

    const filtered = projectRegions(world, { directoryQuery: "calif" });
    expect(filtered.directory.map((row) => row.id)).toEqual(["CA"]);
    expect(filtered.directoryTotal).toBe(1);
    expect(filtered.directory[0]).toMatchObject({ name: "California", isHome: false, population: 10_586_223 });
  });

  it("ignores a selected region outside the player's country", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "region-scope" });
    const view = projectRegions(world, { regionId: "LON" });
    expect(view.selected?.id).toBe("AL");
    expect(view.selected?.countryId).toBe("US");
    expect(view.directory.some((row) => row.id === "LON")).toBe(false);
  });

  it("projects a genuine elected US office, chambers, and races without inventing holders", () => {
    const world = electedWorld();
    const view = projectRegions(world, { regionId: "AL" });
    expect(view.turn).toBe(98);
    expect(view.currency).toBe("USD");
    expect(view.selected?.office).toMatchObject({
      kind: "governor",
      holder: { id: "US-CH:governor:US:AL:c1:US_DEM:0", name: "Janet Rodriguez" },
      termStartTurn: 96,
      availableActions: 3,
    });
    expect(view.selected?.office?.holder?.party?.id).toBe("US_DEM");
    expect(view.selected?.senateClasses).toEqual([2, 3]);

    const names = view.selected?.chambers.map((chamber) => chamber.name) ?? [];
    expect(names).toContain("House of Representatives");
    expect(names).toContain("Senate");
    expect(names).toContain("State Senate");
    const house = view.selected?.chambers.find((chamber) => chamber.key === "house");
    expect(house).toMatchObject({ seats: 9, seatedCount: 9, elected: true });
    expect(house?.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "player", name: "Muse", party: expect.objectContaining({ id: "US_DEM" }) }),
    ]));
    expect(house?.members.some((member) => member.id.startsWith("US-"))).toBe(true);
    const senate = view.selected?.chambers.find((chamber) => chamber.key === "senate");
    expect(senate?.seats).toBe(2);
    expect(senate?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "US-435", name: "Lin Chase", senateClass: 2 }),
        expect.objectContaining({ id: "US-436", name: "Teresa Greco", senateClass: 3 }),
      ]),
    );

    const races = view.selected?.elections ?? [];
    expect(view.selected?.electionTotal).toBe(9);
    expect(races.some((race) => race.id === "governor:US:AL:c1" && race.winnerNames.includes("Janet Rodriguez"))).toBe(true);
    expect(races.find((race) => race.chamberKey === "house")?.chamberName).toBe("House of Representatives");
    expect(races.every((race) => race.previewNames.length <= 3)).toBe(true);

    const active = projectRegions(world, { regionId: "AL", electionStatus: "active" });
    expect(active.selected?.electionTotal).toBe(5);
    expect(active.selected?.elections.every((race) => race.status === "active")).toBe(true);

    const paged = projectRegions(world, { regionId: "AL", electionPageSize: 3, electionPage: 1 });
    expect(paged.selected?.electionPageSize).toBe(3);
    expect(paged.selected?.elections).toHaveLength(3);
    expect(paged.selected?.electionPageCount).toBe(3);
    expect(paged.selected?.elections[0]?.id).not.toBe(races[0]?.id);
  });

  it("uses chamber names for a fresh UK region and omits US congressional labels and offices", () => {
    const world = createWorld({ era: "1953", countryId: "UK", playerName: "Alex", seed: "region-uk" });
    const view = projectRegions(world, { regionId: "EMI" });
    expect(view.playerCountryId).toBe("UK");
    expect(view.currency).toBe("GBP");
    expect(view.directoryTotal).toBe(12);
    expect(view.selected).toMatchObject({
      id: "EMI",
      name: "East Midlands",
      countryId: "UK",
      isHome: true,
      population: 3_200_000,
      senateClasses: null,
      office: null,
    });
    expect(view.selected?.economy.currency).toBe("GBP");
    expect(view.selected?.economy.gdpMillions).toBe(1100);
    expect(view.selected?.economy.budget?.revenue.total).toBeGreaterThan(0);

    const names = view.selected?.chambers.map((chamber) => chamber.name) ?? [];
    expect(names).toContain("House of Commons");
    expect(names).toContain("Regional Council");
    expect(names).not.toContain("House of Representatives");
    expect(names).not.toContain("Senate");
    expect(names).not.toContain("State Senate");
    expect(view.selected?.chambers.find((chamber) => chamber.key === "commons")).toMatchObject({
      seats: 37,
      seatedCount: 0,
      members: [],
    });
    expect(view.selected?.chambers.find((chamber) => chamber.key === "regionalCouncil")?.seats).toBe(39);
    expect(view.selected?.elections).toEqual([]);
    expect(view.selected?.electionTotal).toBe(0);
    expect(view.selected?.demographics.censusRegion).toBeNull();
    expect(view.selected?.partySupport.some((row) => row.party.id === "UK_LAB")).toBe(true);
  });

  it("records vacant US office and empty races on a fresh world without inventing holders", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "region-fresh-us" });
    const view = projectRegions(world);
    expect(view.selected?.office).toMatchObject({
      kind: "governor",
      holder: null,
      termStartTurn: null,
      availableActions: 3,
    });
    expect(view.selected?.elections).toEqual([]);
    expect(view.selected?.electionTotal).toBe(0);
    expect(view.selected?.demographics.censusRegion).toBe("Southeast");
    expect(view.selected?.demographics.groups.length).toBeGreaterThan(0);
    expect(view.selected?.economy.currency).toBe("USD");
    const before = JSON.stringify(world);
    view.selected!.name = "Changed display";
    expect(JSON.stringify(world)).toBe(before);
  });

  it("clamps empty pages and unknown election status instead of inventing rows", () => {
    const world = electedWorld();
    const empty = projectRegions(world, { directoryQuery: "zz-no-region", directoryPage: 4 });
    expect(empty.directory).toEqual([]);
    expect(empty.directoryTotal).toBe(0);
    expect(empty.directoryPage).toBe(0);
    expect(empty.selected?.id).toBe("AL");

    const races = projectRegions(world, { regionId: "AL", electionStatus: "upcoming" });
    expect(races.selected?.electionTotal).toBe(0);
    expect(races.selected?.elections).toEqual([]);
    expect(races.selected?.electionPageSize).toBe(REGION_ELECTION_PAGE_SIZE);
  });

  it("filters elections by recorded chamber name and keeps WorldState off the DTO", () => {
    const world = electedWorld();
    const view = projectRegions(world, { regionId: "AL", electionQuery: "house of representatives" });
    expect(view.selected?.electionTotal).toBeGreaterThan(0);
    expect(view.selected?.elections.every((race) => race.chamberName === "House of Representatives")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(view, "world")).toBe(false);
    expect(JSON.parse(JSON.stringify(view)).selected.id).toBe("AL");
  });

  it("does not place a US region in a UK directory, including by name search", () => {
    const world = createWorld({ era: "1953", countryId: "UK", playerName: "Alex", seed: "region-uk-dir" });
    const all = projectRegions(world);
    expect(all.directory.map((row) => row.id)).not.toEqual(expect.arrayContaining(["AL", "CA"]));
    expect(all.directoryTotal).toBe(12);
    expect(all.selected?.countryId).toBe("UK");

    const filtered = projectRegions(world, { directoryQuery: "alabama" });
    expect(filtered.directory).toEqual([]);
    expect(filtered.directoryTotal).toBe(0);
    expect(filtered.selected?.id).toBe(all.playerHomeRegionId);
    expect(filtered.selected?.countryId).toBe("UK");
  });

  it("keeps a migrated save's missing home region honest", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "region-null-home" });
    const saved = JSON.parse(serializeSave(world, SAVED_AT)) as { world: WorldState };
    saved.world.player.homeRegionId = null;

    const migrated = deserializeSave(JSON.stringify(saved));
    const view = projectRegions(migrated);

    expect(view.playerHomeRegionId).toBeNull();
    expect(view.selected?.id).toBe("AL");
    expect(view.selected?.isHome).toBe(false);
  });

  it("shows the Governor Office row only when the player holds that region's office", () => {
    const world = electedWorld();
    // Fixture: AL governor is the NPC Janet Rodriguez, so no player office row.
    expect(projectRegions(world, { regionId: "AL" }).selected?.viewer.governorOffice).toBeNull();
    // CA has no governor record at all on a fresh 1953 save.
    expect(projectRegions(createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "gov-row" }), { regionId: "CA" }).selected?.viewer.governorOffice).toBeNull();

    const held = structuredClone(world);
    held.governors.AL.governorId = "player";
    held.governors.AL.governorName = "Muse";
    held.governors.AL.governorParty = "US_DEM";
    const view = projectRegions(held, { regionId: "AL" });
    expect(view.selected?.viewer.governorOffice).toEqual({
      kind: "governor",
      label: "Governor",
      termStartTurn: 96,
      availableActions: 3,
      lastAddressTurn: null,
      destination: { route: "regions", id: "AL" },
    });
    // Browsing another region never claims the office.
    expect(projectRegions(held, { regionId: "CA" }).selected?.viewer.governorOffice).toBeNull();
  });

  it("shows My Election only for an eligible active race and clears once it resolves", () => {
    const world = electedWorld();
    expect(projectRegions(world, { regionId: "AL" }).selected?.viewer.myElection).toBeNull();

    const entered = structuredClone(world);
    const race = entered.elections.find((election) => election.id === "house:US:AL:c2")!;
    race.candidates.push({ id: "player", name: "Muse", partyId: "US_DEM", isNPP: false, incumbent: false });

    const view = projectRegions(entered, { regionId: "AL" });
    expect(view.selected?.viewer.myElection).toEqual({
      id: "house:US:AL:c2",
      electionType: "house",
      chamberKey: "house",
      chamberName: "House of Representatives",
      status: "active",
      phase: "primary",
      scope: "region",
      destination: { route: "electionDetails", id: "house:US:AL:c2" },
    });

    const resolved = structuredClone(entered);
    resolved.elections.find((election) => election.id === "house:US:AL:c2")!.status = "resolved";
    expect(projectRegions(resolved, { regionId: "AL" }).selected?.viewer.myElection).toBeNull();

    const reloaded = deserializeSave(serializeSave(entered, SAVED_AT));
    expect(projectRegions(reloaded, { regionId: "AL" }).selected?.viewer.myElection?.id).toBe("house:US:AL:c2");
  });

  it("shows My Office for the current holder and follows a cabinet appointment", () => {
    const world = electedWorld();
    // Player holds a US house seat won in AL: the office row follows the region.
    expect(projectRegions(world, { regionId: "AL" }).selected?.viewer.myOffice).toEqual({
      kind: "legislature",
      label: "House of Representatives",
      detail: "United States",
      destination: { route: "legislature", id: "house" },
    });
    // A region the player was not elected in keeps the row hidden.
    expect(projectRegions(world, { regionId: "CA" }).selected?.viewer.myOffice).toBeNull();

    const cabinet = structuredClone(world);
    cabinet.cabinetMembers.push({
      countryId: "US",
      positionId: "secretaryOfState",
      characterId: "player",
      characterName: "Muse",
      partyId: "US_DEM",
      appointedBy: "US-1",
      appointedAtTurn: 90,
      confirmedAtTurn: 95,
    });
    const view = projectRegions(cabinet, { regionId: "CA" });
    expect(view.selected?.viewer.myOffice).toEqual({
      kind: "cabinet",
      label: "Secretary Of State",
      detail: "United States",
      destination: { route: "profile" },
    });

    // Head-of-state mode with no seat/cabinet is the other recorded office.
    const hos = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "my-office-hos" });
    hos.player.mode = "hos";
    expect(projectRegions(hos).selected?.viewer.myOffice).toEqual({
      kind: "headOfState",
      label: "Head of state",
      detail: "United States",
      destination: { route: "policy" },
    });
  });

  it("projects per-region capital stock, national macro, and country sectors without inventing values", () => {
    const world = electedWorld();
    const view = projectRegions(world, { regionId: "AL" });
    const economy = view.selected!.economy;
    expect(economy.capitalStockMillions).toBeCloseTo(13371.22, 1);
    expect(economy.macro).toEqual({
      gdpMillions: 406994.1,
      growthRate: 0.0224,
      inflationRate: 0.0228,
      unemploymentRate: 0.0103,
      outputGap: 1.737,
    });
    expect(economy.sectors.length).toBeGreaterThan(0);
    expect(economy.sectors.every((sector) => Number.isFinite(sector.revenue))).toBe(true);
    expect(economy.sectors.map((sector) => sector.sectorType)).toEqual(
      expect.arrayContaining(["financial", "manufacturing"]),
    );
    for (let i = 1; i < economy.sectors.length; i += 1) {
      expect(economy.sectors[i - 1]!.revenue).toBeGreaterThanOrEqual(economy.sectors[i]!.revenue);
    }

    // A save without the macro/region series stays honestly null/empty, not zero.
    const bare = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "economy-empty" });
    bare.capitalStock = {};
    bare.corporations = {};
    const bareView = projectRegions(bare);
    expect(bareView.selected?.economy.capitalStockMillions).toBeNull();
    expect(bareView.selected?.economy.sectors).toEqual([]);
  });

  it("keeps the projected role rows detached from the world", () => {
    const world = electedWorld();
    const held = structuredClone(world);
    held.governors.AL.governorId = "player";
    const before = JSON.stringify(held);
    const view = projectRegions(held, { regionId: "AL" });
    view.selected!.viewer.governorOffice = null;
    view.selected!.viewer = { governorOffice: null, myElection: null, myOffice: null };
    view.selected!.economy.sectors.length = 0;
    expect(JSON.stringify(held)).toBe(before);
  });
});
