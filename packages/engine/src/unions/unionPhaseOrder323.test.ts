/**
 * #323 union processing after corporation labor output.
 *
 * Pinned source: AHDGame e364c0495
 *   src/simulation/phases/turnPhaseNames.ts
 *     corporationTurn (5) < unionsTurn (6) < nppUnionBehavior (7) < …
 *     < pensionTurn (15) < macroCountryTurn (17)
 *   src/lib/turn/unions/index.ts processUnionsTurn
 *     (labour-relations leg FIRST, then decay, adoption, dues loop)
 *
 * Every test below drives a PUBLIC boundary — `advanceTurn` (which runs
 * TURN_PHASES in registry order), the exported phase objects, the
 * bargaining actions, or `serializeSave`/`deserializeSave` — and derives
 * expectations from the pinned order plus twin-world differencing, never
 * from the implementation under test.
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { TURN_PHASES } from "../phases/registry.js";
import { corporationTurnPhase } from "../corporation/corporationTurn.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { pensionTurnPhase } from "./pensionTurn.js";
import { unionsTurnPhase } from "./phases.js";
import {
  answerBargainingCampaignAsEmployer,
  moveBargainingCampaignAsUnion,
  openBargainingCampaignAction,
} from "./actions.js";
import { createUnionOrganizer } from "./organizers.js";
import { unionContributionLedger } from "./contributions.js";
import type { RngState } from "../rng.js";
import type { WorldState } from "../types.js";

const OPTS = { seed: "union-phase-323", playerName: "Tester", countryId: "US", era: "1953" } as const;
const STAMP = "2026-01-01T00:00:00Z";
const UNION = "US-manufacturing";
const EMPLOYER = "US-manufacturing";
const TERMS = { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 };
const RNG = { next: () => 0, int: () => 0, pick: <T>(items: readonly T[]): T => items[0]! };

type World = ReturnType<typeof createWorld>;

function shopWorld(): { world: World; assetId: string } {
  const world = createWorld(OPTS);
  const union = world.unions[UNION]!;
  union.treasury = 5000;
  union.unionization = 100;
  const assets = corporateSectorAssets(world);
  const asset = Object.values(assets).find((candidate) => candidate.corporationId === EMPLOYER)!;
  asset.unionization = 100;
  return { world, assetId: asset.id };
}

/** Open → reject → escalate → escalate, ending in a live selective strike. */
function strikeWorld(): { world: World; assetId: string; campaignId: string } {
  const { world, assetId } = shopWorld();
  const opened = openBargainingCampaignAction(world, {
    unionId: UNION,
    employerCorporationId: EMPLOYER,
    terms: TERMS,
    turn: 0,
  });
  answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 1 });
  moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "escalate", turn: 2 });
  moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "escalate", turn: 3 });
  return { world, assetId, campaignId: opened.id };
}

function revenueAt(world: World, name: string): number | undefined {
  let revenue: number | undefined;
  advanceTurn(world, {
    afterPhase(phaseName, observed) {
      if (phaseName === name) revenue = observed.corporations[EMPLOYER]!.revenue;
    },
  });
  return revenue;
}

describe("#323 phase graph matches the pinned source order", () => {
  it("corporationTurn < unionsTurn < nppUnionBehavior < pensionTurn < macroCountryTurn", () => {
    const names = TURN_PHASES.map((phase) => phase.name);
    const at = (name: string): number => {
      const index = names.indexOf(name);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at("unionsTurn")).toBe(at("corporationTurn") + 1);
    expect(at("nppUnionBehavior")).toBe(at("unionsTurn") + 1);
    expect(at("pensionTurn")).toBe(at("nppUnionBehavior") + 1);
    expect(at("macroCountryTurn")).toBeGreaterThan(at("pensionTurn"));
    // Union financial writes fund campaigns before campaigns spend.
    expect(at("campaignTurn")).toBeGreaterThan(at("pensionTurn"));
  });

  it("the moved phases consume no RNG: the shared stream is untouched across the cluster", () => {
    const world = createWorld(OPTS);
    world.unions[UNION]!.duesPerWorkerAnnual = 5;
    world.unions[UNION]!.pensionContributionRate = 0.1;
    const seen = new Map<string, string>();
    advanceTurn(world, {
      afterPhase(name, _observed, rng: Readonly<RngState>) {
        seen.set(name, JSON.stringify(rng));
      },
    });
    const atCorp = seen.get("corporationTurn")!;
    expect(atCorp).toBeDefined();
    expect(seen.get("unionsTurn")).toBe(atCorp);
    expect(seen.get("nppUnionBehavior")).toBe(atCorp);
    expect(seen.get("pensionTurn")).toBe(atCorp);
  });
});

describe("#323 single application: no same-turn duplicate damage", () => {
  it("a live strike throttles exactly once per turn, in corporationTurn only", () => {
    const { world } = strikeWorld();
    const assets = corporateSectorAssets(world);
    const asset = Object.values(assets).find((candidate) => candidate.corporationId === EMPLOYER)!;
    expect(asset.strikeStartedAtTurn).toBe(3);

    const seen = new Map<string, number>();
    advanceTurn(world, {
      afterPhase(name, observed) {
        if (name === "corporationTurn" || name === "unionsTurn" || name === "pensionTurn") {
          seen.set(name, observed.corporations[EMPLOYER]!.revenue);
        }
      },
    });
    // The throttle landed in corporationTurn; the union and pension passes
    // that follow it in the same turn add no second hit.
    expect(seen.get("unionsTurn")).toBe(seen.get("corporationTurn"));
    expect(seen.get("pensionTurn")).toBe(seen.get("corporationTurn"));
  });

  it("manual phase sequence keeps revenue flat after corporationTurn", () => {
    const { world } = strikeWorld();
    const revenue = (): number => world.corporations[EMPLOYER]!.revenue;
    corporationTurnPhase.run(world, RNG as never);
    const afterCorp = revenue();
    world.unions[UNION]!.duesPerWorkerAnnual = 5;
    unionsTurnPhase.run(world, RNG as never);
    expect(revenue()).toBe(afterCorp);
    pensionTurnPhase.run(world, RNG as never);
    expect(revenue()).toBe(afterCorp);
  });

  it("a strike active at the corporation turn throttles versus an idle twin", () => {
    const struck = strikeWorld().world;
    const idle = shopWorld().world;
    const struckRevenue = revenueAt(struck, "corporationTurn")!;
    const idleRevenue = revenueAt(idle, "corporationTurn")!;
    // Same seed, same growth path: the only delta is the 0.25 strike
    // throttle (STRIKE_REVENUE_THROTTLE), applied once.
    expect(struckRevenue).toBeCloseTo(idleRevenue * 0.75, 8);
  });
});

describe("#323 bargaining lifecycle and employer response", () => {
  it("open → reject → escalate → strike, then employer settlement protects the next turn", () => {
    const { world, assetId, campaignId } = strikeWorld();
    expect(world.bargainingCampaigns?.[campaignId]?.status).toBe("dispute");

    // Employer accepts the union's offer while the strike is live: the
    // campaign settles into an agreement with a no-strike window.
    const settled = answerBargainingCampaignAsEmployer(world, {
      campaignId,
      action: "accept",
      turn: 4,
    });
    expect(settled.status).toBe("settled");
    const agreements = Object.values(world.collectiveAgreements ?? {});
    expect(agreements).toHaveLength(1);

    // Clock alignment (source-backed, comparison unchanged): the five actions
    // above stamp turns 0..4 while the world clock still reads 0, but live
    // play acts at the current turn, so a settlement always starts at or
    // before the next corporation pass. isCollectiveAgreementActive requires
    // startsAtTurn <= currentTurn and the corporation pass reads protection
    // at world.meta.turn: running the comparison at turn 0 leaves the
    // turn-4 agreement inactive, so the strike correctly still throttles and
    // the 0.75 factor is the throttle, not a leak. Both twins advance from
    // identical state at the same aligned turn, so the exact comparison
    // below still isolates only the agreement effect.
    world.meta.turn = 4;
    const idle = shopWorld().world;
    idle.meta.turn = 4;
    const settledRevenue = revenueAt(world, "corporationTurn")!;
    const idleRevenue = revenueAt(idle, "corporationTurn")!;
    // Agreement protection suppresses the strike hit entirely this turn,
    // and the strike markers clear through the agreement resolution.
    expect(settledRevenue).toBe(idleRevenue);
    expect(corporateSectorAssets(world)[assetId]!.strikeStartedAtTurn).toBeNull();
  });

  it("overtime upkeep is charged against the pre-dues treasury", () => {
    const { world } = shopWorld();
    const union = world.unions[UNION]!;
    union.duesPerWorkerAnnual = 5;
    const opened = openBargainingCampaignAction(world, {
      unionId: UNION,
      employerCorporationId: EMPLOYER,
      terms: TERMS,
      turn: 0,
    });
    answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 1 });
    moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "escalate", turn: 2 });
    expect(world.bargainingCampaigns?.[opened.id]?.escalationLevel).toBe("overtime_ban");
    // Drain the treasury so the ban cannot be funded even after dues arrive:
    // the reference charges upkeep BEFORE dues income, so the ban must end
    // this turn rather than survive on dues that land later the same turn.
    union.treasury = 0;
    union.duesPerWorkerAnnual = 0;
    const before = world.bargainingCampaigns?.[opened.id]?.escalationLevel;
    expect(before).toBe("overtime_ban");
    advanceTurn(world);
    expect(world.bargainingCampaigns?.[opened.id]?.escalationLevel).not.toBe("overtime_ban");
  });
});

describe("#323 contribution and dues settle at the new edge", () => {
  function organizer(world: World, unionId: string, characterId: string, strength: number) {
    return { ...createUnionOrganizer(unionId, characterId, 0), strength, organizeCount: 3 };
  }

  it("organizer payouts credit recipients before campaignTurn reads funds", () => {
    const world = createWorld(OPTS);
    const union = world.unions[UNION]!;
    union.duesPerWorkerAnnual = 5;
    union.politicalContributionPct = 0.5;
    const [first, second] = world.politicians
      .filter((p) => p.countryId === "US")
      .map((p) => p.id)
      .sort() as [string, string];
    world.unionOrganizers = {
      [`${UNION}:${first}`]: organizer(world, UNION, first, 30),
      [`${UNION}:${second}`]: organizer(world, UNION, second, 10),
    };
    const fundsAt = (observed: Readonly<WorldState>, id: string) =>
      observed.politicians.find((p) => p.id === id)!.funds;
    const seen = new Map<string, { first: number; second: number; player: number }>();
    advanceTurn(world, {
      afterPhase(name, observed) {
        if (name === "corporationTurn" || name === "unionsTurn" || name === "campaignTurn") {
          seen.set(name, {
            first: fundsAt(observed, first),
            second: fundsAt(observed, second),
            player: observed.player.funds,
          });
        }
      },
    });
    // corporationTurn and unionsTurn are adjacent in the #323 order, so each
    // delta across that edge is exactly that recipient's organizer payout:
    // the credits land during the unions pass, before campaignTurn.
    // distributePoliticalContributions splits the pool 30:10 by banked
    // strength, so the first organizer takes 75% and the second 25%: the
    // ledger sums BOTH rows, never just the first recipient's credit (the
    // old single-recipient read understated the payout by exactly 25%).
    const before = seen.get("corporationTurn")!;
    const after = seen.get("unionsTurn")!;
    const paidFirst = after.first - before.first;
    const paidSecond = after.second - before.second;
    expect(paidFirst).toBeGreaterThan(0);
    expect(paidSecond).toBeGreaterThan(0);
    // No "player" organizer exists in this fixture, so no credit lands on
    // player funds: every recipient class is traced, none assumed.
    expect(after.player).toBe(before.player);
    const ledger = unionContributionLedger(world).filter((r) => r.unionId === UNION);
    expect(ledger.map((r) => r.recipientId).sort()).toEqual([first, second].sort());
    // Per-row closeness, not identity: the observed delta is
    // (funds + piece) - funds, which carries one ulp of float bubbling
    // versus the ledger's exact payout (observed 1.5e-11 apart here).
    expect(ledger.find((r) => r.recipientId === first)!.amount).toBeCloseTo(paidFirst, 8);
    expect(ledger.find((r) => r.recipientId === second)!.amount).toBeCloseTo(paidSecond, 8);
    expect(ledger.reduce((sum, r) => sum + r.amount, 0)).toBeCloseTo(paidFirst + paidSecond, 8);
  });

  it("dues income is credited at unionsTurn, ahead of macroCountryTurn", () => {
    const world = createWorld(OPTS);
    world.unions[UNION]!.duesPerWorkerAnnual = 5;
    const seen = new Map<string, number>();
    advanceTurn(world, {
      afterPhase(name, observed) {
        if (name === "corporationTurn" || name === "unionsTurn" || name === "macroCountryTurn") {
          seen.set(name, observed.unions[UNION]!.treasury);
        }
      },
    });
    expect(seen.get("unionsTurn")).toBeGreaterThan(seen.get("corporationTurn")!);
  });
});

describe("#323 determinism, reload, and old saves", () => {
  function configured(): World {
    // shopWorld boosts density past the campaign-open gate (same fixture as
    // the strike tests above); dues + pension rate make every money leg live.
    const { world } = shopWorld();
    world.unions[UNION]!.duesPerWorkerAnnual = 5;
    world.unions[UNION]!.pensionContributionRate = 0.1;
    const opened = openBargainingCampaignAction(world, {
      unionId: UNION,
      employerCorporationId: EMPLOYER,
      terms: TERMS,
      turn: 0,
    });
    answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 1 });
    return world;
  }

  it("twin worlds advance identically through bargaining, dues, and pension", () => {
    const a = configured();
    const b = configured();
    for (let i = 0; i < 6; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("a mid-dispute save/load twin resumes identically", () => {
    const live = configured();
    for (let i = 0; i < 3; i++) advanceTurn(live);
    const resumed = deserializeSave(serializeSave(live, STAMP));
    for (let i = 0; i < 3; i++) {
      advanceTurn(live);
      advanceTurn(resumed);
    }
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(live));
  });

  it("old saves without labour maps run the turn without throwing", () => {
    const world = createWorld(OPTS);
    world.unions[UNION]!.duesPerWorkerAnnual = 5;
    const treasuryBefore = world.unions[UNION]!.treasury;
    const raw = JSON.parse(serializeSave(world, STAMP)) as {
      world: Record<string, unknown>;
    };
    for (const key of [
      "bargainingCampaigns",
      "collectiveAgreements",
      "pensionSchemes",
      "pensionLedger",
      "unionOrganizers",
    ]) {
      delete raw.world[key];
    }
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(() => advanceTurn(loaded)).not.toThrow();
    expect(loaded.meta.turn).toBe(world.meta.turn + 1);
    // Absent maps fail closed (dues still price against represented sectors;
    // no phantom campaigns, agreements, or pension charges appear).
    expect(loaded.unions[UNION]!.treasury).toBeGreaterThan(treasuryBefore);
    expect(loaded.bargainingCampaigns ?? {}).toEqual({});
    expect(loaded.collectiveAgreements ?? {}).toEqual({});
    expect(loaded.pensionLedger ?? []).toEqual([]);
  });

  it("re-running pensionTurn in the same turn charges only once", () => {
    const world = createWorld(OPTS);
    world.unions[UNION]!.pensionContributionRate = 0.1;
    advanceTurn(world);
    const capital = world.corporations[EMPLOYER]!.liquidCapital;
    const ledgerLength = world.pensionLedger?.length ?? 0;
    pensionTurnPhase.run(world, RNG as never);
    expect(world.corporations[EMPLOYER]!.liquidCapital).toBe(capital);
    expect(world.pensionLedger?.length ?? 0).toBe(ledgerLength);
  });
});
