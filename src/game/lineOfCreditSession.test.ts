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

  it("refuses an invalid line at advance and leaves the live session untouched", () => {
    const session = new GameSession();
    session.create(options);
    const stamp = saveWithLine(session, {
      balance: -50,
      denomination: "USD",
      arrears: 0,
      drawFrozen: false,
    });

    const loaded = new GameSession();
    loaded.load(stamp);
    const before = loaded.serialize(STAMP);
    expect(() => loaded.advance()).toThrow();
    expect(loaded.serialize(STAMP)).toBe(before);
  });
});
