import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "./save.js";
import {
  createWorld,
  listCountries,
  listEras,
  listPlayableCountries,
  SCHEMA_VERSION,
} from "./world.js";
import { US_STATE_DEMOGRAPHICS_2019 } from "./demographics/usStateDemographics2019.js";
import { US_STATE_DEMOGRAPHICS_2023 } from "./demographics/usStateDemographics2023.js";
import { eraToPreset } from "./electionEngine/resolution/constants.js";

/**
 * Pack selection, save/reload, and content-identity coverage for #118.
 * Focused: world creation plus the save envelope only. No turns, no
 * actions, no finance/election/alignment/banking/legislation/war/
 * corporation flows.
 */
const SAVED_AT = "2026-09-18T00:00:00.000Z";

describe("era coverage: selection (#118)", () => {
  it("lists exactly the seven supported source presets", () => {
    expect(listEras().map((e) => e.id).sort()).toEqual(["1953", "1979", "1991", "1999", "2007", "2019", "2023"]);
  });

  it("publishes the exact playable set per era", () => {
    const playables = (era: string) =>
      listPlayableCountries(era).map((c) => c.id).sort();
    expect(playables("1953")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables("1979")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables("1991")).toEqual(["BR", "CN", "IE", "JP", "UK", "US"]);
    expect(playables("1999")).toEqual(["CN", "DE", "IE", "JP", "UK", "US"]);
    expect(playables("2007")).toEqual(["CN", "DE", "IE", "JP", "UK", "US"]);
    expect(playables("2019")).toEqual(["CN", "DE", "IE", "JP", "UK", "US"]);
    expect(playables("2023")).toEqual(["CN", "DE", "IE", "JP", "UK", "US"]);
  });

  it("createWorld rejects unavailable eras without falling back", () => {
    for (const era of ["1960", "1800"]) {
      expect(() =>
        createWorld({ seed: "reject-era", playerName: "P", countryId: "US", era }),
      ).toThrow(/Unknown era/);
      expect(() => listPlayableCountries(era)).toThrow(/Unknown era/);
    }
  });

  it("derives exactly 38 source-tier engine-playable combos from the shipped packs", () => {
    // Japan is economy-only in 1953/1979 and source player-tier from 1991;
    // later packs seed its budgets, regions, Diet and elections. The derived
    // set below must stay in sync with SUPPORTED_MATRIX and the
    // world-validation/matrix docs; any playable-flag change fails here.
    const derived: string[] = [];
    for (const era of listEras()) {
      for (const c of listPlayableCountries(era.id)) derived.push(`${era.id}/${c.id}`);
    }
    derived.sort();
    expect(derived).toEqual([
      "1953/DD", "1953/RU", "1953/UK", "1953/US",
      "1979/DD", "1979/RU", "1979/UK", "1979/US",
      "1991/BR", "1991/CN", "1991/IE", "1991/JP", "1991/UK", "1991/US",
      "1999/CN", "1999/DE", "1999/IE", "1999/JP", "1999/UK", "1999/US",
      "2007/CN", "2007/DE", "2007/IE", "2007/JP", "2007/UK", "2007/US",
      "2019/CN", "2019/DE", "2019/IE", "2019/JP", "2019/UK", "2019/US",
      "2023/CN", "2023/DE", "2023/IE", "2023/JP", "2023/UK", "2023/US",
    ]);
    expect(derived).toHaveLength(38);
  });

  it("economy-preview entries stay present but fail closed on selection", () => {
    // Other preview rows keep their authored economic records yet are unavailable: listCountries reports
    // playable:false and createWorld rejects them without fallback.
    const preview: Array<[string, string]> = [
      ["1991", "DE"], ["2019", "BR"],
    ];
    expect(preview.length).toBe(2);
    for (const [era, countryId] of preview) {
      const entry = listCountries(era).find((c) => c.id === countryId);
      expect(entry, `${era}/${countryId} present in pack`).toBeDefined();
      expect(entry!.playable).toBe(false);
      expect(() =>
        createWorld({ seed: "preview-reject", playerName: "P", countryId, era }),
      ).toThrow(/not playable/);
    }
  });

  it("createWorld opens source-tier Japan and rejects non-playable and unknown countries", () => {
    expect(createWorld({ seed: "s", playerName: "P", countryId: "JP", era: "1991" }).player.countryId).toBe("JP");
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "DE", era: "1991" }),
    ).toThrow(/not playable/);
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "BR", era: "2019" }),
    ).toThrow(/not playable/);
    expect(() =>
      createWorld({ seed: "s", playerName: "P", countryId: "ZZ", era: "1953" }),
    ).toThrow(/Unknown country/);
  });

  it("uses source 2023 US demographics and source-declared 2019 fallback rows", () => {
    const baseline2019 = createWorld({ seed: "demographics-2019", playerName: "P", countryId: "US", era: "2019" });
    const fallback1999 = createWorld({ seed: "demographics-1999", playerName: "P", countryId: "US", era: "1999" });
    const fallback2007 = createWorld({ seed: "demographics-2007", playerName: "P", countryId: "US", era: "2007" });
    const source2023 = createWorld({ seed: "demographics-2023", playerName: "P", countryId: "US", era: "2023" });
    const sourceAk = US_STATE_DEMOGRAPHICS_2023.find((row) => row.stateId === "AK")!;
    const baselineCa = US_STATE_DEMOGRAPHICS_2019.find((row) => row.stateId === "CA")!;
    expect(source2023.stateDemographics.AK).toMatchObject({ categoryWeights: sourceAk.categoryWeights, groups: sourceAk.groups });
    // DC is a source-authored federal voting geography with census inputs,
    // but no House or state-senate seats. It is not the HQ-only fallback row.
    expect(source2023.regions.DC).toMatchObject({ population: 678972, houseSeats: 0, senateSeats: 0 });
    expect(source2023.regions.DC?.corporationHeadquartersOnly).toBeUndefined();
    expect(source2023.stateDemographics.DC).toBeDefined();
    expect(fallback1999.stateDemographics.CA).toMatchObject({ categoryWeights: baselineCa.categoryWeights, groups: baselineCa.groups });
    expect(fallback2007.stateDemographics.CA).toMatchObject({ categoryWeights: baselineCa.categoryWeights, groups: baselineCa.groups });
    expect(source2023.stateDemographics.CA?.groups).not.toEqual(baseline2019.stateDemographics.CA?.groups);
  });

  it("resolves the selected source preset for all newly added starting years", () => {
    expect(eraToPreset("1999")).toBe("1999-default");
    expect(eraToPreset("2007")).toBe("2007-default");
    expect(eraToPreset("2023")).toBe("2023-default");
  });
});

describe("era coverage: save/reload content identity (#118)", () => {
  const combos: Array<[string, string]> = [
    ["1953", "US"], ["1953", "UK"], ["1953", "RU"], ["1953", "DD"],
    ["1979", "US"], ["1979", "UK"], ["1979", "RU"], ["1979", "DD"],
    ["1991", "US"], ["1991", "UK"], ["1991", "BR"], ["1991", "CN"], ["1991", "IE"], ["1991", "JP"],
    ["1999", "US"], ["1999", "UK"], ["1999", "CN"], ["1999", "DE"], ["1999", "IE"], ["1999", "JP"],
    ["2007", "US"], ["2007", "UK"], ["2007", "CN"], ["2007", "DE"], ["2007", "IE"], ["2007", "JP"],
    ["2019", "US"], ["2019", "UK"], ["2019", "CN"], ["2019", "DE"], ["2019", "IE"], ["2019", "JP"],
    ["2023", "US"], ["2023", "UK"], ["2023", "CN"], ["2023", "DE"], ["2023", "IE"], ["2023", "JP"],
  ];

  it("covers all 38 supported era/country combinations", () => {
    expect(combos.length).toBe(38);
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
