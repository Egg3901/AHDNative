import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";

const OPTIONS = { seed: "command-save-validation", playerName: "P", countryId: "RU", era: "1953", mode: "hos" } as const;

function withMutatedCommandEconomy(mutate: (state: Record<string, unknown>) => void): string {
  const envelope = JSON.parse(serializeSave(createWorld(OPTIONS), "2026-10-01T00:00:00.000Z")) as {
    world: { commandEconomy: Record<string, Record<string, unknown>> };
  };
  mutate(envelope.world.commandEconomy.RU!);
  return JSON.stringify(envelope);
}

describe("command economy save validation", () => {
  it("rejects out-of-range stored Gosbank posture", () => {
    const malformed = withMutatedCommandEconomy((state) => { state.creditAggressiveness = 1.01; });
    expect(() => deserializeSave(malformed)).toThrow(/creditAggressiveness.*\[0,1\]/);
  });

  it("rejects a queued directive for a different country", () => {
    const malformed = withMutatedCommandEconomy((state) => {
      state.pendingDirectives = [{ id: "gosbank-US-0-1", countryId: "US", proposedTurn: 0, effectiveTurn: 1, creditAggressiveness: 0.5 }];
    });
    expect(() => deserializeSave(malformed)).toThrow(/directive countryId must match/);
  });

  it("rejects invalid or stale saved directive turns", () => {
    const malformed = withMutatedCommandEconomy((state) => {
      state.pendingDirectives = [{ id: "gosbank-RU-0-1", countryId: "RU", proposedTurn: 0, effectiveTurn: 0, budgetSoftness: 0.5 }];
    });
    expect(() => deserializeSave(malformed)).toThrow(/directive effectiveTurn must be the next turn/);
  });
});
