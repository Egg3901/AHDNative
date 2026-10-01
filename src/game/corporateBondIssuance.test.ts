import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVE_AT = "2026-10-01T00:00:00.000Z";
const creation = {
  homeRegionId: "LON",
  partyId: null,
  policies: { economic: 0, social: 0 },
  demographics: { race: "white" as const, gender: "female" as const, education: "college" as const, wealth: "high" as const },
};

function seatedIssuer(seed: string): GameSession {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "UK", homeRegionId: "LON", seed, playerName: "Bond CEO", creation });
  const listing = session.markets().listings.find((item) => item.id === "UK-media");
  if (!listing) throw new Error("1953 UK media issuer was not seeded");
  expect(session.act("buyShares", { corpId: listing.id, shares: 1 }).ok).toBe(true);
  expect(session.act("voteCeo", { corpId: listing.id, candidateId: "player" }).ok).toBe(true);
  expect(session.act("acceptCeoAppointment", { corpId: listing.id }).ok).toBe(true);
  return session;
}

describe("CEO corporate bond issuance through GameSession", () => {
  it("issues, saves, reloads, then settles one source-rate coupon into next-turn issuer capital", () => {
    const financed = seatedIssuer("corporate-bond-session");
    const control = seatedIssuer("corporate-bond-session");
    const before = financed.markets().listings.find((item) => item.id === "UK-media")!.liquidCapital;
    const quote = financed.markets().listings.find((item) => item.id === "UK-media")!.corporateBondQuote!;
    expect(quote).toMatchObject({ available: true, currencyCode: "GBP", couponRates: { 240: expect.any(Number) } });

    const issueResult = financed.act("issueCorporateBond", { corpId: "UK-media", faceValue: 100_000, maturityTurns: 240 });
    expect(issueResult, issueResult.ok ? undefined : issueResult.error).toMatchObject({ ok: true });
    const issued = financed.bondMarket().bonds[0]!;
    expect(issued).toMatchObject({ issuerType: "corporation", corporationId: "UK-media", issuerName: "Daily Media" });
    expect(issued.couponRate).toBe(quote.couponRates[240]);
    const localFace = issued.publicFloat * issued.faceValue;
    expect(financed.markets().listings.find((item) => item.id === "UK-media")!.liquidCapital - before).toBe(localFace);
    expect(financed.markets().listings.find((item) => item.id === "UK-media")!.corporateBondQuote).toMatchObject({
      available: false,
      cooldownTurnsRemaining: 24,
    });

    const resumed = new GameSession();
    resumed.load(financed.serialize(SAVE_AT));
    expect(resumed.bondMarket().bonds[0]).toEqual(issued);
    expect(resumed.markets().listings.find((item) => item.id === "UK-media")!.ceoId).toBe("player");
    resumed.advance();
    control.advance();

    const settled = resumed.bondMarket().bonds[0]!;
    const couponPerUnitSourceVector = ((settled.couponRate / 100) * 1_000) / 48;
    const expectedIssuerCashDelta = localFace - couponPerUnitSourceVector * settled.publicFloat;
    const resumedCapital = resumed.markets().listings.find((item) => item.id === "UK-media")!.liquidCapital;
    const controlCapital = control.markets().listings.find((item) => item.id === "UK-media")!.liquidCapital;
    expect(resumedCapital - controlCapital).toBeCloseTo(expectedIssuerCashDelta, 5);
    expect((JSON.parse(resumed.serialize(SAVE_AT)) as { world: { bonds: Record<string, { lastCouponTurn?: number }> } }).world.bonds[settled.id]?.lastCouponTurn).toBe(1);
  });

  it("lets the active CEO retire public float through the saved GameSession action", () => {
    const session = seatedIssuer("corporate-bond-buyback-session");
    expect(session.act("issueCorporateBond", { corpId: "UK-media", faceValue: 100_000, maturityTurns: 240 }).ok).toBe(true);
    const issued = session.bondMarket().bonds[0]!;
    expect(session.bondMarket().bonds[0]?.canBuyback).toBe(true);
    const capitalBefore = session.markets().listings.find((item) => item.id === "UK-media")!.liquidCapital;
    const res = session.act("buybackCorporateBond", { bondId: issued.id, units: issued.publicFloat });
    expect(res, res.ok ? undefined : res.error).toMatchObject({ ok: true });
    const retired = (JSON.parse(session.serialize(SAVE_AT)) as { world: { bonds: Record<string, { id: string; publicFloat: number; totalIssued: number; matured: boolean; defaulted: boolean }> } }).world.bonds[issued.id]!;
    expect(retired).toMatchObject({ publicFloat: 0, totalIssued: 0, matured: true, defaulted: false });
    expect(session.markets().listings.find((item) => item.id === "UK-media")!.liquidCapital).toBe(capitalBefore - issued.publicFloat * issued.buybackUnitCost!);

    const resumed = new GameSession();
    resumed.load(session.serialize(SAVE_AT));
    expect((JSON.parse(resumed.serialize(SAVE_AT)) as { world: { bonds: Record<string, unknown> } }).world.bonds[issued.id]).toEqual(retired);
  });
});
