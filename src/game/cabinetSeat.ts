import { cabinetPositionsForCountry, type WorldState } from "@ahdclient/engine";

/**
 * The player's validated cabinet seat for drawer gating (#510). Mirrors
 * AHDGame `resolveCabinetOfficeNavEntry` (member row from the unified
 * `cabinetMembers` collection, position validated against the member's own
 * country list; stale rows after a config change resolve to null). Only the
 * player's own seat counts: the presidency, nominations, and other offices
 * never infer membership. Old saves without cabinet rows project null.
 *
 * Lives apart from `cabinetOffice.ts` on purpose: that module pulls the full
 * ministerial-order engine surface, while this signal needs only the country
 * position tables, so drawer gating stays testable without the order engine.
 */
export function projectCabinetMembership(world: WorldState): { positionId: string; positionName: string } | null {
  const countryId = world.player.countryId;
  // Old saves can reach the projector without cabinet rows; absent means no
  // seat, never a crash.
  const members: unknown = world.cabinetMembers;
  if (!Array.isArray(members)) return null;
  const seat = members.find(
    (candidate): candidate is { positionId: string; countryId: string } =>
      typeof candidate === "object"
      && candidate !== null
      && (candidate as { characterId?: unknown }).characterId === "player"
      && (candidate as { countryId?: unknown }).countryId === countryId
      && typeof (candidate as { positionId?: unknown }).positionId === "string",
  );
  if (!seat) return null;
  const position = cabinetPositionsForCountry(countryId).find((entry) => entry.id === seat.positionId);
  if (!position) return null;
  return { positionId: position.id, positionName: position.name };
}
