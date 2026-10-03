import type { WorldState } from "../types.js";
import type { Bill } from "../legislation/types.js";

const SOURCE_NPP_CONTROL_TENURE_MS = 48 * 60 * 60 * 1000;

export function partyWhipEligibilityError(world: WorldState, bill: Bill, observedAt?: string): string | null {
  if (bill.status !== "active" && bill.status !== "active_other" && bill.status !== "veto_override") {
    return "A party whip requires an open chamber vote";
  }
  const partyId = world.player.partyId;
  if (!partyId) return "Join a party before issuing a whip";
  const party = world.parties[partyId];
  if (!party || party.countryId !== bill.countryId || bill.countryId !== world.player.countryId) {
    return "Party and bill must be in the same country";
  }
  if (party.chairId !== "player" && party.viceChairId !== "player") {
    return "Party whip requires the national chair or vice chair";
  }

  // Source `getPartyNppControlStatus` uses real `createdAt` and
  // `partyJoinedAt/lastPartySwitchAt` dates, not game turns. Old Native saves
  // have no wall-clock anchors; those preserve the source helper's permissive
  // missing-date behavior. New public party/membership writes persist anchors.
  if (!party.isDefault) {
    const partyCreatedAt = party.nppControlCreatedAt;
    const partyAnchor = partyCreatedAt === undefined ? undefined : Date.parse(partyCreatedAt);
    if (partyAnchor !== undefined && !Number.isFinite(partyAnchor)) {
      return "Custom party has an invalid NPP-control creation timestamp";
    }
    const memberAnchors = [world.player.partyJoinedAt, world.player.lastPartySwitchAt]
      .filter((value): value is string => typeof value === "string")
      .map(Date.parse);
    if (memberAnchors.some((anchor) => !Number.isFinite(anchor))) {
      return "Player has an invalid party NPP-control membership timestamp";
    }
    const newestMemberAnchor = memberAnchors.length > 0 ? Math.max(...memberAnchors) : undefined;
    const anchors = [partyAnchor, newestMemberAnchor]
      .filter((value): value is number => value !== undefined);
    if (anchors.length > 0) {
      if (!observedAt || !Number.isFinite(Date.parse(observedAt))) {
        return "A wall-clock observation is required for custom-party NPP controls";
      }
      const now = Date.parse(observedAt);
      if (partyAnchor !== undefined && now < partyAnchor + SOURCE_NPP_CONTROL_TENURE_MS) {
        return "New custom parties cannot use NPP controls until 48 hours after creation";
      }
      if (newestMemberAnchor !== undefined && now < newestMemberAnchor + SOURCE_NPP_CONTROL_TENURE_MS) {
        return "Party NPP controls unlock after 48 hours of stable membership";
      }
    }
  }

  const attempts = currentNationalPartyWhipAttempts(world, bill, partyId);
  return attempts.length >= 2 ? "Maximum two national NPP whip attempts per bill/chamber reached" : null;
}

export function currentNationalPartyWhipAttempts(world: WorldState, bill: Bill, partyId: string) {
  const overrideStart = bill.status === "veto_override" ? bill.overrideVotingStartedAtTurn : undefined;
  return (world.partyWhips ?? []).filter((whip) =>
    whip.billId === bill.id
    && whip.partyId === partyId
    && whip.countryId === bill.countryId
    && whip.chamber === bill.currentChamber
    && whip.stateId === undefined
    && (overrideStart === undefined || whip.issuedAtTurn >= overrideStart),
  );
}
