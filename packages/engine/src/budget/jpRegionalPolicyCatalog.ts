/**
 * Source JP prefectural policy ladders from AHDGame
 * `src/lib/countries/jp/data/jpLegislationTypes.ts` at c35bcd86.
 * The order is load-bearing: it follows source legislationTypes order, which
 * is the stable tie-break when forced austerity chooses between equal costs.
 * Costs are annual JPY per-capita values from `withPerCapitaCosts`.
 */
export interface JPRegionalPolicyOption {
  annualCostPerCapita: number;
  rate?: number;
  economic: number;
  social: number;
  effectDirection: -1 | 0 | 1;
}

export interface JPRegionalPolicyDefinition {
  id: string;
  options: readonly JPRegionalPolicyOption[];
}

function ladder(
  id: string,
  costs: readonly number[],
  economic: readonly number[],
  social: readonly number[],
): JPRegionalPolicyDefinition {
  if (costs.length !== 7 || economic.length !== 7 || social.length !== 7) {
    throw new Error(`Invalid source JP regional policy ladder: ${id}`);
  }
  return {
    id,
    options: costs.map((annualCostPerCapita, index) => ({
      annualCostPerCapita,
      economic: economic[index]!,
      social: social[index]!,
      // policyOptions() derives effectDirection from source stance: left +1,
      // center 0, right -1. Every listed source ladder has 3/1/3 stances.
      effectDirection: index < 3 ? 1 : index === 3 ? 0 : -1,
    })),
  };
}

export const JP_REGIONAL_POLICY_CATALOG: readonly JPRegionalPolicyDefinition[] = [
  {
    id: "jp_resident_tax",
    options: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((rate, index) => ({
      annualCostPerCapita: 0,
      rate,
      economic: 5 - index,
      social: 0,
      effectDirection: index < 5 ? 1 : index === 5 ? 0 : -1,
    })),
  },
  {
    id: "jp_fixed_asset_tax",
    options: [0, 0.2, 0.5, 0.8, 1.1, 1.4, 1.8, 2.2, 3.0, 4.0, 5.0].map((rate, index) => ({
      annualCostPerCapita: 0,
      rate,
      economic: 5 - index,
      social: 0,
      effectDirection: index < 5 ? 1 : index === 5 ? 0 : -1,
    })),
  },
  ladder("jp_regional_health", [22000, 17000, 13000, 10000, 6500, 2500, 0], [-5, -3, -1, 0, 1, 3, 5], [-3, -2, -1, 0, 1, 2, 3]),
  ladder("jp_regional_education", [25000, 20000, 17000, 14000, 9000, 4000, 0], [-5, -3, -1, 0, 1, 3, 5], [-5, -3, -1, 0, 1, 3, 5]),
  ladder("jp_regional_skills", [8000, 6000, 5000, 4000, 2500, 1000, 0], [-5, -3, -1, 0, 1, 3, 5], [-3, -2, -1, 0, 1, 2, 3]),
  ladder("jp_regional_economic_development", [22000, 18000, 14000, 11000, 7000, 3000, 0], [-5, -3, -1, 0, 1, 3, 5], [-3, -2, -1, 0, 1, 2, 3]),
  ladder("jp_regional_transport", [25000, 20000, 16000, 13000, 8000, 3500, 0], [-5, -3, -1, 0, 1, 3, 5], [-3, -2, -1, 0, 1, 2, 3]),
  ladder("jp_regional_utilities", [22000, 18000, 15000, 12000, 7500, 3000, 0], [-5, -3, -1, 0, 1, 3, 5], [-3, -2, -1, 0, 1, 2, 3]),
  ladder("jp_regional_environment", [18000, 14000, 10000, 8500, 5000, 2000, 0], [-5, -3, -1, 0, 1, 3, 5], [-3, -2, -1, 0, 1, 2, 3]),
  ladder("jp_regional_social_services", [20000, 16000, 12000, 9000, 5500, 2500, 0], [-5, -3, -1, 0, 1, 3, 5], [-5, -3, -1, 0, 1, 3, 5]),
  ladder("jp_regional_agriculture", [11000, 8500, 6500, 5000, 3000, 1200, 0], [-5, -3, -1, 0, 1, 3, 5], [-3, -2, -1, 0, 1, 2, 3]),
  ladder("jp_regional_autonomy", [8000, 6000, 4000, 2500, 1500, 800, 500], [0, 0, 0, 0, 0, 0, 0], [-5, -3, -1, 0, 1, 3, 5]),
  ladder("jp_regional_governance", [8000, 6000, 4000, 2500, 1500, 700, 0], [-3, -2, -1, 0, 1, 2, 3], [-5, -3, -1, 0, 1, 3, 5]),
  ladder("jp_regional_policing", [16000, 13000, 11000, 8500, 5500, 2500, 0], [0, 0, 0, 0, 0, 0, 0], [-5, -3, -1, 0, 1, 3, 5]),
];

export const JP_REGIONAL_POLICY_IDS = JP_REGIONAL_POLICY_CATALOG.map(({ id }) => id);
export const JP_REGIONAL_TAX_POLICY_IDS = new Set(["jp_resident_tax", "jp_fixed_asset_tax"]);

export interface JPRegionalPolicyState {
  legislationTypeId: string;
  policyOptionId: string;
  policyOptionIndex: number;
  economic: number;
  social: number;
  effectDirection: -1 | 0 | 1;
}

/** Source `seedStatePolicies`: center option for every JP state-scoped law. */
export function createJPRegionalPolicyState(): JPRegionalPolicyState[] {
  return JP_REGIONAL_POLICY_CATALOG.map(({ id, options }) => {
    const policyOptionIndex = Math.floor(options.length / 2);
    const option = options[policyOptionIndex]!;
    return {
      legislationTypeId: id,
      policyOptionId: `${id}_opt_${policyOptionIndex}`,
      policyOptionIndex,
      economic: option.economic,
      social: option.social,
      effectDirection: option.effectDirection,
    };
  });
}
