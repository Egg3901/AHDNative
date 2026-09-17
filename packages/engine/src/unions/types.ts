/**
 * Union world entity — W15.
 *
 * Ports mainline's Union shape (src/lib/db/types/union.ts) collapsed to the
 * subset W15's turn actually reads/writes. See dues.ts file doc for the
 * field-level mapping and what is PORT-STUB.
 *
 * One union per (countryId, sectorType) for every playable country's
 * nonzero-weight 1953 sector, same granularity as Corporation (see
 * corporation/types.ts file doc for the single-sector collapse rationale).
 * Keyed by `${countryId}-${sectorType}` (mirrors Union._id = country+sector).
 *
 * Source: src/lib/db/types/union.ts Union + src/lib/db/types/corporation.ts
 * CORPORATION_TYPES ordering.
 */
import type { CorporationType } from "../corporation/types.js";

export type UnionServiceId = "strikeFund" | "healthFund" | "legalAid" | "training";

/**
 * Persisted union. JSON-safe, no ObjectId/Date/Map.
 * Mirrors mainline Union fields that unionsTurn and nppUnionBehavior touch;
 * strength/ownerId/ownerType are PORT-STUB deferred until player-vs-NPP
 * leadership contest lands (mainline src/lib/unions/unionEconomy.ts strength
 * decay + src/lib/turn/unions/nppUnionBehavior.ts election). Treating the
 * union as always NPC-led for W15 keeps membership/dues real while leaving
 * the contest wiring to a later wave.
 */
export interface Union {
  /** `${countryId}-${sectorType}`. Unique, deterministic. */
  id: string;
  countryId: string;
  sectorType: CorporationType;
  /** Display name. Seeded from unionNames.ts historical table where authored, else generic. */
  name: string;
  /** Spendable balance (home-currency units, absolute). Trickles via duesIncome/services. */
  treasury: number;
  /** 0-100 membership approval of the bargain. Dues push down, services push up. */
  approval: number;
  /** Annual dues per member, home-currency units. Set by head; clamped to 10% of wage. */
  duesPerWorkerAnnual: number;
  /** Active service programmes, paid per turn out of treasury. */
  activeServices: UnionServiceId[];
  /** Share of free cash flow (0-0.5) sent to organizers as political contributions. */
  politicalContributionPct: number;
  /**
   * Employer pension contribution as a share of the covered wage bill,
   * 0..0.15. Native collapse of the reference CollectiveAgreement field
   * (db/types/union.ts: absent reads as zero — those agreements promised
   * no pension and none is charged). Absent reads as zero here too, so
   * pre-#315 saves and un-bargained unions charge nothing. The bargaining
   * writer that settles this rate is the #322 residual; the pension turn
   * (#315) only reads it. Present-but-invalid values fail closed at the
   * save boundary.
   * Source: src/lib/unions/bargaining.ts BargainingTerms +
   * src/lib/pensions/rules.ts isValidContributionRate.
   */
  pensionContributionRate?: number;
  /**
   * Worker-weighted unionization across represented sectors, 0-100.
   * In mainline this is CorporateSector.unionization per sector; AHDClient
   * collapses to one density per union (the worktree has no per-sector
   * unionization table yet — see phases.ts membership bridge).
   */
  unionization: number;
  /**
   * Union ban suspension (player suggestion #93). True while the union's
   * country has a union-banning law enacted. Suspended unions are frozen:
   * processUnionsTurn skips dues/services/approval for them.
   * PORT-STUB until legislation/unionLawProvision lands; kept so the field
   * round-trips through saves.
   */
  suspended?: boolean;
  /** Whether this union is NPC-led (mainline ownerType "npp") or vacant. W15 NPP behavior fills this. */
  ownerType?: "npp" | null;
  /** Politician id of the NPP leader, or null if vacant. */
  ownerId?: string | null;
  /**
   * Uncapped organizing power, the sum of every organize drive run on this
   * union less 0.5%/turn decay (#320). Gates the leadership election and
   * weights organizer votes; absent reads as zero (the reference's own
   * absent-means-zero rule for pre-organizing-v2 documents). Drive
   * crediting lands with the organize commands (#322); the turn already
   * decays this pool alongside organizer banks.
   * Source: src/lib/db/types/union.ts Union.strength.
   */
  strength?: number;
  /**
   * Turn this union last called a strike, null/absent when it never has
   * (#322). Ports Union.lastCalledStrikeTurn: gates the union-level
   * UNION_STRIKE_CALL_COOLDOWN_TURNS cooldown between force-called strikes,
   * separate from each sector's own strikeCooldownUntilTurn. Absent reads as
   * never (the reference's own absent-means-zero rule for pre-existing
   * documents). Source: unions/unionEconomy.ts.
   */
  lastCalledStrikeTurn?: number | null;
  createdAtTurn: number;
  updatedAtTurn: number;
}

/**
 * Totally invented sector helpers would break determinism tests; reuse the
 * same TURNS_PER_YEAR/TURNS_PER_DAY constants mainline uses (see dues.ts).
 */
export const UNION_DEFAULT_TREASURY = 500;
export const UNION_DEFAULT_APPROVAL = 55;
export const UNION_DEFAULT_DUES = 0;
export const UNION_DEFAULT_UNIONIZATION = 25;
/** W15 seeds all services OFF; players/NPPs toggle them via future actions. */
export const UNION_DEFAULT_SERVICES: UnionServiceId[] = [];
export const UNION_DEFAULT_POLITICAL_PCT = 0;
