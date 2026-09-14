/**
 * Caucus lifecycle helpers.
 * Ports mainline caucus semantics:
 * - src/lib/db/types/caucus.ts (Caucus, CaucusMembership)
 * - src/app/api/country/[code]/parties/[id]/caucuses/route.ts (found)
 * - src/app/api/country/[code]/parties/[id]/caucuses/[slug]/members/route.ts (join/leave)
 * - src/lib/caucus/cleanupCaucusParticipationForCharacters.ts
 * - taxRate 0-5% (src/lib/db/types/caucus.ts taxRate 0–5)
 */

import type { WorldState, Caucus } from "./types.js";
import { CAUCUS_CREATE_FUND_COST } from "./actions/partyCaucusCosts.js";

export const CAUCUS_TAX_MAX = 5; // cites Caucus.taxRate 0–5
// Re-published from the single source of truth (#61). The action cost and fund
// charge now live in actions/partyCaucusCosts.ts, which the action catalog and
// this helper both read, so the displayed price and the charged price cannot
// drift.
export {
  CAUCUS_CREATE_ACTION_COST,
  CAUCUS_CREATE_FUND_COST,
  CAUCUS_JOIN_ACTION_COST,
  CAUCUS_LEAVE_ACTION_COST,
} from "./actions/partyCaucusCosts.js";

export type CaucusResult = { ok: true; caucusId?: string } | { ok: false; error: string };

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function canCreateCaucus(world: WorldState, name: string, _partyId?: string): CaucusResult {
  const player = world.player;
  if (!player.partyId) return { ok: false, error: "Must be a party member to create a caucus" };
  if (player.caucusId) return { ok: false, error: "Already in a caucus; leave it first" };
  if (!name || name.trim().length < 3) return { ok: false, error: "Caucus name too short" };
  const slug = slugify(name);
  if (!slug) return { ok: false, error: "Invalid caucus name" };
  const partyId = _partyId ?? player.partyId;
  if (partyId !== player.partyId) return { ok: false, error: "Can only create a caucus in your own party" };
  // Unique slug among active caucuses within (countryId, partyId)
  for (const c of world.caucuses) {
    if (c.disbandedAt !== null) continue;
    if (c.countryId === player.countryId && c.partyId === partyId && slugify(c.name) === slug) {
      return { ok: false, error: `Caucus slug taken: ${slug}` };
    }
  }
  if (player.funds < CAUCUS_CREATE_FUND_COST) return { ok: false, error: `Not enough funds. Need ${CAUCUS_CREATE_FUND_COST}` };
  return { ok: true };
}

export function createCaucus(world: WorldState, name: string, taxRate = 0): CaucusResult {
  const check = canCreateCaucus(world, name);
  if (!check.ok) return check;
  const player = world.player;
  const partyId = player.partyId!;
  if (taxRate < 0 || taxRate > CAUCUS_TAX_MAX) return { ok: false, error: `taxRate must be 0-${CAUCUS_TAX_MAX}` };
  const id = `caucus-${slugify(name)}-${world.meta.turn}-${world.caucuses.length}`;
  const caucus: Caucus = {
    id,
    countryId: player.countryId,
    partyId,
    name: name.trim(),
    treasury: 0,
    taxRate,
    disbandedAt: null,
    memberIds: ["player"],
    chairId: "player",
    viceChairId: null,
  };
  world.caucuses.push(caucus);
  player.caucusId = id;
  player.funds -= CAUCUS_CREATE_FUND_COST;
  return { ok: true, caucusId: id };
}

export function canJoinCaucus(world: WorldState, caucusId: string): CaucusResult {
  const player = world.player;
  if (!player.partyId) return { ok: false, error: "Must be a party member to join a caucus" };
  if (player.caucusId) return { ok: false, error: "Already in a caucus; leave it first" };
  const caucus = world.caucuses.find((c) => c.id === caucusId);
  if (!caucus) return { ok: false, error: `Caucus not found: ${caucusId}` };
  if (caucus.disbandedAt !== null) return { ok: false, error: "Caucus is disbanded" };
  if (caucus.countryId !== player.countryId) return { ok: false, error: "Caucus country mismatch" };
  if (caucus.partyId !== player.partyId) return { ok: false, error: "Caucus party mismatch; must be same party" };
  return { ok: true };
}

export function joinCaucus(world: WorldState, caucusId: string): CaucusResult {
  const check = canJoinCaucus(world, caucusId);
  if (!check.ok) return check;
  const caucus = world.caucuses.find((c) => c.id === caucusId)!;
  if (!caucus.memberIds.includes("player")) caucus.memberIds.push("player");
  world.player.caucusId = caucusId;
  return { ok: true, caucusId };
}

export function canLeaveCaucus(world: WorldState): CaucusResult {
  if (!world.player.caucusId) return { ok: false, error: "Not in a caucus" };
  return { ok: true };
}

export function leaveCaucus(world: WorldState): CaucusResult {
  const check = canLeaveCaucus(world);
  if (!check.ok) return check;
  const caucusId = world.player.caucusId!;
  const caucus = world.caucuses.find((c) => c.id === caucusId);
  if (caucus) {
    caucus.memberIds = caucus.memberIds.filter((id) => id !== "player");
    if (caucus.chairId === "player") caucus.chairId = null;
    if (caucus.viceChairId === "player") caucus.viceChairId = null;
  }
  world.player.caucusId = null;
  return { ok: true };
}

/** True when the player holds this caucus's chair seat (see Caucus.chairId). */
function playerChairsCaucus(world: WorldState, caucus: Caucus): boolean {
  return caucus.chairId === "player";
}

/**
 * Chair-only tax edit. Ports the reference PATCH
 * src/app/api/country/[code]/parties/[id]/caucuses/[slug]/route.ts: the chair
 * sets a 0-5 rate, and the route charges neither action points nor funds. A
 * non-chair member cannot edit the rate (the helper previously allowed any
 * member, which the reference route rejects).
 */
export function canSetCaucusTaxRate(world: WorldState, caucusId: string): CaucusResult {
  const caucus = world.caucuses.find((c) => c.id === caucusId);
  if (!caucus) return { ok: false, error: `Caucus not found: ${caucusId}` };
  if (caucus.disbandedAt !== null) return { ok: false, error: "Caucus is disbanded" };
  if (!playerChairsCaucus(world, caucus)) return { ok: false, error: "Only the caucus chair can set the tax rate" };
  return { ok: true };
}

export function setCaucusTaxRate(world: WorldState, caucusId: string, taxRate: number): CaucusResult {
  const check = canSetCaucusTaxRate(world, caucusId);
  if (!check.ok) return check;
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > CAUCUS_TAX_MAX) {
    return { ok: false, error: `taxRate must be 0-${CAUCUS_TAX_MAX}` };
  }
  const caucus = world.caucuses.find((c) => c.id === caucusId)!;
  caucus.taxRate = taxRate;
  return { ok: true };
}

/**
 * Chair-only soft-disband. Ports the reference DELETE
 * src/app/api/country/[code]/parties/[id]/caucuses/[slug]/route.ts: the chair
 * soft-deletes the caucus, every membership is marked removed, and the
 * disbanded row is retained for historical references. Native's minimal caucus
 * stores members inline, so this empties memberIds, vacates the chair seats and
 * clears the disbanding player's caucusId. The route charges no AP or funds.
 */
export function canDisbandCaucus(world: WorldState, caucusId: string): CaucusResult {
  const caucus = world.caucuses.find((c) => c.id === caucusId);
  if (!caucus) return { ok: false, error: `Caucus not found: ${caucusId}` };
  if (caucus.disbandedAt !== null) return { ok: false, error: "Caucus is already disbanded" };
  if (!playerChairsCaucus(world, caucus)) return { ok: false, error: "Only the caucus chair can disband the caucus" };
  return { ok: true };
}

export function disbandCaucus(world: WorldState, caucusId: string): CaucusResult {
  const check = canDisbandCaucus(world, caucusId);
  if (!check.ok) return check;
  const caucus = world.caucuses.find((c) => c.id === caucusId)!;
  caucus.disbandedAt = world.meta.date;
  caucus.memberIds = [];
  caucus.chairId = null;
  caucus.viceChairId = null;
  if (world.player.caucusId === caucusId) world.player.caucusId = null;
  return { ok: true, caucusId };
}
