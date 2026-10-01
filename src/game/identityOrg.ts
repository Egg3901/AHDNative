import type { WorldState } from "@ahdclient/engine";
import { projectProfileCorporations } from "./profileCorporation";

/**
 * Live-shell "My Corporation" drawer signal (#51, #84 P04).
 *
 * Reference (public Egg3901/AHDGame
 * `src/components/navbar/profileNavItems.ts`): the "My Corporation" identity
 * row shows exactly when `myCorporationId != null` and deep-links
 * `/corporation/{id}`. Native uses the recorded active CEO appointment,
 * shared with the Profile card through `projectProfileCorporations`.
 * Holding shares alone does not supply either identity entry.
 *
 * The first active CEO corporation in markets projection order supplies
 * the drawer link. Persisted appointment, vacancy and resignation determine
 * eligibility after reload. Union identity is projected separately.

 */
export interface MyCorporationLink {
  id: string;
  name: string;
}

export function projectMyCorporation(world: WorldState): MyCorporationLink | null {
  const first = projectProfileCorporations(world)[0];
  return first ? { id: first.id, name: first.name } : null;
}
