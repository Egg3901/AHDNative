import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createWorld, serializeSave, type Bill } from "@ahdclient/engine";
import { GameSession } from "./session";
import {
  billStatusLabel,
  buildChamberNavigation,
  loadLegislatureNav,
  nextProceduralStep,
  saveLegislatureNav,
  type LegislatureNavStorage,
} from "./legislature";

const options = { era: "1953", countryId: "US", seed: "native-legislature-v1", playerName: "Alex" };
const savedAt = "2026-09-10T00:00:00.000Z";

describe("legislature through the session contract", () => {
  it("shows country proposals but requires office before sponsoring", () => {
    const session = new GameSession();
    const view = session.create(options);
    expect(view.legislature.office).toBeNull();
    expect(view.legislature.sponsor).toMatchObject({ available: false, disabledReason: "Win a legislative seat before sponsoring a bill." });
    expect(view.legislature.proposals).toContainEqual(expect.objectContaining({ id: "us.economy.workerSecurity.primary" }));
    expect(view.legislature.proposals.some((p) => p.id.startsWith("uk.") || p.id.startsWith("us.tax."))).toBe(false);
    const before = session.serialize(savedAt);
    expect(session.act("sponsorBill", { catalogId: "us.economy.workerSecurity.primary" }).ok).toBe(false);
    expect(session.serialize(savedAt)).toBe(before);
  });
  it("loads a government save, sponsors a real bill and preserves its separate voting gate", () => {
    const session = new GameSession();
    session.load(serializeSave(createWorld({ ...options, mode: "hos" }), savedAt));
    expect(session.view().legislature.office).toBe("Head of state");
    expect(session.act("sponsorBill", { catalogId: "us.economy.workerSecurity.primary" }).ok).toBe(true);
    const bill = session.view().legislature.bills.find((b) => b.sponsorName === "Alex")!;
    expect(bill).toMatchObject({ title: "Fair Labor Standards and Employment Security Act", status: "proposed", playerVote: null });
    expect(session.view().legislature.sponsor.available).toBe(false);
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt)); loaded.advance();
    expect(loaded.view().legislature.bills.find((b) => b.id === bill.id)).toMatchObject({ status: "active", voting: { available: false } });
    expect(loaded.view().legislature.sponsor).toMatchObject({ available: false, disabledReason: "Available in 1 turn." });
    loaded.advance();
    expect(loaded.view().legislature.sponsor.available).toBe(true);
    const before = loaded.serialize(savedAt);
    expect(loaded.act("voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(false);
    expect(loaded.serialize(savedAt)).toBe(before);
  });
  it("resolves the historical fixture after the primary nominee transition", () => {
    const session = new GameSession();
    const raw = gunzipSync(readFileSync(new URL("../../fixtures/career-t95-1953-US.save.json.gz", import.meta.url))).toString("utf8");
    session.load(raw);
    expect(session.view().legislature.office).toBeNull();
    // Frozen Senate tally from the pinned oracle fixture, not its House tally.
    expect(session.view().legislature.bills.find((b) => b.id === "bill-79-6-us.economy.stability.primary"))
      .toMatchObject({ chamber: "Senate", votesFor: 52, votesAgainst: 27, votesAbstain: 16 });
    const afterElection = session.advance();
    expect(afterElection.turn).toBe(96);
    expect(afterElection.legislature.office).toBe("House of Representatives · United States");
    const race = afterElection.elections.find((e) => e.id === "house:US:AL:c1");
    expect(race?.candidateNames).toEqual(["Priya Russell", "Muse"]);
    expect(race?.winnerNames).toEqual([
      "Muse", "Priya Russell",
    ]);
    expect(session.act("sponsorBill", { catalogId: "us.economy.workerSecurity.primary" }).ok).toBe(true);
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt));
    expect(loaded.view().legislature.office).toBe("House of Representatives · United States");
    expect(loaded.view().elections.find((e) => e.id === race?.id)?.winnerNames).toEqual(race?.winnerNames);
  }, 20_000);
});

describe("legislature navigation through the session boundary", () => {
  it("projects configured chambers, seeded committees, and an empty floor for a fresh world", () => {
    const session = new GameSession();
    session.create(options);
    const legislature = session.view().legislature;
    expect(legislature.countryId).toBe("US");
    const house = legislature.chambers?.find((c) => c.key === "house");
    expect(house).toMatchObject({ name: "House of Representatives", shortName: "House", seats: 435, elected: true });
    expect(legislature.chambers?.map((c) => c.key)).toContain("senate");
    expect(legislature.committees?.map((c) => c.id)).toContain("com-US-house-finance");
    expect(legislature.schedule).toEqual([]);
  });

  it("projects engine seat composition with party colors for the seating diagram", () => {
    const session = new GameSession();
    session.create(options);
    const legislature = session.view().legislature;
    const house = legislature.chambers?.find((c) => c.key === "house")!;
    expect(house.seats).toBe(435);
    expect(house.seatsByParty?.length).toBeGreaterThan(0);
    for (const group of house.seatsByParty ?? []) {
      expect(group.partyId).toEqual(expect.any(String));
      expect(group.name).toEqual(expect.any(String));
      expect(group.seats).toEqual(expect.any(Number));
      expect(group.seats).toBeGreaterThanOrEqual(0);
    }
    // Authored 1953 House composition: 213 + 221 party seats plus 1 vacancy.
    const partyTotal = (house.seatsByParty ?? []).reduce((sum, group) => sum + group.seats, 0);
    expect(partyTotal + (house.vacancies ?? 0)).toBe(house.seats);
    expect(house.seatsByParty).toContainEqual(
      expect.objectContaining({ partyId: "US_DEM", seats: 213, color: expect.any(String) }),
    );
  });

  it("projects seat shares left to right from a synthetic world without inventing seats", () => {
    const world = {
      legislatures: {
        US: {
          chambers: [
            {
              key: "house", name: "House of Representatives", shortName: "House",
              seats: 435, elected: true, description: null,
              composition: { seatsByParty: { US_DEM: 213, US_REP: 221, GHOST: 0 }, vacancies: 1 },
            },
          ],
        },
      },
      parties: {
        US_DEM: { id: "US_DEM", name: "Democrats", color: "#0000ff", economicPosition: -3 },
        US_REP: { id: "US_REP", name: "Republicans", color: "#ff0000", economicPosition: 3 },
      },
      bills: [],
    } as any;
    const house = buildChamberNavigation(world, "US").find((c) => c.key === "house")!;
    // Null economic position sorts as 0 (center), like the reference sortLR.
    expect(house.seatsByParty!.map((g) => g.partyId)).toEqual(["US_DEM", "GHOST", "US_REP"]);
    expect(house.seatsByParty).toContainEqual(
      expect.objectContaining({ partyId: "US_DEM", name: "Democrats", color: "#0000ff", economicPosition: -3, seats: 213 }),
    );
    expect(house.seatsByParty!.find((g) => g.partyId === "GHOST")).toMatchObject({ name: "GHOST", color: null });
    const partyTotal = house.seatsByParty!.reduce((sum, group) => sum + group.seats, 0);
    expect(partyTotal + house.vacancies!).toBe(house.seats);
    expect(buildChamberNavigation(world, "XX")).toEqual([]);
  });

  it("leaves composition fields absent when the engine recorded none", () => {
    const world = {
      legislatures: {
        US: {
          chambers: [
            { key: "house", name: "House", shortName: "House", seats: 10, elected: true, description: null },
            {
              key: "senate", name: "Senate", shortName: "Senate",
              seats: 10, elected: true, description: null, composition: null,
            },
          ],
        },
      },
      parties: {},
      bills: [],
    } as any;
    const [house, senate] = buildChamberNavigation(world, "US");
    expect("seatsByParty" in house).toBe(false);
    expect("vacancies" in house).toBe(false);
    expect(house.seatsByParty).toBeUndefined();
    expect(house.vacancies).toBeUndefined();
    expect(senate.seatsByParty).toBeUndefined();
    expect(senate.vacancies).toBeUndefined();
  });

  it("sanitizes seat counts and vacancies to finite nonnegative integers", () => {
    const world = {
      legislatures: {
        US: {
          chambers: [
            {
              key: "house", name: "House", shortName: "House",
              seats: 10, elected: true, description: null,
              composition: {
                seatsByParty: { A: 4.9, B: -3, C: NaN, D: Infinity, E: 2 },
                vacancies: 2.9,
              },
            },
            {
              key: "senate", name: "Senate", shortName: "Senate",
              seats: 10, elected: true, description: null,
              composition: { seatsByParty: { A: 3 }, vacancies: -4 },
            },
            {
              key: "council", name: "Council", shortName: "Council",
              seats: 10, elected: true, description: null,
              composition: { seatsByParty: { A: 3 }, vacancies: NaN },
            },
          ],
        },
      },
      parties: {},
      bills: [],
    } as any;
    const [house, senate, council] = buildChamberNavigation(world, "US");
    expect(house.seatsByParty).toContainEqual(expect.objectContaining({ partyId: "A", seats: 4 }));
    expect(house.seatsByParty).toContainEqual(expect.objectContaining({ partyId: "B", seats: 0 }));
    expect(house.seatsByParty).toContainEqual(expect.objectContaining({ partyId: "C", seats: 0 }));
    expect(house.seatsByParty).toContainEqual(expect.objectContaining({ partyId: "D", seats: 0 }));
    expect(house.vacancies).toBe(2);
    expect(senate.vacancies).toBe(0);
    expect(council.vacancies).toBe(0);
    for (const chamber of [house, senate, council]) {
      for (const group of chamber.seatsByParty ?? []) {
        expect(Number.isInteger(group.seats)).toBe(true);
        expect(group.seats).toBeGreaterThanOrEqual(0);
      }
      expect(Number.isInteger(chamber.vacancies)).toBe(true);
      expect(chamber.vacancies).toBeGreaterThanOrEqual(0);
    }
  });

  it("links sponsorship and the floor schedule to the selected chamber across a turn", () => {
    const session = new GameSession();
    session.load(serializeSave(createWorld({ ...options, mode: "hos" }), savedAt));
    expect(session.act("sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
      originChamber: "house",
    }).ok).toBe(true);
    const bill = session.view().legislature.bills.find((b) => b.sponsorName === "Alex")!;
    expect(bill.chamberKey).toBe("house");
    expect(bill.chamber).toBe("House of Representatives");

    const proposed = session.view().legislature.schedule?.find((s) => s.billId === bill.id)!;
    expect(proposed).toMatchObject({ status: "proposed", statusLabel: "Proposed", chamberKey: "house", dueTurn: null });

    const next = session.advance();
    const entry = next.legislature.schedule?.find((s) => s.billId === bill.id)!;
    expect(entry.status).toBe("active");
    expect(entry.nextAction).toMatch(/vote closes/i);
    expect(entry.dueTurn).not.toBeNull();
    const finance = next.legislature.committees?.find((c) => c.id === "com-US-house-finance")!;
    expect(finance.activeBillIds).toContain(bill.id);
  });
});

describe("bill status labels and next procedural action", () => {
  it("maps engine statuses to reference labels and derives the next step from timers", () => {
    expect(billStatusLabel("active")).toBe("Voting Open");
    expect(billStatusLabel("active_other")).toBe("2nd Chamber");
    expect(billStatusLabel("enrolled")).toBe("Awaiting President");
    expect(billStatusLabel("mystery")).toBe("mystery");

    const active = nextProceduralStep({ status: "active", votingEndsOnTurn: 7 } as unknown as Bill);
    expect(active).toMatchObject({ statusLabel: "Voting Open", nextAction: "Origin-chamber vote closes", dueTurn: 7 });
    const enrolled = nextProceduralStep({ status: "enrolled", presidentActionDeadlineOnTurn: 9 } as unknown as Bill);
    expect(enrolled.nextAction).toMatch(/Executive signature/i);
    expect(enrolled.dueTurn).toBe(9);
    const signed = nextProceduralStep({ status: "signed" } as unknown as Bill);
    expect(signed).toMatchObject({ statusLabel: "Signed", nextAction: "No further procedural action", dueTurn: null });
  });
});

describe("legislature navigation context persistence", () => {
  function memoryStorage(): LegislatureNavStorage {
    const entries = new Map<string, string>();
    return {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => { entries.set(key, value); },
    };
  }

  it("round-trips the selected chamber and bill per country", () => {
    const storage = memoryStorage();
    expect(loadLegislatureNav("US", storage)).toEqual({ chamberKey: null, billId: null });
    saveLegislatureNav("US", { chamberKey: "senate", billId: "bill-1" }, storage);
    saveLegislatureNav("UK", { chamberKey: "commons", billId: null }, storage);
    expect(loadLegislatureNav("US", storage)).toEqual({ chamberKey: "senate", billId: "bill-1" });
    expect(loadLegislatureNav("UK", storage)).toEqual({ chamberKey: "commons", billId: null });
    expect(loadLegislatureNav("DD", storage)).toEqual({ chamberKey: null, billId: null });
  });

  it("treats missing countries, absent storage, and corrupt data as an empty context", () => {
    expect(loadLegislatureNav(undefined, memoryStorage())).toEqual({ chamberKey: null, billId: null });
    expect(loadLegislatureNav("US", null)).toEqual({ chamberKey: null, billId: null });
    const corrupt: LegislatureNavStorage = { getItem: () => "{not json", setItem: () => {} };
    expect(loadLegislatureNav("US", corrupt)).toEqual({ chamberKey: null, billId: null });
    saveLegislatureNav(undefined, { chamberKey: "x", billId: null }, corrupt);
  });
});
