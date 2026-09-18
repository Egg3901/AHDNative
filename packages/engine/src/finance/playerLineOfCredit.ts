/**
 * WorldState projection of AHDGame's lineOfCreditTurn (#314).
 *
 * Native carries a single player line in one denomination (see
 * PlayerCharacter.lineOfCredit) where mainline services per-currency maps
 * for every character. The per-turn math is shared verbatim through
 * finance/lineOfCredit.ts: denomination-specific prime plus the
 * borrower-composite spread, interest onto arrears, then the scheduled
 * payment (pi amortizing, io arrears-only) taken from the
 * same-denomination wallet with interest settled before principal.
 *
 * Source order (src/lib/turn/lineOfCreditTurn.ts, AHDGame `e364c0495`):
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
 *   so a frozen line recovers the moment its same-denomination wallet covers
 *   the scheduled payment.
 * - Savings back only a home-denomination line: player.savings is a home
 *   pool, so a foreign line pays from currencyBalances.personal alone.
 * - A home line also reaches same-denomination funds parked in the personal
 *   pocket (crafted saves; live flows keep home cash in `cash`, and the
 *   bond seams route home currency there too). The gross tally already
 *   counts that pocket, so the payment must be able to touch it.
 * - No cross-currency auto-conversion: when the loan-currency wallet falls
 *   short the reference converts other personal balances at market rates,
 *   but the Native engine has no FX-conversion writer precedent (see
 *   finance/wireTransfer.ts: cross-currency movement is an explicit
 *   PORT-STUB), so the shortfall stands and the line freezes.
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

/** Face rate (local per 1 anchor) for a currency from the live FX table. */
function rateFor(world: WorldState, currency: string): number {
  const anchor = getCountryIdForCurrency(currency);
  const rate = world.exchangeRates[anchor]?.rate ?? 1;
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

export const playerLineOfCreditPhase: TurnPhase = {
  name: "playerLineOfCredit",
  run(world) {
    const loc = world.player.lineOfCredit;
    if (!loc) return;
    validatePlayerLineOfCredit(loc);

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
      spread + ioSurcharge,
      denomination,
    );
    const postAccrualArrears = roundSavingsAmount(
      arrears + interest,
      denomination,
    );

    // 2. Size the scheduled payment against the post-accrual obligation,
    // then pay it from the same-denomination wallet: home lines draw cash
    // first, then the home personal pocket, with savings as overflow;
    // foreign lines draw only the foreign personal balance (savings is a
    // home pool). Interest settles before principal, exactly like the
    // reference auto-pay split.
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
    const pay = Math.min(scheduled, walletAvailable);
    const interestPart = roundSavingsAmount(
      Math.min(pay, postAccrualArrears),
      denomination,
    );
    const principalPart = roundSavingsAmount(
      Math.max(0, pay - interestPart),
      denomination,
    );
    const shortfall = pay < scheduled - 1e-9;

    // 3. Commit atomically: every computed value lands together, and a
    // mid-apply throw restores the snapshot so no half-paid split survives.
    // The savings slice decrements player.savings exactly once — there is
    // no second backing store (no Native reserve pool or savings journal).
    const cashBefore = world.player.cash;
    const savingsBefore = world.player.savings;
    const hadBalances = world.player.currencyBalances !== undefined;
    const foreignBefore =
      world.player.currencyBalances?.personal?.[denomination];
    const locBefore: PlayerLineOfCredit = { ...loc };
    try {
      const fromCash = isHome ? Math.min(pay, cashAvailable) : 0;
      const fromPocket = isHome
        ? Math.min(pay - fromCash, homePocketAvailable)
        : 0;
      const fromSavings = isHome
        ? roundSavingsAmount(pay - fromCash - fromPocket, denomination)
        : 0;
      if (fromCash > 0)
        world.player.cash = roundSavingsAmount(
          cashBefore - fromCash,
          denomination,
        );
      if (fromPocket > 0) {
        world.player.currencyBalances!.personal[denomination] =
          roundSavingsAmount(
            (foreignBefore ?? 0) - fromPocket,
            denomination,
          );
      }
      if (fromSavings > 0) {
        world.player.savings = roundSavingsAmount(
          savingsBefore - fromSavings,
          denomination,
        );
      }
      if (!isHome && pay > 0) {
        if (!world.player.currencyBalances)
          world.player.currencyBalances = { personal: {} };
        world.player.currencyBalances.personal[denomination] =
          roundSavingsAmount((foreignBefore ?? 0) - pay, denomination);
      }
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
      // The home path never creates currencyBalances (a pocket debit needs
      // the key to exist); only the foreign path can leave a fresh object.
      if (!isHome && !hadBalances) {
        delete world.player.currencyBalances;
      } else if (world.player.currencyBalances?.personal) {
        if (foreignBefore === undefined) {
          delete world.player.currencyBalances.personal[denomination];
        } else {
          world.player.currencyBalances.personal[denomination] =
            foreignBefore;
        }
      }
      world.player.lineOfCredit = locBefore;
      throw error;
    }
  },
};
