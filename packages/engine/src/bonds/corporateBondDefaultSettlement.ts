import type { WorldState } from "../types.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { GROWTH_RATE_TURNS_PER_YEAR } from "../corporation/constants.js";
import { isCorpStateOwned, validateBondIssuerIdentity } from "./corporateBonds.js";
import { resolveBondCurrency } from "./denomination.js";
import type { Bond } from "./types.js";

/** Source: AHDGame 08820d1 nppInsolvencyDissolution.ts. */
export const LINGERING_CORPORATE_DEFAULT_GRACE_TURNS = 30;
/** Source: AHDGame 08820d1 constants/corporations.ts. */
export const CORPORATE_DISSOLUTION_SECTOR_SALVAGE_FRACTION = 0.2;
/** Source: AHDGame 08820d1 constants/corporations.ts. */
export const CORPORATE_DISSOLUTION_NPV_DISCOUNT_RATE = 0.15;

export interface CorporateDefaultSettlement {
  corporationId: string;
  bondRecoveryPool: number;
  shareholderPool: number;
  playerBondPayout: number;
  playerSharePayout: number;
  publicFloatSharePayout: number;
}

export type CorporateDefaultSettlementResult =
  | { ok: true; settlement: CorporateDefaultSettlement }
  | { ok: false; error: string };

function activeBondsFor(world: WorldState, corporationId: string): Bond[] {
  return Object.values(world.bonds ?? {}).filter(
    (bond) => bond.issuerType === "corporation" && bond.corporationId === corporationId && !bond.matured,
  );
}

function sectorNpvFor(world: WorldState, corporationId: string): number {
  const corporation = world.corporations[corporationId]!;
  const sectors = Object.values(corporateSectorAssets(world)).filter(
    (sector) => sector.corporationId === corporationId,
  );
  if (sectors.length === 0) return 0;

  // Native stores aggregate revenue and growth cost per world turn. Game's
  // dissolution formula annualizes the sector profit basis before discounting;
  // Native's corporation earnings history uses 48 world turns per year.
  const margin = corporation.effectiveProfitMargin ?? corporation.profitMargin;
  const perTurnProfit = corporation.revenue * (margin / 100) - corporation.currentGrowthCost;
  if (!(perTurnProfit > 0)) return 0;
  const annualProfit = perTurnProfit * GROWTH_RATE_TURNS_PER_YEAR;
  return annualProfit / CORPORATE_DISSOLUTION_NPV_DISCOUNT_RATE;
}

function creditPlayer(world: WorldState, bond: Bond, amount: number): void {
  if (!(amount > 0)) return;
  const homeCurrency = world.budgets[world.player.countryId]?.currencyCode?.trim() || "USD";
  const currency = resolveBondCurrency(world, bond);
  if (currency === homeCurrency) {
    world.player.cash += amount;
  } else {
    const personal = ((world.player.currencyBalances ??= { personal: {} }).personal);
    personal[currency] = (personal[currency] ?? 0) + amount;
  }
}

/**
 * Source-backed settlement for a private corporation with at least one
 * defaulted, non-matured bond. Native has one human holder, NPC equity, and
 * public float; Game-only imperial, cross-corporate, fund, FX-pool, and escrow
 * buckets have no Native state and are not fabricated here.
 */
export function settleCorporateBondDefault(
  world: WorldState,
  corporationId: string,
): CorporateDefaultSettlementResult {
  const corporation = world.corporations[corporationId];
  if (!corporation) return { ok: false, error: `Unknown corporation ${corporationId}` };
  if (isCorpStateOwned(corporation)) {
    return { ok: false, error: `State-owned corporation ${corporationId} cannot be dissolved` };
  }

  const bonds = activeBondsFor(world, corporationId);
  if (!bonds.some((bond) => bond.defaulted)) {
    return { ok: false, error: `Corporation ${corporationId} has no defaulted bond to settle` };
  }

  let totalBondClaims = 0;
  for (const bond of bonds) {
    const issuerError = validateBondIssuerIdentity(world, bond);
    if (issuerError) return { ok: false, error: issuerError };
    if (bond.currencyCode !== (world.budgets[corporation.countryId]?.currencyCode ?? "USD")) {
      return { ok: false, error: `Bond ${bond.id} is outside the Native domestic settlement currency` };
    }
    const units = bond.holders.reduce((sum, holder) => sum + holder.units, 0) + bond.publicFloat;
    if (!Number.isFinite(units) || units < 0 || !Number.isFinite(bond.faceValue) || bond.faceValue <= 0) {
      return { ok: false, error: `Bond ${bond.id} has invalid outstanding claims` };
    }
    if (!Number.isInteger(bond.totalIssued) || bond.totalIssued !== units * bond.faceValue) {
      return { ok: false, error: `Bond ${bond.id} does not conserve its outstanding creditor units` };
    }
    if (!Number.isInteger(bond.publicFloat) || bond.publicFloat < 0) {
      return { ok: false, error: `Bond ${bond.id} has invalid public float ownership` };
    }
    if (bond.holders.some((holder) => holder.units > 0 && holder.holderId !== "player")) {
      return { ok: false, error: `Bond ${bond.id} has an unsupported Native creditor holder` };
    }
    const claim = units * bond.faceValue;
    totalBondClaims += claim;
  }

  const totalShares = corporation.totalShares;
  if (!Number.isFinite(totalShares) || totalShares < 0) {
    return { ok: false, error: `Corporation ${corporationId} has invalid share count` };
  }
  if (
    !Number.isInteger(corporation.publicFloat) ||
    corporation.publicFloat < 0 ||
    corporation.shareholders.some((holder) => !Number.isInteger(holder.shares) || holder.shares < 0) ||
    corporation.shareholders.reduce((sum, holder) => sum + holder.shares, 0) + corporation.publicFloat !== totalShares
  ) {
    return { ok: false, error: `Corporation ${corporationId} does not conserve shareholder ownership` };
  }

  const sectorNpv = sectorNpvFor(world, corporationId);
  const salvagedSectorValue =
    CORPORATE_DISSOLUTION_SECTOR_SALVAGE_FRACTION * Math.max(0, sectorNpv);
  const liquidCapital = Math.max(0, corporation.liquidCapital);
  const estate = liquidCapital + salvagedSectorValue;
  const bondRecoveryPool = Math.min(estate, totalBondClaims);
  const shareholderPool = Math.max(0, estate - bondRecoveryPool);
  const bondRecoveryRatio = totalBondClaims > 0 ? bondRecoveryPool / totalBondClaims : 0;
  const resolvedPlayerBondPayout = bonds.reduce((sum, bond) => {
    const units = bond.holders
      .filter((holder) => holder.holderId === "player")
      .reduce((holderSum, holder) => holderSum + holder.units, 0);
    const face = units * bond.faceValue;
    return sum + (face > 0 ? Math.round(bondRecoveryRatio * face * 100) / 100 : 0);
  }, 0);

  const playerShares = corporation.shareholders
    .filter((holder) => holder.holder === "player")
    .reduce((sum, holder) => sum + holder.shares, 0);
  const playerSharePayout = totalShares > 0 ? Math.floor((shareholderPool * playerShares) / totalShares) : 0;
  const publicFloatSharePayout = totalShares > 0 ? Math.floor((shareholderPool * corporation.publicFloat) / totalShares) : 0;

  // Compute the whole settlement first, then apply all supported balances and
  // ownership removals together. Public-float bond recovery has no Native
  // market-pool account; public equity recovery follows Game to the CB reserve.
  const settlement: CorporateDefaultSettlement = {
    corporationId,
    bondRecoveryPool,
    shareholderPool,
    playerBondPayout: resolvedPlayerBondPayout,
    playerSharePayout,
    publicFloatSharePayout,
  };
  const homeCurrency = world.budgets[corporation.countryId]?.currencyCode?.trim() || "USD";
  if (resolvedPlayerBondPayout > 0) {
    const playerBond = bonds.find((bond) => bond.holders.some((holder) => holder.holderId === "player"))!;
    creditPlayer(world, playerBond, resolvedPlayerBondPayout);
  }
  if (playerSharePayout > 0) {
    const playerCurrency = world.budgets[world.player.countryId]?.currencyCode?.trim() || "USD";
    if (homeCurrency === playerCurrency) world.player.cash += playerSharePayout;
    else {
      const personal = ((world.player.currencyBalances ??= { personal: {} }).personal);
      personal[homeCurrency] = (personal[homeCurrency] ?? 0) + playerSharePayout;
    }
  }
  if (publicFloatSharePayout > 0) {
    const centralBank = world.centralBanks[corporation.countryId];
    if (centralBank) centralBank.reserveBalance = (centralBank.reserveBalance ?? 0) + publicFloatSharePayout;
  }

  for (const bond of bonds) delete world.bonds[bond.id];
  for (const [id, sector] of Object.entries(world.corporateSectors ?? {})) {
    if (sector.corporationId === corporationId) delete world.corporateSectors![id];
  }
  delete world.corporations[corporationId];

  return { ok: true, settlement };
}

/** Resolve NPP issuer defaults only after Game's 30-turn cure window. */
export function settleLingeringCorporateBondDefaults(world: WorldState): CorporateDefaultSettlement[] {
  const candidates = new Set<string>();
  for (const bond of Object.values(world.bonds ?? {})) {
    if (
      bond.issuerType === "corporation" &&
      bond.corporationId &&
      !bond.matured &&
      bond.defaulted &&
      bond.defaultedAtTurn !== null &&
      world.meta.turn - bond.defaultedAtTurn >= LINGERING_CORPORATE_DEFAULT_GRACE_TURNS
    ) {
      candidates.add(bond.corporationId);
    }
  }

  const settlements: CorporateDefaultSettlement[] = [];
  for (const corporationId of [...candidates].sort()) {
    const result = settleCorporateBondDefault(world, corporationId);
    if (result.ok) settlements.push(result.settlement);
  }
  return settlements;
}
