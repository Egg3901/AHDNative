import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = {
  era: "1953",
  countryId: "US",
  seed: "native-prop-session",
  playerName: "Alex",
};
const STAMP = "2026-09-10T00:00:00.000Z";

function withPropBook(saved: string): { json: string; targetId: string } {
  const parsed = JSON.parse(saved) as {
    world: {
      corporations: Record<
        string,
        {
          id: string;
          sharePrice: number;
          bankCharter?: Record<string, unknown>;
        }
      >;
    };
  };
  const bank = parsed.world.corporations["US-financial"]!;
  const target = Object.values(parsed.world.corporations).find(
    (c) => c.id !== bank.id && c.sharePrice > 0,
  )!;
  target.sharePrice = 100;
  bank.bankCharter!["charterType"] = "investment";
  bank.bankCharter!["cashReserves"] = 1_000_000;
  bank.bankCharter!["propBook"] = [
    { asset: "equity", ref: target.id, units: 100, costBasis: 10_000 },
  ];
  bank.bankCharter!["propBookMarkValue"] = 0;
  return { json: JSON.stringify(parsed), targetId: target.id };
}

describe("prop-book session seam (#328)", () => {
  it("marks the book at the public advance seam and persists it through reload", () => {
    const session = new GameSession();
    session.create(options);
    const { json, targetId } = withPropBook(session.serialize(STAMP));

    const loaded = new GameSession();
    loaded.load(json);
    loaded.advance();

    const after = new GameSession();
    after.load(loaded.serialize(STAMP));
    const world = JSON.parse(after.serialize(STAMP)).world;
    const charter = world.corporations["US-financial"].bankCharter;
    expect(charter.charterType).toBe("investment");
    expect(charter.propBook).toHaveLength(1);
    expect(charter.propBook[0].ref).toBe(targetId);
    // Marked at the live price during bankSolvencyTurn, then reloaded intact.
    expect(charter.propBookMarkValue).toBe(
      100 * world.corporations[targetId].sharePrice,
    );
    expect(charter.propBook[0].markValue).toBe(
      100 * world.corporations[targetId].sharePrice,
    );
  });

  it("refuses an invalid prop book at the load boundary and leaves the loading session untouched", () => {
    const session = new GameSession();
    session.create(options);
    const good = session.serialize(STAMP);
    const parsed = JSON.parse(good) as {
      world: {
        corporations: Record<string, { bankCharter?: Record<string, unknown> }>;
      };
    };
    parsed.world.corporations["US-financial"]!.bankCharter!["charterType"] =
      "investment";
    parsed.world.corporations["US-financial"]!.bankCharter!["propBook"] = [
      { asset: "equity", ref: "", units: -10, costBasis: 100 },
    ];

    // deserializeSave fails closed on present-but-invalid prop state, so
    // the invalid save never enters the session; the live world is intact.
    expect(() => session.load(JSON.stringify(parsed))).toThrow();
    expect(session.serialize(STAMP)).toBe(good);
  });
});
