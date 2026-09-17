/**
 * Bargaining campaign + collective agreement state — #322.
 *
 * Ports AHDGame's BargainingCampaign / CollectiveAgreement collections
 * (src/lib/db/types bargaining types) at pinned
 * e364c04954ed628beef73a993a8e9e156650a31e, collapsed to Native's
 * deterministic string ids and turn numbers (no ObjectId/Date — same JSON
 * adaptation as UnionOrganizer in organizers.ts).
 *
 * One campaign binds one union to one employer corporation over the
 * employer's locals in the union's country + industry. A settled campaign
 * writes one collective agreement: the enforceable wage floor plus the
 * no-strike window the corporation turn reads. Statuses, clocks, and the
 * escalation ladder live in bargaining.ts; this module owns identity,
 * validation, and lazy access.
 *
 * Save shape stays additive with no version renumber:
 * `bargainingCampaigns` / `collectiveAgreements` are optional with
 * absent-means-empty (pre-#322 saves carry no rows), validated on load when
 * present. Same additive pattern as the #320 organizer / #321 ledger
 * backfills.
 *
 * Out of scope: government mediation intervention (#127 crisis path) and
 * organic grievance strikes from the corporation turn — both documented
 * residuals, not silent coverage.
 */

import type { WorldState } from "../types.js";

/** Campaign lifecycle. Source: BargainingCampaign.status. */
export type BargainingCampaignStatus =
  | "negotiating"
  | "dispute"
  | "settled"
  | "withdrawn"
  | "lapsed";

/** Industrial-action rung. Source: BargainingCampaign.escalationLevel. */
export type BargainingEscalationLevel =
  | "none"
  | "overtime_ban"
  | "selective_strike"
  | "industry_strike";

/** Which side tabled the current package. Source: BargainingParty. */
export type BargainingParty = "union" | "employer";

/** One wage package revision. Source: BargainingOffer (terms subset + proposedAtTurn urgency stamp). */
export interface BargainingOffer {
  revision: number;
  proposedBy: BargainingParty;
  wageLevel: number;
  agreementDurationTurns: number;
  noStrikeTurns: number;
  proposedAtTurn: number;
}

/** Frozen opening power snapshot. Source: BargainingMandate. */
export interface BargainingMandate {
  coverage: number;
  grievance: number;
  laborTightness: number;
  lawSupport: number;
  strikeFundRunway: number;
  support: number;
  leverage: number;
  organizedLocalCount: number;
  totalLocalCount: number;
}

/** Shop-floor expectation recorded before a strike call, restored on exit. */
export interface EscalationExpectationRecord {
  sectorId: string;
  previousExpectationIndex: number | null;
}

/** One member ballot. Ballots live on the campaign (no separate collection). */
export interface RatificationBallot {
  voterCharacterId: string;
  vote: "ratify" | "reject";
  offerRevision: number;
}

export interface BargainingRatification {
  offerRevision: number;
  status: "open" | "ratified" | "rejected" | "void";
  openedAtTurn: number;
  closesAtTurn: number;
  closedAtTurn: number | null;
  weights: Array<{ characterId: string; strength: number }>;
  totalStrength: number;
}

/**
 * One employer-scoped bargaining campaign. JSON-safe. Deterministic id
 * `${unionId}::${employerCorporationId}::${startedAtTurn}` — unique because
 * the world only ever holds one live campaign per pair and the
 * BARGAINING_REOPEN_COOLDOWN_TURNS cooldown blocks a same-turn reopen after
 * a withdraw/lapse.
 */
export interface BargainingCampaign {
  /** `${unionId}::${employerCorporationId}::${startedAtTurn}`. */
  id: string;
  unionId: string;
  countryId: string;
  employerCorporationId: string;
  /** Corporate-sector asset ids scoped to this campaign. */
  sectorIds: string[];
  status: BargainingCampaignStatus;
  escalationLevel: BargainingEscalationLevel;
  mandate: BargainingMandate;
  mandateUpdatedAtTurn: number;
  currentOffer: BargainingOffer;
  offers: BargainingOffer[];
  startedAtTurn: number;
  deadlineTurn: number;
  disputeStartedAtTurn?: number | null;
  escalationStartedAtTurn?: number | null;
  escalationExpectations?: EscalationExpectationRecord[];
  ratification?: BargainingRatification | null;
  ballots?: RatificationBallot[];
  settledAgreementId?: string | null;
  endedAtTurn?: number | null;
  lastActionTurn: number;
  updatedAtTurn: number;
}

/**
 * One enforceable settlement. The agreement is the wage floor — it is NOT
 * written into sector wage levels (reference persistSettlementOutcome
 * comment: writing it there makes the raise permanent past expiry). The
 * corporation turn applies the floor on top of the employer's own wage for
 * exactly the active window; no-strike protection suppresses new strikes
 * and the strike output hit for the negotiated window.
 * Source: CollectiveAgreement.
 */
export interface CollectiveAgreement {
  /** `agreement:${campaignId}`. One agreement per settled campaign. */
  id: string;
  campaignId: string;
  unionId: string;
  countryId: string;
  employerCorporationId: string;
  sectorIds: string[];
  wageLevel: number;
  startsAtTurn: number;
  expiresAtTurn: number;
  noStrikeUntilTurn: number;
  status: "active" | "expired";
  updatedAtTurn: number;
}

/** Deterministic campaign id. The id IS the (union, employer, turn) identity invariant. */
export function bargainingCampaignIdFor(unionId: string, employerCorporationId: string, startedAtTurn: number): string {
  return `${unionId}::${employerCorporationId}::${startedAtTurn}`;
}

/** Deterministic agreement id: one agreement per settled campaign. */
export function collectiveAgreementIdFor(campaignId: string): string {
  return `agreement:${campaignId}`;
}

const CAMPAIGN_STATUSES: readonly string[] = ["negotiating", "dispute", "settled", "withdrawn", "lapsed"];
const ESCALATION_LEVELS: readonly string[] = ["none", "overtime_ban", "selective_strike", "industry_strike"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Strict campaign validation (#322). Key must match row id; union/employer pointers must resolve. */
export function validateBargainingCampaign(world: WorldState, campaign: BargainingCampaign): void {
  const row = campaign as unknown as Record<string, unknown>;
  const id = row["id"];
  const unionId = row["unionId"];
  const employerCorporationId = row["employerCorporationId"];
  const startedAtTurn = row["startedAtTurn"];
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof unionId !== "string" ||
    unionId.length === 0 ||
    typeof employerCorporationId !== "string" ||
    employerCorporationId.length === 0 ||
    typeof startedAtTurn !== "number" ||
    !Number.isInteger(startedAtTurn) ||
    startedAtTurn < 0 ||
    id !== bargainingCampaignIdFor(unionId, employerCorporationId, startedAtTurn)
  ) {
    throw new Error(`Invalid bargaining campaign identity`);
  }
  const union = world.unions[unionId];
  if (!union || union.id !== unionId) {
    throw new Error(`Invalid bargaining campaign union reference for ${id}`);
  }
  const employer = world.corporations[employerCorporationId];
  if (!employer || employer.id !== employerCorporationId) {
    throw new Error(`Invalid bargaining campaign employer reference for ${id}`);
  }
  if (typeof row["countryId"] !== "string" || (row["countryId"] as string).length === 0) {
    throw new Error(`Invalid bargaining campaign country for ${id}`);
  }
  if (!CAMPAIGN_STATUSES.includes(row["status"] as string)) {
    throw new Error(`Invalid bargaining campaign status for ${id}`);
  }
  if (!ESCALATION_LEVELS.includes(row["escalationLevel"] as string)) {
    throw new Error(`Invalid bargaining campaign escalation level for ${id}`);
  }
  if (!Array.isArray(row["sectorIds"]) || (row["sectorIds"] as unknown[]).length === 0) {
    throw new Error(`Invalid bargaining campaign sectors for ${id}`);
  }
  for (const sectorId of row["sectorIds"] as unknown[]) {
    if (typeof sectorId !== "string" || sectorId.length === 0) {
      throw new Error(`Invalid bargaining campaign sector reference for ${id}`);
    }
  }
  if (!isRecord(row["mandate"])) throw new Error(`Invalid bargaining campaign mandate for ${id}`);
  if (!isRecord(row["currentOffer"])) throw new Error(`Invalid bargaining campaign offer for ${id}`);
  if (!Array.isArray(row["offers"]) || (row["offers"] as unknown[]).length === 0) {
    throw new Error(`Invalid bargaining campaign offer history for ${id}`);
  }
  for (const key of ["mandateUpdatedAtTurn", "deadlineTurn", "lastActionTurn", "updatedAtTurn"] as const) {
    const value = row[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid bargaining campaign clock ${key} for ${id}`);
    }
  }
  const ratification = row["ratification"];
  if (ratification !== undefined && ratification !== null) {
    if (!isRecord(ratification)) throw new Error(`Invalid bargaining campaign ratification for ${id}`);
    const status = (ratification as Record<string, unknown>)["status"];
    if (status !== "open" && status !== "ratified" && status !== "rejected" && status !== "void") {
      throw new Error(`Invalid bargaining campaign ratification status for ${id}`);
    }
  }
}

/** Strict map validation: keys must match row ids. */
export function validateBargainingCampaigns(
  world: WorldState,
  campaigns: Record<string, BargainingCampaign>,
): void {
  for (const [key, campaign] of Object.entries(campaigns)) {
    if (key !== (campaign as unknown as Record<string, unknown>)["id"]) {
      throw new Error(`Invalid bargaining campaign key does not match id: ${key}`);
    }
    validateBargainingCampaign(world, campaign);
  }
}

/** Strict agreement validation (#322). Key must match row id; pointers must resolve. */
export function validateCollectiveAgreement(world: WorldState, agreement: CollectiveAgreement): void {
  const row = agreement as unknown as Record<string, unknown>;
  const id = row["id"];
  const campaignId = row["campaignId"];
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof campaignId !== "string" ||
    campaignId.length === 0 ||
    id !== collectiveAgreementIdFor(campaignId)
  ) {
    throw new Error(`Invalid collective agreement identity`);
  }
  const status = row["status"];
  if (status !== "active" && status !== "expired") {
    throw new Error(`Invalid collective agreement status for ${id}`);
  }
  for (const key of ["startsAtTurn", "expiresAtTurn", "noStrikeUntilTurn", "updatedAtTurn"] as const) {
    const value = row[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid collective agreement clock ${key} for ${id}`);
    }
  }
  const wageLevel = row["wageLevel"];
  if (typeof wageLevel !== "number" || !Number.isFinite(wageLevel) || wageLevel <= 0) {
    throw new Error(`Invalid collective agreement wage level for ${id}`);
  }
  if (!Array.isArray(row["sectorIds"]) || (row["sectorIds"] as unknown[]).length === 0) {
    throw new Error(`Invalid collective agreement sectors for ${id}`);
  }
}

/** Strict agreement map validation: keys must match row ids. */
export function validateCollectiveAgreements(
  world: WorldState,
  agreements: Record<string, CollectiveAgreement>,
): void {
  for (const [key, agreement] of Object.entries(agreements)) {
    if (key !== (agreement as unknown as Record<string, unknown>)["id"]) {
      throw new Error(`Invalid collective agreement key does not match id: ${key}`);
    }
    validateCollectiveAgreement(world, agreement);
  }
}

/**
 * Lazy campaign access (#322). Absent-means-empty: pre-#322 saves carry no
 * map. Present-but-invalid rows fail closed. No RNG is consumed.
 */
export function bargainingCampaigns(world: WorldState): Record<string, BargainingCampaign> {
  const rows = world.bargainingCampaigns ?? {};
  validateBargainingCampaigns(world, rows);
  world.bargainingCampaigns = rows;
  return rows;
}

/**
 * Lazy agreement access (#322). Absent-means-empty: pre-#322 saves carry no
 * rows. Present-but-invalid rows fail closed. No RNG is consumed.
 */
export function collectiveAgreements(world: WorldState): Record<string, CollectiveAgreement> {
  const rows = world.collectiveAgreements ?? {};
  validateCollectiveAgreements(world, rows);
  world.collectiveAgreements = rows;
  return rows;
}
