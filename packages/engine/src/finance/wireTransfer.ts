/**
 * International/personal wire transfers — W35, cross-border slice (#316).
 *
 * Ports src/app/api/characters/[id]/wire/route.ts at e364c0495, forex-enabled
 * branch: the transfer currency travels with the transfer and the recipient
 * is credited in the same currency bucket, so no FX conversion is involved.
 * The daily cap is anchor-denominated (amount / sender-home rate, local per
 * 1 anchor, e.g. USD 1.0, DDM 4.2) so a high-nominal currency cannot exploit
 * a higher cap. Debit, credit, quota claim and news commit in one action
 * transition; every refusal returns before any mutation, which is the solo
 * equivalent of the route's atomic quota-claim/debit/credit/rollback chain
 * (single-threaded engine: no balance race is representable).
 *
 * Source facts preserved:
 *  - No fee and no delayed settlement: the route settles immediately with no
 *    fee term, so Native applies the full amount at action time.
 *  - No auto-conversion: a transfer currency is never converted into another
 *    currency. Home-currency legs move `cash`; foreign legs move
 *    `currencyBalances.personal[ccy]` (absent means zero). A foreign leg
 *    needs a pre-funded foreign balance (bond coupons/maturities are one way
 *    to fund it); insufficient balance refuses untouched.
 *  - Eligibility: recipient must exist; pre-forex mode blocks cross-border
 *    wires and explicit foreign-currency selection; the currency must be a
 *    known world currency (sender/recipient home or a seeded exchange-rate
 *    currency).
 *  - Solo simplifications (cited):
 *    - NEW_CHARACTER_TRANSFER_BARRIER_TURNS (24-turn anti-abuse window on a
 *      freshly created character) is not ported: it exists to stop a
 *      multiplayer economy's fresh-account money-laundering vector, and solo
 *      has exactly one persistent player character with no analogous
 *      multi-account surface.
 *    - No per-transfer ledger rows (wire_transfer_out/in) and no recipient
 *      inbox notification: solo has no financial-tx log or MP inbox; the
 *      transfer is recorded in world news only. Residual, not silent: the
 *      amounts, balances and quota are all observable in saves.
 */
import type { WorldState } from "../types.js";
import { CURRENCY_CODE_BY_COUNTRY } from "../forex/constants.js";

// Source: src/app/api/characters/[id]/wire/route.ts DAILY_WIRE_CAP_ANCHORS.
export const DAILY_WIRE_CAP_ANCHOR = 50_000_000;
// Source: same file, WIRE_QUOTA_WINDOW_MS = 24h -> 24 turns (see file doc).
export const WIRE_QUOTA_WINDOW_TURNS = 24;

export type WireTransferResult =
  | { ok: true; recipientName: string; currency: string; amount: number }
  | { ok: false; error: string };

/** Sender/recipient home currency: seeded rate row, then static map, then USD. */
function homeCurrencyFor(world: WorldState, countryId: string): string {
  const seeded = world.exchangeRates?.[countryId]?.currencyCode?.trim();
  if (seeded) return seeded;
  return CURRENCY_CODE_BY_COUNTRY[countryId] ?? "USD";
}

/** Currencies this world can name on a wire: both homes plus every seeded rate row. */
function knownCurrencies(world: WorldState, senderHome: string, recipientHome: string): Set<string> {
  const codes = new Set<string>([senderHome, recipientHome]);
  for (const row of Object.values(world.exchangeRates ?? {})) {
    const code = row?.currencyCode?.trim();
    if (code) codes.add(code);
  }
  return codes;
}

function personalBalance(
  holder: { cash: number; currencyBalances?: { personal: Record<string, number> } },
  home: string,
  currency: string,
): number {
  if (currency === home) return holder.cash ?? 0;
  return holder.currencyBalances?.personal?.[currency] ?? 0;
}

export function wireTransfer(
  world: WorldState,
  targetPoliticianId: string,
  amount: number,
  currency?: string,
): WireTransferResult {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return { ok: false, error: "Invalid amount" };
  }
  const target = world.politicians.find((p) => p.id === targetPoliticianId);
  if (!target) return { ok: false, error: "Recipient not found" };

  const player = world.player;
  // Source: isForexEnabled(). Native counterpart is the foreignExchange world
  // flag (default on; old saves backfill defaults on load).
  const forexEnabled = world.featureFlags?.foreignExchange !== false;
  const senderHome = homeCurrencyFor(world, player.countryId);
  const recipientHome = homeCurrencyFor(world, target.countryId);

  let transferCurrency = senderHome;
  if (currency !== undefined) {
    if (typeof currency !== "string" || !knownCurrencies(world, senderHome, recipientHome).has(currency)) {
      return { ok: false, error: `Unsupported currency: ${String(currency)}` };
    }
    transferCurrency = currency;
  }

  const crossBorder = target.countryId !== player.countryId;
  if (!forexEnabled && crossBorder) {
    return { ok: false, error: "You cannot wire funds to politicians from other countries" };
  }
  if (!forexEnabled && transferCurrency !== senderHome) {
    return { ok: false, error: "Foreign-currency transfers are not available" };
  }

  // Read-only balance lookup: never creates currencyBalances, so every
  // refusal below leaves cash, buckets, quota and holdings untouched.
  // Source order: the route checks the sender balance before
  // loadCharacterFxRate, so insufficient funds wins over a missing rate.
  if (personalBalance(player, senderHome, transferCurrency) < amount) {
    return { ok: false, error: `Insufficient ${transferCurrency} balance. Available: ${personalBalance(player, senderHome, transferCurrency)}` };
  }

  // Source: loadCharacterFxRate for the sender home currency; anchor =
  // local / rate. Pre-forex treats USD 1:1. Fail closed when the rate is
  // missing instead of inventing a conversion.
  let anchorAmount: number;
  if (forexEnabled) {
    const rate = world.exchangeRates?.[player.countryId]?.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return { ok: false, error: "Exchange rate unavailable, try again shortly" };
    }
    anchorAmount = amount / rate;
  } else {
    anchorAmount = amount;
  }

  const turn = world.meta.turn;
  const windowFresh =
    player.wireQuotaWindowStartTurn != null && turn - player.wireQuotaWindowStartTurn < WIRE_QUOTA_WINDOW_TURNS;
  const quotaUsed = windowFresh ? (player.wireQuotaUsedAnchor ?? 0) : 0;
  if (quotaUsed + anchorAmount > DAILY_WIRE_CAP_ANCHOR) {
    const remaining = Math.max(0, DAILY_WIRE_CAP_ANCHOR - quotaUsed);
    return { ok: false, error: `Daily wire limit reached. ${remaining} remaining in your quota.` };
  }

  // Single action transition: quota, both balances and news commit together.
  if (windowFresh) {
    player.wireQuotaUsedAnchor = quotaUsed + anchorAmount;
  } else {
    player.wireQuotaUsedAnchor = anchorAmount;
    player.wireQuotaWindowStartTurn = turn;
  }

  if (transferCurrency === senderHome) {
    player.cash -= amount;
  } else {
    const balances = (player.currencyBalances ??= { personal: {} }).personal;
    balances[transferCurrency] = (balances[transferCurrency] ?? 0) - amount;
  }
  if (transferCurrency === recipientHome) {
    target.cash += amount;
  } else {
    const balances = (target.currencyBalances ??= { personal: {} }).personal;
    balances[transferCurrency] = (balances[transferCurrency] ?? 0) + amount;
  }
  world.news.push({
    turn,
    date: world.meta.date,
    headline: `You wire ${amount} ${transferCurrency} to ${target.name}.`,
  });
  return { ok: true, recipientName: target.name, currency: transferCurrency, amount };
}
