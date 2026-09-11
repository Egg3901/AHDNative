/**
 * Policy ledger — the DECAY-path analogue of mainline's `statePolicies`
 * collection (src/lib/db/types/legislation.ts StatePolicy), trimmed to what
 * computeMetricTarget needs: which law, which country, what direction, what
 * scope. Created by legislation/billLifecycle.ts applyBillEffects on
 * enactment (mirrors world.enactedLaws' creation site) and read every turn
 * by policyEffectsPhase. Replacement keeps historical rows with
 * repealedAtTurn; a repeal tombstone suppresses the authored catalog baseline.
 */
export interface PolicyLedgerEntry {
  id: string;
  /** Catalog entry id (legislation/catalog.ts CatalogEntry.id). */
  legislationTypeId: string;
  /** Level/option selected at enactment, if any (bill.enactedLevel). */
  policyOptionId: string;
  /** Explicit source-generated option id, when the bill selected one. */
  sourcePolicyOptionId?: string;
  /** -1 | 0 | 1 ladder direction. Source: Bill.effectDirection. */
  effectDirection: number;
  scope: "national" | "regional";
  /** Region targeted by a regional law; absent for national laws. */
  regionId?: string;
  countryId: string;
  enactedTurn: number;
  enactedAt: string;
  /** Set when a later law of the same type replaces this entry. */
  repealedAtTurn?: number;
  /** A durable no-law state that suppresses the catalog baseline. */
  isRepeal?: boolean;
}
