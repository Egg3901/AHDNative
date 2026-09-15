import type { CabinetMember } from "./types.js";

/** Source cap from AHDGame cabinetMechanicsTypes.ts. */
export const MINISTERIAL_ACTION_CAP = 4;

/**
 * Native has no wall-clock server reset. One in-game day is represented by
 * the reference's former 24-turn interval, giving deterministic save/replay.
 */
export const MINISTERIAL_ACTION_REFILL_INTERVAL = 24;

export function initialMinisterialActionFields(currentTurn: number): Pick<
  CabinetMember,
  "ministerialActions" | "lastMinisterialActionRefillTurn"
> {
  return {
    ministerialActions: MINISTERIAL_ACTION_CAP,
    lastMinisterialActionRefillTurn: currentTurn,
  };
}

/** Backfill legacy appointments at first observation, preserving a known balance. */
export function normalizeMinisterialActionPool(member: CabinetMember, currentTurn: number): void {
  if (!Number.isFinite(member.ministerialActions)) {
    member.ministerialActions = MINISTERIAL_ACTION_CAP;
  } else {
    member.ministerialActions = Math.max(0, Math.min(MINISTERIAL_ACTION_CAP, member.ministerialActions!));
  }
  if (!Number.isFinite(member.lastMinisterialActionRefillTurn)) {
    member.lastMinisterialActionRefillTurn = currentTurn;
  }
}

export function refillMinisterialActionPool(member: CabinetMember, currentTurn: number): boolean {
  normalizeMinisterialActionPool(member, currentTurn);
  if (currentTurn - member.lastMinisterialActionRefillTurn! < MINISTERIAL_ACTION_REFILL_INTERVAL) {
    return false;
  }
  member.ministerialActions = MINISTERIAL_ACTION_CAP;
  member.lastMinisterialActionRefillTurn = currentTurn;
  return true;
}

export function refillMinisterialActionPools(members: CabinetMember[], currentTurn: number): number {
  let refilled = 0;
  for (const member of members) {
    if (refillMinisterialActionPool(member, currentTurn)) refilled++;
  }
  return refilled;
}

/** A single synchronous compare-and-debit seam for future order issuance. */
export function spendMinisterialAction(member: CabinetMember, currentTurn: number): boolean {
  refillMinisterialActionPool(member, currentTurn);
  if (member.ministerialActions! < 1) return false;
  member.ministerialActions = member.ministerialActions! - 1;
  return true;
}

export function refundMinisterialAction(member: CabinetMember): void {
  member.ministerialActions = Math.min(MINISTERIAL_ACTION_CAP, (member.ministerialActions ?? 0) + 1);
}

/** Debit before persistence and restore the debit if issuance throws. */
export function withMinisterialAction<T>(member: CabinetMember, currentTurn: number, issue: () => T): T {
  if (!spendMinisterialAction(member, currentTurn)) {
    throw new Error("No ministerial actions remaining");
  }
  try {
    return issue();
  } catch (error) {
    refundMinisterialAction(member);
    throw error;
  }
}
