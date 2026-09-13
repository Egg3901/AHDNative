/**
 * Player / country org actions — the write side the reference scatters across
 * route handlers and command modules (src/app/api/internationalOrganizations/*,
 * src/lib/internationalOrganizations/commands/*). Each action VALIDATES the four
 * things the issue's acceptance asks for before writing:
 *
 *   - membership  — the acting country must be a member;
 *   - authority   — proposing and standing for office require a VOTING member
 *                   (a playable country), while voting is allowed for any voting
 *                   member of the ballot's roll;
 *   - cost        — a proposal costs one action (see the cost note below);
 *   - status      — a ballot must still be pending, and a country cannot open a
 *                   second live proposal of the same kind.
 *
 * COST. The reference charges one from a per-country diplomatic-action budget
 * (DIPLOMATIC_ACTIONS_PER_TURN, diplomaticActions.ts). Native has no per-country
 * diplomatic pool, so the acting country's native action pool stands in where
 * one exists — currently the player's `world.player.actions`. NPC countries have
 * no modelled action economy, so their proposals carry no charge (they are
 * validated on membership/authority/status only). This is a named reduction, not
 * an invented mechanic.
 */
import type { WorldState } from "../types.js";
import type { InternationalOrgState, OrgResolution, OrgVoteValue, OrgResolutionType } from "./types.js";
import { ORG_PROPOSAL_VOTING_TURNS } from "./constants.js";
import { isMember, isVotingMember, votingMembers } from "./members.js";
import { electionsOf, ensureOrgState, proposalsOf, resolutionsOf } from "./state.js";

export type OrgActionFailure = { ok: false; error: string };
export type OrgActionSuccess<T> = { ok: true } & T;
/** Success with no payload (e.g. casting a vote). */
export type OrgActionOk = { ok: true };

function orgOrNull(world: WorldState, orgId: string): InternationalOrgState | null {
  const org = world.internationalOrgs[orgId];
  return org ? ensureOrgState(org) : null;
}

/** Whether the acting country can pay the one-action proposal cost. */
export function canAffordOrgAction(world: WorldState, countryId: string): boolean {
  if (countryId === world.player.countryId) return world.player.actions >= 1;
  return true; // NPC countries have no Native action economy — validated on membership/authority/status only
}

function spendOrgAction(world: WorldState, countryId: string): void {
  if (countryId === world.player.countryId) world.player.actions -= 1;
}

function nextId(prefix: string, orgId: string, turn: number, seq: number): string {
  return `${prefix}-${orgId}-${turn}-${seq}`;
}

export interface ProposeResolutionParams {
  orgId: string;
  countryId: string;
  type: OrgResolutionType;
  title: string;
  parties?: string[];
  sanctionsTargetCountryId?: string;
  sanctionsCommodity?: string;
  duesRateAnnual?: number;
  directiveKey?: string;
  jointStatementSubjectCountryId?: string;
  jointStatementStance?: "endorse" | "condemn";
  aidRecipientCountryId?: string;
  aidAmount?: number;
  postureValue?: string;
  agencyKey?: string;
}

/**
 * Propose a resolution. Validates membership, voting authority, cost and status,
 * then queues it with a 24-turn voting window (ORG_PROPOSAL_VOTING_TURNS).
 */
export function proposeOrgResolution(
  world: WorldState,
  params: ProposeResolutionParams,
): OrgActionSuccess<{ resolution: OrgResolution }> | OrgActionFailure {
  const org = orgOrNull(world, params.orgId);
  if (!org) return { ok: false, error: `Unknown organization ${params.orgId}` };
  if (!isMember(org, params.countryId)) return { ok: false, error: `${params.countryId} is not a member of ${params.orgId}` };
  if (!isVotingMember(world, org, params.countryId)) return { ok: false, error: `${params.countryId} has no vote in ${params.orgId}` };
  if (!canAffordOrgAction(world, params.countryId)) return { ok: false, error: `${params.countryId} has no actions left` };

  const parties = params.parties ?? [];
  if (params.type === "free_trade_agreement") {
    if (parties.length === 0) return { ok: false, error: "A free-trade agreement needs at least one party" };
    if (parties.some((p) => !isMember(org, p))) return { ok: false, error: "An FTA party is not a member of the organization" };
  }
  if (params.type === "sanctions") {
    if (!params.sanctionsTargetCountryId) return { ok: false, error: "A sanctions resolution needs a target country" };
    if (!params.sanctionsCommodity) return { ok: false, error: "A sanctions resolution needs a commodity (or \"all\")" };
  }
  if (params.type === "set_dues" && params.duesRateAnnual === undefined) {
    return { ok: false, error: "A set_dues resolution needs a duesRateAnnual" };
  }

  const resolutions = resolutionsOf(org);
  if (resolutions.some((r) => r.status === "pending" && r.type === params.type && r.proposingCountryId === params.countryId)) {
    return { ok: false, error: `${params.countryId} already has a pending ${params.type} resolution in ${params.orgId}` };
  }

  const turn = world.meta.turn;
  const resolution: OrgResolution = {
    id: nextId("resolution", org.id, turn, resolutions.length),
    type: params.type,
    title: params.title,
    parties,
    status: "pending",
    votes: [],
    proposingCountryId: params.countryId,
    proposedOnTurn: turn,
    closesOnTurn: turn + ORG_PROPOSAL_VOTING_TURNS,
    ...(params.sanctionsTargetCountryId !== undefined ? { sanctionsTargetCountryId: params.sanctionsTargetCountryId } : {}),
    ...(params.sanctionsCommodity !== undefined ? { sanctionsCommodity: params.sanctionsCommodity } : {}),
    ...(params.duesRateAnnual !== undefined ? { duesRateAnnual: params.duesRateAnnual } : {}),
    ...(params.directiveKey !== undefined ? { directiveKey: params.directiveKey } : {}),
    ...(params.jointStatementSubjectCountryId !== undefined ? { jointStatementSubjectCountryId: params.jointStatementSubjectCountryId } : {}),
    ...(params.jointStatementStance !== undefined ? { jointStatementStance: params.jointStatementStance } : {}),
    ...(params.aidRecipientCountryId !== undefined ? { aidRecipientCountryId: params.aidRecipientCountryId } : {}),
    ...(params.aidAmount !== undefined ? { aidAmount: params.aidAmount } : {}),
    ...(params.postureValue !== undefined ? { postureValue: params.postureValue } : {}),
    ...(params.agencyKey !== undefined ? { agencyKey: params.agencyKey } : {}),
  };
  resolutions.push(resolution);
  spendOrgAction(world, params.countryId);
  return { ok: true, resolution };
}

/**
 * File an admission application. The proposer must not already be a member and
 * must have no open application to the same org.
 */
export function proposeOrgMembership(
  world: WorldState,
  params: { orgId: string; countryId: string },
): OrgActionSuccess<{ proposalId: string }> | OrgActionFailure {
  const org = orgOrNull(world, params.orgId);
  if (!org) return { ok: false, error: `Unknown organization ${params.orgId}` };
  if (!world.countries[params.countryId]) return { ok: false, error: `Unknown country ${params.countryId}` };
  if (isMember(org, params.countryId)) return { ok: false, error: `${params.countryId} is already a member of ${params.orgId}` };
  if (!canAffordOrgAction(world, params.countryId)) return { ok: false, error: `${params.countryId} has no actions left` };
  const proposals = proposalsOf(org);
  if (proposals.some((p) => p.status === "pending" && p.proposingCountryId === params.countryId)) {
    return { ok: false, error: `${params.countryId} already has a pending application to ${params.orgId}` };
  }
  const turn = world.meta.turn;
  const proposalId = nextId("proposal", org.id, turn, proposals.length);
  proposals.push({
    id: proposalId,
    proposingCountryId: params.countryId,
    status: "pending",
    votes: [],
    proposedOnTurn: turn,
    closesOnTurn: turn + ORG_PROPOSAL_VOTING_TURNS,
  });
  spendOrgAction(world, params.countryId);
  return { ok: true, proposalId };
}

/**
 * Stand for the org's leadership. The candidate must be a voting member and no
 * election may already be open for the org.
 */
export function standForOrgLeadership(
  world: WorldState,
  params: { orgId: string; countryId: string; candidateName: string },
): OrgActionSuccess<{ electionId: string }> | OrgActionFailure {
  const org = orgOrNull(world, params.orgId);
  if (!org) return { ok: false, error: `Unknown organization ${params.orgId}` };
  if (!isMember(org, params.countryId)) return { ok: false, error: `${params.countryId} is not a member of ${params.orgId}` };
  if (!isVotingMember(world, org, params.countryId)) return { ok: false, error: `${params.countryId} has no vote in ${params.orgId}` };
  if (!canAffordOrgAction(world, params.countryId)) return { ok: false, error: `${params.countryId} has no actions left` };
  const elections = electionsOf(org);
  if (elections.some((e) => e.status === "pending")) {
    return { ok: false, error: `${params.orgId} already has an open leadership election` };
  }
  const turn = world.meta.turn;
  const electionId = nextId("election", org.id, turn, elections.length);
  elections.push({
    id: electionId,
    candidateCountryId: params.countryId,
    candidateName: params.candidateName,
    status: "pending",
    votes: [],
    proposedOnTurn: turn,
    closesOnTurn: turn + ORG_PROPOSAL_VOTING_TURNS,
  });
  spendOrgAction(world, params.countryId);
  return { ok: true, electionId };
}

export type OrgBallotKindRef = "proposal" | "resolution" | "election";

export interface CastOrgVoteParams {
  orgId: string;
  kind: OrgBallotKindRef;
  ballotId: string;
  countryId: string;
  vote: OrgVoteValue;
}

/**
 * Cast (or change) a vote on a pending ballot. Validates the ballot is still
 * pending and the voter is a voting member; upserts the row (one vote per
 * country, latest wins) — the same dedupe the resolver applies.
 */
export function castOrgVote(world: WorldState, params: CastOrgVoteParams): OrgActionOk | OrgActionFailure {
  const org = orgOrNull(world, params.orgId);
  if (!org) return { ok: false, error: `Unknown organization ${params.orgId}` };
  if (!isVotingMember(world, org, params.countryId)) return { ok: false, error: `${params.countryId} has no vote in ${params.orgId}` };

  const ballot =
    params.kind === "proposal"
      ? proposalsOf(org).find((p) => p.id === params.ballotId)
      : params.kind === "resolution"
        ? resolutionsOf(org).find((r) => r.id === params.ballotId)
        : electionsOf(org).find((e) => e.id === params.ballotId);
  if (!ballot) return { ok: false, error: `Unknown ${params.kind} ballot ${params.ballotId}` };
  if (ballot.status !== "pending") return { ok: false, error: `${params.kind} ballot ${params.ballotId} is not pending` };

  const existing = ballot.votes.find((v) => v.countryId === params.countryId);
  if (existing) {
    existing.vote = params.vote;
    existing.castOnTurn = world.meta.turn;
  } else {
    ballot.votes.push({ countryId: params.countryId, vote: params.vote, castOnTurn: world.meta.turn });
  }
  return { ok: true };
}

/** The voting roll for an org — exposed for callers that render the ballot. */
export function orgVotingRoll(world: WorldState, orgId: string): string[] {
  const org = world.internationalOrgs[orgId];
  return org ? votingMembers(world, org) : [];
}
