import { describe, expect, it, vi } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { Campaign } from "../types.js";
import type { AccumulateVoteTurnInput } from "../electionEngine/tally/types.js";
import { aggregateFundsByParty } from "../electionEngine/fundsByParty.js";
import { rollSpendStock } from "../electionEngine/electionFormulaFactors.js";

/**
 * #92: saved campaign spendStock wired into the real election money driver.
 *
 * Upstream source (AHDGame d4baf899, read-only):
 *   src/lib/electionEngine/fundsByParty.ts
 *     Aggregate Campaign.spendStock plus Campaign.spendThisTurn by party
 *     for one election. Missing values degrade to 0, zero-spend parties
 *     are omitted. Upstream ticket #1261: the driver used to read raw
 *     active pacing (spend-this-turn only) and forgot everything each turn.
 *   src/lib/electionEngine/electionFormulaFactors.ts
 *     SPEND_STOCK_RETENTION = 0.8 (half-life about 3.1 turns),
 *     SPEND_STOCK_DUST_CUTOFF = 1 (sub-dollar stocks dropped),
 *     rollSpendStock(stock, fresh) = prior * 0.8 + fresh, dust to undefined.
 *   src/lib/turn/elections/campaignSpendReset.ts
 *     After every general-election tally has read campaign spend, fold the
 *     accumulator into the decaying stock and clear it for the next turn.
 *   src/lib/db/types/campaign.ts
 *     spendStock and spendThisTurn both optional, degrade to 0.
 *
 * All coverage below goes through the public createWorld / advanceTurn /
 * serializeSave / deserializeSave boundary against a real scheduled US
 * house race and its real auto-created campaigns. The tally's
 * money-driver input is captured from the real accumulateVoteTurn call
 * the adapter makes (tally math itself untouched, via passthrough mock).
 *
 * The money-driver input is verified here through the existing passthrough
 * capture. Actual vote movement through the distributor is covered by
 * elections/distributor.sim.test.ts.
 */

const OPTS = { seed: "spend-stock", playerName: "Tester", countryId: "US", era: "1953" } as const;
const DEM = "US_DEM";
// Per-campaign stock, large enough to dwarf live NPC accrual (tens of
// thousands per turn) so the stock contribution is unambiguous.
const STOCK = 2_000_000;
// Upstream literals (electionFormulaFactors.ts at d4baf899).
const RETENTION = 0.8;
const DUST_CUTOFF = 1;

function rawInputs(): AccumulateVoteTurnInput[] {
  const g = globalThis as unknown as { __tallyInputs92?: AccumulateVoteTurnInput[] };
  g.__tallyInputs92 ??= [];
  return g.__tallyInputs92;
}

function clearCapture(): void {
  rawInputs().length = 0;
}

vi.mock("../electionEngine/tally/accumulateVoteTurn.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../electionEngine/tally/accumulateVoteTurn.js")>();
  return {
    ...mod,
    accumulateVoteTurn: (input: AccumulateVoteTurnInput) => {
      rawInputs().push(input);
      return mod.accumulateVoteTurn(input);
    },
  };
});

/** Advance to filing close of the first two-party US house race. */
function setupRace(): { world: ReturnType<typeof createWorld>; raceId: string } {
  const world = createWorld(OPTS);
  for (let i = 0; i < 300; i++) {
    advanceTurn(world);
    const rec = world.elections.find(
      (e) =>
        e.status === "active" &&
        e.countryId === "US" &&
        e.electionType === "house" &&
        world.meta.turn === e.primaryEndTurn &&
        new Set(e.candidates.map((c) => c.partyId)).size >= 2,
    );
    if (rec) return { world, raceId: rec.id };
  }
  throw new Error("no two-party US house race scheduled within 300 turns");
}

function patchStock(world: ReturnType<typeof createWorld>, raceId: string, partyId: string, stock: number): void {
  for (const c of Object.values(world.campaigns)) {
    if (c.electionId === raceId && c.partyId === partyId) {
      const patch: Partial<Campaign> = { spendStock: stock };
      Object.assign(c, patch);
    }
  }
}

/** Upstream contract: sum of stock plus accumulator by party, zero spends skipped. */
function expectedFunds(world: ReturnType<typeof createWorld>, raceId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of Object.values(world.campaigns)) {
    if (c.electionId !== raceId) continue;
    const spend = (c.spendStock ?? 0) + (c.spendThisTurn ?? 0);
    if (spend <= 0) continue;
    out.set(c.partyId, (out.get(c.partyId) ?? 0) + spend);
  }
  return out;
}

function capturedFunds(raceId: string): Map<string, number> {
  const hit = rawInputs().find((i) => i.election._id === raceId);
  if (!hit) throw new Error(`tally never ran for ${raceId}`);
  const funds = hit.derived?.fundsByParty;
  if (!funds) throw new Error(`tally did not expose funds for ${raceId}`);
  return funds;
}

function sortedEntries(m: Map<string, number>): string {
  return JSON.stringify([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

describe("spendStock reaches the real tally money driver (#92)", () => {
  it("matches the source rollover for one-turn, idle, steady and hoarded-funds cases", () => {
    expect(rollSpendStock(0, 100)).toBe(100);
    expect(rollSpendStock(100, 0)).toBe(80);

    let steady: number | undefined = 0;
    for (let turn = 0; turn < 5; turn++) steady = rollSpendStock(steady, 100);
    expect(steady).toBeCloseTo(336.16, 10);

    // Campaign treasury is intentionally absent from this contract: only
    // carried stock and actual current spend can affect the money driver.
    expect(aggregateFundsByParty([{ party: DEM, spendStock: 0, spendThisTurn: 0 }])).toEqual(new Map());
  });

  it("saved stock on real campaigns changes the fundsByParty input, deterministically", () => {
    const { world, raceId } = setupRace();
    const snap = serializeSave(world, new Date(0).toISOString());

    const runOnce = (): { funds: Map<string, number>; freshDEM: number; contract: Map<string, number> } => {
      const w = deserializeSave(snap);
      patchStock(w, raceId, DEM, STOCK);
      clearCapture();
      let contract: Map<string, number> = new Map();
      let freshDEM = -1;
      advanceTurn(w, {
        afterPhase: (name, ww) => {
          if (name === "voteAccumulation") {
            contract = expectedFunds(ww, raceId);
            freshDEM = Object.values(ww.campaigns)
              .filter((c) => c.electionId === raceId && c.partyId === DEM)
              .reduce((s, c) => s + (c.spendThisTurn ?? 0), 0);
          }
        },
      });
      return { funds: capturedFunds(raceId), freshDEM, contract };
    };

    const first = runOnce();
    const second = runOnce();
    // Deterministic: identical setup reaches the identical driver input.
    expect(sortedEntries(first.funds)).toBe(sortedEntries(second.funds));
    // The input matches the upstream contract read off the live rows.
    expect(sortedEntries(first.funds)).toBe(sortedEntries(first.contract));
    // The saved stock itself contributed: DEM reads far above fresh accrual.
    expect(first.freshDEM).toBeGreaterThanOrEqual(0);
    expect(first.funds.get(DEM)!).toBeGreaterThan(first.freshDEM);
  });

  it("reload preserves the stock into the real tally; missing field migrates to zero", () => {
    const { world, raceId } = setupRace();
    const snap = serializeSave(world, new Date(0).toISOString());

    const w = deserializeSave(snap);
    patchStock(w, raceId, DEM, STOCK);
    const reloaded = deserializeSave(serializeSave(w, new Date(0).toISOString()));
    const demKeys = Object.values(reloaded.campaigns)
      .filter((c) => c.electionId === raceId && c.partyId === DEM)
      .map((c) => c.id);
    expect(demKeys.length).toBeGreaterThan(0);
    for (const k of demKeys) expect(reloaded.campaigns[k]!.spendStock).toBe(STOCK);

    clearCapture();
    let contract: Map<string, number> = new Map();
    advanceTurn(reloaded, {
      afterPhase: (name, ww) => {
        if (name === "voteAccumulation") contract = expectedFunds(ww, raceId);
      },
    });
    expect(sortedEntries(capturedFunds(raceId))).toBe(sortedEntries(contract));

    // Pre-#92 row: strip the field from the envelope, load must default 0.
    const raw = JSON.parse(serializeSave(w, new Date(0).toISOString())) as {
      world: { campaigns: Record<string, Record<string, unknown>> };
    };
    delete raw.world.campaigns[demKeys[0]!]?.["spendStock"];
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.campaigns[demKeys[0]!]!.spendStock).toBe(0);
  });

  it("reset folds the accumulator into the stock exactly once after the tally", () => {
    const { world, raceId } = setupRace();
    const snap = serializeSave(world, new Date(0).toISOString());
    const w = deserializeSave(snap);
    patchStock(w, raceId, DEM, 1000);

    let atTally = new Map<string, { stock: number; fresh: number }>();
    advanceTurn(w, {
      afterPhase: (name, ww) => {
        if (name === "voteAccumulation") {
          atTally = new Map(
            Object.values(ww.campaigns)
              .filter((c) => c.electionId === raceId && c.partyId === DEM)
              .map((c) => [c.id, { stock: c.spendStock ?? 0, fresh: c.spendThisTurn ?? 0 }]),
          );
        }
      },
    });
    expect(atTally.size).toBeGreaterThan(0);
    for (const [key, seen] of atTally) {
      const rolled = seen.stock * RETENTION + seen.fresh;
      const want = rolled < DUST_CUTOFF ? 0 : rolled;
      expect(w.campaigns[key]!.spendStock).toBe(want);
      expect(w.campaigns[key]!.spendThisTurn).toBe(0);
    }
  });

  it("real resolution archives the rows; newly minted campaigns start at zero", () => {
    const { world, raceId } = setupRace();
    for (let i = 0; i < 200 && world.elections.find((e) => e.id === raceId)!.status !== "resolved"; i++) {
      advanceTurn(world);
    }
    expect(world.elections.find((e) => e.id === raceId)!.status).toBe("resolved");
    const archived = Object.values(world.campaigns).filter((c) => c.electionId === raceId);
    expect(archived.length).toBeGreaterThan(0);
    for (const c of archived) expect(c.status).toBe("archived");

    let minted: Campaign[] = [];
    for (let i = 0; i < 300 && minted.length === 0; i++) {
      advanceTurn(world, {
        afterPhase: (name, ww) => {
          if (name === "electionTimers") {
            minted = Object.values(ww.campaigns).filter((c) => c.createdAtTurn === ww.meta.turn);
          }
        },
      });
    }
    expect(minted.length).toBeGreaterThan(0);
    for (const c of minted) {
      expect(c.spendStock ?? 0).toBe(0);
      expect(c.spendThisTurn).toBe(0);
    }
  });
});
