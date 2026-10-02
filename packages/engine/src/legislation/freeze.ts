import type { WorldState } from "../types.js";

/** Source wording: AHDGame `src/lib/government/legislationFreeze.ts`. */
export const LEGISLATION_FREEZE_MESSAGE =
  "Government is in formation; legislation is frozen until a PM is seated";

/** A present parliamentary formation record in `pending` status freezes bills. */
export function isLegislationFrozen(world: WorldState, countryId: string): boolean {
  return world.governments[countryId]?.status === "pending";
}
