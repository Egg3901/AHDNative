import type { MinisterialOrder } from "./types.js";

/** The source game's default duration for a standing ministerial order. */
export const DEFAULT_MINISTERIAL_ORDER_DURATION = 24;

export function computeMinisterialOrderExpiresTurn(
  issuedAtTurn: number,
  duration = DEFAULT_MINISTERIAL_ORDER_DURATION,
): number {
  return issuedAtTurn + duration;
}

export function resolveMinisterialOrderExpiresTurn(
  order: Pick<MinisterialOrder, "issuedAtTurn" | "duration" | "expiresTurn">,
): number {
  if (order.duration != null && Number.isFinite(order.duration)) {
    return computeMinisterialOrderExpiresTurn(order.issuedAtTurn, order.duration);
  }
  const coerced = Number(order.expiresTurn);
  if (Number.isFinite(coerced)) return coerced;
  return computeMinisterialOrderExpiresTurn(order.issuedAtTurn);
}

export function isMinisterialOrderActive(
  order: Pick<MinisterialOrder, "active" | "issuedAtTurn" | "duration" | "expiresTurn">,
  currentTurn: number,
): boolean {
  return order.active && resolveMinisterialOrderExpiresTurn(order) > currentTurn;
}

/** Fill lifecycle fields on pre-#258 saves and expire at the exclusive boundary. */
export function normalizeMinisterialOrderLifecycle(order: MinisterialOrder, currentTurn: number): void {
  const expiresTurn = resolveMinisterialOrderExpiresTurn(order);
  order.duration = order.duration != null && Number.isFinite(order.duration)
    ? order.duration
    : expiresTurn - order.issuedAtTurn;
  order.expiresTurn = expiresTurn;

  if (!isMinisterialOrderActive(order, currentTurn)) {
    if (order.active) order.expiredAtTurn = currentTurn;
    order.active = false;
    order.status = "expired";
    return;
  }
  order.status = "active";
}
