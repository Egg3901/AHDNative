/**
 * WorldState projection of AHDGame's savingsInterestTurn.
 *
 * Native currently exposes one home-currency savings balance. Interest on a
 * private-bank-held balance remains the responsibility of bankingTurn; this
 * phase handles only the central-bank holder and therefore cannot double pay.
 */
import type { TurnPhase } from "../phases/types.js";
import { computeSavingsInterestForTurn, SAVINGS_CREDIT_INTERVAL_TURNS } from "./savingsInterest.js";

export const playerSavingsInterestPhase: TurnPhase = {
  name: "playerSavingsInterest",
  run(world) {
    const player = world.player;
    if (player.savingsHolder !== "centralBank" || !(player.savings > 0)) return;

    const countryId = player.countryId;
    const currency = world.budgets[countryId]?.currencyCode ?? "USD";
    const primeRate = world.centralBanks[countryId]?.primeRate ?? 2.5;
    const inflationPercent = (world.countries[countryId]?.economy.inflationRate ?? 0) * 100;
    const accrued = computeSavingsInterestForTurn(player.savings, primeRate, currency, inflationPercent);
    if (!(accrued > 0)) return;

    const pending = (player.pendingSavingsInterest ?? 0) + accrued;
    if (world.meta.turn > 0 && world.meta.turn % SAVINGS_CREDIT_INTERVAL_TURNS === 0) {
      player.savings += pending;
      player.savingsInterestEarnedLifetime = (player.savingsInterestEarnedLifetime ?? 0) + pending;
      player.pendingSavingsInterest = 0;
      return;
    }
    player.pendingSavingsInterest = pending;
  },
};
