/**
 * Party leadership eligibility shared by actions and election phases.
 *
 * This mirrors AHDGame's src/lib/parties/leadershipTenure.ts. A missing
 * partyJoinedTurn is grandfathered as eligible so old Native saves do not
 * lock established members out before the field was introduced.
 */

import type { WorldState } from "../types.js";

export const PARTY_LEADERSHIP_TENURE_TURNS = 24;

export interface PartyLeadershipTenure {
  turnsServed: number;
  eligible: boolean;
  turnsRemaining: number;
}

export function getPartyLeadershipTenure(
  partyJoinedTurn: number | null | undefined,
  currentTurn: number,
  partyId: string,
  foundedPartyId?: string | null,
  requiredTurns: number = PARTY_LEADERSHIP_TENURE_TURNS,
): PartyLeadershipTenure {
  if (foundedPartyId != null && foundedPartyId !== "" && foundedPartyId === partyId) {
    return { turnsServed: Number.POSITIVE_INFINITY, eligible: true, turnsRemaining: 0 };
  }
  if (partyJoinedTurn == null) {
    return { turnsServed: Number.POSITIVE_INFINITY, eligible: true, turnsRemaining: 0 };
  }
  const turnsServed = Math.max(0, currentTurn - partyJoinedTurn);
  const turnsRemaining = Math.max(0, requiredTurns - turnsServed);
  return { turnsServed, eligible: turnsRemaining === 0, turnsRemaining };
}

export function getFoundedPartyId(world: WorldState, partyId: string): string | null {
  return world.charters.find(
    (charter) => charter.partyId === partyId && charter.founderId === "player",
  )?.partyId ?? null;
}

export function getPlayerPartyLeadershipGate(
  world: WorldState,
  partyId: string,
  options: { founding?: boolean; regionId?: string } = {},
): { eligible: boolean; reason: "party" | "region" | "tenure" | null; turnsRemaining: number } {
  if (world.player.partyId !== partyId) {
    return { eligible: false, reason: "party", turnsRemaining: 0 };
  }
  if (options.regionId !== undefined && world.player.homeRegionId !== options.regionId) {
    return { eligible: false, reason: "region", turnsRemaining: 0 };
  }
  if (options.founding) return { eligible: true, reason: null, turnsRemaining: 0 };
  const tenure = getPartyLeadershipTenure(
    world.player.partyJoinedTurn,
    world.meta.turn,
    partyId,
    getFoundedPartyId(world, partyId),
  );
  return { eligible: tenure.eligible, reason: tenure.eligible ? null : "tenure", turnsRemaining: tenure.turnsRemaining };
}

/** National chair or, while vacant, the national vice chair may act for a party. */
export function isPartyLeadershipAuthority(world: WorldState, partyId: string, actorId: string): boolean {
  const party = world.parties[partyId];
  if (!party) return false;
  if (party.chairId === actorId) return true;
  return party.chairId == null && party.viceChairId === actorId;
}

export function isPlayerNationalLeadershipVoter(world: WorldState, partyId: string): boolean {
  if (world.player.partyId !== partyId) return false;
  const party = world.parties[partyId];
  if (!party || party.leadershipElectionMethod !== "committee") return true;
  return party.committeeIds?.includes("player") === true
    || party.chairId === "player"
    || party.viceChairId === "player"
    || party.treasurerId === "player";
}
