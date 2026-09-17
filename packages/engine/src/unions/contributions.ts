/**
 * Union political-contribution payouts — #321.
 *
 * Ports the payout leg of AHDGame's processUnionsTurn
 * (<mainline-checkout>/src/lib/turn/unions/index.ts at pinned
 * e364c04954ed628beef73a993a8e9e156650a31e): the requested contribution
 * (free cash flow x clamped pct, see political.ts) is split by banked
 * organizer strength via the verbatim distributePoliticalContributions rule,
 * debited from treasury, credited to recipient campaign funds, and recorded
 * as one `union_contribution` ledger row per payout.
 *
 * Source-backed semantics (cited, not invented):
 * - Eligibility: organizers with strength > 0 (the turn's
 *   `{ unionId: { $in }, strength: { $gt: 0 } }` query, #320
 *   eligibleOrganizerShares). Native adaptation: shares whose organizer
 *   identity resolves to no recipient record are excluded BEFORE the split,
 *   so the debit equals exactly what real recipients are credited (issue
 *   #321: "debit only the amount credited to real recipients"). A stale row
 *   pointing at nobody is skipped, never paid and never debited.
 * - Amount/ordering: distributePoliticalContributions verbatim — sort by
 *   organizer identity ascending, last share absorbs leftover float so the
 *   credits sum to the debit exactly.
 * - Recipient balance: the reference credits `currencyBalances.campaign`
 *   (local units; pre-forex `funds`). Native has no forex-split wallet, so
 *   the credit lands on the single local campaign-funds balance:
 *   Politician.funds, or PlayerCharacter.funds for organizer id "player".
 * - Ledger: one row per payout shaped like the reference financialTxLog
 *   entry (type "union_contribution", subjectType "character", subjectId,
 *   subjectName with the reference's own "Unknown" fallback, amount,
 *   currencyCode from COUNTRY_CURRENCY_MAP with USD fallback, counterparty
 *   "system" named for the union, meta { unionId, unionName, source:
 *   "union_pac" }). ObjectId/Date become deterministic string ids
 *   (`${unionId}:${turn}:${recipientId}`) and turn numbers: JSON-safe, same
 *   shape as UnionOrganizer ids.
 *
 * Atomicity (issue #321: roll back treasury, recipients, and ledger together
 * on any invalid recipient): applyUnionContributionPayouts validates every
 * payout — union exists and is not suspended, every amount finite > 0, every
 * recipient resolves, no duplicate within the batch or against the ledger —
 * BEFORE mutating anything, then moves treasury, recipient balances, and
 * ledger rows together with a snapshot restore if a write unexpectedly
 * throws. A duplicate (same union + turn already paid) throws without
 * touching state, so a re-run turn can never double-pay.
 *
 * Save shape stays additive with no version renumber: `unionContributionLedger`
 * is optional with absent-means-empty (pre-#321 saves carry no rows), and
 * load validates without materializing the field, so a mid-campaign
 * save/load leaves worlds byte-identical. Present-but-invalid rows fail
 * closed at the save boundary.
 *
 * Out of scope: bargaining, strikes, broader #322/#323 behavior.
 */

import type { WorldState } from "../types.js";
import type { ContributionPayout } from "./political.js";

/** Ledger entry type, mirroring the reference FinancialTxType "union_contribution". */
export const UNION_CONTRIBUTION_TX_TYPE = "union_contribution";

/** Ledger meta source tag, mirroring the reference meta.source "union_pac". */
export const UNION_CONTRIBUTION_SOURCE = "union_pac";

/** Organizer identity resolving to the human player's campaign funds. */
export const UNION_CONTRIBUTION_PLAYER_ID = "player";

/**
 * One paid political contribution, shaped like the reference financialTxLog
 * row for a union payout. JSON-safe. Deterministic id
 * `${unionId}:${turn}:${recipientId}` doubles as the idempotency key: the
 * same union + turn can never pay the same recipient twice.
 */
export interface UnionContributionRecord {
  /** `${unionId}:${turn}:${recipientId}`. Unique, deterministic. */
  id: string;
  /** Ledger entry type. Always "union_contribution" (reference FinancialTxType). */
  type: typeof UNION_CONTRIBUTION_TX_TYPE;
  /** Union id (`${countryId}-${sectorType}`) that paid. */
  unionId: string;
  /** Union display name (reference counterpartyName). */
  unionName: string;
  /** Turn the payout was applied on (reference turn/createdAt as turn numbers). */
  turn: number;
  /** Organizer identity credited (reference subjectId as a string). */
  recipientId: string;
  /** Recipient display name (reference subjectName; "Unknown" fallback verbatim). */
  recipientName: string;
  /** Amount credited, local campaign-funds units. Finite, > 0. */
  amount: number;
  /** Payout currency (reference currencyCode). */
  currencyCode: string;
  /** Reference counterpartyType. Always "system". */
  counterpartyType: "system";
  /** Reference meta.source. Always "union_pac". */
  source: typeof UNION_CONTRIBUTION_SOURCE;
}

/** Deterministic ledger id. The id IS the (union, turn, recipient) idempotency invariant. */
export function contributionRecordIdFor(unionId: string, turn: number, recipientId: string): string {
  return `${unionId}:${turn}:${recipientId}`;
}

// Source: <mainline-checkout>/src/lib/constants/currencies.ts COUNTRY_CURRENCY_MAP
// (same table the finance modules carry; union ledger rows need only the code,
// never a rate, and unmapped countries fall back to USD exactly like the turn).
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  JP: "JPY",
  DE: "EUR",
  IE: "IEP",
  BR: "BRL",
  CN: "CNY",
  NG: "NGN",
  RU: "SUR",
  DD: "DDM",
  FR: "FRF",
  IT: "ITL",
  ES: "ESP",
  SE: "SEK",
  TR: "TRL",
  GR: "GRD",
  AT: "ATS",
  FI: "FIM",
};

/** Payout currency for a union's country. Source: COUNTRY_CURRENCY_MAP[...] ?? "USD". */
export function currencyCodeForCountry(countryId: string): string {
  return COUNTRY_CURRENCY_MAP[countryId] ?? "USD";
}

export type ContributionRecipient =
  | { kind: "politician"; index: number }
  | { kind: "player" };

/**
 * Resolve an organizer identity to a campaign-funds holder. Politicians by
 * id; the reserved id "player" to the human player. Anything else is a stale
 * or foreign pointer: not an error at the query stage (the turn skips it),
 * but applyUnionContributionPayouts fails closed on it.
 */
export function resolveContributionRecipient(
  world: WorldState,
  characterId: unknown,
): ContributionRecipient | null {
  if (typeof characterId !== "string" || characterId.length === 0) return null;
  if (characterId === UNION_CONTRIBUTION_PLAYER_ID) return { kind: "player" };
  const index = world.politicians.findIndex((p) => p.id === characterId);
  return index >= 0 ? { kind: "politician", index } : null;
}

/**
 * Recipient display name for a ledger row. Resolved names win; the reference
 * names payouts after the character lookup and falls back to "Unknown", so
 * an unresolvable identity degrades to the same literal here.
 */
export function contributionRecipientName(world: WorldState, recipientId: string): string {
  const recipient = resolveContributionRecipient(world, recipientId);
  if (recipient?.kind === "player") return world.player.name || "Unknown";
  if (recipient) return world.politicians[recipient.index]?.name || "Unknown";
  return "Unknown";
}

/**
 * Strict ledger-row validation (#321). Ids must be the deterministic join,
 * the type/counterparty/source tags must match the reference row shape, the
 * turn must be an integer >= 0, names non-empty, the amount finite > 0, and
 * the union pointer must resolve to a recorded union (same dangling-pointer
 * rule as organizer validation).
 */
export function validateUnionContributionRecord(world: WorldState, record: UnionContributionRecord): void {
  const row = record as unknown as Record<string, unknown>;
  const unionId = row["unionId"];
  const recipientId = row["recipientId"];
  const amount = row["amount"];
  const turn = row["turn"];
  if (
    typeof unionId !== "string" ||
    unionId.length === 0 ||
    typeof recipientId !== "string" ||
    recipientId.length === 0 ||
    typeof turn !== "number" ||
    !Number.isInteger(turn) ||
    turn < 0 ||
    row["id"] !== contributionRecordIdFor(unionId, turn, recipientId)
  ) {
    throw new Error(`Invalid union contribution record identity`);
  }
  if (
    row["type"] !== UNION_CONTRIBUTION_TX_TYPE ||
    row["counterpartyType"] !== "system" ||
    row["source"] !== UNION_CONTRIBUTION_SOURCE
  ) {
    throw new Error(`Invalid union contribution record tags for ${row["id"]}`);
  }
  if (typeof row["unionName"] !== "string" || (row["unionName"] as string).length === 0) {
    throw new Error(`Invalid union contribution record union name for ${row["id"]}`);
  }
  if (typeof row["recipientName"] !== "string" || (row["recipientName"] as string).length === 0) {
    throw new Error(`Invalid union contribution record recipient name for ${row["id"]}`);
  }
  if (typeof row["currencyCode"] !== "string" || (row["currencyCode"] as string).length === 0) {
    throw new Error(`Invalid union contribution record currency for ${row["id"]}`);
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid union contribution record amount for ${row["id"]}`);
  }
  const unions = world.unions as Record<string, { id: string }>;
  const union = unions[unionId];
  if (!union || union.id !== unionId) {
    throw new Error(`Invalid union contribution record union reference for ${row["id"]}`);
  }
}

/** Strict ledger validation: ids unique, rows valid. */
export function validateUnionContributionLedger(
  world: WorldState,
  ledger: readonly UnionContributionRecord[],
): void {
  const seen = new Set<string>();
  for (const record of ledger) {
    if (seen.has((record as UnionContributionRecord).id)) {
      throw new Error(`Duplicate union contribution record id: ${(record as UnionContributionRecord).id}`);
    }
    seen.add((record as UnionContributionRecord).id);
    validateUnionContributionRecord(world, record);
  }
}

/**
 * Lazy ledger access (#321). Absent-means-empty: pre-#321 saves carry no
 * rows. Present-but-invalid rows fail closed. No RNG is consumed.
 */
export function unionContributionLedger(world: WorldState): UnionContributionRecord[] {
  const rows = world.unionContributionLedger ?? [];
  validateUnionContributionLedger(world, rows);
  world.unionContributionLedger = rows;
  return rows;
}

export interface ApplyContributionPayoutsArgs {
  unionId: string;
  turn: number;
  payouts: readonly ContributionPayout[];
}

export interface ApplyContributionPayoutsResult {
  /** Exact sum credited to recipients and debited from treasury. */
  paid: number;
  /** Ledger rows appended, in payout (recipient-id) order. */
  records: UnionContributionRecord[];
}

/**
 * Atomically pay one union's contribution split (#321). Validates the union
 * (exists, not suspended — suspended unions stay frozen exactly as the ban
 * found them), every payout (non-empty recipient identity that resolves to
 * a real campaign-funds holder, finite amount > 0), and idempotency (no
 * record for the same union + turn + recipient already in the ledger, no
 * duplicate within the batch) BEFORE mutating anything; then debits the
 * union treasury by the exact credited sum, credits each recipient's
 * campaign funds, and appends one ledger row per payout in order. Any
 * validation failure throws with treasury, recipients, and ledger untouched.
 * Empty payout lists are a no-op returning paid 0 (the no-organizer /
 * zero-contribution path retains the surplus in treasury).
 */
export function applyUnionContributionPayouts(
  world: WorldState,
  args: ApplyContributionPayoutsArgs,
): ApplyContributionPayoutsResult {
  const { unionId, turn, payouts } = args;
  const union = world.unions[unionId];
  if (!union || union.id !== unionId) {
    throw new Error(`Invalid union contribution union reference for ${unionId}`);
  }
  if (union.suspended) {
    throw new Error(`Union ${unionId} is suspended; contributions stay frozen`);
  }
  if (typeof turn !== "number" || !Number.isInteger(turn) || turn < 0) {
    throw new Error(`Invalid union contribution turn for ${unionId}`);
  }
  if (payouts.length === 0) return { paid: 0, records: [] };

  const ledger = unionContributionLedger(world);
  const seenIds = new Set(ledger.map((record) => record.id));
  const batchIds = new Set<string>();
  for (const payout of payouts) {
    const row = payout as unknown as Record<string, unknown>;
    const recipientId = row["characterId"];
    const amount = row["amount"];
    if (typeof recipientId !== "string" || recipientId.length === 0) {
      throw new Error(`Invalid union contribution recipient for ${unionId}`);
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid union contribution amount for ${unionId}:${String(recipientId)}`);
    }
    if (!resolveContributionRecipient(world, recipientId)) {
      throw new Error(`Invalid union contribution recipient for ${unionId}:${recipientId}`);
    }
    const id = contributionRecordIdFor(unionId, turn, recipientId);
    if (batchIds.has(id) || seenIds.has(id)) {
      throw new Error(`Duplicate union contribution payout ${id}`);
    }
    batchIds.add(id);
  }

  // All validation passed: move treasury, recipient balances, and ledger
  // together. A snapshot restore guards the writes so a mid-apply throw
  // cannot leave a half-paid split behind.
  const paid = payouts.reduce((sum, payout) => sum + payout.amount, 0);
  const treasuryBefore = union.treasury;
  const fundsBefore = payouts.map((payout) => {
    const recipient = resolveContributionRecipient(world, payout.characterId)!;
    return recipient.kind === "player" ? world.player.funds : world.politicians[recipient.index]!.funds;
  });
  const ledgerLengthBefore = ledger.length;
  try {
    union.treasury = treasuryBefore - paid;
    payouts.forEach((payout, i) => {
      const recipient = resolveContributionRecipient(world, payout.characterId)!;
      if (recipient.kind === "player") {
        world.player.funds = fundsBefore[i]! + payout.amount;
      } else {
        world.politicians[recipient.index]!.funds = fundsBefore[i]! + payout.amount;
      }
    });
    const records: UnionContributionRecord[] = payouts.map((payout) => ({
      id: contributionRecordIdFor(unionId, turn, payout.characterId),
      type: UNION_CONTRIBUTION_TX_TYPE,
      unionId,
      unionName: union.name,
      turn,
      recipientId: payout.characterId,
      recipientName: contributionRecipientName(world, payout.characterId),
      amount: payout.amount,
      currencyCode: currencyCodeForCountry(union.countryId),
      counterpartyType: "system",
      source: UNION_CONTRIBUTION_SOURCE,
    }));
    ledger.push(...records);
    return { paid, records };
  } catch (error) {
    union.treasury = treasuryBefore;
    payouts.forEach((payout, i) => {
      const recipient = resolveContributionRecipient(world, payout.characterId)!;
      if (recipient.kind === "player") {
        world.player.funds = fundsBefore[i]!;
      } else {
        world.politicians[recipient.index]!.funds = fundsBefore[i]!;
      }
    });
    ledger.length = ledgerLengthBefore;
    throw error;
  }
}
