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
  /** Estate cash transferred to interbank lenders on failure (#329). Source: DepositBookReturnResult interbank tier. */
  interbankRecovered: number;
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
      interbankRecovered: 0,
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
      // Source flight projection decrements both aggregates, never the NPC
      // leg alone: totalDeposits is the cached pointer + NPC aggregate
      // bankingTurn recomputes, and flight must keep it consistent in between.
      charter.totalDeposits = Math.max(0, charter.totalDeposits - outflow);
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
 * #329: live interbank loans against the failed bank are settled here in
 * source priority (depositBookReturn.ts tier 3: central-bank facilities,
 * household depositors, interbank lenders). The owner releases nothing on
 * failure (source releaseResidualToOwner: false), so any remainder stays on
 * the estate. The margin facility has no servicing substrate natively, so
 * its claim is extinguished with the estate rather than paid.
 */
function resolveFailedBank(world: WorldState, corp: Corporation, turn: number, summary: BankSolvencyTurnSummary): void {
  const charter = corp.bankCharter!;
  const bank = world.centralBanks[corp.countryId];
  if (charter.depositorsResolvedTurn !== null) return;

  let available = Math.max(0, charter.cashReserves);

  // (0) Senior central-bank facilities, before depositors.
  // Source: depositBookReturn.ts waterfall tier 1 (window debt + arrears, one
  // tier with the margin line). Repaid window money retires: Native carries
  // no netMoneyCreatedLifetime counter (centralBank/types.ts scope cut), so
  // the paid leg simply leaves circulation, symmetric with
  // repayDiscountWindow. The margin line has no servicing substrate natively
  // (nothing originates it), so its recorded claim is extinguished with the
  // estate rather than paid — source creditorClaimProjections clears all
  // four central-bank fields on resolution either way.
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
  charter.cbMarginDebt = 0;
  charter.cbMarginArrears = 0;

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

  // (3) Interbank lenders, pro rata on outstanding principal, from whatever
  // the senior claims and depositors left. Source: depositBookReturn.ts tier
  // 3. Unlike the minted window principal, this cash left another bank's
  // vault, so recovery is a transfer into the lender's vault (or its still
  // open estate), never a burn; the unpaid part is a real loss recorded
  // against the loan. A bank that fails holding no cash pays nobody, and
  // "pays nobody" is still a resolution: the claims below are settled and
  // the borrower-side debt cleared even when every share is zero.
  const estateLoans = world.interbankLoans.filter(
    (l) => l.borrowerCorpId === corp.id && l.status === "current",
  );
  const interbankOwed = estateLoans.reduce((sum, l) => sum + Math.max(0, l.outstanding), 0);
  if (interbankOwed > 0) {
    const interbankPaid = toCents(Math.min(available, interbankOwed));
    const interbankShare = interbankPaid / interbankOwed;
    const payouts = estateLoans
      .map((loan) => ({
        loan,
        outstanding: Math.max(0, loan.outstanding),
        paid: floorCents(Math.max(0, loan.outstanding) * interbankShare),
        target: interbankRecoveryTarget(world, loan, corp.countryId),
      }))
      .filter((row) => row.outstanding > 0);
    // Whatever the floors left over goes to the largest claim, so the shares
    // add up to exactly what was paid and no cent is stranded on the estate.
    const floorsTotal = payouts.reduce((sum, row) => sum + row.paid, 0);
    const remainder = toCents(interbankPaid - floorsTotal);
    if (remainder > 0 && payouts.length > 0) {
      const largest = payouts.reduce((best, row) =>
        row.outstanding > best.outstanding ? row : best,
      );
      largest.paid = toCents(largest.paid + remainder);
    }
    for (const row of payouts) {
      let moved = 0;
      if (row.paid > 0 && row.target) {
        moved = row.paid;
        available = Math.max(0, available - moved);
        if (row.target.kind === "vault") {
          const lenderCharter = world.corporations[row.target.corpId]?.bankCharter;
          if (lenderCharter) lenderCharter.cashReserves = Math.max(0, lenderCharter.cashReserves) + moved;
        } else {
          const fund = world.depositInsurance[row.target.countryId];
          if (fund) fund.balance = Math.max(0, fund.balance) + moved;
        }
        summary.interbankRecovered += moved;
      }
      const unrecovered = Math.max(0, row.outstanding - moved);
      row.loan.outstanding = unrecovered;
      row.loan.status = unrecovered > 0 ? "defaulted" : "repaid";
      row.loan.lastProcessedTurn = turn;
    }
    charter.interbankDebt = 0;
  }

  if (world.player.countryId === corp.countryId && world.player.savingsHolder === corp.id) {
    world.player.savingsHolder = "centralBank";
  }

  charter.npcDeposits = 0;
  // Source depositAggregateClearProjection: the aggregates clear after the
  // cash moved, never before. No owner residual is released on failure, so
  // the leftover estate cash stays on the dead charter.
  charter.totalDeposits = 0;
  charter.cashReserves = available;
  charter.depositorsResolvedTurn = turn;
}

/** Source: depositBookReturn.ts toCents / floorCents (verbatim). */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function floorCents(value: number): number {
  return Math.floor(value * 100 + 1e-9) / 100;
}

/**
 * Where one interbank loan's estate recovery lands. Source:
 * depositBookReturn.ts interbankRecoveryTarget. A live lender takes it into
 * its vault; a lender that failed but is not yet resolved takes it into its
 * estate, where its own resolution distributes it. A lender whose estate is
 * already closed may not be credited, so the recovery belongs to the insurer
 * that stood behind it. Null only when neither target exists, which no live
 * resolution path reaches (bankingTurn seeds the fund before any bank can
 * fail); the claim is still settled, the share simply moves nowhere.
 */
function interbankRecoveryTarget(
  world: WorldState,
  loan: { lenderCorpId: string },
  countryId: string,
): { kind: "vault"; corpId: string } | { kind: "fund"; countryId: string } | null {
  const lender = world.corporations[loan.lenderCorpId];
  const lenderCharter = lender?.bankCharter;
  if (
    lender &&
    lenderCharter &&
    (lenderCharter.status === "active" ||
      (lenderCharter.status === "failed" && lenderCharter.depositorsResolvedTurn === null))
  ) {
    return { kind: "vault", corpId: loan.lenderCorpId };
  }
  if (world.depositInsurance[countryId]) return { kind: "fund", countryId };
  return null;
}
