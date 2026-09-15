import type { WorldState } from "../types.js";
import { cabinetPositionsForCountry } from "../cabinet/constants.js";
import { AUTHORED_MINISTERIAL_ORDERS } from "./catalogData.js";

export interface MinisterialOrderEffectDefinition {
  metric: string;
  modifier: number;
  scope: "national" | "regional";
}

export interface MinisterialOrderDefinition {
  id: string;
  name: string;
  description: string;
  duration: number;
  effects: readonly MinisterialOrderEffectDefinition[];
}

export interface UnavailableMinisterialOrderEffect {
  metric: string;
  missingConsumer: string;
}

export type ClassifiedMinisterialOrder = MinisterialOrderDefinition & (
  | { availability: "supported"; resolvedEffects: MinisterialOrderEffectDefinition[] }
  | {
      availability: "blocked";
      blocker: `regionalTargetRequired:${string}` | `defenseUnavailable:${string}` | `unsupportedMetric:${string}`;
      unavailableEffects?: UnavailableMinisterialOrderEffect[];
    }
);

type CatalogCountry = keyof typeof AUTHORED_MINISTERIAL_ORDERS;

/**
 * Exact authored catalog at AHDGame e364c04954ed628beef73a993a8e9e156650a31e.
 * A position absent from the source table advertises no orders.
 */
export function getMinisterialOrders(countryId: string, positionId: string): readonly MinisterialOrderDefinition[] {
  const country = AUTHORED_MINISTERIAL_ORDERS[countryId as CatalogCountry] as Record<string, readonly MinisterialOrderDefinition[]> | undefined;
  return country?.[positionId] ?? [];
}

export function isDefensePosition(positionId: string): boolean {
  return /defen[cs]e|military|armed_forces/.test(positionId);
}

function missingDefenseConsumer(sourceMetric: string): string {
  return sourceMetric === "governmentApproval"
    ? "governmentApprovals"
    : `nationalMetrics.${sourceMetric}`;
}

export function unavailableDefenseOrderEffects(
  countryId: string,
  positionId: string,
  orderId: string,
): UnavailableMinisterialOrderEffect[] | null {
  if (!isDefensePosition(positionId)) return null;
  const order = getMinisterialOrders(countryId, positionId).find((candidate) => candidate.id === orderId);
  if (!order) return null;
  const unavailable = order.effects
    .filter((effect) => effect.scope === "national")
    .map((effect) => ({ metric: effect.metric, missingConsumer: missingDefenseConsumer(effect.metric) }));
  return unavailable.length > 0 ? unavailable : null;
}

const NATIVE_NATIONAL_METRIC_PATHS = new Set([
  "economic.gdpGrowth",
  "economic.inflationRate",
  "economic.unemploymentRate",
  "governance.budgetBalance",
]);

function resolveNationalMetric(world: WorldState, countryId: string, sourceMetric: string): string | null {
  const metrics = world.nationalMetrics[countryId] ?? {};
  if (NATIVE_NATIONAL_METRIC_PATHS.has(sourceMetric)) return sourceMetric;
  if (sourceMetric.includes(".")) return null;
  const matches = [...NATIVE_NATIONAL_METRIC_PATHS].filter((path) => path.endsWith(`.${sourceMetric}`) && (metrics[path] || NATIVE_NATIONAL_METRIC_PATHS.has(path)));
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Classify source orders against the actual Native world. Regional definitions
 * require an issuance-time target before their now-live consumer can validate
 * the exact stored metric. Defense portfolios remain unavailable until their
 * named downstream stores exist. Unknown metric paths are never materialized.
 */
export function classifyMinisterialOrders(world: WorldState, countryId: string, positionId: string): ClassifiedMinisterialOrder[] {
  return getMinisterialOrders(countryId, positionId).map((order) => {
    const regional = order.effects.find((effect) => effect.scope === "regional");
    if (regional) return { ...order, availability: "blocked", blocker: `regionalTargetRequired:${regional.metric}` };
    const unavailableEffects = unavailableDefenseOrderEffects(countryId, positionId, order.id);
    if (unavailableEffects) {
      return {
        ...order,
        availability: "blocked",
        blocker: `defenseUnavailable:${order.id}`,
        unavailableEffects,
      };
    }
    const resolvedEffects: MinisterialOrderEffectDefinition[] = [];
    for (const effect of order.effects) {
      const metric = resolveNationalMetric(world, countryId, effect.metric);
      if (!metric) return { ...order, availability: "blocked", blocker: `unsupportedMetric:${effect.metric}` };
      resolvedEffects.push({ ...effect, metric });
    }
    return { ...order, availability: "supported", resolvedEffects };
  });
}

export type MinisterialOrderInventoryEntry = ClassifiedMinisterialOrder & { positionId: string };

/** Complete classified inventory for every cabinet position Native exposes. */
export function ministerialOrderInventory(world: WorldState, countryId: string): MinisterialOrderInventoryEntry[] {
  return cabinetPositionsForCountry(countryId).flatMap((position) =>
    classifyMinisterialOrders(world, countryId, position.id).map((order) => ({ ...order, positionId: position.id })),
  );
}
