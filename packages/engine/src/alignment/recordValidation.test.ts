/**
 * #112 fail-closed alignment record validation.
 *
 * Source invariant: AHDGame src/lib/alignment/normalize.ts — every share a
 * multiple of 0.01 in [0,100], sum(shares) + nonAligned === 100.
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { AlignmentRecord } from "./types.js";
import { validateAlignmentRecords } from "./recordValidation.js";

const valid = (overrides: Partial<AlignmentRecord> = {}): AlignmentRecord => ({
  countryId: "US",
  shares: { WEST: 70, EAST: 10 },
  nonAligned: 20,
  updatedTurn: 3,
  ...overrides,
});

const records = (record: AlignmentRecord): Record<string, AlignmentRecord> => ({
  [record.countryId]: record,
});

describe("validateAlignmentRecords", () => {
  it("accepts a seeded-shape bipolar row", () => {
    expect(() =>
      validateAlignmentRecords({
        US: valid({ shares: { WEST: 100, EAST: 0 }, nonAligned: 0, updatedTurn: 0 }),
        RU: { countryId: "RU", shares: { EAST: 100 }, nonAligned: 0, updatedTurn: 0 },
      }),
    ).not.toThrow();
  });

  it("rejects an unknown (multipolar, B13) pole instead of dropping it", () => {
    expect(() =>
      validateAlignmentRecords(
        records(valid({ shares: { WEST: 60, EAST: 30, BEIJING: 10 } as never, nonAligned: 0 })),
      ),
    ).toThrow(/unknown pole: BEIJING/);
  });

  it("rejects a broken total", () => {
    expect(() => validateAlignmentRecords(records(valid({ nonAligned: 10 })))).toThrow(
      /do not sum to 100/,
    );
  });

  it("rejects an off-grid share", () => {
    expect(() =>
      validateAlignmentRecords(records(valid({ shares: { WEST: 69.999, EAST: 10 }, nonAligned: 20.001 }))),
    ).toThrow(/invalid share for WEST/);
  });

  it("rejects negative, over-100, and non-finite values", () => {
    expect(() =>
      validateAlignmentRecords(records(valid({ shares: { WEST: -1, EAST: 81 }, nonAligned: 20 }))),
    ).toThrow(/invalid share for WEST/);
    expect(() =>
      validateAlignmentRecords(records(valid({ shares: { WEST: 101, EAST: 0 }, nonAligned: -1 }))),
    ).toThrow(/invalid share for WEST/);
    expect(() =>
      validateAlignmentRecords(
        records(valid({ shares: { WEST: Number.NaN, EAST: 80 }, nonAligned: 20 })),
      ),
    ).toThrow(/invalid share for WEST/);
    expect(() => validateAlignmentRecords(records(valid({ nonAligned: Number.NaN })))).toThrow(
      /invalid nonAligned/,
    );
  });

  it("rejects key/id mismatch and bad updatedTurn", () => {
    expect(() =>
      validateAlignmentRecords({ UK: valid({ countryId: "US" }) }),
    ).toThrow(/does not match id/);
    expect(() => validateAlignmentRecords(records(valid({ updatedTurn: -1 })))).toThrow(
      /invalid updatedTurn/,
    );
  });
});

describe("alignment save/reload boundary (#112)", () => {
  const envelope = (world: ReturnType<typeof createWorld>) =>
    JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: world.meta.schemaVersion,
      savedAt: "2026-01-01T00:00:00Z",
      world,
    });

  it("clean save round-trips alignments byte-identical", () => {
    const world = createWorld({ seed: "align-112", playerName: "P", countryId: "US", era: "1953" });
    const before = JSON.stringify(world.alignments);
    const loaded = deserializeSave(serializeSave(world, "2026-01-01T00:00:00Z"));
    expect(JSON.stringify(loaded.alignments)).toBe(before);
  });

  it("a corrupt persisted row fails closed on load", () => {
    const world = createWorld({ seed: "align-112", playerName: "P", countryId: "US", era: "1953" });
    const tampered = JSON.parse(envelope(world)) as {
      format: string;
      schemaVersion: number;
      savedAt: string;
      world: typeof world;
    };
    tampered.world.alignments["US"]!.shares.WEST = 60; // total now 60, not 100
    expect(() => deserializeSave(JSON.stringify(tampered))).toThrow(/do not sum to 100/);
  });

  it("a foreign-pole persisted row fails closed on load", () => {
    const world = createWorld({ seed: "align-112", playerName: "P", countryId: "US", era: "1953" });
    const tampered = JSON.parse(envelope(world)) as {
      format: string;
      schemaVersion: number;
      savedAt: string;
      world: typeof world;
    };
    (tampered.world.alignments["US"]!.shares as Record<string, number>)["BEIJING"] = 10;
    tampered.world.alignments["US"]!.shares.WEST = 90;
    expect(() => deserializeSave(JSON.stringify(tampered))).toThrow(/unknown pole: BEIJING/);
  });
});
