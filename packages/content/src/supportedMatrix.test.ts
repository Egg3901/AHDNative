import { describe, expect, it } from "vitest";
import { getPackByEra, PACKS } from "./packs/index.js";
import {
  assertSupportedMatrixMatchesPacks,
  assertSupportedSelection,
  isPlayableCountry,
  isSupportedEra,
  SUPPORTED_MATRIX,
  UNAVAILABLE_ERAS,
} from "./supportedMatrix.js";

describe("supported era/country matrix (#118)", () => {
  it("matches the shipped packs exactly (fail closed on drift)", () => {
    expect(() => assertSupportedMatrixMatchesPacks()).not.toThrow();
  });

  it("covers exactly the four real mainline presets", () => {
    expect(SUPPORTED_MATRIX.map((r) => r.era).sort()).toEqual(["1953", "1979", "1991", "2019"]);
    expect(PACKS.map((p) => p.era.id).sort()).toEqual(["1953", "1979", "1991", "2019"]);
  });

  it("publishes the exact playable set per era", () => {
    const playables = new Map(SUPPORTED_MATRIX.map((r) => [r.era, r.playableCountries]));
    expect(playables.get("1953")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables.get("1979")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playables.get("1991")).toEqual(["BR", "CN", "IE", "UK", "US"]);
    expect(playables.get("2019")).toEqual(["CN", "IE", "UK", "US"]);
  });

  it("records the 1991/2019 playable deltas against the pinned authority explicitly", () => {
    // Pinned AHDGame@e364c04 POST_COLD_WAR_PLAYER is US/UK only. The wider
    // Native sets stay flagged here as unresolved #118 deltas; closing the
    // issue requires resolving them against the authority, not editing flags.
    const row1991 = SUPPORTED_MATRIX.find((r) => r.era === "1991")!;
    expect(row1991.authorityPreset).toBe("1991-default");
    expect([...row1991.authorityPlayer].sort()).toEqual(["UK", "US"]);
    expect([...row1991.playableDelta].sort()).toEqual(["BR", "CN", "IE"]);
    const row2019 = SUPPORTED_MATRIX.find((r) => r.era === "2019")!;
    expect(row2019.authorityPreset).toBe("2019-default");
    expect([...row2019.authorityPlayer].sort()).toEqual(["UK", "US"]);
    expect([...row2019.playableDelta].sort()).toEqual(["CN", "IE"]);
    // Cold War eras match the authority exactly: no silent widening.
    for (const era of ["1953", "1979"]) {
      expect(SUPPORTED_MATRIX.find((r) => r.era === era)!.playableDelta).toEqual([]);
    }
  });

  it("keeps 1999, 2007, 2023, and 1960 unavailable with no pack", () => {
    expect(UNAVAILABLE_ERAS.map((u) => u.era).sort()).toEqual(["1960", "1999", "2007", "2023"]);
    for (const u of UNAVAILABLE_ERAS) {
      expect(getPackByEra(u.era)).toBeUndefined();
      expect(isSupportedEra(u.era)).toBe(false);
    }
    // 1960 is migration-only: no authority preset names it.
    expect(UNAVAILABLE_ERAS.find((u) => u.era === "1960")!.status).toBe("migration-only");
    expect(UNAVAILABLE_ERAS.find((u) => u.era === "1960")!.authorityPreset).toBeNull();
    // 1999/2007/2023 have authority presets but deliberately no pack.
    for (const era of ["1999", "2007", "2023"]) {
      const u = UNAVAILABLE_ERAS.find((x) => x.era === era)!;
      expect(u.status).toBe("no-pack");
      expect(u.authorityPreset).toBe(`${era}-default`);
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
    expect(isSupportedEra("1999")).toBe(false);
    expect(isPlayableCountry("1999", "US")).toBe(false);
  });

  it("assertSupportedSelection accepts every supported combo and rejects the rest", () => {
    let accepted = 0;
    for (const pack of PACKS) {
      for (const c of pack.countries.filter((x) => x.playable)) {
        expect(() => assertSupportedSelection(pack.era.id, c.id)).not.toThrow();
        accepted++;
      }
    }
    // 4 + 4 + 5 + 4 supported era/country combinations.
    expect(accepted).toBe(17);
    // Unavailable eras.
    for (const era of ["1960", "1999", "2007", "2023", "1800"]) {
      expect(() => assertSupportedSelection(era, "US")).toThrow(/Unknown era/);
    }
    // Unknown country.
    expect(() => assertSupportedSelection("1953", "ZZ")).toThrow(/Unknown country/);
    // Non-playable economy-preview entries are not selectable.
    expect(() => assertSupportedSelection("1991", "JP")).toThrow(/not playable/);
    expect(() => assertSupportedSelection("1991", "DE")).toThrow(/not playable/);
    expect(() => assertSupportedSelection("2019", "JP")).toThrow(/not playable/);
    expect(() => assertSupportedSelection("2019", "DE")).toThrow(/not playable/);
    expect(() => assertSupportedSelection("2019", "BR")).toThrow(/not playable/);
  });
});
