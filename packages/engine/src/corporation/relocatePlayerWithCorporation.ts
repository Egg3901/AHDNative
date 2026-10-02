import type { WorldState } from "../types.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";

export const SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS = 72;
export const SOURCE_CORPORATION_RELOCATION_COST_FRACTION = 0.07;
export const SOURCE_CROSS_COUNTRY_RELOCATION_MULTIPLIER = 2;

export type RelocatePlayerWithCorporationResult =
  | { ok: true; cost: number; crossCountry: boolean }
  | { ok: false; error: string };

/**
 * Source character/CEO combined relocation transaction.
 * Cross-currency moves stay closed until Native can convert the full issuer
 * treasury and asset portfolio and route the source FX spread atomically.
 */
export function relocatePlayerWithCorporation(
  world: WorldState,
  corporationId: string,
  destinationRegionId: string,
): RelocatePlayerWithCorporationResult {
  const corp = world.corporations[corporationId];
  if (!corp) return { ok: false, error: "Corporation not found" };
  if (corp.ceoId !== "player" || corp.ceoType !== "player" || corp.ceoVacant === true) {
    return { ok: false, error: "Only the active CEO may move with this corporation" };
  }
  if (!corp.headquartersRegionId || world.player.homeRegionId !== corp.headquartersRegionId) {
    return { ok: false, error: "The CEO must reside at the corporation's current headquarters" };
  }
  const destination = world.regions[destinationRegionId];
  if (!destination || destination.corporationHeadquartersOnly) return { ok: false, error: "Invalid destination region" };
  if (destinationRegionId === world.player.homeRegionId) return { ok: false, error: "Already in this region" };
  const currentRegion = world.regions[world.player.homeRegionId];
  if (!currentRegion) return { ok: false, error: "Current residence region is unavailable" };
  if (destination.countryId !== currentRegion.countryId || destination.countryId !== corp.countryId) {
    return { ok: false, error: "Cross-country CEO relocation requires the source residency, access, currency-conversion, and FX-settlement path" };
  }
  if (!isCorpStateOwned(corp) && !privateEnterprisePermittedInCountry(world, destination.countryId)) {
    return { ok: false, error: "Private corporations cannot relocate into a command economy" };
  }
  const lastRelocatedTurn = world.player.lastRelocatedTurn;
  if (lastRelocatedTurn !== undefined && world.meta.turn < lastRelocatedTurn + SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS) {
    return { ok: false, error: `Relocation cooldown active for ${lastRelocatedTurn + SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS - world.meta.turn} more turns` };
  }

  const marketCapLocal = corp.sharePrice * corp.totalShares;
  const cost = Math.round(marketCapLocal * SOURCE_CORPORATION_RELOCATION_COST_FRACTION);
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, error: "Cannot relocate: market capitalization is too low" };
  if (!Number.isFinite(corp.liquidCapital) || corp.liquidCapital < cost) return { ok: false, error: "Insufficient corporate cash for relocation" };

  // Validate the completed save shape before committing either side.
  const turn = world.meta.turn;
  if (!Number.isSafeInteger(turn) || turn < 0) return { ok: false, error: "Invalid current turn" };
  corp.liquidCapital -= cost;
  corp.headquartersRegionId = destination.id;
  world.player.homeRegionId = destination.id;
  world.player.lastRelocatedTurn = turn;
  return { ok: true, cost, crossCountry: false };
}
