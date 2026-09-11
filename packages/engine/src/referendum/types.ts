/**
 * W25: referendum lifecycle record. Ports the subset of mainline's
 * `Referendum` (src/lib/db/types/referendum.ts:35-60) that this wave's
 * skeleton actually drives; see lifecycle.ts file doc for exactly which
 * status edges are ported vs PORT-STUB this wave.
 */
import type {
  CohortModifier,
  PollPoint,
  ReferendumCohort,
} from "./cohort.js";

export type ReferendumKind = "independence" | "reunification";

export type ReferendumStatus =
  | "granted"
  | "campaigning"
  | "polling"
  | "actuating"
  | "completed"
  | "settled"
  | "cancelled";

export interface ReferendumRecord {
  id: string;
  countryId: string;
  /** "SCO" | "WAL" | "NIR" (UK_DEVOLUTION_REGIONS). */
  regionId: string;
  kind: ReferendumKind;
  status: ReferendumStatus;
  /** Null for independence; "IE" for Northern Ireland reunification. */
  targetCountryId?: string | null;
  /** Denormalized current Yes share (0-100): refreshed from the canonical
   * cohort aggregate every campaigning turn (see lifecycle.ts). Never read it
   * for resolution ; call `referendumYesShare` instead. */
  yesShare: number;
  /** Cohort baseline snapshotted at campaign open; the canonical yesShare is
   * the turnout-weighted aggregate of these (see cohort.ts). Mainline builds
   * them from the Layer-1 bucket profile; AHDNative regions have no Layer-1
   * substrate, so the lifecycle seeds mainline's verbatim single-cohort
   * fallback (`{ groupId: "_all", ... }`, yesLean = opening desire). */
  cohortBaseline?: ReferendumCohort[];
  /** Raw accumulated ground-game units per cohort (no writers yet; read at
   * aggregate time with the soft cap, see cohort.ts). */
  cohortModifiers?: CohortModifier[];
  /** Atomic PS spend counters per side (no writers yet). */
  campaignSpendUnits?: { yes: number; no: number } | null;
  /** Per-turn Yes-share series, seeded at campaign open (see cohort.ts). */
  pollHistory?: PollPoint[];
  requestedTurn: number;
  grantedTurn: number | null;
  /** Campaign window set at grant (mainline `grantReferendum` writes all
   * three; the lifecycle only reads them). Null/absent on fixtures that
   * were never granted; see lifecycle.ts for the null-close behavior. */
  campaignOpenTurn?: number | null;
  campaignCloseTurn?: number | null;
  campaignBaseYesShare?: number;
  /** Set by terminal resolution in source-compatible records; null when none. */
  cooldownReadyAtTurn?: number | null;
  resolvedTurn?: number;
  /** Set once the popular vote resolves (polling -> actuating|settled). */
  finalYesShare?: number;
  turnout?: number;
  passed?: boolean;
}
