/**
 * WorldState projection of AHDGame's lineOfCreditTurn (#314).
 *
 * Native carries a single player line in one denomination (see
 * PlayerCharacter.lineOfCredit) where mainline services per-currency maps
 * for every character. The per-turn math is shared verbatim through
 * finance/lineOfCredit.ts: denomination-specific prime plus the
 * borrower-composite spread, interest onto arrears, then the scheduled
 * payment (pi amortizing, io arrears-only), funded from the same-denomination
 * wallet first and current-FX-converted personal wallets second, with
 * interest settled before principal.
 *
 * Source order (src/lib/lineOfCredit/rules/servicing.ts,
 * AHDGame `01797b27082b`; finance mechanics were unchanged at `88fb2de`):
 * accrue interest per denomination, size the scheduled payment against the
 * post-accrual obligation, pay from the wallet, then set draw distress from
 * any remaining shortfall. This phase keeps that exact order.
 *
 * Solo adaptations (cited, not silently dropped):
 * - Borrower composite inputs mainline reads per turn collapse to what the
 *   WorldState actually tracks: corporate snapshot is absent (Native corps
 *   carry no creditCompositeSnapshot) and per-turn personal income has no
 *   ledger, so both enter as the neutral null/0 the reference formulas
 *   already accept; net worth and the debt ratio come from cash, savings,
 *   and foreign personal balances through computePlayerGrossNetLocInternal.
 * - The garnished-income unfreeze escape hatch has no income ledger to read,
 *   so a frozen line recovers when source wallet plus conversion legs cover
 *   the scheduled payment.
 * - Savings back only a home-denomination line: player.savings is a home
 *   pool, so a foreign line pays from currencyBalances.personal alone.
 * - A home line also reaches same-denomination funds parked in the personal
 *   pocket (crafted saves; live flows keep home cash in `cash`, and the
 *   bond seams route home currency there too). The gross tally already
 *   counts that pocket, so the payment must be able to touch it.
 * - Conversion is an automatic servicing transfer only: it uses the source
 *   active-currency candidate order, current local-per-anchor rates,
 *   local-currency rounding and source personal-before-savings debit order.
 * - The savings slice decrements player.savings exactly once. There is no
 *   second backing store to move: Native central banks omit reserveBalance
 *   (see centralBank/types.ts scope cut) and the savings-accounts journal
 *   behind mainline's drawSavingsForPayment has no Native counterpart, so
 *   nothing else is debited or credited.
 * - No draw/borrow path is ported: without origination there is nothing to
 *   size against DTI caps or the exchange pool, and no UI or action creates
 *   a line. Servicing existing balances is the whole slice.
 *
 * The phase is RNG-free and refuses invalid state before mutating anything,
 * so a failed turn leaves the world (and, through session.advance's
 * clone-and-commit, the live session) untouched.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { PlayerLineOfCredit } from "../types.js";
import { ensureCentralBankPricingPhaseIn } from "./centralBankPricing.js";
import {
  computeLocBorrowerComposite,
  computeLocInterestForTurn,
  computeLocScheduledPaymentFace,
  computePlayerGrossNetLocInternal,
  DEFAULT_PRIME,
  FOREX_ACTIVE_CURRENCIES,
  getCountryIdForCurrency,
  LOC_IO_SURCHARGE_PERCENT_POINTS,
  netWorthScoreFromInternal,
  resolvePrimeForCurrency,
  roundSavingsAmount,
  spreadPercentPointsFromComposite,
} from "./lineOfCredit.js";

/** Home currency for wallet routing. Mirrors corporateSectorAcquire.ts. */
export function homeCurrencyFor(world: WorldState, countryId: string): string {
  return (
    world.budgets[countryId]?.currencyCode ??
    world.exchangeRates[countryId]?.currencyCode ??
    "USD"
  );
}

/**
 * Strict shape check for the optional line state. Throws on any
 * present-but-invalid value; unknown extra keys are tolerated and kept.
 * Runs before any mutation at both the phase and the save boundary.
 */
export function validatePlayerLineOfCredit(loc: unknown): void {
  const row = loc as unknown as Record<string, unknown>;
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    throw new Error("Invalid player line of credit: not an object");
  }
  const denomination = row["denomination"];
  if (typeof denomination !== "string" || denomination.length === 0) {
    throw new Error("Invalid player line of credit denomination");
  }
  for (const key of ["balance", "arrears"] as const) {
    const value = row[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid player line of credit ${key}`);
    }
  }
  if (typeof row["drawFrozen"] !== "boolean") {
    throw new Error("Invalid player line of credit drawFrozen flag");
  }
  const mode = row["paymentMode"];
  if (mode !== undefined && mode !== "pi" && mode !== "io") {
    throw new Error("Invalid player line of credit payment mode");
  }
}

export function validatePlayerLineOfCreditWallet(
  player: WorldState["player"],
): void {
  if (!Number.isFinite(player.cash) || !Number.isFinite(player.savings)) {
    throw new Error(
      "Invalid player wallet balance for line-of-credit servicing",
    );
  }
  const personal = player.currencyBalances?.personal;
  if (personal !== undefined) {
    for (const [currency, amount] of Object.entries(personal)) {
      if (typeof amount !== "number" || !Number.isFinite(amount)) {
        throw new Error(
          `Invalid ${currency} personal wallet balance for line-of-credit servicing`,
        );
      }
    }
  }
}

/** Face rate (local per 1 anchor) for a currency from the live FX table. */
function rateFor(world: WorldState, currency: string): number {
  const anchor = getCountryIdForCurrency(currency);
  const rate = world.exchangeRates[anchor]?.rate;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? rate
    : 0;
}

function availableForCurrency(
  world: WorldState,
  currency: string,
  home: string,
): number {
  const personal = Math.max(
    0,
    world.player.currencyBalances?.personal?.[currency] ?? 0,
  );
  if (currency !== home) return personal;
  return (
    personal +
    Math.max(0, world.player.cash) +
    Math.max(0, world.player.savings)
  );
}

/** Debit a source wallet personal-first, with the home savings book as overflow. */
function debitCurrencyWallet(
  world: WorldState,
  currency: string,
  amount: number,
  home: string,
): void {
  let remaining = amount;
  const personal = Math.max(
    0,
    world.player.currencyBalances?.personal?.[currency] ?? 0,
  );
  const cash = currency === home ? Math.max(0, world.player.cash) : 0;
  // Native's home cash is the first personal-wallet balance; an explicit
  // personal pocket follows it, matching the existing same-currency route.
  const fromCash = Math.min(remaining, cash);
  remaining = roundSavingsAmount(remaining - fromCash, currency);
  if (fromCash > 0)
    world.player.cash = roundSavingsAmount(
      world.player.cash - fromCash,
      currency,
    );
  const fromPersonal = Math.min(remaining, personal);
  remaining = roundSavingsAmount(remaining - fromPersonal, currency);
  if (fromPersonal > 0 && world.player.currencyBalances?.personal) {
    world.player.currencyBalances.personal[currency] = roundSavingsAmount(
      personal - fromPersonal,
      currency,
    );
  }
  if (remaining > 0 && currency === home) {
    world.player.savings = roundSavingsAmount(
      Math.max(0, world.player.savings - remaining),
      currency,
    );
  }
}

export const playerLineOfCreditPhase: TurnPhase = {
  name: "playerLineOfCredit",
  run(world) {
    const loc = world.player.lineOfCredit;
    if (!loc) return;
    validatePlayerLineOfCredit(loc);
    validatePlayerLineOfCreditWallet(world.player);
    const centralBankPricing = ensureCentralBankPricingPhaseIn(world);

    const denomination = loc.denomination;
    const mode = loc.paymentMode ?? "pi";
    const balance = loc.balance;
    const arrears = loc.arrears;
    if (balance <= 0 && arrears <= 0) {
      // Nothing owed: a frozen line with no obligation recovers, anything
      // else is a strict no-op so untouched worlds stay byte-identical.
      if (loc.drawFrozen) loc.drawFrozen = false;
      return;
    }

    const primeByBankId = new Map<string, number>();
    for (const [id, bank] of Object.entries(world.centralBanks)) {
      primeByBankId.set(id, bank.primeRate ?? DEFAULT_PRIME);
    }
    const primeForDenomination = resolvePrimeForCurrency(
      primeByBankId,
      denomination,
    );
    const home = homeCurrencyFor(world, world.player.countryId);
    const primeForHome = resolvePrimeForCurrency(primeByBankId, home);

    // Borrower spread from solo-observable inputs through the reference
    // composite. Corporate snapshot and per-turn income have no Native
    // ledger, so they enter neutral (null/0); net worth and leverage come
    // from the live wallet. Deterministic, no RNG.
    const rates: Record<string, number> = {};
    for (const c of FOREX_ACTIVE_CURRENCIES) rates[c] = rateFor(world, c);
    rates[denomination] ??= rateFor(world, denomination);
    rates[home] ??= rateFor(world, home);
    const personal: Record<string, number> = {
      [home]: Math.max(0, world.player.cash),
    };
    for (const [c, v] of Object.entries(
      world.player.currencyBalances?.personal ?? {},
    )) {
      personal[c] = (personal[c] ?? 0) + Math.max(0, v);
    }
    const { grossInternal, locDebtInternal, netInternal } =
      computePlayerGrossNetLocInternal(
        {
          _id: "player",
          countryId: world.player.countryId,
          currencyBalances: {
            personal,
            savings: { [home]: Math.max(0, world.player.savings) },
          },
          lineOfCredit: {
            balances: { [denomination]: balance },
            arrears: { [denomination]: arrears },
          },
        },
        rates,
      );
    const debtToAssetsRatio =
      grossInternal > 0
        ? locDebtInternal / grossInternal
        : locDebtInternal > 0
          ? 1
          : 0;
    const composite = computeLocBorrowerComposite({
      corpComposite: null,
      incomeScore: 0,
      netWorthScore: netWorthScoreFromInternal(netInternal),
      debtToAssetsRatio,
      homePrimePercent: primeForHome,
    });
    const spread = spreadPercentPointsFromComposite(composite);

    // 1. Accrue denomination-specific interest onto arrears (source step 1).
    const ioSurcharge = mode === "io" ? LOC_IO_SURCHARGE_PERCENT_POINTS : 0;
    const interest = computeLocInterestForTurn(
      balance,
      arrears,
      primeForDenomination,
      spread + ioSurcharge + centralBankPricing.spreadHikePercentPoints,
      denomination,
    );
    const postAccrualArrears = roundSavingsAmount(
      arrears + interest,
      denomination,
    );

    // 2. Source servicing pays from the obligation-currency wallet first,
    // then converts other available personal currencies at current FX rates,
    // preferring the largest available anchor-value balance.
    const scheduled = roundSavingsAmount(
      computeLocScheduledPaymentFace(mode, balance, postAccrualArrears),
      denomination,
    );
    const isHome = denomination === home;
    const cashAvailable = isHome ? Math.max(0, world.player.cash) : 0;
    const homePocketAvailable = isHome
      ? Math.max(
          0,
          world.player.currencyBalances?.personal?.[denomination] ?? 0,
        )
      : 0;
    const savingsAvailable = isHome ? Math.max(0, world.player.savings) : 0;
    const foreignAvailable = !isHome
      ? Math.max(
          0,
          world.player.currencyBalances?.personal?.[denomination] ?? 0,
        )
      : 0;
    const walletAvailable = isHome
      ? cashAvailable + homePocketAvailable + savingsAvailable
      : foreignAvailable;
    let pay = Math.min(scheduled, walletAvailable);
    const walletPay = pay;
    const convertedSources: Array<{ currency: string; amount: number }> = [];
    if (pay < scheduled - 1e-6) {
      const loanRate = rateFor(world, denomination);
      if (loanRate > 0) {
        let remainingShortfall = roundSavingsAmount(
          scheduled - pay,
          denomination,
        );
        const candidates = FOREX_ACTIVE_CURRENCIES.filter(
          (other) => other !== denomination,
        )
          .map((other) => ({
            currency: other,
            rate: rateFor(world, other),
            available: availableForCurrency(world, other, home),
          }))
          .filter(
            (candidate) => candidate.available > 1e-9 && candidate.rate > 0,
          )
          .sort((a, b) => b.available * b.rate - a.available * a.rate);
        for (const candidate of candidates) {
          if (remainingShortfall <= 1e-9) break;
          const otherNeeded = roundSavingsAmount(
            (remainingShortfall * loanRate) / candidate.rate,
            candidate.currency,
          );
          const otherUsed = Math.min(otherNeeded, candidate.available);
          if (otherUsed <= 0) continue;
          const loanGained = roundSavingsAmount(
            (otherUsed * candidate.rate) / loanRate,
            denomination,
          );
          if (loanGained <= 0) continue;
          convertedSources.push({
            currency: candidate.currency,
            amount: otherUsed,
          });
          pay = Math.min(
            scheduled,
            roundSavingsAmount(pay + loanGained, denomination),
          );
          remainingShortfall = roundSavingsAmount(
            Math.max(0, scheduled - pay),
            denomination,
          );
        }
      }
    }
    const interestPart = roundSavingsAmount(
      Math.min(pay, postAccrualArrears),
      denomination,
    );
    const principalPart = roundSavingsAmount(
      Math.max(0, pay - interestPart),
      denomination,
    );
    const shortfall = pay < scheduled - 1e-6;

    // 3. Commit atomically: every computed value lands together, and a
    // mid-apply throw restores the snapshot so no half-paid split survives.
    // The savings slice decrements player.savings exactly once — there is
    // no second backing store (no Native reserve pool or savings journal).
    const cashBefore = world.player.cash;
    const savingsBefore = world.player.savings;
    const balancesBefore = structuredClone(world.player.currencyBalances);
    const locBefore: PlayerLineOfCredit = { ...loc };
    try {
      const fromCash = isHome ? Math.min(walletPay, cashAvailable) : 0;
      const fromPocket = isHome
        ? Math.min(walletPay - fromCash, homePocketAvailable)
        : 0;
      const fromSavings = isHome
        ? roundSavingsAmount(walletPay - fromCash - fromPocket, denomination)
        : 0;
      if (fromCash > 0)
        world.player.cash = roundSavingsAmount(
          cashBefore - fromCash,
          denomination,
        );
      if (fromPocket > 0) {
        world.player.currencyBalances!.personal[denomination] =
          roundSavingsAmount(
            (world.player.currencyBalances?.personal?.[denomination] ?? 0) -
              fromPocket,
            denomination,
          );
      }
      if (fromSavings > 0) {
        world.player.savings = roundSavingsAmount(
          savingsBefore - fromSavings,
          denomination,
        );
      }
      if (!isHome && walletPay > 0) {
        if (!world.player.currencyBalances)
          world.player.currencyBalances = { personal: {} };
        world.player.currencyBalances.personal[denomination] =
          roundSavingsAmount(
            (world.player.currencyBalances.personal[denomination] ?? 0) -
              walletPay,
            denomination,
          );
      }
      for (const source of convertedSources)
        debitCurrencyWallet(world, source.currency, source.amount, home);
      loc.balance = roundSavingsAmount(
        Math.max(0, balance - principalPart),
        denomination,
      );
      loc.arrears = roundSavingsAmount(
        Math.max(0, postAccrualArrears - interestPart),
        denomination,
      );
      loc.drawFrozen = shortfall;
    } catch (error) {
      world.player.cash = cashBefore;
      world.player.savings = savingsBefore;
      if (balancesBefore === undefined) delete world.player.currencyBalances;
      else world.player.currencyBalances = balancesBefore;
      world.player.lineOfCredit = locBefore;
      throw error;
    }
  },
};
