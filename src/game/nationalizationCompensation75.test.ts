import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

function sourceCompensationSession(seed: string, cash = 100000, book = 200000, debt = 10000) {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed, playerName: "Alex", mode: "hos", homeRegionId: "NY" });
  const saved = JSON.parse(session.serialize(SAVED_AT));
  const donor = saved.world.corporations["US-media"];
  Object.assign(donor, { liquidCapital: cash, totalShares: 10, publicFloat: 4,
    shareholders: [{ holder: "npc", shares: 3 }, { holder: "player", shares: 3 }],
    sharePrice: 1e9, ceoType: "player", ceoId: "player", ceoVacant: false,
    nationalizationOwnerKind: "npc" });
  // Recorded proposal resources and NPC creator origin are independent of
  // the player CEO. This valuation fixture does not claim an earned career.
  saved.world.player.nationalInfluence = 5;
  const assets = Object.values(saved.world.corporateSectors).filter((asset: any) => asset.corporationId === donor.id) as any[];
  for (const asset of assets) Object.assign(asset, { capitalStock: 0, capacityBookAnchor: 0, constructionInProgressAnchor: 0 });
  Object.assign(assets[0], { capitalStock: 1000, capacityBookAnchor: book, constructionInProgressAnchor: book > 0 ? 40000 : 0 });
  saved.world.budgets.US.treasuryBalance = 1000;
  const bond = (id: string, totalIssued: number, matured = false) => ({
    id, issuerType: "corporation", corporationId: donor.id, countryId: "US", issuerName: donor.name,
    currencyCode: "USD", faceValue: 1000, totalIssued, couponRate: 0, maturityTurns: 96,
    issuedAtTurn: 0, maturityTurn: 96, marketPrice: 1000, publicFloat: totalIssued / 1000,
    holders: [], matured, defaulted: false, defaultedAtTurn: null, createdAt: SAVED_AT, updatedAt: SAVED_AT,
  });
  saved.world.bonds["source-active"] = bond("source-active", debt);
  saved.world.bonds["source-matured"] = bond("source-matured", 99000, true);
  session.load(JSON.stringify(saved));
  return { session, playerCash: saved.world.player.cash, actions: saved.world.player.actions };
}

// Independently executed Game wholeCorpCompensationAnchor and
// allocateShareholderPool: book+CIP+cash-debt=330000, no market-cap floor.
// Source nppId holders receive no allocation; public float credits treasury.
describe("source compensation through legislative and executive authority (#75)", () => {
  it.each([
    { tier: "fair" as const, payout: 330000, player: 99000, float: 132000, treasury: -97000 },
    { tier: "discounted" as const, payout: 165000, player: 49500, float: 66000, treasury: 2000 },
    { tier: "seizure" as const, payout: 0, player: 0, float: 0, treasury: 101000 },
  ])("settles $tier at the source paid basis before haircuts, without a cash affordability gate", ({ tier, payout, player, treasury }) => {
    const { session, playerCash, actions } = sourceCompensationSession(`source-compensation-${tier}`);
    const taking = tier === "fair"
      ? session.act("sponsorBill", { catalogId: "state_ownership.nationalize", corporationId: "US-media" })
      : session.act("nationalizeCorporation", { corporationId: "US-media", tier });
    expect(taking.ok).toBe(true);
    const taken = JSON.parse(session.serialize(SAVED_AT));
    expect(taken.world.player.cash).toBe(playerCash + player);
    expect(taken.world.player.actions).toBe(actions);
    expect(taken.world.budgets.US.treasuryBalance).toBe(treasury);
    expect(taken.world.corporations["US-media"]).toBeUndefined();
    expect(taken.world.corporations["NAT-US"].liquidCapital).toBe(0);
    expect(taken.world.bonds["source-active"].corporationId).toBe("NAT-US");
    expect(taken.world.bonds["source-matured"].corporationId).toBe("US-media");
    expect(session.stateOwnership().rows[0]).toMatchObject({ tier, compensationAnchor: payout, debtAnchor: 10000,
      method: tier === "fair" ? "legislative" : "executive" });
    const recorded = session.stateOwnership().rows[0];
    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership().rows).toEqual([recorded]);
  });

  it("nets debt against cash before plants and settles actual CEO cash surplus once", () => {
    const { session, playerCash } = sourceCompensationSession("source-ceo-surplus", 200000, 0, 100000);
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "discounted" }).ok).toBe(true);
    const taken = JSON.parse(session.serialize(SAVED_AT));
    // Source value100000, discounted50000: shareholder15000, CEO150000,
    // publicfloat20000 and treasury cash recoup50000, less treasury debit50000.
    expect(taken.world.player.cash).toBe(playerCash + 165000);
    expect(taken.world.budgets.US.treasuryBalance).toBe(21000);
    expect(session.stateOwnership().rows[0].compensationAnchor).toBe(50000);
  });

  it("refuses an unknown tier atomically before spending or moving an asset", () => {
    const { session } = sourceCompensationSession("source-invalid-tier");
    const before = session.serialize(SAVED_AT);
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "free" as any }).ok).toBe(false);
    expect(session.serialize(SAVED_AT)).toBe(before);
  });
});
