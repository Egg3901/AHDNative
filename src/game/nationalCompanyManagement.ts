import type { WorldState } from "@ahdclient/engine";
import { CORPORATION_TYPES } from "../../packages/engine/src/corporation/types";
import { canPlayerReorganizeNationalCorporations } from "../../packages/engine/src/corporation/nationalReorganization";
import { primaryNationalCorporation } from "../../packages/engine/src/corporation/nationalCorporation";

/** Detached official controls from the same authority and routing as commands. */
export function projectNationalCompanyManagement(world: WorldState) {
  const countryId = world.player.countryId;
  if (!canPlayerReorganizeNationalCorporations(world, countryId)) return undefined;
  const corporations = Object.values(world.corporations).filter(corporation => corporation.countryOwnerId === countryId)
    .map(corporation => ({ id: corporation.id, name: corporation.name ?? corporation.id,
      isPrimary: corporation.isPrimaryNationalCorporation === true,
      assignedSectorTypes: corporation.assignedSectorTypes?.slice() ?? [],
    }));
  const claimed = new Set(corporations.flatMap(corporation => corporation.assignedSectorTypes));
  return { countryId, primaryId: primaryNationalCorporation(world, countryId)?.id,
    splitTypes: CORPORATION_TYPES.filter(type => !claimed.has(type)), corporations };
}
export type NationalCompanyManagementView = NonNullable<ReturnType<typeof projectNationalCompanyManagement>>;
