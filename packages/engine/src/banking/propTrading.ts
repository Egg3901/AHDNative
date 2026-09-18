/**
 * Bank proprietary-trading book - #328 port of AHDGame
 * `src/lib/banking/propTrading.ts` (openPosition, closePosition,
 * markBook, forceLiquidateToLeverageCap, computePropEquityBase,
 * sumPositionMarks) at pinned revision
 * e364c04954ed628beef73a993a8e9e156650a31e.
 *
 * Synchronous WorldState mutation replaces the source's Mongo ceremony
 * (conditional updateOne gates, emitTx legs, getCurrentTurn reads): solo has
 * no concurrent writers, so every refusal below returns BEFORE mutating and
 * the session commits the clone only on success - the same atomicity shape
 * the nomination commands already use (see src/game/session.ts).
 *
 * Scope (cited residuals, not silently dropped):
 * - Assets: equity only. The source prices equity/bond/indexUnit/forex; solo
 *   has no index funds, no multi-currency FX conversion for a bank book, and
 *   its bond market carries holder/float mechanics whose interaction with a
 *   bank book belongs to the full #326-#328 transaction wave. Opens naming a
 *   non-equity asset are refused with an explicit error.
 * - Eligibility: active investment/universal charters only (source
 *   isPropCharter). Seeded solo banks are retail (see npcBanks.ts), so no
 *   live bank can trade until a charter wave issues investment/universal
 *   charters - tests carry synthetic prop-enabled charters, the same pattern
 *   bankingTurn uses for synthetic named loans.
 * - B7 supervision gate (capitalStanding mayDistribute refusal): no
 *   supervisory substrate exists in solo, so the gate is absent. The leverage
 *   cap below is the enforced risk limit.
 * - Prop-trading kill switch (source isBankPropTradingEnabled): solo has no
 *   prop switch (the banking feature flag gates the turn phases, not the
 *   desk), so every active investment/universal charter may trade.
 * - Per-currency forex cap: no forex asset, so nothing to cap.
 * - Interbank/margin servicing (#326/#327, unmerged): the equity-base terms
 *   exist as charter fields and are subtracted exactly as the source does,
 *   but no wave services those debts here.
 */

import type { WorldState } from "../types.js";
import type { BankCharter, BankCharterType, PropPosition } from "./types.js";
import { roundMoney } from "./constants.js";

/** Source: propTrading.ts PROP_LEVERAGE_MULTIPLE (verbatim, provisional). */
export const PROP_LEVERAGE_MULTIPLE = 3;

/** Dust below this is dropped rather than kept as a fractional position. Source: 1e-12 close tolerance. */
const POSITION_DUST = 1e-12;

export interface OpenPropPositionInput {
  bankCorpId: string;
  /** Equity corporation id (source also resolves tickers/names; solo ids are stable, so only ids). */
  ref: string;
  asset: string;
  units: number;
}

export type OpenPropPositionResult =
  | {
      ok: true;
      position: PropPosition;
      cost: number;
      cashReserves: number;
      propBookMarkValue: number;
    }
  | { ok: false; error: string };

export interface ClosePropPositionInput {
  bankCorpId: string;
  ref: string;
  asset: string;
  units: number;
}

export type ClosePropPositionResult =
  | {
      ok: true;
      proceeds: number;
      realizedPnl: number;
      cashReserves: number;
      propBookMarkValue: number;
    }
  | { ok: false; error: string };

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Charter type with absent-means-retail (pre-#328 saves and seeds carry no type). */
export function charterTypeOf(
  charter: BankCharter | undefined,
): BankCharterType {
  if (
    charter?.charterType === "investment" ||
    charter?.charterType === "universal"
  )
    return charter.charterType;
  return "retail";
}

/**
 * Source: isPropCharter (charterMay "proprietaryTrading") - investment and
 * universal charters only, and active. Retail charters never carry the
 * capability (source: src/lib/banking/rules/capabilities.ts BY_TYPE).
 */
export function isPropCharter(
  charter: BankCharter | undefined,
): charter is BankCharter {
  if (!charter || charter.status !== "active") return false;
  const type = charterTypeOf(charter);
  return type === "investment" || type === "universal";
}

/** Source: charterKinds.ts isDepositTakingCharter - retail and universal take deposits; investment does not. */
export function isDepositTakingCharter(
  charter: BankCharter | undefined,
): boolean {
  if (!charter || charter.status !== "active") return false;
  return charterTypeOf(charter) !== "investment";
}

/**
 * Source: computePropEquityBase - liquid cash + prop mark minus interbank
 * and CB margin debt. postedCapital is deliberately absent (it is a memo of
 * cash already inside cashReserves; adding both double-counts), and discount
 * window arrears/deposits/loans never enter (source verbatim).
 */
export function computePropEquityBase(
  cashReserves: number,
  charter: Pick<
    BankCharter,
    "propBookMarkValue" | "interbankDebt" | "cbMarginDebt" | "propBook"
  >,
  markValueOverride?: number,
): number {
  const liquid = Math.max(0, finiteOrZero(cashReserves));
  const mark =
    markValueOverride !== undefined
      ? Math.max(0, finiteOrZero(markValueOverride))
      : charter.propBookMarkValue !== undefined
        ? Math.max(0, finiteOrZero(charter.propBookMarkValue))
        : sumPositionMarks(charter.propBook);
  const interbank = Math.max(0, finiteOrZero(charter.interbankDebt ?? 0));
  const margin = Math.max(0, finiteOrZero(charter.cbMarginDebt ?? 0));
  return liquid + mark - interbank - margin;
}

/** Source: sumPositionMarks (verbatim fallbacks). */
export function sumPositionMarks(
  positions: PropPosition[] | undefined,
): number {
  if (!positions || positions.length === 0) return 0;
  let total = 0;
  for (const p of positions) {
    total += Math.max(0, finiteOrZero(p.markValue ?? p.costBasis));
  }
  return total;
}

/**
 * Live mark for one equity position: units x target sharePrice. Source:
 * markPositionValue equity branch (corporation.sharePrice in local currency;
 * solo has one currency per bank book, so no FX leg). Missing/invalid
 * targets mark at 0, exactly as the source's corp-not-found branch.
 */
export function markEquityPosition(
  world: WorldState,
  position: Pick<PropPosition, "ref" | "units">,
): number {
  const units = finiteOrZero(position.units);
  if (!(units > 0)) return 0;
  const target = world.corporations[position.ref];
  if (!target) return 0;
  const price = finiteOrZero(target.sharePrice);
  if (!(price > 0)) return 0;
  return roundMoney(units * price);
}

/** Fresh marks for every book row; pure (no mutation). Source: markBook. */
export function markPropBook(
  world: WorldState,
  charter: BankCharter,
): { positions: PropPosition[]; mark: number } {
  const book = charter.propBook ?? [];
  const positions = book.map((p) => ({
    ...p,
    markValue: markEquityPosition(world, p),
  }));
  return { positions, mark: sumPositionMarks(positions) };
}

function propDenial(
  world: WorldState,
  bankCorpId: string,
): { charter: BankCharter } | { ok: false; error: string } {
  const corp = world.corporations[bankCorpId];
  const charter = corp?.bankCharter;
  if (!charter)
    return { ok: false, error: "This corporation has no bank charter." };
  if (!isPropCharter(charter)) {
    return {
      ok: false,
      error: "Only active investment or universal charters may run a prop book",
    };
  }
  return { charter };
}

/**
 * Open (or add to) a prop position. Buys debit the bank's ring-fenced cash
 * at the live mark into cost basis; the market is the cash counterparty.
 * Every refusal returns before mutation. Source: openPosition (B7 gate and
 * forex cap omitted - see file doc; leverage multiple verbatim).
 */
export function openPropPosition(
  world: WorldState,
  input: OpenPropPositionInput,
): OpenPropPositionResult {
  if (!Number.isFinite(input.units) || !(input.units > 0)) {
    return { ok: false, error: "Units must be a positive number" };
  }
  if (
    !input.ref ||
    typeof input.ref !== "string" ||
    input.ref.trim().length === 0
  ) {
    return { ok: false, error: "Position ref is required" };
  }
  if (input.asset !== "equity") {
    return {
      ok: false,
      error: `Prop positions in ${input.asset} are not supported yet`,
    };
  }
  const denied = propDenial(world, input.bankCorpId);
  if ("error" in denied) return denied;
  const charter = denied.charter;

  const ref = input.ref.trim();
  const target = world.corporations[ref];
  if (!target) return { ok: false, error: "Equity corporation not found" };
  const cost = markEquityPosition(world, { ref, units: input.units });
  if (!(cost > 0)) {
    return {
      ok: false,
      error: "Could not price position (missing market data)",
    };
  }

  const liquid = Math.max(0, finiteOrZero(charter.cashReserves));
  if (cost > liquid + 1e-9) {
    return { ok: false, error: "Insufficient liquid capital for purchase" };
  }

  const marked = markPropBook(world, charter);
  const nextBook = marked.positions.map((p) => ({ ...p }));
  const existingIdx = nextBook.findIndex(
    (p) => p.asset === "equity" && p.ref === ref,
  );
  if (existingIdx >= 0) {
    const prev = nextBook[existingIdx]!;
    nextBook[existingIdx] = {
      ...prev,
      units: prev.units + input.units,
      costBasis: roundMoney(prev.costBasis + cost),
      markValue: roundMoney((prev.markValue ?? prev.costBasis) + cost),
    };
  } else {
    nextBook.push({
      asset: "equity",
      ref,
      units: input.units,
      costBasis: cost,
      markValue: cost,
    });
  }

  const nextMark = sumPositionMarks(nextBook);
  const nextLiquid = roundMoney(liquid - cost);
  const equity = computePropEquityBase(nextLiquid, charter, nextMark);
  if (equity <= 0 || nextMark > PROP_LEVERAGE_MULTIPLE * equity + 1e-9) {
    return { ok: false, error: "Trade would breach prop leverage multiple" };
  }

  charter.cashReserves = nextLiquid;
  charter.propBook = nextBook;
  charter.propBookMarkValue = roundMoney(nextMark);
  const position = nextBook.find((p) => p.asset === "equity" && p.ref === ref)!;
  return {
    ok: true,
    position,
    cost,
    cashReserves: nextLiquid,
    propBookMarkValue: charter.propBookMarkValue,
  };
}

/**
 * Close units of a prop position at the live mark. Credits the bank's
 * reserves; realized P&L is proceeds vs pro-rata cost basis. Closing stays
 * open to every prop charter (source: no standing gate on the sell path).
 * Source: closePosition (verbatim math).
 */
export function closePropPosition(
  world: WorldState,
  input: ClosePropPositionInput,
): ClosePropPositionResult {
  if (!Number.isFinite(input.units) || !(input.units > 0)) {
    return { ok: false, error: "Units must be a positive number" };
  }
  if (input.asset !== "equity") {
    return {
      ok: false,
      error: `Prop positions in ${input.asset} are not supported yet`,
    };
  }
  const denied = propDenial(world, input.bankCorpId);
  if ("error" in denied) return denied;
  const charter = denied.charter;

  const book = charter.propBook ?? [];
  const idx = book.findIndex(
    (p) => p.asset === "equity" && p.ref === input.ref,
  );
  if (idx < 0) return { ok: false, error: "Position not found" };
  const held = book[idx]!;
  if (input.units > held.units + 1e-12) {
    return { ok: false, error: "Cannot close more units than held" };
  }

  const proceeds = markEquityPosition(world, {
    ref: input.ref,
    units: input.units,
  });
  const fraction = input.units / held.units;
  const costReleased = held.costBasis * fraction;
  const realizedPnl = roundMoney(proceeds - costReleased);

  const nextBook = book.map((p) => ({ ...p }));
  if (input.units >= held.units - POSITION_DUST) {
    nextBook.splice(idx, 1);
  } else {
    const prev = nextBook[idx]!;
    nextBook[idx] = {
      ...prev,
      units: prev.units - input.units,
      costBasis: roundMoney(prev.costBasis - costReleased),
      markValue: Math.max(
        0,
        roundMoney((prev.markValue ?? prev.costBasis) - proceeds),
      ),
    };
  }

  const nextMark = roundMoney(sumPositionMarks(nextBook));
  const nextLiquid = roundMoney(
    Math.max(0, finiteOrZero(charter.cashReserves)) + proceeds,
  );
  charter.cashReserves = nextLiquid;
  charter.propBook = nextBook;
  charter.propBookMarkValue = nextMark;
  return {
    ok: true,
    proceeds,
    realizedPnl,
    cashReserves: nextLiquid,
    propBookMarkValue: nextMark,
  };
}

/**
 * Proportionally shrink every position so mark <= PROP_LEVERAGE_MULTIPLE x
 * equityBase. Sells at current marks (cash back, positions shrunk); equity
 * is unchanged at flat marks while leverage falls with the mark side.
 * Source: forceLiquidateToLeverageCap (verbatim shrink math).
 */
export function forceLiquidateToLeverageCap(
  world: WorldState,
  bankCorpId: string,
): { forced: boolean; cashReserves: number; propBookMarkValue: number } {
  const corp = world.corporations[bankCorpId];
  const charter = corp?.bankCharter;
  if (!charter) return { forced: false, cashReserves: 0, propBookMarkValue: 0 };
  const cashReserves = Math.max(0, finiteOrZero(charter.cashReserves));
  const marked = markPropBook(world, charter);
  const equity = computePropEquityBase(cashReserves, charter, marked.mark);
  const cap = PROP_LEVERAGE_MULTIPLE * Math.max(0, equity);
  if (!(marked.mark > cap + 1e-9) || marked.mark <= 0) {
    charter.propBook = marked.positions;
    charter.propBookMarkValue = roundMoney(marked.mark);
    return {
      forced: false,
      cashReserves,
      propBookMarkValue: charter.propBookMarkValue,
    };
  }

  const keepFraction = Math.max(0, Math.min(1, cap / marked.mark));
  let cashBack = 0;
  const nextPositions: PropPosition[] = [];
  for (const p of marked.positions) {
    const mark = Math.max(0, finiteOrZero(p.markValue ?? p.costBasis));
    cashBack += mark * (1 - keepFraction);
    const keepUnits = p.units * keepFraction;
    if (keepUnits <= POSITION_DUST) continue;
    nextPositions.push({
      asset: p.asset,
      ref: p.ref,
      units: keepUnits,
      costBasis: roundMoney(p.costBasis * keepFraction),
      markValue: roundMoney(mark * keepFraction),
    });
  }

  const nextMark = roundMoney(sumPositionMarks(nextPositions));
  const nextLiquid = roundMoney(cashReserves + cashBack);
  charter.cashReserves = nextLiquid;
  charter.propBook = nextPositions;
  charter.propBookMarkValue = nextMark;
  return {
    forced: true,
    cashReserves: nextLiquid,
    propBookMarkValue: nextMark,
  };
}

/**
 * Source: rules/solvency.ts propBankFails - an investment bank fails when
 * red with no equity left behind its book.
 */
export function propBankFails(input: {
  band: "green" | "amber" | "red";
  equityBase: number;
}): boolean {
  return input.band === "red" && input.equityBase <= 0;
}
