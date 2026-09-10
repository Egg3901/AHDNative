import { describe, it, expect } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { GovernmentState } from "../government/types.js";

/**
 * Player action refresh with office/role bonuses (#31).
 * Seams: engine createWorld/advanceTurn/serializeSave/deserializeSave.
 * Independent expectations from AHDGame src/lib/turn/actionRefresh.ts,
 * officeActionBonus.ts, officeBonusRegistry.ts and the default game config
 * (src/app/api/admin/config/init/route.ts) at d4baf899.
 */
const OPTS = { seed: "p31-player-actions", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("player action refresh office bonus", () => {
  it("grants the configured senate seat bonus on the same turn", () => {
    const world = createWorld(OPTS);
    world.player.actions = 5;
    world.player.legislativeSeat = { chamberKey: "senate", countryId: "US" };
    advanceTurn(world);
    // base 4 + senate 2 (default config) = 6; 5 + 6 = 11
    expect(world.player.actions).toBe(11);
  });

  it("refreshes base 4 only for an ordinary character", () => {
    const world = createWorld(OPTS);
    world.player.actions = 5;
    advanceTurn(world);
    expect(world.player.actions).toBe(9);
  });

  it("grants the president bonus from the executive record", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.executives["US"] = {
      countryId: "US", presidentId: "player", presidentParty: null,
      termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null,
    };
    advanceTurn(world);
    // base 4 + president 4 = 8; 10 + 8 = 18
    expect(world.player.actions).toBe(18);
  });

  it("grants the vice president bonus from the executive record", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.executives["US"] = {
      countryId: "US", presidentId: "US-1", presidentParty: null,
      termStartTurn: 0, vicePresidentId: "player", vicePresidentParty: null,
    };
    advanceTurn(world);
    // base 4 + vicePresident 2 = 6; 10 + 6 = 16
    expect(world.player.actions).toBe(16);
  });

  it("grants the head-of-government bonus from the government record", () => {
    const world = createWorld({ ...OPTS, countryId: "UK" });
    world.player.actions = 10;
    const government: GovernmentState = {
      countryId: "UK", chamberKey: "commons", status: "formed", formationType: "majority",
      governingPartyId: "LAB", coalitionPartyIds: null, pmPoliticianId: "player",
      totalSeatsSupporting: 300, majorityThreshold: 250, totalSeats: 500,
      seatsByParty: {}, lostMajority: false, formedTurn: 0,
      snapElectionsUsed: 0, lastSnapElectionTurn: null,
      pmVacancyDeadlineTurn: null, confidence: 75,
    };
    world.governments["UK"] = government;
    advanceTurn(world);
    // base 4 + primeMinister 4 = 8; 10 + 8 = 18
    expect(world.player.actions).toBe(18);
  });

  it("stops the executive grant when the government is pending", () => {
    const world = createWorld({ ...OPTS, countryId: "UK" });
    world.player.actions = 10;
    world.governments.UK = {
      ...world.governments.UK!, status: "pending", pmPoliticianId: "player",
      pmVacancyDeadlineTurn: 100,
    };
    advanceTurn(world);
    // A stale former holder is not a current office; base4 only.
    expect(world.player.actions).toBe(14);
  });

  it("uses the configured governor value, not the lower registry value", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    const stateId = Object.keys(world.governors)[0]!;
    world.governors[stateId] = { ...world.governors[stateId]!, governorId: "player" };
    advanceTurn(world);
    // base 4 + governor 3 (default config wins over registry 2) = 7; 10 + 7 = 17
    expect(world.player.actions).toBe(17);
  });

  it("keeps the seat bonus for a cabinet member and counts the cabinet key once", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.legislativeSeat = { chamberKey: "house", countryId: "US" };
    world.cabinetMembers.push({
      countryId: "US", positionId: "secretary_of_state", characterId: "player",
      characterName: "Tester", partyId: null, appointedBy: "US-1",
      appointedAtTurn: 0, confirmedAtTurn: 0,
    });
    advanceTurn(world);
    // base 4 + house seat 1 + usCabinet 0 (unknown key, never doubled) = 5; 10 + 5 = 15
    expect(world.player.actions).toBe(15);
  });

  it("resolves unknown office keys to zero instead of failing", () => {
    const world = createWorld(OPTS);
    world.player.actions = 5;
    world.player.legislativeSeat = { chamberKey: "retiredOffice", countryId: "US" };
    advanceTurn(world);
    expect(world.player.actions).toBe(9);
  });

  it("saturates at the energy-baseline cap and applies the hoard penalty", () => {
    const capped = createWorld(OPTS);
    capped.player.actions = 197;
    capped.executives["US"] = {
      countryId: "US", presidentId: "player", presidentParty: null,
      termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null,
    };
    advanceTurn(capped);
    // 197 - 4 (hoard over 100) + 8 (base 4 + president 4) = 201 -> cap 200
    expect(capped.player.actions).toBe(200);

    const hoarder = createWorld(OPTS);
    hoarder.player.actions = 150;
    advanceTurn(hoarder);
    // 150 - 4 (hoard over 100) + 4 (base) = 150
    expect(hoarder.player.actions).toBe(150);
  });

  it("never drops below zero and keeps office bonuses across save/resume", () => {
    const world = createWorld(OPTS);
    world.player.actions = 0;
    advanceTurn(world);
    expect(world.player.actions).toBe(4);

    const officeWorld = createWorld(OPTS);
    officeWorld.player.actions = 5;
    officeWorld.player.legislativeSeat = { chamberKey: "senate", countryId: "US" };
    const resumed = deserializeSave(serializeSave(officeWorld, "2026-01-01T00:00:00.000Z"));
    advanceTurn(resumed);
    expect(resumed.player.actions).toBe(11);
  });
});
