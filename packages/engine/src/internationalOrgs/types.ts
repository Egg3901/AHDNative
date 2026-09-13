/**
 * International organizations — membership tracker plus the per-turn
 * resolutions, dues, tribute, leadership and sanctions state the reference
 * turn phase drives.
 *
 * Ports the def/seed SHAPE of src/lib/constants/internationalOrganizations.ts
 * InternationalOrganizationDef + src/lib/admin/seed/seedInternationalOrganizations.ts,
 * and (issue #113) the runtime state of the Mongo collections mainline's
 * src/lib/turn/internationalOrganizationsPhase.ts reads and writes:
 *   organizationMemberships        -> InternationalOrgState.members
 *   organizationLeadership         -> InternationalOrgState.leadership
 *   organizationFunds              -> InternationalOrgState.fund
 *   organizationLegislation        -> InternationalOrgState.resolutions
 *   organizationProposals          -> InternationalOrgState.membershipProposals
 *   organizationLeadershipElections-> InternationalOrgState.leadershipElections
 *   tradeEmbargoes (org origin)    -> InternationalOrgState.embargoes
 *
 * The runtime sub-fields are OPTIONAL and lazily created by ensureOrgState
 * (internationalOrgs/phases.ts) the first time the phase runs. This mirrors
 * this repo's own lazy-state convention for government/phases.ts
 * governmentFormationPhase and election spawning (see world.ts file doc on
 * `governments`): a freshly created world therefore seeds only the four base
 * membership fields, exactly as before issue #113, so every pinned save shape
 * (e.g. save.v42Projection.test.ts) and every existing golden is unchanged.
 * deserializeSave backfills nothing because an absent sub-field is a valid,
 * defaulted state (same "absent means default" contract as Campaign.spendStock
 * and Campaign.campaignStrength).
 *
 * What is deliberately NOT ported (named gaps, see phases.ts file doc):
 *   - the Mongo-backed proposal/legislation WRITE surfaces (routes/commands) —
 *     player actions go through internationalOrgs/actions.ts instead;
 *   - grantAid / set_posture / directives / fund_agency / joint_statement
 *     downstream metric effects (no metric driver reads them here);
 *   - join_conflict war entry (no per-unit combat / domestic bill path — B15);
 *   - autonomous NPP voting (no nppAutonomy subsystem in Native).
 */
/**
 * An organisation member id. Mainline widens this to WorldEntityId; Native
 * country ids are the only members it models, so this is a plain string.
 */
export type OrgMemberId = string;

/**
 * Resolution types an international organization can pass. Ports
 * OrganizationResolutionType (src/lib/db/types/internationalOrganization.ts).
 */
export type OrgResolutionType =
  | "free_trade_agreement"
  | "sanctions"
  | "directive"
  | "joint_statement"
  | "aid_package"
  | "set_dues"
  | "set_posture"
  | "fund_agency"
  | "join_conflict";

/**
 * Every ballot an organisation runs: the resolution types plus the two
 * instruments that are not resolutions but are decided the same way —
 * admitting a member and electing the chair. Ports OrgBallotKind
 * (src/lib/internationalOrganizations/resolutionRules.ts).
 */
export type OrgBallotKind = OrgResolutionType | "membership_proposal" | "leadership_election";

export type OrgVoteValue = "yes" | "no" | "abstain";

/** One cast ballot row. Ports ProposalVoteRecord, dropped to the fields the resolver reads. */
export interface OrgVoteRecord {
  countryId: string;
  vote: OrgVoteValue;
  castOnTurn: number;
}

/** Currently held leadership. Ports OrganizationLeadership (holderCountryId subset). */
export interface OrgLeadership {
  holderCountryId: string | null;
  holderName: string | null;
  electedOnTurn: number | null;
  termEndsOnTurn: number | null;
}

/**
 * An org's pooled fund. Ports OrganizationFunds (balanceLocal/duesRateAnnual/
 * currencyCountryId). Balances are in the fund currency (see phases.ts file doc
 * on the 1953 par assumption).
 */
export interface OrgFund {
  balance: number;
  duesRateAnnual: number;
  currencyCountryId: string;
}

export type OrgResolutionStatus = "pending" | "active" | "rejected" | "expired" | "terminated";

/**
 * A resolution. Ports OrganizationLegislation, keeping the effect fields the
 * turn resolver branches on.
 */
export interface OrgResolution {
  id: string;
  type: OrgResolutionType;
  title: string;
  /** Subset of members the resolution binds (FTA parties). */
  parties: string[];
  status: OrgResolutionStatus;
  votes: OrgVoteRecord[];
  proposingCountryId: string;
  proposedOnTurn: number;
  closesOnTurn: number;
  enactedOnTurn?: number;
  terminatedOnTurn?: number;
  // sanctions
  sanctionsTargetCountryId?: string;
  sanctionsCommodity?: string;
  sanctionsExpiresOnTurn?: number;
  // set_dues
  duesRateAnnual?: number;
  // set_posture (effect unported — see phases.ts file doc)
  postureValue?: string;
  // directive / joint_statement / fund_agency (effects unported)
  directiveKey?: string;
  directiveExpiresOnTurn?: number;
  jointStatementSubjectCountryId?: string;
  jointStatementStance?: "endorse" | "condemn";
  jointStatementExpiresOnTurn?: number;
  agencyKey?: string;
  agencyExpiresOnTurn?: number;
  // join_conflict (unported — B15)
  joinConflictTheaterId?: string;
  joinConflictSide?: "A" | "B";
  // aid_package (effect unported)
  aidRecipientCountryId?: string;
  aidAmount?: number;
}

/** A pending admission. Ports OrganizationMembershipProposal. */
export interface OrgMembershipProposal {
  id: string;
  proposingCountryId: string;
  status: "pending" | "approved" | "rejected" | "expired";
  votes: OrgVoteRecord[];
  proposedOnTurn: number;
  closesOnTurn: number;
  resolvedOnTurn?: number;
}

/** A pending leadership election. Ports OrganizationLeadershipElection. */
export interface OrgLeadershipElection {
  id: string;
  candidateCountryId: string;
  candidateName: string;
  status: "pending" | "elected" | "rejected";
  votes: OrgVoteRecord[];
  proposedOnTurn: number;
  closesOnTurn: number;
  resolvedOnTurn?: number;
}

/**
 * An org-origin trade embargo. Ports the reference TradeEmbargo fields
 * buildOrganizationSanctionEmbargoes writes (origin "organization", block/both).
 */
export interface TradeEmbargo {
  sourceCountry: string;
  targetCountry: string;
  commodity: string | "all";
  direction: "both";
  mode: "block";
  origin: "organization";
  expiresTurn?: number;
  createdTurn: number;
  sourceResolutionId: string;
}

export interface InternationalOrgState {
  id: string;
  name: string;
  foundedYear: number;
  members: string[];
  /** Lazily created by ensureOrgState; absent on a freshly seeded world. */
  leadership?: OrgLeadership;
  /** Lazily created by ensureOrgState. */
  fund?: OrgFund;
  /** Lazily created by ensureOrgState. */
  resolutions?: OrgResolution[];
  /** Lazily created by ensureOrgState. */
  membershipProposals?: OrgMembershipProposal[];
  /** Lazily created by ensureOrgState. */
  leadershipElections?: OrgLeadershipElection[];
  /** Lazily created by ensureOrgState; org-origin embargoes enacted by passed sanctions. */
  embargoes?: TradeEmbargo[];
}
