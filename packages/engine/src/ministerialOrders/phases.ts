/**
 * MinisterialOrders turn phase — W28. Ports the metric-modifier accumulation
 * + cap + apply half of src/lib/turn/ministerialOrderProcessing.ts (the
 * defense sub-pipeline it also runs is PORT-STUB — see constants.ts file
 * doc). Combines every active order's effects targeting the same metric
 * path, boosts by CABINET_EFFECT_STRENGTH, caps at
 * ±MAX_PER_METRIC_MODIFIER_PER_TURN, then scales by modifierSpanScale before
 * writing an additive change onto existing national or regional metric rows.
 *
 * Runs BEFORE policyEffectsPhase in the registry, mirroring mainline's
 * documented serialization order (crisisTurn -> navairOperations ->
 * ministerialOrders -> policyEffects, stateEffectsPhase.ts:107-126) so that
 * policyEffects' target recompute reads the order-shocked value the same
 * turn, same as mainline.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { clampCabinetModifier, modifierSpanScale } from "./constants.js";
import { isMinisterialOrderActive, normalizeMinisterialOrderLifecycle } from "./lifecycle.js";
import { unavailableDefenseOrderEffects } from "./catalog.js";

export interface RejectedRegionalOrderEffect {
  orderId: string;
  metric: string;
  regionId?: string;
  reason: "inactive" | "targetRequired" | "invalidRegion" | "unsupportedMetric";
}

export interface MinisterialOrdersResult {
  metricsUpdated: number;
  regionalMetricsUpdated: number;
  regionsUpdated: string[];
  rejectedRegionalEffects: RejectedRegionalOrderEffect[];
  rejectedDefenseOrders: Array<{
    orderId: string;
    catalogOrderId: string;
    missingConsumers: string[];
    reason: "unavailableConsumer";
  }>;
}

export function runMinisterialOrders(world: WorldState): MinisterialOrdersResult {
  const combined = new Map<string, { countryId: string; metric: string; total: number }>();
  const regional = new Map<string, { regionId: string; metric: string; total: number }>();
  const rejectedRegionalEffects: RejectedRegionalOrderEffect[] = [];
  const rejectedDefenseOrders: MinisterialOrdersResult["rejectedDefenseOrders"] = [];
  for (const order of world.ministerialOrders) {
    normalizeMinisterialOrderLifecycle(order, world.meta.turn);
    if (!isMinisterialOrderActive(order, world.meta.turn)) {
      for (const effect of order.effects) {
        if (effect.scope === "regional") {
          rejectedRegionalEffects.push({
            orderId: order.id,
            metric: effect.metric,
            ...(effect.regionId ? { regionId: effect.regionId } : {}),
            reason: "inactive",
          });
        }
      }
      continue;
    }
    if (order.positionId && order.orderId) {
      const unavailable = unavailableDefenseOrderEffects(order.countryId, order.positionId, order.orderId);
      if (unavailable) {
        rejectedDefenseOrders.push({
          orderId: order.id,
          catalogOrderId: order.orderId,
          missingConsumers: unavailable.map((effect) => effect.missingConsumer),
          reason: "unavailableConsumer",
        });
        continue;
      }
    }
    let applied = false;
    for (const effect of order.effects) {
      if (effect.scope === "regional") {
        if (!effect.regionId) {
          rejectedRegionalEffects.push({ orderId: order.id, metric: effect.metric, reason: "targetRequired" });
          continue;
        }
        const target = world.regions[effect.regionId];
        if (!target || target.countryId !== order.countryId) {
          rejectedRegionalEffects.push({ orderId: order.id, metric: effect.metric, regionId: effect.regionId, reason: "invalidRegion" });
          continue;
        }
        const metrics = world.regionalMetrics[effect.regionId];
        if (!metrics || !Object.hasOwn(metrics, effect.metric) || !Number.isFinite(metrics[effect.metric]?.value)) {
          rejectedRegionalEffects.push({ orderId: order.id, metric: effect.metric, regionId: effect.regionId, reason: "unsupportedMetric" });
          continue;
        }
        applied = true;
        const key = `${effect.regionId}:${effect.metric}`;
        const entry = regional.get(key) ?? { regionId: effect.regionId, metric: effect.metric, total: 0 };
        entry.total += effect.modifier;
        regional.set(key, entry);
        continue;
      }
      applied = true;
      const key = `${order.countryId}:${effect.metric}`;
      let entry = combined.get(key);
      if (!entry) {
        entry = { countryId: order.countryId, metric: effect.metric, total: 0 };
        combined.set(key, entry);
      }
      entry.total += effect.modifier;
    }
    if (applied) order.lastAppliedTurn = world.meta.turn;
  }

  let metricsUpdated = 0;
  for (const entry of combined.values()) {
    const capped = clampCabinetModifier(entry.total);
    if (capped === 0) continue;
    const applied = capped * modifierSpanScale(entry.metric);
    const perCountry = (world.nationalMetrics[entry.countryId] ??= {});
    const current = perCountry[entry.metric]?.value ?? 50;
    perCountry[entry.metric] = { value: Math.round((current + applied) * 1000) / 1000 };
    metricsUpdated++;
  }
  let regionalMetricsUpdated = 0;
  const regionsUpdated = new Set<string>();
  for (const entry of regional.values()) {
    const capped = clampCabinetModifier(entry.total);
    if (capped === 0) continue;
    const applied = capped * modifierSpanScale(entry.metric);
    const metric = world.regionalMetrics[entry.regionId]![entry.metric]!;
    metric.value = Math.round((metric.value + applied) * 1000) / 1000;
    regionalMetricsUpdated++;
    metricsUpdated++;
    regionsUpdated.add(entry.regionId);
  }
  return {
    metricsUpdated,
    regionalMetricsUpdated,
    regionsUpdated: [...regionsUpdated].sort(),
    rejectedRegionalEffects,
    rejectedDefenseOrders,
  };
}

export const ministerialOrdersPhase: TurnPhase = {
  name: "ministerialOrders",
  run(world) {
    runMinisterialOrders(world);
  },
};
