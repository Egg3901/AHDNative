import type { DemographicCategory, StateDemographics } from "../electionEngine/types.js";

/** Source: AHDGame src/lib/turn/primaryStaggerPhase.ts, pinned cb66acdf. */
export const PRIMARY_TURNOUT_FACTOR = 0.13;
export const PRIMARY_TURNOUT_FLOOR = 0.05;
export const PRIMARY_CENTRIST_RETENTION = 0.5;

export interface PrimaryPartyPosition {
  economicPosition: number;
  socialPosition: number;
}

/** Exact directional participation curve from shiftPrimaryElectorate.ts. */
export function primaryTurnoutRetention(
  economicLean: number,
  socialLean: number,
  party: PrimaryPartyPosition,
): number {
  const partyMagnitudeSquared = Math.max(
    1,
    party.economicPosition * party.economicPosition + party.socialPosition * party.socialPosition,
  );
  const alignment =
    (economicLean * party.economicPosition + socialLean * party.socialPosition) /
    partyMagnitudeSquared;
  return Math.max(
    PRIMARY_TURNOUT_FLOOR,
    Math.min(1, PRIMARY_CENTRIST_RETENTION + (1 - PRIMARY_CENTRIST_RETENTION) * alignment),
  );
}

/** Apply the source retention curve to the already resolved live group rates. */
export function applyPrimaryTurnoutRetention(
  turnoutByGroup: Readonly<Record<string, number>>,
  demographics: StateDemographics,
  party: PrimaryPartyPosition,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [groupId, turnout] of Object.entries(turnoutByGroup)) {
    const group = demographics.groups[groupId];
    if (!group) {
      result[groupId] = turnout;
      continue;
    }
    result[groupId] = Math.max(
      0,
      turnout * primaryTurnoutRetention(group.economicLean, group.socialLean, party),
    );
  }
  return result;
}

/** Exact source computeTurnoutPoolFromRates math over the authored category substrate. */
export function computeTurnoutPoolFromRates(
  statePopulation: number,
  demographics: StateDemographics,
  categories: readonly DemographicCategory[],
  turnoutByGroup: Readonly<Record<string, number>>,
): number {
  let pool = 0;
  for (const category of categories) {
    const categoryWeight = demographics.categoryWeights[category._id] ?? 0;
    if (categoryWeight <= 0) continue;
    for (const group of category.groups) {
      const stateGroup = demographics.groups[group.id];
      pool +=
        statePopulation *
        ((stateGroup?.population ?? 0) / 100) *
        ((turnoutByGroup[group.id] ?? 0) / 100) *
        (categoryWeight / 100);
    }
  }
  return Math.round(pool);
}
