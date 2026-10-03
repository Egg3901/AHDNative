import type { Region } from "../types.js";
import type { SourceStateBudgetSnapshot } from "./types.js";

const NG_SOURCE_TAX_RATES = {
  incomeTax: 5,
  salesTax: 6,
  domesticCorporateTax: 6,
  foreignCorporateTax: 6,
  propertyTax: 1,
} as const;

const SOURCE_FISCAL_YEAR: Readonly<Record<string, number>> = {
  "1953": 1953,
  "1979": 1979,
  "1991": 1991,
  "1999": 1991,
  "2007": 1991,
  "2019": 2019,
  "2023": 2019,
};

/** Source `generateStateBudgets` seed for a source-authored regional GDP row. */
export function createSourceStateBudgetSnapshot(
  region: Region,
  era: string,
): SourceStateBudgetSnapshot | undefined {
  const input = region.sourceGdp;
  if (region.countryId !== "NG" || !input) return undefined;
  const fiscalYear = Number(era);
  const sourceFiscalYear = SOURCE_FISCAL_YEAR[era];
  if (!Number.isSafeInteger(fiscalYear) || sourceFiscalYear === undefined) return undefined;
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.unit !== "millions" || !input.currencyCode) {
    throw new Error(`Invalid source State.gdp input for ${era}/${region.id}`);
  }

  // Game's generateStateBudgets treats State.gdp literally as the calculation
  // base × 1,000,000; the source writer does not convert this value by FX.
  const stateGdp = input.amount * 1_000_000;
  const taxBases = {
    taxableIncome: stateGdp * 0.35,
    taxableSales: stateGdp * 0.55,
    domesticCorporateProfits: stateGdp * 0.06,
    foreignCorporateProfits: stateGdp * 0.02,
    propertyValue: stateGdp * 3,
  };
  const revenue = {
    incomeTax: taxBases.taxableIncome * NG_SOURCE_TAX_RATES.incomeTax / 100,
    salesTax: taxBases.taxableSales * NG_SOURCE_TAX_RATES.salesTax / 100,
    domesticCorporateTax: taxBases.domesticCorporateProfits * NG_SOURCE_TAX_RATES.domesticCorporateTax / 100,
    foreignCorporateTax: taxBases.foreignCorporateProfits * NG_SOURCE_TAX_RATES.foreignCorporateTax / 100,
    propertyTax: taxBases.propertyValue * NG_SOURCE_TAX_RATES.propertyTax / 100,
    federalGrants: stateGdp * 0.012,
    other: 0,
    total: 0,
  };
  revenue.total = revenue.incomeTax + revenue.salesTax + revenue.domesticCorporateTax +
    revenue.foreignCorporateTax + revenue.propertyTax + revenue.federalGrants;
  const spending = {
    byCategory: {
      education: revenue.total * 0.35,
      healthcare: revenue.total * 0.25,
      transportation: revenue.total * 0.15,
      publicSafety: revenue.total * 0.12,
      other: revenue.total * 0.13,
    },
    total: revenue.total,
  };

  return {
    source: "AHDGame.generateStateBudgets",
    fiscalYear,
    sourceFiscalYear,
    stateGdp,
    gdpInput: { ...input },
    amountBasis: "literal-state-gdp-times-one-million-no-fx",
    taxBases,
    taxRates: { ...NG_SOURCE_TAX_RATES },
    revenue,
    spending,
    balance: 0,
    surplus: 0,
  };
}

export function seedSourceStateBudgets(
  regions: Record<string, Region>,
  era: string,
): Record<string, SourceStateBudgetSnapshot> {
  const result: Record<string, SourceStateBudgetSnapshot> = {};
  for (const [regionId, region] of Object.entries(regions)) {
    const snapshot = createSourceStateBudgetSnapshot(region, era);
    if (snapshot) result[regionId] = snapshot;
  }
  return result;
}
