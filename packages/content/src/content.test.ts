import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { PACKS, pack1953, pack1979, pack1999, pack2007, pack2023 } from "./packs/index.js";
import { validatePack } from "./validate.js";
import type { SeedPack } from "./types.js";
import US_SOURCE_YEAR_ELECTORATE from "./packs/usSourceYearElectorate.json";
import SOURCE_REFERENCE_ERA_OUTPUTS from "./packs/sourceReferenceEraOutputs.json";

describe("validatePack", () => {
  it("exports actual source outputs and explicit fallback provenance for reference-era presets", () => {
    const artifact = SOURCE_REFERENCE_ERA_OUTPUTS as unknown as {
      provenance: { sourceRepository: string; sourceCommit: string; sourceFiles: string[]; normalizedRuntimeFields: string[] };
      historicalSeatRoster2020Fallback: { rowCount: number; sha256: string; rows: unknown[] };
      us2023StateContent: {
        regionOutput: { rowCount: number; sha256: string; rows: unknown[] };
        demographicOutput: { stateCount: number; sha256: string; states: Record<string, unknown> };
        generatedDemographics: { rowCount: number; sha256: string; rows: Array<{ stateId: string; categoryWeights: Record<string, number>; groups: Record<string, unknown> }> };
      };
      jpRegionalContent: {
        presets: Array<{ year: number; rowCount: number; sha256: string; rows: Array<{ id: string; name: string; population: number; gdp: number; houseSeats: number; senateSeats: number; region: string }> }>;
        registrationSource: string;
      };
      sourcePlayerPartyRosters: { presets: Array<{ year: number; countries: Array<{ countryId: string; rows: Array<{ id: string }> }> }>; sha256: string };
      eras: Array<{
        year: number;
        preset: string;
        playerCountries: string[];
        historicalSeatOutput: { rowCount: number; sha256: string; recordedFallbacks: Array<{ label: string; preset: string }> };
        budgetOutput: { rowCount: number; sha256: string; rows: Array<{ countryId: string; fiscalYear: number; gdp: number; sourceFiscalYear?: number; economicFactors?: { lastUpdated?: string } }> };
      }>;
    };
    const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(artifact.provenance).toMatchObject({
      sourceRepository: "Egg3901/AHDGame",
      sourceCommit: "c35bcd86cbdbb877e73a0e9a45b0726605bdbc7a",
    });
    expect(artifact.provenance.normalizedRuntimeFields).toContain(
      "budgetOutput.rows[].economicFactors.lastUpdated: source assigns current seed time; non-epoch Date values use a stable marker.",
    );
    expect(artifact.historicalSeatRoster2020Fallback.rowCount).toBe(1007);
    expect(sha256(artifact.historicalSeatRoster2020Fallback.rows)).toBe(artifact.historicalSeatRoster2020Fallback.sha256);
    // The source's 51 geography rows are 50 political states plus DC as a
    // separate presidential-voting federal district (zero House/state seats).
    expect(artifact.us2023StateContent.regionOutput.rowCount).toBe(51);
    expect(sha256(artifact.us2023StateContent.regionOutput.rows)).toBe(artifact.us2023StateContent.regionOutput.sha256);
    expect(artifact.us2023StateContent.playablePackOutput.rows).toHaveLength(51);
    expect(artifact.us2023StateContent.playablePackOutput.rows.find((row) => row.id === "DC")).toMatchObject({ houseSeats: 0, senateSeats: 0 });
    expect(artifact.us2023StateContent.demographicOutput.stateCount).toBe(51);
    expect(sha256(artifact.us2023StateContent.demographicOutput.states)).toBe(artifact.us2023StateContent.demographicOutput.sha256);
    expect(artifact.us2023StateContent.generatedDemographics.rowCount).toBe(51);
    expect(sha256(artifact.us2023StateContent.generatedDemographics.rows)).toBe(artifact.us2023StateContent.generatedDemographics.sha256);
    expect(artifact.us2023StateContent.generatedDemographics.rows.map((row) => row.stateId).sort()).toContain("DC");
    expect(artifact.jpRegionalContent.registrationSource).toContain("2019 StateSeed registration estimates");
    expect(artifact.jpRegionalContent.presets.map((entry) => entry.year)).toEqual([1999, 2007, 2023]);
    for (const entry of artifact.jpRegionalContent.presets) {
      expect(entry.rowCount).toBe(8);
      expect(sha256(entry.rows)).toBe(entry.sha256);
      const pack = [pack1999, pack2007, pack2023].find((candidate) => candidate.era.id === String(entry.year))!;
      const source = new Map(entry.rows.map((row) => [row.id, row]));
      const japan = pack.states!.filter((row) => row.countryId === "JP");
      expect(japan).toHaveLength(8);
      for (const row of japan) {
        expect(row).toMatchObject(source.get(row.id));
        expect(row.votingSystem).toBe(source.get(row.id)?.votingSystem);
        expect(row.registration).toBeDefined();
      }
    }
    expect(artifact.eras.map((entry) => entry.year)).toEqual([1999, 2007, 2023]);
    const usBudgetGdp = new Map([[1999, 9_660_000_000_000], [2007, 14_450_000_000_000], [2023, 27_400_000_000_000]]);
    for (const entry of artifact.eras) {
      expect(entry.preset).toBe(`${entry.year}-default`);
      expect(entry.playerCountries).toEqual(["US", "UK", "JP"]);
      expect(entry.historicalSeatOutput).toMatchObject({
        rowCount: 1007,
        sha256: artifact.historicalSeatRoster2020Fallback.sha256,
        recordedFallbacks: [{ label: "historicalSeats:getPresetSeats", preset: entry.preset }],
      });
      expect(entry.budgetOutput.rowCount).toBe(16);
      expect(sha256(entry.budgetOutput.rows)).toBe(entry.budgetOutput.sha256);
      expect(entry.budgetOutput.rows.every((row) => row.fiscalYear === entry.year)).toBe(true);
      expect(entry.budgetOutput.rows.find((row) => row.countryId === "US")?.gdp).toBe(usBudgetGdp.get(entry.year));
      expect(entry.budgetOutput.rows.some((row) => row.economicFactors?.lastUpdated === "<runtime-generated-at-source-seed>")).toBe(true);
    }
    expect(artifact.eras[0]!.budgetOutput.rows.find((row) => row.countryId === "UK")?.sourceFiscalYear).toBe(1991);
    expect(artifact.eras[2]!.budgetOutput.rows.find((row) => row.countryId === "UK")?.sourceFiscalYear).toBe(2020);
    expect(artifact.sourcePlayerPartyRosters.sha256).toBe(sha256(artifact.sourcePlayerPartyRosters.presets));
    for (const year of [1999, 2007, 2023]) {
      const source = artifact.eras.find((entry) => entry.year === year)!;
      const pack = [pack1999, pack2007, pack2023].find((entry) => entry.era.id === String(year))!;
      expect(source.initialExchangeRates.US).toBeGreaterThan(0);
      expect(pack.sourceProvenance?.sourceCommit).toBe(artifact.provenance.sourceCommit);
      expect(pack.budgets?.map((row) => row.countryId).sort()).toEqual(source.budgetOutput.rows
        .filter((row) => pack.countries.some((country) => country.id === row.countryId))
        .map((row) => row.countryId).sort());
      expect(pack.budgets?.find((row) => row.countryId === "UK")?.sourceFiscalYear)
        .toBe(source.budgetOutput.rows.find((row) => row.countryId === "UK")?.sourceFiscalYear);
      expect(pack.parties?.filter((row) => row.countryId === "US").map((row) => row.id).sort())
        .toEqual(artifact.sourcePlayerPartyRosters.presets.find((preset) => preset.year === year)!.countries
          .find((country) => country.countryId === "US")!.rows.map((row) => row.id).sort());
    }
    expect(pack1999.era.startDate).toBe("1999-01-01");
    expect(pack2007.era.startDate).toBe("2007-01-01");
    expect(pack2023.era.startDate).toBe("2023-01-01");
    const usStates2023 = pack2023.states?.filter((row) => row.countryId === "US") ?? [];
    expect(usStates2023).toHaveLength(51);
    expect(usStates2023.find((row) => row.id === "DC")).toMatchObject({ houseSeats: 0, senateSeats: 0 });
    expect(usStates2023.reduce((sum, row) => sum + row.houseSeats, 0)).toBe(435);
  });

  it("validates the exported US electorate anchors used by source-era packs", () => {
    const artifact = US_SOURCE_YEAR_ELECTORATE as unknown as {
      provenance: { sourceRepository: string; sourceCommit: string; sourceAnchorYears: number[]; worldStartYears: number[] };
      anchors: Record<string, Record<string, Record<string, {
        marginals: Record<string, Record<string, number>>;
        positions: Record<string, unknown>;
      }>>>;
    };
    expect(artifact.provenance).toMatchObject({
      sourceRepository: "Egg3901/AHDGame",
      sourceCommit: "6f8b083beffbc79b8c9974b80d93dbd19d6d56a6",
    });
    expect(artifact.provenance.sourceAnchorYears).toEqual([1953, 1979, 1991, 1999, 2007, 2019, 2023, 2027]);
    expect(artifact.provenance.worldStartYears).toEqual([1953, 1979, 1991, 2019]);
    expect(Object.keys(artifact.anchors.noCheckpoint ?? {})).toHaveLength(51);
    for (const year of [1999, 2007, 2023]) {
      for (const state of Object.values(artifact.anchors.noCheckpoint ?? {})) {
        const anchor = state[String(year)];
        expect(anchor, `source electorate ${year}`).toBeDefined();
        for (const [dimension, buckets] of Object.entries(anchor!.marginals)) {
          const total = Object.values(buckets).reduce((sum, value) => sum + value, 0);
          expect(total, `${year}/${dimension}`).toBeCloseTo(100, 8);
        }
        expect(Object.keys(anchor!.positions).length).toBeGreaterThan(0);
      }
    }
  });

  it("accepts every shipped pack", () => {
    for (const pack of PACKS) {
      expect(() => validatePack(pack)).not.toThrow();
    }
  });

  it("accepts the source federal district without giving political states zero Senate seats", () => {
    expect(() => validatePack(pack2023)).not.toThrow();
    const missingStateSeats = structuredClone(pack2023);
    missingStateSeats.states!.find((state) => state.countryId === "US" && state.id === "VA")!.senateSeats = 0;
    expect(() => validatePack(missingStateSeats)).toThrow(/senateSeats.*> 0/);
    const districtSeats = structuredClone(pack2023);
    districtSeats.states!.find((state) => state.id === "DC")!.houseSeats = 1;
    expect(() => validatePack(districtSeats)).toThrow(/federal district DC.*zero/);
  });

  it("rejects duplicate country ids", () => {
    const dup: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    dup.countries.push({ ...dup.countries[0]! });
    expect(() => validatePack(dup)).toThrow(/duplicate/i);
  });

  it("rejects no playable countries", () => {
    const noPlay: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    for (const c of noPlay.countries) c.playable = false;
    expect(() => validatePack(noPlay)).toThrow(/playable/i);
  });

  it("rejects bad dates", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.era.startDate = "1953-13-01";
    expect(() => validatePack(bad)).toThrow(/date/i);
    const bad2 = structuredClone(PACKS[0]!) as SeedPack;
    bad2.era.startDate = "not-a-date";
    expect(() => validatePack(bad2)).toThrow(/date/i);
  });

  it("rejects non-finite numbers", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.countries[0]!.economy.gdp = Infinity;
    expect(() => validatePack(bad)).toThrow(/gdp/i);
    const bad2 = structuredClone(PACKS[0]!) as SeedPack;
    bad2.countries[0]!.economy.growthRate = NaN;
    expect(() => validatePack(bad2)).toThrow(/growthRate/i);
  });

  it("strictly validates economy-only regions without allowing political field leakage", () => {
    const bad = structuredClone(pack1953) as SeedPack;
    bad.economyRegions![0]!.metrics["economic.gdpGrowth"] = Number.NaN;
    expect(() => validatePack(bad)).toThrow(/economyRegions.*metrics/i);
    const unknownField = structuredClone(pack1953) as SeedPack;
    (unknownField.economyRegions![0] as unknown as Record<string, unknown>)["registration"] = {};
    expect(() => validatePack(unknownField)).toThrow(/unknown field/i);
  });

  it("validates Eastern Bloc background source calendars and historical weighted allocations", () => {
    expect(() => validatePack(pack1953)).not.toThrow();
    const hungarian1953 = pack1953.backgroundElections!.find((row) => row.countryId === "HU")!.party;
    expect([hungarian1953.name, hungarian1953.abbreviation, hungarian1953.economicPosition, hungarian1953.socialPosition]).toEqual([
      "Magyar Dolgozók Pártja", "MDP", -4, 2,
    ]);
    const hungarian1979 = pack1979.backgroundElections!.find((row) => row.countryId === "HU")!.party;
    expect([hungarian1979.name, hungarian1979.abbreviation, hungarian1979.economicPosition, hungarian1979.socialPosition]).toEqual([
      "Magyar Szocialista Munkáspárt", "MSZMP", -3, 1,
    ]);
    const invalid = structuredClone(pack1953) as SeedPack;
    invalid.backgroundElections![0]!.initialSeatAllocations![0]!.seats = Number.MAX_SAFE_INTEGER;
    expect(() => validatePack(invalid)).toThrow(/invalid initial seat allocation/);

    const selectable = structuredClone(pack1953) as SeedPack;
    selectable.countries.find((country) => country.id === "PL")!.playable = true;
    expect(() => validatePack(selectable)).toThrow(/selectable country/);

    const missingSourceGroups = structuredClone(pack1953) as SeedPack;
    missingSourceGroups.backgroundElections![0]!.regions[0]!.demographics.groups = {};
    expect(() => validatePack(missingSourceGroups)).toThrow(/voter groups do not match/);
  });

  it("rejects invalid packVersion", () => {
    const bad = structuredClone(PACKS[0]!) as SeedPack;
    (bad as unknown as Record<string, unknown>)["packVersion"] = 0;
    expect(() => validatePack(bad)).toThrow(/packVersion/i);
  });

  it("1953 pack has 27 countries and expected ids exist", () => {
    expect(pack1953.countries.length).toBe(27);
    const ids = new Set(pack1953.countries.map((c) => c.id));
    expect(ids.has("US")).toBe(true);
    expect(ids.has("UK")).toBe(true);
    expect(ids.has("RU")).toBe(true);
    // eastern bloc satellites
    expect(ids.has("PL")).toBe(true);
    expect(ids.has("BAL")).toBe(true);
  });

  it("1953 pack has parties for all playable countries", () => {
    const playable = new Set(pack1953.countries.filter((c) => c.playable).map((c) => c.id));
    const partyCountries = new Set((pack1953.parties ?? []).map((p) => p.countryId));
    for (const id of playable) expect(partyCountries.has(id)).toBe(true);
  });

  it("ports authored 1953 China economy regions without treating them as political states", () => {
    const regions = (pack1953.economyRegions ?? []).filter((region) => region.countryId === "CN");
    expect(pack1953.countries.find((country) => country.id === "CN")?.playable).toBe(false);
    expect(regions.map((region) => region.id)).toEqual(["DB", "HB", "HD", "HZ", "HN", "XN", "XB"]);
    expect(regions.reduce((sum, region) => sum + region.population, 0)).toBe(585_000_000);
    expect(regions.reduce((sum, region) => sum + region.gdp, 0)).toBe(33_333);
    expect(regions.reduce((sum, region) => sum + region.houseSeats, 0)).toBe(1_226);
    expect(regions.reduce((sum, region) => sum + region.senateSeats, 0)).toBe(3_781);
    expect(pack1953.states?.some((state) => state.countryId === "CN")).toBe(false);
    expect((pack1953.parties ?? []).filter((party) => party.countryId === "CN").map((party) => party.id)).toEqual(["CN_CCP", "CN_CDL", "CN_CNDCA"]);
    expect(regions.every((region) => Object.keys(region.metrics).length > 0)).toBe(true);
  });

  it("registry is exactly the seven real mainline presets, with no fabricated eras", async () => {
    const { PACKS } = await import("./packs/index.js");
    const ids = PACKS.map((p) => p.era.id).sort();
    expect(ids).toEqual(["1953", "1979", "1991", "1999", "2007", "2019", "2023"]);
    for (const bad of ["1960", "1968", "1976"]) {
      expect(ids).not.toContain(bad);
    }
  });

  it("1979 pack keeps the same COLD_WAR_PLAYER roster as 1953 (US/UK/RU/DD)", async () => {
    const { pack1979 } = await import("./packs/index.js");
    const playable = pack1979.countries.filter((c) => c.playable).map((c) => c.id).sort();
    expect(playable).toEqual(["DD", "RU", "UK", "US"]);
  });

  it("keeps preview countries unavailable while adding bounded Germany starts without RU/DD entities", async () => {
    // Germany's 2019 start has a bounded authored tax-law path. Later raw
    // packs retain source country records, while the public session boundary
    // decides which countries can start a new character.
    const { pack1991, pack2019 } = await import("./packs/index.js");
    const playable = (p: SeedPack) => p.countries.filter((c) => c.playable).map((c) => c.id).sort();
    expect(playable(pack1991)).toEqual(["BR", "CN", "IE", "UK", "US"]);
    expect(playable(pack2019)).toEqual(["CN", "DE", "IE", "UK", "US"]);
    for (const p of [pack1991, pack2019]) {
      expect(p.countries.some((c) => c.id === "RU" || c.id === "DD"), `${p.era.id} RU/DD`).toBe(false);
    }
  });

  it("every chamber composition sums to chamber seats", () => {
    for (const pack of PACKS) {
      for (const leg of pack.legislatures ?? []) {
        for (const ch of leg.chambers) {
          const sum = Object.values(ch.composition.seatsByParty).reduce((a, b) => a + b, 0) + ch.composition.vacancies;
          expect(sum, `${pack.era.id} ${leg.countryId} ${ch.key} sum ${sum} vs seats ${ch.seats}`).toBe(ch.seats);
        }
      }
    }
  });

  it("every party ref in legislature compositions resolves and matches legislature country", () => {
    for (const pack of PACKS) {
      const partyMap = new Map((pack.parties ?? []).map((p) => [p.id, p]));
      for (const leg of pack.legislatures ?? []) {
        for (const ch of leg.chambers) {
          for (const pid of Object.keys(ch.composition.seatsByParty)) {
            expect(partyMap.has(pid), `${pack.era.id} ${leg.countryId} ${ch.key} party ${pid} missing`).toBe(true);
            expect(partyMap.get(pid)!.countryId).toBe(leg.countryId);
          }
        }
      }
    }
  });

  it("rejects duplicate party ids", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.parties!.push({ ...bad.parties![0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate party/i);
  });

  it("rejects party with invalid country ref", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.parties!.push({ id: "FAKE_X", name: "Fake", countryId: "ZZ", abbreviation: "FAK", color: "#000", economicPosition: 0, socialPosition: 0 });
    expect(() => validatePack(bad)).toThrow(/countryId.*ZZ/i);
  });

  it("rejects seatsByParty unknown party ref", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers[0]!.composition.seatsByParty["FAKE_PARTY"] = 1;
    // adjust vacancies to keep sum valid so the unknown party error fires first
    leg.chambers[0]!.composition.vacancies -= 1;
    expect(() => validatePack(bad)).toThrow(/unknown party/i);
  });

  it("rejects composition sum mismatch", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers[0]!.composition.vacancies += 1;
    expect(() => validatePack(bad)).toThrow(/composition sum/i);
  });

  it("rejects duplicate chamber keys", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers.push({ ...leg.chambers[0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate chamber key/i);
  });

  it("playable countries have legislature entries with expected chambers and elected flags", () => {
    const usLeg = pack1953.legislatures!.find((l) => l.countryId === "US")!;
    expect(usLeg.bicameral).toBe(true);
    expect(usLeg.chambers.some((c) => c.key === "senate" && c.elected === true)).toBe(true);
    expect(usLeg.chambers.some((c) => c.key === "house" && c.elected === true)).toBe(true);
    const ukLeg = pack1953.legislatures!.find((l) => l.countryId === "UK")!;
    expect(ukLeg.bicameral).toBe(false);
    expect(ukLeg.chambers.find((c) => c.key === "lords")!.elected).toBe(false);
    expect(ukLeg.chambers.find((c) => c.key === "commons")!.elected).toBe(true);
    const ddLeg = pack1953.legislatures!.find((l) => l.countryId === "DD")!;
    expect(ddLeg.chambers.find((c) => c.key === "staatsrat")!.elected).toBe(false);
    expect(ddLeg.chambers.find((c) => c.key === "volkskammer")!.elected).toBe(true);
    const ruLeg = pack1953.legislatures!.find((l) => l.countryId === "RU")!;
    expect(ruLeg.bicameral).toBe(true);
    expect(ruLeg.chambers.find((c) => c.key === "sovietOfNationalities")!.seats).toBe(515);
    expect(ruLeg.chambers.find((c) => c.key === "sovietOfTheUnion")!.seats).toBe(526);
  });

  it("party economic/social positions are within [-5,5] and match engine axis system", () => {
    for (const pack of PACKS) {
      for (const p of pack.parties ?? []) {
        expect(p.economicPosition).toBeGreaterThanOrEqual(-5);
        expect(p.economicPosition).toBeLessThanOrEqual(5);
        expect(p.socialPosition).toBeGreaterThanOrEqual(-5);
        expect(p.socialPosition).toBeLessThanOrEqual(5);
      }
    }
  });

  it("1953 pack has 80 states (48 US +12 UK +14 RU +6 DD), AK/HI absent", () => {
    expect(pack1953.states!.length).toBe(80);
    expect(pack1953.states!.filter((s) => s.countryId === "US").length).toBe(48);
    expect(pack1953.states!.filter((s) => s.countryId === "UK").length).toBe(12);
    expect(pack1953.states!.filter((s) => s.countryId === "RU").length).toBe(14);
    expect(pack1953.states!.filter((s) => s.countryId === "DD").length).toBe(6);
    const ids = new Set(pack1953.states!.map((s) => s.id));
    expect(ids.has("AK")).toBe(false);
    expect(ids.has("HI")).toBe(false);
    expect(ids.has("DC")).toBe(false);
    expect(ids.has("CA")).toBe(true);
    expect(ids.has("NY")).toBe(true);
    expect(ids.has("TX")).toBe(true);
    expect(ids.has("LON")).toBe(true);
    expect(ids.has("CEN")).toBe(true);
    expect(ids.has("BEO")).toBe(true);
    expect(ids.size).toBe(80);
  });

  it("1953 US states houseSeats sum to 435 (83rd Congress apportionment)", () => {
    const total = pack1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.houseSeats, 0);
    expect(total).toBe(435);
  });

  it("1953 US states population sums plausible vs mainline total (149,895,183 from 1950 Census)", () => {
    const totalUS = pack1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.population, 0);
    expect(totalUS).toBe(149_895_183);
    const totalUK = pack1953.states!.filter((s) => s.countryId === "UK").reduce((a, s) => a + s.population, 0);
    expect(totalUK).toBe(52600000);
    const totalRU = pack1953.states!.filter((s) => s.countryId === "RU").reduce((a, s) => a + s.population, 0);
    expect(totalRU).toBe(148500000);
    const totalDD = pack1953.states!.filter((s) => s.countryId === "DD").reduce((a, s) => a + s.population, 0);
    expect(totalDD).toBe(18400000);
  });

  it("1953 US states have senateClasses I/II/III and gdp/region Registration modeled", () => {
    for (const st of pack1953.states!) {
      expect(st.senateClasses.length).toBe(2);
      for (const c of st.senateClasses) expect([1, 2, 3]).toContain(c);
      expect(st.gdp).toBeGreaterThan(0);
      expect(st.region).not.toBe("");
      expect(st.registration.parties.length).toBeGreaterThan(0);
      // disenfranchisement modeled as unregistered pool — Southern states have large pools
      if (st.id === "MS") expect(st.registration.unregistered).toBe(25);
      if (st.id === "AL") expect(st.registration.unregistered).toBe(22);
    }
  });

  it("state legislatures: stateSenate chamber is vacant with citation (no invented 1953 composition)", () => {
    const usLeg = pack1953.legislatures!.find((l) => l.countryId === "US")!;
    const stateSenate = usLeg.chambers.find((c) => c.key === "stateSenate")!;
    // 1972 is the 50-state total (STATE_SENATE_SEATS sum); the chamber is sized to the seeded 48-state sum. 1953 pack has 48 contiguous states
    // (AK 20 + HI 25 absent; plus NY 61 vs modern 63 delta). Per-state sum for 1953 is 1925.
    // No mainline 1953 composition exists, so it stays vacant. Source: historicalSeats.ts has no US_STATE_SENATE_1953 roster; only US_HOUSE/SENATE/GOVERNOR for 1953.
    expect(stateSenate.seats).toBe(1925);
    expect(stateSenate.composition.vacancies).toBe(1925);
    expect(Object.keys(stateSenate.composition.seatsByParty).length).toBe(0);
    // Sum of per-state senateSeats for 1953 US 48 states is 1925
    const sum = pack1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.senateSeats, 0);
    expect(sum).toBe(1925);
  });

  it("pack validation extended: rejects duplicate state ids and bad houseSeats sum", () => {
    const bad: SeedPack = structuredClone(pack1953) as SeedPack;
    bad.states!.push({ ...bad.states![0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate state/i);
    const bad2: SeedPack = structuredClone(pack1953) as SeedPack;
    bad2.states![0]!.houseSeats += 1;
    expect(() => validatePack(bad2)).toThrow(/houseSeats sum/i);
  });

  it("W39: UK 12, RU 14, DD 6 houseSeats sum to mainline totals (625, 526, 500) and gdp/population plausible", () => {
    const ukSum = pack1953.states!.filter((s) => s.countryId === "UK").reduce((a, s) => a + s.houseSeats, 0);
    expect(ukSum).toBe(625);
    const ruSum = pack1953.states!.filter((s) => s.countryId === "RU").reduce((a, s) => a + s.houseSeats, 0);
    expect(ruSum).toBe(526);
    const ddSum = pack1953.states!.filter((s) => s.countryId === "DD").reduce((a, s) => a + s.houseSeats, 0);
    expect(ddSum).toBe(500);
    // gdp positive and region field present for all W39 subdivisions
    for (const st of pack1953.states!.filter((s) => ["UK", "RU", "DD"].includes(s.countryId))) {
      expect(st.gdp).toBeGreaterThan(0);
      expect(st.region).not.toBe("");
    }
  });

  it("W39: UK/RU/DD registration anchors reflect mainline polling/org tables (no invented numbers)", () => {
    // UK NIR SF 30, CON 63; SCO SNP 0 but present; RU CEN CPSU 98; DD BEO SED 66
    const nir = pack1953.states!.find((s) => s.id === "NIR")!;
    expect(nir.registration.parties.find((p) => p.abbr === "SF")!.reg).toBe(30);
    expect(nir.registration.parties.find((p) => p.abbr === "CON")!.reg).toBe(63);
    const sco = pack1953.states!.find((s) => s.id === "SCO")!;
    expect(sco.registration.parties.find((p) => p.abbr === "SNP")!.reg).toBe(0);
    const cen = pack1953.states!.find((s) => s.id === "CEN")!;
    expect(cen.registration.parties.find((p) => p.abbr === "CPSU")!.reg).toBe(98);
    const beo = pack1953.states!.find((s) => s.id === "BEO")!;
    expect(beo.registration.parties.find((p) => p.abbr === "SED")!.reg).toBe(66);
  });
});

describe("state layer (regions, apportionment) per pack", () => {
  // Regression guard for the 2026-09-02 QA-sweep finding: the 1979/1991/2019
  // packs shipped with no US state layer (3 placeholder regions), so no
  // per-state House/Senate/governor race could ever spawn and a 1979 US
  // Congress stayed empty forever; 1991/2019 only looked healthy because they
  // seeded Congress from a historical table and then froze it. Every playable
  // country in every pack must carry regions whose apportionment sums match
  // the chamber seat counts the election orchestration spawns against.
  const seatsOf = (pack: SeedPack, country: string, key: string): number | undefined =>
    pack.legislatures?.find((l) => l.countryId === country)?.chambers.find((c) => c.key === key)?.seats;
  const sum = (xs: Array<{ houseSeats: number; senateSeats: number }>, k: "houseSeats" | "senateSeats") => xs.reduce((a, s) => a + s[k], 0);

  it("every playable country has regions with per-region apportionment", () => {
    for (const pack of PACKS) {
      for (const c of pack.countries.filter((x) => x.playable)) {
        const regions = (pack.states ?? []).filter((s) => s.countryId === c.id);
        expect(regions.length, `${pack.era.id} ${c.id} regions`).toBeGreaterThan(0);
        for (const r of regions) expect(r.registration.parties.length, `${pack.era.id} ${r.id} registration`).toBeGreaterThan(0);
      }
    }
  });

  it("US: 50 political states and 435 House seats; 2023 DC is a zero-seat federal district", () => {
    for (const pack of PACKS) {
      const us = (pack.states ?? []).filter((s) => s.countryId === "US");
      if (pack.era.id === "1953") expect(us.length).toBe(48); // AK/HI territories
      else expect(us.length, pack.era.id).toBe(pack.era.id === "2023" ? 51 : 50);
      if (pack.era.id === "2023") {
        expect(us.find((state) => state.id === "DC"), "2023 federal district").toMatchObject({ houseSeats: 0, senateSeats: 0 });
      } else {
        expect(us.some((s) => s.id === "DC"), `${pack.era.id} DC`).toBe(false);
      }
      expect(sum(us, "houseSeats"), `${pack.era.id} house`).toBe(seatsOf(pack, "US", "house"));
      expect(sum(us, "senateSeats"), `${pack.era.id} stateSenate`).toBe(seatsOf(pack, "US", "stateSenate"));
    }
  });

  it("keeps one Game-authored DC geography row for HQ resolution", () => {
    for (const pack of PACKS) {
      const stateRows = (pack.states ?? []).filter((region) => region.id === "DC");
      const hqRows = (pack.corporationHeadquartersRegions ?? []).filter((region) => region.id === "DC");
      expect(stateRows.length + hqRows.length, pack.era.id).toBe(1);
      if (pack.era.id === "2023") {
        expect(stateRows[0]).toMatchObject({ id: "DC", population: 678972, houseSeats: 0, senateSeats: 0 });
        expect(hqRows).toHaveLength(0);
      } else {
        expect(stateRows).toHaveLength(0);
        expect(hqRows).toContainEqual({ id: "DC", countryId: "US", name: "District of Columbia" });
      }
    }
  });

  it("UK: 12 regions whose council seats sum to the regionalCouncil chamber", () => {
    for (const pack of PACKS) {
      const uk = (pack.states ?? []).filter((s) => s.countryId === "UK");
      expect(uk.length, pack.era.id).toBe(12);
      expect(sum(uk, "senateSeats"), `${pack.era.id} regionalCouncil`).toBe(seatsOf(pack, "UK", "regionalCouncil"));
    }
  });

  it("RU/DD/JP/DE/CN/BR/IE (where present): region apportionment sums to the lower and subnational chambers", () => {
    for (const pack of PACKS) {
      // Lower/subnational chamber pairs contested per region for every non-US/UK
      // playable country with an authored region layer (see
      // elections/orchestration.ts LOWER_PER_REGION + SUBNATIONAL_CHAMBERS).
      // BR's upper house is its Senado.
      for (const [cid, lower, upper] of [["RU", "sovietOfTheUnion", "republicSupremeSoviet"], ["DD", "volkskammer", "landAssembly"], ["JP", "shugiin", "regionalCouncil"], ["DE", "bundestag", "landtag"], ["CN", "npc", "peoplesCongress"], ["BR", "chamber", "senate"], ["IE", "dail", "localCouncil"]] as const) {
        // Only playable entries carry a region layer (economy-only entries do not).
        if (!pack.countries.some((c) => c.id === cid && c.playable)) continue;
        const rs = (pack.states ?? []).filter((s) => s.countryId === cid);
        expect(rs.length, `${pack.era.id} ${cid}`).toBeGreaterThan(0);
        expect(sum(rs, "houseSeats"), `${pack.era.id} ${cid} ${lower}`).toBe(seatsOf(pack, cid, lower));
        expect(sum(rs, "senateSeats"), `${pack.era.id} ${cid} ${upper}`).toBe(seatsOf(pack, cid, upper));
      }
    }
  });
});

describe("post-Cold-War rosters", () => {
  it("includes bounded 2019 Germany and retains the other authored playable rosters", () => {
    const playable = (era: string) => PACKS.find((p) => p.era.id === era)!.countries.filter((c) => c.playable).map((c) => c.id).sort();
    expect(playable("1991")).toEqual(["BR", "CN", "IE", "UK", "US"]);
    expect(playable("2019")).toEqual(["CN", "DE", "IE", "UK", "US"]);
    expect(playable("1953")).toEqual(["DD", "RU", "UK", "US"]);
    expect(playable("1979")).toEqual(["DD", "RU", "UK", "US"]);
  });

  it("every playable country has parties and a legislature whose elected chambers can be filled from its regions", () => {
    for (const pack of PACKS) {
      for (const c of pack.countries.filter((x) => x.playable)) {
        expect((pack.parties ?? []).filter((p) => p.countryId === c.id).length, `${pack.era.id} ${c.id} parties`).toBeGreaterThan(0);
        const leg = pack.legislatures?.find((l) => l.countryId === c.id);
        expect(leg, `${pack.era.id} ${c.id} legislature`).toBeDefined();
        for (const ch of leg!.chambers) {
          const seated = Object.values(ch.composition.seatsByParty).reduce((a, b) => a + b, 0);
          expect(seated + ch.composition.vacancies, `${pack.era.id} ${c.id} ${ch.key}`).toBe(ch.seats);
          for (const pid of Object.keys(ch.composition.seatsByParty)) expect((pack.parties ?? []).some((p) => p.id === pid), `${pack.era.id} ${c.id} ${ch.key} party ${pid}`).toBe(true);
        }
      }
    }
  });
});

describe("authored national budgets", () => {
  it("every playable country in every pack has an authored budget that levies real core taxes", () => {
    // Mainline getInitialNationalBudgetsForPreset fails loud on an all-zero core
    // rate vector ("BR's class of bug"); the same rule holds for every pack here.
    for (const pack of PACKS) {
      for (const c of pack.countries.filter((x) => x.playable)) {
        const b = (pack.budgets ?? []).find((x) => x.countryId === c.id);
        expect(b, `${pack.era.id} ${c.id} budget`).toBeDefined();
        expect(b!.gdp, `${pack.era.id} ${c.id} gdp`).toBeGreaterThan(0);
        expect(b!.taxRates.incomeTax + b!.taxRates.domesticCorporateTax + b!.taxRates.payrollTax + b!.taxRates.salesTax, `${pack.era.id} ${c.id} core rates`).toBeGreaterThan(0);
        // Mainline's per-preset budget configs are dated at or after the era start
        // (2019-default: US/UK/JP/DE/CN are 2020 snapshots, IE 2023) - authored data, kept verbatim.
        expect(b!.fiscalYear, `${pack.era.id} ${c.id} fiscalYear`).toBeGreaterThanOrEqual(Number(pack.era.id));
      }
    }
  });
});
