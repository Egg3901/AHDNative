/**
 * Hall of Fame source-correction tests (#73).
 *
 * Every vector executes through the public seams — engine `createWorld`
 * for recorded state, `GameSession.hallOfFame` for the projection, and the
 * save serialize/load round-trip — never by calling the projector with
 * faked overview/politics/profile inputs. Expectations are the reference
 * scorer's own math (`src/lib/world/legacyLeaderboard.ts` at Game rev
 * 954f1c2): legacy weights, forex-normalized legs, held-only office
 * ladder, debt-negative net worth with a clamped score wealth term.
 */
import { describe, expect, it } from "vitest";
import { createWorld, serializeSave, type WorldState } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVE_AT = "1953-01-01T00:00:00.000Z";

function freshSession(seed = "hall-of-fame"): GameSession {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", playerName: "Ada", seed });
  return session;
}

/**
 * Record holdings/results onto a real engine world, then reload through
 * the public save seam so the projection reads exactly what a save holds.
 */
function reloadWith(mutator: (world: WorldState) => void, seed = "hall-of-fame"): { session: GameSession; world: WorldState } {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed });
  mutator(world);
  const session = new GameSession();
  session.load(serializeSave(world, SAVE_AT));
  return { session, world };
}

function resolvedRace(overrides: {
  id: string; chamberKey: string; state?: string; winners: string[]; resolvedTurn: number;
}): WorldState["elections"][number] {
  return {
    id: overrides.id,
    electionType: overrides.chamberKey,
    countryId: "US",
    ...(overrides.state ? { state: overrides.state } : {}),
    cycle: 0,
    status: "resolved",
    startTurn: 0,
    primaryEndTurn: 0,
    endTurn: overrides.resolvedTurn,
    resolvedTurn: overrides.resolvedTurn,
    totalSeats: 1,
    chamberKey: overrides.chamberKey,
    candidates: [{ id: "player", name: "Ada" }, { id: "npc-1", name: "Rival" }],
    tally: { player: 3, "npc-1": 9 },
    winners: overrides.winners,
  } as WorldState["elections"][number];
}

describe("hallOfFame query through GameSession", () => {
  it("scores the single recorded local life from a fresh create/read", () => {
    const view = freshSession().hallOfFame({});

    expect(view.era).toBe("1953");
    expect(view.total).toBe(1);
    expect(view.entries.length).toBe(1);
    const entry = view.entries[0]!;
    expect(entry.id).toBe("player");
    expect(entry.name).toBe("Ada");
    expect(entry.isPlayer).toBe(true);
    expect(entry.isActive).toBe(true);
    expect(entry.lifetimeLives).toBe(1);
    expect(entry.profileRoute).toBe("profile");
    expect(entry.rank).toBe(1);
    // Fresh US life: every built-up stat is zero, so the score is exactly
    // the log wealth term on the 10,000 starting grant.
    expect(entry.score).toBe(800.0086854553725);
    expect(entry.scoreBreakdown).toEqual({
      nationalInfluence: 0,
      partyInfluence: 0,
      achievements: 0,
      officeTier: 0,
      // -0, not 0: the scorer multiplies recorded infamy by -30, and
      // 0 * -30 is -0. Same arithmetic as the reference.
      infamyPenalty: -0,
      wealth: 800.0086854553725,
    });
    expect(entry.netWorth).toBe(10000);
    expect(entry.netWorthBreakdown).toEqual({ personal: 10000, savings: 0, shares: 0, bonds: 0, indexFunds: 0 });
  });

  it("never ranks NPC politicians: the board holds only the local life", () => {
    const view = freshSession().hallOfFame({ rankBy: "netWorth", scope: "all" });

    expect(view.entries.length).toBe(1);
    for (const entry of view.entries) expect(entry.isPlayer).toBe(true);
  });

  it("credits a held race office and ignores a lost race (reference #991)", () => {
    const { session } = reloadWith((world) => {
      world.elections.push(resolvedRace({ id: "house:US:AL:c0", chamberKey: "house", state: "AL", winners: ["player"], resolvedTurn: 1 }));
      world.elections.push(resolvedRace({ id: "senate:US:c0", chamberKey: "senate", winners: ["npc-1"], resolvedTurn: 2 }));
    }, "hof-vectors");
    const entry = session.hallOfFame({}).entries[0]!;

    // House win ranks 3 (3 * 500); the lost senate run (rank 4 if held)
    // contributes nothing — losers are never winners.
    expect(entry.highestOffice).toBe("House of Representatives");
    expect(entry.scoreBreakdown.officeTier).toBe(1500);
    expect(entry.score).toBe(2300.0086854553724);
  });

  it("reports no office when the only recorded race was lost", () => {
    const { session } = reloadWith((world) => {
      world.elections.push(resolvedRace({ id: "senate:US:c0", chamberKey: "senate", winners: ["npc-1"], resolvedTurn: 2 }));
    }, "hof-loss");
    const entry = session.hallOfFame({}).entries[0]!;

    expect(entry.highestOffice).toBeNull();
    expect(entry.scoreBreakdown.officeTier).toBe(0);
    expect(entry.score).toBe(800.0086854553725);
  });

  it("forex-normalizes the cash legs instead of counting local units", () => {
    const { session } = reloadWith((world) => {
      (world.exchangeRates as Record<string, { rate?: number }>).US!.rate = 2;
    }, "hof-fx");
    const entry = session.hallOfFame({}).entries[0]!;

    expect(entry.netWorthBreakdown.personal).toBe(5000);
    expect(entry.scoreBreakdown.wealth).toBeLessThan(800.0086854553725);
  });

  it("values real player stock plus sovereign AND corporate bond holdings", () => {
    const { session, world } = reloadWith((world) => {
      const corpId = Object.keys(world.corporations).find((key) => key.startsWith("US-"))!;
      world.corporations[corpId]!.shareholders.push({ holder: "player", shares: 100 });
      const bondBase = {
        faceValue: 1000, couponRate: 4, maturityTurns: 96 as const, issuedAtTurn: 0, maturityTurn: 96,
        totalIssued: 20000, publicFloat: 18, matured: false, defaulted: false, defaultedAtTurn: null,
        createdAt: "1953-01-01", updatedAt: "1953-01-01",
      };
      world.bonds.sov = {
        ...bondBase, id: "sov", issuerType: "sovereign", countryId: "US", issuerName: "United States",
        marketPrice: 1, holders: [{ holderId: "player", units: 2 }], currencyCode: "USD",
      };
      world.bonds.corp = {
        ...bondBase, id: "corp", issuerType: "corporation", corporationId: corpId, countryId: "US",
        issuerName: corpId, marketPrice: 0.9, holders: [{ holderId: "player", units: 3 }], currencyCode: "USD",
      };
    }, "hof-vectors");
    const entry = session.hallOfFame({}).entries[0]!;
    const corpId = Object.keys(world.corporations).find((key) => key.startsWith("US-"))!;
    const price = world.corporations[corpId]!.sharePrice;

    // 100 shares at the recorded listing price; 2 sovereign units at par
    // plus 3 corporate units at 0.9 through the same holders map.
    expect(entry.netWorthBreakdown.shares).toBe(100 * price);
    expect(entry.netWorthBreakdown.bonds).toBe(2000 + 2700);
    expect(entry.netWorth).toBe(10000 + 100 * price + 4700);
  });

  it("keeps debt negative in net worth while the score wealth term clamps at zero", () => {
    const { session } = reloadWith((world) => {
      world.player.cash = -500;
    }, "hof-debt");
    const entry = session.hallOfFame({}).entries[0]!;

    expect(entry.netWorthBreakdown.personal).toBe(-500);
    expect(entry.netWorth).toBe(-500);
    expect(entry.scoreBreakdown.wealth).toBe(0);
    expect(entry.score).toBe(0);
  });

  it("reports zero index funds because Native records no such store", () => {
    const entry = freshSession().hallOfFame({ rankBy: "netWorth" }).entries[0]!;

    expect(entry.netWorthBreakdown.indexFunds).toBe(0);
  });

  it("survives save/reload with the identical board", () => {
    const first = freshSession("hof-reload");
    const before = first.hallOfFame({ rankBy: "netWorth" });
    const second = new GameSession();
    second.load(first.serialize(SAVE_AT));

    expect(second.hallOfFame({ rankBy: "netWorth" })).toEqual(before);
  });

  it("applies the scope and rankBy source filters", () => {
    const session = freshSession();

    const current = session.hallOfFame({ scope: "current" });
    expect(current.entries.length).toBe(1);
    expect(current.entries[0]!.era).toBe("1953");
    const byWorth = session.hallOfFame({ rankBy: "netWorth" });
    expect(byWorth.entries[0]!.netWorth).toBe(10000);
  });
});
