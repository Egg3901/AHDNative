/**
 * Bank solvency turn phase — W12 port of src/lib/turn/bankSolvencyTurn.ts
 * processBankSolvencyTurn (+ evaluateOneBank).
 *
 * Confidence/warning-band scoring, NPC deposit flight on amber/red, the
 * run-failure test, contagion panic to same-country peers, and failed-bank
 * depositor resolution.
 *
 * Scope vs mainline (see banking/types.ts file doc): #328 ports the
 * prop-book leg — mark-to-market before confidence, proportional
 * forced liquidation past the leverage multiple (with the confidence
 * penalty and the forcedLiquidations count), the investment-bank
 * `red && equityBase <= 0` failure test, and clearing the book on
 * failure. Seeded solo banks are all retail, so the deposit-taking
 * failure test (`RUN_FAILURE_COVER_FRACTION`) still runs for every live
 * bank; investment behavior is reachable only via a synthetic (or future
 * charter-wave) investment/universal charter.
 *
 * Treasury backstop (PORT-STUB, flagged for operator review): mainline funds
 * a failed bank's uninsured NPC deposits from the federal budget after the
 * insurance fund is exhausted (insurance.ts DEPOSIT_INSURANCE_SPENDING_KEY,
 * depositBookReturn.ts). AHDClient's budget module (W2) has no live spending
 * hook wired for this, and adding one risks the budget invariants a
 * different wave owns — see this file's `resolveFailedBank` for the honest
 * alternative: an uninsured excess is money that already left the bank's
 * books when it failed and is not returned to the household pool. It is
 * accounted (visible in the returned summary), not silently dropped.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import { sumInterbankDefaultsLastTurn, writeOffLenderSideInterbankOnFailure } from "./interbank.js";
import {
  CONTAGION_PANIC_TURNS,
  FLIGHT_RATE_BY_BAND,
  INSURED_CAP_CAPITAL_MULTIPLE,
  RESERVE_REQUIREMENT,
  RUN_FAILURE_COVER_FRACTION,
  computeConfidence,
} from "./constants.js";
import { discountWindowStigma } from "./discountWindow.js";
import {
  computePropEquityBase,
  forceLiquidateToLeverageCap,
  isDepositTakingCharter,
  isPropCharter,
  propBankFails,
} from "./propTrading.js";

export interface BankSolvencyTurnSummary {
  banksEvaluated: number;
  fled: number;
  failures: number;
  contagionTriggered: number;
  insurancePaid: number;
  uninsuredLoss: number;
  /** Banks whose prop book was force-liquidated for leverage breach (#328). Source: BankSolvencyTurnSummary.forcedLiquidations. */
  forcedLiquidations: number;
}

export const bankSolvencyTurnPhase: TurnPhase = {
  name: "bankSolvencyTurn",
  run(world) {
    const turn = world.meta.turn;
    const summary: BankSolvencyTurnSummary = {
      banksEvaluated: 0,
      fled: 0,
      failures: 0,
      contagionTriggered: 0,
      insurancePaid: 0,
      uninsuredLoss: 0,
      forcedLiquidations: 0,
    };

    const candidates = Object.values(world.corporations).filter(
      (c) => c.bankCharter && c.bankCharter.status === "active" && c.bankCharter.lastSolvencyTurn !== turn,
    );
    if (candidates.length === 0) return;

    const failedThisTurnByCountry = new Map<string, string[]>();
    const evaluated: { corp: Corporation; failed: boolean }[] = [];

    for (const corp of candidates) {
      const { failed, forcedLiquidation, depositTaking } = evaluateOneBank(world, corp, turn, summary);
      evaluated.push({ corp, failed });
      summary.banksEvaluated += 1;
      if (forcedLiquidation) summary.forcedLiquidations += 1;
      if (failed) {
        summary.failures += 1;
        // Source: contagion peers are stamped only on a deposit-taker failure.
        if (depositTaking) {
          const list = failedThisTurnByCountry.get(corp.countryId) ?? [];
          list.push(corp.id);
          failedThisTurnByCountry.set(corp.countryId, list);
        }
      }
    }

    // Contagion: every OTHER active deposit-taking charter in the same country.
    if (failedThisTurnByCountry.size > 0) {
      for (const { corp, failed } of evaluated) {
        if (failed) continue;
        // Source: only a deposit-taking peer receives the panic bump.
        if (!isDepositTakingCharter(corp.bankCharter)) continue;
        const failedPeers = failedThisTurnByCountry.get(corp.countryId);
        if (!failedPeers || failedPeers.length === 0) continue;
        const charter = corp.bankCharter!;
        charter.panicTurns = Math.max(charter.panicTurns, CONTAGION_PANIC_TURNS);
        summary.contagionTriggered += 1;
      }
    }

    for (const { corp, failed } of evaluated) {
      if (failed) continue;
      const charter = corp.bankCharter!;
      if (!failedThisTurnByCountry.get(corp.countryId)?.length) {
        charter.panicTurns = Math.max(0, charter.panicTurns - 1);
      }
      charter.lastSolvencyTurn = turn;
    }
  },
};

/** Returns the failure/liquidation outcome for this bank this turn. */
function evaluateOneBank(
  world: WorldState,
  corp: Corporation,
  turn: number,
  summary: BankSolvencyTurnSummary,
): { failed: boolean; forcedLiquidation: boolean; depositTaking: boolean } {
  const charter = corp.bankCharter!;
  const bank = world.centralBanks[corp.countryId];
  const depositTaking = isDepositTakingCharter(charter);
  const propRunning = isPropCharter(charter);
  if (!bank) return { failed: false, forcedLiquidation: false, depositTaking };

  // Source evaluateOneBank: the prop book is marked BEFORE confidence so
  // leverage/equity use fresh prices, and a leverage breach is shrunk
  // proportionally at those marks before anything else reads the book.
  let forcedLiquidation = false;
  if (propRunning) {
    forcedLiquidation = forceLiquidateToLeverageCap(world, corp.id).forced;
  }

  const arrearsOutstanding = sumLoanOutstanding(world, corp.id, "arrears");
  // Source: bankSolvencyTurn.ts `defaultsLastTurn = retail +
  // interbank` — lender-side interbank defaults booked this turn weigh on
  // confidence exactly like retail ones.
  const defaultsLastTurn =
    sumLoanOutstanding(world, corp.id, "defaulted", turn) + sumInterbankDefaultsLastTurn(world, corp.id, turn);

  const { confidence, band } = computeConfidence({
    cashReserves: charter.cashReserves,
    cashBackedDeposits: charter.npcDeposits,
    totalLoans: charter.totalLoans,
    reserveRatioRequired: RESERVE_REQUIREMENT,
    arrearsOutstanding,
    defaultsLastTurn,
    panicTurns: charter.panicTurns,
    // #327: borrowing from the lender of last resort reads as a bank that
    // could not fund itself elsewhere (rules/confidence.ts). Zero for a bank
    // that never drew, so pre-#327 scoring is unchanged.
    discountWindowStigma: discountWindowStigma(charter),
    forcedLiquidation,
  });

  const priorBand = charter.warningBand;
  if (depositTaking && (priorBand === "amber" || priorBand === "red")) {
    const rate = FLIGHT_RATE_BY_BAND[priorBand];
    const outflow = Math.min(charter.npcDeposits * rate, Math.max(0, charter.cashReserves));
    if (outflow > 0) {
      charter.cashReserves = Math.max(0, charter.cashReserves - outflow);
      charter.npcDeposits = Math.max(0, charter.npcDeposits - outflow);
      bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + outflow);
      summary.fled += outflow;
    }
  }

  let fails: boolean;
  if (depositTaking) {
    const requiredLiquidity = RESERVE_REQUIREMENT * charter.npcDeposits;
    fails = priorBand === "red" && charter.cashReserves < RUN_FAILURE_COVER_FRACTION * requiredLiquidity;
  } else if (propRunning) {
    // Source: an investment bank fails when red with no equity left behind
    // its book. Deposit flight and the run line do not apply — it holds no
    // household deposits to run on.
    fails = propBankFails({ band, equityBase: computePropEquityBase(charter.cashReserves, charter) });
  } else {
    fails = false;
  }

  if (fails) {
    // Source: writeOffLenderSideInterbankOnFailure — loans this bank made
    // AS A LENDER die with it (borrowers keep the cash). Claims AGAINST it
    // are deliberately untouched here; creditor priority is #329's sweep.
    writeOffLenderSideInterbankOnFailure(world, corp.id, turn);
    resolveFailedBank(world, corp, turn, summary);
    charter.status = "failed";
    charter.failedTurn = turn;
    charter.confidence = confidence;
    charter.warningBand = band;
    // Source: a failed estate holds no book — positions are gone with the bank.
    charter.propBook = [];
    charter.propBookMarkValue = 0;
    charter.lastSolvencyTurn = turn;
    return { failed: true, forcedLiquidation, depositTaking };
  }

  charter.confidence = confidence;
  charter.warningBand = band;
  return { failed: false, forcedLiquidation, depositTaking };
}

function sumLoanOutstanding(world: WorldState, bankCorpId: string, status: "arrears" | "defaulted", lastProcessedTurn?: number): number {
  let total = 0;
  for (const loan of world.bankLoans) {
    if (loan.bankCorpId !== bankCorpId) continue;
    if (loan.borrowerType === "npcBulk") continue;
    if (loan.status !== status) continue;
    if (lastProcessedTurn !== undefined && loan.lastProcessedTurn !== lastProcessedTurn) continue;
    total += Math.max(0, loan.outstanding);
  }
  return total;
}

/**
 * Failed-bank depositor resolution. Source: insurance.ts
 * resolveFailedBankDepositors + depositBookReturn.ts waterfall, scope-cut to
 * solo's single named player + one NPC household pool (see file doc for the
 * Treasury-backstop cut).
 *
 * NPC deposits are cash-backed: the senior central-bank window claim
 * (debt + arrears, #327) is settled first, then the remaining cash pays the
 * household pool, the insurance fund tops up to `insuredCap` next, and
 * anything still short is an uninsured loss (accounted in the summary, not
 * silently destroyed nor invented).
 *
 * Player savings are a POINTER (see constants.ts / balanceSheet.ts doc): no
 * cash ever left `player.savings` for a deposit, so failure costs the
 * player the counterparty and future yield, never the principal — the
 * holder simply flips back to "centralBank", exactly mirroring mainline's
 * documented player-savings failure behavior.
 *
 * #328 residual: a failed investment bank's estate is written off with the
 * charter (propBook cleared by the caller). Mainline settles interbank and
 * central-bank claims against the estate in priority order
 * (`returnDepositBook`); those creditor rows belong to the unmerged
 * #326/#327 servicing waves, so there is no one to pay here.
 */
function resolveFailedBank(world: WorldState, corp: Corporation, turn: number, summary: BankSolvencyTurnSummary): void {
  const charter = corp.bankCharter!;
  const bank = world.centralBanks[corp.countryId];
  if (charter.depositorsResolvedTurn !== null) return;

  let available = Math.max(0, charter.cashReserves);

  // (0) Senior central-bank window claim, before depositors.
  // Source: depositBookReturn.ts waterfall tier 1 (window debt + arrears, one
  // tier with the margin line). Only the window leg is ported (#327); margin
  // and interbank senior claims complete with #326/#328 and are untouched
  // here (documented residual). Repaid money retires: Native carries no
  // netMoneyCreatedLifetime counter (centralBank/types.ts scope cut), so the
  // paid leg simply leaves circulation, symmetric with repayDiscountWindow.
  const windowOwed =
    (typeof charter.discountWindowDebt === "number" && Number.isFinite(charter.discountWindowDebt)
      ? Math.max(0, charter.discountWindowDebt)
      : 0) +
    (typeof charter.discountWindowArrears === "number" && Number.isFinite(charter.discountWindowArrears)
      ? Math.max(0, charter.discountWindowArrears)
      : 0);
  available = Math.max(0, available - Math.min(available, windowOwed));
  charter.discountWindowDebt = 0;
  charter.discountWindowArrears = 0;

  let npcClaim = Math.max(0, charter.npcDeposits);

  const fromCash = Math.min(available, npcClaim);
  available -= fromCash;
  npcClaim -= fromCash;
  if (bank) bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + fromCash);

  const insuredCap = charter.postedCapital * INSURED_CAP_CAPITAL_MULTIPLE;
  const fund = world.depositInsurance[corp.countryId];
  if (fund && npcClaim > 0) {
    const fromFund = Math.min(fund.balance, npcClaim, insuredCap);
    if (fromFund > 0) {
      fund.balance -= fromFund;
      fund.payoutsLifetime += fromFund;
      if (bank) bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + fromFund);
      npcClaim -= fromFund;
      summary.insurancePaid += fromFund;
    }
  }
  if (npcClaim > 0) summary.uninsuredLoss += npcClaim;

  if (world.player.countryId === corp.countryId && world.player.savingsHolder === corp.id) {
    world.player.savingsHolder = "centralBank";
  }

  charter.npcDeposits = 0;
  charter.cashReserves = 0;
  charter.depositorsResolvedTurn = turn;
}
