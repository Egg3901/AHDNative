import {
  ACTION_CATALOG, CHARTER_DEADLINE_TURNS, FOUND_PARTY_FUND_COST,
  getActionCost, getSwitchCooldownRemaining,
  type WorldState,
} from "@ahdclient/engine";
import type { ActionView } from "./types";

/**
 * Party founding and charter projection. Display hints mirror the pinned
 * engine; executeAction remains authoritative.
 *
 * The public foundParty action accepts a name and an abbreviation only.
 * Platform and color are not settable through it; founded parties start at
 * neutral positions. See docs/PARTY-MANAGEMENT.md for the blocked boundary.
 */

/**
 * Accounting note (fixed in this branch). executeAction preflights
 * Membership.canFoundParty before any shared mutation and skips the common
 * catalog fund deduction for foundParty, so Membership.foundParty applies
 * the sole 100k charge. Entry needs 100k available, net on success is one
 * 100k charge. See docs/PARTY-MANAGEMENT.md.
 */
export const FOUND_PARTY_FUNDS_REQUIRED = FOUND_PARTY_FUND_COST;

export interface PartyFoundingStatus {
  actionCost: number;
  fundCost: number;
  fundsRequired: number;
  funds: number;
  actions: number;
  cooldownRemaining: number;
  charterDeadlineTurns: number;
  available: boolean;
  disabledReason?: string;
  action: ActionView;
}

export interface PartyManagedView {
  id: string; name: string; abbreviation: string; color: string;
  members: number; treasury: number; isPlayerParty: boolean;
  economicPosition: number; socialPosition: number;
  tier: string; founded: boolean;
}

export interface PartyCharterView {
  id: string; partyName: string | null; status: string; expiresOnTurn: number | null;
}

export interface PartyManagementView {
  countryId: string; countryName: string; currency: string;
  playerPartyName: string | null;
  partyCount: number; foundedCount: number;
  charterDeadlineTurns: number;
  founding: PartyFoundingStatus;
  parties: PartyManagedView[];
  charters: PartyCharterView[];
}

function foundingCost(world: WorldState): number {
  const player = world.player;
  return getActionCost(ACTION_CATALOG.foundParty, player.donorBaseLevel, player.politicalInfluence, player.favorability);
}

export function projectPartyFounding(world: WorldState): PartyFoundingStatus {
  const player = world.player;
  const entry = ACTION_CATALOG.foundParty;
  const cost = foundingCost(world);
  // Both gates block founding: the catalog action cooldown (currently zero,
  // read live so a nonzero future value applies) and the party switch
  // cooldown stamped by joins, leaves and foundings.
  const catalogRemaining = Math.max(0, (player.actionCooldowns["foundParty"] ?? 0) - world.meta.turn);
  const switchRemaining = getSwitchCooldownRemaining(player, world.meta.turn);
  const cooldownRemaining = Math.max(catalogRemaining, switchRemaining);
  const reason = cooldownRemaining > 0 ? `Party switch cooldown: ${cooldownRemaining} turn(s) remaining`
    : player.funds < FOUND_PARTY_FUNDS_REQUIRED ? `Not enough funds. Founding needs ${FOUND_PARTY_FUNDS_REQUIRED} funds available.`
    : player.actions < cost ? "Not enough action points."
    : undefined;
  return {
    actionCost: cost,
    fundCost: FOUND_PARTY_FUND_COST,
    fundsRequired: FOUND_PARTY_FUNDS_REQUIRED,
    funds: player.funds,
    actions: player.actions,
    cooldownRemaining,
    charterDeadlineTurns: CHARTER_DEADLINE_TURNS,
    available: !reason,
    ...(reason ? { disabledReason: reason } : {}),
    action: { id: "foundParty", name: entry.name, description: entry.description,
      cost, available: !reason, ...(reason ? { disabledReason: reason } : {}) },
  };
}

/**
 * Per-input validation. Name rules mirror Membership.canFoundParty
 * (membership.ts: name/abbr length, country-scoped uniqueness); funds, AP
 * and cooldown come from projectPartyFounding so the verdict matches what
 * executeAction accepts. executeAction stays authoritative.
 */
export function validatePartyFounding(world: WorldState, name: string, abbreviation: string): { ok: true } | { ok: false; error: string } {
  const cleanName = name.trim();
  const cleanAbbr = abbreviation.trim().toUpperCase();
  if (cleanName.length < 2) return { ok: false, error: "Party name too short" };
  if (cleanAbbr.length < 2) return { ok: false, error: "Abbreviation too short" };
  for (const party of Object.values(world.parties)) {
    if (party.countryId !== world.player.countryId) continue;
    if (party.name.toLowerCase() === cleanName.toLowerCase()) return { ok: false, error: `Party name taken: ${cleanName}` };
    if (party.abbreviation.toUpperCase() === cleanAbbr) return { ok: false, error: `Abbreviation taken: ${cleanAbbr}` };
  }
  const base = projectPartyFounding(world);
  if (!base.available) return { ok: false, error: base.disabledReason ?? "Unavailable" };
  return { ok: true };
}

export function projectPartyCharters(world: WorldState): PartyCharterView[] {
  const countryId = world.player.countryId;
  return world.charters
    .filter((charter) => charter.countryId === countryId)
    .map((charter) => ({
      id: charter.id,
      partyName: charter.partyId ? (world.parties[charter.partyId]?.name ?? null) : null,
      status: charter.status,
      expiresOnTurn: charter.expiresOnTurn,
    }));
}

export function projectPartyManagement(world: WorldState): PartyManagementView {
  const country = world.countries[world.player.countryId];
  if (!country || !country.playable) throw new Error("The save does not contain the player's playable country.");
  const player = world.player;
  const parties = Object.values(world.parties)
    .filter((party) => party.countryId === country.id)
    .map((party) => ({
      id: party.id, name: party.name, abbreviation: party.abbreviation, color: party.color,
      members: party.memberCount, treasury: party.treasury, isPlayerParty: player.partyId === party.id,
      economicPosition: party.economicPosition, socialPosition: party.socialPosition,
      tier: party.tier, founded: !party.isDefault,
    }))
    .sort((a, b) => Number(b.isPlayerParty) - Number(a.isPlayerParty) || b.members - a.members);
  return {
    countryId: country.id, countryName: country.name,
    currency: world.budgets[country.id]?.currencyCode ?? world.exchangeRates[country.id]?.currencyCode ?? "XXX",
    playerPartyName: player.partyId ? (world.parties[player.partyId]?.name ?? null) : null,
    partyCount: parties.length,
    foundedCount: parties.filter((p) => p.founded).length,
    charterDeadlineTurns: CHARTER_DEADLINE_TURNS,
    founding: projectPartyFounding(world),
    parties,
    charters: projectPartyCharters(world),
  };
}
