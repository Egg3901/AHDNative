/**
 * Org ballot passage rules — verbatim port of
 * src/lib/internationalOrganizations/resolutionRules.ts (issue #113).
 *
 * Pure functions over plain records, no Mongo: the reference module was already
 * DB-free, so this is a straight copy with the vote-record type swapped for the
 * Native OrgVoteRecord shape.
 */
import type { OrgMemberId, OrgResolutionType, OrgVoteRecord, OrgBallotKind } from "./types.js";

export type { OrgBallotKind };

/**
 * Ballots that need every eligible voter to vote "yes".
 *
 * A trade agreement and an admission bind a member to an obligation it cannot
 * shed cheaply, and entering a war spends its soldiers. None of those should be
 * imposed on a member by the rest of the bloc, so each carries a member-by-member
 * veto. Everything else is ordinary bloc business and carries on a majority.
 */
const UNANIMOUS_KINDS: ReadonlySet<OrgBallotKind> = new Set<OrgBallotKind>([
  "free_trade_agreement",
  "join_conflict",
  "membership_proposal",
]);

/** Whether `kind` needs the whole roll rather than a majority of it. */
export function requiresUnanimity(kind: OrgBallotKind): boolean {
  return UNANIMOUS_KINDS.has(kind);
}

/**
 * Ballots that ask a member to consent to business it is NOT itself a party to,
 * and where withholding consent blocks the whole thing. Decided by the
 * player-enabled roll alone (in Native: the playable-country roll).
 *
 * NOT the same question as `requiresUnanimity`: an FTA is unanimous too, but it
 * is voted ONLY by its named parties, so it stays on the wider roll.
 */
export function ballotIsPlayerOnly(kind: OrgBallotKind): boolean {
  return kind === "membership_proposal" || kind === "join_conflict";
}

/**
 * Yes votes needed to carry `kind` across a ballot of `ballotSize` eligible
 * voters. The denominator is the eligible roll, never the votes actually cast.
 */
export function votesNeeded(kind: OrgBallotKind, ballotSize: number): number {
  if (ballotSize <= 0) return 0;
  return requiresUnanimity(kind) ? ballotSize : Math.floor(ballotSize / 2) + 1;
}

/**
 * Whether `yes` votes carry `kind`. A ballot with nobody eligible to vote can
 * never carry: an org with no voting members does not pass things by default.
 */
export function ballotPasses(kind: OrgBallotKind, ballotSize: number, yes: number): boolean {
  if (ballotSize <= 0) return false;
  return yes >= votesNeeded(kind, ballotSize);
}

/**
 * Fold historical duplicate rows down to the latest vote per country.
 */
export function dedupeOrganizationVotes<T extends { countryId: string }>(votes: T[]): T[] {
  const latestByCountry = new Map<string, T>();
  for (const vote of votes) {
    latestByCountry.set(vote.countryId, vote);
  }
  return [...latestByCountry.values()];
}

export interface ResolutionPassageInput {
  type: OrgResolutionType;
  /** Entity ids of the members whose votes count. */
  members: OrgMemberId[];
  /** For `free_trade_agreement`: the named parties the FTA binds. */
  parties: OrgMemberId[];
  /** Deduped votes (use `dedupeOrganizationVotes` before calling). */
  votes: OrgVoteRecord[];
  /**
   * Members with a veto (UN's permanent five in this game). A permanent member
   * voting "no" blocks a majority resolution outright. Does not apply to FTAs.
   */
  permanentMembers?: OrgMemberId[];
}

/**
 * Decide whether a resolution passes at its close turn.
 *
 * - `free_trade_agreement`: unanimous "yes" from every named party.
 * - `join_conflict`: unanimous "yes" from the whole voting roll.
 * - all other types: more than half the voting roll voting "yes".
 *
 * Abstaining and never voting are non-approval in every case; only an active
 * "yes" counts. Votes from non-members are ignored.
 */
export function resolutionPasses(input: ResolutionPassageInput): boolean {
  if (input.type === "free_trade_agreement") {
    const yesParties = new Set<string>(
      input.votes.filter((v) => v.vote === "yes").map((v) => v.countryId),
    );
    const parties = new Set<string>(input.parties);
    const yes = [...parties].filter((p) => yesParties.has(p)).length;
    return ballotPasses("free_trade_agreement", parties.size, yes);
  }

  const memberSet = new Set<string>(input.members);
  const vetoSet = new Set<string>(input.permanentMembers ?? []);
  let yes = 0;
  for (const v of input.votes) {
    if (!memberSet.has(v.countryId)) continue;
    // A permanent member's "no" is a veto — blocks regardless of the tally.
    if (v.vote === "no" && vetoSet.has(v.countryId)) return false;
    if (v.vote === "yes") yes++;
  }
  return ballotPasses(input.type, memberSet.size, yes);
}
