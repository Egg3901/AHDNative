/**
 * Validated ministerial order issue command (#261).
 *
 * Solo port of AHDGame
 * `src/app/api/country/[code]/executive/cabinet/[positionId]/order/route.ts`
 * at e364c04954ed628beef73a993a8e9e156650a31e. The route's Mongo reads become
 * WorldState reads; its atomic `$gte: 1` spend plus insert-then-refund becomes
 * the cabinet `withMinisterialAction` boundary from #260. Validation order
 * mirrors the route (country, position, order, target, holder-or-admin,
 * action pool, duplicate-active) and every rejection throws before any
 * order or pool mutation.
 *
 * Single-player adaptations: the reference's admin flag is the sitting
 * executive — the player issues for another holder's portfolio only while
 * they hold that country's presidency. A vacant portfolio has no action pool
 * to debit, so it rejects instead of following the reference into a null
 * member write. Regional orders resolve exactly like the route: the target is
 * required up front and each regional effect is stored with its regionId for
 * the live consumer in ministerialOrders/phases.ts.
 */
import type { WorldState } from "../types.js";
import { cabinetPositionsForCountry } from "../cabinet/constants.js";
import { normalizeMinisterialActionPool, withMinisterialAction } from "../cabinet/ministerialActionPool.js";
import { classifyMinisterialOrders, getMinisterialOrders } from "./catalog.js";
import {
  computeMinisterialOrderExpiresTurn,
  isMinisterialOrderActive,
  normalizeMinisterialOrderLifecycle,
} from "./lifecycle.js";
import type { MinisterialOrder } from "./types.js";

export interface IssueMinisterialOrderInput {
  countryId: string;
  positionId: string;
  orderId: string;
  /** Accepted under both reference body keys; national orders ignore it. */
  targetRegionId?: string | null;
  regionId?: string | null;
}

export interface IssuedMinisterialOrder {
  order: MinisterialOrder;
  actionsRemaining: number;
  expiresTurn: number;
}

function targetOf(input: IssueMinisterialOrderInput): string | undefined {
  const raw = input.targetRegionId ?? input.regionId ?? undefined;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export function issueMinisterialOrder(world: WorldState, input: IssueMinisterialOrderInput): IssuedMinisterialOrder {
  const positions = cabinetPositionsForCountry(input.countryId);
  if (positions.length === 0) throw new Error("Invalid country");
  if (!positions.some((position) => position.id === input.positionId)) {
    throw new Error("Unknown cabinet position");
  }
  const authored = getMinisterialOrders(input.countryId, input.positionId);
  if (authored.length === 0) throw new Error("Unknown cabinet position");
  const config = typeof input.orderId === "string"
    ? authored.find((order) => order.id === input.orderId)
    : undefined;
  if (!config) throw new Error("Invalid order ID");

  const classified = classifyMinisterialOrders(world, input.countryId, input.positionId)
    .find((order) => order.id === config.id);
  if (!classified) throw new Error("Invalid order ID");

  let effects: MinisterialOrder["effects"];
  if (classified.availability === "supported") {
    effects = classified.resolvedEffects.map((effect) => ({
      metric: effect.metric,
      modifier: effect.modifier,
      scope: "national" as const,
    }));
  } else if (classified.blocker.startsWith("regionalTargetRequired:")) {
    const target = targetOf(input);
    if (!target) throw new Error("Select a target region");
    const region = world.regions[target];
    if (!region || region.countryId !== input.countryId) {
      throw new Error(`Invalid target region: ${target}`);
    }
    effects = [];
    for (const effect of config.effects) {
      if (effect.scope === "regional") {
        const stored = world.regionalMetrics[target]?.[effect.metric]?.value;
        if (!Number.isFinite(stored)) throw new Error(`Order unavailable: unsupportedMetric:${effect.metric}`);
        effects.push({ metric: effect.metric, modifier: effect.modifier, scope: "regional", regionId: target });
      } else if (world.nationalMetrics[input.countryId]?.[effect.metric] === undefined) {
        throw new Error(`Order unavailable: unsupportedMetric:${effect.metric}`);
      } else {
        effects.push({ metric: effect.metric, modifier: effect.modifier, scope: "national" });
      }
    }
  } else {
    throw new Error(`Order unavailable: ${classified.blocker}`);
  }

  const member = world.cabinetMembers.find(
    (candidate) => candidate.countryId === input.countryId && candidate.positionId === input.positionId,
  );
  if (!member) throw new Error("No cabinet holder for this position");
  const isHolder = member.characterId === "player";
  const isAdmin = world.executives[input.countryId]?.presidentId === "player";
  if (!isHolder && !isAdmin) throw new Error("Only the cabinet holder or admin can issue orders");

  normalizeMinisterialActionPool(member, world.meta.turn);
  if ((member.ministerialActions ?? 0) < 1) throw new Error("No ministerial actions remaining");

  for (const order of world.ministerialOrders) normalizeMinisterialOrderLifecycle(order, world.meta.turn);
  const duplicate = world.ministerialOrders.some((order) =>
    order.countryId === input.countryId
    && order.positionId === input.positionId
    && order.orderId === config.id
    && isMinisterialOrderActive(order, world.meta.turn));
  if (duplicate) throw new Error("This order is already active for this position");

  const currentTurn = world.meta.turn;
  const order = withMinisterialAction(member, currentTurn, () => {
    const issued: MinisterialOrder = {
      id: `minord_${currentTurn}_${world.ministerialOrders.length + 1}`,
      countryId: input.countryId,
      characterId: member.characterId,
      active: true,
      positionId: input.positionId,
      orderId: config.id,
      orderName: config.name,
      status: "active",
      duration: config.duration,
      expiresTurn: computeMinisterialOrderExpiresTurn(currentTurn, config.duration),
      effects,
      issuedAtTurn: currentTurn,
    };
    world.ministerialOrders.push(issued);
    return issued;
  });
  return { order, actionsRemaining: member.ministerialActions ?? 0, expiresTurn: order.expiresTurn ?? currentTurn };
}
