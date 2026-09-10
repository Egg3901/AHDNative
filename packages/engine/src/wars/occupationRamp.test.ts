import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { Conflict } from "./types.js";

const savedAt = "2026-09-10T00:00:00.000Z";
function prepared(age: number | undefined) {
  const world = createWorld({ era: "1953", countryId: "US", seed: "war-ramp-contract", playerName: "Ada" });
  // A decisive GDP-proxy fixture, not reference combat or a real playthrough.
  world.countries.US!.economy.gdp = 100;
  world.countries.RU!.economy.gdp = 10_000;
  const conflict: Conflict = {
    id: "ramp", type: "interstate", status: "active", intensity: 50,
    sideA: { countries: ["US"] }, sideB: { countries: ["RU"] }, control: 50,
    // The public turn advances the clock before the wars phase.
    startedAtTurn: world.meta.turn + 1 - (age ?? 0),
  };
  if (age === undefined) delete (conflict as Partial<Conflict>).startedAtTurn;
  world.conflicts.push(conflict);
  return world;
}

describe("war mobilization through advanceTurn and save", () => {
  // Source occupation.ts: decisive retreat step = 5 * .7 = 3.5.
  // Ages 0/25/50 scale by .4/.7/1; unknown age preserves full strength.
  it.each([
    [0, 51.4], [25, 52.45], [50, 53.5], [100, 53.5],
    [-5, 51.4], [undefined, 53.5],
  ] as const)("applies the reference control delta at age %s", (age, expected) => {
    const world = prepared(age);
    let observed = false;
    advanceTurn(world, { afterPhase(name, state) {
      if (name !== "warsTurn") return;
      observed = true;
      // Confirms other enabled phases did not invalidate the decisive fixture.
      expect(state.countries.RU!.economy.gdp).toBeGreaterThan(state.countries.US!.economy.gdp * 3);
      expect(state.conflicts[0]!.control).toBe(expected);
    } });
    expect(observed).toBe(true);
  });

  it("resumes the complete world and RNG identically during the ramp", () => {
    const continuous = prepared(25);
    advanceTurn(continuous);
    const resumed = deserializeSave(serializeSave(continuous, savedAt));
    advanceTurn(continuous);
    advanceTurn(resumed);
    expect(serializeSave(resumed, savedAt)).toBe(serializeSave(continuous, savedAt));
  });
});
