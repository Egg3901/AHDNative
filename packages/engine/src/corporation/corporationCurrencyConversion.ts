import type { WorldState } from "../types.js";
import type { Corporation } from "./types.js";
import { resolveCountryCurrency } from "../bonds/denomination.js";
import { getRateForCountry } from "../forex/conversion.js";
import { seedCorporateSectorAssets } from "./corporateSectorAssets.js";

export const SOURCE_CORPORATE_RELOCATION_FX_SPREAD = 0.005;

export interface CorporationCurrencyConversionQuote {
  fromCurrency: string;
  toCurrency: string;
  fromRate: number;
  toRate: number;
  scale: number;
  changesCurrency: boolean;
}

/** Source uses the corporation currency code when present and the country default for legacy issuers. */
export function quoteCorporationCurrencyConversion(
  world: WorldState,
  corporation: Corporation,
  sourceCountryId: string,
  destinationCountryId: string,
): CorporationCurrencyConversionQuote | { error: string } {
  const fromCurrency = corporation.liquidCurrencyCode ?? resolveCountryCurrency(world, sourceCountryId);
  const toCurrency = resolveCountryCurrency(world, destinationCountryId);
  const changesCurrency = fromCurrency !== toCurrency;
  if (changesCurrency && corporation.bankCharter) {
    return { error: "A chartered bank relocation requires conversion of the source bank loan and depositor books" };
  }
  const fromRate = getRateForCountry(world, sourceCountryId);
  const toRate = getRateForCountry(world, destinationCountryId);
  if (!(Number.isFinite(fromRate) && fromRate > 0 && Number.isFinite(toRate) && toRate > 0)) {
    return { error: `Exchange rate unavailable for ${fromCurrency}→${toCurrency} conversion` };
  }
  const numericFields: Array<keyof Corporation> = ["liquidCapital", "sharePrice", "fundamentalSharePrice"];
  if (numericFields.some((field) => {
    const value = corporation[field];
    return typeof value !== "number" || !Number.isFinite(value);
  })) {
    return { error: "Corporation has invalid financial values; currency conversion was refused" };
  }
  if (changesCurrency) {
    const assets = world.corporateSectors ?? seedCorporateSectorAssets(world);
    for (const asset of Object.values(assets).filter((row) => row.corporationId === corporation.id && row.owner === "corporation")) {
      if ([asset.revenue, asset.realizedRevenue].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
        return { error: `Corporate sector ${asset.id} has invalid local-currency values; currency conversion was refused` };
      }
      const pnl = asset.plantsPnl;
      if (pnl && [pnl.revenue, pnl.inputs, pnl.labour, pnl.upkeep, pnl.otherOpex, pnl.otherOpexUncapped, pnl.financialLegs, pnl.compliance, pnl.policyCredit, pnl.growth, pnl.operatingCost, pnl.totalCost, pnl.profit]
        .some((value) => value !== undefined && !Number.isFinite(value))) {
        return { error: `Corporate sector ${asset.id} has invalid plant P&L values; currency conversion was refused` };
      }
    }
  }
  return { fromCurrency, toCurrency, fromRate, toRate, scale: changesCurrency ? toRate / fromRate : 1, changesCurrency };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Convert only current issuer-currency balances; source history remains in its recorded denomination. */
export function applyCorporationCurrencyConversion(
  world: WorldState,
  corporation: Corporation,
  quote: CorporationCurrencyConversionQuote,
): void {
  if (!quote.changesCurrency) {
    corporation.liquidCurrencyCode = quote.toCurrency;
    return;
  }
  const multiplyOptional = (key: keyof Corporation): void => {
    const value = corporation[key];
    if (typeof value === "number") (corporation as unknown as Record<string, unknown>)[key] = round2(value * quote.scale);
  };
  for (const field of [
    "liquidCapital", "ceoSalaryPerTurn",
  ] as const) multiplyOptional(field);
  corporation.sharePrice = round4(corporation.sharePrice * quote.scale);
  corporation.fundamentalSharePrice = round4(corporation.fundamentalSharePrice * quote.scale);
  const assets = world.corporateSectors ?? seedCorporateSectorAssets(world);
  world.corporateSectors = assets;
  for (const asset of Object.values(assets).filter((row) => row.corporationId === corporation.id && row.owner === "corporation")) {
    if (asset.revenue !== undefined) asset.revenue = round2(asset.revenue * quote.scale);
    if (asset.realizedRevenue !== undefined) asset.realizedRevenue = round2(asset.realizedRevenue * quote.scale);
    if (asset.plantsPnl) {
      for (const field of ["revenue", "inputs", "labour", "upkeep", "otherOpex", "otherOpexUncapped", "financialLegs", "compliance", "policyCredit", "growth", "operatingCost", "totalCost", "profit"] as const) {
        const value = asset.plantsPnl[field];
        if (value !== undefined) asset.plantsPnl[field] = round2(value * quote.scale);
      }
    }
  }
  // Source history rows carry their own currencyCode and remain historical
  // values. Old Native rows had no code, so this boundary stamps the currency
  // they were recorded in before later current-currency rows are written.
  if (corporation.priceHistory !== undefined) {
    corporation.priceHistory = corporation.priceHistory.map((point) => ({
      ...point,
      currencyCode: point.currencyCode ?? quote.fromCurrency,
    }));
  }
  corporation.liquidCurrencyCode = quote.toCurrency;
}
