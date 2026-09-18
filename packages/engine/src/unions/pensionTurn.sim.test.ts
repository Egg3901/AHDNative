/**
 * Pension turn + session regression tests — #315.
 *
 * Pinned source: AHDGame e364c0495
 *   src/lib/pensions/pensionTurn.ts (charge, top-up pre-accrual, accrue;
 *     per-agreement try/catch; post-contribution benefits+invest passes)
 *   src/lib/pensions/pensionBenefits.ts (retire BEFORE drawdown; guarded
 *     cash-only pay; unpaid stays on the books)
 *   src/lib/pensions/rules.ts (all math)
 *   src/simulation/phases/turnPhaseRegistry.ts + turnPhaseNames.ts
 *     (corporationTurn < unionsTurn < ... < pensionTurn)
 *
 * Every test below drives a PUBLIC boundary — `advanceTurn` (which runs
 * TURN_PHASES in registry order), `runPensionTurn` /
 * `runPensionBenefitsTurn` (the phase's exported entry points), or
 * `serializeSave`/`deserializeSave` — and derives expectations from the
 * published rules plus twin-world differencing, never from the
 * implementation under test. Twin differencing isolates the pension cash
 * flow from every other same-turn writer (nothing else reads
 * `pensionContributionRate`, `pensionSchemes` or `pensionLedger`, so the
 * twin delta is exactly the pension flow).
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { TURN_PHASES } from "../phases/registry.js";
import {
  coveredWageByEmployer,
  pensionTurnPhase,
  runPensionBenefitsTurn,
  runPensionTurn,
} from "./pensionTurn.js";
import {
  pensionBenefitsDueForTurn,
  pensionContributionForTurn,
  pensionCurrencyForCountry,
  pensionRecordIdFor,
  PENSION_BENEFIT_DRAWDOWN_RATE,
  PENSION_RETIREMENT_RATE,
  type PensionLedgerRecord,
  type PensionScheme,
} from "./pension.js";

const OPTS = { seed: "pension-lifecycle", playerName: "Tester", countryId: "US", era: "1953" } as const;
const STAMP = "2026-01-01T00:00:00Z";

type World = ReturnType<typeof createWorld>;

/** First three US unions in sorted id order (seed weights decide which sectors exist). */
function usUnions(world: World, count = 3): string[] {
  return Object.keys(world.unions)
    .filter((id) => id.startsWith("US-"))
    .sort()
    .slice(0, count);
}

function pensionState(world: World): string {
  return JSON.stringify({ schemes: world.pensionSchemes ?? {}, ledger: world.pensionLedger ?? [] });
}

function corpCash(world: World): number {
  let total = 0;
  for (const corp of Object.values(world.corporations)) total += corp.liquidCapital;
  return Math.round(total * 100) / 100;
}

function contributionRows(world: World, schemeId: string, turn: number): PensionLedgerRecord[] {
  return (world.pensionLedger ?? []).filter(
    (row) => row.schemeId === schemeId && row.turn === turn && row.type === "pension_contribution",
  );
}

describe("funded contributions and benefits at the public turn seam", () => {
  it("charges the employer, accrues the claim, and conserves cash across the twin delta", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    const [unionId] = usUnions(a);
    expect(unionId).toBeDefined();
    a.unions[unionId!]!.pensionContributionRate = 0.1;

    const cashBefore = corpCash(a);
    advanceTurn(a);
    advanceTurn(b);
    const turn = a.meta.turn;

    // Twin B (no rate) proves the rest of the pipeline is rate-blind.
    expect(worldWithoutPensions(b)).toBe(true);
    const scheme = a.pensionSchemes?.[unionId!];
    expect(scheme).toBeDefined();
    expect(scheme!.assets).toBeGreaterThan(0);
    expect(scheme!.liabilities).toBeGreaterThan(0);
    expect(scheme!.totalContributions).toBeGreaterThan(0);
    expect(scheme!.lastChargedTurn).toBe(turn);
    expect(scheme!.lastBenefitTurn).toBe(turn);

    // Conservation, twin-differenced: the ONLY writer that sees the rate
    // is the pension pass (corporationTurn runs before it in both twins,
    // so both twins earn identical revenue), hence B cash minus A cash is
    // exactly what the scheme took. Nothing minted, nothing lost.
    const moved = scheme!.totalContributions + scheme!.totalTopUps;
    expect(Math.round((corpCash(b) - corpCash(a)) * 100) / 100).toBeCloseTo(moved, 2);
    expect(cashBefore).toBeGreaterThan(0);
    expect(Math.round((scheme!.assets + (scheme!.totalBenefitsPaid ?? 0)) * 100) / 100).toBeCloseTo(
      moved,
      2,
    );

    // Ledger: one debit + one credit leg per paying employer, debit ==
    // credit == cash moved, deterministic ids, union-country currency.
    const rows = contributionRows(a, unionId!, turn);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length % 2).toBe(0);
    let debits = 0;
    let credits = 0;
    const employers = new Set<string>();
    for (const row of rows) {
      expect(row.currencyCode).toBe(pensionCurrencyForCountry("US"));
      if (row.amount < 0) {
        debits += -row.amount;
        employers.add(row.subjectId);
        expect(row.subjectType).toBe("corporation");
        expect(row.counterpartyType).toBe("pension_scheme");
        expect(row.id).toBe(
          pensionRecordIdFor(unionId!, turn, "contribution", row.subjectId, unionId!),
        );
      } else {
        credits += row.amount;
        expect(row.subjectType).toBe("pension_scheme");
        expect(row.id).toBe(
          pensionRecordIdFor(unionId!, turn, "contribution", row.subjectId, row.counterpartyId ?? ""),
        );
      }
    }
    expect(Math.round(debits * 100) / 100).toBeCloseTo(moved, 2);
    expect(Math.round(credits * 100) / 100).toBeCloseTo(moved, 2);
    expect(employers.size).toBeGreaterThanOrEqual(1);
  });

  it("accrues a larger claim than a below-accrual rate funds, then asks for a top-up", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.05;
    // Below PENSION_ACCRUAL_RATE (0.08): liabilities outrun assets until the
    // funding ratio drops under 0.9 and the deficit top-up kicks in.
    let sawTopUp = false;
    for (let t = 0; t < 60; t++) {
      world.meta.turn += 1;
      const result = runPensionTurn(world, world.meta.turn);
      if (result.topUps > 0) {
        sawTopUp = true;
        break;
      }
    }
    expect(sawTopUp).toBe(true);
    const scheme = world.pensionSchemes?.[unionId!];
    expect(scheme!.totalTopUps).toBeGreaterThan(0);
    // The top-up rode the same debit==credit legs as the contribution.
    const credits = (world.pensionLedger ?? [])
      .filter((row) => row.schemeId === unionId! && row.amount > 0)
      .reduce((sum, row) => sum + row.amount, 0);
    expect(Math.round(credits * 100) / 100).toBeCloseTo(
      Math.round((scheme!.totalContributions + scheme!.totalTopUps) * 100) / 100,
      2,
    );
    // No overdraw anywhere: employer cash and scheme cash never went negative.
    expect(scheme!.assets).toBeGreaterThanOrEqual(0);
    for (const corp of Object.values(world.corporations)) {
      expect(corp.liquidCapital).toBeGreaterThanOrEqual(0);
    }
  });

  it("an employer that cannot pay is shorted, never overdrawn, and the claim still accrues", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    // Starve every employer the union charges.
    const wages = coveredWageByEmployer(world, unionId!, "US");
    expect(wages.size).toBeGreaterThan(0);
    for (const employerId of wages.keys()) {
      world.corporations[employerId]!.liquidCapital = 0;
    }
    world.meta.turn += 1;
    const result = runPensionTurn(world, world.meta.turn);

    expect(result.shortfalls).toBeGreaterThan(0);
    const scheme = world.pensionSchemes?.[unionId!];
    // The promise stands while the assets do not arrive: liabilities accrued,
    // nothing was credited, no ledger row was written for this scheme.
    expect(scheme!.liabilities).toBeGreaterThan(0);
    expect(scheme!.assets).toBe(0);
    expect(scheme!.totalContributions).toBe(0);
    expect(contributionRows(world, unionId!, world.meta.turn)).toHaveLength(0);
    for (const corp of Object.values(world.corporations)) {
      expect(Number.isFinite(corp.liquidCapital)).toBe(true);
      expect(corp.liquidCapital).toBeGreaterThanOrEqual(0);
    }
  });

  it("an employer that covers each charge alone but not both is shorted, never overdrawn", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    // Deep deficit: the 5%-of-shortfall top-up asked on top of the
    // contribution dwarfs a one-cent headroom.
    world.pensionSchemes = {
      [unionId!]: {
        id: unionId!,
        countryId: "US",
        unionName: world.unions[unionId!]!.name,
        assets: 0,
        liabilities: 30_000_000,
        totalContributions: 0,
        totalTopUps: 0,
        createdAtTurn: 0,
      } satisfies PensionScheme,
    };
    const wages = coveredWageByEmployer(world, unionId!, "US");
    expect(wages.size).toBeGreaterThan(0);
    // Richest employer by covered wage keeps its full contribution plus one
    // cent: the contribution alone fits, the top-up share alone fits, both
    // together do not. Every other employer is starved.
    let richest = "";
    let richestWage = -1;
    for (const [employerId, wage] of wages) {
      if (wage > richestWage) {
        richestWage = wage;
        richest = employerId;
      }
    }
    const contribution = Math.round(richestWage * 0.1 * 100) / 100;
    expect(contribution).toBeGreaterThan(0);
    for (const employerId of wages.keys()) {
      world.corporations[employerId]!.liquidCapital =
        employerId === richest ? contribution + 0.01 : 0;
    }
    const drained = wages.size - 1;

    world.meta.turn += 1;
    const result = runPensionTurn(world, world.meta.turn);

    // The contribution has priority (reference debit order): it lands in
    // full, the top-up share is refused and recorded, and no balance goes
    // negative. Shortfalls exceed the drained count, proving the top-up
    // refusal was counted rather than debited.
    const scheme = world.pensionSchemes?.[unionId!];
    expect(scheme!.totalContributions).toBeCloseTo(contribution, 2);
    expect(scheme!.totalTopUps).toBe(0);
    expect(result.shortfalls).toBeGreaterThan(drained);
    for (const corp of Object.values(world.corporations)) {
      expect(Number.isFinite(corp.liquidCapital)).toBe(true);
      expect(corp.liquidCapital).toBeGreaterThanOrEqual(0);
    }
    expect(world.corporations[richest]!.liquidCapital).toBeCloseTo(0.01, 2);
    // Conservation: what left corporate cash sits in the scheme or was paid out.
    const moved = scheme!.totalContributions + scheme!.totalTopUps;
    expect(Math.round((scheme!.assets + (scheme!.totalBenefitsPaid ?? 0)) * 100) / 100).toBeCloseTo(
      moved,
      2,
    );
  });
});

describe("retirement ordering and pro-rata cuts", () => {
  it("first pensioners draw the turn they retire (retire before drawdown)", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    const liabilities = 100_000;
    world.pensionSchemes = {
      [unionId!]: {
        id: unionId!,
        countryId: "US",
        unionName: world.unions[unionId!]!.name,
        assets: 1_000_000,
        liabilities,
        totalContributions: 1_000_000,
        totalTopUps: 0,
        createdAtTurn: 0,
      } satisfies PensionScheme,
    };
    world.meta.turn += 1;
    const outcome = runPensionBenefitsTurn(world, world.meta.turn);

    // Oracle from the published rules, not the implementation.
    const retirements = liabilities * PENSION_RETIREMENT_RATE;
    const due = retirements * PENSION_BENEFIT_DRAWDOWN_RATE;
    expect(outcome.schemesPaying).toBe(1);
    expect(outcome.retirements).toBeCloseTo(retirements, 10);
    expect(outcome.benefitsPaid).toBeCloseTo(due, 10);
    expect(outcome.benefitsUnpaid).toBe(0);
    const scheme = world.pensionSchemes[unionId!]!;
    expect(scheme.benefitsInPayment).toBeCloseTo(retirements - due, 10);
    expect(scheme.lastBenefitCutFraction).toBe(0);
    // Paying discharges the claim: liabilities fall by what was paid.
    expect(scheme.liabilities).toBeCloseTo(liabilities - due, 10);
  });

  it("a cash-short scheme cuts every pensioner pro rata and never overdraws", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    const inPayment = 500_000;
    world.pensionSchemes = {
      [unionId!]: {
        id: unionId!,
        countryId: "US",
        unionName: world.unions[unionId!]!.name,
        assets: 10,
        liabilities: 1_000_000,
        benefitsInPayment: inPayment,
        totalContributions: 10,
        totalTopUps: 0,
        createdAtTurn: 0,
      } satisfies PensionScheme,
    };
    world.meta.turn += 1;
    const outcome = runPensionBenefitsTurn(world, world.meta.turn);

    const retired = (1_000_000 - inPayment) * PENSION_RETIREMENT_RATE;
    const due = pensionBenefitsDueForTurn(inPayment + retired);
    expect(due).toBeGreaterThan(10);
    expect(outcome.benefitsPaid).toBe(10);
    expect(outcome.benefitsUnpaid).toBeCloseTo(due - 10, 10);
    expect(outcome.schemesCutting).toBe(1);
    const scheme = world.pensionSchemes[unionId!]!;
    // Cash exactly exhausted, never negative; the unpaid claim stays booked.
    expect(scheme.assets).toBe(0);
    expect(scheme.lastBenefitCutFraction).toBeCloseTo((due - 10) / due, 10);
    expect(scheme.totalBenefitsUnpaid).toBeCloseTo(due - 10, 10);
    expect(scheme.liabilities).toBeCloseTo(1_000_000 - 10, 10);
  });
});

describe("invalid-state refusal with rollback, idempotency, and ordering", () => {
  it("a duplicate-legged turn is refused without touching state (no scheme, no debit, no row)", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    world.meta.turn += 1;
    const turn = world.meta.turn;
    const cashBefore = corpCash(world);
    // A previous partial write already booked this turn's debit leg for a
    // real employer of this union, so the plan must refuse the whole union.
    const wages = coveredWageByEmployer(world, unionId!, "US");
    const [employerId] = [...wages.keys()].sort();
    expect(employerId).toBeDefined();
    const unionName = world.unions[unionId!]!.name;
    world.pensionLedger = [
      {
        id: pensionRecordIdFor(unionId!, turn, "contribution", employerId!, unionId!),
        type: "pension_contribution",
        schemeId: unionId!,
        unionName,
        turn,
        amount: -50,
        currencyCode: pensionCurrencyForCountry("US"),
        subjectType: "corporation",
        subjectId: employerId!,
        subjectName: employerId!,
        counterpartyType: "pension_scheme",
        counterpartyId: unionId!,
        counterpartyName: `${unionName} pension scheme`,
      },
    ];

    const result = runPensionTurn(world, turn);

    expect(result.errors.join("\n")).toContain(unionId!);
    // Rollback is total: the refused plan leaves no scheme row behind, no
    // corporate debit, and no new ledger row.
    expect(world.pensionSchemes?.[unionId!]).toBeUndefined();
    expect(corpCash(world)).toBe(cashBefore);
    expect(world.pensionLedger).toHaveLength(1);
  });

  it("same-turn re-runs are idempotent via stamps and ledger keys", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    world.meta.turn += 1;
    const turn = world.meta.turn;

    const first = runPensionTurn(world, turn);
    expect(first.errors).toEqual([]);
    expect(first.schemesCharged).toBe(1);
    const stateAfterFirst = pensionState(world);

    const second = runPensionTurn(world, turn);
    expect(second.schemesCharged).toBe(0);
    expect(second.contributions).toBe(0);
    expect(second.benefits.schemesPaying).toBe(0);
    expect(pensionState(world)).toBe(stateAfterFirst);

    // And the next turn charges cleanly again (stamps are per-turn, not locks).
    world.meta.turn += 1;
    const third = runPensionTurn(world, world.meta.turn);
    expect(third.errors).toEqual([]);
    expect(third.schemesCharged).toBe(1);
  });

  it("unions process in sorted id order, deterministically across twins", () => {
    const worlds = [createWorld(OPTS), createWorld(OPTS)];
    const ids = usUnions(worlds[0]!);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const world of worlds) {
      for (const id of ids) world.unions[id]!.pensionContributionRate = 0.1;
      advanceTurn(world);
    }
    const [a, b] = worlds as [World, World];
    expect(pensionState(a)).toBe(pensionState(b));

    // Ledger books each union's legs as one contiguous block, in sorted order.
    const seen: string[] = [];
    for (const row of a.pensionLedger ?? []) {
      if (row.type !== "pension_contribution" || row.amount < 0) continue;
      if (seen[seen.length - 1] !== row.schemeId) seen.push(row.schemeId);
    }
    const sorted = [...seen].sort();
    expect(seen).toEqual(sorted);
  });

  it("a suspended union originates no charge but its pensioners still draw", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    world.meta.turn += 1;
    runPensionTurn(world, world.meta.turn);
    const funded = world.pensionSchemes?.[unionId!];
    expect(funded).toBeDefined();
    const contributionsBefore = funded!.totalContributions;

    // Give the scheme pensioners, then freeze the union.
    funded!.benefitsInPayment = 100_000;
    funded!.liabilities += 100_000;
    world.unions[unionId!]!.suspended = true;
    world.meta.turn += 1;
    const result = runPensionTurn(world, world.meta.turn);

    expect(result.schemesCharged).toBe(0);
    expect(funded!.totalContributions).toBe(contributionsBefore);
    expect(result.benefits.schemesPaying).toBe(1);
    expect(result.benefits.benefitsPaid).toBeGreaterThan(0);
  });

  it("zero and absent rates stay silent: no scheme, no rows", () => {
    const world = createWorld(OPTS);
    const ids = usUnions(world, 2);
    world.unions[ids[0]!]!.pensionContributionRate = 0;
    advanceTurn(world);
    expect(world.pensionSchemes?.[ids[0]!]).toBeUndefined();
    expect(world.pensionSchemes?.[ids[1]!]).toBeUndefined();
    expect(world.pensionLedger ?? []).toHaveLength(0);
  });
});

describe("phase position at the writer/consumer edge", () => {
  it("runs in the #323 source-backed cluster after corporationTurn", () => {
    const names = TURN_PHASES.map((phase) => phase.name);
    const corp = names.indexOf("corporationTurn");
    const unions = names.indexOf("unionsTurn");
    const npp = names.indexOf("nppUnionBehavior");
    const pension = names.indexOf("pensionTurn");
    const macro = names.indexOf("macroCountryTurn");
    expect(corp).toBeGreaterThanOrEqual(0);
    // Pinned e364c0495 turnPhaseNames.ts: corporationTurn (5) < unionsTurn
    // (6) < nppUnionBehavior (7) < … < pensionTurn (15) < macroCountryTurn
    // (17). The charge sweep debits corporate liquidCapital and prices dues
    // off the same represented-sector population unionsTurn just settled,
    // so the pension pass sits directly behind the union pair.
    expect(unions).toBe(corp + 1);
    expect(npp).toBe(unions + 1);
    expect(pension).toBe(npp + 1);
    expect(macro).toBeGreaterThan(pension);
    expect(pensionTurnPhase.name).toBe("pensionTurn");
  });

  it("consumes no RNG: different streams give identical pension state", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    const [unionId] = usUnions(a);
    a.unions[unionId!]!.pensionContributionRate = 0.1;
    b.unions[unionId!]!.pensionContributionRate = 0.1;
    const zeroes = { next: () => 0, int: () => 0, pick: <T>(items: readonly T[]): T => items[0]! };
    const halves = { next: () => 0.5, int: () => 1, pick: <T>(items: readonly T[]): T => items[0]! };
    pensionTurnPhase.run(a, zeroes as never, undefined as never);
    pensionTurnPhase.run(b, halves as never, undefined as never);
    expect(pensionState(a)).toBe(pensionState(b));
    expect(a.pensionSchemes?.[unionId!]).toBeDefined();
  });

  it("covered wages are unscaled headcount pay: contribution and accrual share one bill", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    const wages = coveredWageByEmployer(world, unionId!, "US");
    let total = 0;
    for (const wage of wages.values()) total += wage;
    expect(total).toBeGreaterThan(0);
    const rate = 0.1;
    // One figure drives both legs — the pensionTurn.ts file-doc invariant.
    expect(pensionContributionForTurn({ coveredWageBill: total, contributionRate: rate })).toBe(
      total * rate,
    );
  });
});

describe("reload and old-save behavior at the public session seam", () => {
  it("a mid-campaign round-trip preserves pension state and continues identically", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    for (let i = 0; i < 3; i++) advanceTurn(world);

    const reloaded = deserializeSave(serializeSave(world, STAMP));
    expect(pensionState(reloaded)).toBe(pensionState(world));
    for (let i = 0; i < 3; i++) {
      advanceTurn(reloaded);
      advanceTurn(world);
    }
    expect(pensionState(reloaded)).toBe(pensionState(world));
    expect(reloaded.pensionSchemes?.[unionId!]?.assets).toBeGreaterThan(0);
  });

  it("saves written before pensions load with absent-means-empty and onboard cleanly", () => {
    const world = createWorld(OPTS);
    advanceTurn(world);
    const raw = JSON.parse(serializeSave(world, STAMP)) as Record<string, unknown>;
    const inner = raw["world"] as Record<string, unknown>;
    delete inner["pensionSchemes"];
    delete inner["pensionLedger"];
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.pensionSchemes).toBeUndefined();
    expect(loaded.pensionLedger).toBeUndefined();
    // The reloaded old world advances and onboards a scheme on first charge.
    const [unionId] = usUnions(loaded);
    loaded.unions[unionId!]!.pensionContributionRate = 0.1;
    advanceTurn(loaded);
    expect(loaded.pensionSchemes?.[unionId!]).toBeDefined();
  });

  it("present-but-invalid pension rows fail closed at the save boundary", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    advanceTurn(world);
    expect(world.pensionSchemes?.[unionId!]).toBeDefined();

    // Negative assets are not a scheme.
    const raw = JSON.parse(serializeSave(world, STAMP)) as Record<string, unknown>;
    const schemes = (raw["world"] as Record<string, unknown>)["pensionSchemes"] as Record<
      string,
      Record<string, unknown>
    >;
    schemes[unionId!]!["assets"] = -1;
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow();

    // A hand-edited ledger id cannot smuggle in a duplicate payment.
    const raw2 = JSON.parse(serializeSave(world, STAMP)) as Record<string, unknown>;
    const ledger = (raw2["world"] as Record<string, unknown>)["pensionLedger"] as Array<
      Record<string, unknown>
    >;
    expect(ledger.length).toBeGreaterThan(0);
    ledger[0]!["id"] = "forged-id";
    expect(() => deserializeSave(JSON.stringify(raw2))).toThrow();

    // An out-of-band contribution rate is refused with the union named.
    const raw3 = JSON.parse(serializeSave(world, STAMP)) as Record<string, unknown>;
    ((raw3["world"] as Record<string, unknown>)["unions"] as Record<string, Record<string, unknown>>)[
      unionId!
    ]!["pensionContributionRate"] = 0.99;
    expect(() => deserializeSave(JSON.stringify(raw3))).toThrow();
  });

  it("a union renamed after rows were booked still loads (ledger names are display text)", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    advanceTurn(world);
    expect((world.pensionLedger ?? []).length).toBeGreaterThan(0);

    const raw = JSON.parse(serializeSave(world, STAMP)) as Record<string, unknown>;
    const inner = raw["world"] as Record<string, unknown>;
    ((inner["unions"] as Record<string, Record<string, unknown>>)[unionId!]!)["name"] =
      "Renamed Union";
    (inner["pensionSchemes"] as Record<string, Record<string, unknown>>)[unionId!]!["unionName"] =
      "Renamed Union";
    const loaded = deserializeSave(JSON.stringify(raw));
    // Stale row display names ride along; identity is the deterministic id.
    expect(loaded.pensionLedger?.length).toBe(world.pensionLedger?.length);
    advanceTurn(loaded);
    expect(loaded.pensionSchemes?.[unionId!]).toBeDefined();
  });

  it("every ledger row carries the static union-country currency", () => {
    const world = createWorld(OPTS);
    const [unionId] = usUnions(world);
    world.unions[unionId!]!.pensionContributionRate = 0.1;
    advanceTurn(world);
    const rows = world.pensionLedger ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const scheme = world.pensionSchemes?.[row.schemeId];
      expect(scheme).toBeDefined();
      expect(row.currencyCode).toBe(pensionCurrencyForCountry(scheme!.countryId));
    }
  });
});

/** Twin B with no rate anywhere must stay entirely pension-free. */
function worldWithoutPensions(world: World): boolean {
  if (world.pensionSchemes && Object.keys(world.pensionSchemes).length > 0) return false;
  if (world.pensionLedger && world.pensionLedger.length > 0) return false;
  return true;
}
