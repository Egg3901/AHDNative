import { NPP_HOME_REGION_SEATS } from "@ahdclient/content";
import type { WorldState } from "../types.js";

/**
 * Expand source `seatsHeld` rows onto Native's one-politician-per-seat roster.
 * Game seeds one NPP per source region/party row, with that row's homeState;
 * Native's roster represents each seat separately, so every expanded seat gets
 * the source row's region. IDs and party membership are left untouched.
 *
 * A group is assigned only when its source seat count exactly matches the
 * generated roster and every source region exists in the same country. This
 * keeps content drift or unsupported country/era packs from receiving guessed
 * geography. Existing homeState values are never rewritten.
 */
export function assignSourceHomeStates(world: WorldState): void {
  const sourceRows = NPP_HOME_REGION_SEATS.filter((row) => row.eraId === world.meta.era);
  const groupKey = (countryId: string, chamberKey: string, partyId: string) =>
    `${countryId}\u0000${chamberKey}\u0000${partyId}`;
  const grouped = new Map<string, typeof sourceRows[number][]>();
  for (const row of sourceRows) {
    const key = groupKey(row.countryId, row.chamberKey, row.partyId);
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }

  for (const rows of grouped.values()) {
    const first = rows[0];
    if (!first || rows.some((row) => row.countryId !== first.countryId || row.chamberKey !== first.chamberKey || row.partyId !== first.partyId)) continue;
    const politicians = world.politicians
      .filter((politician) => politician.countryId === first.countryId
        && politician.chamberKey === first.chamberKey
        && politician.partyId === first.partyId)
      .sort((a, b) => a.id.localeCompare(b.id));
    const seatCount = rows.reduce((sum, row) => sum + row.seats, 0);
    if (politicians.length !== seatCount || politicians.some((politician) => politician.homeState !== undefined)) continue;
    if (rows.some((row) => !Number.isSafeInteger(row.seats) || row.seats < 1
      || world.regions[row.regionId]?.countryId !== first.countryId)) continue;

    let politicianIndex = 0;
    for (const row of rows) {
      for (let seat = 0; seat < row.seats; seat++) {
        const politician = politicians[politicianIndex++];
        if (!politician) break;
        politician.homeState = row.regionId;
      }
    }
  }
}
