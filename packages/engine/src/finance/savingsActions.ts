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
 * available when private banking is disabled. Explicit source-authoritative
 * writes move backing cash with the balance; absent/off policy retains
 * legacy pointer-only behavior.
 */
import type { WorldState } from "../types.js";
import { bankCurrency, charterMay } from "../banking/capabilities.js";
import { worldBankDeposits } from "../banking/worldDeposits.js";

export type SavingsActionResult = { ok: true } | { ok: false; error: string };

/** Move liquid cash into savings. Ports the deposit route's core balance move. */
export function depositToSavings(world: WorldState, amount: number): SavingsActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid amount" };
  const player = world.player;
  if (player.cash < amount) return { ok: false, error: `Insufficient cash. Available: ${player.cash}` };
  if (writesAuthoritativeSavings(world)) {
    const holder = currentHolder(world);
    if (!holder.ok) return holder;
    if (holder.bank && (
      !world.featureFlags.banking ||
      !holder.bank.bankCharter ||
      !charterMay(holder.bank.bankCharter, "acceptPlayerDeposits")
    )) {
      return { ok: false, error: "The savings holder is not accepting deposits" };
    }
    if (holder.bank?.bankCharter) {
      const deposits = worldBankDeposits(world, holder.bank);
      if (holder.bank.bankCharter.npcDeposits + deposits.playerDeposits + amount > holder.bank.bankCharter.depositCeiling + 1e-9) {
        return { ok: false, error: `${holder.bank.tickerSymbol}'s deposit capacity is full (ceiling ${holder.bank.bankCharter.depositCeiling})` };
      }
    }
    player.cash -= amount;
    player.savings += amount;
    if (holder.bank?.bankCharter) holder.bank.bankCharter.cashReserves += amount;
    else {
      const centralBank = world.centralBanks[player.countryId];
      if (!centralBank) return { ok: false, error: "Central bank not found" };
      centralBank.externalBroadMoney += amount;
    }
    return { ok: true };
  }
  player.cash -= amount;
  player.savings += amount;
  return { ok: true };
}

/** Move savings back into liquid cash. Ports the withdraw route's core balance move. */
export function withdrawFromSavings(world: WorldState, amount: number): SavingsActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid amount" };
  const player = world.player;
  const authoritative = writesAuthoritativeSavings(world);
  if (authoritative && amount > player.savings + 1e-9) {
    return { ok: false, error: `Insufficient savings. Available: ${player.savings}` };
  }
  const actual = authoritative ? Math.min(amount, Math.max(0, player.savings)) : amount;
  if (player.savings < actual) return { ok: false, error: `Insufficient savings. Available: ${player.savings}` };
  if (writesAuthoritativeSavings(world)) {
    const holder = currentHolder(world);
    if (!holder.ok) return holder;
    const available = holder.bank?.bankCharter?.cashReserves ?? world.centralBanks[player.countryId]?.externalBroadMoney;
    if (available === undefined) return { ok: false, error: "Savings holder cash is unavailable" };
    if (actual > available + 1e-9) return { ok: false, error: `Savings holder can pay at most ${Math.max(0, available)}` };
    if (holder.bank?.bankCharter) holder.bank.bankCharter.cashReserves = Math.max(0, available - actual);
    else world.centralBanks[player.countryId]!.externalBroadMoney = Math.max(0, available - actual);
  }
  player.savings -= actual;
  player.cash += actual;
  return { ok: true };
}

/**
 * Move the savings pointer to a new holder. Ports moveCharacterSavings
 * validation (charter status + deposit ceiling), scoped to solo's
 * single-currency player.savings.
 */
export function moveSavingsHolder(world: WorldState, holder: string): SavingsActionResult {
  const player = world.player;
  if (world.savingsAccountsPolicy?.mode === "authoritative") {
    return moveAuthoritativeSavingsHolder(world, holder);
  }
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

function writesAuthoritativeSavings(world: WorldState): boolean {
  return world.featureFlags?.foreignExchange !== false && world.savingsAccountsPolicy?.mode === "authoritative";
}

function currentHolder(world: WorldState): { ok: true; bank?: import("../corporation/types.js").Corporation } | { ok: false; error: string } {
  const holderId = world.player.savingsHolder;
  if (holderId === "centralBank") {
    return world.centralBanks[world.player.countryId]
      ? { ok: true }
      : { ok: false, error: "Central bank not found" };
  }
  const bank = world.corporations[holderId];
  const currency = world.budgets[world.player.countryId]?.currencyCode ?? world.exchangeRates[world.player.countryId]?.currencyCode;
  if (!bank?.bankCharter || !currency || bank.countryId !== world.player.countryId || bankCurrency(world, bank) !== currency) {
    return { ok: false, error: "Savings holder is unavailable for the player's currency" };
  }
  return { ok: true, bank };
}

function moveAuthoritativeSavingsHolder(world: WorldState, holderId: string): SavingsActionResult {
  const player = world.player;
  if (!world.featureFlags.banking) return { ok: false, error: "Private banking is not enabled" };
  const source = currentHolder(world);
  if (!source.ok) return source;
  const sourceCash = source.bank?.bankCharter?.cashReserves ?? world.centralBanks[player.countryId]!.externalBroadMoney;
  const amount = Math.max(0, player.savings);
  if (holderId === player.savingsHolder) return { ok: true };
  if (amount > sourceCash + 1e-9) return { ok: false, error: "Savings holder cannot transfer the full balance right now" };

  const destination = holderId === "centralBank" ? undefined : world.corporations[holderId];
  if (holderId !== "centralBank") {
    const currency = world.budgets[player.countryId]?.currencyCode ?? world.exchangeRates[player.countryId]?.currencyCode;
    if (!destination?.bankCharter || !world.featureFlags.banking || !charterMay(destination.bankCharter, "acceptPlayerDeposits")) {
      return { ok: false, error: "Target bank must have an active deposit-taking charter" };
    }
    if (destination.countryId !== player.countryId || !currency || bankCurrency(world, destination) !== currency) {
      return { ok: false, error: "Bank and savings must have the same currency" };
    }
    const playerAlreadyIncluded = destination.id === player.savingsHolder ? amount : 0;
    const deposits = worldBankDeposits(world, destination);
    const projected = destination.bankCharter.npcDeposits + deposits.playerDeposits - playerAlreadyIncluded + amount;
    if (projected > destination.bankCharter.depositCeiling + 1e-9) {
      return { ok: false, error: `${destination.tickerSymbol}'s deposit capacity is full (ceiling ${destination.bankCharter.depositCeiling})` };
    }
  } else if (!world.centralBanks[player.countryId]) {
    return { ok: false, error: "Central bank not found" };
  }

  if (source.bank?.bankCharter) source.bank.bankCharter.cashReserves = Math.max(0, sourceCash - amount);
  else world.centralBanks[player.countryId]!.externalBroadMoney = Math.max(0, sourceCash - amount);
  if (destination?.bankCharter) destination.bankCharter.cashReserves += amount;
  else world.centralBanks[player.countryId]!.externalBroadMoney += amount;
  player.savingsHolder = holderId;
  return { ok: true };
}
