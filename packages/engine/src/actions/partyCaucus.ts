/**
 * Party/caucus action charge + consequence projection (#61).
 *
 * One projection for the six party/caucus actions the public catalog exposes:
 * foundParty, joinParty, leaveParty, createCaucus, joinCaucus, leaveCaucus.
 * `partyCaucusCharge` is the exact AP + funds + cooldown the dispatcher applies
 * (actions/execute.ts charges from it) and the exact numbers the display layer
 * quotes, so a UI hint can never disagree with what the action debits.
 *
 * `partyCaucusEffect` names the membership/treasury/cooldown/state change each
 * action makes on success, so the panels can state consequences before the
 * player confirms. Values are read from the same constants the domain helpers
 * charge (actions/partyCaucusCosts.ts via membership.ts / caucus.ts).
 */

import { ACTION_CATALOG, getActionCost } from "./catalog.js";
import {
  CAUCUS_CREATE_FUND_COST,
  PARTY_FOUND_FUND_COST,
} from "./partyCaucusCosts.js";
import { getSwitchCooldownRemaining } from "../membership.js";
import type { WorldState } from "../types.js";

export type PartyCaucusActionId =
  | "foundParty"
  | "joinParty"
  | "leaveParty"
  | "createCaucus"
  | "joinCaucus"
  | "leaveCaucus";

/** The party/caucus actions the catalog exposes, in display order. */
export const PARTY_CAUCUS_ACTION_IDS: readonly PartyCaucusActionId[] = [
  "foundParty",
  "joinParty",
  "leaveParty",
  "createCaucus",
  "joinCaucus",
  "leaveCaucus",
];

const PARTY_CAUCUS_ACTION_ID_SET: ReadonlySet<string> = new Set(PARTY_CAUCUS_ACTION_IDS);

export function isPartyCaucusActionId(actionId: string): actionId is PartyCaucusActionId {
  return PARTY_CAUCUS_ACTION_ID_SET.has(actionId);
}

/** The actor stats the dynamic AP price depends on. */
export interface PartyCaucusActorStats {
  donorBaseLevel?: number | undefined;
  politicalInfluence?: number | undefined;
  favorability?: number | undefined;
}

/** The exact cost a party/caucus action charges on success. */
export interface PartyCaucusCharge {
  actionId: PartyCaucusActionId;
  /** Action points charged (catalog price with the dynamic tier applied). */
  actionCost: number;
  /** Campaign funds charged as one charge (0 when the action is free). */
  fundCost: number;
  /** Catalog cooldown stamped at success (0 when the action has none). */
  cooldownTurns: number;
}

/**
 * Canonical charge for one action. `executeActionInner` calls this for the AP
 * price and the fund gate; the game-layer projections call it for the quote, so
 * both read the same catalog entry and dynamic-cost function.
 */
export function partyCaucusCharge(actor: PartyCaucusActorStats, actionId: PartyCaucusActionId): PartyCaucusCharge {
  const entry = ACTION_CATALOG[actionId];
  return {
    actionId,
    actionCost: getActionCost(
      entry,
      actor.donorBaseLevel ?? 0,
      actor.politicalInfluence ?? 0,
      actor.favorability ?? 50,
    ),
    fundCost: entry.fundCost,
    cooldownTurns: entry.cooldown,
  };
}

/** The membership/treasury/cooldown/state change an action makes on success. */
export interface PartyCaucusEffect {
  /** Player campaign-funds change on success (negative is a charge). */
  partyFundsDelta: number;
  /** Membership effect on the player's party. */
  partyMembership: "none" | "join" | "leave" | "found";
  /** Membership effect on the player's caucus. */
  caucusMembership: "none" | "create" | "join" | "leave";
  /** True when success also drops the player's current caucus. */
  clearsCaucusMembership: boolean;
  /** True when success stamps the 24-turn party-switch cooldown. */
  startsPartySwitchCooldown: boolean;
}

const PARTY_CAUCUS_EFFECTS: Record<PartyCaucusActionId, PartyCaucusEffect> = {
  // A founding creates the party and auto-joins the founder (membership.ts
  // foundParty), charging the single 100k and stamping lastPartySwitchTurn.
  foundParty: {
    partyFundsDelta: -PARTY_FOUND_FUND_COST,
    partyMembership: "found",
    caucusMembership: "none",
    clearsCaucusMembership: true,
    startsPartySwitchCooldown: true,
  },
  // Joining replaces any current membership and clears caucus membership.
  joinParty: {
    partyFundsDelta: 0,
    partyMembership: "join",
    caucusMembership: "none",
    clearsCaucusMembership: true,
    startsPartySwitchCooldown: true,
  },
  // Leaving makes the player independent and clears caucus membership. The
  // switch cooldown is intentionally NOT stamped by leave (hop prevention).
  leaveParty: {
    partyFundsDelta: 0,
    partyMembership: "leave",
    caucusMembership: "none",
    clearsCaucusMembership: true,
    startsPartySwitchCooldown: false,
  },
  // Founding a caucus charges the single 25k (caucus.ts createCaucus).
  createCaucus: {
    partyFundsDelta: -CAUCUS_CREATE_FUND_COST,
    partyMembership: "none",
    caucusMembership: "create",
    clearsCaucusMembership: false,
    startsPartySwitchCooldown: false,
  },
  joinCaucus: {
    partyFundsDelta: 0,
    partyMembership: "none",
    caucusMembership: "join",
    clearsCaucusMembership: false,
    startsPartySwitchCooldown: false,
  },
  leaveCaucus: {
    partyFundsDelta: 0,
    partyMembership: "none",
    caucusMembership: "leave",
    clearsCaucusMembership: false,
    startsPartySwitchCooldown: false,
  },
};

export function partyCaucusEffect(actionId: PartyCaucusActionId): PartyCaucusEffect {
  return PARTY_CAUCUS_EFFECTS[actionId];
}

/** Charge plus consequence, the full "what will this cost and do" quote. */
export interface PartyCaucusQuote extends PartyCaucusCharge {
  effect: PartyCaucusEffect;
}

export function quotePartyCaucusAction(actor: PartyCaucusActorStats, actionId: PartyCaucusActionId): PartyCaucusQuote {
  return { ...partyCaucusCharge(actor, actionId), effect: partyCaucusEffect(actionId) };
}

/**
 * Turns left on the party-switch cooldown (membership.ts
 * getSwitchCooldownRemaining). Exposed here so the party projections and the
 * engine share the same reading of the cooldown the join/found gates enforce.
 */
export function partySwitchCooldownRemaining(world: WorldState): number {
  return getSwitchCooldownRemaining(world.player, world.meta.turn);
}
