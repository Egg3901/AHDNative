/**
 * Lazy org-state normalization.
 *
 * A freshly seeded world carries only { id, name, foundedYear, members } on
 * each org (see internationalOrgs/types.ts file doc). The runtime sub-fields
 * are created the first time the turn phase — or a player action — touches the
 * org. This keeps the seeded serialized shape byte-identical to pre-#113 saves
 * while still giving every resolver a populated record to mutate.
 */
import type { WorldState } from "../types.js";
import type { InternationalOrgState, OrgFund, OrgLeadership, OrgResolution, OrgMembershipProposal, OrgLeadershipElection, TradeEmbargo } from "./types.js";
import { DEFAULT_ORG_DUES_RATE_ANNUAL } from "./constants.js";

/** The country whose currency an org's fund is denominated in — its first member, or US. */
export function orgFundCurrencyCountry(org: InternationalOrgState): string {
  return org.members[0] ?? "US";
}

function vacantLeadership(): OrgLeadership {
  return { holderCountryId: null, holderName: null, electedOnTurn: null, termEndsOnTurn: null };
}

function freshFund(org: InternationalOrgState): OrgFund {
  return { balance: 0, duesRateAnnual: DEFAULT_ORG_DUES_RATE_ANNUAL, currencyCountryId: orgFundCurrencyCountry(org) };
}

/**
 * Fill every missing runtime field in place (idempotent). Returns the same org
 * for chaining. Deterministic — no RNG, no clock.
 */
export function ensureOrgState(org: InternationalOrgState): InternationalOrgState {
  org.leadership ??= vacantLeadership();
  org.fund ??= freshFund(org);
  org.resolutions ??= [];
  org.membershipProposals ??= [];
  org.leadershipElections ??= [];
  org.embargoes ??= [];
  return org;
}

/** ensureOrgState for every org in the world. Called once at the top of the phase. */
export function ensureAllOrgState(world: WorldState): void {
  for (const org of Object.values(world.internationalOrgs)) ensureOrgState(org);
}

/** Normalized accessors (post-ensureOrgState these are all present). */
export function leadershipOf(org: InternationalOrgState): OrgLeadership {
  return ensureOrgState(org).leadership!;
}
export function fundOf(org: InternationalOrgState): OrgFund {
  return ensureOrgState(org).fund!;
}
export function resolutionsOf(org: InternationalOrgState): OrgResolution[] {
  return ensureOrgState(org).resolutions!;
}
export function proposalsOf(org: InternationalOrgState): OrgMembershipProposal[] {
  return ensureOrgState(org).membershipProposals!;
}
export function electionsOf(org: InternationalOrgState): OrgLeadershipElection[] {
  return ensureOrgState(org).leadershipElections!;
}
export function embargoesOf(org: InternationalOrgState): TradeEmbargo[] {
  return ensureOrgState(org).embargoes!;
}
