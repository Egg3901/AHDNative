import {
  ACTION_CATALOG,
  CAUCUS_CREATE_FUND_COST,
  CAUCUS_TAX_MAX,
  canJoinCaucus,
  canLeaveCaucus,
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
 * Public actions only: createCaucus (caucusName plus optional caucusTaxRate
 * 0-5), joinCaucus (caucusId), leaveCaucus (no params). setCaucusTaxRate,
 * disband, whip, chair and NPP recruit are not catalog actions.
 *
 * Founding costs one 25k charge, owned by the engine caucus helper.
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

export interface CaucusRosterEntry {
  id: string;
  name: string;
  taxRate: number;
  treasury: number;
  memberCount: number;
  memberNames: string[];
  isPlayerCaucus: boolean;
  join: ActionView;
  leave: ActionView;
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

type CaucusActionId = "createCaucus" | "joinCaucus" | "leaveCaucus";

/** Quote the AP price from the shared party/caucus projection (#61). */
function actionCost(world: WorldState, id: CaucusActionId): number {
  return quotePartyCaucusAction(world.player, id).actionCost;
}

function cooldownRemaining(world: WorldState, id: CaucusActionId): number {
  return Math.max(0, (world.player.actionCooldowns[id] ?? 0) - world.meta.turn);
}

function actionView(world: WorldState, id: CaucusActionId, reason: string | undefined): ActionView {
  const entry = ACTION_CATALOG[id];
  const quote = quotePartyCaucusAction(world.player, id);
  return {
    id, name: entry.name, description: entry.description, cost: quote.actionCost,
    consequences: describePartyCaucusEffect(quote.effect),
    available: !reason, ...(reason ? { disabledReason: reason } : {}),
  };
}

function memberName(world: WorldState, id: string): string | null {
  if (id === "player") return world.player.name;
  return world.politicians.find((politician) => politician.id === id)?.name ?? null;
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
      const names = caucus.memberIds
        .map((id) => memberName(world, id))
        .filter((name): name is string => name != null)
        .sort((a, b) => (a === player.name ? -1 : b === player.name ? 1 : a.localeCompare(b)));
      return {
        id: caucus.id,
        name: caucus.name,
        taxRate: caucus.taxRate,
        treasury: caucus.treasury,
        memberCount: caucus.memberIds.length,
        memberNames: names,
        isPlayerCaucus,
        join: actionView(world, "joinCaucus", joinReason),
        leave: actionView(world, "leaveCaucus", leaveReason),
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
