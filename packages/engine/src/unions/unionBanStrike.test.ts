import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { applyCrisisEffects } from "../events/crisis.js";
import { applyUnionLawProvision } from "./unionLaws.js";
import { organizeUnionUndergroundAction } from "./organizingActions.js";
import {
  extendUnionBanStrikeFromUnderground,
  UNDERGROUND_CRISIS_EXTENSION_LIMIT,
  UNION_BAN_STRIKE_DURATION_TURNS,
  UNION_BAN_STRIKE_KIND,
} from "./unionBanStrike.js";

const OPTS = { era: "1953", countryId: "US", seed: "union-ban-general-strike", playerName: "Alex" } as const;
const UNION = "US-manufacturing";
const STAMP = "2026-10-02T00:00:00Z";

describe("source union-ban general strike", () => {
  it("creates the country crisis, applies its economic tick, and extends from a mass underground drive", () => {
    const world = createWorld(OPTS);
    const economy = structuredClone(world.countries.US!.economy);
    applyUnionLawProvision(world, "US", { type: "union_law", banAction: "ban" });
    const crisis = world.crises.find((row) => row.kind === UNION_BAN_STRIKE_KIND)!;
    expect(crisis).toMatchObject({ status: "active", startTurn: world.meta.turn, durationTurns: 24, countryIds: ["US"] });

    applyCrisisEffects(world, crisis, world.meta.turn);
    expect(world.countries.US!.economy.growthRate).toBeLessThan(economy.growthRate);
    expect(world.countries.US!.economy.unemploymentRate).toBeGreaterThan(economy.unemploymentRate);

    world.player.actions = 20;
    const firstDrive = organizeUnionUndergroundAction(world, UNION, "mass");
    expect(firstDrive).toMatchObject({ undergroundStrength: 9, crisisExtended: false });
    advanceTurn(world);
    world.player.actions = 20;
    const secondDrive = organizeUnionUndergroundAction(world, UNION, "mass");
    expect(secondDrive).toMatchObject({ undergroundStrength: 18, crisisExtended: true });
    expect(crisis.durationTurns).toBe(UNION_BAN_STRIKE_DURATION_TURNS + 1);
    expect(crisis.lastUndergroundExtensionTurn).toBe(world.meta.turn);
  });

  it("persists the once-per-turn extension guard and caps added duration at six turns", () => {
    let world = createWorld(OPTS);
    applyUnionLawProvision(world, "US", { type: "union_law", banAction: "ban" });
    for (let extension = 0; extension < UNDERGROUND_CRISIS_EXTENSION_LIMIT; extension++) {
      world.meta.turn++;
      expect(extendUnionBanStrikeFromUnderground(world, "US", 15, "mass")).toBe(true);
      const saved = serializeSave(world, STAMP);
      world = deserializeSave(saved);
      expect(world.crises.find((row) => row.kind === UNION_BAN_STRIKE_KIND)?.lastUndergroundExtensionTurn).toBe(world.meta.turn);
    }
    world.meta.turn++;
    const crisis = world.crises.find((row) => row.kind === UNION_BAN_STRIKE_KIND)!;
    expect(extendUnionBanStrikeFromUnderground(world, "US", 15, "mass")).toBe(false);
    expect(crisis.durationTurns).toBe(UNION_BAN_STRIKE_DURATION_TURNS + UNDERGROUND_CRISIS_EXTENSION_LIMIT);
    expect(extendUnionBanStrikeFromUnderground(world, "US", 15, "quiet")).toBe(false);
  });
});
