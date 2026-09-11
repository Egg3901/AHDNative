/**
 * Turn-window order-flow pricing for the solo market.
 *
 * Source: AHDGame `src/lib/corporations/orderFlowEngine.ts` and
 * `src/lib/corporations/marketExecution.ts`. Native has one player rather
 * than a wall-clock trade stream, so successful buy/sell actions accumulate
 * their executed notional here and the end-of-turn market phase consumes the
 * window once, then clears it.
 */

/** A corporation needs at least this public-float fraction for the signal. */
export const MIN_ORDER_FLOW_FLOAT_FRACTION = 0.05;

/** Maximum absolute deviation from 1.0 for the order-flow multiplier. */
export const ORDER_FLOW_CAP = 0.15;

/** Fraction of prior multiplier deviation retained by the next turn. */
export const ORDER_FLOW_MEAN_REVERSION = 0.8;

export function isOrderFlowPriceEligible(
  publicFloat: number | null | undefined,
  totalShares: number | null | undefined,
): boolean {
  if (!Number.isFinite(totalShares) || (totalShares ?? 0) <= 0) return true;
  return (publicFloat ?? 0) / (totalShares ?? 1) >= MIN_ORDER_FLOW_FLOAT_FRACTION;
}

/**
 * Compute the next source-shaped order-flow multiplier.
 *
 *   carry = (previous - 1) × mean reversion
 *   pressure = (buy window - sell window) / (public float × price)
 *   liquidity = 1 / (1 + sqrt(public float / total shares))
 *   result = 1 + clamp(carry + pressure × liquidity, -cap, +cap)
 */
export function computeOrderFlowMultiplier(
  windowBuyValue: number,
  windowSellValue: number,
  publicFloat: number,
  sharePrice: number,
  totalShares: number,
  previousMultiplier: number,
): number {
  if (!isOrderFlowPriceEligible(publicFloat, totalShares)) return 1;

  const previous = Number.isFinite(previousMultiplier) ? previousMultiplier : 1;
  const carry = (previous - 1) * ORDER_FLOW_MEAN_REVERSION;
  const floatValue = publicFloat * sharePrice;
  if (!(floatValue > 0) || !(totalShares > 0)) {
    return 1 + clampOrderFlow(carry);
  }

  const netPressure =
    (Math.max(0, Number.isFinite(windowBuyValue) ? windowBuyValue : 0) -
      Math.max(0, Number.isFinite(windowSellValue) ? windowSellValue : 0)) /
    floatValue;
  const liquidityFactor = 1 / (1 + Math.sqrt(publicFloat / totalShares));
  return 1 + clampOrderFlow(carry + netPressure * liquidityFactor);
}

function clampOrderFlow(value: number): number {
  return Math.max(-ORDER_FLOW_CAP, Math.min(ORDER_FLOW_CAP, value));
}
