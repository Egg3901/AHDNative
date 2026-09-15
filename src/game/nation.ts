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

/** Destination routes the budget and metrics registries deep-link into. */
export type NationDestination =
  | "economy"
  | "budget"
  | "policy"
  | "metrics"
  | "legislature"
  | "government"
  | "elections"
  | "nations";

/** One deep link out of a nation surface to its consequence destination. */
export interface NationLinkView {
  label: string;
  route: NationDestination;
}

/**
 * Country-specific fiscal vocabulary. Revenue/spending line labels name the
 * same recorded engine keys in each country's own terms (US "Defense" vs UK
 * "Defence", UK "National Insurance" vs US "Payroll Tax"), matching AHDGame's
 * COUNTRY_LABELS so a player reads the same terms as the reference.
 */
export interface NationBudgetLabels {
  title: string;
  revenueTitle: string;
  spendingTitle: string;
  debtTitle: string;
  ceilingLabel: string;
  debtServiceLabel: string;
  transferLabel: string;
  /** Country term per recorded CountryBudget.revenue key. */
  revenue: Record<string, string>;
  /** Country term per recorded CountryBudget.spending.byCategory key. */
  spending: Record<string, string>;
}

/** One recorded intergovernmental transfer recipient (a region's grant). */
export interface NationTransferView {
  id: string;
  name: string;
  /** Absolute local-currency units, matching the region's recorded grant. */
  amount: number;
}

export interface NationBudgetView {
  fiscalYear: number;
  /** CountryBudget.gdp. Absolute local-currency units. */
  gdpAbsolute: number;
  population: number;
  currency: string;
  /** Country-specific titles and line vocabulary for the recorded keys. */
  labels: NationBudgetLabels;
  /** Destinations the recorded fiscal position is realised through. */
  links: NationLinkView[];
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
    /** Recorded per-region allocations of the national transfer pool, largest first. */
    transfers: NationTransferView[];
  };
  /** Cached CountryBudget revenue.total - spending.total. */
  surplus: number;
  /** Signed CountryBudget treasury balance. Negative values represent debt. */
  treasuryBalance: number;
  debt: NationDebtView;
}

/** How a recorded national metric value is rendered. */
export type NationMetricFormat = "percent" | "index";

/** One recorded history point of a national metric, oldest first. */
export interface NationMetricHistoryPoint {
  turn: number;
  value: number;
}

/**
 * One recorded modifier on a national metric. Native's engine records metric
 * levels but not a stand-alone modifier registry; the only modifier rows the
 * save actually carries are active-crisis approval effects, which the engine's
 * own approval model reads (countryPolitics/overview.ts crisisApprovalPressure).
 */
export interface NationMetricModifierView {
  id: string;
  label: string;
  /** Signed recorded effect on the metric, in metric points. */
  effect: number;
  /** Recorded cadence: "flat" (one-shot), "tick" (per-turn, ramps down), or "decay". */
  effectType: string;
  source: "crisis";
}

export interface NationMetricView {
  /** Registry key, "category.metric" as recorded in WorldState.nationalMetrics. */
  id: string;
  category: string;
  label: string;
  value: number;
  format: NationMetricFormat;
  /** Recorded history points from WorldState.history / countryPolitics, oldest first. Empty when none. */
  history: NationMetricHistoryPoint[];
  /** Recorded modifiers. Empty when the save carries none. */
  modifiers: NationMetricModifierView[];
  /** Destinations the metric's consequence is realised through. */
  links: NationLinkView[];
}

export interface NationMetricCategoryView {
  id: string;
  label: string;
  metrics: NationMetricView[];
}

/** Every national metric row actually recorded in this save, grouped by category. */
export interface NationMetricsView {
  categories: NationMetricCategoryView[];
  /** Total recorded metric rows across all categories. */
  total: number;
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
  metrics: NationMetricsView;
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

/** Metric keys with a hand-authored label so abbreviations stay conventional. */
const METRIC_LABELS: Record<string, string> = {
  gdpGrowth: "GDP growth",
  inflationRate: "Inflation",
  unemploymentRate: "Unemployment",
  budgetBalance: "Budget balance",
  debtToGdp: "Debt to GDP",
  workerSecurity: "Worker security",
  participation: "Participation",
  approval: "Government approval",
  legitimacy: "Regime legitimacy",
  unrest: "Civil unrest",
};

/** Metrics the engine records as percentages (already in points). */
const METRIC_PERCENT_KEYS: ReadonlySet<string> = new Set([
  "gdpGrowth",
  "inflationRate",
  "unemploymentRate",
  "budgetBalance",
  "debtToGdp",
  "approval",
  "legitimacy",
  "unrest",
]);

const CATEGORY_LABELS: Record<string, string> = {
  economic: "Economic",
  governance: "Governance",
  economy: "Economy & Labor",
  infrastructure: "Infrastructure, Housing & Connectivity",
  health: "Health & Social Protection",
  healthcare: "Healthcare",
  education: "Education, Science & Skills",
  society: "Society & Demography",
  population: "Population",
  order: "Public Order & Justice",
  environment: "Environment, Energy & Resources",
  defense: "Defense & Foreign Affairs",
  mediaInformation: "Media & Information",
};

/** Preferred category order: engine-native families first, then law-targeted ones. */
const CATEGORY_ORDER: readonly string[] = [
  "economic",
  "governance",
  "economy",
  "infrastructure",
  "health",
  "healthcare",
  "education",
  "society",
  "population",
  "order",
  "environment",
  "defense",
  "mediaInformation",
];

interface CountryBudgetLabelSet {
  title: string;
  revenueTitle: string;
  spendingTitle: string;
  debtTitle: string;
  ceilingLabel: string;
  debtServiceLabel: string;
  transferLabel: string;
  revenue: Record<string, string>;
  spending: Record<string, string>;
}

/**
 * Country fiscal vocabulary ported from AHDGame src/app/country/[code]/budget/
 * NationalBudgetClient.tsx COUNTRY_LABELS (reference e364c049). Countries the
 * reference does not author (RU/BR here) fall back to the generic labels; the
 * reference itself falls back to US for unpinned codes.
 */
const COUNTRY_BUDGET_LABELS: Record<string, CountryBudgetLabelSet> = {
  US: {
    title: "Federal Budget",
    revenueTitle: "Revenue Sources",
    spendingTitle: "Spending by Category",
    debtTitle: "National Debt",
    ceilingLabel: "Debt Ceiling",
    debtServiceLabel: "Debt Service",
    transferLabel: "State grants",
    revenue: {
      incomeTax: "Income Tax",
      domesticCorporateTax: "Corporate Tax — Domestic",
      foreignCorporateTax: "Corporate Tax — Foreign",
      payrollTax: "Payroll Tax",
      tariffs: "Tariffs",
      salesTax: "Sales Tax",
      healthcareIncome: "Healthcare Income",
      other: "Other Revenue",
    },
    spending: {
      healthcare: "Healthcare",
      defense: "Defense",
      socialSecurity: "Social Security",
      education: "Education",
      infrastructure: "Infrastructure",
      other: "Other",
    },
  },
  UK: {
    title: "HM Treasury Budget",
    revenueTitle: "Receipts",
    spendingTitle: "Expenditure by Category",
    debtTitle: "Public Debt",
    ceilingLabel: "Borrowing Limit",
    debtServiceLabel: "Debt Interest",
    transferLabel: "Local authority grants",
    revenue: {
      incomeTax: "Income Tax",
      domesticCorporateTax: "Corporation Tax — Domestic",
      foreignCorporateTax: "Corporation Tax — Foreign",
      payrollTax: "National Insurance",
      tariffs: "Duties & Customs",
      salesTax: "VAT",
      healthcareIncome: "Healthcare Income",
      other: "Other Receipts",
    },
    spending: {
      health: "Health / NHS",
      education: "Education",
      statePensions: "State Pensions",
      welfare: "Welfare & UC",
      defense: "Defence",
      transport: "Transport",
      localGovernment: "Local Government",
      other: "Other Spending",
    },
  },
  JP: {
    title: "National Budget",
    revenueTitle: "Revenue Sources",
    spendingTitle: "Expenditure by Category",
    debtTitle: "National Debt",
    ceilingLabel: "Debt Ceiling",
    debtServiceLabel: "Debt Service",
    transferLabel: "Local transfers",
    revenue: {
      incomeTax: "Income Tax",
      domesticCorporateTax: "Corporate Tax — Domestic",
      foreignCorporateTax: "Corporate Tax — Foreign",
      payrollTax: "Social Insurance",
      tariffs: "Customs & Duties",
      salesTax: "Consumption Tax",
      healthcareIncome: "Healthcare Income",
      other: "Other Revenue",
    },
    spending: {
      health: "Healthcare",
      education: "Education",
      statePensions: "Pensions",
      welfare: "Social Welfare",
      defense: "Defense",
      infrastructure: "Public Works",
      other: "Other Spending",
    },
  },
  CA: {
    title: "Federal Budget",
    revenueTitle: "Revenue Sources",
    spendingTitle: "Expenditure by Category",
    debtTitle: "Federal Debt",
    ceilingLabel: "Debt Limit",
    debtServiceLabel: "Public Debt Charges",
    transferLabel: "Provincial transfers",
    revenue: {
      incomeTax: "Personal Income Tax",
      domesticCorporateTax: "Corporate Income Tax — Domestic",
      foreignCorporateTax: "Corporate Income Tax — Foreign",
      payrollTax: "EI & CPP Premiums",
      tariffs: "Customs & Duties",
      salesTax: "GST/HST",
      healthcareIncome: "Healthcare Income",
      other: "Other Revenue",
    },
    spending: {
      health: "Health Transfers",
      education: "Education",
      statePensions: "Elderly Benefits",
      welfare: "Social Programs",
      defense: "National Defence",
      infrastructure: "Infrastructure",
      other: "Other Spending",
    },
  },
  DE: {
    title: "Bundeshaushalt",
    revenueTitle: "Revenue Sources",
    spendingTitle: "Expenditure by Category",
    debtTitle: "Federal Debt",
    ceilingLabel: "Debt Brake Limit",
    debtServiceLabel: "Debt Service",
    transferLabel: "Länder transfers",
    revenue: {
      incomeTax: "Income Tax",
      solidaritySurcharge: "Solidaritätszuschlag (Soli)",
      domesticCorporateTax: "Corporate Tax — Domestic",
      foreignCorporateTax: "Corporate Tax — Foreign",
      payrollTax: "Social Contributions",
      tariffs: "Customs & EU Levies",
      salesTax: "VAT",
      healthcareIncome: "Healthcare Income",
      other: "Other Revenue",
    },
    spending: {
      health: "Healthcare",
      education: "Education & Research",
      statePensions: "Pensions",
      welfare: "Social Security",
      defense: "Defence",
      infrastructure: "Infrastructure",
      other: "Other Spending",
    },
  },
  DD: {
    title: "Staatshaushaltsplan",
    revenueTitle: "Revenue Sources",
    spendingTitle: "Expenditure by Category",
    debtTitle: "State Debt",
    ceilingLabel: "Borrowing Limit",
    debtServiceLabel: "Debt Service",
    transferLabel: "Bezirke transfers",
    revenue: {
      incomeTax: "Income Tax",
      domesticCorporateTax: "State Enterprise Levy",
      foreignCorporateTax: "Foreign Enterprise Levy",
      payrollTax: "Social Insurance Contributions",
      tariffs: "Customs and Bloc Trade Duties",
      salesTax: "Product-Related Levy",
      healthcareIncome: "Healthcare Income",
      other: "Other Revenue",
    },
    spending: {
      health: "Healthcare",
      healthcare: "Healthcare",
      education: "Education and Science",
      statePensions: "Pensions",
      welfare: "Social Provision",
      socialSecurity: "Social Provision",
      defense: "Defence",
      infrastructure: "Infrastructure",
      other: "Other Spending",
    },
  },
  CN: {
    title: "国家预算 / National Budget",
    revenueTitle: "Revenue Sources",
    spendingTitle: "Expenditure by Category",
    debtTitle: "Central Government Debt",
    ceilingLabel: "Debt Service Ceiling",
    debtServiceLabel: "Debt Service",
    transferLabel: "Local transfers",
    revenue: {
      incomeTax: "Individual Income Tax (个人所得税)",
      domesticCorporateTax: "Enterprise Income Tax (企业所得税)",
      foreignCorporateTax: "Foreign Enterprise Tax",
      payrollTax: "Social Insurance (社会保险)",
      tariffs: "Customs Duties (关税)",
      salesTax: "Value-Added Tax (增值税)",
      landValueAddedTax: "Land Value-Added Tax (土地增值税)",
      urbanMaintenanceTax: "Urban Maintenance & Construction Tax (城市维护建设税)",
      stampDuty: "Stamp Duty (印花税)",
      healthcareIncome: "Health Insurance Income",
      other: "Other Central Revenue",
    },
    spending: {
      socialSecurity: "Social Security",
      education: "Education",
      health: "Health & Medical",
      defense: "Defense",
      infrastructure: "Infrastructure",
      agriculture: "Agriculture & Rural Revitalization",
      other: "Other Central Expenditure",
    },
  },
  IE: {
    title: "National Budget",
    revenueTitle: "Revenue Sources",
    spendingTitle: "Expenditure by Vote",
    debtTitle: "National Debt",
    ceilingLabel: "Debt-Service Ceiling",
    debtServiceLabel: "Debt Service",
    transferLabel: "Local Government Fund",
    revenue: {
      incomeTax: "Income Tax",
      domesticCorporateTax: "Corporation Tax (Domestic)",
      foreignCorporateTax: "Foreign Corporation Tax",
      payrollTax: "Pay-Related Social Insurance (PRSI)",
      tariffs: "Customs Duties",
      salesTax: "Value-Added Tax (VAT)",
      universalSocialCharge: "Universal Social Charge (USC)",
      capitalGainsTax: "Capital Gains Tax",
      exciseDuty: "Excise Duty",
      stampDuty: "Stamp Duty",
      propertyTax: "Local Property Tax (LPT)",
      healthcareIncome: "Health Service Income",
      other: "Other Receipts",
    },
    spending: {
      socialProtection: "Social Protection",
      education: "Education",
      health: "Health",
      housing: "Housing & Local Government",
      transport: "Transport & Climate",
      defense: "Defence",
      other: "Other Departmental Spending",
    },
  },
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

function labelForMetric(metricKey: string): string {
  return METRIC_LABELS[metricKey] ?? humanizeKey(metricKey);
}

function labelForCategory(categoryId: string): string {
  return CATEGORY_LABELS[categoryId] ?? humanizeKey(categoryId);
}

function categoryRank(categoryId: string): number {
  const index = CATEGORY_ORDER.indexOf(categoryId);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/** Country fiscal vocabulary, falling back to the generic set for unpinned codes. */
export function countryBudgetLabels(countryId: string): NationBudgetLabels {
  const set = COUNTRY_BUDGET_LABELS[countryId];
  if (!set) {
    return {
      title: "National Budget",
      revenueTitle: "Revenue",
      spendingTitle: "Spending",
      debtTitle: "National Debt",
      ceilingLabel: "Debt Ceiling",
      debtServiceLabel: "Debt Service",
      transferLabel: "Intergovernmental transfers",
      revenue: {},
      spending: {},
    };
  }
  return {
    title: set.title,
    revenueTitle: set.revenueTitle,
    spendingTitle: set.spendingTitle,
    debtTitle: set.debtTitle,
    ceilingLabel: set.ceilingLabel,
    debtServiceLabel: set.debtServiceLabel,
    transferLabel: set.transferLabel,
    revenue: { ...set.revenue },
    spending: { ...set.spending },
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Recorded per-region allocations of the national transfer pool, from
 * WorldState.regionalBudgets[regionId].revenue.grant (the engine distributes
 * the national grant pool by population share — budget/regionalBudget.ts).
 * Regions with no recorded grant are omitted rather than shown as zero.
 */
function projectTransfers(world: WorldState, countryId: string): NationTransferView[] {
  const transfers: NationTransferView[] = [];
  for (const [regionId, region] of Object.entries(world.regions)) {
    if (region.countryId !== countryId) continue;
    const grant = finiteOrNull(world.regionalBudgets?.[regionId]?.revenue?.grant);
    if (grant === null || grant <= 0) continue;
    transfers.push({ id: regionId, name: region.name, amount: grant });
  }
  return transfers.sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function projectTaxRates(budget: WorldState["budgets"][string]): NationTaxRateView[] {
  return Object.entries(budget.taxRates)
    .filter(([, value]) => Number.isFinite(value))
    .map(([id, value]) => ({ id, label: humanizeKey(id), ratePercent: value }));
}

function projectRevenue(
  budget: WorldState["budgets"][string],
  labels: NationBudgetLabels,
): NationMoneyLine[] {
  return Object.entries(budget.revenue)
    .filter(([id, value]) => id !== "total" && Number.isFinite(value))
    .map(([id, value]) => {
      const taxRatePercent = finiteOrNull((budget.taxRates as unknown as Record<string, number>)[id]);
      const taxBaseKey = TAX_BASES[id];
      const taxBase = taxBaseKey ? finiteOrNull(budget.taxBases[taxBaseKey as keyof typeof budget.taxBases]) : null;
      return {
        id,
        label: labels.revenue[id] ?? labelForRevenue(id),
        amount: value,
        ...(taxRatePercent !== null ? { taxRatePercent } : {}),
        ...(taxBase !== null ? { taxBase } : {}),
      };
    });
}

function projectSpending(
  budget: WorldState["budgets"][string],
  labels: NationBudgetLabels,
): NationMoneyLine[] {
  return Object.entries(budget.spending.byCategory)
    .filter(([, value]) => Number.isFinite(value))
    .map(([id, amount]) => ({ id, label: labels.spending[id] ?? humanizeKey(id), amount }));
}

/**
 * Recorded history for a national metric, oldest first. Only the metric keys
 * the engine actually snapshots get a series: the macro rates come from
 * WorldState.history.macro; approval comes from the country's own
 * approvalHistory. Everything else stays empty rather than interpolated.
 */
function metricHistory(
  world: WorldState,
  countryId: string,
  metricId: string,
): NationMetricHistoryPoint[] {
  const macro = world.history.macro[countryId] ?? [];
  if (metricId === "economic.gdpGrowth") {
    return macro.map((point) => ({ turn: point.turn, value: round3(point.growthRate * 100) }));
  }
  if (metricId === "economic.inflationRate") {
    return macro.map((point) => ({ turn: point.turn, value: round3(point.inflationRate * 100) }));
  }
  if (metricId === "economic.unemploymentRate") {
    return macro.map((point) => ({ turn: point.turn, value: round3(point.unemploymentRate * 100) }));
  }
  if (metricId === "governance.approval") {
    return (world.countryPolitics?.[countryId]?.approvalHistory ?? []).map((sample) => ({
      turn: sample.turn,
      value: sample.approval,
    }));
  }
  return [];
}

/**
 * Recorded approval modifiers: active crisis effects that name this country.
 * The engine's approval model reads exactly these (countryPolitics/overview.ts
 * crisisApprovalPressure); no other metric modifier source is stored.
 */
function approvalModifiers(world: WorldState, countryId: string): NationMetricModifierView[] {
  const modifiers: NationMetricModifierView[] = [];
  for (const crisis of world.crises ?? []) {
    if (crisis.status !== "active" || !crisis.countryIds.includes(countryId)) continue;
    for (const effect of crisis.effects ?? []) {
      if (effect.type !== "approval" || !Number.isFinite(effect.value)) continue;
      modifiers.push({
        id: `${crisis.id}:approval`,
        label: crisis.name,
        effect: effect.value,
        effectType: effect.effectType,
        source: "crisis",
      });
    }
  }
  return modifiers;
}

/** Destinations a metric family's consequence is actually realised through. */
function metricLinks(categoryId: string): NationLinkView[] {
  if (categoryId === "economic" || categoryId === "economy") {
    return [
      { label: "Economy", route: "economy" },
      { label: "Budget", route: "budget" },
    ];
  }
  if (categoryId === "governance") {
    return [
      { label: "Policy", route: "policy" },
      { label: "Legislature", route: "legislature" },
      { label: "Elections", route: "elections" },
    ];
  }
  return [
    { label: "Policy", route: "policy" },
    { label: "Government & executive", route: "nations" },
  ];
}

function metricFormat(metricKey: string): NationMetricFormat {
  return METRIC_PERCENT_KEYS.has(metricKey) ? "percent" : "index";
}

/**
 * Projects the metric rows the save actually records: every
 * WorldState.nationalMetrics[countryId] entry plus the country's own
 * approval/legitimacy/unrest overview gauges. Categories with no recorded
 * metric are omitted rather than shown empty.
 */
function projectMetrics(world: WorldState, countryId: string): NationMetricsView {
  const rows: { id: string; value: number; modifiers: NationMetricModifierView[] }[] = [];

  for (const [id, entry] of Object.entries(world.nationalMetrics[countryId] ?? {})) {
    const value = finiteOrNull(entry?.value);
    if (value === null) continue;
    rows.push({ id, value: round3(value), modifiers: [] });
  }

  const politics = world.countryPolitics?.[countryId];
  if (politics) {
    rows.push({ id: "governance.approval", value: politics.approval, modifiers: approvalModifiers(world, countryId) });
    rows.push({ id: "governance.legitimacy", value: politics.legitimacy, modifiers: [] });
    rows.push({ id: "governance.unrest", value: politics.unrest, modifiers: [] });
  }

  const grouped = new Map<string, NationMetricView[]>();
  for (const row of rows) {
    const dot = row.id.indexOf(".");
    const category = dot >= 0 ? row.id.slice(0, dot) : row.id;
    const metricKey = dot >= 0 ? row.id.slice(dot + 1) : row.id;
    const metric: NationMetricView = {
      id: row.id,
      category,
      label: labelForMetric(metricKey),
      value: row.value,
      format: metricFormat(metricKey),
      history: metricHistory(world, countryId, row.id),
      modifiers: row.modifiers,
      links: metricLinks(category),
    };
    grouped.set(category, [...(grouped.get(category) ?? []), metric]);
  }

  const categories: NationMetricCategoryView[] = [...grouped.entries()]
    .sort(([left], [right]) => categoryRank(left) - categoryRank(right) || left.localeCompare(right))
    .map(([id, metrics]) => ({
      id,
      label: labelForCategory(id),
      metrics: [...metrics].sort((left, right) => left.label.localeCompare(right.label)),
    }));

  return {
    categories,
    total: categories.reduce((sum, category) => sum + category.metrics.length, 0),
  };
}

const BUDGET_LINKS: NationLinkView[] = [
  { label: "Policy", route: "policy" },
  { label: "Government & executive", route: "nations" },
  { label: "Legislature", route: "legislature" },
  { label: "Elections", route: "elections" },
];

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
 * a missing budget, policy, history point, debt ratio, metric row, or modifier.
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
  const labels = countryBudgetLabels(countryId);

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
      labels,
      links: BUDGET_LINKS,
      taxRates,
      revenue: { components: projectRevenue(budget, labels), total: budget.revenue.total },
      spending: {
        categories: projectSpending(budget, labels),
        stateGrants: budget.spending.stateGrants,
        debtInterest: budget.spending.debtInterest,
        total: budget.spending.total,
        transfers: projectTransfers(world, countryId),
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
    metrics: projectMetrics(world, countryId),
    policy: {
      taxRates,
      enacted: projectPolicies(world, countryId),
    },
  };
}
