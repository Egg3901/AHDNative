/**
 * Party membership helpers.
 * Ports mainline party membership seams:
 * - src/app/api/country/[code]/parties/[id]/join/route.ts
 * - src/app/api/country/[code]/parties/[id]/leave/route.ts
 * - src/lib/parties/applyCharacterPartyJoin.ts
 * - src/lib/parties/antiAbuseGuards.ts PARTY_SWITCH_COOLDOWN_MS -> 24 turns (1 turn = 1 hour)
 * - src/lib/constants/partyActions.ts PURGE_REJOIN_COOLDOWN_TURNS = 24
 * - Charter founding: src/lib/charters/draftCharter.ts + ratifyCharter.ts (3-founder draft, 14-turn expiry)
 *   Two paths: foundParty keeps the solo immediate-ratify adaptation, while
 *   draftCharter/signCharter/rejectCharter implement the pending-founder
 *   lifecycle (player + 2 NPC co-founders, 3-of-3 ratify, rejection and
 *   expiry). Expiry of both runs in the expireCharters phase.
 */

import type { WorldState, Party, PartyCharter, CharterSignature, PurgeRejoinBlock } from "./types.js";
import { sweepCandidaciesOnPartyChange } from "./elections/candidacy.js";
import { PARTY_FOUND_ACTION_COST, PARTY_FOUND_FUND_COST } from "./actions/partyCaucusCosts.js";

export const PARTY_SWITCH_COOLDOWN_TURNS = 24; // cites PARTY_SWITCH_COOLDOWN_MS 24*60*60*1000
export const PURGE_REJOIN_COOLDOWN_TURNS = 24; // cites src/lib/constants/partyActions.ts
export const CHARTER_DEADLINE_TURNS = 14; // cites src/lib/charters/charterDeadlines.ts
/**
 * Founder slots per charter. Cites draftCharter.ts (exactly 3 unique founder
 * characterIds) and signCharter.ts (3-of-3 threshold triggers ratifyCharter).
 * SP adaptation: the slots are the player plus two same-country NPC
 * politicians (see ENGINE-ADAPTATIONS.md); the count is unchanged.
 */
export const CHARTER_REQUIRED_FOUNDERS = 3;
/** Overton bounds per platform axis. Cites overtonGuardrails.ts. */
export const PLATFORM_AXIS_MIN = -60;
export const PLATFORM_AXIS_MAX = 60;
/** Charter statuses that still reserve their proposed name/abbreviation. Cites draftCharter.ts F3. */
const LIVE_CHARTER_STATUSES: ReadonlySet<string> = new Set(["draft", "pending-signatures", "founder-replacement"]);

/** Clamp one platform axis to the Overton bounds. Cites clampPlatformAxis. */
export function clampPlatformAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(PLATFORM_AXIS_MIN, Math.min(PLATFORM_AXIS_MAX, value));
}

/** Charter axis [-60, 60] -> party position [-5, 5]. Cites ratifyCharter.ts axisToPartyPosition. */
export function charterAxisToPartyPosition(axis: number): number {
  return Math.max(-5, Math.min(5, clampPlatformAxis(axis) / 12));
}

/**
 * Name/abbreviation conflict against live parties AND in-flight charters.
 * Ports draftCharter.ts F3: two simultaneous drafts cannot race to ratify
 * the same name. Returns the conflicting record kind, or null.
 */
function liveNameConflict(
  world: WorldState,
  countryId: string,
  name: string,
  abbrUpper: string,
  ignoreCharterId?: string,
): { kind: "party" | "charter"; error: string } | null {
  const nameLower = name.trim().toLowerCase();
  for (const p of Object.values(world.parties)) {
    if (p.countryId !== countryId) continue;
    if (p.abbreviation.toUpperCase() === abbrUpper) return { kind: "party", error: `Abbreviation taken: ${abbrUpper}` };
    if (p.name.toLowerCase() === nameLower) return { kind: "party", error: `Party name taken: ${name.trim()}` };
  }
  for (const ch of world.charters) {
    if (ch.countryId !== countryId) continue;
    if (ch.id === ignoreCharterId) continue;
    if (!LIVE_CHARTER_STATUSES.has(ch.status)) continue;
    if ((ch.proposedAbbr ?? "").toUpperCase() === abbrUpper && abbrUpper !== "") {
      return { kind: "charter", error: `Abbreviation reserved by charter ${ch.id}` };
    }
    if ((ch.proposedName ?? "").toLowerCase() === nameLower && nameLower !== "") {
      return { kind: "charter", error: `Party name reserved by charter ${ch.id}` };
    }
  }
  return null;
}

/** Normalize a charter's founder roster; null when the charter predates the lifecycle. */
function charterRoster(charter: PartyCharter): { founderIds: string[]; signatures: CharterSignature[] } | null {
  if (!Array.isArray(charter.founderIds) || !Array.isArray(charter.signatures)) return null;
  return { founderIds: charter.founderIds, signatures: charter.signatures };
}

/**
 * Flip a pending charter that has passed its turn deadline to expired.
 * Mirrors the expireCharters phase inline so sign/reject fail closed even
 * when the phase has not run since the deadline passed. Returns true when
 * the charter is (now) expired.
 */
function expireCharterIfPastDeadline(world: WorldState, charter: PartyCharter): boolean {
  if (charter.status !== "draft" && charter.status !== "pending-signatures" && charter.status !== "founder-replacement") {
    return false;
  }
  const deadline =
    charter.status === "founder-replacement" ? charter.founderReplacementDeadlineTurn : charter.expiresOnTurn;
  if (deadline != null && deadline <= world.meta.turn) {
    charter.status = "expired";
    return true;
  }
  return false;
}
// Re-published from the single source of truth (#61): the action catalog and
// this helper charge the same constant, so the founding quote cannot drift from
// what foundParty actually debits.
export const FOUND_PARTY_FUND_COST = PARTY_FOUND_FUND_COST;
export const FOUND_PARTY_ACTION_COST = PARTY_FOUND_ACTION_COST;

export function isPartyMember(player: WorldState["player"]): boolean {
  return player.partyId != null;
}

export function getSwitchCooldownRemaining(player: WorldState["player"], currentTurn: number): number {
  const anchor = player.lastPartySwitchTurn;
  if (anchor == null) return 0;
  const remaining = anchor + PARTY_SWITCH_COOLDOWN_TURNS - currentTurn;
  return remaining > 0 ? remaining : 0;
}

export function getPurgeBlockRemaining(
  player: WorldState["player"],
  partyId: string,
  countryId: string,
  currentTurn: number,
): number {
  const blocks = player.purgeRejoinBlocks ?? [];
  const match = blocks.find((b) => b.partyId === partyId && b.countryId === countryId);
  if (!match) return 0;
  const rem = match.purgedAtTurn + PURGE_REJOIN_COOLDOWN_TURNS - currentTurn;
  return rem > 0 ? rem : 0;
}

export function prunePurgeRejoinBlocks(blocks: PurgeRejoinBlock[] | undefined, currentTurn: number): PurgeRejoinBlock[] {
  if (!blocks || blocks.length === 0) return [];
  return blocks.filter((b) => b.purgedAtTurn + PURGE_REJOIN_COOLDOWN_TURNS > currentTurn);
}

export type JoinResult = { ok: true } | { ok: false; error: string };

/** Supported holder cleanup from Game cleanupPartyPositionsOnSwitch. */
function vacatePlayerPartyLeadership(world: WorldState, partyId: string): void {
  const party = world.parties[partyId];
  if (party) {
    for (const role of ["chairId", "viceChairId", "treasurerId"] as const) {
      if (party[role] === "player") party[role] = null;
    }
    if (party.committeeIds?.includes("player")) {
      party.committeeIds = party.committeeIds.filter(id => id !== "player");
    }
  }
  for (const org of Object.values(world.partyRegions)) {
    if (org.partyId !== partyId) continue;
    for (const role of ["chairId", "viceChairId", "treasurerId", "campaignerId"] as const) {
      if (org[role] === "player") org[role] = null;
    }
  }
  for (const caucus of world.caucuses) {
    if (caucus.partyId !== partyId) continue;
    if (caucus.chairId === "player") caucus.chairId = null;
    if (caucus.viceChairId === "player") caucus.viceChairId = null;
  }
}

export function canJoinParty(world: WorldState, partyId: string): JoinResult {
  const player = world.player;
  const party = world.parties[partyId];
  if (!party) return { ok: false, error: `Party not found: ${partyId}` };
  if (party.countryId !== player.countryId) {
    return { ok: false, error: `Party ${partyId} belongs to ${party.countryId}, player is in ${player.countryId}` };
  }
  if (player.partyId === partyId) return { ok: false, error: `Already a member of ${partyId}` };
  const cooldown = getSwitchCooldownRemaining(player, world.meta.turn);
  if (cooldown > 0) return { ok: false, error: `Party switch cooldown: ${cooldown} turn(s) remaining` };
  const purgeRem = getPurgeBlockRemaining(player, partyId, party.countryId, world.meta.turn);
  if (purgeRem > 0) return { ok: false, error: `Purged from ${partyId}: ${purgeRem} turn(s) remaining` };
  return { ok: true };
}

export function joinParty(world: WorldState, partyId: string): JoinResult {
  const check = canJoinParty(world, partyId);
  if (!check.ok) return check;
  const player = world.player;
  const oldPartyId = player.partyId;
  // Decrement old party memberCount if leaving
  if (oldPartyId) {
    vacatePlayerPartyLeadership(world, oldPartyId);
    const old = world.parties[oldPartyId];
    if (old) old.memberCount = Math.max(0, (old.memberCount ?? 1) - 1);
    // Clear old caucus membership (same as leave)
    if (player.caucusId) {
      const oldCaucus = world.caucuses.find((c) => c.id === player.caucusId);
      if (oldCaucus) oldCaucus.memberIds = oldCaucus.memberIds.filter((id) => id !== "player");
      player.caucusId = null;
    }
  }
  // Prune expired purge blocks and clear block for this party
  player.purgeRejoinBlocks = prunePurgeRejoinBlocks(player.purgeRejoinBlocks, world.meta.turn).filter(
    (b) => !(b.partyId === partyId && b.countryId === world.parties[partyId]!.countryId),
  );
  player.partyId = partyId;
  player.partyJoinedTurn = world.meta.turn;
  player.lastPartySwitchTurn = world.meta.turn;
  player.partyInfluence = 0; // Game resets party clout, preserving state influence.
  const party = world.parties[partyId]!;
  party.memberCount = (party.memberCount ?? 0) + 1;
  // Sweep endorsements that become misaligned (primary-phase rule simplified: any cross-party endorsement while active)
  sweepEndorsementsOnPartyChange(world, player.partyId, oldPartyId);
  // W22: withdraw any active candidacy whose snapshotted partyId no longer
  // matches the player's live party (candidatePartySweep analogue).
  sweepCandidaciesOnPartyChange(world, player.partyId);
  return { ok: true };
}

export function canLeaveParty(world: WorldState): JoinResult {
  if (world.player.partyId == null) return { ok: false, error: "Not a member of any party" };
  return { ok: true };
}

export function leaveParty(world: WorldState): JoinResult {
  const check = canLeaveParty(world);
  if (!check.ok) return check;
  const player = world.player;
  const oldPartyId = player.partyId!;
  vacatePlayerPartyLeadership(world, oldPartyId);
  const party = world.parties[oldPartyId];
  if (party) party.memberCount = Math.max(0, (party.memberCount ?? 1) - 1);
  // Clear caucus membership (mirrors src/app/api/country/[code]/parties/[id]/leave/route.ts caucus cleanup)
  if (player.caucusId) {
    const caucus = world.caucuses.find((c) => c.id === player.caucusId);
    if (caucus) caucus.memberIds = caucus.memberIds.filter((id) => id !== "player");
    player.caucusId = null;
  }
  player.partyId = null;
  player.partyJoinedTurn = null;
  // lastPartySwitchTurn intentionally NOT cleared (hop escape prevention, see leave route comment)
  player.partyInfluence = 0;
  sweepEndorsementsOnPartyChange(world, null, oldPartyId);
  // W22: an independent player can no longer stand on any party ballot line.
  sweepCandidaciesOnPartyChange(world, null);
  return { ok: true };
}

export type FoundPartyInput = {
  name: string;
  abbreviation: string;
  economicPosition?: number;
  socialPosition?: number;
  color?: string;
};

export function canFoundParty(world: WorldState, input: FoundPartyInput): JoinResult {
  const player = world.player;
  if (!input.name || input.name.trim().length < 2) return { ok: false, error: "Party name too short" };
  if (!input.abbreviation || input.abbreviation.trim().length < 2) return { ok: false, error: "Abbreviation too short" };
  const abbrUpper = input.abbreviation.trim().toUpperCase();
  // Uniqueness within country against live parties AND in-flight charters
  // (mirrors draftCharter.ts F3 name/abbr taken checks).
  const conflict = liveNameConflict(world, player.countryId, input.name, abbrUpper);
  if (conflict) return { ok: false, error: conflict.error };
  const cooldown = getSwitchCooldownRemaining(player, world.meta.turn);
  if (cooldown > 0) return { ok: false, error: `Party switch cooldown: ${cooldown} turn(s) remaining` };
  if (player.funds < FOUND_PARTY_FUND_COST) return { ok: false, error: `Not enough funds. Need ${FOUND_PARTY_FUND_COST}` };
  return { ok: true };
}

/**
 * Build the party row for a founding, shared by the immediate single-founder
 * path (foundParty) and charter ratification. Party-scale positions are
 * already clamped to [-5, 5] by the caller.
 */
function buildFoundedParty(
  world: WorldState,
  opts: { name: string; abbrUpper: string; countryId: string; econ: number; social: number; color: string },
): { party: Party; partyId: string } {
  const baseId = `${opts.countryId}_${opts.abbrUpper}`;
  let partyId = baseId;
  let suffix = 1;
  while (world.parties[partyId]) {
    partyId = `${baseId}_${suffix++}`;
  }
  const party: Party = {
    id: partyId,
    name: opts.name.trim(),
    countryId: opts.countryId,
    abbreviation: opts.abbrUpper,
    color: opts.color,
    economicPosition: Math.max(-5, Math.min(5, opts.econ)),
    socialPosition: Math.max(-5, Math.min(5, opts.social)),
    treasury: 0,
    politicalStrength: 0,
    organization: 0,
    tier: "minor",
    psCapEarnedRegions: [],
    memberCount: 0,
    isDefault: false,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    leadershipElectionMethod: "party",
  };
  return { party, partyId };
}

/**
 * Move the player into a newly founded party: vacate old leadership, clear
 * old caucus membership, stamp switch anchors, prune purge blocks, and sweep
 * endorsements/candidacies. Shared by foundParty and charter ratification
 * (ratifyCharter.ts F2 moves every founder to the new party).
 */
function transferPlayerToParty(world: WorldState, partyId: string): void {
  const player = world.player;
  const oldPartyId = player.partyId;
  if (oldPartyId) {
    vacatePlayerPartyLeadership(world, oldPartyId);
    const old = world.parties[oldPartyId];
    if (old) old.memberCount = Math.max(0, (old.memberCount ?? 1) - 1);
    if (player.caucusId) {
      const oldCaucus = world.caucuses.find((c) => c.id === player.caucusId);
      if (oldCaucus) oldCaucus.memberIds = oldCaucus.memberIds.filter((id) => id !== "player");
      player.caucusId = null;
    }
  }
  player.partyId = partyId;
  player.partyJoinedTurn = world.meta.turn;
  player.lastPartySwitchTurn = world.meta.turn;
  player.partyInfluence = 0;
  player.purgeRejoinBlocks = prunePurgeRejoinBlocks(player.purgeRejoinBlocks, world.meta.turn);
  sweepEndorsementsOnPartyChange(world, partyId, oldPartyId);
  // W22: founding a new party is a party change too.
  sweepCandidaciesOnPartyChange(world, partyId);
}

export function foundParty(world: WorldState, input: FoundPartyInput): { ok: true; partyId: string } | { ok: false; error: string } {
  const check = canFoundParty(world, input);
  if (!check.ok) return check as { ok: false; error: string };
  const player = world.player;
  const abbrUpper = input.abbreviation.trim().toUpperCase();
  const { party, partyId } = buildFoundedParty(world, {
    name: input.name,
    abbrUpper,
    countryId: player.countryId,
    econ: input.economicPosition ?? 0,
    social: input.socialPosition ?? 0,
    color: input.color ?? "#888888",
  });
  world.parties[partyId] = party;
  // Charter machinery (W18): create a ratified charter marking this founding.
  // The immediate path keeps the SP adaptation (single-founder instant
  // ratify); the roster carries the proposal so the charter list stays
  // uniform with drafted charters.
  const charter: PartyCharter = {
    id: `charter-${partyId}-${world.meta.turn}`,
    countryId: player.countryId,
    partyId,
    founderId: "player",
    foundedAtTurn: world.meta.turn,
    status: "ratified",
    expiresOnTurn: null,
    expiresAt: null,
    founderReplacementDeadlineTurn: null,
    founderReplacementDeadline: null,
    proposedName: party.name,
    proposedAbbr: abbrUpper,
    founderIds: ["player"],
    signatures: [{ founderId: "player", signedAtTurn: world.meta.turn }],
    platform: { economic: 0, social: 0 },
    createdAtTurn: world.meta.turn,
    ratifiedAtTurn: world.meta.turn,
  };
  world.charters.push(charter);
  // Deduct funds (the single charge; see partyCaucusCosts.ts)
  player.funds -= FOUND_PARTY_FUND_COST;
  // Auto-join founder (mirrors ratifyCharter joining founders)
  transferPlayerToParty(world, partyId);
  party.memberCount = 1;
  return { ok: true, partyId };
}

export type DraftCharterInput = {
  name: string;
  abbreviation: string;
  /**
   * Exactly two co-founder politician ids. The player is always slot 0
   * (proposer, auto-signed), so the roster is ["player", ...coFounderIds].
   * SP adaptation: the reference requires 3 unique human founder characters
   * (draftCharter.ts); offline the co-slots are same-country NPC politicians.
   */
  coFounderIds: string[];
  /** Platform axes on the reference [-60, +60] scale; clamped at draft. */
  economicAxis?: number;
  socialAxis?: number;
};

export type CharterResult = { ok: true; charterId: string } | { ok: false; error: string };

export type SignCharterResult =
  | { ok: true; ratified: boolean; signedCount: number; requiredCount: number; partyId?: string }
  | { ok: false; error: string };

export type RejectCharterResult =
  | { ok: true; status: "founder-replacement" }
  | { ok: false; error: string };

/**
 * Validate co-founder slots: exactly two, unique, not the player, each a
 * same-country politician. Ports the founder-identity checks of
 * draftCharter.ts (founders-not-3, founders-not-unique, founder-not-found,
 * founder-wrong-country). Human-ownership, home-state adjacency, and the
 * founding-cohort picks have no offline counterpart and are recorded as
 * explicit SP adaptations in ENGINE-ADAPTATIONS.md.
 */
function validateCoFounders(world: WorldState, coFounderIds: string[]): JoinResult {
  if (!Array.isArray(coFounderIds) || coFounderIds.length !== CHARTER_REQUIRED_FOUNDERS - 1) {
    return { ok: false, error: `Need exactly ${CHARTER_REQUIRED_FOUNDERS - 1} co-founders` };
  }
  const seen = new Set<string>();
  for (const id of coFounderIds) {
    if (id === "player") return { ok: false, error: "Player is already the proposing founder" };
    if (seen.has(id)) return { ok: false, error: `Duplicate co-founder: ${id}` };
    seen.add(id);
  }
  for (const id of coFounderIds) {
    const pol = world.politicians.find((p) => p.id === id);
    if (!pol) return { ok: false, error: `Co-founder not found: ${id}` };
    if (pol.countryId !== world.player.countryId) {
      return { ok: false, error: `Co-founder wrong country: ${id}` };
    }
  }
  return { ok: true };
}

export function canDraftCharter(world: WorldState, input: DraftCharterInput): JoinResult {
  const player = world.player;
  if (!input.name || input.name.trim().length < 2) return { ok: false, error: "Party name too short" };
  if (!input.abbreviation || input.abbreviation.trim().length < 2) return { ok: false, error: "Abbreviation too short" };
  const abbrUpper = input.abbreviation.trim().toUpperCase();
  const conflict = liveNameConflict(world, player.countryId, input.name, abbrUpper);
  if (conflict) return { ok: false, error: conflict.error };
  const coFounders = validateCoFounders(world, input.coFounderIds);
  if (!coFounders.ok) return coFounders;
  const cooldown = getSwitchCooldownRemaining(player, world.meta.turn);
  if (cooldown > 0) return { ok: false, error: `Party switch cooldown: ${cooldown} turn(s) remaining` };
  if (player.funds < FOUND_PARTY_FUND_COST) return { ok: false, error: `Not enough funds. Need ${FOUND_PARTY_FUND_COST}` };
  return { ok: true };
}

/**
 * Draft a charter: the player proposes with two NPC co-founders, auto-signs
 * slot 0 (ports draftCharter.ts proposer auto-sign), and pays the single
 * founding charge here so ratification later charges nothing. The charter
 * starts `pending-signatures` with a 14-turn expiry (CHARTER_DEADLINE_TURNS).
 */
export function draftCharter(world: WorldState, input: DraftCharterInput): CharterResult {
  const check = canDraftCharter(world, input);
  if (!check.ok) return check as { ok: false; error: string };
  const player = world.player;
  const abbrUpper = input.abbreviation.trim().toUpperCase();
  const baseId = `charter-draft-${player.countryId}-${abbrUpper}-${world.meta.turn}`;
  let charterId = baseId;
  let suffix = 1;
  while (world.charters.some((c) => c.id === charterId)) {
    charterId = `${baseId}_${suffix++}`;
  }
  const founderIds = ["player", ...input.coFounderIds];
  const charter: PartyCharter = {
    id: charterId,
    countryId: player.countryId,
    partyId: null,
    founderId: "player",
    foundedAtTurn: world.meta.turn,
    status: "pending-signatures",
    expiresOnTurn: world.meta.turn + CHARTER_DEADLINE_TURNS,
    expiresAt: null,
    founderReplacementDeadlineTurn: null,
    founderReplacementDeadline: null,
    proposedName: input.name.trim(),
    proposedAbbr: abbrUpper,
    founderIds,
    signatures: founderIds.map((founderId) => ({
      founderId,
      signedAtTurn: founderId === "player" ? world.meta.turn : null,
    })),
    platform: {
      economic: clampPlatformAxis(input.economicAxis ?? 0),
      social: clampPlatformAxis(input.socialAxis ?? 0),
    },
    createdAtTurn: world.meta.turn,
    ratifiedAtTurn: null,
  };
  world.charters.push(charter);
  // Single-charge accounting: the draft pays the founding charge; ratify pays nothing.
  player.funds -= FOUND_PARTY_FUND_COST;
  return { ok: true, charterId };
}

/**
 * Ratify a fully-signed draft: spawn the party from the proposed
 * name/abbreviation and clamped platform (axes converted via
 * axisToPartyPosition), clear deadlines, and move every founder into the new
 * party. Ports ratifyCharter.ts (atomic claim, deadline clearing, F2 founder
 * join, #289 anchor-founder chair). No fund charge: the draft already paid.
 * Fails closed when the name is no longer free, leaving the charter pending.
 */
function ratifyDraftCharter(world: WorldState, charter: PartyCharter): { ok: true; partyId: string } | { ok: false; error: string } {
  const roster = charterRoster(charter);
  const name = charter.proposedName ?? "";
  const abbr = (charter.proposedAbbr ?? "").toUpperCase();
  if (!roster || name.trim().length < 2 || abbr.length < 2) {
    return { ok: false, error: `Charter ${charter.id} has no ratifiable proposal` };
  }
  const conflict = liveNameConflict(world, charter.countryId, name, abbr, charter.id);
  if (conflict) return { ok: false, error: conflict.error };
  const econ = charterAxisToPartyPosition(charter.platform?.economic ?? 0);
  const social = charterAxisToPartyPosition(charter.platform?.social ?? 0);
  const { party, partyId } = buildFoundedParty(world, {
    name,
    abbrUpper: abbr,
    countryId: charter.countryId,
    econ,
    social,
    // Neutral indigo until the chair customizes. Cites ratifyCharter.ts.
    color: "#4f46e5",
  });
  // #289: the proposing founder is seated as first chair so the party is not
  // headless at birth; vice-chair and treasurer start vacant.
  party.chairId = "player";
  world.parties[partyId] = party;
  charter.partyId = partyId;
  charter.status = "ratified";
  charter.ratifiedAtTurn = world.meta.turn;
  charter.expiresOnTurn = null;
  charter.expiresAt = null;
  charter.founderReplacementDeadlineTurn = null;
  charter.founderReplacementDeadline = null;
  // F2: every founder joins the new party. The player move carries the full
  // switch semantics (cooldown stamp, endorsement/candidacy sweeps); NPC
  // co-founders switch partyId with their old counts decremented (the
  // reconcile phase re-derives counts next turn).
  for (const founderId of roster.founderIds) {
    if (founderId === "player") {
      transferPlayerToParty(world, partyId);
      continue;
    }
    const pol = world.politicians.find((p) => p.id === founderId);
    if (!pol) continue;
    const old = world.parties[pol.partyId];
    if (old) old.memberCount = Math.max(0, (old.memberCount ?? 1) - 1);
    pol.partyId = partyId;
  }
  party.memberCount = roster.founderIds.length;
  return { ok: true, partyId };
}

/**
 * Record one founder's signature. Ports signCharter.ts: non-founders are
 * rejected, a rejected slot cannot sign, a repeat signature is an idempotent
 * no-op, and the 3-of-3 threshold ratifies inline. Signing a non-pending
 * charter (ratified, rejected, expired, founder-replacement) fails closed.
 */
export function signCharter(world: WorldState, charterId: string, signerId: string): SignCharterResult {
  const charter = world.charters.find((c) => c.id === charterId);
  if (!charter) return { ok: false, error: `Charter not found: ${charterId}` };
  if (expireCharterIfPastDeadline(world, charter)) {
    return { ok: false, error: `Charter expired: ${charterId}` };
  }
  if (charter.status !== "pending-signatures") {
    return { ok: false, error: `Charter is not signable: ${charterId}` };
  }
  const roster = charterRoster(charter);
  if (!roster || !roster.founderIds.includes(signerId)) {
    return { ok: false, error: `Not a founder of ${charterId}: ${signerId}` };
  }
  const slot = roster.signatures.find((s) => s.founderId === signerId)!;
  if (slot.rejectedAtTurn != null) {
    return { ok: false, error: `Founder already rejected ${charterId}: ${signerId}` };
  }
  if (slot.signedAtTurn == null) {
    slot.signedAtTurn = world.meta.turn;
  }
  const signedCount = roster.signatures.filter((s) => s.signedAtTurn != null).length;
  const requiredCount = roster.founderIds.length;
  if (signedCount < requiredCount) {
    return { ok: true, ratified: false, signedCount, requiredCount };
  }
  const ratified = ratifyDraftCharter(world, charter);
  if (!ratified.ok) {
    // Fail closed: the name was claimed after drafting. The signatures stand
    // and the charter stays pending; the proposer can reject/cancel it.
    return { ok: false, error: (ratified as { ok: false; error: string }).error };
  }
  return { ok: true, ratified: true, signedCount, requiredCount, partyId: (ratified as { ok: true; partyId: string }).partyId };
}

/**
 * Record one founder's rejection. Ports rejectCharter.ts: the charter enters
 * `founder-replacement` with a fresh 14-turn deadline (the replacement
 * invitation flow itself is a follow-up; expiry of the window already runs
 * in the expireCharters phase). A founder that already signed cannot reject.
 */
export function rejectCharter(
  world: WorldState,
  charterId: string,
  rejecterId: string,
  reason?: string,
): RejectCharterResult {
  const charter = world.charters.find((c) => c.id === charterId);
  if (!charter) return { ok: false, error: `Charter not found: ${charterId}` };
  if (expireCharterIfPastDeadline(world, charter)) {
    return { ok: false, error: `Charter expired: ${charterId}` };
  }
  if (charter.status !== "pending-signatures") {
    return { ok: false, error: `Charter is not rejectable: ${charterId}` };
  }
  const roster = charterRoster(charter);
  if (!roster || !roster.founderIds.includes(rejecterId)) {
    return { ok: false, error: `Not a founder of ${charterId}: ${rejecterId}` };
  }
  const slot = roster.signatures.find((s) => s.founderId === rejecterId)!;
  if (slot.signedAtTurn != null) {
    return { ok: false, error: `Founder already signed ${charterId}: ${rejecterId}` };
  }
  slot.rejectedAtTurn = world.meta.turn;
  if (reason !== undefined) slot.rejectionReason = reason;
  charter.status = "founder-replacement";
  charter.founderReplacementDeadlineTurn = world.meta.turn + CHARTER_DEADLINE_TURNS;
  charter.founderReplacementDeadline = null;
  return { ok: true, status: "founder-replacement" };
}

// Sweep misaligned endorsements on party change.
// Simplified primary-phase rule: if endorser is player and endorsement active,
// and endorsed party/politician's party differs from endorser's new party,
// withdraw it. Mirrors withdrawPlayerEndorsementsOnPartyChange for solo.
function sweepEndorsementsOnPartyChange(world: WorldState, newPartyId: string | null, oldPartyId: string | null): void {
  if (oldPartyId === newPartyId) return;
  for (const e of world.endorsements) {
    if (!e.active) continue;
    if (e.endorserId !== "player") continue;
    // If newParty null (independent), all party-aligned endorsements become misaligned if they were party-specific
    // We withdraw if endorsedPartyId != newPartyId
    if (e.endorsedPartyId == null) continue;
    if (e.endorsedPartyId !== newPartyId) {
      // Reverse support bump if politician endorsement
      if (e.endorsedType === "politician" && e.supportBump) {
        const cs = world.candidateSupports[e.endorsedId];
        if (cs) cs.support = Math.max(0, Math.min(100, cs.support - e.supportBump));
      }
      e.active = false;
    }
  }
}

export function sweepPartyMismatchedEndorsements(world: WorldState): number {
  let withdrawn = 0;
  const playerParty = world.player.partyId;
  for (const e of world.endorsements) {
    if (!e.active) continue;
    if (e.endorserId !== "player") continue;
    if (e.endorsedPartyId == null) continue;
    if (e.endorsedPartyId !== playerParty) {
      if (e.endorsedType === "politician" && e.supportBump) {
        const cs = world.candidateSupports[e.endorsedId];
        if (cs) cs.support = Math.max(0, Math.min(100, cs.support - e.supportBump));
      }
      e.active = false;
      withdrawn++;
    }
  }
  return withdrawn;
}
