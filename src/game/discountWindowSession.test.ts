import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = {
  era: "1953",
  countryId: "US",
  seed: "native-window-session",
  playerName: "Alex",
};
const STAMP = "2026-09-10T00:00:00.000Z";

interface CraftedSave {
  world: {
    meta: { turn: number };
    centralBanks: Record<string, { primeRate: number; externalBroadMoney: number }>;
    corporations: Record<string, { bankCharter: Record<string, unknown> }>;
  };
}

function worldOf(session: GameSession): CraftedSave["world"] {
  return (JSON.parse(session.serialize(STAMP)) as CraftedSave).world;
}

/** Fund the US bank and book window debt through the save envelope (the draw itself is engine-covered). */
function saveWithWindow(session: GameSession, debt: number): string {
  const saved = JSON.parse(session.serialize(STAMP)) as CraftedSave;
  saved.world.centralBanks["US"]!.primeRate = 5;
  saved.world.centralBanks["US"]!.externalBroadMoney = 0;
  const charter = saved.world.corporations["US-financial"]!.bankCharter;
  charter["npcDeposits"] = 1_000_000;
  charter["cashReserves"] = 1_000_000;
  charter["discountWindowDebt"] = debt;
  const next = new GameSession();
  next.load(JSON.stringify(saved));
  return next.serialize(STAMP);
}

describe("discount-window session seam (#327)", () => {
  it("services window interest at the public advance seam and persists it through reload", () => {
    const session = new GameSession();
    session.create(options);
    const stamp = saveWithWindow(session, 100_000);

    const loaded = new GameSession();
    loaded.load(stamp);
    const turnBefore = worldOf(loaded).meta.turn;
    const cashBefore = worldOf(loaded).corporations["US-financial"]!.bankCharter[
      "cashReserves"
    ] as number;
    loaded.advance();

    const world = worldOf(loaded);
    const charter = world.corporations["US-financial"]!.bankCharter;
    expect(world.meta.turn).toBe(turnBefore + 1);
    // The phase ran: stamped this turn, principal untouched, interest affordable so no arrears.
    expect(charter["lastDiscountWindowTurn"]).toBe(world.meta.turn);
    expect(charter["discountWindowDebt"]).toBe(100_000);
    expect(charter["discountWindowArrears"] ?? 0).toBe(0);
    expect(charter["cashReserves"] as number).toBeLessThan(cashBefore);

    // Reload keeps every window field byte-identical; a second advance services again.
    const reloaded = new GameSession();
    reloaded.load(loaded.serialize(STAMP));
    expect(
      worldOf(reloaded).corporations["US-financial"]!.bankCharter["lastDiscountWindowTurn"],
    ).toBe(world.meta.turn);
    reloaded.advance();
    const again = worldOf(reloaded).corporations["US-financial"]!.bankCharter;
    expect(again["lastDiscountWindowTurn"]).toBe(world.meta.turn + 1);
    expect(again["discountWindowDebt"]).toBe(100_000);
  });

  it("leaves a debt-free bank untouched at the advance seam", () => {
    const session = new GameSession();
    session.create(options);
    const stamp = saveWithWindow(session, 0);

    const loaded = new GameSession();
    loaded.load(stamp);
    loaded.advance();
    const charter = worldOf(loaded).corporations["US-financial"]!.bankCharter;
    expect(charter["discountWindowDebt"] ?? 0).toBe(0);
    expect(charter["lastDiscountWindowTurn"] ?? null).toBe(null);
  });
});
