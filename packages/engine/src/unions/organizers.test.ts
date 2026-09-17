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
import {
  LEADERSHIP_ELECTION_MIN_STRENGTH,
  ORGANIZE_STRENGTH_GAIN,
  UNION_STRENGTH_DECAY_PER_TURN,
  createUnionOrganizer,
  decayUnionStrength,
  eligibleOrganizerShares,
  isUnionLeadershipElectionOpen,
  organizerIdFor,
  unionOrganizers,
  unionStrength,
  validateUnionOrganizer,
} from "./organizers.js";
import { unionsTurnPhase } from "./phases.js";

const WORLD = { era: "1953", countryId: "US", seed: "issue-320-organizers", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";

function organizer(world: ReturnType<typeof createWorld>, unionId: string, characterId: string) {
  return { ...createUnionOrganizer(unionId, characterId, 0), strength: 30, organizeCount: 3 };
}

describe("#320 union organizer identity and strength", () => {
  it("pins source constants (unionEconomy.ts decay 0.005, drive gain 10, election threshold 100)", () => {
    expect(UNION_STRENGTH_DECAY_PER_TURN).toBe(0.005);
    expect(ORGANIZE_STRENGTH_GAIN).toBe(10);
    expect(LEADERSHIP_ELECTION_MIN_STRENGTH).toBe(100);
  });

  it("builds deterministic `${unionId}:${characterId}` rows with zeroed strength", () => {
    const row = createUnionOrganizer("US-manufacturing", "char-1", 7);
    expect(row).toEqual({
      id: "US-manufacturing:char-1",
      unionId: "US-manufacturing",
      characterId: "char-1",
      strength: 0,
      organizeCount: 0,
      createdAtTurn: 7,
      updatedAtTurn: 7,
    });
    expect(organizerIdFor("US-manufacturing", "char-1")).toBe("US-manufacturing:char-1");
  });

  it("accepts a well-formed row and rejects identity/strength corruption", () => {
    const world = createWorld(WORLD);
    const good = organizer(world, "US-manufacturing", "char-1");
    expect(() => validateUnionOrganizer(world, good)).not.toThrow();
    const corruptions: Array<[string, (row: typeof good) => void, boolean?]> = [
      ["id mismatch", (row) => { row.id = "US-manufacturing:char-2"; }],
      ["dangling union", (row) => { row.unionId = "US-nonexistent"; row.id = "US-nonexistent:char-1"; }],
      [
        "valid second union",
        (row) => { row.unionId = "US-energy"; row.id = "US-energy:char-1"; },
        true,
      ],
      ["empty organizer identity", (row) => { row.characterId = ""; row.id = "US-manufacturing:"; }],
      ["negative strength", (row) => { row.strength = -1; }],
      ["NaN strength", (row) => { row.strength = Number.NaN; }],
      ["infinite strength", (row) => { row.strength = Number.POSITIVE_INFINITY; }],
      ["negative drive count", (row) => { row.organizeCount = -1; }],
      ["fractional drive count", (row) => { row.organizeCount = 1.5; }],
    ];
    for (const [label, corrupt, valid] of corruptions) {
      const candidate = { ...good };
      corrupt(candidate);
      if (valid) {
        // An organizer may back any real union: re-pointing at a second
        // recorded pair is legitimate, not cross-pair smuggling.
        expect(() => validateUnionOrganizer(world, candidate), label).not.toThrow();
      } else {
        expect(() => validateUnionOrganizer(world, candidate), label).toThrow(/invalid union organizer/i);
      }
    }
    // Cross-pair smuggling: the union record's own country/sector key no
    // longer matches the organizer's unionId (hand-edited save).
    const tampered = createWorld(WORLD);
    tampered.unions["US-manufacturing"]!.countryId = "UK";
    expect(() => validateUnionOrganizer(tampered, organizer(tampered, "US-manufacturing", "char-1"))).toThrow(
      /invalid union organizer/i,
    );
  });

  it("reads absent union strength as zero and gates elections at 100", () => {
    expect(unionStrength({})).toBe(0);
    expect(unionStrength({ strength: -5 })).toBe(0);
    expect(unionStrength({ strength: 42 })).toBe(42);
    expect(isUnionLeadershipElectionOpen({ strength: 99.999 })).toBe(false);
    expect(isUnionLeadershipElectionOpen({ strength: 100 })).toBe(true);
  });

  it("exposes eligible shares sorted by organizer identity, excluding zero-strength and foreign unions", () => {
    const world = createWorld(WORLD);
    world.unionOrganizers = {
      "US-manufacturing:char-b": { ...organizer(world, "US-manufacturing", "char-b"), strength: 10 },
      "US-manufacturing:char-a": { ...organizer(world, "US-manufacturing", "char-a"), strength: 30 },
      "US-manufacturing:char-z": { ...organizer(world, "US-manufacturing", "char-z"), strength: 0 },
      "US-energy:char-a": { ...organizer(world, "US-energy", "char-a"), strength: 999 },
    };
    expect(eligibleOrganizerShares(world, "US-manufacturing")).toEqual([
      { characterId: "char-a", strength: 30 },
      { characterId: "char-b", strength: 10 },
    ]);
    expect(eligibleOrganizerShares(world, "US-media")).toEqual([]);
  });

  it("decays union pools and organizer banks by 0.5% and freezes suspended unions", () => {
    const world = createWorld(WORLD);
    const union = world.unions["US-manufacturing"]!;
    union.strength = 200;
    const suspended = world.unions["US-energy"]!;
    suspended.strength = 200;
    suspended.suspended = true;
    world.unionOrganizers = {
      "US-manufacturing:char-a": { ...organizer(world, "US-manufacturing", "char-a"), strength: 100 },
      "US-energy:char-a": { ...organizer(world, "US-energy", "char-a"), strength: 100 },
    };
    decayUnionStrength(world, 12);
    expect(union.strength).toBeCloseTo(199, 10);
    expect(world.unionOrganizers["US-manufacturing:char-a"]!.strength).toBeCloseTo(99.5, 10);
    expect(world.unionOrganizers["US-manufacturing:char-a"]!.updatedAtTurn).toBe(12);
    expect(union.updatedAtTurn).toBe(12);
    // Suspended unions and their organizers are frozen exactly as the ban found them.
    expect(suspended.strength).toBe(200);
    expect(world.unionOrganizers["US-energy:char-a"]!.strength).toBe(100);
  });

  it("splits the requested contribution by banked strength and debits only the paid sum", () => {
    const world = createWorld(WORLD);
    const union = world.unions["US-manufacturing"]!;
    union.duesPerWorkerAnnual = 5;
    union.politicalContributionPct = 0.5;
    // #321: payouts credit real recipients (stale pointers are skipped, not
    // paid), so the split fixtures use resolvable politician identities.
    const [first, second] = world.politicians
      .filter((p) => p.countryId === "US")
      .map((p) => p.id)
      .sort();
    world.unionOrganizers = {
      [`US-manufacturing:${first}`]: { ...organizer(world, "US-manufacturing", first!), strength: 30 },
      [`US-manufacturing:${second}`]: { ...organizer(world, "US-manufacturing", second!), strength: 10 },
    };
    // Independent restatement of the turn's dues math before the turn runs.
    const rows = representedSectorsForUnion(world, union);
    const members = unionMembers(rows);
    const avgWage = averageAnnualWage(rows);
    expect(members).toBeGreaterThan(0);
    const duesIncome = duesIncomePerTurn(members, Math.min(5, maxDuesForWage(avgWage)));
    const requested = politicalContributionPerTurn(freeCashFlowPerTurn(duesIncome, 0), 0.5);
    expect(requested).toBeGreaterThan(0);
    const before = union.treasury;
    const rng = { next: () => 0, int: () => 0, pick: <T>(items: T[]) => items[0]! };
    unionsTurnPhase.run(world, rng);
    // Strength decay ran first, so the paid split follows the decayed 3:1 weights exactly.
    const decayed = 1 - UNION_STRENGTH_DECAY_PER_TURN;
    const shares = eligibleOrganizerShares(world, "US-manufacturing");
    expect(shares.map((s) => s.characterId)).toEqual([first, second]);
    expect(shares[0]!.strength).toBeCloseTo(30 * decayed, 10);
    expect(shares[1]!.strength).toBeCloseTo(10 * decayed, 10);
    const payouts = distributePoliticalContributions(requested, [
      { characterId: first!, strength: 30 * decayed },
      { characterId: second!, strength: 10 * decayed },
    ]);
    const paid = payouts.reduce((sum, payout) => sum + payout.amount, 0);
    expect(paid).toBeCloseTo(requested, 10);
    expect(payouts[0]!.amount).toBeCloseTo((requested * 3) / 4, 8);
    // Conservation: treasury moves by dues in, services out (0 here), paid out.
    expect(union.treasury).toBeCloseTo(Math.round((before + duesIncome - paid) * 100) / 100, 8);
  });

  it("round-trips organizer rows through saves and defaults missing state to empty", () => {
    const world = createWorld(WORLD);
    world.unionOrganizers = {
      "US-manufacturing:char-a": { ...organizer(world, "US-manufacturing", "char-a"), strength: 30 },
    };
    const restored = deserializeSave(serializeSave(world, SAVED_AT));
    expect(restored.unionOrganizers).toEqual(world.unionOrganizers);
    expect(unionOrganizers(restored)).toEqual(world.unionOrganizers);

    const raw = JSON.parse(serializeSave(createWorld(WORLD), SAVED_AT)) as {
      world: Record<string, unknown>;
    };
    delete raw.world["unionOrganizers"];
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.unionOrganizers).toBeUndefined();
    expect(unionOrganizers(migrated)).toEqual({});
    expect(eligibleOrganizerShares(migrated, "US-manufacturing")).toEqual([]);
  });

  it("refuses corrupt organizer state at the save boundary", () => {
    const world = createWorld(WORLD);
    world.unionOrganizers = {
      "US-manufacturing:char-a": organizer(world, "US-manufacturing", "char-a"),
    };
    const raw = JSON.parse(serializeSave(world, SAVED_AT)) as {
      world: { unionOrganizers: Record<string, Record<string, unknown>> };
    };
    const key = "US-manufacturing:char-a";
    const corruptions = [
      (save: typeof raw) => { save.world.unionOrganizers[key]!.strength = -1; },
      (save: typeof raw) => { save.world.unionOrganizers[key]!.strength = "30"; },
      (save: typeof raw) => { save.world.unionOrganizers[key]!.id = "US-energy:char-a"; },
      (save: typeof raw) => { save.world.unionOrganizers[key]!.unionId = "US-nonexistent"; },
      (save: typeof raw) => { save.world.unionOrganizers["rogue"] = { ...save.world.unionOrganizers[key]! }; },
    ];
    for (const corrupt of corruptions) {
      const candidate = structuredClone(raw);
      corrupt(candidate);
      expect(() => deserializeSave(JSON.stringify(candidate))).toThrow(/union organizer/i);
    }
  });
});
