import type { WorldState } from "../types.js";

export const CENTRAL_BANK_LOC_SPREAD_HIKE_PERCENT_POINTS = 2;
export const CENTRAL_BANK_DEPOSIT_BONUS_PERCENT_POINTS = 0.25;
export const CENTRAL_BANK_PRICING_PHASE_IN_TURNS = 8;

export interface CentralBankPricingAdjustment {
  spreadHikePercentPoints: number;
  depositBonusPercentPoints: number;
  progress: number;
  turnsRemaining: number;
  startedTurn: number;
}

function roundPricingValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Port of AHDGame src/lib/monetaryPolicy/centralBankPricing.ts. */
export function resolveCentralBankPricingAdjustment(
  currentTurn: number,
  startedTurn: number,
): CentralBankPricingAdjustment {
  const current = Number.isFinite(currentTurn) ? currentTurn : 0;
  const start = Number.isFinite(startedTurn) ? startedTurn : current;
  const progress = Math.min(1, Math.max(0, (current - start) / CENTRAL_BANK_PRICING_PHASE_IN_TURNS));
  return {
    spreadHikePercentPoints: roundPricingValue(CENTRAL_BANK_LOC_SPREAD_HIKE_PERCENT_POINTS * progress),
    depositBonusPercentPoints: roundPricingValue(CENTRAL_BANK_DEPOSIT_BONUS_PERCENT_POINTS * progress),
    progress: roundPricingValue(progress),
    turnsRemaining: Math.max(0, Math.ceil(start + CENTRAL_BANK_PRICING_PHASE_IN_TURNS - current)),
    startedTurn: start,
  };
}

/**
 * Game's startup migration anchors rollout to the current turn before turn
 * work begins. Native runs one world at a time, so the immediately prior
 * world turn is the equivalent anchor on first use. Keeping this optional
 * leaves untouched and historical saves byte-stable.
 */
export function ensureCentralBankPricingPhaseIn(
  world: WorldState,
  currentTurn = world.meta.turn,
): CentralBankPricingAdjustment {
  const recorded = world.centralBankPricingPhaseIn?.startedTurn;
  if (recorded === undefined) {
    world.centralBankPricingPhaseIn = { startedTurn: Math.max(0, currentTurn - 1) };
  }
  const startedTurn = world.centralBankPricingPhaseIn!.startedTurn;
  if (!Number.isFinite(startedTurn) || startedTurn < 0) {
    throw new Error("Invalid central-bank pricing phase start turn");
  }
  return resolveCentralBankPricingAdjustment(currentTurn, startedTurn);
}

/** Game savingsAccountsMode/read-currency policy; absent means rollout off. */
export function savingsReadsAuthoritative(world: WorldState, currency: string): boolean {
  return (
    world.savingsAccountsPolicy?.mode === "authoritative" &&
    Array.isArray(world.savingsAccountsPolicy.readCurrencies) &&
    world.savingsAccountsPolicy.readCurrencies.includes(currency)
  );
}
