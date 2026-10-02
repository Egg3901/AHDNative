import {
  ACTION_CATALOG, CHARTER_DEADLINE_TURNS, FOUND_PARTY_FUND_COST,
  partySwitchCooldownRemaining, quotePartyCaucusAction,
  type PartyCaucusEffect, type WorldState,
} from "@ahdclient/engine";
import { describePartyCaucusEffect } from "./partyCaucusConsequences";
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
  /** Consequence the engine projection reports (treasury/membership/cooldown). */
  effect: PartyCaucusEffect;
  /** Consequence lines for the panel, from the same projection. */
  consequences: string[];
  action: ActionView;
}

export interface PartyManagedView {
  id: string; name: string; abbreviation: string; color: string;
  /** Authored logo URL; null until a real authored URL exists (no remote defaults offline). */
  logoUrl: string | null;
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
  merger?: PartyMergerManagementView;
}

export interface PartyMergerManagementView {
  available: boolean;
  disabledReason: string | null;
  targets: Array<{ id: string; name: string; abbreviation: string }>;
  proposals: Array<{
    id: string;
    proposerPartyName: string;
    targetPartyName: string;
    status: string;
    expiresTurn: number;
    playerSide: "proposing" | "target" | null;
    canVote: boolean;
    proposingYes: number;
    proposingNo: number;
    targetYes: number;
    targetNo: number;
  }>;
}

export function projectPartyFounding(world: WorldState): PartyFoundingStatus {
  const player = world.player;
  const entry = ACTION_CATALOG.foundParty;
  // The AP price and single 100k fund charge come from the shared party/caucus
  // projection the dispatcher charges (#61), so this quote cannot disagree with
  // what foundParty debits.
  const quote = quotePartyCaucusAction(player, "foundParty");
  const cost = quote.actionCost;
  // Gate order mirrors executeActionInner exactly: catalog cooldown, then the
  // AP gate, then the funds gate, then the domain preflight (canFoundParty's
  // party-switch cooldown). Names/uniqueness are validated per input.
  const catalogRemaining = Math.max(0, (player.actionCooldowns["foundParty"] ?? 0) - world.meta.turn);
  const switchRemaining = partySwitchCooldownRemaining(world);
  const cooldownRemaining = Math.max(catalogRemaining, switchRemaining);
  const reason = catalogRemaining > 0 ? `Available in ${catalogRemaining} ${catalogRemaining === 1 ? "turn" : "turns"}.`
    : player.actions < cost ? "Not enough action points."
    : player.funds < quote.fundCost ? `Not enough funds. Founding needs ${quote.fundCost} funds available.`
    : switchRemaining > 0 ? `Party switch cooldown: ${switchRemaining} turn(s) remaining`
    : undefined;
  const consequences = describePartyCaucusEffect(quote.effect);
  return {
    actionCost: cost,
    fundCost: quote.fundCost,
    fundsRequired: FOUND_PARTY_FUNDS_REQUIRED,
    funds: player.funds,
    actions: player.actions,
    cooldownRemaining,
    charterDeadlineTurns: CHARTER_DEADLINE_TURNS,
    available: !reason,
    ...(reason ? { disabledReason: reason } : {}),
    effect: quote.effect,
    consequences,
    action: { id: "foundParty", name: entry.name, description: entry.description,
      cost, available: !reason, consequences,
      ...(reason ? { disabledReason: reason } : {}) },
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
  const playerParty = player.partyId ? world.parties[player.partyId] : undefined;
  const canProposeMerger = !!playerParty && !playerParty.mergedIntoPartyId && (
    playerParty.chairId === "player" || playerParty.viceChairId === "player" || (playerParty.committeeIds ?? []).includes("player")
  );
  const openOwnMerger = (world.partyMergerProposals ?? []).some((proposal) => proposal.status === "open" && proposal.proposerPartyId === playerParty?.id);
  const latestPassedMerge = (world.partyMergerProposals ?? [])
    .filter((proposal) => proposal.proposerPartyId === playerParty?.id && proposal.status === "passed")
    .reduce((latest, proposal) => Math.max(latest, proposal.resolvedTurn ?? proposal.createdTurn), -Infinity);
  const mergerCooldown = Number.isFinite(latestPassedMerge) ? Math.max(0, latestPassedMerge + 96 - world.meta.turn) : 0;
  const mergerDisabledReason = !playerParty ? "Join a party first."
    : !canProposeMerger ? "Only your party chair, vice-chair, or national committee members may propose a merger."
    : openOwnMerger ? "Your party already has an open merger proposal."
    : mergerCooldown > 0 ? `Merger proposals available in ${mergerCooldown} turns.` : null;
  const parties = Object.values(world.parties)
    .filter((party) => party.countryId === country.id)
    .map((party) => ({
      id: party.id, name: party.name, abbreviation: party.abbreviation, color: party.color,
      logoUrl: party.logoUrl ?? null,
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
    merger: {
      available: !mergerDisabledReason,
      disabledReason: mergerDisabledReason,
      targets: parties.filter((party) => party.id !== playerParty?.id && !world.parties[party.id]?.mergedIntoPartyId)
        .map(({ id, name, abbreviation }) => ({ id, name, abbreviation })),
      proposals: (world.partyMergerProposals ?? [])
        .filter((proposal) => proposal.countryId === player.countryId)
        .map((proposal) => {
          const side: "proposing" | "target" | null = playerParty?.id === proposal.proposerPartyId ? "proposing"
            : playerParty?.id === proposal.targetPartyId ? "target" : null;
          const sideParty = side === "proposing" ? world.parties[proposal.proposerPartyId] : side === "target" ? world.parties[proposal.targetPartyId] : undefined;
          const canVote = !!side && !!sideParty && (sideParty.chairId === "player" || sideParty.viceChairId === "player"
            || sideParty.treasurerId === "player" || (sideParty.committeeIds ?? []).includes("player"));
          return {
            id: proposal.id,
            proposerPartyName: world.parties[proposal.proposerPartyId]?.name ?? proposal.proposerPartyId,
            targetPartyName: world.parties[proposal.targetPartyId]?.name ?? proposal.targetPartyId,
            status: proposal.status,
            expiresTurn: proposal.expiresTurn,
            playerSide: side,
            canVote: canVote && proposal.status === "open" && world.meta.turn < proposal.expiresTurn,
            proposingYes: proposal.proposingVotes.filter((vote) => vote.vote === "yes").length,
            proposingNo: proposal.proposingVotes.filter((vote) => vote.vote === "no").length,
            targetYes: proposal.targetVotes.filter((vote) => vote.vote === "yes").length,
            targetNo: proposal.targetVotes.filter((vote) => vote.vote === "no").length,
          };
        }),
    },
  };
}
