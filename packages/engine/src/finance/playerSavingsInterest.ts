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
import { ensureCentralBankPricingPhaseIn, savingsReadsAuthoritative } from "./centralBankPricing.js";

export const playerSavingsInterestPhase: TurnPhase = {
  name: "playerSavingsInterest",
  run(world) {
    const pricing = ensureCentralBankPricingPhaseIn(world);
    const player = world.player;
    const countryId = player.countryId;
    const currency = world.budgets[countryId]?.currencyCode ?? "USD";
    const bankId = getBankId(getCountryIdForCurrency(currency));
    const primeRate = world.centralBanks[bankId]?.primeRate ?? 2.5;
    const inflationPercent = (world.countries[countryId]?.economy.inflationRate ?? 0) * 100;
    // A private-bank account in an authoritative savings currency is paid in
    // full by the bank. Other holders receive the central-bank base here;
    // private banks pay only their premium over that base in bankingTurn.
    if (player.savingsHolder !== "centralBank" && savingsReadsAuthoritative(world, currency)) return;
    const accrued = player.savings > 0
      ? computeSavingsInterestForTurn(
          player.savings,
          primeRate,
          currency,
          inflationPercent,
          pricing.depositBonusPercentPoints,
        )
      : 0;
    const pending = (player.pendingSavingsInterest ?? 0) + accrued;
    if (world.meta.turn > 0 && world.meta.turn % SAVINGS_CREDIT_INTERVAL_TURNS === 0) {
      if (!(pending > 0)) return;
      player.savings += pending;
      player.savingsInterestEarnedLifetime = (player.savingsInterestEarnedLifetime ?? 0) + pending;
      player.pendingSavingsInterest = 0;
      return;
    }
    if (accrued > 0) player.pendingSavingsInterest = pending;
  },
};
