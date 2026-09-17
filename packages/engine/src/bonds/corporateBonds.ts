import type { WorldState } from "../types.js";
import type { Bond, BondMaturityTurns } from "./types.js";
import type { Corporation } from "../corporation/types.js";
import { resolveCountryCurrency } from "./denomination.js";
import { BOND_UNIT_FACE_VALUE } from "./constants.js";

/**
 * Corporate bond issuer/state slice — #307.
 *
 * Source: AHDGame e364c0495 `src/lib/db/types/bond.ts`,
 * `src/lib/api/schemas/bonds.ts` (issueBondSchema),
 * `src/lib/constants/bonds.ts` (corporate spreads/term premiums),
 * `src/lib/corporations/issueRelocationBond.ts` (issuance doc shape),
 * `src/lib/currency/corporationCapital.ts` (resolveCorpLiquidCurrencyCode),
 * `src/lib/db/types/corporation.ts` (countryOwnerId, ownershipState).
 *
 * Scope: corporate issuance identity, owner/public-float representation,
 * denomination, and maturity terms, plus issuer/owner invariant enforcement at
 * the public engine seam. Explicitly out of scope: coupons, buybacks,
 * defaults, restructuring (#308) and phase writer/consumer timing (#309).
 * Corporate bonds are inert state until #308: the turn cash-flow phases skip
 * them (see bondTurn.ts).
 */

// ── Source-backed terms ─────────────────────────────────────────────
// New corporate bond issuance: minimum 2 game years, then 5yr and 7yr.
// Source: bond.ts CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS.
export const CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS: readonly BondMaturityTurns[] = [
  96, 240, 336,
];

// Source: constants/bonds.ts CORPORATE_BOND_SPREAD_PREMIUM.
export const CORPORATE_BOND_SPREAD_PREMIUM = 1.0;

// Source: constants/bonds.ts CORPORATE_BOND_TERM_PREMIUMS.
export const CORPORATE_BOND_TERM_PREMIUMS: Record<BondMaturityTurns, number> = {
  48: 0,
  96: 0,
  240: 1.0,
  336: 1.75,
};

/**
 * Canonical state-ownership reader. Source: nationalCorporation.ts
 * `isStateOwned()` — state-owned when a countryOwnerId is present OR
 * ownershipState is "stateOwned" (absence of ownershipState alone means
 * "private" only when no countryOwnerId is set). Never branch on the raw
 * field.
 */
export function isCorpStateOwned(corp: Pick<Corporation, "countryOwnerId" | "ownershipState">): boolean {
  return !!corp.countryOwnerId || corp.ownershipState === "stateOwned";
}

/**
 * Baseline corporate coupon rate: primeRate + CORPORATE_BOND_SPREAD_PREMIUM +
 * term premium, rounded to 2 dp. Source: constants/bonds.ts getBondCouponRate
 * with the AAA rating spread (0) — solo has no credit-rating system, so every
 * issue prices at the top-tier baseline and per-rating spreads arrive with
 * the #308 credit work. Coupon CASH FLOWS are #308 regardless of this rate.
 */
export function getCorporateCouponRate(primeRate: number, maturityTurns: BondMaturityTurns): number {
  const termPremium = CORPORATE_BOND_TERM_PREMIUMS[maturityTurns] ?? 0;
  return Math.round((primeRate + CORPORATE_BOND_SPREAD_PREMIUM + termPremium) * 100) / 100;
}

/**
 * Home currency for a corporation's bonds. Source: issueRelocationBond.ts
 * stamps `currencyCode` from the corp's liquid currency
 * (resolveCorpLiquidCurrencyCode), which itself falls back to the corp
 * country's currency when the corp carries no explicit code. Solo corps carry
 * no separate currency field, so the country fallback IS the resolution here —
 * identical to resolveCountryCurrency.
 */
export function resolveCorporateBondCurrency(
  world: Pick<WorldState, "budgets">,
  corp: Pick<Corporation, "countryId">,
): string {
  return resolveCountryCurrency(world, corp.countryId);
}

/** Total whole units outstanding: tracked holders + market float. */
export function corporateBondTotalUnits(bond: Pick<Bond, "totalIssued" | "faceValue">): number {
  return Math.floor(bond.totalIssued / bond.faceValue);
}

function holderUnits(bond: Pick<Bond, "holders">): number {
  return bond.holders.reduce((sum, h) => sum + (h.units ?? 0), 0);
}

/**
 * Issuer/owner invariant check for one bond doc. Returns an error string, or
 * null when the bond's issuer identity is consistent. Single entry point for
 * the public seam:
 *  - sovereign bonds are passthrough (source sovereign docs DO carry a
 *    corporationId — sovereign.ts stamps the country corporation's id — so
 *    the seam takes no opinion on that field);
 *  - corporate bonds must name an existing corporation in the same country,
 *    use a corporate issuance maturity with a matching maturityTurn, carry
 *    the issuer's home denomination, keep a consistent state-ownership pair,
 *    and conserve units (holders + publicFloat == total units).
 */
export function validateBondIssuerIdentity(
  world: Pick<WorldState, "corporations" | "budgets">,
  bond: Bond,
): string | null {
  if (bond.issuerType === "sovereign") {
    return null;
  }
  if (bond.issuerType !== "corporation") {
    return `Bond ${bond.id} has unknown issuerType ${(bond as Bond).issuerType}`;
  }
  const corpId = bond.corporationId;
  if (!corpId) {
    return `Corporate bond ${bond.id} is missing its issuing corporationId`;
  }
  const corp = world.corporations[corpId];
  if (!corp) {
    return `Corporate bond ${bond.id} names unknown corporation ${corpId}`;
  }
  if (bond.countryId !== corp.countryId) {
    return `Corporate bond ${bond.id} country ${bond.countryId} does not match issuer ${corpId} country ${corp.countryId}`;
  }
  if (!CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS.includes(bond.maturityTurns)) {
    return `Corporate bond ${bond.id} maturity ${bond.maturityTurns} is not a corporate issuance term (96, 240, 336)`;
  }
  if (bond.maturityTurn !== bond.issuedAtTurn + bond.maturityTurns) {
    return `Corporate bond ${bond.id} maturityTurn ${bond.maturityTurn} does not match issuedAtTurn ${bond.issuedAtTurn} + ${bond.maturityTurns}`;
  }
  if (bond.faceValue !== BOND_UNIT_FACE_VALUE) {
    return `Corporate bond ${bond.id} faceValue ${bond.faceValue} must equal the bond unit ${BOND_UNIT_FACE_VALUE}`;
  }
  if (!Number.isInteger(bond.totalIssued) || bond.totalIssued <= 0 || bond.totalIssued % bond.faceValue !== 0) {
    return `Corporate bond ${bond.id} totalIssued ${bond.totalIssued} must be a positive whole number of units`;
  }
  const expectedCurrency = resolveCorporateBondCurrency(world, corp);
  if (!bond.currencyCode || bond.currencyCode !== expectedCurrency) {
    return `Corporate bond ${bond.id} denomination ${bond.currencyCode || "(missing)"} does not match issuer ${corpId} home currency ${expectedCurrency}`;
  }
  if (corp.ownershipState !== undefined && corp.ownershipState !== "private" && corp.ownershipState !== "stateOwned") {
    return `Corporate bond ${bond.id} issuer ${corpId} has invalid ownershipState ${corp.ownershipState}`;
  }
  if (isCorpStateOwned(corp) && !corp.countryOwnerId) {
    return `Corporate bond ${bond.id} issuer ${corpId} is state-owned but has no countryOwnerId`;
  }
  const totalUnits = corporateBondTotalUnits(bond);
  const held = holderUnits(bond);
  if (!Number.isInteger(bond.publicFloat) || bond.publicFloat < 0) {
    return `Corporate bond ${bond.id} publicFloat ${bond.publicFloat} must be a non-negative whole number of units`;
  }
  if (held < 0 || held + bond.publicFloat !== totalUnits) {
    return `Corporate bond ${bond.id} does not conserve units: holders ${held} + float ${bond.publicFloat} != outstanding ${totalUnits}`;
  }
  for (const h of bond.holders) {
    if (!Number.isInteger(h.units) || h.units < 0) {
      return `Corporate bond ${bond.id} holder ${h.holderId} units ${h.units} must be a non-negative whole number`;
    }
  }
  return null;
}

export interface CorporateBondIssueParams {
  /** Whole units to issue; totalIssued = units × 1,000. */
  totalUnits: number;
  /** Corporate issuance term: 96, 240, or 336 turns. */
  maturityTurns: BondMaturityTurns;
  /** Annual coupon rate (%). Defaults to the AAA-baseline corporate rate off prime. */
  couponRate?: number;
}

export type IssueCorporateBondResult = { ok: true; bondId: string } | { ok: false; error: string };

function corporateBondIdFor(turn: number, corporationId: string): string {
  return `cbond-${turn}-${corporationId}`;
}

/**
 * Issue one corporate bond series for an existing corporation. Deterministic
 * (id derives from turn + corp id, no RNG) and atomic: every input and
 * issuer/owner invariant is validated before any state is touched, then the
 * single bond doc is committed. The full float starts in publicFloat with no
 * tracked holders (source: issueRelocationBond.ts holders: [], publicFloat:
 * totalUnits), so owner/public-float conservation holds from issuance.
 */
export function issueCorporateBond(
  world: WorldState,
  corporationId: string,
  params: CorporateBondIssueParams,
): IssueCorporateBondResult {
  const corp = world.corporations[corporationId];
  if (!corp) {
    return { ok: false, error: `Unknown corporation ${corporationId}` };
  }
  if (!Number.isInteger(params.totalUnits) || params.totalUnits <= 0) {
    return { ok: false, error: `Corporate bond issuance requires a positive whole number of units, got ${params.totalUnits}` };
  }
  if (!CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS.includes(params.maturityTurns)) {
    return {
      ok: false,
      error: `Corporate bond maturity must be 96 (2yr), 240 (5yr), or 336 (7yr), got ${params.maturityTurns}`,
    };
  }
  const bank = world.centralBanks[corp.countryId];
  const primeRate = bank?.primeRate ?? 3.0;
  const couponRate = params.couponRate ?? getCorporateCouponRate(primeRate, params.maturityTurns);
  if (!Number.isFinite(couponRate) || couponRate <= 0) {
    return { ok: false, error: `Corporate bond couponRate must be a positive finite rate, got ${params.couponRate}` };
  }
  if (corp.ownershipState !== undefined && corp.ownershipState !== "private" && corp.ownershipState !== "stateOwned") {
    return { ok: false, error: `Corporation ${corporationId} has invalid ownershipState ${corp.ownershipState}` };
  }
  if (isCorpStateOwned(corp) && !corp.countryOwnerId) {
    return { ok: false, error: `Corporation ${corporationId} is state-owned but has no countryOwnerId` };
  }

  const turn = world.meta.turn;
  const id = corporateBondIdFor(turn, corporationId);
  if (world.bonds[id]) {
    return { ok: false, error: `Corporate bond ${id} already exists for this turn` };
  }

  const totalIssued = params.totalUnits * BOND_UNIT_FACE_VALUE;
  const nowIso = world.meta.date;
  const bond: Bond = {
    id,
    issuerType: "corporation",
    corporationId,
    countryId: corp.countryId,
    issuerName: corporationId,
    faceValue: BOND_UNIT_FACE_VALUE,
    couponRate,
    maturityTurns: params.maturityTurns,
    issuedAtTurn: turn,
    maturityTurn: turn + params.maturityTurns,
    marketPrice: 1.0,
    totalIssued,
    publicFloat: params.totalUnits,
    holders: [],
    matured: false,
    defaulted: false,
    defaultedAtTurn: null,
    currencyCode: resolveCorporateBondCurrency(world, corp),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const identityError = validateBondIssuerIdentity(world, bond);
  if (identityError) {
    return { ok: false, error: identityError };
  }
  world.bonds[id] = bond;
  return { ok: true, bondId: id };
}
