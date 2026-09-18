import {
  ACTION_CATALOG,
  CAUCUS_CREATE_FUND_COST,
  CAUCUS_TAX_MAX,
  canDisbandCaucus,
  canJoinCaucus,
  canLeaveCaucus,
  canSetCaucusTaxRate,
  getActionCost,
  quotePartyCaucusAction,
  type PartyCaucusEffect,
  type WorldState,
} from "@ahdclient/engine";
import { describePartyCaucusEffect } from "./partyCaucusConsequences";
import type { ActionView } from "./types";

/**
 * Party-scoped caucus projection. Display hints mirror the pinned engine;
 * executeAction remains authoritative.
 *
 * Public actions: createCaucus (caucusName plus optional caucusTaxRate 0-5),
 * joinCaucus (caucusId), leaveCaucus (no params), plus the chair-only
 * setCaucusTaxRate (caucusId + caucusTaxRate) and disbandCaucus (caucusId)
 * from #60. Whip, chair elections and NPP recruit are not catalog actions.
 *
 * Founding costs one 25k charge, owned by the engine caucus helper. The
 * chair-only edits charge no AP or funds, matching the reference PATCH/DELETE.
 */

export const CAUCUS_CREATE_COST = CAUCUS_CREATE_FUND_COST;
export const CAUCUS_CREATE_FUNDS_REQUIRED = CAUCUS_CREATE_FUND_COST;
export const CAUCUS_NAME_MIN_LENGTH = 3;

export interface CaucusCreateStatus {
  actionCost: number;
  fundCost: number;
  fundsRequired: number;
  funds: number;
  actions: number;
  cooldownRemaining: number;
  taxMin: number;
  taxMax: number;
  nameMinLength: number;
  available: boolean;
  disabledReason?: string;
  /** Consequence the engine projection reports (treasury/membership/state). */
  effect: PartyCaucusEffect;
  /** Consequence lines for the panel, from the same projection. */
  consequences: string[];
  action: ActionView;
}

/** How a recorded caucus seat resolves: named, explicitly vacant, or not recorded. */
export type CaucusSeatState = "known" | "vacant" | "unknown";

/** The player's recorded seat in a caucus, from chairId/viceChairId/membership. */
export type CaucusPlayerRole = "chair" | "vice-chair" | "member" | "non-member";

export interface CaucusRosterEntry {
  id: string;
  name: string;
  taxRate: number;
  treasury: number;
  memberCount: number;
  memberNames: string[];
  isPlayerCaucus: boolean;
  /** True when the player holds this caucus's chair seat (chair-only controls). */
  isPlayerChair: boolean;
  chairName: string | null;
  /** Seat resolution: vacant when chairId is null, unknown when absent (legacy saves) or unresolvable. */
  chairState: CaucusSeatState;
  /** Recorded vice-chair name, if any. Whip/health/recruitment are not persisted, so they stay unshown. */
  viceChairName: string | null;
  viceChairState: CaucusSeatState;
  /** The player's recorded role in this caucus. */
  playerRole: CaucusPlayerRole;
  join: ActionView;
  leave: ActionView;
  /** Chair-only tax edit (#60), no AP/fund charge. */
  setTax: ActionView;
  /** Chair-only soft-disband (#60), no AP/fund charge. */
  disband: ActionView;
}

export interface CaucusManagementView {
  countryId: string;
  countryName: string;
  currency: string;
  playerPartyId: string | null;
  playerPartyName: string | null;
  playerCaucusId: string | null;
  playerCaucusName: string | null;
  caucusCount: number;
  create: CaucusCreateStatus;
  caucuses: CaucusRosterEntry[];
}

type CaucusMembershipActionId = "createCaucus" | "joinCaucus" | "leaveCaucus";
/**
 * Chair-only caucus actions (#60). Only these two ids are projectable: the
 * six party/caucus quote actions live in the engine partyCaucus seam, while
 * whip, chair elections and NPP recruit are not public engine actions and
 * stay unavailable (they are omitted, never quoted).
 */
export type CaucusChairActionId = "setCaucusTaxRate" | "disbandCaucus";

/** Quote the AP price from the shared party/caucus projection (#61). */
function actionCost(world: WorldState, id: CaucusMembershipActionId): number {
  return quotePartyCaucusAction(world.player, id).actionCost;
}

function cooldownRemaining(world: WorldState, id: CaucusMembershipActionId): number {
  return Math.max(0, (world.player.actionCooldowns[id] ?? 0) - world.meta.turn);
}

function actionView(world: WorldState, id: CaucusMembershipActionId, reason: string | undefined): ActionView {
  const entry = ACTION_CATALOG[id];
  const quote = quotePartyCaucusAction(world.player, id);
  return {
    id, name: entry.name, description: entry.description, cost: quote.actionCost,
    consequences: describePartyCaucusEffect(quote.effect),
    available: !reason, ...(reason ? { disabledReason: reason } : {}),
  };
}

/**
 * Consequence lines for the chair-only actions, read from the state transition
 * each engine helper applies (caucus.ts setCaucusTaxRate/disbandCaucus): the
 * tax edit writes the 0-5 rate, the soft-disband empties memberIds, vacates
 * both chair seats and clears the disbanding player's caucusId. Neither
 * charges action points or funds (catalog baseCost 0, fundCost 0).
 */
function describeCaucusChairEffect(id: CaucusChairActionId): string[] {
  return id === "disbandCaucus"
    ? ["Clears all members and vacates the chair seats"]
    : ["Sets the caucus campaign-fund levy"];
}

/**
 * Shared cost/eligibility/consequence projection for the chair-only pair
 * (#60, #61). The AP price uses the player's real stats through the same
 * getActionCost call executeActionInner prices (execute.ts), the fund charge
 * is the same catalog fundCost the dispatcher debits, and eligibility runs
 * the same canSetCaucusTaxRate/canDisbandCaucus checks the dispatcher
 * enforces, so the panel's disabled reason matches the action's rejection.
 * executeAction remains authoritative; per-input values (the proposed tax
 * rate) are validated by the engine at dispatch.
 */
export function projectCaucusChairAction(
  world: WorldState,
  caucusId: string,
  id: CaucusChairActionId,
): ActionView {
  const player = world.player;
  const entry = ACTION_CATALOG[id];
  const cost = getActionCost(
    entry,
    player.donorBaseLevel ?? 0,
    player.politicalInfluence ?? 0,
    player.favorability ?? 50,
  );
  const check = id === "setCaucusTaxRate"
    ? canSetCaucusTaxRate(world, caucusId)
    : canDisbandCaucus(world, caucusId);
  const reason = check.ok ? undefined : check.error;
  const consequences = describeCaucusChairEffect(id);
  return {
    id, name: entry.name, description: entry.description, cost,
    fundCost: entry.fundCost,
    consequences,
    available: !reason, ...(reason ? { disabledReason: reason } : {}),
  };
}

function chairActionView(world: WorldState, caucusId: string, id: CaucusChairActionId): ActionView {
  return projectCaucusChairAction(world, caucusId, id);
}

function memberName(world: WorldState, id: string): string | null {
  if (id === "player") return world.player.name;
  return world.politicians.find((politician) => politician.id === id)?.name ?? null;
}

/**
 * Resolve a recorded seat to display state. Null means the seat was vacated
 * (leave/disband); undefined means a legacy save never recorded it; a set id
 * that resolves to no name is equally unknown, never a fabricated occupant.
 */
function seatState(world: WorldState, seatId: string | null | undefined): { name: string | null; state: CaucusSeatState } {
  if (seatId == null) return { name: null, state: seatId === null ? "vacant" : "unknown" };
  const name = memberName(world, seatId);
  return name == null ? { name: null, state: "unknown" } : { name, state: "known" };
}

export function slugifyCaucusName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function projectCaucusCreate(world: WorldState): CaucusCreateStatus {
  const player = world.player;
  // AP price and single 25k fund charge come from the shared party/caucus
  // projection the dispatcher charges (#61), so this quote cannot disagree with
  // what createCaucus debits.
  const quote = quotePartyCaucusAction(player, "createCaucus");
  const cost = quote.actionCost;
  const remaining = cooldownRemaining(world, "createCaucus");
  // Gate order mirrors executeActionInner exactly: catalog cooldown, then the
  // AP gate, then the funds gate, then the domain preflight (party membership,
  // already in a caucus, then the per-input name/slug checks).
  const reason = remaining > 0 ? `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.`
    : player.actions < cost ? "Not enough action points."
    : player.funds < quote.fundCost
      ? `Not enough funds. Creating a caucus needs ${quote.fundCost} funds available.`
    : !player.partyId ? "Must be a party member to create a caucus"
    : player.caucusId ? "Already in a caucus; leave it first"
    : undefined;
  const consequences = describePartyCaucusEffect(quote.effect);
  return {
    actionCost: cost,
    fundCost: quote.fundCost,
    fundsRequired: quote.fundCost,
    funds: player.funds,
    actions: player.actions,
    cooldownRemaining: remaining,
    taxMin: 0,
    taxMax: CAUCUS_TAX_MAX,
    nameMinLength: CAUCUS_NAME_MIN_LENGTH,
    available: !reason,
    ...(reason ? { disabledReason: reason } : {}),
    effect: quote.effect,
    consequences,
    action: actionView(world, "createCaucus", reason),
  };
}

/**
 * Per-input validation. Name and slug rules mirror Caucus.canCreateCaucus
 * (caucus.ts: trim length, slugify, party-scoped uniqueness among active
 * caucuses). Tax is 0-CAUCUS_TAX_MAX. Funds, AP and membership come from
 * projectCaucusCreate so the verdict matches executeAction, including the
 * single 25k entry gate. executeAction stays authoritative.
 */
export function validateCaucusFounding(
  world: WorldState,
  name: string,
  taxRate: number,
): { ok: true } | { ok: false; error: string } {
  const clean = name.trim();
  if (clean.length < CAUCUS_NAME_MIN_LENGTH) return { ok: false, error: "Caucus name too short" };
  const slug = slugifyCaucusName(clean);
  if (!slug) return { ok: false, error: "Invalid caucus name" };
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > CAUCUS_TAX_MAX) {
    return { ok: false, error: `taxRate must be 0-${CAUCUS_TAX_MAX}` };
  }
  const player = world.player;
  for (const caucus of world.caucuses) {
    if (caucus.disbandedAt !== null) continue;
    if (caucus.countryId === player.countryId && caucus.partyId === player.partyId
      && slugifyCaucusName(caucus.name) === slug) {
      return { ok: false, error: `Caucus slug taken: ${slug}` };
    }
  }
  const base = projectCaucusCreate(world);
  if (!base.available) return { ok: false, error: base.disabledReason ?? "Unavailable" };
  return { ok: true };
}

export function projectCaucusRoster(world: WorldState): CaucusRosterEntry[] {
  const player = world.player;
  const joinCost = actionCost(world, "joinCaucus");
  const leaveCost = actionCost(world, "leaveCaucus");
  const joinCool = cooldownRemaining(world, "joinCaucus");
  const leaveCool = cooldownRemaining(world, "leaveCaucus");
  return world.caucuses
    .filter((caucus) => caucus.disbandedAt === null
      && caucus.countryId === player.countryId
      && caucus.partyId === player.partyId)
    .map((caucus) => {
      const isPlayerCaucus = player.caucusId === caucus.id;
      const isPlayerChair = caucus.chairId === "player";
      const joinCheck = canJoinCaucus(world, caucus.id);
      const leaveCheck = canLeaveCaucus(world);
      const joinReason = joinCool > 0 ? `Available in ${joinCool} ${joinCool === 1 ? "turn" : "turns"}.`
        : player.actions < joinCost ? "Not enough action points."
        : joinCheck.ok ? undefined
        : joinCheck.error;
      const leaveReason = !isPlayerCaucus ? "You are not a member of this caucus."
        : leaveCool > 0 ? `Available in ${leaveCool} ${leaveCool === 1 ? "turn" : "turns"}.`
        : player.actions < leaveCost ? "Not enough action points."
        : leaveCheck.ok ? undefined
        : leaveCheck.error;
      // Chair-only controls (#60): the shared chair projection runs the same
      // engine checks the dispatcher enforces, so the panel's disabled reason
      // matches the action's rejection.
      const names = caucus.memberIds
        .map((id) => memberName(world, id))
        .filter((name): name is string => name != null)
        .sort((a, b) => (a === player.name ? -1 : b === player.name ? 1 : a.localeCompare(b)));
      // Read-only seat/role state (#60): resolved from the recorded save, with
      // explicit unknown when a legacy save never stored the seat or the id no
      // longer resolves. No elections, health or recruitment values are
      // invented; those fields do not exist on the persisted Caucus.
      const chair = seatState(world, caucus.chairId);
      const viceChair = seatState(world, caucus.viceChairId);
      const playerRole: CaucusPlayerRole = isPlayerChair ? "chair"
        : caucus.viceChairId === "player" ? "vice-chair"
        : isPlayerCaucus ? "member" : "non-member";
      return {
        id: caucus.id,
        name: caucus.name,
        taxRate: caucus.taxRate,
        treasury: caucus.treasury,
        memberCount: caucus.memberIds.length,
        memberNames: names,
        isPlayerCaucus,
        isPlayerChair,
        chairName: chair.name,
        chairState: chair.state,
        viceChairName: viceChair.name,
        viceChairState: viceChair.state,
        playerRole,
        join: actionView(world, "joinCaucus", joinReason),
        leave: actionView(world, "leaveCaucus", leaveReason),
        setTax: chairActionView(world, caucus.id, "setCaucusTaxRate"),
        disband: chairActionView(world, caucus.id, "disbandCaucus"),
      };
    })
    .sort((a, b) => Number(b.isPlayerCaucus) - Number(a.isPlayerCaucus) || b.memberCount - a.memberCount || a.name.localeCompare(b.name));
}

export function projectCaucusManagement(world: WorldState): CaucusManagementView {
  const country = world.countries[world.player.countryId];
  if (!country || !country.playable) throw new Error("The save does not contain the player's playable country.");
  const player = world.player;
  const caucuses = player.partyId ? projectCaucusRoster(world) : [];
  return {
    countryId: country.id,
    countryName: country.name,
    currency: world.budgets[country.id]?.currencyCode ?? world.exchangeRates[country.id]?.currencyCode ?? "XXX",
    playerPartyId: player.partyId,
    playerPartyName: player.partyId ? (world.parties[player.partyId]?.name ?? null) : null,
    playerCaucusId: player.caucusId,
    playerCaucusName: player.caucusId
      ? (world.caucuses.find((caucus) => caucus.id === player.caucusId)?.name ?? null)
      : null,
    caucusCount: caucuses.length,
    create: projectCaucusCreate(world),
    caucuses,
  };
}
