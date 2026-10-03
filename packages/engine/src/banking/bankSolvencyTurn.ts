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
 * Treasury backstop is recorded in the existing country budget in the source
 * `depositBookReturn.ts` "depositInsurance" category when the insurance fund
 * cannot cover a cash-backed household claim.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import { sumInterbankDefaultsLastTurn, writeOffLenderSideInterbankOnFailure } from "./interbank.js";
import {
  CONTAGION_PANIC_TURNS,
  FLIGHT_RATE_BY_BAND,
  RESERVE_REQUIREMENT,
  RUN_FAILURE_COVER_FRACTION,
  computeConfidence,
} from "./constants.js";
import { discountWindowStigma } from "./discountWindow.js";
import { worldBankDeposits } from "./worldDeposits.js";
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
    if (!world.featureFlags.banking) return;
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
  const propRunning = world.bankPropTradingEnabled !== false && isPropCharter(charter);
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

  const deposits = worldBankDeposits(world, corp);
  const { confidence, band } = computeConfidence({
    cashReserves: charter.cashReserves,
    cashBackedDeposits: deposits.cashBackedDeposits,
    totalLoans: charter.totalLoans,
    reserveRatioRequired: RESERVE_REQUIREMENT,
    arrearsOutstanding,
    defaultsLastTurn,
    panicTurns: charter.panicTurns,
    // #327: borrowing from the lender of last resort reads as a bank that
    // could not fund itself elsewhere (rules/confidence.ts). Zero for a bank
    // that never drew, so pre-#327 scoring is unchanged.
    discountWindowStigma: discountWindowStigma({ ...charter, npcDeposits: deposits.cashBackedDeposits }),
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
    const currentCashBackedDeposits = Math.max(0, charter.npcDeposits) + deposits.authoritativePlayerDeposits;
    const requiredLiquidity = RESERVE_REQUIREMENT * currentCashBackedDeposits;
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
 * NPC deposits are always cash-backed; player deposits join that household
 * claim only in their authoritative currency read cohort. The senior central-
 * bank window claim (debt + arrears, #327) is settled first, then estate cash
 * pays the household pool, the insurance fund pays its available balance,
 * and the source Treasury backstop covers any remaining shortfall. Current
 * Game depositBookReturn.ts does not cap this bank-level payout at insuredCap.
 *
 * In the absent/off pointer rollout, player savings never left the wallet,
 * so failure changes only the holder pointer. In the authoritative currency
 * cohort, the live player balance is a cash-backed claim: it joins the NPC
 * household tier after senior facilities, and its backing returns to the
 * central-bank pool before the holder pointer changes.
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
  // Source 595a3b8 depositBookReturn.ts: margin and window (principal plus
  // arrears) share one senior CB tier. Recovered cash burns; the unpaid
  // claim is extinguished without burning money that was never recovered.
  const windowOwed =
    (typeof charter.discountWindowDebt === "number" && Number.isFinite(charter.discountWindowDebt)
      ? Math.max(0, charter.discountWindowDebt)
      : 0) +
    (typeof charter.discountWindowArrears === "number" && Number.isFinite(charter.discountWindowArrears)
      ? Math.max(0, charter.discountWindowArrears)
      : 0);
  const marginOwed = Math.max(0, charter.cbMarginDebt ?? 0) + Math.max(0, charter.cbMarginArrears ?? 0);
  const centralBankPaid = Math.min(available, windowOwed + marginOwed);
  available -= centralBankPaid;
  if (bank && centralBankPaid > 0) bank.netMoneyCreatedLifetime = (bank.netMoneyCreatedLifetime ?? 0) - centralBankPaid;
  charter.discountWindowDebt = 0;
  charter.discountWindowArrears = 0;
  charter.cbMarginDebt = 0;
  charter.cbMarginArrears = 0;

  const playerClaim = worldBankDeposits(world, corp).authoritativePlayerDeposits;
  let npcClaim = Math.max(0, charter.npcDeposits) + playerClaim;

  const fromCash = Math.min(available, npcClaim);
  available -= fromCash;
  npcClaim -= fromCash;
  if (bank) bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + fromCash);

  const fund = world.depositInsurance[corp.countryId];
  let fromFund = 0;
  if (fund && npcClaim > 0) {
    fromFund = Math.min(fund.balance, npcClaim);
    if (fromFund > 0) {
      fund.balance -= fromFund;
      fund.payoutsLifetime += fromFund;
      if (bank) bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + fromFund);
      npcClaim -= fromFund;
      summary.insurancePaid += fromFund;
    }
  }
  const budget = world.budgets[corp.countryId];
  const fromTreasury = budget ? npcClaim : 0;
  if (fromTreasury > 0) {
    budget!.treasuryBalance -= fromTreasury;
    budget!.spending.byCategory.depositInsurance =
      (budget!.spending.byCategory.depositInsurance ?? 0) + fromTreasury;
    budget!.spending.total += fromTreasury;
    budget!.surplus -= fromTreasury;
    if (fund) {
      fund.payoutsLifetime += fromTreasury;
    }
    if (bank) bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + fromTreasury);
    summary.insurancePaid += fromTreasury;
    npcClaim = 0;
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
