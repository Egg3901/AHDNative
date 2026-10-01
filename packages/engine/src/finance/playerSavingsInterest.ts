/**
 * WorldState projection of AHDGame's savingsInterestTurn.
 *
 * Native currently exposes one home-currency savings balance. This phase
 * accrues the source central-bank base for central-bank and pointer-held
 * deposits, skipping private-bank holders only when the savings account book
 * is authoritative. bankingTurn then pays the private-bank premium.
 */
import type { TurnPhase } from "../phases/types.js";
import {
  computeSavingsInterestForTurn,
  SAVINGS_CREDIT_INTERVAL_TURNS,
  getBankId,
  getCountryIdForCurrency,
} from "./savingsInterest.js";
import {
  ensureCentralBankPricingPhaseIn,
  savingsReadsAuthoritative,
} from "./centralBankPricing.js";

export const playerSavingsInterestPhase: TurnPhase = {
  name: "playerSavingsInterest",
  run(world) {
    validateNationalSavingsPools(world);
    if (!Number.isFinite(world.player.savings)) {
      throw new Error("Invalid player savings balance for interest accrual");
    }
    const pricing = ensureCentralBankPricingPhaseIn(world);
    const player = world.player;
    const countryId = player.countryId;
    const currency = world.budgets[countryId]?.currencyCode ?? "USD";
    const bankId = getBankId(getCountryIdForCurrency(currency));
    const primeRate = world.centralBanks[bankId]?.primeRate ?? 2.5;
    // Game's savingsInterestTurn reads the latest settled CB inflationHistory
    // point. Native's equivalent authoritative value is the budget rate left
    // by the previous turn's inflationRecalc; the new current-turn rate is not
    // written until much later in the pipeline.
    const inflationPercent =
      world.budgets[countryId]?.economicFactors.inflationRate ?? 0;
    // Mainline snapshots the prior-turn national pool before writing the new
    // aggregate at the end of savingsInterestTurn. Native has one player
    // savings book, so its source-equivalent aggregate is that book in the
    // currency's issuing bank; absent legacy snapshots use the source 0
    // fallback (which makes the full balance eligible for that first turn).
    const priorPool = world.centralBanks[bankId]?.nationalSavingsBalance ?? 0;
    const oldBalance = player.savings;
    const eligibleBalance =
      oldBalance > 0
        ? Math.min(oldBalance, priorPool > 0 ? 0.25 * priorPool : oldBalance)
        : 0;
    // A private-bank account in an authoritative savings currency is paid in
    // full by the bank. Other holders receive the central-bank base here;
    // private banks pay only their premium over that base in bankingTurn.
    if (
      player.savingsHolder !== "centralBank" &&
      savingsReadsAuthoritative(world, currency)
    ) {
      refreshNativeSavingsPool(world, bankId, oldBalance);
      return;
    }
    const accrued =
      eligibleBalance > 0
        ? computeSavingsInterestForTurn(
            eligibleBalance,
            primeRate,
            currency,
            inflationPercent,
            pricing.depositBonusPercentPoints,
          )
        : 0;
    refreshNativeSavingsPool(world, bankId, oldBalance);
    const pending = (player.pendingSavingsInterest ?? 0) + accrued;
    if (
      world.meta.turn > 0 &&
      world.meta.turn % SAVINGS_CREDIT_INTERVAL_TURNS === 0
    ) {
      if (!(pending > 0)) return;
      player.savings += pending;
      player.savingsInterestEarnedLifetime =
        (player.savingsInterestEarnedLifetime ?? 0) + pending;
      player.pendingSavingsInterest = 0;
      return;
    }
    if (accrued > 0) player.pendingSavingsInterest = pending;
  },
};

export function validateNationalSavingsPools(
  world: import("../types.js").WorldState,
): void {
  for (const [id, bank] of Object.entries(world.centralBanks)) {
    const value = bank.nationalSavingsBalance;
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    ) {
      throw new Error(`Invalid national savings pool on central bank ${id}`);
    }
  }
}

/** Persist the source's pre-interest, pre-credit aggregate for the next turn. */
function refreshNativeSavingsPool(
  world: import("../types.js").WorldState,
  homeBankId: string,
  homeBalance: number,
): void {
  const poolBalance = Math.round(Math.max(0, homeBalance) * 100) / 100;
  for (const [id, bank] of Object.entries(world.centralBanks)) {
    bank.nationalSavingsBalance = id === homeBankId ? poolBalance : 0;
  }
}
