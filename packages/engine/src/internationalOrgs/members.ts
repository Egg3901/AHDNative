/**
 * Who can vote, and who pays what — the Native port of
 * src/lib/internationalOrganizations/orgMembership.ts.
 *
 * The reference rule: membership is open to any entity; voting, leadership and
 * dues belong to player-enabled countries; everyone else pays tribute and is
 * silent. Native has no per-country `enabledForPlayers` flag; the closest
 * modelled predicate is `Country.playable` (US/UK/RU/DD in the 1953 pack — the
 * same set a human can pick). So:
 *
 *   voting member   == org member whose world.countries[id].playable === true
 *   tribute member  == org member that is not a voting member (exact complement)
 *
 * That partition is deliberate, exactly as the reference docblock insists:
 * `votingMembers` and `tributeMembers` partition the roll, so nobody is billed
 * twice and nobody escapes both. For 1953 NATO the tribute roll is
 * {FR, IT, TR, GR} minus the {US, UK} voters — the same client roster the
 * reference's own note names ("NATO collecting from France, Italy, Turkey and
 * Greece").
 */
import type { WorldState } from "../types.js";
import type { InternationalOrgState } from "./types.js";

/** Members entitled to vote and hold office: playable countries only. */
export function votingMembers(world: WorldState, org: InternationalOrgState): string[] {
  return org.members.filter((id) => world.countries[id]?.playable === true);
}

/** Members that owe tribute rather than dues — the exact complement of the above. */
export function tributeMembers(world: WorldState, org: InternationalOrgState): string[] {
  return org.members.filter((id) => world.countries[id]?.playable !== true);
}

/** Whether one entity is a member of the org. */
export function isMember(org: InternationalOrgState, countryId: string): boolean {
  return org.members.includes(countryId);
}

/** Whether one entity may cast a (policy) vote in the org. */
export function isVotingMember(world: WorldState, org: InternationalOrgState, countryId: string): boolean {
  return world.countries[countryId]?.playable === true && isMember(org, countryId);
}

/** Members that the game prices (have a world.countries economy). */
export function modelledMembers(world: WorldState, org: InternationalOrgState): string[] {
  return org.members.filter((id) => world.countries[id] !== undefined);
}
