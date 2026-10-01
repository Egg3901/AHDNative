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

export interface CorporateBondSettlementClaimRecord {
  bondId: string;
  currencyCode: string;
  faceValue: number;
  totalUnits: number;
  playerUnits: number;
  publicFloatUnits: number;
  totalClaim: number;
  playerPaid: number;
  playerUnpaid: number;
  /** Game's market-pool recovery share; Native has no market-pool account to receive it. */
  publicFloatRecoveryUnposted: number;
  publicFloatUnpaid: number;
}

/** Durable liquidation evidence retained after the issuer and live bonds are removed. */
export interface CorporateBondSettlementRecord {
  /** `${corporationId}:${settledAtTurn}` is the unique idempotency key. */
  id: string;
  corporationId: string;
  countryId: string;
  currencyCode: string;
  settledAtTurn: number;
  bondIds: string[];
  bondClaims: CorporateBondSettlementClaimRecord[];
  liquidCapital: number;
  salvagedSectorValue: number;
  totalAssets: number;
  totalBondClaims: number;
  bondRecoveryPool: number;
  unpaidBondClaims: number;
  shareholderPool: number;
  playerBondPayout: number;
  playerSharePayout: number;
  publicFloatSharePayout: number;
  /** Native has NPC share units but no NPC personal-wallet destination. */
  npcSharePayoutUnposted: number;
}

export type CorporateDefaultSettlementResult =
  | { ok: true; settlement: CorporateDefaultSettlement }
  | { ok: false; error: string };

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Strict save-boundary validation for the append-only default settlement ledger. */
export function validateCorporateBondSettlementLedger(value: unknown): asserts value is CorporateBondSettlementRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid corporate bond settlement ledger");
  const ids = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid corporate bond settlement record");
    const record = raw as Record<string, unknown>;
    const id = record["id"];
    const corporationId = record["corporationId"];
    const settledAtTurn = record["settledAtTurn"];
    if (
      typeof id !== "string" ||
      typeof corporationId !== "string" ||
      !Number.isInteger(settledAtTurn) ||
      id !== `${corporationId}:${settledAtTurn}` ||
      ids.has(id)
    ) {
      throw new Error("Invalid or duplicate corporate bond settlement id");
    }
    ids.add(id);
    if (
      typeof record["countryId"] !== "string" ||
      typeof record["currencyCode"] !== "string" ||
      !Array.isArray(record["bondIds"]) ||
      !Array.isArray(record["bondClaims"]) ||
      record["bondIds"].length !== record["bondClaims"].length
    ) {
      throw new Error(`Invalid corporate bond settlement record ${id}`);
    }
    for (const key of [
      "liquidCapital",
      "salvagedSectorValue",
      "totalAssets",
      "totalBondClaims",
      "bondRecoveryPool",
      "unpaidBondClaims",
      "shareholderPool",
      "playerBondPayout",
      "playerSharePayout",
      "publicFloatSharePayout",
      "npcSharePayoutUnposted",
    ]) {
      if (!finiteNonNegative(record[key])) throw new Error(`Invalid corporate bond settlement ${key} in ${id}`);
    }
    const seenBonds = new Set<string>();
    let claimTotal = 0;
    for (const rawClaim of record["bondClaims"]) {
      if (!rawClaim || typeof rawClaim !== "object") throw new Error(`Invalid bond claim in ${id}`);
      const claim = rawClaim as Record<string, unknown>;
      const bondId = claim["bondId"];
      if (typeof bondId !== "string" || seenBonds.has(bondId) || !record["bondIds"].includes(bondId)) {
        throw new Error(`Invalid or duplicate bond claim in ${id}`);
      }
      seenBonds.add(bondId);
      for (const key of [
        "faceValue",
        "totalUnits",
        "playerUnits",
        "publicFloatUnits",
        "totalClaim",
        "playerPaid",
        "playerUnpaid",
        "publicFloatRecoveryUnposted",
        "publicFloatUnpaid",
      ]) {
        if (!finiteNonNegative(claim[key])) throw new Error(`Invalid bond claim ${key} in ${id}`);
      }
      if (
        typeof claim["currencyCode"] !== "string" ||
        claim["totalUnits"] !== (claim["playerUnits"] as number) + (claim["publicFloatUnits"] as number) ||
        claim["totalClaim"] !== (claim["totalUnits"] as number) * (claim["faceValue"] as number) ||
        (claim["playerPaid"] as number) > (claim["playerUnits"] as number) * (claim["faceValue"] as number) ||
        (claim["playerPaid"] as number) + (claim["playerUnpaid"] as number) !==
          (claim["playerUnits"] as number) * (claim["faceValue"] as number) ||
        (claim["publicFloatRecoveryUnposted"] as number) >
          (claim["publicFloatUnits"] as number) * (claim["faceValue"] as number) ||
        (claim["publicFloatRecoveryUnposted"] as number) + (claim["publicFloatUnpaid"] as number) !==
          (claim["publicFloatUnits"] as number) * (claim["faceValue"] as number)
      ) {
        throw new Error(`Inconsistent bond claim in ${id}`);
      }
      claimTotal += claim["totalClaim"] as number;
    }
    if (claimTotal !== record["totalBondClaims"]) {
      throw new Error(`Corporate bond settlement claims do not sum in ${id}`);
    }
  }
}

function activeBondsFor(world: WorldState, corporationId: string): Bond[] {
  return Object.values(world.bonds ?? {}).filter(
    (bond) => bond.issuerType === "corporation" && bond.corporationId === corporationId && !bond.matured,
  );
}

function homeCurrencyFor(world: WorldState, corporation: WorldState["corporations"][string]): string {
  return world.budgets[corporation.countryId]?.currencyCode?.trim() || "USD";
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

  const sectorAssets = Object.values(corporateSectorAssets(world)).filter(
    (sector) => sector.corporationId === corporationId,
  );
  if (sectorAssets.some((sector) => sector.owner === "player")) {
    return { ok: false, error: `Corporation ${corporationId} has a player-owned sector that Native cannot restore` };
  }
  if (
    !Number.isFinite(corporation.revenue) ||
    !Number.isFinite(corporation.effectiveProfitMargin ?? corporation.profitMargin) ||
    !Number.isFinite(corporation.currentGrowthCost) ||
    !Number.isFinite(corporation.liquidCapital)
  ) {
    return { ok: false, error: `Corporation ${corporationId} has non-finite liquidation inputs` };
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
    if (!Array.isArray(bond.holders) || bond.holders.some((holder) => !finiteNonNegative(holder.units))) {
      return { ok: false, error: `Bond ${bond.id} has invalid holder claims` };
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
    if (!Number.isFinite(totalBondClaims) || !Number.isFinite(claim)) {
      return { ok: false, error: `Bond ${bond.id} has non-finite total claims` };
    }
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
  if (!Number.isFinite(sectorNpv) || !Number.isFinite(totalBondClaims)) {
    return { ok: false, error: `Corporation ${corporationId} has non-finite settlement valuation` };
  }
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
  const npcShares = corporation.shareholders
    .filter((holder) => holder.holder === "npc")
    .reduce((sum, holder) => sum + holder.shares, 0);
  const npcSharePayoutUnposted = totalShares > 0 ? Math.floor((shareholderPool * npcShares) / totalShares) : 0;

  if (![salvagedSectorValue, liquidCapital, estate, bondRecoveryPool, shareholderPool,
    resolvedPlayerBondPayout, playerSharePayout, publicFloatSharePayout, npcSharePayoutUnposted].every(Number.isFinite)) {
    return { ok: false, error: `Corporation ${corporationId} has non-finite settlement proceeds` };
  }
  const centralBank = world.centralBanks[corporation.countryId];
  if (publicFloatSharePayout > 0 && !centralBank) {
    return { ok: false, error: `Corporation ${corporationId} has a public-float payout but no central bank reserve` };
  }
  if (publicFloatSharePayout > 0 && !Number.isFinite(centralBank!.reserveBalance ?? 0)) {
    return { ok: false, error: `Corporation ${corporationId} has an invalid central bank reserve` };
  }

  const playerCurrency = world.budgets[world.player.countryId]?.currencyCode?.trim() || "USD";
  const playerCashPayout = homeCurrencyFor(world, corporation) === playerCurrency
    ? resolvedPlayerBondPayout + playerSharePayout
    : 0;
  if (playerCashPayout > 0) {
    if (!Number.isFinite(world.player.cash) || !Number.isFinite(world.player.cash + playerCashPayout)) {
      return { ok: false, error: `Player has invalid cash for corporate default settlement` };
    }
  }
  if (playerSharePayout > 0 && homeCurrencyFor(world, corporation) !== playerCurrency) {
    const existingBalance = world.player.currencyBalances?.personal?.[homeCurrencyFor(world, corporation)];
    if (existingBalance !== undefined && (!Number.isFinite(existingBalance) || !Number.isFinite(existingBalance + playerSharePayout))) {
      return { ok: false, error: `Player has an invalid ${homeCurrencyFor(world, corporation)} balance` };
    }
  }
  if (resolvedPlayerBondPayout > 0) {
    const currency = resolveBondCurrency(world, bonds.find((bond) => bond.holders.some((holder) => holder.holderId === "player"))!);
    const existingBalance = world.player.currencyBalances?.personal?.[currency];
    if (currency !== playerCurrency && existingBalance !== undefined &&
      (!Number.isFinite(existingBalance) || !Number.isFinite(existingBalance + resolvedPlayerBondPayout))) {
      return { ok: false, error: `Player has an invalid ${currency} balance` };
    }
  }

  const unownedPoolKey = `${corporation.countryId}:${corporation.sectorType}`;
  const unownedPool = world.unownedSectors[unownedPoolKey];
  if (sectorAssets.length > 0 && !Number.isFinite((unownedPool?.revenue ?? 0) + Math.max(0, corporation.revenue))) {
    return { ok: false, error: `Unowned sector pool ${unownedPoolKey} cannot accept restored revenue` };
  }
  if (publicFloatSharePayout > 0 && !Number.isFinite((centralBank?.reserveBalance ?? 0) + publicFloatSharePayout)) {
    return { ok: false, error: `Corporation ${corporationId} public-float payout overflows the central bank reserve` };
  }

  const settledAtTurn = world.meta.turn;
  const settlementId = `${corporationId}:${settledAtTurn}`;
  if ((world.corporateBondSettlementLedger ?? []).some((record) => record.id === settlementId)) {
    return { ok: false, error: `Corporate default ${settlementId} was already settled` };
  }
  const bondClaims: CorporateBondSettlementClaimRecord[] = [...bonds]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((bond) => {
      const playerUnits = bond.holders
        .filter((holder) => holder.holderId === "player")
        .reduce((sum, holder) => sum + holder.units, 0);
      const totalUnits = bond.holders.reduce((sum, holder) => sum + holder.units, 0) + bond.publicFloat;
      const totalClaim = totalUnits * bond.faceValue;
      const playerClaim = playerUnits * bond.faceValue;
      const publicFloatClaim = bond.publicFloat * bond.faceValue;
      const playerPaid = playerUnits > 0 ? Math.round(bondRecoveryRatio * playerClaim * 100) / 100 : 0;
      const publicFloatRecoveryUnposted = bond.publicFloat > 0
        ? Math.round(bondRecoveryRatio * publicFloatClaim * 100) / 100
        : 0;
      return {
        bondId: bond.id,
        currencyCode: bond.currencyCode,
        faceValue: bond.faceValue,
        totalUnits,
        playerUnits,
        publicFloatUnits: bond.publicFloat,
        totalClaim,
        playerPaid,
        playerUnpaid: Math.max(0, playerClaim - playerPaid),
        publicFloatRecoveryUnposted,
        publicFloatUnpaid: Math.max(0, publicFloatClaim - publicFloatRecoveryUnposted),
      };
    });
  const ledgerRecord: CorporateBondSettlementRecord = {
    id: settlementId,
    corporationId,
    countryId: corporation.countryId,
    currencyCode: world.budgets[corporation.countryId]?.currencyCode?.trim() || "USD",
    settledAtTurn,
    bondIds: bondClaims.map((claim) => claim.bondId),
    bondClaims,
    liquidCapital,
    salvagedSectorValue,
    totalAssets: estate,
    totalBondClaims,
    bondRecoveryPool,
    unpaidBondClaims: Math.max(0, totalBondClaims - bondRecoveryPool),
    shareholderPool,
    playerBondPayout: resolvedPlayerBondPayout,
    playerSharePayout,
    publicFloatSharePayout,
    npcSharePayoutUnposted,
  };

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
  const homeCurrency = homeCurrencyFor(world, corporation);
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
    centralBank!.reserveBalance = (centralBank!.reserveBalance ?? 0) + publicFloatSharePayout;
  }

  if (sectorAssets.length > 0) {
    // Native's one-sector-per-corporation, pre-plants model has no separate
    // CorporateSector revenue row. Its aggregate corporation revenue is the
    // source-backed legacy revenue returned to the country/sector pool.
    const pool = (world.unownedSectors[unownedPoolKey] ??= {
      countryId: corporation.countryId,
      sectorType: corporation.sectorType,
      revenue: 0,
    });
    pool.revenue += Math.max(0, corporation.revenue);
  }

  (world.corporateBondSettlementLedger ??= []).push(ledgerRecord);
  world.news.push({
    id: `corporate-bond-default-settled:${settlementId}`,
    turn: settledAtTurn,
    date: world.meta.date,
    headline: "Corporate bond default settled",
    body: `${corporationId} settled ${bondRecoveryPool} of ${totalBondClaims} ${ledgerRecord.currencyCode} in bond claims; ${ledgerRecord.unpaidBondClaims} remained unpaid.`,
    category: "Corporate bond default",
    countryId: corporation.countryId,
  });

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
    const corporation = world.corporations[corporationId];
    // Legacy Native corporations are all seeded NPP issuers, so an absent
    // ceoType preserves that meaning. Explicit player CEOs and suspended
    // issuers never enter the source's automatic NPP dissolution path.
    if (
      !corporation ||
      isCorpStateOwned(corporation) ||
      corporation.suspended === true ||
      (corporation.ceoType !== undefined && corporation.ceoType !== "npp")
    ) continue;
    const result = settleCorporateBondDefault(world, corporationId);
    if (result.ok) settlements.push(result.settlement);
  }
  return settlements;
}
