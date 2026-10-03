import { describe, expect, it } from "vitest";
import { getPackByEra, PACKS } from "./packs/index.js";
import {
  assertSupportedMatrixMatchesPacks,
  assertSupportedSelection,
  isPlayableCountry,
  isNewCharacterSelection,
  isSupportedEra,
  SUPPORTED_MATRIX,
  UNAVAILABLE_ERAS,
} from "./supportedMatrix.js";

describe("supported era/country matrix (#118)", () => {
  it("matches the shipped packs exactly (fail closed on drift)", () => {
    expect(() => assertSupportedMatrixMatchesPacks()).not.toThrow();
  });

  it("covers all seven supported source presets", () => {
    const eras = ["1953", "1979", "1991", "1999", "2007", "2019", "2023"];
    expect(SUPPORTED_MATRIX.map((r) => r.era).sort()).toEqual(eras);
    expect(PACKS.map((p) => p.era.id).sort()).toEqual(eras);
  });

  it("publishes the exact playable set per era", () => {
    const playables = new Map(SUPPORTED_MATRIX.map((r) => [r.era, r.playableCountries]));
    expect(playables.get("1953")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables.get("1979")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables.get("1991")).toEqual(["BR", "CN", "IE", "UK", "US"]);
    expect(playables.get("1999")).toEqual(["CN", "DE", "IE", "UK", "US"]);
    expect(playables.get("2007")).toEqual(["CN", "DE", "IE", "UK", "US"]);
    expect(playables.get("2019")).toEqual(["CN", "DE", "IE", "UK", "US"]);
    expect(playables.get("2023")).toEqual(["CN", "DE", "IE", "UK", "US"]);
  });

  it("records the post-Cold-War playable deltas against the pinned authority explicitly", () => {
    // Current source player access is established at `tierFor` and written by
    // `seedCountryGameStates`; character creation enforces that resulting gate.
    const row1991 = SUPPORTED_MATRIX.find((r) => r.era === "1991")!;
    expect(row1991.authorityPreset).toBe("1991-default");
    expect([...row1991.authorityPlayer].sort()).toEqual(["JP", "UK", "US"]);
    expect([...row1991.playableDelta].sort()).toEqual(["BR", "CN", "IE"]);
    expect(row1991.newCharacterCountries).toEqual(["UK", "US"]);
    expect([...row1991.authorityPlayerUnavailableInNative].sort()).toEqual(["JP"]);
    for (const era of ["1999", "2007", "2019", "2023"]) {
      const row = SUPPORTED_MATRIX.find((r) => r.era === era)!;
      expect(row.authorityPreset).toBe(`${era}-default`);
      expect([...row.authorityPlayer].sort()).toEqual(["JP", "UK", "US"]);
      expect([...row.playableDelta].sort()).toEqual(["CN", "DE", "IE"]);
      expect(row.newCharacterCountries).toEqual(["UK", "US"]);
      expect([...row.authorityPlayerUnavailableInNative].sort()).toEqual(["JP"]);
    }
    // Cold War eras match the authority exactly: no silent widening.
    for (const era of ["1953", "1979"]) {
      expect(SUPPORTED_MATRIX.find((r) => r.era === era)!.playableDelta).toEqual([]);
    }
  });

  it("keeps 1960 migration-only and publishes explicit 1999/2007/2023 lane provenance", () => {
    expect(UNAVAILABLE_ERAS.map((u) => u.era).sort()).toEqual(["1960"]);
    for (const u of UNAVAILABLE_ERAS) {
      expect(getPackByEra(u.era)).toBeUndefined();
      expect(isSupportedEra(u.era)).toBe(false);
    }
    // 1960 is migration-only: no authority preset names it.
    expect(UNAVAILABLE_ERAS.find((u) => u.era === "1960")!.status).toBe("migration-only");
    expect(UNAVAILABLE_ERAS.find((u) => u.era === "1960")!.authorityPreset).toBeNull();
    for (const era of ["1999", "2007", "2023"]) {
      const pack = getPackByEra(era)!;
      expect(pack.sourceProvenance?.sourcePreset).toBe(`${era}-default`);
      expect(pack.sourceProvenance?.lanes.legislature).toContain("2020");
      expect(pack.sourceProvenance?.lanes.parties).toContain("directly");
      expect(pack.sourceProvenance?.lanes.cycle).toContain(era);
    }
  });

  it("isSupportedEra/isPlayableCountry agree with the pack table", () => {
    for (const pack of PACKS) {
      expect(isSupportedEra(pack.era.id)).toBe(true);
      for (const c of pack.countries) {
        expect(isPlayableCountry(pack.era.id, c.id)).toBe(c.playable);
      }
      expect(isPlayableCountry(pack.era.id, "ZZ")).toBe(false);
    }
    expect(isSupportedEra("1999")).toBe(true);
    expect(isPlayableCountry("1999", "US")).toBe(true);
  });

  it("separates source-ready new-character options from internal pack fixtures", () => {
    for (const [era, id] of [["1953", "US"], ["1953", "DD"], ["1979", "RU"], ["1991", "UK"], ["1999", "US"], ["2007", "UK"], ["2019", "US"], ["2023", "UK"]]) {
      expect(isNewCharacterSelection(era!, id!)).toBe(true);
    }
    for (const [era, id] of [["1991", "JP"], ["1991", "IE"], ["1991", "BR"], ["1991", "CN"], ["1999", "JP"], ["1999", "CN"], ["1999", "DE"], ["1999", "IE"], ["2007", "JP"], ["2007", "CN"], ["2007", "DE"], ["2007", "IE"], ["2019", "JP"], ["2019", "DE"], ["2019", "IE"], ["2019", "CN"], ["2023", "JP"], ["2023", "DE"], ["2023", "IE"], ["2023", "CN"]]) {
      expect(isNewCharacterSelection(era!, id!)).toBe(false);
    }
    // Engine packs keep internal fixture reachability; public new-character
    // access is checked separately at GameSession/client creation.
    expect(isPlayableCountry("1991", "IE")).toBe(true);
    expect(isPlayableCountry("2019", "DE")).toBe(true);
  });

  it("assertSupportedSelection accepts every supported combo and rejects the rest", () => {
    let accepted = 0;
    for (const pack of PACKS) {
      for (const c of pack.countries.filter((x) => x.playable)) {
        expect(() => assertSupportedSelection(pack.era.id, c.id)).not.toThrow();
        accepted++;
      }
    }
    // Raw engine packs retain 18 authored combinations for internal use.
    expect(accepted).toBe(33);
    // Unavailable eras.
    for (const era of ["1960", "1800"]) {
      expect(() => assertSupportedSelection(era, "US")).toThrow(/Unknown era/);
    }
    // Unknown country.
    expect(() => assertSupportedSelection("1953", "ZZ")).toThrow(/Unknown country/);
    // Non-playable economy-preview entries are not selectable.
    expect(() => assertSupportedSelection("1991", "JP")).toThrow(/not playable/);
    expect(() => assertSupportedSelection("1991", "DE")).toThrow(/not playable/);
    expect(() => assertSupportedSelection("2019", "JP")).toThrow(/not playable/);
    expect(() => assertSupportedSelection("2019", "BR")).toThrow(/not playable/);
    for (const era of ["1999", "2007", "2023"]) {
      expect(() => assertSupportedSelection(era, "US")).not.toThrow();
      expect(() => assertSupportedSelection(era, "UK")).not.toThrow();
      expect(() => assertSupportedSelection(era, "JP")).toThrow(/not playable/);
    }
  });
});
