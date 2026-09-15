import {
  getImperialTitle,
  resolveProfileDestination,
  type ImperialCharacterRecord,
  type ProfileDestination,
} from "@ahdclient/engine";
import type { WorldState } from "@ahdclient/engine";
import type { ImperialProfileView } from "./profileTypes";

/**
 * Imperial profile gate at the session boundary (#54).
 *
 * Mirrors the public AHDGame reference `src/app/profile/page.tsx`
 * `getCharacterData`: the persisted marker (`player.activeCharacterType` /
 * `player.activeImperialCharacterId`) routes to the imperial destination only
 * when a record in `world.imperialCharacters` resolves for it. Either half
 * absent — or a marker pointing at no record — stays on the ordinary profile.
 * The identity projection below carries only persisted record fields plus the
 * gender-aware ceremonial title; it never claims admin creation, which this
 * offline career cannot do.
 */

function findRecord(world: WorldState): ImperialCharacterRecord | null {
  const marker = world.player.activeImperialCharacterId;
  const table = world.imperialCharacters;
  if (marker === undefined || marker === null || table == null) return null;
  const key = String(marker).trim();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(table, key)) {
    const direct = (table as Record<string, unknown>)[key];
    if (direct != null && typeof direct === "object") return direct as ImperialCharacterRecord;
    return null;
  }
  for (const record of Object.values(table)) {
    if (record == null) continue;
    if (String((record as ImperialCharacterRecord).sequentialId) === key) {
      return record as ImperialCharacterRecord;
    }
  }
  return null;
}

function gateInput(world: WorldState): {
  activeCharacterType?: unknown;
  activeImperialCharacterId?: unknown;
  imperialCharacter?: unknown;
} {
  return {
    activeCharacterType: world.player.activeCharacterType,
    activeImperialCharacterId: world.player.activeImperialCharacterId,
    imperialCharacter: findRecord(world) ?? null,
  };
}

/** "imperial" only when the persisted marker and record resolve; else "profile". */
export function profileDestination(world: WorldState): ProfileDestination {
  return resolveProfileDestination(gateInput(world));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * The truthful imperial identity for an imperial save, or null for an
 * ordinary one. Name, house, country and bio come straight from the persisted
 * record; the title is the reference gender-aware title (null where the
 * reference configures none, e.g. ES/SE); the notice states the admin
 * boundary honestly.
 */
export function projectImperialProfile(world: WorldState): ImperialProfileView | null {
  if (profileDestination(world) !== "imperial") return null;
  const record = findRecord(world);
  if (!record) return null;
  const name = text(record.name) ?? "Unnamed imperial character";
  const royalHouse = text(record.royalHouse) ?? "Unknown house";
  const countryId = text(record.countryId) ?? world.player.countryId;
  const countryName = world.countries[countryId]?.name ?? countryId;
  const title =
    record.gender === "male" || record.gender === "female" || record.gender === "nonbinary"
      ? getImperialTitle(countryId, record.gender)
      : null;
  return {
    id: String(record.id),
    ...(typeof record.sequentialId === "number" && Number.isFinite(record.sequentialId)
      ? { sequentialId: record.sequentialId }
      : {}),
    name,
    fullName: title ? `${title} ${name}` : name,
    title,
    country: { id: countryId, name: countryName },
    royalHouse,
    ...(text(record.homeState) ? { homeState: text(record.homeState) as string } : {}),
    ...(text(record.bio) ? { bio: text(record.bio) as string } : {}),
    notice:
      "This is an imperial profile. Imperial characters are created separately by an " +
      "administrator on the live game; this offline career cannot create one.",
  };
}
