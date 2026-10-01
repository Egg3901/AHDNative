import type { CatalogEntry } from "./catalog.js";

/** Source constants in AHDGame shared/constants/legislation.ts. */
export const BILL_PROPOSE_ACTION_COST = 10;
export const FIRST_PROVISION_NPI_COST = 5;

/**
 * AHDGame's national tariff proposal is exempt from provision NPI; other
 * ordinary policy provisions cost 5 NPI. Subsidy proposals use their own
 * source action and have no NPI charge.
 */
export function proposalNpiCost(entry: Pick<CatalogEntry, "kind" | "taxPolicy">): number {
  return entry.kind === "tax" && entry.taxPolicy?.taxType === "tariffs"
    ? 0
    : FIRST_PROVISION_NPI_COST;
}
