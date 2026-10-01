import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = {
  era: "1953",
  countryId: "US",
  seed: "native-loc-session",
  playerName: "Alex",
};
const STAMP = "2026-09-10T00:00:00.000Z";

function saveWithLine(session: GameSession, lineOfCredit: unknown): string {
  const saved = JSON.parse(session.serialize(STAMP)) as {
    world: { player: Record<string, unknown> };
  };
  saved.world.player.lineOfCredit = lineOfCredit;
  const next = new GameSession();
  next.load(JSON.stringify(saved));
  return next.serialize(STAMP);
}

function saveWithForeignWalletLine(): string {
  const session = new GameSession();
  session.create(options);
  const saved = JSON.parse(session.serialize(STAMP)) as {
    world: {
      player: Record<string, unknown>;
      exchangeRates: Record<string, { rate: number }>;
      centralBanks: Record<string, { primeRate: number }>;
    };
  };
  saved.world.player.cash = 0;
  saved.world.player.savings = 0;
  saved.world.player.currencyBalances = { personal: { GBP: 20 } };
  saved.world.player.lineOfCredit = {
    balance: 1000,
    denomination: "USD",
    arrears: 0,
    drawFrozen: false,
  };
  saved.world.exchangeRates.US!.rate = 1;
  saved.world.exchangeRates.UK!.rate = 2;
  saved.world.centralBanks.US!.primeRate = 5;
  const loaded = new GameSession();
  loaded.load(JSON.stringify(saved));
  return loaded.serialize(STAMP);
}

function publicWorld(session: GameSession): {
  player: {
    currencyBalances: { personal: Record<string, number> };
    lineOfCredit: { balance: number; arrears: number; drawFrozen: boolean };
  };
} {
  return JSON.parse(session.serialize(STAMP)).world;
}

describe("line-of-credit session seam (#314)", () => {
  it("services the line at the public advance seam and persists it through reload", () => {
    const session = new GameSession();
    session.create(options);
    const stamp = saveWithLine(session, {
      balance: 1000,
      denomination: "USD",
      arrears: 0,
      drawFrozen: false,
    });

    const loaded = new GameSession();
    loaded.load(stamp);
    const before = loaded.view().player.cash;
    loaded.advance();

    const after = new GameSession();
    after.load(loaded.serialize(STAMP));
    const world = JSON.parse(after.serialize(STAMP)).world;
    expect(world.player.lineOfCredit.balance).toBeLessThan(1000);
    expect(world.player.lineOfCredit.arrears).toBe(0);
    expect(world.player.cash).toBeLessThan(before);
  });

  it("services a foreign wallet and preserves twin continuation across save/reload", () => {
    const opening = saveWithForeignWalletLine();
    const uninterrupted = new GameSession();
    uninterrupted.load(opening);
    const resumed = new GameSession();
    resumed.load(opening);

    uninterrupted.advance();
    resumed.advance();
    const afterFirst = publicWorld(uninterrupted);
    expect(afterFirst.player.currencyBalances.personal.GBP).toBeLessThan(20);
    expect(afterFirst.player.lineOfCredit.balance).toBeLessThan(1000);
    expect(afterFirst.player.lineOfCredit.arrears).toBe(0);
    expect(afterFirst.player.lineOfCredit.drawFrozen).toBe(false);
    expect(publicWorld(resumed).player).toEqual(afterFirst.player);

    const resumedNext = new GameSession();
    resumedNext.load(resumed.serialize(STAMP));
    uninterrupted.advance();
    resumedNext.advance();
    expect(publicWorld(resumedNext).player).toEqual(
      publicWorld(uninterrupted).player,
    );
  });

  it("refuses an invalid line at the load boundary and leaves the loading session untouched", () => {
    const session = new GameSession();
    session.create(options);
    const good = session.serialize(STAMP);
    const parsed = JSON.parse(good) as {
      world: { player: Record<string, unknown> };
    };
    parsed.world.player.lineOfCredit = {
      balance: -50,
      denomination: "USD",
      arrears: 0,
      drawFrozen: false,
    };

    // deserializeSave fails closed on present-but-invalid line state, so
    // the invalid save never enters the session; the live world is intact.
    expect(() => session.load(JSON.stringify(parsed))).toThrow();
    expect(session.serialize(STAMP)).toBe(good);
  });
});
