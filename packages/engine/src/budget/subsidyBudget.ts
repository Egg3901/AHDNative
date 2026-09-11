/** AHDGame subsidy cost and eligibility port, pinned at d4baf899. */
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import type { CorporationType } from "../corporation/types.js";

export const SECTOR_SUBSIDIES_SPENDING_KEY = "sectorSubsidies";
export const SUBSIDY_MARGIN_BONUS = 7.5;
export const SUBSIDY_DEADWEIGHT_FACTOR = 1.4;
export const SUBSIDY_COST_MULTIPLIER = (SUBSIDY_MARGIN_BONUS / 100) * SUBSIDY_DEADWEIGHT_FACTOR;

export interface Subsidy {
  id: string;
  countryId: string;
  scope: "national" | "state";
  scopeType: "economy_wide" | "sector";
  targetSectorType?: CorporationType | null;
  targetStrategyId?: string | null;
  stateId?: string | null;
  domesticOnly: boolean;
  active: boolean;
}

export function corpQualifiesForSubsidy(
  subsidy: Subsidy,
  corpHqState: string,
  sectorType: CorporationType,
  sectorStateId: string,
  sectorStrategyId: string | undefined,
  sectorCountryId?: string,
  corpCountryId?: string,
): boolean {
  if (subsidy.scope === "state") {
    if (sectorStateId !== subsidy.stateId) return false;
  } else if (sectorCountryId !== subsidy.countryId) return false;
  if (subsidy.scopeType === "sector" && subsidy.targetSectorType !== sectorType) return false;
  if (subsidy.targetStrategyId != null && (sectorStrategyId ?? "standard") !== subsidy.targetStrategyId) return false;
  if (subsidy.domesticOnly) {
    if (subsidy.scope === "state") {
      if (corpHqState !== subsidy.stateId) return false;
    } else if (corpCountryId !== subsidy.countryId) return false;
  }
  return true;
}

export interface SubsidyCostCorp {
  countryId: string;
  sectorType: CorporationType;
  revenue: number;
}

export function calculateSubsidyCost(sectorRevenues: number[]): number {
  if (sectorRevenues.length === 0) return 0;
  return Math.round(sectorRevenues.reduce((sum, revenue) => sum + revenue, 0) * TURNS_PER_YEAR * SUBSIDY_COST_MULTIPLIER);
}

export function calculateSubsidyCostForCountry(corps: SubsidyCostCorp[], subsidies: Subsidy[], countryId: string): number {
  let total = 0;
  for (const subsidy of subsidies) {
    if (!subsidy.active || subsidy.scope !== "national" || subsidy.countryId !== countryId) continue;
    let revenue = 0;
    for (const corp of corps) {
      if (corpQualifiesForSubsidy(subsidy, "", corp.sectorType, "", undefined, corp.countryId, corp.countryId)) revenue += corp.revenue;
    }
    total += revenue * TURNS_PER_YEAR * SUBSIDY_COST_MULTIPLIER;
  }
  return Math.round(total);
}
