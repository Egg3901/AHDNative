import type { Corporation } from "../corporation/types.js";

/** Apply source fundFloatTradePlan custody to both the fund and issuer portfolio views. */
export function applyIndexFundEquityCustody(corporation: Corporation, fundSlug: string, deltaShares: number, priceLocal: number): void {
  if (!Number.isSafeInteger(deltaShares) || deltaShares === 0 || !Number.isFinite(priceLocal) || priceLocal <= 0 || !fundSlug) {
    throw new Error("Invalid index fund equity custody movement");
  }
  const rows = corporation.shareholders.filter((row) => row.holder === "fund" && row.fundSlug === fundSlug);
  if (rows.length > 1) throw new Error(`Duplicate fund shareholder row ${corporation.id}/${fundSlug}`);
  const holding = rows[0];
  const current = holding?.shares ?? 0;
  const next = current + deltaShares;
  if (!Number.isSafeInteger(next) || next < 0) throw new Error(`Insufficient issuer custody for ${corporation.id}/${fundSlug}`);
  if (next === 0) {
    if (holding) corporation.shareholders = corporation.shareholders.filter((row) => row !== holding);
    return;
  }
  if (!holding) {
    corporation.shareholders.push({ holder: "fund", fundSlug, shares: next, avgCostPerShare: priceLocal });
    return;
  }
  if (deltaShares > 0) {
    const priorCost = holding.avgCostPerShare ?? priceLocal;
    holding.avgCostPerShare = (current * priorCost + deltaShares * priceLocal) / next;
  }
  holding.shares = next;
}
