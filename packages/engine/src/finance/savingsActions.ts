/**
 * Player savings actions — W35.
 *
 * Ports the three savings-management endpoints W12 (private banking) shipped
 * state for (player.savings/savingsHolder) but never wired a player-facing
 * action to move: src/app/api/character/savings/deposit/route.ts (+ its
 * withdraw sibling) and src/app/api/character/savings-holder/route.ts
 * moveCharacterSavings. Cited directly in W12's own file doc (types.ts
 * PlayerCharacter.savingsHolder): "No in-game action currently moves this
 * away from centralBank... the mechanism is real and tested even though it
 * is only reachable via a save edit or cheat today." This wave closes that
 * gap with real actions.
 *
 * Native exposes one home-currency savings balance. Holder selection uses
 * the shared active/deposit-taking capability and country-budget currency
 * match, and the cached ceiling. Returning to the central bank remains
 * available when private banking is disabled. Blacklists and authoritative
 * cash-backed player-deposit settlement remain parent gaps (#76/#109/#111).
 */
import type { WorldState } from "../types.js";
import { bankCurrency, charterMay } from "../banking/capabilities.js";

export type SavingsActionResult = { ok: true } | { ok: false; error: string };

/** Move liquid cash into savings. Ports the deposit route's core balance move. */
export function depositToSavings(world: WorldState, amount: number): SavingsActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid amount" };
  const player = world.player;
  if (player.cash < amount) return { ok: false, error: `Insufficient cash. Available: ${player.cash}` };
  player.cash -= amount;
  player.savings += amount;
  return { ok: true };
}

/** Move savings back into liquid cash. Ports the withdraw route's core balance move. */
export function withdrawFromSavings(world: WorldState, amount: number): SavingsActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid amount" };
  const player = world.player;
  if (player.savings < amount) return { ok: false, error: `Insufficient savings. Available: ${player.savings}` };
  player.savings -= amount;
  player.cash += amount;
  return { ok: true };
}

/**
 * Move the savings pointer to a new holder. Ports moveCharacterSavings
 * validation (charter status + deposit ceiling), scoped to solo's
 * single-currency player.savings.
 */
export function moveSavingsHolder(world: WorldState, holder: string): SavingsActionResult {
  const player = world.player;
  if (holder === "centralBank") {
    player.savingsHolder = "centralBank";
    return { ok: true };
  }
  const bank = world.corporations[holder];
  if (!bank) return { ok: false, error: "Bank corporation not found" };
  if (!bank.bankCharter || !world.featureFlags.banking || !charterMay(bank.bankCharter, "acceptPlayerDeposits")) {
    return { ok: false, error: "Target bank must have an active deposit-taking charter" };
  }
  const currency = world.budgets[player.countryId]?.currencyCode ?? world.exchangeRates[player.countryId]?.currencyCode;
  if (!currency || bankCurrency(world, bank) !== currency) return { ok: false, error: "Bank and savings must have the same currency" };
  if (player.savingsHolder !== holder) {
    const ceiling = bank.bankCharter.depositCeiling;
    const projected = bank.bankCharter.totalDeposits + player.savings;
    if (projected > ceiling) {
      return { ok: false, error: `${bank.tickerSymbol}'s deposit capacity is full (ceiling ${ceiling})` };
    }
  }
  player.savingsHolder = holder;
  return { ok: true };
}
