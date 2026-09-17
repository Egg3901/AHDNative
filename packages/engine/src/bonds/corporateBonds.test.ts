import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { BOND_UNIT_FACE_VALUE } from "./constants.js";
import {
  CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS,
  CORPORATE_BOND_SPREAD_PREMIUM,
  CORPORATE_BOND_TERM_PREMIUMS,
  corporateBondTotalUnits,
  getCorporateCouponRate,
  isCorpStateOwned,
  issueCorporateBond,
  resolveCorporateBondCurrency,
  validateBondIssuerIdentity,
} from "./corporateBonds.js";
import type { Bond } from "./types.js";
import { executeAction } from "../actions/execute.js";

const OPTS = { seed: "corp-bond-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

function usCorpId(): string {
  const world = createWorld(OPTS);
  const id = Object.keys(world.corporations).find((k) => world.corporations[k]!.countryId === "US");
  expect(id).toBeDefined();
  return id!;
}

function validCorporateBond(world: ReturnType<typeof createWorld>, corpId: string): Bond {
  const res = issueCorporateBond(world, corpId, { totalUnits: 100, maturityTurns: 240 });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("issuance failed");
  return world.bonds[res.bondId]!;
}

// ── Valid issuance ───────────────────────────────────────────────────
describe("corporate issuance (cite: bond.ts CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS, issueRelocationBond.ts doc shape)", () => {
  it("issues a 240t series with full float, par price, and issuer home denomination", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    const corp = world.corporations[corpId]!;
    const res = issueCorporateBond(world, corpId, { totalUnits: 100, maturityTurns: 240 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.bondId).toBe(`cbond-${world.meta.turn}-${corpId}`);
    const bond = world.bonds[res.bondId]!;
    expect(bond.issuerType).toBe("corporation");
    expect(bond.corporationId).toBe(corpId);
    expect(bond.countryId).toBe(corp.countryId);
    expect(bond.issuerName).toBe(corpId);
    expect(bond.faceValue).toBe(BOND_UNIT_FACE_VALUE);
    expect(bond.totalIssued).toBe(100 * BOND_UNIT_FACE_VALUE);
    expect(bond.publicFloat).toBe(100);
    expect(bond.holders).toEqual([]);
    expect(bond.marketPrice).toBe(1.0);
    expect(bond.maturityTurns).toBe(240);
    expect(bond.maturityTurn).toBe(world.meta.turn + 240);
    expect(bond.currencyCode).toBe(resolveCorporateBondCurrency(world, corp));
    expect(bond.matured).toBe(false);
    expect(bond.defaulted).toBe(false);
    expect(validateBondIssuerIdentity(world, bond)).toBeNull();
  });

  it("accepts every corporate issuance term (96/240/336) with matching maturityTurn", () => {
    for (const maturityTurns of CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS) {
      const world = createWorld(OPTS);
      const corpId = Object.keys(world.corporations).find((k) => world.corporations[k]!.countryId === "US")!;
      const res = issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const bond = world.bonds[res.bondId]!;
      expect(bond.maturityTurn).toBe(world.meta.turn + maturityTurns);
      expect(validateBondIssuerIdentity(world, bond)).toBeNull();
    }
  });

  it("defaults coupon to prime + spread premium + term premium (AAA baseline, no rating system)", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    const corp = world.corporations[corpId]!;
    const prime = world.centralBanks[corp.countryId]?.primeRate ?? 3.0;
    expect(getCorporateCouponRate(prime, 240)).toBe(
      Math.round((prime + CORPORATE_BOND_SPREAD_PREMIUM + CORPORATE_BOND_TERM_PREMIUMS[240]!) * 100) / 100,
    );
    const res = issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns: 240 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(world.bonds[res.bondId]!.couponRate).toBe(getCorporateCouponRate(prime, 240));
  });

  it("is deterministic: same seed + same issuance yields identical bond docs", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    const corpA = Object.keys(a.corporations).find((k) => a.corporations[k]!.countryId === "US")!;
    const corpB = Object.keys(b.corporations).find((k) => b.corporations[k]!.countryId === "US")!;
    expect(corpA).toBe(corpB);
    expect(issueCorporateBond(a, corpA, { totalUnits: 50, maturityTurns: 96 })).toEqual(
      issueCorporateBond(b, corpB, { totalUnits: 50, maturityTurns: 96 }),
    );
    expect(JSON.stringify(a.bonds)).toBe(JSON.stringify(b.bonds));
  });

  it("issues for a state-owned corp carrying countryOwnerId", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    world.corporations[corpId]!.ownershipState = "stateOwned";
    world.corporations[corpId]!.countryOwnerId = "US";
    expect(isCorpStateOwned(world.corporations[corpId]!)).toBe(true);
    const res = issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns: 96 });
    expect(res.ok).toBe(true);
  });
});

// ── Invalid issuance (atomic: failures commit nothing) ──────────────
describe("issuance rejection", () => {
  it("rejects unknown corporations, bad terms, non-positive units, and duplicate ids without mutating bonds", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    const before = JSON.stringify(world.bonds);
    expect(issueCorporateBond(world, "no-such-corp", { totalUnits: 10, maturityTurns: 240 }).ok).toBe(false);
    expect(
      issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns: 48 as 48 }).ok,
    ).toBe(false);
    expect(issueCorporateBond(world, corpId, { totalUnits: 0, maturityTurns: 240 }).ok).toBe(false);
    expect(issueCorporateBond(world, corpId, { totalUnits: 2.5, maturityTurns: 240 }).ok).toBe(false);
    expect(
      issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns: 240, couponRate: -1 }).ok,
    ).toBe(false);
    expect(JSON.stringify(world.bonds)).toBe(before);

    const first = issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns: 240 });
    expect(first.ok).toBe(true);
    const afterFirst = JSON.stringify(world.bonds);
    // Same turn + same corp => deterministic id already taken, no overwrite.
    const dup = issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns: 240 });
    expect(dup.ok).toBe(false);
    expect(JSON.stringify(world.bonds)).toBe(afterFirst);
  });

  it("rejects issuance for a state-owned corp missing countryOwnerId", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    world.corporations[corpId]!.ownershipState = "stateOwned";
    delete world.corporations[corpId]!.countryOwnerId;
    const res = issueCorporateBond(world, corpId, { totalUnits: 10, maturityTurns: 96 });
    expect(res.ok).toBe(false);
    expect(Object.keys(world.bonds)).toHaveLength(0);
  });
});

// ── Issuer/owner invariants at the public seam ───────────────────────
describe("issuer/owner invariants (cite: bond.ts Bond.corporationId, corporation.ts countryOwnerId/ownershipState)", () => {
  it("rejects sovereign bonds carrying a corporationId", () => {
    const world = createWorld(OPTS);
    world.bonds["bad-sov"] = {
      id: "bad-sov",
      issuerType: "sovereign",
      corporationId: usCorpId(),
      countryId: "US",
      issuerName: "US",
      faceValue: BOND_UNIT_FACE_VALUE,
      couponRate: 3,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1.0,
      totalIssued: 10_000,
      publicFloat: 10,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    expect(validateBondIssuerIdentity(world, world.bonds["bad-sov"]!)).toMatch(/must not carry corporationId/);
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    const res = executeAction(world, "player", "buyBond", { bondId: "bad-sov", units: 1 });
    expect(res.ok).toBe(false);
  });

  it("rejects corporate bonds with unknown, mismatched, or mis-denominated issuers", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    const base = validCorporateBond(world, corpId);

    const unknown = { ...base, id: "u1", corporationId: "no-such-corp" };
    expect(validateBondIssuerIdentity(world, unknown)).toMatch(/unknown corporation/);

    const mismatched = { ...base, id: "u2", countryId: "UK" };
    expect(validateBondIssuerIdentity(world, mismatched)).toMatch(/does not match issuer/);

    const wrongTerm = { ...base, id: "u3", maturityTurns: 48 as 48, maturityTurn: base.issuedAtTurn + 48 };
    expect(validateBondIssuerIdentity(world, wrongTerm)).toMatch(/not a corporate issuance term/);

    const wrongDenom = { ...base, id: "u4", currencyCode: "XXX" };
    expect(validateBondIssuerIdentity(world, wrongDenom)).toMatch(/does not match issuer .* home currency/);

    const brokenFloat = { ...base, id: "u5", publicFloat: base.publicFloat + 1 };
    expect(validateBondIssuerIdentity(world, brokenFloat)).toMatch(/does not conserve units/);
  });

  it("rejects trades on invariant-violating corporate bonds at the action seam", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    const bond = validCorporateBond(world, corpId);
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    // Domestic corporate trade is allowed while invariants hold.
    const ok = executeAction(world, "player", "buyBond", { bondId: bond.id, units: 5 });
    expect(ok.ok).toBe(true);

    // Break conservation behind the seam's back: trade must now refuse.
    bond.publicFloat += 1;
    const bad = executeAction(world, "player", "buyBond", { bondId: bond.id, units: 1 });
    expect(bad.ok).toBe(false);
    expect((bad as { error: string }).error).toMatch(/does not conserve units/);
  });
});

// ── Owner/public-float conservation ──────────────────────────────────
describe("public float conservation", () => {
  it("buy/sell moves units between holders and float with the outstanding total fixed", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    const bond = validCorporateBond(world, corpId);
    const totalUnits = corporateBondTotalUnits(bond);
    expect(totalUnits).toBe(100);
    world.player.cash = 1_000_000;
    world.player.actions = 10;

    expect(executeAction(world, "player", "buyBond", { bondId: bond.id, units: 10 }).ok).toBe(true);
    const held = bond.holders.find((h) => h.holderId === "player")?.units ?? 0;
    expect(held).toBe(10);
    expect(bond.publicFloat).toBe(90);
    expect(held + bond.publicFloat).toBe(totalUnits);
    expect(validateBondIssuerIdentity(world, bond)).toBeNull();

    expect(executeAction(world, "player", "sellBond", { bondId: bond.id, units: 4 }).ok).toBe(true);
    const heldAfter = bond.holders.find((h) => h.holderId === "player")?.units ?? 0;
    expect(heldAfter).toBe(6);
    expect(bond.publicFloat).toBe(94);
    expect(heldAfter + bond.publicFloat).toBe(totalUnits);
    expect(validateBondIssuerIdentity(world, bond)).toBeNull();
  });

  it("corporate issues stay inert through the turn (no coupon/maturity servicing until #308)", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    const bond = validCorporateBond(world, corpId);
    const cashBefore = world.player.cash;
    for (let i = 0; i < 15; i++) advanceTurn(world);
    expect(world.bonds[bond.id]!.matured).toBe(false);
    expect(world.bonds[bond.id]!.marketPrice).toBe(1.0);
    expect(world.bonds[bond.id]!.publicFloat).toBe(100);
    expect(world.player.cash).toBe(cashBefore);
    expect(validateBondIssuerIdentity(world, world.bonds[bond.id]!)).toBeNull();
  });
});

// ── Save/reload without an envelope migration ────────────────────────
describe("save/reload", () => {
  it("preserves and reloads corporate bond state exactly", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId();
    world.corporations[corpId]!.ownershipState = "stateOwned";
    world.corporations[corpId]!.countryOwnerId = "US";
    const res = issueCorporateBond(world, corpId, { totalUnits: 25, maturityTurns: 336 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const raw = serializeSave(world, "2026-09-01T00:00:00.000Z");
    const restored = deserializeSave(raw);
    expect(JSON.stringify(restored.bonds[res.bondId])).toBe(JSON.stringify(world.bonds[res.bondId]));
    expect(restored.corporations[corpId]!.ownershipState).toBe("stateOwned");
    expect(restored.corporations[corpId]!.countryOwnerId).toBe("US");
    expect(validateBondIssuerIdentity(restored, restored.bonds[res.bondId]!)).toBeNull();
  });

  it("keeps saves without corporate state byte-stable (no new keys, no migration)", () => {
    const world = createWorld(OPTS);
    for (const bond of Object.values(world.bonds)) {
      expect("corporationId" in bond).toBe(false);
    }
    for (const corp of Object.values(world.corporations)) {
      expect("countryOwnerId" in corp).toBe(false);
      expect("ownershipState" in corp).toBe(false);
    }
    const raw = serializeSave(world, "2026-09-01T00:00:00.000Z");
    const restored = deserializeSave(raw);
    expect(serializeSave(restored, "2026-09-01T00:00:00.000Z")).toBe(raw);
  });
});
