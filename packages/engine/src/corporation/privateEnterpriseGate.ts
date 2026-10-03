import type { WorldState } from "../types.js";
import { COMMAND_CEILING, scheduledMarketizationLevel } from "../commandEconomy/constants.js";

/** Match AHDGame's privateEnterprisePermittedAtLevel threshold. */
export function privateEnterprisePermittedAtLevel(level: number): boolean {
  return level >= COMMAND_CEILING;
}

/** Resolve the current persisted marketization dial, with the authored era schedule as fallback. */
export function privateEnterprisePermittedInCountry(
  world: Pick<WorldState, "commandEconomy" | "meta">,
  countryId: string,
): boolean {
  const recorded = world.commandEconomy[countryId]?.marketizationLevel;
  const year = Number(world.meta.date.slice(0, 4));
  const level = Number.isFinite(recorded)
    ? recorded as number
    : scheduledMarketizationLevel(countryId, year);
  return privateEnterprisePermittedAtLevel(level);
}
