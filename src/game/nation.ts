import { getLaw, type WorldState } from "@ahdclient/engine";

/** One recorded national economy point from WorldState.history.macro. */
export interface NationMacroHistoryPoint {
  turn: number;
  gdpMillions: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  outputGap: number;
}

/** One recorded central-bank policy-rate point from WorldState.history.primeRate. */
export interface NationPrimeRateHistoryPoint {
  turn: number;
  primeRate: number;
}

export interface NationEconomyView {
  /** Country.economy.gdp. Engine units are millions of in-game dollars. */
  gdpMillions: number;
  /** Country.economy annualized rate, stored as a fraction. */
  growthRate: number;
  /** Country.economy annualized rate, stored as a fraction. */
  inflationRate: number;
  /** Country.economy annualized rate, stored as a fraction. */
  unemploymentRate: number;
  /** Country.economy output gap, stored as percentage points. */
  outputGap: number;
  /** CentralBank.primeRate, percentage points, when a bank exists for the country. */
  primeRate: number | null;
  /** Bounded engine history, oldest point first. */
  macroHistory: NationMacroHistoryPoint[];
  /** Bounded engine history, oldest point first. */
  primeRateHistory: NationPrimeRateHistoryPoint[];
}

export interface NationTaxRateView {
  id: string;
  label: string;
  /** CountryBudget.taxRates values are percentage points, not fractions. */
  ratePercent: number;
}

export interface NationMoneyLine {
  id: string;
  label: string;
  /** Absolute local-currency units, matching CountryBudget values. */
  amount: number;
  /** Present for a revenue line governed by a recorded tax rate. */
  taxRatePercent?: number;
  /** Present when the engine records the corresponding tax base. */
  taxBase?: number;
}

export interface NationDebtView {
  /** Absolute local-currency units. */
  principal: number;
  /** Stored as a fraction, for example 0.02 = 2%. */
  interestRate: number;
  /** Absolute local-currency units. */
  ceiling: number;
  /** Optional engine mirror. No ratio is invented when the save omits it. */
  debtToGdpRatio: number | null;
  creditRating: string;
}

export interface NationBudgetView {
  fiscalYear: number;
  /** CountryBudget.gdp. Absolute local-currency units. */
  gdpAbsolute: number;
  population: number;
  currency: string;
  taxRates: NationTaxRateView[];
  revenue: {
    components: NationMoneyLine[];
    total: number;
  };
  spending: {
    categories: NationMoneyLine[];
    stateGrants: number;
    debtInterest: number;
    total: number;
  };
  /** Cached CountryBudget revenue.total - spending.total. */
  surplus: number;
  /** Signed CountryBudget treasury balance. Negative values represent debt. */
  treasuryBalance: number;
  debt: NationDebtView;
}

export interface NationPolicyView {
  /** Current tax rates are included even when no bill has yet been enacted. */
  taxRates: NationTaxRateView[];
  /** Current national laws only. Regional laws are outside this nation surface. */
  enacted: NationPolicySetting[];
}

export interface NationPolicySetting {
  /** Catalog legislation id when known, otherwise the stored law id. */
  id: string;
  title: string;
  category: string | null;
  scope: "national";
  level: number | null;
  optionName: string | null;
  optionDescription: string | null;
  enactedTurn: number;
  /** Enactment timestamp is absent on EnactedLaw rows that carry only a turn. */
  enactedAt: string | null;
}

export interface NationView {
  countryId: string;
  countryName: string;
  currency: string;
  economy: NationEconomyView;
  budget: NationBudgetView;
  policy: NationPolicyView;
}

const REVENUE_LABELS: Record<string, string> = {
  incomeTax: "Income tax",
  domesticCorporateTax: "Domestic corporate tax",
  foreignCorporateTax: "Foreign corporate tax",
  payrollTax: "Payroll tax",
  tariffs: "Tariffs",
  salesTax: "Sales tax",
  other: "Other revenue",
};

const TAX_BASES: Record<string, string> = {
  incomeTax: "taxableIncome",
  domesticCorporateTax: "domesticCorporateProfits",
  foreignCorporateTax: "foreignCorporateProfits",
  payrollTax: "wagesAndSalaries",
  tariffs: "importValue",
  salesTax: "taxableSales",
};

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function labelForRevenue(key: string): string {
  return REVENUE_LABELS[key] ?? humanizeKey(key);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function projectTaxRates(budget: WorldState["budgets"][string]): NationTaxRateView[] {
  return Object.entries(budget.taxRates)
    .filter(([, value]) => Number.isFinite(value))
    .map(([id, value]) => ({ id, label: humanizeKey(id), ratePercent: value }));
}

function projectRevenue(budget: WorldState["budgets"][string]): NationMoneyLine[] {
  return Object.entries(budget.revenue)
    .filter(([id, value]) => id !== "total" && Number.isFinite(value))
    .map(([id, value]) => {
      const taxRatePercent = finiteOrNull((budget.taxRates as unknown as Record<string, number>)[id]);
      const taxBaseKey = TAX_BASES[id];
      const taxBase = taxBaseKey ? finiteOrNull(budget.taxBases[taxBaseKey as keyof typeof budget.taxBases]) : null;
      return {
        id,
        label: labelForRevenue(id),
        amount: value,
        ...(taxRatePercent !== null ? { taxRatePercent } : {}),
        ...(taxBase !== null ? { taxBase } : {}),
      };
    });
}

function projectSpending(budget: WorldState["budgets"][string]): NationMoneyLine[] {
  return Object.entries(budget.spending.byCategory)
    .filter(([, value]) => Number.isFinite(value))
    .map(([id, amount]) => ({ id, label: humanizeKey(id), amount }));
}

interface PolicyCandidate {
  id: string;
  level: number | null;
  enactedTurn: number;
  enactedAt: string | null;
  sourceOrder: number;
  repealed: boolean;
  expired: boolean;
}

function activePolicyCandidates(world: WorldState, countryId: string): PolicyCandidate[] {
  const candidates: PolicyCandidate[] = [];

  for (const law of world.enactedLaws) {
    if (law.countryId !== countryId || law.scope !== "national") continue;
    candidates.push({
      id: law.id,
      level: finiteOrNull(law.level),
      enactedTurn: law.enactedAtTurn,
      enactedAt: null,
      sourceOrder: 0,
      repealed: law.repealedAtTurn !== undefined,
      expired: law.expiresAtTurn != null && law.expiresAtTurn <= world.meta.turn,
    });
  }

  for (const entry of Object.values(world.policyLedger)) {
    if (entry.countryId !== countryId || entry.scope !== "national") continue;
    const level = Number(entry.policyOptionId);
    candidates.push({
      id: entry.legislationTypeId,
      level: Number.isFinite(level) ? level : null,
      enactedTurn: entry.enactedTurn,
      enactedAt: entry.enactedAt,
      sourceOrder: 1,
      repealed: false,
      expired: false,
    });
  }

  return candidates.filter((candidate) => !candidate.repealed && !candidate.expired);
}

function projectPolicies(world: WorldState, countryId: string): NationPolicySetting[] {
  const current = new Map<string, PolicyCandidate>();
  for (const candidate of activePolicyCandidates(world, countryId)) {
    const previous = current.get(candidate.id);
    if (
      !previous
      || candidate.enactedTurn > previous.enactedTurn
      || (candidate.enactedTurn === previous.enactedTurn && candidate.sourceOrder > previous.sourceOrder)
    ) {
      current.set(candidate.id, candidate);
    }
  }

  return [...current.values()]
    .sort((a, b) => b.enactedTurn - a.enactedTurn || a.id.localeCompare(b.id))
    .map((candidate) => {
      const law = getLaw(candidate.id);
      const option = candidate.level != null && law?.levels ? law.levels[candidate.level] : undefined;
      return {
        id: candidate.id,
        title: law?.title ?? candidate.id,
        category: law?.category ?? null,
        scope: "national" as const,
        level: candidate.level,
        optionName: option?.name ?? null,
        optionDescription: option?.description ?? null,
        enactedTurn: candidate.enactedTurn,
        enactedAt: candidate.enactedAt,
      };
    });
}

/**
 * Projects the player's country into detached, read-only nation data.
 * All values come from WorldState or the imported legislation catalog. This
 * function never mutates the engine world and deliberately does not synthesize
 * a missing budget, policy, history point, or debt ratio.
 */
export function projectNation(world: WorldState): NationView {
  const countryId = world.player.countryId;
  const country = world.countries[countryId];
  if (!country || !country.playable) {
    throw new Error("The save does not contain the player's playable country.");
  }
  const budget = world.budgets[countryId];
  if (!budget) {
    throw new Error("The save does not contain the player's national budget.");
  }

  const bank = world.centralBanks[countryId];
  const macroHistory = (world.history.macro[countryId] ?? []).map((point) => ({
    turn: point.turn,
    gdpMillions: point.gdp,
    growthRate: point.growthRate,
    inflationRate: point.inflationRate,
    unemploymentRate: point.unemploymentRate,
    outputGap: point.outputGap,
  }));
  const primeRateHistory = (world.history.primeRate[countryId] ?? []).map((point) => ({
    turn: point.turn,
    primeRate: point.primeRate,
  }));
  const taxRates = projectTaxRates(budget);

  return {
    countryId: country.id,
    countryName: country.name,
    currency: budget.currencyCode,
    economy: {
      gdpMillions: country.economy.gdp,
      growthRate: country.economy.growthRate,
      inflationRate: country.economy.inflationRate,
      unemploymentRate: country.economy.unemploymentRate,
      outputGap: country.economy.outputGap,
      primeRate: finiteOrNull(bank?.primeRate),
      macroHistory,
      primeRateHistory,
    },
    budget: {
      fiscalYear: budget.fiscalYear,
      gdpAbsolute: budget.gdp,
      population: budget.population,
      currency: budget.currencyCode,
      taxRates,
      revenue: { components: projectRevenue(budget), total: budget.revenue.total },
      spending: {
        categories: projectSpending(budget),
        stateGrants: budget.spending.stateGrants,
        debtInterest: budget.spending.debtInterest,
        total: budget.spending.total,
      },
      surplus: budget.surplus,
      treasuryBalance: budget.treasuryBalance,
      debt: {
        principal: budget.debt.principal,
        interestRate: budget.debt.interestRate,
        ceiling: budget.debt.ceiling,
        debtToGdpRatio: finiteOrNull(budget.debtToGdpRatio),
        creditRating: budget.creditRating,
      },
    },
    policy: {
      taxRates,
      enacted: projectPolicies(world, countryId),
    },
  };
}
