/**
 * International-organizations turn phase (issue #113).
 *
 * Ports src/lib/turn/internationalOrganizationsPhase.ts
 * (processInternationalOrganizationsTurn) to Native's pure WorldState model. The
 * reference runs three sub-resolvers sequentially against the same DB; here they
 * run sequentially against the same world, so each later step sees the writes the
 * earlier step committed (an admission this turn enlarges the roll a later ballot
 * measures).
 *
 *   1. foundDueOrganizations       — auto-found orgs whose founding year arrived.
 *   2. resolveExpiredMembershipProposals — unanimous current members (player-enabled roll).
 *   3. resolveExpiredOrganizationLegislation — majority (or FTA/join_conflict unanimity);
 *      sanctions enact org-origin embargoes, set_dues clamps + stores the fund rate.
 *   4. resolveExpiredLeadershipElections — majority of the voting roll; shortfall leaves the seat.
 *   5. expireActiveSanctions — lift embargoes + terminate at the expiry turn.
 *   6. expireStatusOnlyResolutions — directive / joint_statement / fund_agency term lapse.
 *   7. chargeAllOrganizationContributions — dues (+ tribute where the org levies it).
 *
 * RNG-FREE: every branch is deterministic over world state (the reference draws
 * no RNG either), so registering this phase consumes no shared RNG draws and
 * shifts no downstream phase's stream.
 *
 * NAMED GAPS (not ported; Native has no input for them — see the issue report):
 *   - autonomous NPP voting (castAutonomousOrgVotes / SP4) — no nppAutonomy subsystem;
 *   - the Mongo write surfaces that CREATE proposals/legislation/elections —
 *     replaced by internationalOrgs/actions.ts (player/country actions);
 *   - directive / joint_statement / fund_agency / aid_package / set_posture
 *     downstream metric effects — no metric driver reads them here (status-only
 *     term lapse is ported so they cannot linger active);
 *   - join_conflict war entry — no per-unit combat or domestic-bill path (B15);
 *   - free_trade_agreement tariff override — no trade-tariff consumer;
 *   - sanctions embargoes are enacted/lifted but not read by a trade layer.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { InternationalOrgState, OrgResolution } from "./types.js";
import {
  AGENCY_FUNDING_DURATION_TURNS,
  DIRECTIVE_DURATION_TURNS,
  GDP_MILLIONS_TO_USD,
  JOINT_STATEMENT_DURATION_TURNS,
  ORG_DEFS,
  SANCTIONS_DURATION_TURNS,
  UN_PERMANENT_MEMBERS,
  orgDef,
  orgTributeRateAnnual,
  presetForEra,
} from "./constants.js";
import { ballotPasses, dedupeOrganizationVotes, resolutionPasses } from "./resolutionRules.js";
import { modelledMembers, tributeMembers, votingMembers } from "./members.js";
import { chargeOrganizationDues, chargeOrganizationTribute, clampDuesRate } from "./fund.js";
import { buildOrganizationSanctionEmbargoes, liftOrganizationSanctions } from "./sanctions.js";
import {
  embargoesOf,
  electionsOf,
  ensureAllOrgState,
  ensureOrgState,
  fundOf,
  leadershipOf,
  proposalsOf,
  resolutionsOf,
} from "./state.js";

export interface InternationalOrgsTurnReport {
  organizationsFounded: number;
  proposalsResolved: number;
  legislationResolved: number;
  electionsResolved: number;
  sanctionsExpired: number;
  directivesExpired: number;
  jointStatementsExpired: number;
  agencyFundingExpired: number;
  duesCharged: number;
  tributeCharged: number;
}

function countryName(world: WorldState, id: string): string {
  return world.countries[id]?.name ?? id;
}

function pushNews(world: WorldState, headline: string): void {
  world.news.push({ turn: world.meta.turn, date: world.meta.date, headline });
}

function startYearForEra(era: string): number {
  const n = Number.parseInt(era, 10);
  return Number.isFinite(n) ? n : 1953;
}

function yearForDate(date: string): number | null {
  const n = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(n) ? n : null;
}

function leadershipTermTurns(orgId: string): number {
  return orgDef(orgId)?.leadership.termTurns ?? 96;
}

// ── 1. Founding ─────────────────────────────────────────────────────────────

/**
 * Auto-found built-in orgs whose foundedYear has been reached in a game that
 * started BEFORE that year. Orgs found EMPTY — membership is never automatic.
 * Ports foundDueOrganizations (Native's seed is the sole membership authority,
 * so founding only adds the org record; there is no roster to seed).
 */
export function foundDueOrganizations(world: WorldState): number {
  const liveYear = yearForDate(world.meta.date);
  if (liveYear === null) return 0;
  const startingYear = startYearForEra(world.meta.era);
  let founded = 0;
  for (const def of ORG_DEFS) {
    if (def.foundedYear <= startingYear) continue; // seeded at reset (or deliberately absent)
    if (def.dissolvedYear !== undefined && liveYear >= def.dissolvedYear) continue; // window closed
    if (liveYear < def.foundedYear) continue; // not yet due
    if (world.internationalOrgs[def.id]) continue; // already founded
    world.internationalOrgs[def.id] = ensureOrgState({
      id: def.id,
      name: def.name,
      foundedYear: def.foundedYear,
      members: [],
    });
    pushNews(world, `${def.name} has been founded. Countries may now apply for membership.`);
    founded++;
  }
  return founded;
}

// ── 2. Membership proposals ────────────────────────────────────────────────

/**
 * Resolve expired membership proposals. Unanimous "yes" from every current
 * voting member except the proposer; an empty voting roll cannot succeed unless
 * the proposer is already a member (the empty-org accession waiver reads through
 * the `members.includes` branch, matching ballotPasses' zero-size guard).
 */
export function resolveExpiredMembershipProposals(world: WorldState): number {
  const turn = world.meta.turn;
  let resolved = 0;
  for (const org of Object.values(world.internationalOrgs)) {
    for (const proposal of proposalsOf(org)) {
      if (proposal.status !== "pending" || proposal.closesOnTurn > turn) continue;
      const proposingCountryId = proposal.proposingCountryId;
      const voters = votingMembers(world, org).filter((m) => m !== proposingCountryId);
      let approved: boolean;
      if (voters.length === 0) {
        approved = org.members.includes(proposingCountryId);
      } else {
        const yesVoters = new Set(
          dedupeOrganizationVotes(proposal.votes)
            .filter((v) => v.vote === "yes")
            .map((v) => v.countryId),
        );
        const yes = voters.filter((c) => yesVoters.has(c)).length;
        approved = ballotPasses("membership_proposal", voters.length, yes);
      }

      if (approved) {
        if (!org.members.includes(proposingCountryId)) org.members.push(proposingCountryId);
        proposal.status = "approved";
        pushNews(world, `${countryName(world, proposingCountryId)} admitted to ${org.id}.`);
      } else {
        proposal.status = voters.length === 0 ? "expired" : "rejected";
        pushNews(world, `${countryName(world, proposingCountryId)}'s application to ${org.id} was rejected.`);
      }
      proposal.resolvedOnTurn = turn;
      resolved++;
    }
  }
  return resolved;
}

// ── 3. Organization legislation ────────────────────────────────────────────

function applyResolutionEffect(
  world: WorldState,
  org: InternationalOrgState,
  item: OrgResolution,
  turn: number,
  expiresTurn: number | undefined,
): void {
  switch (item.type) {
    case "sanctions": {
      const target = item.sanctionsTargetCountryId;
      const commodity = item.sanctionsCommodity;
      if (!target || !commodity) return;
      const embargoes = buildOrganizationSanctionEmbargoes({
        resolutionId: item.id,
        targetCountryId: target,
        commodity,
        members: modelledMembers(world, org),
        currentTurn: turn,
        expiresTurn,
      });
      embargoesOf(org).push(...embargoes);
      pushNews(world, `${org.id} sanctions ${countryName(world, target)} (${embargoes.length} embargoes).`);
      return;
    }
    case "set_dues": {
      if (item.duesRateAnnual !== undefined) {
        fundOf(org).duesRateAnnual = clampDuesRate(item.duesRateAnnual);
        pushNews(world, `${org.id} set its annual dues rate to ${fundOf(org).duesRateAnnual}.`);
      }
      return;
    }
    case "free_trade_agreement": {
      pushNews(world, `${org.id} ratified a free-trade agreement: ${item.parties.join(", ")}.`);
      return; // tariff override layer unported — named gap
    }
    default:
      return; // directive / joint_statement / fund_agency / aid_package / set_posture / join_conflict effects unported
  }
}

/**
 * Resolve expired org legislation (resolutions). Majority of the voting roll,
 * except FTA (unanimous named parties) and join_conflict (unanimous roll); the
 * UN's permanent members hold a veto. Ports resolveExpiredOrganizationLegislation.
 */
export function resolveExpiredOrganizationLegislation(world: WorldState): number {
  const turn = world.meta.turn;
  let resolved = 0;
  for (const org of Object.values(world.internationalOrgs)) {
    for (const item of resolutionsOf(org)) {
      if (item.status !== "pending" || item.closesOnTurn > turn) continue;
      const members = votingMembers(world, org);
      const memberSet = new Set(members);
      const votingParties = item.parties.filter((p) => memberSet.has(p));
      const votes = dedupeOrganizationVotes(item.votes);
      const permanentMembers = org.id === "UN" ? [...UN_PERMANENT_MEMBERS] : [];
      const approved = resolutionPasses({
        type: item.type,
        members,
        parties: votingParties,
        votes,
        permanentMembers,
      });

      if (approved) {
        const duration =
          item.type === "sanctions" ? SANCTIONS_DURATION_TURNS
          : item.type === "directive" ? DIRECTIVE_DURATION_TURNS
          : item.type === "joint_statement" ? JOINT_STATEMENT_DURATION_TURNS
          : item.type === "fund_agency" ? AGENCY_FUNDING_DURATION_TURNS
          : undefined;
        const expiresTurn = duration !== undefined ? turn + duration : undefined;
        item.status = "active";
        item.enactedOnTurn = turn;
        if (expiresTurn !== undefined) {
          if (item.type === "sanctions") item.sanctionsExpiresOnTurn = expiresTurn;
          if (item.type === "directive") item.directiveExpiresOnTurn = expiresTurn;
          if (item.type === "joint_statement") item.jointStatementExpiresOnTurn = expiresTurn;
          if (item.type === "fund_agency") item.agencyExpiresOnTurn = expiresTurn;
        }
        applyResolutionEffect(world, org, item, turn, expiresTurn);
      } else {
        item.status = "rejected";
        pushNews(world, `${org.id} rejected ${item.title}.`);
      }
      resolved++;
    }
  }
  return resolved;
}

// ── 4. Leadership elections ────────────────────────────────────────────────

/**
 * Resolve expired leadership elections: a majority of the voting roll seats the
 * chair; falling short (or a tie) leaves the seat unchanged. Ports
 * resolveExpiredLeadershipElections.
 */
export function resolveExpiredLeadershipElections(world: WorldState): number {
  const turn = world.meta.turn;
  let resolved = 0;
  for (const org of Object.values(world.internationalOrgs)) {
    for (const election of electionsOf(org)) {
      if (election.status !== "pending" || election.closesOnTurn > turn) continue;
      const members = votingMembers(world, org);
      const votes = dedupeOrganizationVotes(election.votes);
      let yes = 0;
      for (const v of votes) {
        if (!members.includes(v.countryId)) continue;
        if (v.vote === "yes") yes++;
      }
      const elected = ballotPasses("leadership_election", members.length, yes);
      if (elected) {
        const lead = leadershipOf(org);
        lead.holderCountryId = election.candidateCountryId;
        lead.holderName = election.candidateName;
        lead.electedOnTurn = turn;
        lead.termEndsOnTurn = turn + leadershipTermTurns(org.id);
        election.status = "elected";
        pushNews(world, `${election.candidateName} elected leader of ${org.id}.`);
      } else {
        election.status = "rejected";
        pushNews(world, `${election.candidateName} was not elected leader of ${org.id}.`);
      }
      election.resolvedOnTurn = turn;
      resolved++;
    }
  }
  return resolved;
}

// ── 5. Expiry sweeps ───────────────────────────────────────────────────────

/** Auto-lift sanctions resolutions whose term has elapsed. Ports expireActiveSanctions. */
export function expireActiveSanctions(world: WorldState): number {
  const turn = world.meta.turn;
  let expired = 0;
  for (const org of Object.values(world.internationalOrgs)) {
    for (const item of resolutionsOf(org)) {
      if (item.type !== "sanctions" || item.status !== "active") continue;
      if (item.sanctionsExpiresOnTurn === undefined || item.sanctionsExpiresOnTurn > turn) continue;
      liftOrganizationSanctions(embargoesOf(org), item.id);
      item.status = "terminated";
      item.terminatedOnTurn = turn;
      expired++;
    }
  }
  return expired;
}

/**
 * Status-only term lapse for directive / joint_statement / fund_agency. Ports
 * expireActiveDirectives + expireActiveJointStatements + expireActiveAgencyFunding —
 * no effect cleanup is needed because no Native driver reads those effects.
 */
export function expireStatusOnlyResolutions(world: WorldState): {
  directivesExpired: number;
  jointStatementsExpired: number;
  agencyFundingExpired: number;
} {
  const turn = world.meta.turn;
  let directivesExpired = 0;
  let jointStatementsExpired = 0;
  let agencyFundingExpired = 0;
  for (const org of Object.values(world.internationalOrgs)) {
    for (const item of resolutionsOf(org)) {
      if (item.status !== "active") continue;
      if (item.type === "directive" && item.directiveExpiresOnTurn !== undefined && item.directiveExpiresOnTurn <= turn) {
        item.status = "terminated";
        item.terminatedOnTurn = turn;
        directivesExpired++;
      } else if (item.type === "joint_statement" && item.jointStatementExpiresOnTurn !== undefined && item.jointStatementExpiresOnTurn <= turn) {
        item.status = "terminated";
        item.terminatedOnTurn = turn;
        jointStatementsExpired++;
      } else if (item.type === "fund_agency" && item.agencyExpiresOnTurn !== undefined && item.agencyExpiresOnTurn <= turn) {
        item.status = "terminated";
        item.terminatedOnTurn = turn;
        agencyFundingExpired++;
      }
    }
  }
  return { directivesExpired, jointStatementsExpired, agencyFundingExpired };
}

// ── 6. Contributions ───────────────────────────────────────────────────────

/**
 * Charge every org's per-turn contributions. Where the org levies tribute,
 * voting members pay dues and everyone else pays tribute (exact partition).
 * Where it does not, every member pays ordinary dues (#1156). Ports
 * chargeAllOrganizationContributions.
 */
export function chargeAllOrganizationContributions(world: WorldState): { duesCharged: number; tributeCharged: number } {
  const preset = presetForEra(world.meta.era);
  let duesCharged = 0;
  let tributeCharged = 0;
  for (const org of Object.values(world.internationalOrgs)) {
    if (org.members.length === 0) continue;
    const voters = votingMembers(world, org);
    const nonVoters = tributeMembers(world, org);
    const leviesTribute = orgTributeRateAnnual(org.id, preset) > 0;
    const duesPayers = leviesTribute ? voters : [...voters, ...nonVoters];
    const memberGdpUsd = duesPayers.map((c) => ({
      countryId: c,
      gdpUsd: (world.countries[c]?.economy.gdp ?? 0) * GDP_MILLIONS_TO_USD,
    }));
    const dues = memberGdpUsd.length > 0 ? chargeOrganizationDues(world, org, memberGdpUsd) : 0;
    if (dues > 0) duesCharged++;
    const tribute = chargeOrganizationTribute(world, org, nonVoters, preset);
    if (tribute.collectedLocal > 0) tributeCharged++;
  }
  return { duesCharged, tributeCharged };
}

// ── Phase entry point ──────────────────────────────────────────────────────

/** Ports processInternationalOrganizationsTurn. Returns the reference's report shape. */
export function runInternationalOrganizationsTurn(world: WorldState): InternationalOrgsTurnReport {
  ensureAllOrgState(world);
  const organizationsFounded = foundDueOrganizations(world);
  const proposalsResolved = resolveExpiredMembershipProposals(world);
  const legislationResolved = resolveExpiredOrganizationLegislation(world);
  const electionsResolved = resolveExpiredLeadershipElections(world);
  const sanctionsExpired = expireActiveSanctions(world);
  const { directivesExpired, jointStatementsExpired, agencyFundingExpired } = expireStatusOnlyResolutions(world);
  const { duesCharged, tributeCharged } = chargeAllOrganizationContributions(world);
  return {
    organizationsFounded,
    proposalsResolved,
    legislationResolved,
    electionsResolved,
    sanctionsExpired,
    directivesExpired,
    jointStatementsExpired,
    agencyFundingExpired,
    duesCharged,
    tributeCharged,
  };
}

export const internationalOrganizationsPhase: TurnPhase = {
  name: "internationalOrganizations",
  run(world) {
    runInternationalOrganizationsTurn(world);
  },
};
