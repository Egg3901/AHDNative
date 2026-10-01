import {
  ACTION_CATALOG,
  CAUCUS_CREATE_FUND_COST,
  CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS,
  CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP,
  CAUCUS_TAX_MAX,
  canDisbandCaucus,
  canJoinCaucus,
  canLeaveCaucus,
  canSetCaucusTaxRate,
  caucusNppRecruitCooldownRemaining,
  listCaucusNppRecruitOptions,
  quotePartyCaucusAction,
  quoteRecruitCaucusNpp,
  type CaucusNppRecruitOption,
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
 * from #60, plus chair-only recruitCaucusNpp. Whip and chair elections are not catalog actions.
 *
 * Founding, join, leave, tax and disband charge no AP or funds, matching the
 * source create/join/leave/PATCH/DELETE routes. Native foundParty stays the
 * immediate 8 AP + 100k / NPP cofounder proxy; source charter draft is free
 * with 3 human cofounders and is not a public action yet.
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
  /** Chair-only NPP recruit. GET hides needs_relationship; POST still enforces >= 60. */
  recruit: CaucusNppRecruitView;
}

export interface CaucusNppRecruitView {
  minimumRelationship: number;
  cooldownTurns: number;
  cooldownRemaining: number;
  options: CaucusNppRecruitOption[];
  selectedAction: ActionView;
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
 * Chair-only caucus actions. These ids share the engine partyCaucus quote
 * with founding/join/leave. Whip and chair elections are not public engine
 * actions. NPP recruit is quoted separately from caucusRecruit.ts.
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
    fundCost: quote.fundCost,
    consequences: describePartyCaucusEffect(quote.effect),
    available: !reason, ...(reason ? { disabledReason: reason } : {}),
  };
}

/**
 * Shared cost/eligibility/consequence projection for the chair-only pair.
 * Charge and consequence come from quotePartyCaucusAction, the same
 * projection executeActionInner charges, and eligibility runs the same
 * canSetCaucusTaxRate/canDisbandCaucus checks the dispatcher enforces, so
 * the panel's disabled reason matches the action's rejection. Authority is
 * the recorded chairId. executeAction remains authoritative; per-input
 * values (the proposed tax rate) are validated by the engine at dispatch.
 */
export function projectCaucusChairAction(
  world: WorldState,
  caucusId: string,
  id: CaucusChairActionId,
): ActionView {
  const entry = ACTION_CATALOG[id];
  const quote = quotePartyCaucusAction(world.player, id);
  const check = id === "setCaucusTaxRate"
    ? canSetCaucusTaxRate(world, caucusId)
    : canDisbandCaucus(world, caucusId);
  const reason = check.ok ? undefined : check.error;
  return {
    id, name: entry.name, description: entry.description, cost: quote.actionCost,
    fundCost: quote.fundCost,
    consequences: describePartyCaucusEffect(quote.effect),
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
  // AP price and fund charge come from the shared party/caucus projection
  // the dispatcher charges, so this quote cannot disagree with createCaucus.
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
 * source-free entry gate. executeAction stays authoritative.
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
      // longer resolves. Health, whip and elections stay unrecorded. Chair NPP
      // recruitment is the source members/route.ts memberType=npp writer.
      const chair = seatState(world, caucus.chairId);
      const viceChair = seatState(world, caucus.viceChairId);
      const playerRole: CaucusPlayerRole = isPlayerChair ? "chair"
        : caucus.viceChairId === "player" ? "vice-chair"
        : isPlayerCaucus ? "member" : "non-member";
      const listed = isPlayerChair ? listCaucusNppRecruitOptions(world, caucus.id) : null;
      const recruitOptions = listed?.ok ? listed.items : [];
      const recruitReason = !isPlayerChair
        ? "Only the Caucus Chair can review recruitable NPPs."
        : listed && !listed.ok ? listed.error
        : undefined;
      const firstEligible = recruitOptions.find((option) => option.eligible);
      const recruitQuote = firstEligible
        ? quoteRecruitCaucusNpp(world, { caucusId: caucus.id, targetId: firstEligible.id })
        : null;
      const recruitDisabled = recruitReason
        ?? (recruitQuote && !recruitQuote.ok ? recruitQuote.error : undefined)
        ?? (!firstEligible && recruitOptions[0] ? recruitOptions[0].statusLabel : undefined)
        ?? (recruitOptions.length === 0 ? "No same-party NPPs currently qualify" : undefined);
      const recruit: CaucusNppRecruitView = {
        minimumRelationship: CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP,
        cooldownTurns: CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS,
        cooldownRemaining: caucusNppRecruitCooldownRemaining(world, caucus.lastNppRecruitTurn),
        options: recruitOptions,
        selectedAction: {
          id: "recruitCaucusNpp",
          name: ACTION_CATALOG.recruitCaucusNpp.name,
          description: ACTION_CATALOG.recruitCaucusNpp.description,
          cost: 0,
          fundCost: 0,
          available: !recruitDisabled && !!firstEligible,
          ...(recruitDisabled ? { disabledReason: recruitDisabled } : {}),
          consequences: [
            `Requires relationship ${CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP}`,
            `${CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS}-turn caucus cooldown after a successful recruit`,
          ],
        },
      };
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
        recruit,
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
