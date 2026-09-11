/**
 * Turn-based party-membership gate for party leadership candidacy and voting.
 *
 * This mirrors AHDGame's src/lib/parties/leadershipTenure.ts. A missing
 * partyJoinedTurn is grandfathered as eligible so old Native saves do not
 * lock established members out before the field was introduced.
 */

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
