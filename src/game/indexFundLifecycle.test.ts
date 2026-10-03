import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { projectSaveToV42 } from "@ahdclient/engine";

describe("source-seeded index fund player lifecycle", () => {
  it("subscribes to the source US Top 25 fund through the public session and preserves the position", () => {
    const session = new GameSession();
    session.create({
      seed: "source-index-fund-public-session",
      era: "1953",
      countryId: "US",
      playerName: "Alex",
      creation: {
        name: "Alex",
        homeRegionId: "AL",
        partyId: null,
        stats: { charisma: 4, debate: 4, energy: 4, fundraising: 4, businessAcumen: 4, statecraft: 4, intellect: 4 },
        policies: { economic: 0, social: 0 },
        demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
      },
    });

    const initial = JSON.parse(session.serialize("2026-10-03T14:00:00.000Z"));
    const cashBefore = initial.world.player.cash;
    const fundCashBefore = initial.world.indexFundBook.funds.us_top_25.cashAnchor;
    const beforeRefusal = session.serialize("2026-10-03T14:00:00.000Z");
    expect(session.act("subscribeIndexFund", { fundSlug: "us_top_25", units: 2_000_000 }).ok).toBe(false);
    expect(session.serialize("2026-10-03T14:00:00.000Z")).toBe(beforeRefusal);
    const result = session.act("subscribeIndexFund", { fundSlug: "us_top_25", units: 1 });
    expect(result.ok).toBe(true);

    const save = JSON.parse(session.serialize("2026-10-03T14:00:00.000Z"));
    expect(save.world.indexFundBook.funds.us_top_25).toMatchObject({ unitSupply: 500_001, cashAnchor: fundCashBefore + 100 });
    expect(save.world.player.cash).toBe(cashBefore - 100);
    expect(save.world.indexFundBook.positions).toContainEqual(expect.objectContaining({ fundSlug: "us_top_25", holderKind: "player", units: 1 }));
    expect(projectSaveToV42(session.serialize("2026-10-03T14:00:00.000Z")).ok).toBe(false);

    const raw = session.serialize("2026-10-03T14:01:00.000Z");
    const continued = new GameSession();
    continued.load(raw);
    expect(continued.act("redeemIndexFund", { fundSlug: "us_top_25", units: 1 }).ok).toBe(true);
    const afterRedeem = JSON.parse(continued.serialize("2026-10-03T14:02:00.000Z"));
    expect(afterRedeem.world.indexFundBook.funds.us_top_25).toMatchObject({ unitSupply: 500_000, cashAnchor: fundCashBefore });
    expect(afterRedeem.world.player.cash).toBe(cashBefore);

    const left = new GameSession();
    const right = new GameSession();
    left.load(raw);
    right.load(raw);
    left.advance();
    right.advance();
    expect(left.serialize("2026-10-03T15:00:00.000Z")).toBe(right.serialize("2026-10-03T15:00:00.000Z"));

    const corrupt = JSON.parse(raw);
    corrupt.world.indexFundBook.funds.us_top_25.unitSupply += 1;
    const beforeRejectedLoad = left.serialize("2026-10-03T15:01:00.000Z");
    expect(() => left.load(JSON.stringify(corrupt))).toThrow(/invalid index fund custody state/);
    expect(left.serialize("2026-10-03T15:01:00.000Z")).toBe(beforeRejectedLoad);
  });
});
