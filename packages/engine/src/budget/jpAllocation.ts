import type { WorldState } from "../types.js";

export const JP_INTERNAL_AFFAIRS_MINISTER = "JP_internal_affairs_minister";

export type JPAllocationResult = { ok: true } | { ok: false; error: string };

/**
 * Apply the source cabinet allocation endpoint's supported single-player
 * contract: the current cabinet holder may set a percentage map once per
 * turn, and its values must total 100% (±0.1 for floating point). The source
 * endpoint has an admin override; Native has no separate admin actor, so only
 * the actual office holder is represented here.
 */
export function setJPRegionalBudgetAllocation(
  world: WorldState,
  allocationPercents: Record<string, number>,
): JPAllocationResult {
  const holder = world.cabinetMembers.find(
    (member) => member.countryId === "JP" && member.positionId === JP_INTERNAL_AFFAIRS_MINISTER,
  );
  if (!holder || holder.characterId !== "player") {
    return { ok: false, error: "Only Japan's Internal Affairs Minister can set regional allocations." };
  }

  const entries = Object.entries(allocationPercents);
  if (entries.length === 0 || entries.some(([, value]) => !Number.isFinite(value) || value < 0 || value > 100)) {
    return { ok: false, error: "Each regional allocation must be between 0 and 100%." };
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (Math.abs(total - 100) > 0.1) {
    return { ok: false, error: `Allocations must sum to 100%. Current total: ${total.toFixed(1)}%.` };
  }

  const previous = world.jpRegionalBudgetAllocation;
  if (previous && previous.lastAllocationChangedTurn >= world.meta.turn) {
    return { ok: false, error: "Allocations can only be updated once per turn." };
  }

  world.jpRegionalBudgetAllocation = {
    allocationPercents: Object.fromEntries(entries),
    lastAllocationChangedTurn: world.meta.turn,
  };
  return { ok: true };
}
