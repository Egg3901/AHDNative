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
import { TFP_METRIC_PATHS } from "../demographics/laborForce.js";
import { computeNationalMetricsForCountry } from "../metrics/nationalMetrics.js";
import { mapCabinetDeltasToPolitical, mapRegionalCabinetDeltasToPolitical } from "../politicalMetrics/cabinetResidual.js";
import { NEUTRAL_STAT, statMultiplier } from "../stats/characterStats.js";

const tfpPaths = new Set(Object.values(TFP_METRIC_PATHS));

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
  const political = new Map<string, { national: Record<string, number>; regional: Record<string, Record<string, number>> }>();
  // Persist empties after expiry, so a previous standing effect stops driving.
  for (const countryId of Object.keys(world.politicalCabinetContributions ?? {})) {
    political.set(countryId, { national: {}, regional: {} });
  }
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
    if (Object.values(world.regionalPoliticalMetrics ?? {}).some(board => board.countryId === order.countryId)) {
      if (!political.has(order.countryId)) political.set(order.countryId, { national: {}, regional: {} });
    }
    // Game968 scales by the issuing Character's Statecraft before combining
    // and capping effects. Native NPP records have no stat block, so they
    // retain the source's neutral fallback for an absent issuer stat.
    const issuerStrength = order.characterId === "player"
      ? statMultiplier(world.player.stats?.statecraft ?? NEUTRAL_STAT) : 1;
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
        const bucket = political.get(order.countryId);
        if (bucket) {
          const into = bucket.regional[effect.regionId] ??= {};
          into[effect.metric] = (into[effect.metric] ?? 0) + effect.modifier * issuerStrength;
        }
        const key = `${effect.regionId}:${effect.metric}`;
        const entry = regional.get(key) ?? { regionId: effect.regionId, metric: effect.metric, total: 0 };
        entry.total += effect.modifier * issuerStrength;
        regional.set(key, entry);
        continue;
      }
      applied = true;
      const bucket = political.get(order.countryId);
      if (bucket) bucket.national[effect.metric] = (bucket.national[effect.metric] ?? 0) + effect.modifier * issuerStrength;
      const key = `${order.countryId}:${effect.metric}`;
      let entry = combined.get(key);
      if (!entry) {
        entry = { countryId: order.countryId, metric: effect.metric, total: 0 };
        combined.set(key, entry);
      }
      entry.total += effect.modifier * issuerStrength;
    }
    if (applied) order.lastAppliedTurn = world.meta.turn;
  }

  for (const [countryId, bucket] of political) {
    const contribution = mapCabinetDeltasToPolitical(bucket.national);
    const regional = mapRegionalCabinetDeltasToPolitical(bucket.regional);
    (world.politicalCabinetContributions ??= {})[countryId] = {
      turn: world.meta.turn,
      contribution,
      regional,
      sources: Object.keys(contribution).length || Object.keys(regional).length
        ? { orders: { contribution, regional } } : {},
    };
  }

  let metricsUpdated = 0;
  const changedTfpCountries = new Set<string>();
  for (const entry of combined.values()) {
    // Game combines national and regional orders before applying one capped
    // delta to each StateMetrics row. Persist these supported leaves rather
    // than changing a national aggregate that the next turn discards.
    if (tfpPaths.has(entry.metric)) {
      for (const region of Object.values(world.regions)) {
        if (region.countryId !== entry.countryId) continue;
        if (!Number.isFinite(world.regionalMetrics[region.id]?.[entry.metric]?.value)) continue;
        const key = `${region.id}:${entry.metric}`;
        const target = regional.get(key) ?? { regionId: region.id, metric: entry.metric, total: 0 };
        target.total += entry.total;
        regional.set(key, target);
      }
      continue;
    }
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
    if (tfpPaths.has(entry.metric)) {
      changedTfpCountries.add(world.regions[entry.regionId]!.countryId);
    }
    regionsUpdated.add(entry.regionId);
  }
  for (const countryId of changedTfpCountries) {
    const aggregated = computeNationalMetricsForCountry(countryId, world);
    const national = world.nationalMetrics[countryId] ??= {};
    for (const path of tfpPaths) {
      if (aggregated[path]) national[path] = aggregated[path];
    }
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
