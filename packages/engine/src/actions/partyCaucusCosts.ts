/**
 * Canonical party/caucus action charge constants (#61).
 *
 * Leaf module: no imports, so both the published action catalog
 * (actions/catalog.ts) and the domain helpers (membership.ts, caucus.ts) can
 * depend on it without a cycle. Before this module existed the same prices
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
// Game join/route.ts applies membership without a personal resource debit.
export const PARTY_JOIN_ACTION_COST = 0;
/** Leave Party action-point price. */
// Game leave/route.ts resets membership and clout without a personal debit.
export const PARTY_LEAVE_ACTION_COST = 0;

/** Create Caucus action-point price. */
export const CAUCUS_CREATE_ACTION_COST = 0;
/** Create Caucus single campaign-funds charge. */
// Game caucuses/route.ts only writes the caucus, membership and faction pointer.
export const CAUCUS_CREATE_FUND_COST = 0;
/** Join Caucus action-point price. */
// Game members/route.ts POST writes membership and factionId with no debit.
export const CAUCUS_JOIN_ACTION_COST = 0;
/** Leave Caucus action-point price. */
// Game members/[memberId]/route.ts DELETE closes membership with no debit.
export const CAUCUS_LEAVE_ACTION_COST = 0;
/** Chair tax-edit action-point price. */
// Game [slug]/route.ts PATCH writes taxRate with no debit.
export const CAUCUS_TAX_ACTION_COST = 0;
/** Chair tax-edit campaign-funds charge. */
export const CAUCUS_TAX_FUND_COST = 0;
/** Chair disband action-point price. */
// Game [slug]/route.ts DELETE soft-disbands with no debit.
export const CAUCUS_DISBAND_ACTION_COST = 0;
/** Chair disband campaign-funds charge. */
export const CAUCUS_DISBAND_FUND_COST = 0;
