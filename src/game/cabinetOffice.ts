import {
  MINISTERIAL_ACTION_CAP,
  cabinetPositionsForCountry,
  classifyMinisterialOrders,
  isMinisterialOrderActive,
  normalizeMinisterialActionPool,
  normalizeMinisterialOrderLifecycle,
  type WorldState,
} from "@ahdclient/engine";

/**
 * Cabinet office projection (#261 follow-up). Read-only view over the
 * validated engine issue command: every position of the player's country
 * with its holder, eligibility, classified orders (supported, or blocked
 * with the engine refusal reason) and the country's live active orders.
 * The engine's `issueMinisterialOrder` stays authoritative; this module
 * never debits actions or appends orders.
 */

export interface CabinetOrderEffectView {
  metric: string;
  modifier: number;
  scope: "national" | "regional";
}

export interface CabinetOrderView {
  id: string;
  name: string;
  description: string;
  duration: number;
  effects: CabinetOrderEffectView[];
  /** True when the order needs an issuance-time target region. */
  targetsRegion: boolean;
  /** True when this exact order is already active for the position. */
  alreadyActive: boolean;
  available: boolean;
  /** Engine refusal reason; present exactly when unavailable. */
  disabledReason?: string;
}

export interface CabinetPositionView {
  id: string;
  name: string;
  holderName: string | null;
  isPlayerHolder: boolean;
  isVacant: boolean;
  actionsRemaining: number | null;
  canIssue: boolean;
  /** Eligibility refusal; present exactly when the player cannot issue here. */
  eligibilityReason?: string;
  orders: CabinetOrderView[];
}

export interface CabinetActiveOrderView {
  id: string;
  positionId: string;
  positionName: string;
  orderId: string;
  orderName: string;
  targetRegionId: string | null;
  targetRegionName: string | null;
  expiresTurn: number;
  turnsRemaining: number;
  effects: CabinetOrderEffectView[];
}

export interface CabinetRegionOption {
  id: string;
  name: string;
}

export interface CabinetOfficeView {
  countryId: string;
  countryName: string;
  turn: number;
  /** True when the player holds the country's presidency (the admin path). */
  isExecutive: boolean;
  positions: CabinetPositionView[];
  activeOrders: CabinetActiveOrderView[];
  regions: CabinetRegionOption[];
}

export interface IssueCabinetOrderInput {
  positionId: string;
  orderId: string;
  targetRegionId?: string;
}

function describeBlocker(blocker: string): string {
  if (blocker.startsWith("regionalTargetRequired:")) return "Select a target region";
  if (blocker.startsWith("defenseUnavailable:")) return `Order unavailable: ${blocker}`;
  return `Order unavailable: ${blocker}`;
}

function positionName(countryId: string, positionId: string): string {
  return cabinetPositionsForCountry(countryId).find((position) => position.id === positionId)?.name ?? positionId;
}

/** Detached cabinet-office projection for the player's country. */
export function projectCabinetOffice(world: WorldState): CabinetOfficeView {
  const countryId = world.player.countryId;
  const countryName = world.countries[countryId]?.name ?? countryId;
  const isExecutive = world.executives[countryId]?.presidentId === "player";
  for (const order of world.ministerialOrders) normalizeMinisterialOrderLifecycle(order, world.meta.turn);

  const regions = Object.values(world.regions)
    .filter((region) => region.countryId === countryId)
    .map((region) => ({ id: region.id, name: region.name }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const regionName = (id: string | undefined): string | null =>
    id ? (world.regions[id]?.name ?? id) : null;

  const positions = cabinetPositionsForCountry(countryId).map((position) => {
    const member = world.cabinetMembers.find(
      (candidate) => candidate.countryId === countryId && candidate.positionId === position.id,
    );
    const isPlayerHolder = member?.characterId === "player";
    const canAct = member !== undefined && (isPlayerHolder || isExecutive);
    let actionsRemaining: number | null = null;
    let eligibilityReason: string | undefined;
    if (!member) {
      eligibilityReason = "No cabinet holder for this position";
    } else {
      normalizeMinisterialActionPool(member, world.meta.turn);
      actionsRemaining = member.ministerialActions ?? 0;
      if (!canAct) eligibilityReason = "Only the cabinet holder or admin can issue orders";
      else if (actionsRemaining < 1) eligibilityReason = "No ministerial actions remaining";
    }

    const classified = classifyMinisterialOrders(world, countryId, position.id);
    const orders: CabinetOrderView[] = classified.map((order) => {
      const alreadyActive = world.ministerialOrders.some(
        (issued) =>
          issued.countryId === countryId
          && issued.positionId === position.id
          && issued.orderId === order.id
          && isMinisterialOrderActive(issued, world.meta.turn),
      );
      const targetsRegion = order.availability === "blocked"
        && order.blocker.startsWith("regionalTargetRequired:");
      // A duplicate-active order refuses at issue time even when its catalog
      // entry classifies as supported, mirroring the engine gate order.
      const disabledReason = alreadyActive
        ? "This order is already active for this position"
        : order.availability === "blocked" && !targetsRegion
          ? describeBlocker(order.blocker)
          : undefined;
      return {
        id: order.id,
        name: order.name,
        description: order.description,
        duration: order.duration,
        effects: order.effects.map((effect) => ({ metric: effect.metric, modifier: effect.modifier, scope: effect.scope })),
        targetsRegion,
        alreadyActive,
        available: disabledReason === undefined,
        ...(disabledReason ? { disabledReason } : {}),
      };
    });

    return {
      id: position.id,
      name: position.name,
      holderName: member?.characterName ?? null,
      isPlayerHolder: isPlayerHolder ?? false,
      isVacant: member === undefined,
      actionsRemaining,
      canIssue: eligibilityReason === undefined,
      ...(eligibilityReason ? { eligibilityReason } : {}),
      orders,
    };
  });

  const activeOrders: CabinetActiveOrderView[] = world.ministerialOrders
    .filter((order) => order.countryId === countryId && isMinisterialOrderActive(order, world.meta.turn))
    .map((order) => {
      const targetRegionId = order.effects.find((effect) => effect.scope === "regional")?.regionId ?? null;
      return {
        id: order.id,
        positionId: order.positionId ?? "",
        positionName: positionName(countryId, order.positionId ?? ""),
        orderId: order.orderId ?? "",
        orderName: order.orderName ?? order.orderId ?? order.id,
        targetRegionId,
        targetRegionName: targetRegionId ? regionName(targetRegionId) : null,
        expiresTurn: order.expiresTurn ?? order.issuedAtTurn,
        turnsRemaining: Math.max(0, (order.expiresTurn ?? order.issuedAtTurn) - world.meta.turn),
        effects: order.effects.map((effect) => ({
          metric: effect.metric,
          modifier: effect.modifier,
          scope: effect.scope,
          ...(effect.regionId ? { regionId: effect.regionId } : {}),
        })),
      };
    })
    .sort((left, right) => left.expiresTurn - right.expiresTurn || left.id.localeCompare(right.id));

  return {
    countryId,
    countryName,
    turn: world.meta.turn,
    isExecutive,
    positions,
    activeOrders,
    regions,
  };
}

/** Cap mirror for copy that names the per-position action budget. */
export { MINISTERIAL_ACTION_CAP };
