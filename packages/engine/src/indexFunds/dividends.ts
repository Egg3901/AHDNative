import type { Corporation } from "../corporation/types.js";
import type { PlayerCharacter } from "../types.js";
import type { IndexFundBook } from "./types.js";

/**
 * Source dividendPassThrough.ts receives the fund's pro-rata issuer payment,
 * retains 75%, then distributes 25% per unit to non-reserve positions. Native
 * currently has one reachable character holder; NPP/imperial custody remains
 * outside the represented single-player account model.
 */
export function settleIndexFundDividend(input: {
  book: IndexFundBook | undefined;
  corporation: Corporation;
  corporationCurrencyCode: string;
  dividendPoolAnchor: number;
  player: PlayerCharacter;
  playerCurrencyCode: string;
  foreignExchangeEnabled: boolean;
  exchangeRates?: Record<string, { rate: number; currencyCode: string }>;
  corporationLocalPerAnchor?: number;
  turn: number;
}): number {
  const { book, corporation, corporationCurrencyCode, dividendPoolAnchor, player, playerCurrencyCode, foreignExchangeEnabled, exchangeRates, corporationLocalPerAnchor, turn } = input;
  const corpRate = Number.isFinite(corporationLocalPerAnchor) && (corporationLocalPerAnchor ?? 0) > 0
    ? corporationLocalPerAnchor!
    : Object.values(exchangeRates ?? {}).find((row) => row.currencyCode === corporationCurrencyCode)?.rate ?? (corporationCurrencyCode === "USD" ? 1 : undefined);
  if (!book || !Number.isFinite(dividendPoolAnchor) || dividendPoolAnchor <= 0 || corporation.totalShares <= 0 || !Number.isFinite(corpRate) || (corpRate ?? 0) <= 0) return 0;

  let dividendReceived = 0;
  for (const fund of Object.values(book.funds)) {
    if (fund.status !== "active") continue;
    const holding = fund.holdings[corporation.id];
    if (!holding || holding.shares <= 0 || holding.shares > corporation.totalShares || fund.unitSupply <= 0) continue;
    const gross = (dividendPoolAnchor / corpRate!) * (holding.shares / corporation.totalShares);
    if (!Number.isFinite(gross) || gross <= 0) continue;

    const passThroughPool = gross * 0.25;
    let paidOut = 0;
    let paidUnits = 0;
    const playerPositions = book.positions.filter((position) =>
      position.fundSlug === fund.slug && position.holderKind === "player" && position.holderId === "player" && position.units > 0,
    );
    const canCreditHome = playerCurrencyCode === fund.currencyCode;
    const canCreditForeign = foreignExchangeEnabled;
    const fundRate = foreignExchangeEnabled
      ? Object.values(exchangeRates ?? {}).find((row) => row.currencyCode === fund.currencyCode)?.rate ?? 1
      : 1;
    for (const position of playerPositions) {
      if (!canCreditHome && !canCreditForeign) continue;
      const payoutAnchor = Math.floor((position.units * passThroughPool / fund.unitSupply) * 100) / 100;
      if (payoutAnchor <= 0) continue;
      const payout = payoutAnchor * fundRate;
      if (canCreditHome) player.cash += payout;
      else {
        player.currencyBalances ??= { personal: {} };
        const personal = player.currencyBalances.personal;
        personal[fund.currencyCode] = (personal[fund.currencyCode] ?? 0) + payout;
      }
      paidOut += payoutAnchor;
      paidUnits += position.units;
    }

    // The source adds the 75% reinvestment and returns any pass-through cents
    // not paid to a holder to the same fund cash account.
    fund.cashAnchor += gross - paidOut;
    const suffix = book.transactions.length + 1;
    book.transactions.push({
      id: `fund-${turn}-${suffix}`,
      turn,
      fundSlug: fund.slug,
      kind: "dividendReceipt",
      corporationId: corporation.id,
      units: holding.shares,
      cashAnchor: gross,
    });
    if (paidOut > 0) {
      book.transactions.push({
        id: `fund-${turn}-${suffix + 1}`,
        turn,
        fundSlug: fund.slug,
        kind: "dividendPayout",
        corporationId: corporation.id,
        units: paidUnits,
        cashAnchor: paidOut,
      });
    }
    dividendReceived += gross;
  }
  return dividendReceived;
}
