import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave, projectSaveToV42, SCHEMA_VERSION } from "./index.js";

const SAVED_AT = "2026-10-02T00:00:00.000Z";
const historical = () => gunzipSync(readFileSync(new URL("../../../fixtures/v42-1953-US.save.json.gz", import.meta.url))).toString("utf8");
const document = () => JSON.parse(serializeSave(deserializeSave(historical()), SAVED_AT));

describe("source nationalization origin and grace at the save boundary (#75)", () => {
  it("migrates earlier absence without inventing source ownership or clock history", () => {
    const world = deserializeSave(historical());
    expect(world.meta.schemaVersion).toBe(SCHEMA_VERSION);
    for (const corporation of Object.values(world.corporations)) {
      expect(corporation.nationalizationOwnerKind).toBeUndefined();
      expect(corporation.financialDistressSinceTurn).toBeUndefined();
      expect(corporation.ceoVacantSinceTurn).toBeUndefined();
      expect(corporation.privatizedAtTurn).toBeUndefined();
    }
  });

  it("preserves recorded source creator and clocks across the public save boundary", () => {
    const saved = document();
    const corporation = Object.values(saved.world.corporations)[0] as Record<string, unknown>;
    const clock = saved.world.meta.turn;
    Object.assign(corporation, { nationalizationOwnerKind: "player", financialDistressSinceTurn: clock, ceoVacantSinceTurn: clock, privatizedAtTurn: clock });
    const world = deserializeSave(JSON.stringify(saved));
    expect(deserializeSave(serializeSave(world, SAVED_AT)).corporations).toEqual(world.corporations);
  });

  it("refuses invalid origins and malformed or future clocks before continuation", () => {
    for (const fields of [
      { nationalizationOwnerKind: "ceo" }, { nationalizationOwnerKind: null },
      { financialDistressSinceTurn: -1 }, { ceoVacantSinceTurn: 1.5 },
      { privatizedAtTurn: "0" }, { financialDistressSinceTurn: 1e9 },
    ]) {
      const saved = document();
      Object.assign(Object.values(saved.world.corporations)[0]!, fields);
      expect(() => deserializeSave(JSON.stringify(saved))).toThrow(/Invalid nationalization/);
    }
  });

  it("refuses current and authentic42 labels carrying clocks a v42 reader cannot advance", () => {
    for (const raw of [historical(), JSON.stringify(document())]) {
      for (const fields of [ { nationalizationOwnerKind: "npc" }, { financialDistressSinceTurn: null }, { ceoVacantSinceTurn: 0 }, { privatizedAtTurn: 0 } ]) {
        const saved = JSON.parse(raw);
        Object.assign(Object.values(saved.world.corporations)[0]!, fields);
        expect(projectSaveToV42(JSON.stringify(saved))).toMatchObject({ ok: false, error: expect.stringContaining("Nationalization origin and grace clocks") });
      }
    }
  });
});
