import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import type { CabinetMember } from "./types.js";
import {
  MINISTERIAL_ACTION_CAP,
  MINISTERIAL_ACTION_REFILL_INTERVAL,
  spendMinisterialAction,
  withMinisterialAction,
} from "./ministerialActionPool.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-260", playerName: "Alex" } as const;

function member(overrides: Partial<CabinetMember> = {}): CabinetMember {
  return {
    countryId: "US",
    positionId: "secretary_of_state",
    characterId: "player",
    characterName: "Alex",
    partyId: "US_DEM",
    appointedBy: null,
    appointedAtTurn: 0,
    confirmedAtTurn: 0,
    ...overrides,
  };
}

describe("#260 ministerial action pool", () => {
  it("backfills legacy cabinet members without inventing spent actions", () => {
    const world = createWorld(OPTIONS);
    world.cabinetMembers = [member()];
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));

    advanceTurn(restored);

    expect(restored.cabinetMembers[0]).toMatchObject({
      ministerialActions: MINISTERIAL_ACTION_CAP,
      lastMinisterialActionRefillTurn: 1,
    });
  });

  it("exhausts atomically and refunds a failed issuance without exceeding the cap", () => {
    const cabinetMember = member({ ministerialActions: 1, lastMinisterialActionRefillTurn: 0 });

    expect(() => withMinisterialAction(cabinetMember, 1, () => {
      expect(cabinetMember.ministerialActions).toBe(0);
      throw new Error("insert failed");
    })).toThrow("insert failed");
    expect(cabinetMember.ministerialActions).toBe(1);

    expect(spendMinisterialAction(cabinetMember, 1)).toBe(true);
    expect(spendMinisterialAction(cabinetMember, 1)).toBe(false);
    expect(cabinetMember.ministerialActions).toBe(0);
  });

  it("refills depleted pools to the cap on the deterministic turn boundary and persists them", () => {
    const world = createWorld(OPTIONS);
    world.cabinetMembers = [member({ ministerialActions: 0, lastMinisterialActionRefillTurn: 0 })];
    world.meta.turn = MINISTERIAL_ACTION_REFILL_INTERVAL - 2;

    advanceTurn(world);
    expect(world.cabinetMembers[0]?.ministerialActions).toBe(0);
    advanceTurn(world);
    expect(world.cabinetMembers[0]).toMatchObject({
      ministerialActions: MINISTERIAL_ACTION_CAP,
      lastMinisterialActionRefillTurn: MINISTERIAL_ACTION_REFILL_INTERVAL,
    });

    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.cabinetMembers[0]).toEqual(world.cabinetMembers[0]);
  });
});
