import { describe, expect, it, beforeEach } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { BOND_UNIT_FACE_VALUE } from "./constants.js";
import { resetBondIdSequenceForTests } from "./bondTurn.js";
import { issueCorporateBond } from "./corporateBonds.js";
import { settleCorporateBondDefault, settleLingeringCorporateBondDefaults } from "./corporateBondDefaultSettlement.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { executeAction } from "../actions/execute.js";
import { sourceUnownedHeadroomUnits } from "../corporation/nppCapacityReinvestment.js";
import { getEraNominalScale } from "../commodity/constants.js";

const OPTS = { seed: "bond-phase-order", playerName: "Tester", countryId: "US", era: "1953" } as const;
const CORP_ID = "US-manufacturing";

beforeEach(() => resetBondIdSequenceForTests());

function twinWorlds() {
  const a = createWorld(OPTS);
  const b = createWorld(OPTS);
  return [a, b] as const;
}

function craftCorporate(
  world: ReturnType<typeof createWorld>,
  opts: { units: number; couponRate: number; held: number },
  corporationId = CORP_ID,
) {
  const res = issueCorporateBond(world, corporationId, {
    totalUnits: opts.units,
    maturityTurns: 96,
    couponRate: opts.couponRate,
  });
  expect(res.ok).toBe(true);
  const bond = world.bonds[res.ok ? res.bondId : ""]!;
  bond.holders = [{ holderId: "player", units: opts.held }];
  bond.publicFloat = opts.units - opts.held;
  return bond;
}

describe("corporate default at the public seam", () => {
  it("settles an owned corporate bond fund claim into cash and removes both custody rows", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-fund-claim" });
    const corp = world.corporations[CORP_ID]!;
    corp.ceoType = "npp";
    corp.revenue = 0;
    corp.profitMargin = 0;
    corp.effectiveProfitMargin = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 10_000;
    const bond = craftCorporate(world, { units: 10_000, couponRate: 4800, held: 0 });
    const fund = world.indexFundBook!.funds.global_corporate_ig!;
    bond.defaulted = true;
    bond.defaultedAtTurn = 0;
    bond.holders = [{ holderId: `index-fund:${fund.slug}`, units: 1_000 }];
    bond.publicFloat = 9_000;
    fund.bondHoldings ??= {};
    fund.bondHoldings[bond.id] = { units: 1_000, averageCostPerUnitAnchor: 1_000, lastValueAnchor: 1_000_000 };
    world.meta.turn = 30;
    const cashBefore = fund.cashAnchor;

    const result = settleCorporateBondDefault(world, CORP_ID);

    expect(result.ok).toBe(true);
    expect(fund.cashAnchor).toBe(cashBefore + 1_000);
    expect(fund.bondHoldings[bond.id]).toBeUndefined();
    expect(world.indexFundBook!.transactions).toContainEqual(expect.objectContaining({
      fundSlug: fund.slug, kind: "bondDefaultReceipt", bondId: bond.id, units: 1_000, cashAnchor: 1_000,
    }));
    expect(world.corporateBondSettlementLedger![0]!.bondClaims[0]!.fundClaims).toEqual([
      { fundSlug: fund.slug, units: 1_000, paidLocal: 1_000, unpaidLocal: 999_000 },
    ]);
    const restored = deserializeSave(serializeSave(world, "2026-10-03T15:00:00.000Z"));
    expect(restored.indexFundBook!.funds[fund.slug]!.cashAnchor).toBe(fund.cashAnchor);
    expect(restored.corporateBondSettlementLedger).toEqual(world.corporateBondSettlementLedger);
  });

  it("pays and removes the actual fund equity shareholder on corporate dissolution", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-fund-equity" });
    const corp = world.corporations[CORP_ID]!;
    corp.revenue = 0;
    corp.profitMargin = 0;
    corp.effectiveProfitMargin = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 20_000_000;
    const fund = world.indexFundBook!.funds.global_top_50!;
    const shares = 1_000_000;
    corp.shareholders.push({ holder: "fund", fundSlug: fund.slug, shares, avgCostPerShare: 1 });
    corp.publicFloat -= shares;
    fund.holdings[CORP_ID] = { shares, averageCostPerShare: 1, lastValueAnchor: shares };
    const bond = craftCorporate(world, { units: 10_000, couponRate: 4800, held: 0 });
    bond.defaulted = true;
    bond.defaultedAtTurn = 0;
    world.meta.turn = 30;
    const fundCashBefore = fund.cashAnchor;

    const result = settleCorporateBondDefault(world, CORP_ID);

    expect(result.ok).toBe(true);
    expect(result.ok && result.settlement.fundSharePayoutAnchor).toBe(1_000_000);
    expect(fund.cashAnchor).toBe(fundCashBefore + 1_000_000);
    expect(fund.holdings[CORP_ID]).toBeUndefined();
    expect(world.indexFundBook!.transactions).toContainEqual(expect.objectContaining({
      fundSlug: fund.slug, corporationId: CORP_ID, kind: "equityLiquidationReceipt", units: shares, cashAnchor: 1_000_000,
    }));
    const restored = deserializeSave(serializeSave(world, "2026-10-03T15:00:00.000Z"));
    expect(restored.indexFundBook!.funds[fund.slug]!.holdings[CORP_ID]).toBeUndefined();
    expect(restored.corporateBondSettlementLedger![0]!.fundSharePayouts).toEqual([
      { fundSlug: fund.slug, shares, payoutAnchor: 1_000_000 },
    ]);
  });

  it("freezes the paper with zero flows when the issuer cannot cover the turn", () => {
    const [a, b] = twinWorlds();
    // Coupon 4800%/yr => 1000/unit/turn; 200M units => 200B obligation,
    // far above the ~101B post-corporationTurn capital, so servicing defaults.
    const bond = craftCorporate(a, { units: 200_000_000, couponRate: 4800, held: 5 });

    advanceTurn(a);
    advanceTurn(b);

    const after = a.bonds[bond.id]!;
    expect(after.defaulted).toBe(true);
    expect(after.defaultedAtTurn).toBe(a.meta.turn);
    expect(after.marketPrice).toBe(0.1);
    expect(after.matured).toBe(false);
    // Atomic zero-flow default: no issuer debit, no holder credit.
    expect(a.corporations[CORP_ID]!.liquidCapital).toBe(b.corporations[CORP_ID]!.liquidCapital);
    expect(a.player.cash).toBe(b.player.cash);
    // Holdings frozen on the paper.
    expect(after.holders.find((h) => h.holderId === "player")?.units).toBe(5);
  });

  it("settles a lingering NPP default from the liquidation estate and clears creditor holdings", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-estate" });
    const corp = world.corporations[CORP_ID]!;
    corp.ceoType = "npp";
    corp.revenue = 0;
    corp.profitMargin = 0;
    corp.effectiveProfitMargin = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 10_000;
    const sectorId = Object.values(corporateSectorAssets(world)).find(
      (asset) => asset.corporationId === CORP_ID,
    )!.id;
    const bond = craftCorporate(world, { units: 10_000, couponRate: 4800, held: 1_000 });

    advanceTurn(world);
    expect(world.bonds[bond.id]!.defaulted).toBe(true);
    expect(world.corporations[CORP_ID]).toBeDefined();
    expect(world.corporateSectors![sectorId]).toBeDefined();

    // Game's lingering NPP default rule settles after 30 turns. The real
    // ordinary turn before liquidation updates issuer cash, so payout is
    // derived from the actual saved settlement inputs rather than the pre-turn
    // $10,000 fixture balance. Source: Game fff42a4 corporateBondDefault.ts
    // previewDissolveSettlement + executeCorporationBondDefaultDissolution.
    world.meta.turn = bond.defaultedAtTurn! + 29;
    const cashBeforeSettlement = world.player.cash;
    let cashAtBondPhase = world.player.cash;
    advanceTurn(world, {
      afterPhase(name, state) {
        if (name === "bondCouponMaturity") {
          cashAtBondPhase = state.player.cash;
        }
      },
    });

    const settlementLedger = world.corporateBondSettlementLedger![0]!;
    const claim = settlementLedger.bondClaims[0]!;
    const sourceRecoveryRatio = settlementLedger.bondRecoveryPool / settlementLedger.totalBondClaims;
    const expectedPlayerBondPayout = Math.round(sourceRecoveryRatio * claim.playerUnits * claim.faceValue * 100) / 100;
    const expectedFloatRecovery = Math.round(sourceRecoveryRatio * claim.publicFloatUnits * claim.faceValue * 100) / 100;
    expect(cashAtBondPhase - cashBeforeSettlement).toBe(expectedPlayerBondPayout);
    expect(claim.playerPaid).toBe(expectedPlayerBondPayout);
    expect(world.corporations[CORP_ID]).toBeUndefined();
    expect(world.corporateSectors![sectorId]).toBeUndefined();
    expect(world.bonds[bond.id]).toBeUndefined();
    expect(world.corporateBondSettlementLedger).toMatchObject([
      {
        id: `${CORP_ID}:${bond.defaultedAtTurn! + 30}`,
        corporationId: CORP_ID,
        settledAtTurn: bond.defaultedAtTurn! + 30,
        bondClaims: [
          {
            bondId: bond.id,
            playerUnits: 1_000,
            playerPaid: expectedPlayerBondPayout,
            playerUnpaid: 1_000_000 - expectedPlayerBondPayout,
            publicFloatUnits: 9_000,
            publicFloatRecoveryUnposted: expectedFloatRecovery,
          },
        ],
      },
    ]);
    expect(world.news.filter((item) => item.id === `corporate-bond-default-settled:${CORP_ID}:${bond.defaultedAtTurn! + 30}`)).toHaveLength(1);
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(restored.corporations[CORP_ID]).toBeUndefined();
    expect(restored.corporateSectors![sectorId]).toBeUndefined();
    expect(restored.bonds[bond.id]).toBeUndefined();
    expect(restored.player.cash).toBe(world.player.cash);
    expect(restored.corporateBondSettlementLedger).toEqual(world.corporateBondSettlementLedger);
  });

  it("pays Native player bond and equity claims and returns public equity float to the country reserve", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-claimants" });
    const corp = world.corporations[CORP_ID]!;
    corp.revenue = 0;
    corp.profitMargin = 0;
    corp.effectiveProfitMargin = 0;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 1_000_000;
    const playerShares = 1_000;
    corp.shareholders = [
      { holder: "npc", shares: corp.totalShares - corp.publicFloat - playerShares },
      { holder: "player", shares: playerShares, avgCostPerShare: 1 },
    ];
    const bond = craftCorporate(world, { units: 100, couponRate: 4800, held: 10 });
    bond.defaulted = true;
    bond.defaultedAtTurn = world.meta.turn;
    const playerCashBefore = world.player.cash;
    const reserveBefore = world.centralBanks[corp.countryId]!.reserveBalance ?? 0;

    const result = settleCorporateBondDefault(world, CORP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    // Source waterfall: bond claim = 100 × $1,000; liquid estate = $1m;
    // bondholders take $100k first, leaving $900k for shareholders.
    expect(result.settlement.bondRecoveryPool).toBe(100_000);
    expect(result.settlement.shareholderPool).toBe(900_000);
    expect(result.settlement.playerBondPayout).toBe(10_000);
    expect(result.settlement.playerSharePayout).toBe(900_000 * playerShares / corp.totalShares);
    expect(result.settlement.publicFloatSharePayout).toBe(900_000 * corp.publicFloat / corp.totalShares);
    expect(world.corporateBondSettlementLedger?.[0]?.npcSharePayoutUnposted).toBe(
      Math.floor(900_000 * corp.shareholders.find((holder) => holder.holder === "npc")!.shares / corp.totalShares),
    );
    expect(world.player.cash - playerCashBefore).toBe(
      result.settlement.playerBondPayout + result.settlement.playerSharePayout,
    );
    expect(world.centralBanks[corp.countryId]!.reserveBalance).toBe(
      reserveBefore + result.settlement.publicFloatSharePayout,
    );
    expect(world.bonds[bond.id]).toBeUndefined();
    expect(world.corporations[CORP_ID]).toBeUndefined();
  });

  it("restores dissolved sector revenue to the unowned pool using the source NPV waterfall", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-positive-npv" });
    const corp = world.corporations[CORP_ID]!;
    const sector = Object.values(corporateSectorAssets(world)).find((asset) => asset.corporationId === CORP_ID)!;
    corp.revenue = 1_000_000;
    corp.profitMargin = 10;
    corp.effectiveProfitMargin = 10;
    corp.currentGrowthCost = 0;
    corp.liquidCapital = 100_000;
    const bond = craftCorporate(world, { units: 1, couponRate: 4800, held: 1 });
    bond.defaulted = true;
    bond.defaultedAtTurn = world.meta.turn;
    const poolKey = `${corp.countryId}:${corp.sectorType}`;
    const unownedBefore = world.unownedSectors[poolKey]!.revenue;
    const playerCashBefore = world.player.cash;

    const result = settleCorporateBondDefault(world, CORP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    // Immutable oracle: AHDGame 08820d1 `src/lib/bonds/corporateBondDefault.ts`
    // computes NPV as yearly profit / NPV_ANNUAL_DISCOUNT_RATE; yearly profit
    // is `dailyProfitAnchor / TURNS_PER_DAY * TURNS_PER_YEAR`. `src/lib/constants/
    // corporations.ts` pins the discount to 15% and dissolution salvage to 20%.
    // Native adapts its per-turn-only sector basis: ₳1m × 10% × 48 turns/year
    // gives ₳32m NPV and ₳6.4m salvage, senior to the single ₳1k bond claim.
    expect(result.settlement.bondRecoveryPool).toBe(1_000);
    expect(result.settlement.shareholderPool).toBe(6_499_000);
    expect(world.corporateBondSettlementLedger?.at(-1)?.salvagedSectorValue).toBe(6_400_000);
    // Native's legacy unowned pool carries local per-turn revenue. The Game
    // restore helper credits it before deleting the sector row.
    expect(world.unownedSectors[poolKey]!.revenue).toBe(unownedBefore + corp.revenue);
    expect(world.corporateSectors![sector.id]).toBeUndefined();
    expect(world.player.cash).toBeGreaterThan(playerCashBefore);
  });

  it("returns a publicly acquired located plant to its source regional pool on default", () => {
    const world = createWorld({ ...OPTS, homeRegionId: "VA", seed: "located-corporate-default" });
    world.player.cash = 1_000_000;
    const startingCapital = Math.round(20_000_000 * getEraNominalScale(world.meta.era));
    const founded = executeAction(world, "player", "foundCorporation", {
      corporationName: "District Works",
      tickerSymbol: "DIST",
      sectorType: "manufacturing",
      startingCapital,
    });
    expect(founded.ok, JSON.stringify(founded)).toBe(true);
    const corp = Object.values(world.corporations).find((row) => row.tickerSymbol === "DIST")!;
    const regionalKey = "US:VA:manufacturing";
    const nationalKey = "US:manufacturing";
    const regionalPool = world.unownedSectors[regionalKey]!;
    const headroomBefore = sourceUnownedHeadroomUnits(world, regionalPool);

    const expanded = executeAction(world, "player", "expandCorporationSector", {
      corporationId: corp.id,
      regionId: "VA",
      sectorType: "manufacturing",
    });
    expect(expanded.ok, JSON.stringify(expanded)).toBe(true);
    const asset = Object.values(corporateSectorAssets(world)).find((row) => row.corporationId === corp.id)!;
    expect(asset.stateId).toBe("VA");
    expect(sourceUnownedHeadroomUnits(world, regionalPool)).toBeLessThan(headroomBefore);
    const bond = craftCorporate(world, { units: 1, couponRate: 4800, held: 1 }, corp.id);
    bond.defaulted = true;
    bond.defaultedAtTurn = world.meta.turn;

    const result = settleCorporateBondDefault(world, corp.id);

    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    expect(sourceUnownedHeadroomUnits(world, regionalPool)).toBeCloseTo(headroomBefore, 8);
    expect(world.unownedSectors[nationalKey]).toBeUndefined();
    expect(world.corporateSectors![asset.id]).toBeUndefined();

    const reloaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(reloaded.unownedSectors[regionalKey]).toEqual(world.unownedSectors[regionalKey]);
    expect(reloaded.corporateSectors?.[asset.id]).toBeUndefined();
  });

  it("rejects an unsupported player-owned sector before settling any claimant", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-player-sector" });
    const corp = world.corporations[CORP_ID]!;
    const asset = Object.values(corporateSectorAssets(world)).find((row) => row.corporationId === CORP_ID)!;
    asset.owner = "player";
    corp.liquidCapital = 1_000_000;
    const bond = craftCorporate(world, { units: 1, couponRate: 4800, held: 1 });
    bond.defaulted = true;
    bond.defaultedAtTurn = world.meta.turn;
    const cashBefore = world.player.cash;
    const poolBefore = world.unownedSectors[`${corp.countryId}:${corp.sectorType}`]!.revenue;

    const result = settleCorporateBondDefault(world, CORP_ID);

    expect(result.ok).toBe(false);
    expect(world.corporations[CORP_ID]).toBe(corp);
    expect(world.corporateSectors![asset.id]).toEqual(asset);
    expect(world.bonds[bond.id]).toBe(bond);
    expect(world.player.cash).toBe(cashBefore);
    expect(world.unownedSectors[`${corp.countryId}:${corp.sectorType}`]!.revenue).toBe(poolBefore);
    expect(world.corporateBondSettlementLedger).toBeUndefined();
  });

  it("rejects a public-float payout without a central bank and leaves the estate unchanged", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-no-central-bank" });
    const corp = world.corporations[CORP_ID]!;
    corp.liquidCapital = 1_000_000;
    const bond = craftCorporate(world, { units: 1, couponRate: 4800, held: 0 });
    bond.defaulted = true;
    bond.defaultedAtTurn = world.meta.turn;
    delete world.centralBanks[corp.countryId];
    const cashBefore = world.player.cash;

    const result = settleCorporateBondDefault(world, CORP_ID);

    expect(result.ok).toBe(false);
    expect(world.corporations[CORP_ID]).toBe(corp);
    expect(world.bonds[bond.id]).toBe(bond);
    expect(world.player.cash).toBe(cashBefore);
    expect(world.corporateBondSettlementLedger).toBeUndefined();
  });

  it("auto-dissolves only unsuspended NPP issuers after the source grace window", () => {
    for (const issuerState of [
      { ceoType: "player" as const, suspended: false },
      { ceoType: "npp" as const, suspended: true },
      { ceoType: "npp" as const, suspended: false },
      { ceoType: "npp" as const, suspended: false, ownershipState: "stateOwned" as const, countryOwnerId: "US" },
    ]) {
      const world = createWorld({ ...OPTS, seed: `corporate-default-eligibility-${issuerState.ceoType}-${issuerState.suspended}` });
      const corp = world.corporations[CORP_ID]!;
      Object.assign(corp, issuerState);
      corp.liquidCapital = 0;
      const bond = craftCorporate(world, { units: 1, couponRate: 4800, held: 0 });
      bond.defaulted = true;
      bond.defaultedAtTurn = world.meta.turn - 30;
      world.meta.turn = bond.defaultedAtTurn + 30;

      const settlements = settleLingeringCorporateBondDefaults(world);

      const stateOwned = "ownershipState" in issuerState && issuerState.ownershipState === "stateOwned";
      if (issuerState.ceoType === "npp" && !issuerState.suspended && !stateOwned) {
        expect(settlements).toHaveLength(1);
        expect(world.corporations[CORP_ID]).toBeUndefined();
      } else {
        expect(settlements).toHaveLength(0);
        expect(world.corporations[CORP_ID]).toBe(corp);
        expect(world.bonds[bond.id]).toBe(bond);
      }
    }
  });

  it("spares a private NPP issuer under a soft command-economy budget and dissolves under a hard one", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-soft-budget-ru" });
    const corporation = Object.values(world.corporations).find((row) => row.countryId === "RU")!;
    // Fresh RU issuers now record their source SOE ownership. This case
    // deliberately represents a private NPP firm in that same economy;
    // state-owned issuers remain excluded from automatic dissolution.
    corporation.ownershipState = "private";
    delete corporation.countryOwnerId;
    delete corporation.soe;
    corporation.liquidCapital = 0;
    world.commandEconomy.RU!.budgetSoftness = 0.85;
    const bond = craftCorporate(world, { units: 1, couponRate: 4800, held: 0 }, corporation.id);
    bond.defaulted = true;
    bond.defaultedAtTurn = world.meta.turn - 30;
    world.meta.turn = bond.defaultedAtTurn + 30;

    expect(settleLingeringCorporateBondDefaults(world)).toEqual([]);
    expect(world.corporations[corporation.id]).toBe(corporation);
    expect(world.bonds[bond.id]).toBe(bond);

    world.commandEconomy.RU!.budgetSoftness = 0.49;
    expect(settleLingeringCorporateBondDefaults(world)).toHaveLength(1);
    expect(world.corporations[corporation.id]).toBeUndefined();
  });

  it("caps automatic dissolution at the source limit of 25 corporations per turn", () => {
    const world = createWorld({ ...OPTS, seed: "corporate-default-dissolution-cap" });
    const template = world.corporations[CORP_ID]!;
    const corps: string[] = [];
    for (let index = 0; index < 26; index++) {
      const corporationId = `test-default-${String(index).padStart(2, "0")}`;
      world.corporations[corporationId] = {
        ...template,
        id: corporationId,
        ceoType: "npp",
        liquidCapital: -index,
      };
      const bond = craftCorporate(world, { units: 1, couponRate: 4800, held: 0 }, corporationId);
      bond.defaulted = true;
      bond.defaultedAtTurn = world.meta.turn - 30;
      corps.push(corporationId);
    }
    world.meta.turn += 30;

    const settlements = settleLingeringCorporateBondDefaults(world);

    expect(settlements).toHaveLength(25);
    expect(corps.filter((id) => world.corporations[id] !== undefined)).toHaveLength(1);
    expect(world.corporateBondSettlementLedger).toHaveLength(25);
  });

  it("rejects foreign-denominated claims and non-finite estate cash without partial settlement", () => {
    const foreignWorld = createWorld({ ...OPTS, seed: "corporate-default-foreign-claim" });
    const foreignBond = craftCorporate(foreignWorld, { units: 1, couponRate: 4800, held: 1 });
    foreignBond.defaulted = true;
    foreignBond.defaultedAtTurn = foreignWorld.meta.turn;
    foreignBond.currencyCode = "GBP";
    const foreignCorp = foreignWorld.corporations[CORP_ID]!;
    const foreignCashBefore = foreignWorld.player.cash;
    const foreignResult = settleCorporateBondDefault(foreignWorld, CORP_ID);
    expect(foreignResult.ok).toBe(false);
    expect(foreignWorld.corporations[CORP_ID]).toBe(foreignCorp);
    expect(foreignWorld.bonds[foreignBond.id]).toBe(foreignBond);
    expect(foreignWorld.player.cash).toBe(foreignCashBefore);
    expect(foreignWorld.corporateBondSettlementLedger).toBeUndefined();

    const invalidWorld = createWorld({ ...OPTS, seed: "corporate-default-nonfinite-cash" });
    const invalidBond = craftCorporate(invalidWorld, { units: 1, couponRate: 4800, held: 1 });
    invalidBond.defaulted = true;
    invalidBond.defaultedAtTurn = invalidWorld.meta.turn;
    const invalidCorp = invalidWorld.corporations[CORP_ID]!;
    invalidCorp.liquidCapital = Number.NaN;
    const invalidPlayerCash = invalidWorld.player.cash;
    const invalidResult = settleCorporateBondDefault(invalidWorld, CORP_ID);
    expect(invalidResult.ok).toBe(false);
    expect(invalidWorld.corporations[CORP_ID]).toBe(invalidCorp);
    expect(invalidWorld.bonds[invalidBond.id]).toBe(invalidBond);
    expect(invalidWorld.player.cash).toBe(invalidPlayerCash);
    expect(invalidWorld.corporateBondSettlementLedger).toBeUndefined();
  });
});
