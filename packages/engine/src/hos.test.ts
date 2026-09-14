import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorld, rulingPartyIdForCountry, rulingPartyForCountry, headOfStateOfficeForCountry, SCHEMA_VERSION } from "./world.js";
import { executeAction } from "./actions/execute.js";
import { deserializeSave, serializeSave } from "./save.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CAREER_OPTS = { seed: "hos-test", playerName: "Tester", countryId: "US", era: "1953" } as const;
const HOS_OPTS = { ...CAREER_OPTS, mode: "hos" as const };

describe("M1: player.mode and hosPartyId binding at creation", () => {
  it("defaults to career mode with no hosPartyId when mode is omitted", () => {
    const world = createWorld(CAREER_OPTS);
    expect(world.player.mode).toBe("career");
    expect(world.player.hosPartyId).toBe(null);
  });

  it("HoS mode binds player.hosPartyId to the seeded ruling party for a playable country", () => {
    const world = createWorld(HOS_OPTS);
    expect(world.player.mode).toBe("hos");
    // 83rd Congress House: US_REP 221 / US_DEM 213 of 435 — clean Republican majority.
    expect(world.player.hosPartyId).toBe("US_REP");
    expect(world.player.hosPartyId).toBe(rulingPartyIdForCountry("1953", "US"));
  });

  it("rulingPartyIdForCountry is callable before a world exists (pure seed-data function)", () => {
    expect(rulingPartyIdForCountry("1953", "US")).toBe("US_REP");
    expect(rulingPartyIdForCountry("1953", "DD")).toBe("DD_SED");
    expect(rulingPartyIdForCountry("1953", "RU")).toBe("RU_CPSU");
  });

  it("rulingPartyForCountry resolves display name/abbreviation for the M2 picker", () => {
    const rp = rulingPartyForCountry("1953", "US");
    expect(rp).toEqual({ id: "US_REP", name: "Republican Party", abbreviation: "REP" });
  });

  it("founding UK has no authored commons composition, so the ruling party stays null", () => {
    // packages/content/src/packs/1953.ts seeds UK "commons" composition.seatsByParty
    // as {} (all-vacancy placeholder) and 1979 matches. Founding is the default,
    // so both the era-only call and an explicit "founding" resolve to null.
    expect(rulingPartyIdForCountry("1953", "UK")).toBe(null);
    expect(rulingPartyIdForCountry("1953", "UK", "founding")).toBe(null);
    expect(rulingPartyIdForCountry("1979", "UK", "founding")).toBe(null);
    const world = createWorld({ ...CAREER_OPTS, countryId: "UK", mode: "hos" });
    expect(world.player.mode).toBe("hos");
    expect(world.player.hosPartyId).toBe(null);
  });

  it("1953 UK historical resolves Labour and createWorld binds it into hosPartyId", () => {
    expect(rulingPartyIdForCountry("1953", "UK", "historical")).toBe("UK_LAB");
    expect(rulingPartyForCountry("1953", "UK", "historical")).toMatchObject({ id: "UK_LAB", abbreviation: "LAB" });
    const world = createWorld({ ...CAREER_OPTS, countryId: "UK", mode: "hos", initialization: "historical" });
    expect(world.player.mode).toBe("hos");
    expect(world.player.hosPartyId).toBe("UK_LAB");
    expect(world.player.hosPartyId).toBe(rulingPartyIdForCountry("1953", "UK", "historical"));
  });

  it("1979 UK historical resolves Labour and createWorld binds it into hosPartyId", () => {
    expect(rulingPartyIdForCountry("1979", "UK", "historical")).toBe("UK_LAB");
    const world = createWorld({ ...CAREER_OPTS, era: "1979", countryId: "UK", mode: "hos", initialization: "historical" });
    expect(world.player.hosPartyId).toBe("UK_LAB");
  });

  it("the era-only call stays founding-compatible: passing no initialization matches passing founding", () => {
    expect(rulingPartyIdForCountry("1953", "US")).toBe(rulingPartyIdForCountry("1953", "US", "founding"));
    expect(rulingPartyIdForCountry("1953", "UK")).toBe(rulingPartyIdForCountry("1953", "UK", "founding"));
  });

  it("career mode never sets hosPartyId even for a country with a resolvable ruling party", () => {
    const world = createWorld(CAREER_OPTS);
    expect(world.player.hosPartyId).toBe(null);
  });
});

describe("HoS office eligibility helper", () => {
  it("reads the executive office from the generated registry, not a duplicated list", () => {
    expect(headOfStateOfficeForCountry("UK")).toBe("primeMinister");
    expect(headOfStateOfficeForCountry("US")).toBe("president");
    expect(headOfStateOfficeForCountry("DD")).toBe("generalSecretary");
  });

  it("returns null for a country with no executive office entry", () => {
    expect(headOfStateOfficeForCountry("XX")).toBe(null);
    expect(headOfStateOfficeForCountry("US-CA")).toBe(null);
  });
});

describe("#243 permanent Head of State seating", () => {
  it("seats a presidential HoS through the executive record and save boundary", () => {
    const world = createWorld(HOS_OPTS);
    expect(world.player).toMatchObject({
      permanentHeadOfState: true,
      currentOffice: { type: "president", countryId: "US" },
    });
    expect(world.executives.US).toMatchObject({
      countryId: "US",
      presidentId: "player",
      presidentParty: "US_REP",
      termStartTurn: 0,
    });

    const loaded = deserializeSave(serializeSave(world, "2026-09-14T00:00:00.000Z"));
    expect(loaded.player).toMatchObject({
      permanentHeadOfState: true,
      currentOffice: { type: "president", countryId: "US" },
    });
    expect(loaded.executives.US?.presidentId).toBe("player");
  });

  it("uses the authored parliamentary executive office instead of president", () => {
    const world = createWorld({ ...CAREER_OPTS, countryId: "UK", mode: "hos", initialization: "historical" });
    expect(world.player.currentOffice).toEqual({ type: "primeMinister", countryId: "UK" });
    expect(world.executives.UK).toBeUndefined();
  });
});

describe("M1: determinism across both modes", () => {
  it("same seed + mode produces byte-identical worlds", () => {
    const a = createWorld(HOS_OPTS);
    const b = createWorld(HOS_OPTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = createWorld(CAREER_OPTS);
    const d = createWorld(CAREER_OPTS);
    expect(JSON.stringify(c)).toBe(JSON.stringify(d));
  });

  it("HoS seating changes the consumed executive state and its public legitimacy projection", () => {
    const hos = createWorld(HOS_OPTS);
    const career = createWorld(CAREER_OPTS);
    const { permanentHeadOfState: _permanent, currentOffice: _office, ...hosWithoutOffice } = hos.player;
    const hosPlayer = { ...hosWithoutOffice, mode: "career" as const, hosPartyId: null };
    expect(JSON.stringify(hosPlayer)).toBe(JSON.stringify(career.player));
    expect(hos.executives.US?.presidentId).toBe("player");
    expect(career.executives.US?.presidentId).toBeUndefined();
    expect(hos.countryPolitics.US?.legitimacy).toBeGreaterThan(
      career.countryPolitics.US?.legitimacy ?? 0,
    );
  });
});

describe("M1: action-layer gating — career player lacks HoS surfaces, HoS player holds them", () => {
  it("career player without party membership cannot organize/endorse/contest leadership", () => {
    const world = createWorld(CAREER_OPTS);
    expect(world.player.partyId).toBe(null);
    world.player.funds = 50_000; // rule out the fund-cost check masking the membership gate
    const region = Object.values(world.regions).find((r) => r.countryId === "US");
    expect(region).toBeTruthy();
    const organize = executeAction(world, "player", "organize", { regionId: region!.id });
    expect(organize.ok).toBe(false);
    if (!organize.ok) expect(organize.error).toMatch(/party membership/);
    const endorse = executeAction(world, "player", "endorse", { endorsedId: "US_REP", endorsedType: "party" });
    expect(endorse.ok).toBe(false);
    const contest = executeAction(world, "player", "contestPartyLeadership", { position: "chair" });
    expect(contest.ok).toBe(false);
  });

  it("HoS player without personal party membership CAN organize/endorse via the bound ruling party", () => {
    const world = createWorld(HOS_OPTS);
    expect(world.player.partyId).toBe(null);
    expect(world.player.hosPartyId).toBe("US_REP");
    world.player.funds = 50_000; // organize has a $10k fund cost, unrelated to the mode gate under test
    const region = Object.values(world.regions).find((r) => r.countryId === "US");
    expect(region).toBeTruthy();
    const organize = executeAction(world, "player", "organize", { regionId: region!.id });
    expect(organize.ok).toBe(true);
    // Bypass is temporary: player.partyId reverts to null after the call (never
    // silently joins the player to the party).
    expect(world.player.partyId).toBe(null);
    const endorse = executeAction(world, "player", "endorse", { endorsedId: "US_REP", endorsedType: "party" });
    expect(endorse.ok).toBe(true);
    expect(world.player.partyId).toBe(null);
    expect(world.endorsements[0]!.endorserPartyId).toBe("US_REP");
  });

  it("HoS bypass does not apply to joinParty/leaveParty (personal membership stays genuine)", () => {
    const world = createWorld(HOS_OPTS);
    const res = executeAction(world, "player", "leaveParty");
    expect(res.ok).toBe(false); // never actually joined, so nothing to leave
  });

  it("career player cannot sponsor bills without a seat; HoS player can via government sponsorship", () => {
    const career = createWorld(CAREER_OPTS);
    const careerRes = executeAction(career, "player", "sponsorBill", { catalogId: "us.economy.workerSecurity.primary" });
    expect(careerRes.ok).toBe(false);

    const hos = createWorld(HOS_OPTS);
    const hosRes = executeAction(hos, "player", "sponsorBill", { catalogId: "us.economy.workerSecurity.primary" });
    expect(hosRes.ok).toBe(true);
    expect(hos.bills[0]!.sponsorPartyId).toBe("US_REP");
  });

  it("crisis response actions are available regardless of mode (never gated)", () => {
    const career = createWorld(CAREER_OPTS);
    const res = executeAction(career, "player", "crisisMonitor");
    expect(res.ok).toBe(true);
  });
});

describe("M1: economic-direction levers (HoS-only, call existing budget functions)", () => {
  it("career mode cannot adjust budget spending or tax rates", () => {
    const world = createWorld(CAREER_OPTS);
    const spend = executeAction(world, "player", "adjustBudgetSpending", { budgetCategory: "defense", budgetAmount: 1000 });
    expect(spend.ok).toBe(false);
    if (!spend.ok) expect(spend.error).toMatch(/Head of State/);
    const tax = executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: 20 });
    expect(tax.ok).toBe(false);
  });

  it("HoS mode can direct spending; recomputes total/surplus via calculateBudgetSpending", () => {
    const world = createWorld(HOS_OPTS);
    const before = world.budgets["US"]!.spending.total;
    const res = executeAction(world, "player", "adjustBudgetSpending", { budgetCategory: "defense", budgetAmount: 1_000_000 });
    expect(res.ok).toBe(true);
    const budget = world.budgets["US"]!;
    expect(budget.spending.byCategory["defense"]).toBe(1_000_000);
    expect(budget.spending.total).not.toBe(before);
    expect(budget.surplus).toBe(budget.revenue.total - budget.spending.total);
  });

  it("HoS mode can set a tax rate; recomputes revenue/surplus via calculateBudgetRevenue", () => {
    const world = createWorld(HOS_OPTS);
    const res = executeAction(world, "player", "adjustTaxRate", { taxField: "incomeTax", taxRate: 25 });
    expect(res.ok).toBe(true);
    const budget = world.budgets["US"]!;
    expect(budget.taxRates.incomeTax).toBe(25);
    expect(budget.surplus).toBe(budget.revenue.total - budget.spending.total);
  });

  it("subsidy and command-economy levers stay honestly unavailable (PORT-STUB)", () => {
    const world = createWorld(HOS_OPTS);
    const subsidy = executeAction(world, "player", "setSubsidyRate", {});
    expect(subsidy.ok).toBe(false);
    if (!subsidy.ok) expect(subsidy.error).toMatch(/unavailable/);
    const command = executeAction(world, "player", "commandEconomyDirective", {});
    expect(command.ok).toBe(false);
  });
});

describe("M1: migration to v39 (hosPartyId)", () => {
  it("SCHEMA_VERSION is at least 39", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(39);
  });

  it("pre-M1 save (schemaVersion 33, no hosPartyId field) migrates with hosPartyId null and mode preserved/defaulted", () => {
    const world = createWorld(CAREER_OPTS);
    const raw = JSON.stringify(world);
    const parsed = JSON.parse(raw);
    delete (parsed.player as Record<string, unknown>)["hosPartyId"];
    const save = { format: "ahdsolo-save", schemaVersion: 33, savedAt: "2026-01-01T00:00:00Z", world: parsed };
    const migrated = deserializeSave(JSON.stringify(save));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.player.hosPartyId).toBe(null);
    expect(migrated.player.mode).toBe("career");
  });

  it("migration leaves a genuinely-set hosPartyId untouched", () => {
    const world = createWorld(HOS_OPTS);
    const raw = JSON.stringify(world);
    const parsed = JSON.parse(raw);
    const save = { format: "ahdsolo-save", schemaVersion: 33, savedAt: "2026-01-01T00:00:00Z", world: parsed };
    const migrated = deserializeSave(JSON.stringify(save));
    expect(migrated.player.hosPartyId).toBe("US_REP");
    expect(migrated.player.mode).toBe("hos");
  });
});

describe("M1: no if(mode) inside any phase (FRAMEWORK.md binding rule)", () => {
  // Every turn-phase file in the engine: packages/engine/src/phases/ (the
  // turn pipeline itself) plus any file elsewhere matching *phase*.ts
  // (budget/phases.ts, government/phases.ts, etc — the per-system phase
  // functions the pipeline registers). Excludes this test file and other
  // *.test.ts files.
  function collectPhaseFiles(dir: string, out: string[]): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        collectPhaseFiles(full, out);
        continue;
      }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      const inPhasesDir = full.split(sep).includes("phases");
      const nameHasPhase = /phase/i.test(entry);
      if (inPhasesDir || nameHasPhase) out.push(full);
    }
  }

  it("no phase file branches on player.mode", () => {
    const srcRoot = join(__dirname);
    const files: string[] = [];
    collectPhaseFiles(srcRoot, files);
    expect(files.length).toBeGreaterThan(10); // sanity: the glob actually found the pipeline

    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      if (/player\.mode/.test(content) || /\.mode\s*===\s*["'](career|hos)["']/.test(content)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
