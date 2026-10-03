import type { SeedPack } from "./types.js";

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseIsoDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  // Verify round-trip (reject 1953-02-31 etc)
  if (d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

/**
 * Validate a seed pack. Throws with a descriptive message on the first hard error.
 * Checks: packVersion, era id/label/startDate, countries table, duplicate ids,
 * at least one playable, economy numbers finite, gdp > 0, rates finite.
 * No IO, no randomness.
 */
export function validatePack(pack: SeedPack): void {
  if (typeof pack !== "object" || pack === null) {
    throw new Error("validatePack: pack must be an object");
  }

  // packVersion
  if (!isFiniteNumber(pack.packVersion) || !Number.isInteger(pack.packVersion) || pack.packVersion < 1) {
    throw new Error(`validatePack: packVersion must be a finite integer >= 1, got ${String(pack.packVersion)}`);
  }

  // era
  if (typeof pack.era !== "object" || pack.era === null) {
    throw new Error("validatePack: era must be an object");
  }
  const era = pack.era;
  if (typeof era.id !== "string" || era.id.trim() === "") {
    throw new Error("validatePack: era.id must be a non-empty string");
  }
  if (typeof era.label !== "string" || era.label.trim() === "") {
    throw new Error("validatePack: era.label must be a non-empty string");
  }
  if (typeof era.startDate !== "string" || parseIsoDay(era.startDate) === null) {
    throw new Error(`validatePack: era.startDate must be a valid ISO day YYYY-MM-DD, got ${String(era.startDate)}`);
  }

  // countries
  if (!Array.isArray(pack.countries)) {
    throw new Error("validatePack: countries must be an array");
  }
  if (pack.countries.length === 0) {
    throw new Error("validatePack: countries must not be empty");
  }

  const seen = new Set<string>();
  let playableCount = 0;

  for (let i = 0; i < pack.countries.length; i++) {
    const c = pack.countries[i] as unknown as Record<string, unknown>;
    if (typeof c !== "object" || c === null) {
      throw new Error(`validatePack: countries[${i}] must be an object`);
    }
    const id = c["id"];
    const name = c["name"];
    const playable = c["playable"];
    const economy = c["economy"] as unknown as Record<string, unknown> | undefined;

    if (typeof id !== "string" || id.trim() === "") {
      throw new Error(`validatePack: countries[${i}].id must be a non-empty string`);
    }
    if (seen.has(id)) {
      throw new Error(`validatePack: duplicate country id "${id}"`);
    }
    seen.add(id);

    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`validatePack: countries[${i}].name must be a non-empty string for id "${id}"`);
    }
    if (typeof playable !== "boolean") {
      throw new Error(`validatePack: countries[${i}].playable must be a boolean for id "${id}"`);
    }
    if (playable) playableCount++;

    if (typeof economy !== "object" || economy === null) {
      throw new Error(`validatePack: countries[${i}].economy must be an object for id "${id}"`);
    }

    const gdp = economy["gdp"];
    const growthRate = economy["growthRate"];
    const inflationRate = economy["inflationRate"];
    const unemploymentRate = economy["unemploymentRate"];

    if (!isFiniteNumber(gdp) || (gdp as number) <= 0) {
      throw new Error(`validatePack: countries[${i}].economy.gdp must be a finite number > 0 for id "${id}", got ${String(gdp)}`);
    }
    if (!isFiniteNumber(growthRate)) {
      throw new Error(`validatePack: countries[${i}].economy.growthRate must be a finite number for id "${id}", got ${String(growthRate)}`);
    }
    if (!isFiniteNumber(inflationRate)) {
      throw new Error(`validatePack: countries[${i}].economy.inflationRate must be a finite number for id "${id}", got ${String(inflationRate)}`);
    }
    if (!isFiniteNumber(unemploymentRate)) {
      throw new Error(`validatePack: countries[${i}].economy.unemploymentRate must be a finite number for id "${id}", got ${String(unemploymentRate)}`);
    }
    // unemployment is a rate 0..1, but allow 0 inclusive; negative is invalid.
    if ((unemploymentRate as number) < 0 || (unemploymentRate as number) > 1) {
      throw new Error(`validatePack: countries[${i}].economy.unemploymentRate must be in [0,1] for id "${id}", got ${String(unemploymentRate)}`);
    }
  }

  if (playableCount === 0) {
    throw new Error("validatePack: at least one playable country is required");
  }

  // optional extension tables: if present, must be arrays
  for (const key of ["states", "economyRegions", "parties", "sectors", "legislatures", "budgets", "corporationHeadquartersRegions"] as const) {
    const v = (pack as unknown as Record<string, unknown>)[key];
    if (v !== undefined && !Array.isArray(v)) {
      throw new Error(`validatePack: ${key} must be an array if present`);
    }
  }

  if (pack.corporationHeadquartersRegions !== undefined) {
    const seenHeadquarters = new Set<string>();
    for (let i = 0; i < pack.corporationHeadquartersRegions.length; i++) {
      const location = pack.corporationHeadquartersRegions[i]!;
      if (!location || typeof location !== "object") throw new Error(`validatePack: corporationHeadquartersRegions[${i}] must be an object`);
      if (typeof location.id !== "string" || location.id.trim() === "") throw new Error(`validatePack: corporationHeadquartersRegions[${i}].id must be non-empty`);
      if (seenHeadquarters.has(location.id)) throw new Error(`validatePack: duplicate corporation headquarters region id "${location.id}"`);
      seenHeadquarters.add(location.id);
      if (typeof location.name !== "string" || location.name.trim() === "") throw new Error(`validatePack: corporationHeadquartersRegions[${i}].name must be non-empty`);
      if (!seen.has(location.countryId)) throw new Error(`validatePack: corporationHeadquartersRegions[${i}].countryId "${location.countryId}" does not match any country`);
      if ((pack.states ?? []).some((state) => state.id === location.id)) throw new Error(`validatePack: corporation headquarters region "${location.id}" must not duplicate a political state`);
    }
  }

  // states validation
  if (Array.isArray(pack.states)) {
    const seenStates = new Set<string>();
    let totalHouse = 0;
    for (let i = 0; i < pack.states.length; i++) {
      const s = pack.states[i] as unknown as Record<string, unknown>;
      if (typeof s !== "object" || s === null) throw new Error(`validatePack: states[${i}] must be an object`);
      const id = s["id"];
      const name = s["name"];
      const countryId = s["countryId"];
      const population = s["population"];
      const gdp = s["gdp"];
      const houseSeats = s["houseSeats"];
      const senateSeats = s["senateSeats"];
      const region = s["region"];
      const senateClasses = s["senateClasses"];
      const registration = s["registration"] as unknown as Record<string, unknown> | undefined;
      if (typeof id !== "string" || id.trim() === "") throw new Error(`validatePack: states[${i}].id must be a non-empty string`);
      if (seenStates.has(id)) throw new Error(`validatePack: duplicate state id "${id}"`);
      seenStates.add(id);
      if (typeof name !== "string" || name.trim() === "") throw new Error(`validatePack: states[${i}].name must be a non-empty string for id "${id}"`);
      if (typeof countryId !== "string" || countryId.trim() === "") throw new Error(`validatePack: states[${i}].countryId must be a non-empty string for id "${id}"`);
      if (!seen.has(countryId)) throw new Error(`validatePack: states[${i}].countryId "${countryId}" does not match any country for state "${id}"`);
      if (!isFiniteNumber(population) || !Number.isInteger(population as number) || (population as number) <= 0) throw new Error(`validatePack: states[${i}].population must be a finite integer > 0 for id "${id}", got ${String(population)}`);
      if (!isFiniteNumber(gdp) || (gdp as number) <= 0) throw new Error(`validatePack: states[${i}].gdp must be a finite number > 0 for id "${id}", got ${String(gdp)}`);
      if (!isFiniteNumber(houseSeats) || !Number.isInteger(houseSeats as number) || (houseSeats as number) < 0) throw new Error(`validatePack: states[${i}].houseSeats must be a finite integer >= 0 for id "${id}", got ${String(houseSeats)}`);
      if (!isFiniteNumber(senateSeats) || !Number.isInteger(senateSeats as number) || (senateSeats as number) <= 0) throw new Error(`validatePack: states[${i}].senateSeats must be a finite integer > 0 for id "${id}", got ${String(senateSeats)}`);
      if (typeof region !== "string" || region.trim() === "") throw new Error(`validatePack: states[${i}].region must be a non-empty string for id "${id}"`);
      if (!Array.isArray(senateClasses) || senateClasses.length !== 2) throw new Error(`validatePack: states[${i}].senateClasses must be a [1|2|3, 1|2|3] pair for id "${id}"`);
      for (let k = 0; k < 2; k++) {
        const c = senateClasses[k];
        if (c !== 1 && c !== 2 && c !== 3) throw new Error(`validatePack: states[${i}].senateClasses[${k}] must be 1, 2, or 3 for id "${id}", got ${String(c)}`);
      }
      if (typeof registration !== "object" || registration === null) throw new Error(`validatePack: states[${i}].registration must be an object for id "${id}"`);
      const parties = (registration as Record<string, unknown>)["parties"];
      const independent = (registration as Record<string, unknown>)["independent"];
      const unregistered = (registration as Record<string, unknown>)["unregistered"];
      const unaffiliatedOrg = (registration as Record<string, unknown>)["unaffiliatedOrg"];
      if (!Array.isArray(parties) || parties.length === 0) throw new Error(`validatePack: states[${i}].registration.parties must be a non-empty array for id "${id}"`);
      for (let k = 0; k < parties.length; k++) {
        const pr = parties[k] as unknown as Record<string, unknown>;
        if (typeof pr !== "object" || pr === null) throw new Error(`validatePack: states[${i}].registration.parties[${k}] must be an object for id "${id}"`);
        if (typeof pr["abbr"] !== "string" || (pr["abbr"] as string).trim() === "") throw new Error(`validatePack: states[${i}].registration.parties[${k}].abbr must be a non-empty string for id "${id}"`);
        if (!isFiniteNumber(pr["org"]) || pr["org"] as number < 0 || pr["org"] as number > 100) throw new Error(`validatePack: states[${i}].registration.parties[${k}].org must be in [0,100] for id "${id}", got ${String(pr["org"])}`);
        if (!isFiniteNumber(pr["reg"]) || pr["reg"] as number < 0 || pr["reg"] as number > 100) throw new Error(`validatePack: states[${i}].registration.parties[${k}].reg must be in [0,100] for id "${id}", got ${String(pr["reg"])}`);
      }
      if (!isFiniteNumber(independent) || independent as number < 0 || independent as number > 100) throw new Error(`validatePack: states[${i}].registration.independent must be in [0,100] for id "${id}", got ${String(independent)}`);
      if (!isFiniteNumber(unregistered) || unregistered as number < 0 || unregistered as number > 100) throw new Error(`validatePack: states[${i}].registration.unregistered must be in [0,100] for id "${id}", got ${String(unregistered)}`);
      if (!isFiniteNumber(unaffiliatedOrg) || unaffiliatedOrg as number < 0 || unaffiliatedOrg as number > 100) throw new Error(`validatePack: states[${i}].registration.unaffiliatedOrg must be in [0,100] for id "${id}", got ${String(unaffiliatedOrg)}`);
      totalHouse += houseSeats as number;
    }
    // For US 1953 pack, apportionment must sum to 435 (48 states; AK/HI absent)
    // Cross-check only for packs that have US states; allow other eras to have different totals
    const usStates = pack.states.filter((s) => s.countryId === "US");
    if (usStates.length > 0) {
      const sum = usStates.reduce((a, s) => a + s.houseSeats, 0);
      // 1953 pack expects 435; other packs may differ but we enforce plausible range
      if (pack.era.id === "1953" && sum !== 435) throw new Error(`validatePack: US states houseSeats sum ${sum} does not equal 435 for era 1953`);
      if (usStates.length === 48 && sum !== 435) throw new Error(`validatePack: 48 US states houseSeats sum ${sum} does not equal 435`);
    }
  }

  // parties validation
  if (Array.isArray(pack.parties)) {
    const partyIds = new Set<string>();
    for (let i = 0; i < pack.parties.length; i++) {
      const p = pack.parties[i] as unknown as Record<string, unknown>;
      if (typeof p !== "object" || p === null) throw new Error(`validatePack: parties[${i}] must be an object`);
      const id = p["id"];
      const name = p["name"];
      const countryId = p["countryId"];
      const abbreviation = p["abbreviation"];
      const color = p["color"];
      const econ = p["economicPosition"];
      const soc = p["socialPosition"];
      if (typeof id !== "string" || id.trim() === "") throw new Error(`validatePack: parties[${i}].id must be a non-empty string`);
      if (partyIds.has(id)) throw new Error(`validatePack: duplicate party id "${id}"`);
      partyIds.add(id);
      if (typeof name !== "string" || name.trim() === "") throw new Error(`validatePack: parties[${i}].name must be a non-empty string for id "${id}"`);
      if (typeof countryId !== "string" || countryId.trim() === "") throw new Error(`validatePack: parties[${i}].countryId must be a non-empty string for id "${id}"`);
      if (!seen.has(countryId)) throw new Error(`validatePack: parties[${i}].countryId "${countryId}" does not match any country for party "${id}"`);
      if (typeof abbreviation !== "string" || abbreviation.trim() === "") throw new Error(`validatePack: parties[${i}].abbreviation must be a non-empty string for id "${id}"`);
      if (typeof color !== "string" || color.trim() === "") throw new Error(`validatePack: parties[${i}].color must be a non-empty string for id "${id}"`);
      if (!isFiniteNumber(econ) || (econ as number) < -5 || (econ as number) > 5) throw new Error(`validatePack: parties[${i}].economicPosition must be a finite number in [-5,5] for id "${id}", got ${String(econ)}`);
      if (!isFiniteNumber(soc) || (soc as number) < -5 || (soc as number) > 5) throw new Error(`validatePack: parties[${i}].socialPosition must be a finite number in [-5,5] for id "${id}", got ${String(soc)}`);
    }
  }

  // legislatures validation
  if (Array.isArray(pack.legislatures)) {
    const partyIds = new Set<string>((pack.parties ?? []).map((p) => p.id));
    const legislatureCountryIds = new Set<string>();
    for (let i = 0; i < pack.legislatures.length; i++) {
      const leg = pack.legislatures[i] as unknown as Record<string, unknown>;
      if (typeof leg !== "object" || leg === null) throw new Error(`validatePack: legislatures[${i}] must be an object`);
      const countryId = leg["countryId"];
      const name = leg["name"];
      const bicameral = leg["bicameral"];
      const chambers = leg["chambers"];
      if (typeof countryId !== "string" || countryId.trim() === "") throw new Error(`validatePack: legislatures[${i}].countryId must be a non-empty string`);
      if (!seen.has(countryId)) throw new Error(`validatePack: legislatures[${i}].countryId "${countryId}" does not match any country`);
      if (legislatureCountryIds.has(countryId)) throw new Error(`validatePack: duplicate legislature for country "${countryId}"`);
      legislatureCountryIds.add(countryId);
      if (typeof name !== "string" || name.trim() === "") throw new Error(`validatePack: legislatures[${i}].name must be a non-empty string for country "${countryId}"`);
      if (typeof bicameral !== "boolean") throw new Error(`validatePack: legislatures[${i}].bicameral must be a boolean for country "${countryId}"`);
      if (!Array.isArray(chambers)) throw new Error(`validatePack: legislatures[${i}].chambers must be an array for country "${countryId}"`);
      if (chambers.length === 0) throw new Error(`validatePack: legislatures[${i}].chambers must not be empty for country "${countryId}"`);
      const chamberKeys = new Set<string>();
      for (let j = 0; j < chambers.length; j++) {
        const ch = chambers[j] as unknown as Record<string, unknown>;
        if (typeof ch !== "object" || ch === null) throw new Error(`validatePack: legislatures[${i}].chambers[${j}] must be an object for country "${countryId}"`);
        const key = ch["key"];
        const cName = ch["name"];
        const shortName = ch["shortName"];
        const seats = ch["seats"];
        const elected = ch["elected"];
        const composition = ch["composition"] as unknown as Record<string, unknown> | undefined;
        if (typeof key !== "string" || key.trim() === "") throw new Error(`validatePack: legislatures[${i}].chambers[${j}].key must be a non-empty string for country "${countryId}"`);
        if (chamberKeys.has(key)) throw new Error(`validatePack: duplicate chamber key "${key}" in legislatures[${i}] for country "${countryId}"`);
        chamberKeys.add(key);
        if (typeof cName !== "string" || cName.trim() === "") throw new Error(`validatePack: legislatures[${i}].chambers[${j}].name must be a non-empty string for country "${countryId}"`);
        if (typeof shortName !== "string" || shortName.trim() === "") throw new Error(`validatePack: legislatures[${i}].chambers[${j}].shortName must be a non-empty string for country "${countryId}"`);
        if (!isFiniteNumber(seats) || !Number.isInteger(seats as number) || (seats as number) <= 0) throw new Error(`validatePack: legislatures[${i}].chambers[${j}].seats must be a finite integer > 0 for country "${countryId}", got ${String(seats)}`);
        if (typeof elected !== "boolean") throw new Error(`validatePack: legislatures[${i}].chambers[${j}].elected must be a boolean for country "${countryId}"`);
        if (typeof composition !== "object" || composition === null) throw new Error(`validatePack: legislatures[${i}].chambers[${j}].composition must be an object for country "${countryId}"`);
        const seatsByParty = composition["seatsByParty"] as unknown;
        const vacancies = composition["vacancies"];
        if (typeof seatsByParty !== "object" || seatsByParty === null || Array.isArray(seatsByParty)) throw new Error(`validatePack: legislatures[${i}].chambers[${j}].composition.seatsByParty must be an object for country "${countryId}"`);
        if (!isFiniteNumber(vacancies) || !Number.isInteger(vacancies as number) || (vacancies as number) < 0) throw new Error(`validatePack: legislatures[${i}].chambers[${j}].composition.vacancies must be a finite integer >= 0 for country "${countryId}", got ${String(vacancies)}`);
        let sum = vacancies as number;
        for (const [partyId, count] of Object.entries(seatsByParty as Record<string, unknown>)) {
          if (!isFiniteNumber(count) || !Number.isInteger(count as number) || (count as number) < 0) throw new Error(`validatePack: legislatures[${i}].chambers[${j}].composition.seatsByParty["${partyId}"] must be a finite integer >= 0 for country "${countryId}", got ${String(count)}`);
          if (!partyIds.has(partyId)) throw new Error(`validatePack: legislatures[${i}].chambers[${j}].composition.seatsByParty["${partyId}"] references unknown party "${partyId}" for country "${countryId}"`);
          // Also ensure the party belongs to this country? Allow cross-country? Enforce same country if parties has that mapping.
          const party = (pack.parties ?? []).find((p) => p.id === partyId);
          if (party && party.countryId !== countryId) throw new Error(`validatePack: legislatures[${i}].chambers[${j}].composition.seatsByParty["${partyId}"] party country "${party.countryId}" does not match legislature country "${countryId}"`);
          sum += count as number;
        }
        if (sum !== (seats as number)) throw new Error(`validatePack: legislatures[${i}].chambers[${j}] composition sum ${sum} does not equal seats ${String(seats)} for country "${countryId}"`);
      }
    }
  }

  // budgets validation
  if (Array.isArray(pack.budgets)) {
    const seenBudgets = new Set<string>();
    for (let i = 0; i < pack.budgets.length; i++) {
      const b = pack.budgets[i] as unknown as Record<string, unknown>;
      if (typeof b !== "object" || b === null) throw new Error(`validatePack: budgets[${i}] must be an object`);
      const countryId = b["countryId"];
      const fiscalYear = b["fiscalYear"];
      const gdp = b["gdp"];
      const population = b["population"];
      if (typeof countryId !== "string" || countryId.trim() === "") throw new Error(`validatePack: budgets[${i}].countryId must be a non-empty string`);
      if (!seen.has(countryId)) throw new Error(`validatePack: budgets[${i}].countryId "${countryId}" does not match any country`);
      if (seenBudgets.has(countryId)) throw new Error(`validatePack: duplicate budget for country "${countryId}"`);
      seenBudgets.add(countryId);
      if (!isFiniteNumber(fiscalYear) || !Number.isInteger(fiscalYear as number)) throw new Error(`validatePack: budgets[${i}].fiscalYear must be a finite integer, got ${String(fiscalYear)}`);
      if (!isFiniteNumber(gdp) || (gdp as number) <= 0) throw new Error(`validatePack: budgets[${i}].gdp must be a finite number > 0 for country "${countryId}", got ${String(gdp)}`);
      if (!isFiniteNumber(population) || (population as number) <= 0) throw new Error(`validatePack: budgets[${i}].population must be a finite number > 0 for country "${countryId}", got ${String(population)}`);
      const taxRates = b["taxRates"] as unknown as Record<string, unknown> | undefined;
      const taxBaseRatios = b["taxBaseRatios"] as unknown as Record<string, unknown> | undefined;
      const debt = b["debt"] as unknown as Record<string, unknown> | undefined;
      if (typeof taxRates !== "object" || taxRates === null) throw new Error(`validatePack: budgets[${i}].taxRates must be an object for country "${countryId}"`);
      if (typeof taxBaseRatios !== "object" || taxBaseRatios === null) throw new Error(`validatePack: budgets[${i}].taxBaseRatios must be an object for country "${countryId}"`);
      if (typeof debt !== "object" || debt === null) throw new Error(`validatePack: budgets[${i}].debt must be an object for country "${countryId}"`);
      for (const k of ["taxableIncome", "corporateProfits", "wagesAndSalaries", "importValue", "taxableSales"] as const) {
        const v = taxBaseRatios[k];
        if (!isFiniteNumber(v) || (v as number) < 0 || (v as number) > 1) throw new Error(`validatePack: budgets[${i}].taxBaseRatios.${k} must be in [0,1] for country "${countryId}", got ${String(v)}`);
      }
      for (const k of ["incomeTax", "domesticCorporateTax", "foreignCorporateTax", "payrollTax", "tariffs", "salesTax"] as const) {
        const v = taxRates[k];
        if (!isFiniteNumber(v) || (v as number) < 0 || (v as number) > 100) throw new Error(`validatePack: budgets[${i}].taxRates.${k} must be in [0,100] for country "${countryId}", got ${String(v)}`);
      }
    }
  }

  const economyRegionIds = new Set<string>();
  const stateRegionIds = new Set((pack.states ?? []).map((row) => `${row.countryId}:${row.id}`));
  for (const [index, row] of (pack.economyRegions ?? []).entries()) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error(`validatePack: economyRegions[${index}] must be an object`);
    if (typeof row.countryId !== "string" || !row.countryId.trim() || typeof row.id !== "string" || typeof row.name !== "string") {
      throw new Error(`validatePack: economyRegions[${index}] requires non-empty countryId, id, and name`);
    }
    const key = `${row.countryId}:${row.id}`;
    const country = pack.countries.find((candidate) => candidate.id === row.countryId);
    if (!country) throw new Error(`validatePack: economyRegions[${index}] references unknown country "${row.countryId}"`);
    if (country.playable) throw new Error(`validatePack: economyRegions[${index}] belongs to playable country "${row.countryId}"; use political states`);
    if (!row.id.trim() || !row.name.trim()) throw new Error(`validatePack: economyRegions[${index}] requires non-empty id and name`);
    if (Object.keys(row).some((field) => !["id", "countryId", "name", "population", "gdp", "houseSeats", "senateSeats", "metrics"].includes(field))) {
      throw new Error(`validatePack: economyRegions[${index}] contains an unknown field`);
    }
    if (economyRegionIds.has(key) || stateRegionIds.has(key)) throw new Error(`validatePack: duplicate region id "${key}" across regional tables`);
    economyRegionIds.add(key);
    for (const field of ["population", "gdp"] as const) {
      if (!isFiniteNumber(row[field]) || row[field] <= 0) throw new Error(`validatePack: economyRegions[${index}].${field} must be finite and > 0`);
    }
    for (const field of ["houseSeats", "senateSeats"] as const) {
      if (!isFiniteNumber(row[field]) || !Number.isInteger(row[field]) || row[field] < 0) throw new Error(`validatePack: economyRegions[${index}].${field} must be a non-negative integer`);
    }
    if (typeof row.metrics !== "object" || row.metrics === null || Array.isArray(row.metrics)) throw new Error(`validatePack: economyRegions[${index}].metrics must be a metric map`);
    for (const [path, value] of Object.entries(row.metrics)) {
      if (!path.trim() || !isFiniteNumber(value)) throw new Error(`validatePack: economyRegions[${index}].metrics contains an invalid path or value`);
    }
  }

  const backgroundCountries = new Set<string>();
  const backgroundRegions = new Set<string>();
  const backgroundParties = new Set<string>();
  for (const [index, row] of (pack.backgroundElections ?? []).entries()) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error(`validatePack: backgroundElections[${index}] must be an object`);
    }
    if (Object.keys(row).some((key) => !["countryId", "name", "availability", "party", "electionType", "chamberKey", "chamberName", "cycleAnchor", "cyclePeriodHours", "regions", "initialSeatAllocations"].includes(key))) {
      throw new Error(`validatePack: backgroundElections[${index}] contains an unknown field`);
    }
    if (!row.countryId.trim() || !row.name.trim() || !row.chamberKey.trim() || !row.chamberName.trim()) {
      throw new Error(`validatePack: backgroundElections[${index}] requires country, name, and chamber identity`);
    }
    if (pack.countries.some((country) => country.id === row.countryId && country.playable)) {
      throw new Error(`validatePack: backgroundElections[${index}] must not make a selectable country a background-only system`);
    }
    if (backgroundCountries.has(row.countryId)) throw new Error(`validatePack: duplicate background election country "${row.countryId}"`);
    backgroundCountries.add(row.countryId);
    if (row.availability !== "beta" && row.availability !== "npp-v1") throw new Error(`validatePack: backgroundElections[${index}].availability is invalid`);
    if (row.cycleAnchor !== "ddVolkskammer" && row.cycleAnchor !== "ruRepublicSoviet") throw new Error(`validatePack: backgroundElections[${index}].cycleAnchor is invalid`);
    const backgroundCycles: Record<string, { anchor: "ddVolkskammer" | "ruRepublicSoviet"; hours: number }> = {
      sejm: { anchor: "ddVolkskammer", hours: 192 },
      chamberOfThePeople: { anchor: "ddVolkskammer", hours: 240 },
      nationalAssembly: { anchor: "ddVolkskammer", hours: 240 },
      grandNationalAssembly: { anchor: "ddVolkskammer", hours: 240 },
      federalAssembly: { anchor: "ddVolkskammer", hours: 192 },
      supremeSoviet: { anchor: "ruRepublicSoviet", hours: 192 },
    };
    const cycle = backgroundCycles[row.electionType];
    if (!cycle || row.chamberKey !== row.electionType || row.cycleAnchor !== cycle.anchor || row.cyclePeriodHours !== cycle.hours) {
      throw new Error(`validatePack: backgroundElections[${index}] has an unsupported source election calendar`);
    }
    if (!isFiniteNumber(row.cyclePeriodHours) || !Number.isInteger(row.cyclePeriodHours) || row.cyclePeriodHours <= 0) {
      throw new Error(`validatePack: backgroundElections[${index}].cyclePeriodHours must be a positive integer`);
    }
    const party = row.party;
    if (party.countryId !== row.countryId || !party.id.trim() || !party.name.trim() || !party.abbreviation.trim() || !party.color.trim() || party.regimeStatus !== "ruling") {
      throw new Error(`validatePack: backgroundElections[${index}].party identity is invalid`);
    }
    if (!isFiniteNumber(party.economicPosition) || party.economicPosition < -5 || party.economicPosition > 5 || !isFiniteNumber(party.socialPosition) || party.socialPosition < -5 || party.socialPosition > 5) {
      throw new Error(`validatePack: backgroundElections[${index}].party positions must be in [-5,5]`);
    }
    if (backgroundParties.has(party.id) || pack.parties?.some((candidate) => candidate.id === party.id)) {
      throw new Error(`validatePack: duplicate background party id "${party.id}"`);
    }
    backgroundParties.add(party.id);
    if (!Array.isArray(row.regions) || row.regions.length === 0) throw new Error(`validatePack: backgroundElections[${index}].regions must not be empty`);
    let totalSeats = 0;
    for (const sourceRegion of row.regions) {
      const key = `${row.countryId}:${sourceRegion.id}`;
      if (!sourceRegion.id.trim() || !sourceRegion.name.trim() || backgroundRegions.has(key)) {
        throw new Error(`validatePack: backgroundElections[${index}] has an invalid or duplicate region`);
      }
      backgroundRegions.add(key);
      if (!Number.isInteger(sourceRegion.seats) || sourceRegion.seats <= 0) throw new Error(`validatePack: background region "${key}" must have positive integer seats`);
      if (!isFiniteNumber(sourceRegion.partyOrganization) || sourceRegion.partyOrganization < 0 || sourceRegion.partyOrganization > 100) {
        throw new Error(`validatePack: background region "${key}" partyOrganization must be in [0,100]`);
      }
      totalSeats += sourceRegion.seats;
    }
    const allocations = row.initialSeatAllocations ?? [];
    const allocatedRegionIds = new Set<string>();
    const allocated = allocations.reduce((sum, allocation) => {
      const region = row.regions.find((candidate) => candidate.id === allocation.regionId);
      if (!region || allocatedRegionIds.has(allocation.regionId) || !Number.isInteger(allocation.seats) || allocation.seats <= 0 || allocation.seats > region.seats) {
        throw new Error(`validatePack: backgroundElections[${index}] has an invalid initial seat allocation`);
      }
      allocatedRegionIds.add(allocation.regionId);
      return sum + allocation.seats;
    }, 0);
    if (allocated > totalSeats) throw new Error(`validatePack: backgroundElections[${index}] allocations exceed chamber seats`);
    if (allocations.length > 0 && (allocated !== totalSeats || allocations.length !== row.regions.length || row.regions.some((region) => allocations.find((allocation) => allocation.regionId === region.id)?.seats !== region.seats))) {
      throw new Error(`validatePack: backgroundElections[${index}] historical allocations must fill every authored regional seat`);
    }
  }
}
