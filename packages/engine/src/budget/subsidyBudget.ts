/**
 * AHDGame subsidy cost, eligibility, and enact/end lifecycle port.
 * Cost/eligibility pinned at d4baf899; lifecycle mirrors
 * src/lib/subsidies/subsidyEffects.ts applySubsidyProvision /
 * applyEndSubsidyProvision at e364c049: the margin bonus is fixed
 * (SUBSIDY_MARGIN_BONUS, no rate dial exists in the reference), enactment
 * upserts on the composite key (country, scope, scopeType, sector, strategy)
 * so re-enacting replaces rather than duplicates, and repeal marks
 * active=false while preserving the record. National scope only: solo has
 * no state-budget subsidy writer (see calculateSubsidyCostForCountry).
 */
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import { CORPORATION_TYPES, type CorporationType } from "../corporation/types.js";

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

export interface NationalSubsidySpec {
  countryId: string;
  scopeType: "economy_wide" | "sector";
  targetSectorType?: string | null;
  domesticOnly: boolean;
}

export type EnactSubsidyResult =
  | { ok: true; subsidies: Subsidy[]; status: "enacted" | "reactivated" | "already-active" }
  | { ok: false; error: string };

export type EndSubsidyResult =
  | { ok: true; subsidies: Subsidy[] }
  | { ok: false; error: string };

function subsidyKeyMatches(subsidy: Subsidy, spec: NationalSubsidySpec): boolean {
  return (
    subsidy.countryId === spec.countryId &&
    subsidy.scope === "national" &&
    subsidy.scopeType === spec.scopeType &&
    (subsidy.targetSectorType ?? null) === (spec.scopeType === "sector" ? (spec.targetSectorType as string) : null) &&
    (subsidy.targetStrategyId ?? null) === null
  );
}

function validateNationalSubsidySpec(spec: NationalSubsidySpec): string | null {
  if (!spec.countryId) return "subsidy enactment requires a countryId";
  if (spec.scopeType !== "economy_wide" && spec.scopeType !== "sector") {
    return "subsidy scopeType must be economy_wide or sector";
  }
  if (spec.scopeType === "sector") {
    if (!spec.targetSectorType) return "sector subsidies require a targetSectorType";
    if (!(CORPORATION_TYPES as readonly string[]).includes(spec.targetSectorType)) {
      return `unknown targetSectorType: ${spec.targetSectorType}`;
    }
  }
  return null;
}

/**
 * Enact a national subsidy, upserting on the composite key so re-enacting
 * the same scope replaces rather than duplicates (a duplicate would
 * double-charge the budget line). Returns a new array; never mutates.
 */
export function enactNationalSubsidy(subsidies: Subsidy[], spec: NationalSubsidySpec): EnactSubsidyResult {
  const invalid = validateNationalSubsidySpec(spec);
  if (invalid) return { ok: false, error: invalid };
  const target = spec.scopeType === "sector" ? (spec.targetSectorType as CorporationType) : null;
  const matchIndex = subsidies.findIndex((s) => subsidyKeyMatches(s, spec));
  if (matchIndex >= 0) {
    const match = subsidies[matchIndex]!;
    const next: Subsidy = { ...match, domesticOnly: spec.domesticOnly, active: true };
    const status = match.active ? "already-active" : "reactivated";
    return { ok: true, subsidies: subsidies.map((s, i) => (i === matchIndex ? next : s)), status };
  }
  const id = `sub-${spec.countryId}-national-${spec.scopeType}-${target ?? "all"}${spec.domesticOnly ? "-dom" : ""}`;
  const record: Subsidy = {
    id,
    countryId: spec.countryId,
    scope: "national",
    scopeType: spec.scopeType,
    targetSectorType: target,
    targetStrategyId: null,
    stateId: null,
    domesticOnly: spec.domesticOnly,
    active: true,
  };
  return { ok: true, subsidies: [...subsidies, record], status: "enacted" };
}

/**
 * End a national subsidy. Marks the matching active record inactive and
 * preserves it (audit trail), mirroring applyEndSubsidyProvision. Fails
 * closed when no matching active record exists — never a silent no-op.
 */
export function endNationalSubsidy(subsidies: Subsidy[], spec: NationalSubsidySpec): EndSubsidyResult {
  const invalid = validateNationalSubsidySpec(spec);
  if (invalid) return { ok: false, error: invalid };
  const matchIndex = subsidies.findIndex((s) => s.active && subsidyKeyMatches(s, spec));
  if (matchIndex < 0) return { ok: false, error: "no active national subsidy matches that scope" };
  return {
    ok: true,
    subsidies: subsidies.map((s, i) => (i === matchIndex ? { ...s, active: false } : s)),
  };
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
