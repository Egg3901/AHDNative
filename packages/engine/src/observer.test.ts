import { expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { createWorld } from "./world.js";
import { serializeSave } from "./save.js";

it("observes actual phases and detached RNG snapshots without changing the turn", () => {
  const options = { seed: "observer", playerName: "Audit", countryId: "US", era: "1953" };
  const plain = createWorld(options);
  const observed = createWorld(options);
  const events: string[] = [];
  const rngStates: Array<readonly number[]> = [];
  const plainReport = advanceTurn(plain);
  const report = advanceTurn(observed, { afterPhase(name, world, rng) {
    expect(world).toBe(observed);
    events.push(name);
    rngStates.push(rng);
  } });
  expect(events).toEqual(plainReport.phaseTimings.map((phase) => phase.name));
  expect(report).toEqual(plainReport);
  expect(rngStates.at(-1)).toEqual(observed.meta.rng);
  expect(rngStates.at(-1)).not.toBe(observed.meta.rng);
  expect(serializeSave(observed, "fixed")).toBe(serializeSave(plain, "fixed"));
});
