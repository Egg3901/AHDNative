import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { acceptUnionLeadership, castUnionLeadershipVote } from "./leadership.js";

const OPTIONS = { seed: "union-leadership-flow", playerName: "Alex", countryId: "US", era: "1953" } as const;

describe("union organizer-weighted leadership lifecycle", () => {
  it("offers and accepts the presidency only after the source strength threshold", () => {
    const world = createWorld(OPTIONS);
    const union = world.unions["US-manufacturing"]!;
    union.strength = 90;
    world.unionOrganizers = {
      [`${union.id}:player`]: {
        id: `${union.id}:player`, unionId: union.id, characterId: "player", strength: 90,
        organizeCount: 9, createdAtTurn: 0, updatedAtTurn: 0,
      },
    };

    expect(castUnionLeadershipVote(world, union.id)).toMatchObject({ ok: false, reason: "election-not-open" });
    union.strength = 100;
    world.unionOrganizers[`${union.id}:player`]!.strength = 100;
    expect(castUnionLeadershipVote(world, union.id)).toEqual({ ok: true, pendingLeaderCharacterId: "player" });
    expect(union.ownerType).not.toBe("player");
    expect(union.pendingLeaderCharacterId).toBe("player");
    expect(acceptUnionLeadership(world, union.id)).toEqual({ ok: true, ownerType: "player", ownerId: "player" });
    expect(union).toMatchObject({ ownerType: "player", ownerId: "player", pendingLeaderCharacterId: null });
  });

  it("requires the player to organize locally, preserves incumbency until acceptance, and saves the pending offer", () => {
    const world = createWorld(OPTIONS);
    const union = world.unions["US-manufacturing"]!;
    union.strength = 100;
    world.unionOrganizers = {
      [`${union.id}:player`]: {
        id: `${union.id}:player`, unionId: union.id, characterId: "player", strength: 100,
        organizeCount: 10, createdAtTurn: 0, updatedAtTurn: 0,
      },
    };
    union.ownerType = "npp";
    union.ownerId = world.politicians.find((row) => row.countryId === "US")!.id;

    expect(acceptUnionLeadership(world, union.id)).toMatchObject({ ok: false, reason: "no-offer" });
    expect(castUnionLeadershipVote(world, "UK-manufacturing")).toMatchObject({ ok: false, reason: "wrong-country" });
    expect(castUnionLeadershipVote(world, union.id)).toMatchObject({ ok: true, pendingLeaderCharacterId: "player" });
    expect(union.ownerType).toBe("npp");
    expect(acceptUnionLeadership(world, union.id)).toMatchObject({ ok: true, ownerType: "player" });
  });

  it("does not let a player accept an offer while already leading another union", () => {
    const world = createWorld(OPTIONS);
    const [first, second] = Object.values(world.unions).filter((row) => row.countryId === "US").slice(0, 2);
    first!.ownerType = "player";
    first!.ownerId = "player";
    second!.pendingLeaderCharacterId = "player";
    expect(acceptUnionLeadership(world, second!.id)).toMatchObject({ ok: false, reason: "already-leads-union" });
    expect(second!.ownerType).not.toBe("player");
  });
});
