import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";
import { findBlockingActiveCandidacy } from "../electionEngine/resolution/activeCandidacy.js";
import { ensureCampaign, archiveCampaign } from "../campaigns/lifecycle.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";

export interface CandidacyResult {
  ok: boolean;
  error?: string;
}

/**
 * Nationwide directly-elected executive races carry no `state` and are exempt
 * from the home-state/constituency gate. Mirrors the reference
 * `isNationwideDirectExecutiveElection(...)` guard in
 * src/app/api/elections/[id]/enter/route.ts:109-119,211 (US president, IE
 * uachtarán are the two nationwide direct executive types sole ships).
 */
const NATIONWIDE_EXECUTIVE = new Set(["president", "uachtaran"]);

/** Human-readable race label used by the actionable per-prerequisite errors. */
function describeRace(rec: ElectionRecord): string {
  return `the ${rec.state ? `${rec.state} ` : ""}${rec.electionType} race`;
}

/**
 * Player candidacy (W21c). Mainline reference: the national candidacy command
 * `POST /api/elections/[id]/enter`
 * (AHDGame src/app/api/elections/[id]/enter/route.ts) and its withdrawal
 * counterpart `POST /api/elections/[id]/withdraw` (same tree).
 *
 * Reference -> Native gate mapping (#99 "Align player candidacy fees and
 * eligibility"), evidence line numbers from AHDGame e364c049:
 *
 *   gate                          | enter route.ts | withdraw route.ts | Native
 *   ------------------------------|----------------|-------------------|-------
 *   status open (upcoming/active) | L78            | L67-95            | reject "resolved"
 *   filing window (turn >= end)   | L100-128       | n/a               | meta.turn >= primaryEndTurn
 *   country match                 | L135-158       | n/a               | rec.countryId === player.countryId
 *   party ballot line             | L163-200       | n/a               | player.partyId required
 *   home-state / constituency     | L211-217       | n/a               | player.homeRegionId === rec.state
 *   duplicate in-race candidacy   | L245-272       | L80-89            | rec.candidates has "player"
 *   blocking candidacy elsewhere  | L276-287       | n/a               | findBlockingActiveCandidacy
 *
 * FILING FEE: the reference charges NONE. A case-insensitive scan of both
 * routes for fee/funds/cost/balance/deduct/debit matches nothing; the enter
 * route's only write is `electionCandidates.insertOne` (L328) and the withdraw
 * route's writes are the status flip + tally cleanup. The issue's "zero-cost
 * PORT-STUB filing fee" is therefore NOT a gap — Native's `fundCost: 0` in
 * actions/catalog.ts already mirrors the reference. Native additionally charges
 * its own action-economy AP (baseCost) as every solo action does; that is not
 * a reference filing fee. Independent candidacies remain a later port (see
 * PORT-STUB note in withdrawCandidacy).
 *
 * Declaration is atomic: it either appends exactly one candidate row (plus an
 * optional campaign) or mutates nothing, so the AP/fund pre-charge in
 * actions/execute.ts can safely refund on any rejection.
 */
export function declareCandidacy(world: WorldState, electionId: string): CandidacyResult {
  const rec = world.elections.find((e) => e.id === electionId);
  if (!rec) return { ok: false, error: "Unknown election" };
  if (rec.status === "resolved") return { ok: false, error: "This election has ended." };
  if (world.meta.turn >= rec.primaryEndTurn) {
    return {
      ok: false,
      error: `The filing window for ${describeRace(rec)} closed at the end of turn ${rec.primaryEndTurn}.`,
    };
  }
  if (rec.countryId !== world.player.countryId) {
    return {
      ok: false,
      error: `${describeRace(rec)} is a ${rec.countryId} race; you can only file in your own country (${world.player.countryId}).`,
    };
  }
  const partyId = world.player.partyId;
  if (!partyId) return { ok: false, error: "Join a party before filing — candidacy needs a party ballot line." };
  const home = world.player.homeRegionId;
  if (!NATIONWIDE_EXECUTIVE.has(rec.electionType) && rec.state && home && home !== rec.state) {
    return {
      ok: false,
      error: `You can only run for office in your home state (${home}); ${describeRace(rec)} is outside your constituency.`,
    };
  }
  const selectedConstituency = world.player.constituency;
  if (
    rec.countryId === "UK" && rec.constituencyId && selectedConstituency
    && rec.constituencyId !== selectedConstituency.id
  ) {
    return {
      ok: false,
      error: `Your selected constituency is ${selectedConstituency.name}; choose its Commons race before filing.`,
    };
  }
  if (rec.candidates.some((c) => c.id === "player")) {
    return { ok: false, error: `You are already a candidate in ${describeRace(rec)}.` };
  }

  const candidateRows = world.elections
    .filter((e) => e.candidates.some((c) => c.id === "player"))
    .map((e) => ({ _id: `player:${e.id}`, electionId: e.id, characterId: "player", status: "active" as const }));
  const electionRows = world.elections.map((e) => ({ _id: e.id, status: e.status, countryId: e.countryId }));
  const blocking = findBlockingActiveCandidacy(candidateRows, electionRows, "player", rec.id);
  if (blocking) {
    const conflict = world.elections.find((e) => e.id === blocking.election._id);
    return {
      ok: false,
      error: `You are already running in ${conflict ? describeRace(conflict) : `election ${blocking.election._id}`}; withdraw before filing for another race.`,
    };
  }

  rec.candidates.push({
    id: "player",
    name: world.player.name,
    partyId,
    isNPP: false,
    incumbent:
      world.player.legislativeSeat != null &&
      world.player.legislativeSeat.chamberKey === rec.chamberKey &&
      world.player.legislativeSeat.countryId === rec.countryId,
  });
  world.news.push({
    id: `candidacy:${rec.id}:${world.meta.turn}`,
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `You declare for the ${rec.state ? `${rec.state} ` : ""}${rec.electionType} race`,
    category: "Election",
    countryId: rec.countryId,
    partyId: world.player.partyId ?? undefined,
    electionId: rec.id,
  });
  // W26: create the player's campaign (no-op for non-eligible races).
  if (isCampaignEligibleElection(rec)) {
    ensureCampaign(world, {
      electionId: rec.id,
      candidateId: "player",
      candidateIsNPP: false,
      partyId,
      countryId: rec.countryId,
      electionType: rec.electionType,
      turn: world.meta.turn,
    });
  }
  return { ok: true };
}

/**
 * Shared removal: strip the player's candidacy row, tally entry, frozen
 * per-state EC totals, and campaign. Factored out of withdrawCandidacy so
 * sweepCandidaciesOnPartyChange (W22) can reuse the exact same cleanup.
 */
function removePlayerCandidacy(world: WorldState, rec: ElectionRecord): void {
  const idx = rec.candidates.findIndex((c) => c.id === "player");
  if (idx < 0) return;
  rec.candidates.splice(idx, 1);
  delete rec.tally["player"];
  // W24b: also purge the player's frozen per-state EC entries — without one
  // more accumulation turn to naturally drop them (accumulateVoteTurn only
  // carries forward candidates still in `rec.candidates`), a withdrawal on
  // the final pre-resolution turn would otherwise leave a stale winning
  // per-state tally on the board for a candidate no longer in the race.
  if (rec.stateTallyStates) {
    for (const state of Object.values(rec.stateTallyStates) as Array<{ totalVotes?: Record<string, number> }>) {
      if (state?.totalVotes) delete state.totalVotes["player"];
    }
  }
  archiveCampaign(world, rec.id, "player");
}

/**
 * Withdraw the player's active candidacy. Reference
 * `POST /api/elections/[id]/withdraw` blocks only completed/resolved/cancelled
 * elections (route.ts L67-95) and requires an active candidacy; Native has no
 * separate candidate-status field (see removePlayerCandidacy) so "resolved" is
 * the sole terminal block. No fee, matching the reference.
 *
 * PORT-STUB: the reference pairs withdrawal with a party-leadership re-enter
 * path (state party elections); the national path here is the only player
 * candidacy surface wired today.
 */
export function withdrawCandidacy(world: WorldState, electionId: string): CandidacyResult {
  const rec = world.elections.find((e) => e.id === electionId);
  if (!rec) return { ok: false, error: "Unknown election" };
  if (rec.status === "resolved") {
    return { ok: false, error: "This election has ended; you can no longer withdraw." };
  }
  if (!rec.candidates.some((c) => c.id === "player")) {
    return { ok: false, error: `You are not entered in ${describeRace(rec)}.` };
  }
  removePlayerCandidacy(world, rec);
  return { ok: true };
}

/**
 * W22 leftover: candidate-party mismatch sweep. Ports mainline's
 * `sweepPartyMismatchedCandidates` (src/lib/utils/electionCandidacy.ts:450-556),
 * live every turn via the `candidatePartySweep` turn phase
 * (turnPhaseRegistry.ts:1041-1047, right after `withdrawInactiveCandidates`):
 * "withdraw any active election candidate whose current party no longer
 * matches the party on their candidacy record."
 *
 * Solo's only producer of a mid-campaign party change is the player
 * (joinParty/leaveParty/foundParty in membership.ts — NPC politicians never
 * change party after creation; there is no NPC-facing switch action, so
 * mainline's character-defection half of this sweep has nothing to trigger
 * it here). Rather than an unconditional per-turn scan, this is called
 * directly at those three call sites (mirrors the existing
 * `sweepEndorsementsOnPartyChange` idiom in membership.ts) — the resulting
 * world state is identical to a per-turn scan (every unresolved election is
 * already re-checked the instant the mismatch is created) without an extra
 * O(elections) pass every turn.
 */
export function sweepCandidaciesOnPartyChange(world: WorldState, newPartyId: string | null): void {
  for (const rec of world.elections) {
    if (rec.status === "resolved") continue;
    const cand = rec.candidates.find((c) => c.id === "player");
    if (cand && cand.partyId !== newPartyId) {
      removePlayerCandidacy(world, rec);
    }
  }
}

/**
 * W22 leftover assessment: the two remaining mainline candidate-lifecycle
 * phases from the roadmap list (docs/ROADMAP-1.0.md W22) are N/A for solo,
 * not merely unported — recorded here so a future reader does not re-open
 * them as a gap:
 *
 * - `withdrawInactiveCandidates` (src/lib/turn/withdrawInactiveCandidates.ts)
 *   withdraws the active candidacies of players inactive >96 turns, keyed
 *   off `activeUserIds` (other users' last-seen timestamps). This exists,
 *   per its own file doc, because other human players exist — the exact
 *   "N/A for singleplayer" reasoning ROADMAP-1.0.md already applies to
 *   activityLogging/altDetection/etc. Solo has exactly one human player and
 *   no user-activity table; there is nothing for this phase to query.
 * - `staleCandidateCleanup` (`cleanupStaleElectionCandidates`,
 *   src/lib/turn/perpetualElections.ts:929-949) is mainline's own file doc:
 *   "Safety net for pre-existing data and edge cases in the normal
 *   resolution path" — it withdraws any `electionCandidates` row still
 *   `status: "active"` on an election whose status has already flipped to
 *   "completed", a state that can only arise there because mainline writes
 *   election status and candidacy status as separate documents/collections
 *   that can desync. Solo's `ElectionRecord.candidates` carries no per-
 *   candidate status field at all (see elections/types.ts) — `applyResolution`
 *   (orchestration.ts) mutates `rec.status` to "resolved" and prunes/seats
 *   candidates in the same synchronous pass, and every reader that matters
 *   (`runVoteAccumulation`, `fillCandidates`) already gates on
 *   `rec.status === "active"`. The desync class mainline's safety net
 *   guards against cannot occur here by construction, so there is no
 *   `world.elections`-shaped bug for a port of this phase to fix.
 *
 * UPDATE (batch merge, W40 fallout): the desync argument above still holds,
 * but staleCandidateCleanup's POPULATION effect (dropping generated
 * candidates who hold nothing) turned out to be load-bearing once W40's
 * subnational chambers multiplied races: ex-holders displaced by a later race
 * they were not candidates in were never culled (3.8k orphans at t700). That
 * effect is now ported as `cullOrphanedGenerated` (orchestration.ts), run at
 * every resolution. Only `withdrawInactiveCandidates` remains N/A.
 */
