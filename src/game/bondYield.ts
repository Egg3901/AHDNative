/**
 * Bond display math for the market visual.
 *
 * Source-grounded, no history invented. The yield formula is verbatim from
 * AHDGame `src/lib/constants/bonds.ts` `calculateBondYieldToMaturityPercent`
 * (coupon in percent, market price as a fraction of par, 48 turns per game
 * year from `src/lib/constants/turnTime.ts`), also copied verbatim into the
 * Native engine at `packages/engine/src/bonds/constants.ts`. Every other
 * helper here is plain arithmetic over the already-projected `BondListing`
 * fields (face, coupon, price, maturity turn, float, holdings).
 */

/** Game turns per year. Source: AHDGame `src/lib/constants/turnTime.ts`. */
export const BOND_TURNS_PER_YEAR = 48;

/**
 * Approximate yield-to-maturity as an annual percent.
 * Verbatim port of AHDGame `calculateBondYieldToMaturityPercent`.
 */
export function bondYieldToMaturityPercent(
  couponRate: number,
  marketPrice: number,
  turnsRemaining: number,
): number {
  if (marketPrice <= 0 || turnsRemaining <= 0) return 0;
  const yearsRemaining = turnsRemaining / BOND_TURNS_PER_YEAR;
  if (yearsRemaining <= 0) return 0;
  return ((couponRate / 100 + (1 - marketPrice) / yearsRemaining) / marketPrice) * 100;
}

/** Turns until maturity, clamped at zero past maturity. */
export function bondTurnsRemaining(maturityTurn: number, turn: number): number {
  return Math.max(0, maturityTurn - turn);
}

/** Annual coupon payout for one unit, in the bond's own currency. */
export function annualCouponPerUnit(faceValue: number, couponRate: number): number {
  return (couponRate / 100) * faceValue;
}

/** Plain price-against-par label. A defaulted issue trades at recovery value. */
export function priceVsParLabel(marketPrice: number, defaulted: boolean): string {
  if (defaulted) return 'Recovery price';
  if (marketPrice > 1) return 'Above par';
  if (marketPrice < 1) return 'Below par';
  return 'At par';
}

/**
 * Outstanding-unit split. The solo engine tracks the player holder plus the
 * NPC public float (`packages/engine/src/bonds/types.ts`), so the total is
 * exactly those two — no per-holder roster is invented.
 */
export function ownershipShare(playerUnits: number, publicFloat: number): { total: number; playerPct: number } {
  const total = playerUnits + publicFloat;
  if (total <= 0) return { total: 0, playerPct: 0 };
  return { total, playerPct: (playerUnits / total) * 100 };
}
