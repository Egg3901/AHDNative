/**
 * PolicyEffects turn phase — W28. Ports the DECAY-path half of
 * src/lib/policyEffects.ts (calculateMetricTarget -> applyPolicyDecay),
 * re-derived fresh every turn from world.policyLedger (the solo analogue of
 * mainline's statePolicies collection), same "recompute from what's
 * currently enacted" design mainline uses for both policyEffects and
 * demographicEffects (no enactment-time push, only a per-turn pull).
 *
 * Simplifications from mainline (named so a future wave can tighten them):
 *  - B01 intensity: explicit source-generated lN option ids resolve through
 *    the authored five-level ladder and preserve intermediate strength.
 *    Numeric legacy ids and unknown ids retain sign-only fallback behavior.
 *  - B02 regional scope: mainline's regional-scope multiplier (1) applies to
 *    that ONE region's own metric row. Native persists those rows in
 *    WorldState.regionalMetrics; a legacy regional ledger row without a
 *    regionId is applied to every region of its country for compatibility.
 *  - B03 direction: CatalogEntry.targets[].higherBetter defaults true when
 *    absent (see legislation/catalog.ts).
 *  - B05 weight: mainline's per-target `weight` is authored per metric on
 *    LegislationType; AHDClient's CatalogEntry.targets[].weight already carries
 *    this (ported 1:1, see catalog.ts), no additional simplification needed.
 *
 * Citations: shared/constants/formulas.ts calculateMetricTarget callers,
 * src/lib/policyEffects.ts:157-282 calculateMetricTarget.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { CATALOG, getLaw, policyOptionIntensity, resolveCatalogPolicyOption } from "../legislation/catalog.js";
import {
  applyHalfLifeDecay,
  applyPolicyDecay,
  calculatePolicyContribution,
  effectiveIntensity,
  getFederalMultiplier,
  metricRangeScale,
  nationalDecayScope,
  POLICY_TAU,
} from "./constants.js";
import { rebuildPolicyBudgets } from "./budget.js";

export interface ActivePolicyInput {
  effectDirection: number;
  effectIntensity?: number;
  countryId: string;
  scope: "national" | "regional";
  weight?: number;
  enactedTurn?: number;
  adjustmentHalfLife?: number;
}

/**
 * Sum every active policy's decay-path contribution onto `baseline`, then
 * (optionally) clamp/range-scale to [min,max]. Faithful port of
 * calculateMetricTarget's per-policy loop (policyEffects.ts:229-260) minus
 * the adjustmentHalfLife sub-term when a catalog target authors one.
 */
export function computeMetricTarget(
  baseline: number,
  policies: readonly ActivePolicyInput[],
  higherBetter: boolean,
  range?: { min: number; max: number },
  currentTurn = 0,
): number {
  let total = 0;
  for (const policy of policies) {
    const intensity = policy.effectIntensity ?? Math.sign(policy.effectDirection);
    if (intensity === 0) continue;
    const strength = effectiveIntensity(intensity) * 3;
    const rawScope = policy.scope === "national" ? getFederalMultiplier(policy.countryId) : 1;
    const scopeMultiplier = policy.scope === "national" ? nationalDecayScope(rawScope) : rawScope;
    const weight = policy.weight ?? 1;
    let contribution = calculatePolicyContribution(strength, weight, scopeMultiplier, higherBetter);
    if (policy.adjustmentHalfLife && policy.enactedTurn !== undefined && currentTurn > 0) {
      const turnsElapsed = Math.max(0, currentTurn - policy.enactedTurn);
      contribution *= applyHalfLifeDecay(1, turnsElapsed, policy.adjustmentHalfLife);
    }
    total += contribution;
  }
  const rangeScale = range ? metricRangeScale(range.min, range.max, baseline) : 1;
  const target = baseline + total * rangeScale;
  if (!range) return target;
  return Math.max(range.min, Math.min(range.max, target));
}

/**
 * Group active policyLedger entries by their metric destination and catalog
 * entry's `targets`, then decay the persisted national or regional metric row
 * toward the computed target. Metrics with no active policy and no authored
 * baseline remain untouched.
 */
export function runPolicyEffects(world: WorldState): { metricsUpdated: number } {
  rebuildPolicyBudgets(world);
  const groups = new Map<
    string,
    {
      countryId: string;
      metricId: string;
      scope: "national" | "regional";
      regionId?: string;
      baseline: number;
      weight: number;
      higherBetter: boolean;
      policies: ActivePolicyInput[];
    }
  >();
  const policyKeys = new Set<string>();
  const addPolicy = (
    catalog: NonNullable<ReturnType<typeof getLaw>>,
    policy: ActivePolicyInput,
    regionId?: string,
  ): void => {
    if (catalog.targets.length === 0) return;
    for (const target of catalog.targets) {
      const destination = policy.scope === "regional" ? `regional:${regionId ?? "unknown"}` : `national:${policy.countryId}`;
      const key = `${destination}:${target.metricId}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          countryId: policy.countryId,
          metricId: target.metricId,
          scope: policy.scope,
          ...(regionId ? { regionId } : {}),
          baseline: 50,
          weight: target.weight,
          higherBetter: target.higherBetter ?? true,
          policies: [],
        };
        groups.set(key, group);
      }
      group.policies.push({
        ...policy,
        weight: target.weight,
        ...(target.adjustmentHalfLife !== undefined ? { adjustmentHalfLife: target.adjustmentHalfLife } : {}),
      });
    }
  };

  for (const entry of Object.values(world.policyLedger)) {
    if (entry.repealedAtTurn !== undefined) continue;
    const catalog = getLaw(entry.legislationTypeId);
    if (!catalog) continue;
    policyKeys.add(`${entry.countryId}:${entry.legislationTypeId}:${entry.scope}`);
    const policy: ActivePolicyInput = {
      effectDirection: entry.effectDirection,
      effectIntensity: policyOptionIntensity(
        catalog,
        entry.sourcePolicyOptionId ?? entry.policyOptionId,
        entry.effectDirection,
      ),
      countryId: entry.countryId,
      scope: entry.scope,
      enactedTurn: entry.enactedTurn,
    };
    if (entry.scope === "regional") {
      const regionIds = entry.regionId
        ? [entry.regionId]
        : Object.values(world.regions)
          .filter((region) => region.countryId === entry.countryId)
          .map((region) => region.id);
      for (const regionId of regionIds) addPolicy(catalog, policy, regionId);
    } else {
      addPolicy(catalog, policy);
    }
  }

  // AHDGame seeds one current policy row per program law. Native stores the
  // authored baseline in the catalog, so derive that row until a player bill
  // or a repeal tombstone supplies an explicit current entry.
  for (const catalog of CATALOG) {
    if (catalog.status !== "available" || catalog.kind === "tax" || catalog.allowedScope === "regional") continue;
    if (!world.countries[catalog.countryId]) continue;
    const baselineLevel = catalog.baselineLevel ?? 0;
    if (baselineLevel <= 0) continue;
    const key = `${catalog.countryId}:${catalog.id}:national`;
    if (policyKeys.has(key)) continue;
    const option = resolveCatalogPolicyOption(catalog, `l${baselineLevel}`);
    if (!option) continue;
    addPolicy(catalog, {
      effectDirection: option.effectDirection,
      effectIntensity: policyOptionIntensity(catalog, option.id, option.effectDirection),
      countryId: catalog.countryId,
      scope: "national",
      enactedTurn: 0,
    });
  }

  let metricsUpdated = 0;
  for (const group of groups.values()) {
    const metricMap = group.scope === "regional"
      ? (world.regionalMetrics[group.regionId!] ??= {})
      : (world.nationalMetrics[group.countryId] ??= {});
    const current = metricMap[group.metricId]?.value ?? 50;
    const target = computeMetricTarget(group.baseline, group.policies, group.higherBetter, { min: 0, max: 100 }, world.meta.turn);
    const next = applyPolicyDecay(current, target, POLICY_TAU);
    metricMap[group.metricId] = { value: Math.round(next * 1000) / 1000 };
    metricsUpdated++;
  }
  return { metricsUpdated };
}

export const policyEffectsPhase: TurnPhase = {
  name: "policyEffects",
  run(world) {
    runPolicyEffects(world);
  },
};
