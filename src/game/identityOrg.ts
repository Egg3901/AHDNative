import type { WorldState } from "@ahdclient/engine";
import { projectProfileCorporations } from "./profileCorporation";

/**
 * Live-shell "My Corporation" drawer signal (#51, #84 P04).
 *
 * Reference (public Egg3901/AHDGame
 * `src/components/navbar/profileNavItems.ts`): the "My Corporation" identity
 * row shows exactly when `myCorporationId != null` and deep-links
 * `/corporation/{id}`. Native records no CEO id — corporations are
 * single-sector and NPC-run — so the recorded player-owned sector asset
 * (`CorporateSectorAsset.owner === "player"`) is the authority. The gate is
 * shared verbatim with the Profile card (`projectProfileCorporations`), so
 * the drawer row and the card can never disagree: a recorded shareholder
 * with no sector asset gets neither.
 *
 * One row, like the reference: the first owned listing in
 * markets-projection order (player country first, then country and ticker).
 * When several sectors are owned the Profile card lists every one and the
 * drawer links that primary entry. Null (key omitted from the view) means
 * no recorded ownership — including pre-sector saves — and the drawer omits
 * the row entirely. Union membership stays unprojected with no Native
 * destination, so no union row is ever supplied.
 */
export interface MyCorporationLink {
  id: string;
  name: string;
}

export function projectMyCorporation(world: WorldState): MyCorporationLink | null {
  const first = projectProfileCorporations(world)[0];
  return first ? { id: first.id, name: first.name } : null;
}
