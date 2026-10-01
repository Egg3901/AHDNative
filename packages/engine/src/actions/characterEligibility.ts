import type { WorldState } from "../types.js";
import { ACTION_GDP_BASELINES } from "./gdpBaselines.generated.js";

/** AHDGame 08820d1 actions/rules.ts allocated-stat and home-state gates. */
export function characterActionDisabledReason(world: WorldState, actionId: string): string | undefined {
  const player = world.player;
  if (actionId === "campaign" && player.politicalInfluence >= 100) return "Your political influence is already at maximum (100%).";
  const required: Record<string, readonly string[]> = {
    campaign: ["charisma", "intellect"], advertise: ["charisma"],
    buildDonorBase: ["fundraising"], poll: ["intellect"], pollLarge: ["intellect"],
  };
  if (world.featureFlags.rpgStats) {
    for (const key of required[actionId] ?? []) {
      const stat = player.stats?.[key as keyof NonNullable<typeof player.stats>];
      if (typeof stat !== "number" || !Number.isFinite(stat)) {
        return `${actionId === "buildDonorBase" ? "Build Donor Network" : actionId === "poll" || actionId === "pollLarge" ? "Polling" : actionId === "campaign" ? "Campaign" : "Advertise"} requires an allocated ${key} stat. Allocate your stats before using this action.`;
      }
    }
  }
  if (["campaign", "advertise", "buildDonorBase"].includes(actionId)) {
    const home = world.regions[player.homeRegionId ?? ""];
    if (!home || home.countryId !== player.countryId || !Number.isFinite(home.gdp) || home.gdp! < 0 || !Number.isFinite(home.population) || home.population! <= 0) {
      return "This action requires home-state economic data (GDP and population).";
    }
    if (!ACTION_GDP_BASELINES[player.countryId]?.[world.meta.era]) return `No reference action GDP baseline is available for ${player.countryId} in ${world.meta.era}.`;
  }
  return undefined;
}
