import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "./save.js";
import {
  createWorld,
  listEras,
  listPlayableCountries,
  SCHEMA_VERSION,
} from "./world.js";

/**
 * Pack selection, save/reload, and content-identity coverage for #118.
 * Focused: world creation plus the save envelope only. No turns, no
 * actions, no finance/election/alignment/banking/legislation/war/
 * corporation flows.
 */
const SAVED_AT = "2026-09-18T00:00:00.000Z";

describe("era coverage: selection (#118)", () => {
  it("lists exactly the four supported eras", () => {
    expect(listEras().map((e) => e.id).sort()).toEqual(["1953", "1979", "1991", "2019"]);
  });

  it("publishes the exact playable set per era", () => {
    const playables = (era: string) =>
      listPlayableCountries(era).map((c) => c.id).sort();
    expect(playables("1953")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables("1979")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables("1991")).toEqual(["BR", "CN", "IE", "UK", "US"]);
    expect(playables("2019")).toEqual(["CN", "IE", "UK", "US"]);
  });

  it("createWorld rejects unavailable eras without falling back", () => {
    for (const era of ["1960", "1999", "2007", "2023", "1800"]) {
      expect(() =>
        createWorld({ seed: "reject-era", playerName: "P", countryId: "US", era }),
      ).toThrow(/Unknown era/);
      expect(() => listPlayableCountries(era)).toThrow(/Unknown era/);
    }
  });

  it("createWorld rejects non-playable and unknown countries", () => {
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "JP", era: "1991" }),
    ).toThrow(/not playable/);
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "DE", era: "1991" }),
    ).toThrow(/not playable/);
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "DE", era: "2019" }),
    ).toThrow(/not playable/);
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "BR", era: "2019" }),
    ).toThrow(/not playable/);
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "ZZ", era: "1953" }),
    ).toThrow(/Unknown country/);
  });
});

describe("era coverage: save/reload content identity (#118)", () => {
  const combos: Array<[string, string]> = [
    ["1953", "US"], ["1953", "UK"], ["1953", "RU"], ["1953", "DD"],
    ["1979", "US"], ["1979", "UK"], ["1979", "RU"], ["1979", "DD"],
    ["1991", "US"], ["1991", "UK"], ["1991", "BR"], ["1991", "CN"], ["1991", "IE"],
    ["2019", "US"], ["2019", "UK"], ["2019", "CN"], ["2019", "IE"],
  ];

  it("covers all 17 supported era/country combinations", () => {
    expect(combos.length).toBe(17);
  });

  it.each(combos)("(%s, %s) stamps content identity and survives a save round trip", (era, countryId) => {
    const world = createWorld({ seed: `identity-${era}-${countryId}`, playerName: "P", countryId, era });
    // Content identity: the pack era and the selected country ride the save.
    expect(world.meta.era).toBe(era);
    expect(world.meta.lastEra).toBe(era);
    expect(world.player.countryId).toBe(countryId);

    const raw = serializeSave(world, SAVED_AT);
    const restored = deserializeSave(raw);
    expect(restored.meta.era).toBe(era);
    expect(restored.meta.lastEra).toBe(era);
    expect(restored.player.countryId).toBe(countryId);
    expect(restored.meta.schemaVersion).toBe(SCHEMA_VERSION);
    // Reload is lossless: re-serializing the restored world is byte-identical.
    expect(serializeSave(restored, SAVED_AT)).toBe(raw);
  });

  it("1960 stays migration-only: a legacy-era save keeps its era label and flags legacyEra", () => {
    const world = createWorld({ seed: "legacy-1960", playerName: "P", countryId: "US", era: "1953" });
    const stripped = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const meta = stripped["meta"] as Record<string, unknown>;
    // Simulate a pre-removal save: fabricated-era label, pre-v40 schema.
    meta["era"] = "1960";
    meta["lastEra"] = "1960";
    delete meta["legacyEra"];
    meta["schemaVersion"] = 39;
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 39, savedAt: SAVED_AT, world: stripped });
    const loaded = deserializeSave(raw);
    expect(loaded.meta.era).toBe("1960");
    expect(loaded.meta.legacyEra).toBe(true);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("a real-pack era save backfills legacyEra false", () => {
    const world = createWorld({ seed: "legacy-1953", playerName: "P", countryId: "US", era: "1953" });
    const stripped = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const meta = stripped["meta"] as Record<string, unknown>;
    delete meta["legacyEra"];
    meta["schemaVersion"] = 39;
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 39, savedAt: SAVED_AT, world: stripped });
    const loaded = deserializeSave(raw);
    expect(loaded.meta.era).toBe("1953");
    expect(loaded.meta.legacyEra).toBe(false);
  });
});
