import type { CatalogEntry } from "./catalog.js";

/**
 * Source-classified US fiscal laws. These records preserve the actual source
 * ids/options and cost classes, but stay unavailable until their political
 * metric producers are implemented. In particular, they are not aliases for
 * the older Native-only dotted US laws.
 */
export const CATALOG_US_FISCAL: CatalogEntry[] = [
  {
    id: "us_federal_education_funding",
    countryId: "US",
    kind: "primary",
    title: "Federal Education Investment Act",
    description: "Bills affecting federal K-12 and higher education spending",
    category: "education",
    allowedScope: "national",
    targets: [
      { metricId: "education.educationSpending", weight: 1 },
      { metricId: "economic.economicFreedom", weight: -0.3 },
      { metricId: "economic.smallBusinessFormation", weight: -0.15 },
    ],
    status: "unavailable",
    blockingSystem: "politicalMetrics/education.educationSpending; sourceBaselinePolicyLedger",
    budgetCostClass: "perCapita",
    levels: [
      "Universal Public Education Expansion Act", "Pell Grant and College Access Act",
      "Student Achievement and Accountability Act", "Education Stability Act",
      "State Education Block Grant Act", "Federal Education Reduction Act",
      "Department of Education Abolition Act",
    ].map((name) => ({ name, description: "Source-authored federal education funding option." })),
    optionEffectDirections: [1, 1, 1, 0, -1, -1, -1],
    policyOptionCosts: [0.00449735, 0.00329485, 0.0022446666666666665, 0.0013468, 0.00074555, 0.0002966166666666667, 0].map((fraction, index) => ({
      id: `us_federal_education_funding_opt_${index}`,
      // Source `incomeCostFraction × incomeToGDP × GDP`, replayed independently
      // through resolveEraSpendingCost. The adapter multiplies this GDP share
      // by the live GDP, preserving the source calculation exactly.
      gdpPerCapitaMultiplier: fraction,
    })),
  },
  {
    id: "us_federal_healthcare_funding",
    countryId: "US",
    kind: "primary",
    title: "Federal Healthcare Access Act",
    description: "Bills affecting federal healthcare and Medicaid/Medicare spending",
    category: "healthcare",
    allowedScope: "national",
    targets: [
      { metricId: "healthcare.uninsuredRate", weight: 1 },
      { metricId: "economic.povertyRate", weight: 0.3 },
      { metricId: "economic.economicFreedom", weight: -0.25 },
    ],
    status: "unavailable",
    blockingSystem: "politicalMetrics/healthcare.uninsuredRate; sourceBaselinePolicyLedger",
    budgetCostClass: "perCapita",
    levels: [
      "Universal Single-Payer Healthcare Act", "Medicare for All Expansion Act",
      "Public Option and Subsidy Act", "Federal Healthcare Framework Act",
      "Market-Based Healthcare Reform Act", "Federal Healthcare Devolution Act",
      "Healthcare Privatization Act",
    ].map((name) => ({ name, description: "Source-authored federal healthcare funding option." })),
    optionEffectDirections: [1, 1, 1, 0, -1, -1, -1],
    policyOptionCosts: [0.0645021, 0.051603283333333326, 0.04300139999999999, 0.034399516666666664, 0.021500699999999994, 0.010317449999999997, 0].map((fraction, index) => ({
      id: `us_federal_healthcare_funding_opt_${index}`,
      gdpPerCapitaMultiplier: fraction,
    })),
  },
  {
    id: "us_federal_science_funding",
    countryId: "US",
    kind: "primary",
    title: "Federal Science and Research Act",
    description: "Bills affecting federal R&D and science education funding",
    category: "education",
    allowedScope: "national",
    targets: [
      { metricId: "economic.rdIntensity", weight: 1 },
      { metricId: "economic.gdpGrowth", weight: 0.4 },
      { metricId: "economic.economicFreedom", weight: -0.3 },
      { metricId: "economic.smallBusinessFormation", weight: -0.15 },
    ],
    status: "unavailable",
    blockingSystem: "politicalMetrics/economic.rdIntensity; sourceBaselinePolicyLedger",
    budgetCostClass: "gdpFraction",
    levels: [0.0045, 0.003, 0.00187, 0.00113, 0.00066, 0.00028, 0].map((fraction, index) => ({
      name: [
        "Moonshot Research Initiative Act", "Scientific Discovery Expansion Act", "Applied Research Growth Act",
        "Research Continuity Act", "Industry-Led Innovation Act", "Science Spending Reduction Act",
        "Federal Research Elimination Act",
      ][index]!,
      description: "Source-authored federal research funding option.",
      gdpCostFraction: fraction,
    })),
    optionEffectDirections: [1, 1, 1, 0, -1, -1, -1],
  },
  {
    id: "us_federal_spending_stimulus",
    countryId: "US",
    kind: "primary",
    title: "Economic Recovery and Investment Act",
    description: "Bills affecting federal spending and economic stimulus",
    category: "economy",
    allowedScope: "national",
    targets: [
      { metricId: "economic.unemploymentRate", weight: 0.5 },
      { metricId: "economic.medianIncome", weight: 0.4 },
      { metricId: "economic.economicFreedom", weight: -0.15 },
    ],
    status: "unavailable",
    blockingSystem: "politicalMetrics/economic.unemploymentRate,economic.medianIncome; demographics/sourceDemographicEffects; sourceBaselinePolicyLedger",
    budgetCostClass: "gdpFraction",
    levels: [0.00129, 0.00103, 0.00082, 0.00064, 0.00046, 0.00021, 0].map((fraction, index) => ({
      name: [
        "New Deal Reinvestment Act", "Economic Stimulus and Jobs Act", "Targeted Investment Act",
        "Fiscal Balance Act", "Spending Discipline Act", "Austerity and Deficit Reduction Act",
        "Minimal Government Spending Act",
      ][index]!,
      description: "Source-authored federal discretionary spending option.",
      gdpCostFraction: fraction,
    })),
    optionEffectDirections: [1, 1, 1, 0, -1, -1, -1],
  },
];
