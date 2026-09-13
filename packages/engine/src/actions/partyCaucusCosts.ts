/**
 * Canonical party/caucus action charge constants (#61).
 *
 * Leaf module: no imports, so both the published action catalog
 * (actions/catalog.ts) and the domain helpers (membership.ts, caucus.ts) can
 * depend on it without a cycle. Before this module existed the same six prices
 * were written twice — once as literals in the catalog entries and once as
 * constants in the helpers — so the UI quote and the engine charge could drift
 * silently. Publishing the numbers here makes them one source of truth.
 *
 * The action IDs that consume these live in actions/partyCaucus.ts, whose
 * `partyCaucusCharge` is the projection the dispatcher charges from and the UI
 * displays.
 */

/** Found Party (membership.foundParty) action-point price. */
export const PARTY_FOUND_ACTION_COST = 8;
/** Found Party single campaign-funds charge. */
export const PARTY_FOUND_FUND_COST = 100_000;
/** Join Party action-point price. */
export const PARTY_JOIN_ACTION_COST = 2;
/** Leave Party action-point price. */
export const PARTY_LEAVE_ACTION_COST = 1;

/** Create Caucus action-point price. */
export const CAUCUS_CREATE_ACTION_COST = 4;
/** Create Caucus single campaign-funds charge. */
export const CAUCUS_CREATE_FUND_COST = 25_000;
/** Join Caucus action-point price. */
export const CAUCUS_JOIN_ACTION_COST = 2;
/** Leave Caucus action-point price. */
export const CAUCUS_LEAVE_ACTION_COST = 1;
