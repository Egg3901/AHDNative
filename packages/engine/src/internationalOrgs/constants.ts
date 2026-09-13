/**
 * International-organizations constants — verbatim port of the subset of
 * src/lib/constants/internationalOrganizations.ts that the turn phase reads.
 *
 * Values are copied exactly (same names, same numbers) so the resolver math
 * matches the reference to the digit.
 */
import type { OrgResolutionType } from "./types.js";

/** Voting window length for any org-level proposal (membership, legislation, election). 24 turns ≈ one game day. */
export const ORG_PROPOSAL_VOTING_TURNS = 24;

/**
 * How long a passed sanctions resolution stays in force (turns) before the turn
 * phase auto-lifts its embargoes and marks the resolution terminated. 48 turns ≈ one game year.
 */
export const SANCTIONS_DURATION_TURNS = 48;

/** How long a passed directive's metric nudge runs (turns). Source: DIRECTIVE_DURATION_TURNS. */
export const DIRECTIVE_DURATION_TURNS = 48;

/** How long a funded agency programme runs (turns). Source: AGENCY_FUNDING_DURATION_TURNS. */
export const AGENCY_FUNDING_DURATION_TURNS = 48;

/** How long a joint statement's approval effect runs (turns). Source: JOINT_STATEMENT_DURATION_TURNS. */
export const JOINT_STATEMENT_DURATION_TURNS = 48;

/** Turns per game year (48 turns ≈ 1 year), for prorating annual org dues. */
export const ORG_DUES_TURNS_PER_YEAR = 48;

/**
 * `states.gdp` is stored in local-currency *millions*; treasuries and the org
 * fund hold *absolute* currency units. Multiply GDP by this when assessing
 * money (dues) against those balances so the scales line up.
 */
export const GDP_MILLIONS_TO_USD = 1_000_000;

/**
 * Default annual org-fund dues rate: a member is assessed this fraction of its
 * (USD-normalized) GDP per game year, prorated per turn into the org fund.
 * Conservative (~0.006%/yr ≈ a realistic UN-scale budget); each org's rate is
 * member-voted via a `set_dues` resolution and stored on its fund.
 */
export const DEFAULT_ORG_DUES_RATE_ANNUAL = 0.00006;

export const MIN_ORG_DUES_RATE_ANNUAL = 0;
/** Ceiling so a runaway vote can't assess more than 1%/yr of GDP. */
export const MAX_ORG_DUES_RATE_ANNUAL = 0.01;

/**
 * Annual tribute, as a share of GDP, owed by members who cannot vote — per
 * organisation, because the two blocs do not levy the same rate. Only NATO and
 * the Warsaw Pact levy it, and only in a world that began at the 1953 preset
 * (see orgTributeRateAnnual). Copied verbatim from ORG_TRIBUTE_RATES_ANNUAL.
 */
export const ORG_TRIBUTE_RATES_ANNUAL: Readonly<Record<string, number>> = {
  NATO: 0.005,
  WARSAW_PACT: 0.0075,
};

/**
 * The only world tribute exists in. Scoped by PRESET rather than by live year.
 * Native stores era ids ("1953") where mainline stores preset ids
 * ("1953-default"); presetForEra maps between them.
 */
export const ORG_TRIBUTE_PRESET = "1953-default";

/** Notional assessed-budget rate applied to total member GDP (illustrative). Source: orgDerivedMetrics.ts. */
export const ORG_ASSESSED_RATE = 0.005;

/**
 * Per-country diplomatic-action budget for the International Organizations
 * page. Proposing/initiating an action costs 1; voting is free. Resets each turn.
 * Source: DIPLOMATIC_ACTIONS_PER_TURN (src/lib/constants/internationalOrganizations.ts).
 *
 * NOTE: Native has no per-country diplomatic-action pool (diplomaticActions.ts);
 * internationalOrgs/actions.ts charges the acting country's native action pool
 * instead — see that file's doc.
 */
export const DIPLOMATIC_ACTIONS_PER_TURN = 4;

/**
 * The single authority on whether an organisation levies tribute in this world,
 * and at what rate. Returns 0 when it does not. Ports orgTributeRateAnnual.
 */
export function orgTributeRateAnnual(organizationId: string, preset: string): number {
  if (preset !== ORG_TRIBUTE_PRESET) return 0;
  return ORG_TRIBUTE_RATES_ANNUAL[organizationId] ?? 0;
}

/** Native era id ("1953", "1979", …) → mainline preset id ("1953-default", …). */
export function presetForEra(era: string): string {
  return `${era}-default`;
}

/**
 * The UN's founding members hold a permanent-member veto; no other org does.
 * Ports `INTERNATIONAL_ORGANIZATIONS.UN.foundingMembers` (the base def, read
 * unconditionally by the reference resolver regardless of era).
 */
export const UN_PERMANENT_MEMBERS: readonly string[] = ["US", "UK", "DE", "JP"];

export interface OrgDef {
  id: string;
  name: string;
  foundedYear: number;
  dissolvedYear?: number;
  /** Leadership office offered by this organization. */
  leadership: { title: string; termTurns: number };
}

/**
 * Built-in organization defs the founding step reads. Ports the
 * INTERNATIONAL_ORGANIZATIONS metadata (foundedYear/dissolvedYear/leadership)
 * for the orgs Native knows about. Member rosters are NOT ported: Native's seed
 * (internationalOrgs/seed.ts) is the sole authority on who belongs, and the
 * reference founds auto-founded orgs EMPTY (membership is never automatic).
 */
export const ORG_DEFS: readonly OrgDef[] = [
  { id: "EU", name: "European Union", foundedYear: 1993, leadership: { title: "President of the European Council", termTurns: 96 } },
  { id: "NATO", name: "North Atlantic Treaty Organization", foundedYear: 1949, leadership: { title: "Secretary-General", termTurns: 96 } },
  { id: "UN", name: "United Nations", foundedYear: 1945, leadership: { title: "Secretary-General", termTurns: 96 } },
  { id: "COMMONWEALTH", name: "Commonwealth of Nations", foundedYear: 1949, leadership: { title: "Head of the Commonwealth", termTurns: 96 } },
  { id: "WARSAW_PACT", name: "Warsaw Pact", foundedYear: 1952, dissolvedYear: 1991, leadership: { title: "Supreme Commander of the Unified Command", termTurns: 96 } },
  { id: "NON_ALIGNED", name: "Non-Aligned Movement", foundedYear: 1961, leadership: { title: "Chair of the Non-Aligned Movement", termTurns: 144 } },
  { id: "COMECON", name: "Council for Mutual Economic Assistance", foundedYear: 1949, dissolvedYear: 1991, leadership: { title: "Secretary of the Council", termTurns: 96 } },
];

export function orgDef(id: string): OrgDef | null {
  return ORG_DEFS.find((d) => d.id === id) ?? null;
}

/** Resolution types whose passage sets a per-type expiry turn. Ports the expiry switch in applyResolutionEffect. */
export const RESOLUTION_EXPIRY_TURNS: Partial<Record<OrgResolutionType, number>> = {
  sanctions: SANCTIONS_DURATION_TURNS,
  directive: DIRECTIVE_DURATION_TURNS,
  joint_statement: JOINT_STATEMENT_DURATION_TURNS,
  fund_agency: AGENCY_FUNDING_DURATION_TURNS,
};
