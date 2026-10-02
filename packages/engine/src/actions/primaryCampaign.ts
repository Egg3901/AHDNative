import { electoralVotesByState } from "../elections/presidentialElectoralCollege.js";
import type { ElectionRecord } from "../elections/types.js";
import type { WorldState } from "../types.js";
import {
  PRIMARY_CAMPAIGN_TICK_CAP,
  PRIMARY_HOME_SURGE_COST_ACTIONS,
  PRIMARY_HOME_SURGE_COST_FUNDS,
  PRIMARY_HOME_SURGE_PCT,
} from "../electionEngine/constants.js";

export type PrimaryCampaignResult = { ok: true; message: string; actionsCost: number } | { ok: false; error: string };

/** AHDGame primary-campaign route: price the target using its active-preset EV count. */
export function primaryCampaignActionCost(world: WorldState, stateId: string): number {
  const ev = electoralVotesByState(world, "US")[stateId] ?? 3;
  if (ev <= 5) return 3;
  if (ev <= 10) return 5;
  if (ev <= 20) return 7;
  return 10;
}

export function setPrimaryCampaignState(
  world: WorldState,
  actorId: string,
  electionId: string | undefined,
  stateId: string | undefined,
): PrimaryCampaignResult {
  if (actorId !== "player" || world.player.countryId !== "US") {
    return { ok: false, error: "Primary campaigning is available to US player candidates only." };
  }
  const race: ElectionRecord | undefined = world.elections.find((entry) => entry.id === electionId);
  if (!race || race.countryId !== "US" || race.electionType !== "president" || race.status !== "active") {
    return { ok: false, error: "Primary campaigning requires an active US presidential race." };
  }
  if (world.meta.turn >= race.primaryEndTurn) {
    return { ok: false, error: "Primary campaigning is only available during the primary phase." };
  }
  const candidate = race.candidates.find((entry) => entry.id === actorId && entry.status !== "withdrawn");
  if (!candidate) return { ok: false, error: "You are not an active candidate in this election." };
  if (candidate.campaignSuspended) {
    return { ok: false, error: "Suspended campaigns cannot change primary campaign state." };
  }
  if (!stateId || world.regions[stateId]?.countryId !== "US" || !world.stateDemographics[stateId]) {
    return { ok: false, error: "Primary campaigning requires an eligible US state." };
  }
  if (candidate.primaryCampaignState === stateId) {
    return { ok: false, error: "You are already campaigning in this state." };
  }

  const actionsCost = primaryCampaignActionCost(world, stateId);
  if (world.player.actions < actionsCost) {
    return { ok: false, error: `Not enough actions. Primary campaigning in ${stateId} costs ${actionsCost} actions.` };
  }

  // Source route performs both writes transactionally; all local gates run
  // before mutation so the in-memory action is all-or-nothing as well.
  world.player.actions -= actionsCost;
  candidate.primaryCampaignState = stateId;
  candidate.primaryCampaignTicks = 0;
  return { ok: true, message: `Now campaigning in ${stateId} during the primary.`, actionsCost };
}

/** AHDGame home-state surge: one personal AP/funds charge per primary race. */
export function usePrimaryHomeStateSurge(
  world: WorldState,
  actorId: string,
  electionId: string | undefined,
): PrimaryCampaignResult {
  if (actorId !== "player" || world.player.countryId !== "US") {
    return { ok: false, error: "The home-state surge is available to US player candidates only." };
  }
  const race = world.elections.find((entry) => entry.id === electionId);
  if (!race || race.countryId !== "US" || race.electionType !== "president" || race.status !== "active") {
    return { ok: false, error: "The home-state surge requires an active US presidential race." };
  }
  if (world.meta.turn >= race.primaryEndTurn) {
    return { ok: false, error: "The home-state surge is only available during the primary phase." };
  }
  const candidate = race.candidates.find((entry) => entry.id === actorId && entry.status !== "withdrawn");
  if (!candidate) return { ok: false, error: "You are not an active candidate in this election." };
  if (!world.player.homeRegionId || world.regions[world.player.homeRegionId]?.countryId !== "US") {
    return { ok: false, error: "You must have a home state to surge it." };
  }
  if (candidate.primarySurgeUsed) {
    return { ok: false, error: "You have already used your home-state surge this primary cycle." };
  }
  if (world.player.actions < PRIMARY_HOME_SURGE_COST_ACTIONS) {
    return { ok: false, error: `Not enough actions. The surge costs ${PRIMARY_HOME_SURGE_COST_ACTIONS}.` };
  }
  if (world.player.funds < PRIMARY_HOME_SURGE_COST_FUNDS) {
    return { ok: false, error: `Not enough personal funds. The surge costs $${PRIMARY_HOME_SURGE_COST_FUNDS.toLocaleString()}.` };
  }

  world.player.actions -= PRIMARY_HOME_SURGE_COST_ACTIONS;
  world.player.funds -= PRIMARY_HOME_SURGE_COST_FUNDS;
  candidate.primarySurgeUsed = true;
  candidate.primarySurgeBoost = PRIMARY_HOME_SURGE_PCT;
  return { ok: true, message: `Used the ${PRIMARY_HOME_SURGE_PCT}% home-state surge in ${world.player.homeRegionId}.`, actionsCost: PRIMARY_HOME_SURGE_COST_ACTIONS };
}

/** Source campaignTurn runs before primaryResolution and increments once per turn. */
export function tickPrimaryCampaigns(world: WorldState): void {
  for (const race of world.elections) {
    if (race.countryId !== "US" || race.electionType !== "president" || race.status !== "active" || world.meta.turn >= race.primaryEndTurn) continue;
    for (const candidate of race.candidates) {
      if (candidate.status === "withdrawn" || !candidate.primaryCampaignState) continue;
      candidate.primaryCampaignTicks = Math.min(
        PRIMARY_CAMPAIGN_TICK_CAP,
        Math.max(0, candidate.primaryCampaignTicks ?? 0) + 1,
      );
    }
  }
}
