import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import { createWorld } from "./world.js";

const OPTIONS = {
  seed: "phase-order-depth",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

interface RevenueSnapshot {
  current: number;
  previous: number;
  turn: number;
}

function observeFirstTurn(world: ReturnType<typeof createWorld>): {
  corporationSnapshot: RevenueSnapshot | undefined;
  macroSnapshot: RevenueSnapshot | undefined;
} {
  let corporationSnapshot: RevenueSnapshot | undefined;
  let macroSnapshot: RevenueSnapshot | undefined;
  advanceTurn(world, {
    afterPhase(name, observedWorld) {
      if (name === "corporationTurn" || name === "macroCountryTurn") {
        const snapshot = observedWorld.corpRevenueSnapshots.US;
        if (!snapshot) return;
        const copy = { ...snapshot };
        if (name === "corporationTurn") corporationSnapshot = copy;
        else macroSnapshot = copy;
      }
    },
  });
  return { corporationSnapshot, macroSnapshot };
}

describe("phase order depth", () => {
  it("makes current corporation revenue available to macro growth in the same turn", () => {
    const world = createWorld(OPTIONS);
    const before = world.corpRevenueSnapshots.US!;
    const observed = observeFirstTurn(world);

    expect(observed.corporationSnapshot).toBeDefined();
    expect(observed.macroSnapshot).toBeDefined();
    expect(observed.macroSnapshot!.current).toBe(observed.corporationSnapshot!.current);
    expect(observed.macroSnapshot!.previous).toBe(before.current);
    // Source realized sales can fall below seeded nominal revenue. Ordering
    // requires this turn's actual receipts, not an assumed positive growth.
    const realized = Object.values(world.corporateSectors ?? {})
      .filter((asset) => world.corporations[asset.corporationId]?.countryId === "US")
      .reduce((sum, asset) => sum + (asset.realizedRevenue ?? 0), 0);
    expect(observed.macroSnapshot!.current).toBeCloseTo(realized, 6);
    expect(observed.macroSnapshot!.current).toBeGreaterThan(0);
    expect(observed.macroSnapshot!.turn).toBe(world.meta.turn);
  });

  it("keeps the corrected ordering deterministic across save and resume", () => {
    const live = createWorld(OPTIONS);
    advanceTurn(live);
    const resumed = deserializeSave(serializeSave(live, "2026-09-10T00:00:00.000Z"));

    advanceTurn(live);
    advanceTurn(resumed);

    expect(JSON.stringify(resumed)).toBe(JSON.stringify(live));
  });
});
