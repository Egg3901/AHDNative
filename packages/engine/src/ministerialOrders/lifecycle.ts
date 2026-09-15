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
  if (Number.isFinite(order.duration) && (order.duration ?? 0) > 0) {
    return computeMinisterialOrderExpiresTurn(order.issuedAtTurn, order.duration);
  }
  if (Number.isFinite(order.expiresTurn)) return order.expiresTurn as number;
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
  order.duration = Number.isFinite(order.duration) && (order.duration ?? 0) > 0
    ? order.duration
    : Math.max(1, expiresTurn - order.issuedAtTurn);
  order.expiresTurn = expiresTurn;

  if (!isMinisterialOrderActive(order, currentTurn)) {
    if (order.active) order.expiredAtTurn = currentTurn;
    order.active = false;
    order.status = "expired";
    return;
  }
  order.status = "active";
}
