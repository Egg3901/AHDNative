import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import {
  averageAnnualWage,
  duesIncomePerTurn,
  maxDuesForWage,
  unionMembers,
} from "./dues.js";
import {
  distributePoliticalContributions,
  freeCashFlowPerTurn,
  politicalContributionPerTurn,
} from "./political.js";
import { representedSectorsForUnion } from "./sectorAggregation.js";
import { createUnionOrganizer, UNION_STRENGTH_DECAY_PER_TURN } from "./organizers.js";
import {
  applyUnionContributionPayouts,
  contributionRecipientName,
  currencyCodeForCountry,
  unionContributionLedger,
  UNION_CONTRIBUTION_SOURCE,
  UNION_CONTRIBUTION_TX_TYPE,
  type UnionContributionRecord,
} from "./contributions.js";
import { unionsTurnPhase } from "./phases.js";

const WORLD = { era: "1953", countryId: "US", seed: "issue-321-payouts", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";
const RNG = { next: () => 0, int: () => 0, pick: <T>(items: T[]) => items[0]! };

function organizer(world: ReturnType<typeof createWorld>, unionId: string, characterId: string, strength: number) {
  return { ...createUnionOrganizer(unionId, characterId, 0), strength, organizeCount: 3 };
}

/** Two real US politicians, alphabetically ordered, for recipient-backed fixtures. */
function usPair(world: ReturnType<typeof createWorld>): [string, string] {
  const ids = world.politicians
    .filter((p) => p.countryId === "US")
    .map((p) => p.id)
    .sort();
  return [ids[0]!, ids[1]!];
}

/** Configure dues + contribution policy and return the independent dues restatement. */
function configure(world: ReturnType<typeof createWorld>, unionId: string, dues: number, pct: number) {
  const union = world.unions[unionId]!;
  union.duesPerWorkerAnnual = dues;
  union.politicalContributionPct = pct;
  const rows = representedSectorsForUnion(world, union);
  const members = unionMembers(rows);
  const avgWage = averageAnnualWage(rows);
  const duesIncome = duesIncomePerTurn(members, Math.min(dues, maxDuesForWage(avgWage)));
  const requested = politicalContributionPerTurn(freeCashFlowPerTurn(duesIncome, 0), pct);
  return { union, members, duesIncome, requested };
}

describe("#321 atomic union contribution payouts", () => {
  it("pays the requested split exactly: treasury debit == recipient credits == ledger sum", () => {
    const world = createWorld(WORLD);
    const [first, second] = usPair(world);
    const { union, duesIncome, requested } = configure(world, "US-manufacturing", 5, 0.5);
    expect(requested).toBeGreaterThan(0);
    world.unionOrganizers = {
      [`US-manufacturing:${first}`]: organizer(world, "US-manufacturing", first, 30),
      [`US-manufacturing:${second}`]: organizer(world, "US-manufacturing", second, 10),
    };
    const before = {
      treasury: union.treasury,
      first: world.politicians.find((p) => p.id === first)!.funds,
      second: world.politicians.find((p) => p.id === second)!.funds,
    };
    unionsTurnPhase.run(world, RNG);
    // Strength decay ran first, so the paid split follows the decayed 3:1 weights exactly.
    const decayed = 1 - UNION_STRENGTH_DECAY_PER_TURN;
    const payouts = distributePoliticalContributions(requested, [
      { characterId: first, strength: 30 * decayed },
      { characterId: second, strength: 10 * decayed },
    ]);
    expect(payouts).toHaveLength(2);
    expect(payouts[0]!.amount).toBeCloseTo((requested * 3) / 4, 8);
    expect(payouts[1]!.amount).toBeCloseTo(requested / 4, 8);
    const paid = payouts.reduce((sum, payout) => sum + payout.amount, 0);
    expect(paid).toBeCloseTo(requested, 10);
    const ledger = unionContributionLedger(world).filter((r) => r.unionId === "US-manufacturing");
    expect(ledger.map((r) => r.recipientId)).toEqual([first, second]);
    expect(ledger.reduce((sum, r) => sum + r.amount, 0)).toBeCloseTo(paid, 10);
    expect(world.politicians.find((p) => p.id === first)!.funds).toBeCloseTo(before.first + payouts[0]!.amount, 10);
    expect(world.politicians.find((p) => p.id === second)!.funds).toBeCloseTo(
      before.second + payouts[1]!.amount,
      10,
    );
    // Conservation: treasury moves by dues in, services out (0 here), paid out; rounded to cents.
    expect(union.treasury).toBeCloseTo(Math.round((before.treasury + duesIncome - paid) * 100) / 100, 8);
  });

  it("conserves fractional splits to the unit and rounds treasury to cents", () => {
    const world = createWorld(WORLD);
    const [first, second] = usPair(world);
    const third = world.politicians.filter((p) => p.countryId === "US").map((p) => p.id).sort()[2]!;
    const union = world.unions["US-manufacturing"]!;
    union.treasury = 1000;
    // 10 split three equal ways: repeating decimals the last share must absorb exactly.
    const payouts = distributePoliticalContributions(10, [
      { characterId: first, strength: 1 },
      { characterId: second, strength: 1 },
      { characterId: third, strength: 1 },
    ]);
    expect(payouts).toHaveLength(3);
    const { paid, records } = applyUnionContributionPayouts(world, {
      unionId: "US-manufacturing",
      turn: world.meta.turn,
      payouts,
    });
    expect(paid).toBe(10);
    expect(union.treasury).toBe(990);
    expect(records.reduce((sum, r) => sum + r.amount, 0)).toBe(10);
    expect(records.map((r) => r.recipientId)).toEqual([first, second, third].sort());

    // Turn-level rounding: fractional-cent dues still leave a cents treasury.
    const rounding = createWorld(WORLD);
    const [, other] = usPair(rounding);
    configure(rounding, "US-manufacturing", 5, 0.5);
    rounding.unionOrganizers = {
      [`US-manufacturing:${other}`]: organizer(rounding, "US-manufacturing", other, 7),
    };
    unionsTurnPhase.run(rounding, RNG);
    expect(Number.isInteger(rounding.unions["US-manufacturing"]!.treasury * 100)).toBe(true);
  });

  it("orders ledger rows by recipient identity regardless of strength", () => {
    const world = createWorld(WORLD);
    const [first, second] = usPair(world);
    const union = world.unions["US-manufacturing"]!;
    union.treasury = 1000;
    // Alphabetically-later recipient holds ~100x the strength.
    const payouts = distributePoliticalContributions(101, [
      { characterId: first, strength: 1 },
      { characterId: second, strength: 100 },
    ]);
    const { records } = applyUnionContributionPayouts(world, {
      unionId: "US-manufacturing",
      turn: world.meta.turn,
      payouts,
    });
    expect(records.map((r) => r.recipientId)).toEqual([first, second]);
    expect(records[1]!.amount).toBeCloseTo((101 * 100) / 101, 8);
  });

  it("skips ineligible and unresolvable organizers without debiting their share", () => {
    const world = createWorld(WORLD);
    const [first, second] = usPair(world);
    const { union, duesIncome, requested } = configure(world, "US-manufacturing", 5, 0.5);
    expect(requested).toBeGreaterThan(0);
    world.unionOrganizers = {
      [`US-manufacturing:${first}`]: organizer(world, "US-manufacturing", first, 30),
      // Zero strength: source-ineligible, excluded from the denominator.
      [`US-manufacturing:${second}`]: { ...organizer(world, "US-manufacturing", second, 0), strength: 0 },
      // Banked strength but no recipient record: stale pointer, skipped not paid.
      "US-manufacturing:ghost": organizer(world, "US-manufacturing", "ghost", 50),
    };
    const before = union.treasury;
    unionsTurnPhase.run(world, RNG);
    const ledger = unionContributionLedger(world);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.recipientId).toBe(first);
    // No dilution: the sole real recipient takes the whole requested pool.
    expect(ledger[0]!.amount).toBeCloseTo(requested, 8);
    expect(union.treasury).toBeCloseTo(Math.round((before + duesIncome - requested) * 100) / 100, 8);
  });

  it("retains the surplus with no organizers and writes no ledger rows", () => {
    const world = createWorld(WORLD);
    const { union } = configure(world, "US-manufacturing", 5, 0.5);
    const baseline = createWorld(WORLD);
    configure(baseline, "US-manufacturing", 5, 0);
    const fundsBefore = world.politicians.map((p) => p.funds);
    unionsTurnPhase.run(world, RNG);
    unionsTurnPhase.run(baseline, RNG);
    expect(union.treasury).toBe(baseline.unions["US-manufacturing"]!.treasury);
    expect(world.politicians.map((p) => p.funds)).toEqual(fundsBefore);
    // Untouched worlds stay ledger-free: absent stays absent for save shape.
    expect(world.unionContributionLedger).toBeUndefined();
    expect(unionContributionLedger(world)).toEqual([]);
  });

  it("freezes suspended unions: no debit, no credit, no ledger", () => {
    const world = createWorld(WORLD);
    const [first] = usPair(world);
    const { union } = configure(world, "US-manufacturing", 5, 0.5);
    union.suspended = true;
    world.unionOrganizers = {
      [`US-manufacturing:${first}`]: organizer(world, "US-manufacturing", first, 30),
    };
    const before = { treasury: union.treasury, funds: world.politicians.find((p) => p.id === first)!.funds };
    unionsTurnPhase.run(world, RNG);
    expect(union.treasury).toBe(before.treasury);
    expect(world.politicians.find((p) => p.id === first)!.funds).toBe(before.funds);
    expect(world.unionContributionLedger).toBeUndefined();
    expect(() =>
      applyUnionContributionPayouts(world, {
        unionId: "US-manufacturing",
        turn: world.meta.turn,
        payouts: [{ characterId: first, amount: 1 }],
      }),
    ).toThrow(/suspended/);
  });

  it("pays nothing at a zero rate or zero free cash flow", () => {
    const zeroRate = createWorld(WORLD);
    const [first] = usPair(zeroRate);
    configure(zeroRate, "US-manufacturing", 5, 0);
    zeroRate.unionOrganizers = {
      [`US-manufacturing:${first}`]: organizer(zeroRate, "US-manufacturing", first, 30),
    };
    const rateBefore = zeroRate.unions["US-manufacturing"]!.treasury;
    unionsTurnPhase.run(zeroRate, RNG);
    expect(zeroRate.unionContributionLedger).toBeUndefined();
    expect(zeroRate.politicians.find((p) => p.id === first)!.funds).toBe(0);
    expect(zeroRate.unions["US-manufacturing"]!.treasury).toBeGreaterThanOrEqual(rateBefore);

    const zeroFlow = createWorld(WORLD);
    configure(zeroFlow, "US-manufacturing", 0, 0.5);
    zeroFlow.unionOrganizers = {
      [`US-manufacturing:${first}`]: organizer(zeroFlow, "US-manufacturing", first, 30),
    };
    const flowBefore = zeroFlow.unions["US-manufacturing"]!.treasury;
    unionsTurnPhase.run(zeroFlow, RNG);
    expect(zeroFlow.unionContributionLedger).toBeUndefined();
    expect(zeroFlow.unions["US-manufacturing"]!.treasury).toBe(flowBefore);
  });

  it("credits the player recipient and resolves display names", () => {
    const world = createWorld(WORLD);
    const [first] = usPair(world);
    const union = world.unions["US-manufacturing"]!;
    union.treasury = 1000;
    const playerBefore = world.player.funds;
    const { paid, records } = applyUnionContributionPayouts(world, {
      unionId: "US-manufacturing",
      turn: world.meta.turn,
      payouts: [
        { characterId: "player", amount: 40 },
        { characterId: first, amount: 60 },
      ],
    });
    expect(paid).toBe(100);
    expect(world.player.funds).toBe(playerBefore + 40);
    expect(records[0]!.recipientName).toBe(world.player.name);
    expect(records[1]!.recipientName).toBe(world.politicians.find((p) => p.id === first)!.name);
    // Unresolvable identities degrade to the reference "Unknown" literal.
    expect(contributionRecipientName(world, "ghost")).toBe("Unknown");
  });

  it("records source-shaped ledger identity in the union's currency", () => {
    const world = createWorld(WORLD);
    const [first] = usPair(world);
    // The currency follows the paying union (reference COUNTRY_CURRENCY_MAP),
    // not the recipient: a UK union pays GBP to a US politician.
    const { requested } = configure(world, "UK-manufacturing", 5, 0.5);
    expect(requested).toBeGreaterThan(0);
    world.unionOrganizers = {
      [`UK-manufacturing:${first}`]: organizer(world, "UK-manufacturing", first, 30),
    };
    unionsTurnPhase.run(world, RNG);
    const ledger = unionContributionLedger(world);
    expect(ledger).toHaveLength(1);
    const row = ledger[0]!;
    const union = world.unions["UK-manufacturing"]!;
    expect(row).toMatchObject({
      id: `UK-manufacturing:${world.meta.turn}:${first}`,
      type: UNION_CONTRIBUTION_TX_TYPE,
      unionId: "UK-manufacturing",
      unionName: union.name,
      turn: world.meta.turn,
      recipientId: first,
      recipientName: world.politicians.find((p) => p.id === first)!.name,
      currencyCode: "GBP",
      counterpartyType: "system",
      source: UNION_CONTRIBUTION_SOURCE,
    });
    expect(row.amount).toBeCloseTo(requested, 8);
    expect(currencyCodeForCountry("US")).toBe("USD");
    expect(currencyCodeForCountry("XX")).toBe("USD");
  });

  it("uses the verbatim reference currency table for every mapped country", () => {
    // Pinned COUNTRY_CURRENCY_MAP (same table the finance modules carry):
    // union ledger rows need only the code, never a rate.
    expect(currencyCodeForCountry("HU")).toBe("HUF");
    expect(currencyCodeForCountry("PL")).toBe("PLZ");
    expect(currencyCodeForCountry("RO")).toBe("ROL");
    expect(currencyCodeForCountry("YU")).toBe("YUD");
    expect(currencyCodeForCountry("BG")).toBe("BGL");
    expect(currencyCodeForCountry("BLR")).toBe("SUR");
    expect(currencyCodeForCountry("UKR")).toBe("SUR");
    expect(currencyCodeForCountry("CS")).toBe("CSK");
    expect(currencyCodeForCountry("BAL")).toBe("SUR");
    expect(currencyCodeForCountry("SCO")).toBe("GBP");
    expect(currencyCodeForCountry("WAL")).toBe("GBP");
  });

  it("leaves absent ledgers absent when validation fails before any write", () => {
    const world = createWorld(WORLD);
    const [first] = usPair(world);
    world.unions["US-manufacturing"]!.treasury = 1000;
    expect(world.unionContributionLedger).toBeUndefined();
    // Invalid recipient: shape validation must run before the ledger is
    // materialized, so the failed call leaves save bytes untouched.
    expect(() =>
      applyUnionContributionPayouts(world, {
        unionId: "US-manufacturing",
        turn: world.meta.turn,
        payouts: [{ characterId: "ghost", amount: 10 }],
      }),
    ).toThrow(/invalid union contribution/i);
    expect(world.unionContributionLedger).toBeUndefined();
    // Duplicate within one batch: same closed behavior, still no ledger.
    expect(() =>
      applyUnionContributionPayouts(world, {
        unionId: "US-manufacturing",
        turn: world.meta.turn,
        payouts: [
          { characterId: first, amount: 50 },
          { characterId: first, amount: 50 },
        ],
      }),
    ).toThrow(/uplicate/);
    expect(world.unionContributionLedger).toBeUndefined();
    expect(world.unions["US-manufacturing"]!.treasury).toBe(1000);
  });

  it("rejects duplicate payouts without touching state", () => {
    const world = createWorld(WORLD);
    const [first, second] = usPair(world);
    const union = world.unions["US-manufacturing"]!;
    union.treasury = 1000;
    const args = {
      unionId: "US-manufacturing",
      turn: world.meta.turn,
      payouts: [
        { characterId: first, amount: 60 },
        { characterId: second, amount: 40 },
      ],
    } as const;
    applyUnionContributionPayouts(world, args);
    const snapshot = {
      treasury: union.treasury,
      funds: world.politicians.map((p) => p.funds),
      ledger: JSON.stringify(world.unionContributionLedger),
    };
    // Same union + turn re-applied: duplicate, state untouched.
    expect(() => applyUnionContributionPayouts(world, args)).toThrow(/uplicate/);
    expect(union.treasury).toBe(snapshot.treasury);
    expect(world.politicians.map((p) => p.funds)).toEqual(snapshot.funds);
    expect(JSON.stringify(world.unionContributionLedger)).toBe(snapshot.ledger);
    // A later turn pays again cleanly with distinct ids.
    const later = applyUnionContributionPayouts(world, { ...args, turn: world.meta.turn + 1 });
    expect(later.paid).toBe(100);
    expect(unionContributionLedger(world)).toHaveLength(4);

    // Duplicate within one batch also fails before mutating anything.
    const fresh = createWorld(WORLD);
    fresh.unions["US-manufacturing"]!.treasury = 1000;
    expect(() =>
      applyUnionContributionPayouts(fresh, {
        unionId: "US-manufacturing",
        turn: fresh.meta.turn,
        payouts: [
          { characterId: first, amount: 50 },
          { characterId: first, amount: 50 },
        ],
      }),
    ).toThrow(/uplicate/);
    expect(fresh.unions["US-manufacturing"]!.treasury).toBe(1000);
    expect(fresh.unionContributionLedger ?? []).toEqual([]);
  });

  it("rolls back treasury, recipients, and ledger together on any invalid payout", () => {
    const cases: Array<[string, { characterId: unknown; amount: unknown }]> = [
      ["unknown recipient", { characterId: "ghost", amount: 10 }],
      ["empty recipient", { characterId: "", amount: 10 }],
      ["non-string recipient", { characterId: 42, amount: 10 }],
      ["negative amount", { characterId: "player", amount: -10 }],
      ["zero amount", { characterId: "player", amount: 0 }],
      ["NaN amount", { characterId: "player", amount: Number.NaN }],
      ["infinite amount", { characterId: "player", amount: Number.POSITIVE_INFINITY }],
    ];
    for (const [label, bad] of cases) {
      const world = createWorld(WORLD);
      const union = world.unions["US-manufacturing"]!;
      union.treasury = 1000;
      const snapshot = {
        treasury: union.treasury,
        player: world.player.funds,
        ledger: JSON.stringify(world.unionContributionLedger ?? []),
      };
      expect(
        () =>
          applyUnionContributionPayouts(world, {
            unionId: "US-manufacturing",
            turn: world.meta.turn,
            payouts: [{ characterId: "player", amount: 25 }, bad as never],
          }),
        label,
      ).toThrow(/invalid union contribution/i);
      expect(union.treasury, label).toBe(snapshot.treasury);
      expect(world.player.funds, label).toBe(snapshot.player);
      expect(JSON.stringify(world.unionContributionLedger ?? []), label).toBe(snapshot.ledger);
    }
    // Dangling union and bad turn fail the same closed way.
    const world = createWorld(WORLD);
    expect(() =>
      applyUnionContributionPayouts(world, {
        unionId: "US-nonexistent",
        turn: world.meta.turn,
        payouts: [{ characterId: "player", amount: 1 }],
      }),
    ).toThrow(/union reference/);
    expect(() =>
      applyUnionContributionPayouts(world, {
        unionId: "US-manufacturing",
        turn: -1,
        payouts: [{ characterId: "player", amount: 1 }],
      }),
    ).toThrow(/turn/);
  });

  it("accumulates one batch per turn across turns", () => {
    const world = createWorld(WORLD);
    const [first] = usPair(world);
    configure(world, "US-manufacturing", 5, 0.5);
    world.unionOrganizers = {
      [`US-manufacturing:${first}`]: organizer(world, "US-manufacturing", first, 30),
    };
    const firstTurn = world.meta.turn;
    unionsTurnPhase.run(world, RNG);
    world.meta.turn += 1;
    unionsTurnPhase.run(world, RNG);
    const ledger = unionContributionLedger(world);
    expect(ledger).toHaveLength(2);
    expect(ledger.map((r) => r.turn)).toEqual([firstTurn, firstTurn + 1]);
    expect(ledger.map((r) => r.id)).toEqual([
      `US-manufacturing:${firstTurn}:${first}`,
      `US-manufacturing:${firstTurn + 1}:${first}`,
    ]);
  });

  it("round-trips the ledger through saves and defaults missing state to empty", () => {
    const world = createWorld(WORLD);
    const [first] = usPair(world);
    world.unions["US-manufacturing"]!.treasury = 1000;
    applyUnionContributionPayouts(world, {
      unionId: "US-manufacturing",
      turn: world.meta.turn,
      payouts: [{ characterId: first, amount: 60 }],
    });
    const restored = deserializeSave(serializeSave(world, SAVED_AT));
    expect(restored.unionContributionLedger).toEqual(world.unionContributionLedger);
    expect(unionContributionLedger(restored)).toEqual(world.unionContributionLedger);

    const raw = JSON.parse(serializeSave(createWorld(WORLD), SAVED_AT)) as {
      world: Record<string, unknown>;
    };
    expect(raw.world["unionContributionLedger"]).toBeUndefined();
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.unionContributionLedger).toBeUndefined();
    expect(unionContributionLedger(migrated)).toEqual([]);
  });

  it("refuses corrupt ledger state at the save boundary", () => {
    const world = createWorld(WORLD);
    const [first] = usPair(world);
    world.unions["US-manufacturing"]!.treasury = 1000;
    applyUnionContributionPayouts(world, {
      unionId: "US-manufacturing",
      turn: world.meta.turn,
      payouts: [{ characterId: first, amount: 60 }],
    });
    const raw = JSON.parse(serializeSave(world, SAVED_AT)) as {
      world: { unionContributionLedger: UnionContributionRecord[] };
    };
    const key = 0;
    const corruptions: Array<[string, (ledger: UnionContributionRecord[]) => void]> = [
      ["negative amount", (ledger) => { ledger[key]!.amount = -1; }],
      ["zero amount", (ledger) => { ledger[key]!.amount = 0; }],
      ["non-numeric amount", (ledger) => { (ledger[key] as unknown as Record<string, unknown>)["amount"] = "60"; }],
      ["id mismatch", (ledger) => { ledger[key]!.id = "US-manufacturing:0:rogue"; }],
      ["bad type tag", (ledger) => { (ledger[key] as unknown as Record<string, unknown>)["type"] = "fund_credit"; }],
      ["bad source tag", (ledger) => { (ledger[key] as unknown as Record<string, unknown>)["source"] = "corp"; }],
      ["dangling union", (ledger) => {
        ledger[key]!.unionId = "US-nonexistent";
        ledger[key]!.id = `US-nonexistent:${ledger[key]!.turn}:${ledger[key]!.recipientId}`;
      }],
      ["duplicate row", (ledger) => { ledger.push({ ...ledger[key]! }); }],
      ["empty currency", (ledger) => { ledger[key]!.currencyCode = ""; }],
    ];
    for (const [label, corrupt] of corruptions) {
      const candidate = structuredClone(raw);
      corrupt(candidate.world.unionContributionLedger);
      expect(() => deserializeSave(JSON.stringify(candidate)), label).toThrow(/union contribution/i);
    }
  });
});
