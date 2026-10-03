import type { Corporation } from "../corporation/types.js";
import type { PlayerCharacter } from "../types.js";
import type { IndexFundBook } from "./types.js";

/**
 * Source dividendPassThrough.ts receives the fund's pro-rata issuer payment,
 * retains 75%, then distributes 25% per unit to non-reserve positions. This
 * Native adapter supports the represented USD fund and player holder only;
 * unsupported holder/currency legs remain in fund cash rather than being
 * credited to a fabricated account.
 */
export function settleIndexFundDividend(input: {
  book: IndexFundBook | undefined;
  corporation: Corporation;
  corporationCurrencyCode: string;
  dividendPoolAnchor: number;
  player: PlayerCharacter;
  playerCurrencyCode: string;
  foreignExchangeEnabled: boolean;
  turn: number;
}): number {
  const { book, corporation, corporationCurrencyCode, dividendPoolAnchor, player, playerCurrencyCode, foreignExchangeEnabled, turn } = input;
  if (!book || !Number.isFinite(dividendPoolAnchor) || dividendPoolAnchor <= 0 || corporation.totalShares <= 0) return 0;

  let dividendReceived = 0;
  for (const fund of Object.values(book.funds)) {
    if (fund.status !== "active" || fund.countryId !== corporation.countryId || fund.currencyCode !== corporationCurrencyCode) continue;
    const holding = fund.holdings[corporation.id];
    if (!holding || holding.shares <= 0 || holding.shares > corporation.totalShares || fund.unitSupply <= 0) continue;
    const gross = dividendPoolAnchor * (holding.shares / corporation.totalShares);
    if (!Number.isFinite(gross) || gross <= 0) continue;

    const passThroughPool = gross * 0.25;
    let paidOut = 0;
    let paidUnits = 0;
    const playerPositions = book.positions.filter((position) =>
      position.fundSlug === fund.slug && position.holderKind === "player" && position.holderId === "player" && position.units > 0,
    );
    const canCreditHome = playerCurrencyCode === fund.currencyCode;
    const canCreditForeign = foreignExchangeEnabled;
    for (const position of playerPositions) {
      if (!canCreditHome && !canCreditForeign) continue;
      const payout = Math.floor((position.units * passThroughPool / fund.unitSupply) * 100) / 100;
      if (payout <= 0) continue;
      if (canCreditHome) player.cash += payout;
      else {
        player.currencyBalances ??= { personal: {} };
        const personal = player.currencyBalances.personal;
        personal[fund.currencyCode] = (personal[fund.currencyCode] ?? 0) + payout;
      }
      paidOut += payout;
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
