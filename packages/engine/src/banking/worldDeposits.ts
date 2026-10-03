import type { Corporation } from "../corporation/types.js";
import type { WorldState } from "../types.js";
import { savingsReadsAuthoritative } from "../finance/centralBankPricing.js";

export interface WorldBankDeposits {
  /** Player balance whose holder pointer names this domestic bank. */
  playerDeposits: number;
  /** Portion of that balance included in source cash-backed liabilities. */
  authoritativePlayerDeposits: number;
  /** NPC plus authoritative player liabilities, for source balance-sheet consumers. */
  cashBackedDeposits: number;
}

/** Derive the single-player deposit leg from existing world state, never the stale charter cache. */
export function worldBankDeposits(world: WorldState, corp: Corporation): WorldBankDeposits {
  const charter = corp.bankCharter;
  if (!charter) return { playerDeposits: 0, authoritativePlayerDeposits: 0, cashBackedDeposits: 0 };

  const sameDomesticHolder =
    world.player.countryId === corp.countryId && world.player.savingsHolder === corp.id;
  const playerDeposits = sameDomesticHolder && Number.isFinite(world.player.savings)
    ? Math.max(0, world.player.savings)
    : 0;
  const currency = world.budgets[corp.countryId]?.currencyCode ?? world.exchangeRates[corp.countryId]?.currencyCode;
  const authoritativePlayerDeposits = currency && savingsReadsAuthoritative(world, currency)
    ? playerDeposits
    : 0;

  return {
    playerDeposits,
    authoritativePlayerDeposits,
    cashBackedDeposits: Math.max(0, charter.npcDeposits) + authoritativePlayerDeposits,
  };
}
