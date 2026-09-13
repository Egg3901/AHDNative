/**
 * FOMC nomination lifecycle — issue #119 port.
 *
 * Source: AHDGame e364c04954ed628beef73a993a8e9e156650a31e
 *   src/lib/fomcNominationLifecycle.ts (processFomcNominationLifecycle /
 *   castNppFomcVotes / installConfirmedSeat) and
 *   src/app/api/country/[code]/fomc/nominate/route.ts (the executive nominates a
 *   player or NPP politician to a specific committee seat, optionally the chair).
 *   Mirrors the cabinet nomination lifecycle (`cabinetNominationLifecycle.ts`),
 *   scoped to central-bank committee seats. Called each turn:
 *     A. NPP senators cast party-line votes on active FOMC nominations.
 *     B. Expired nominations resolve: confirmed nominees are installed into the
 *        target seat on `centralBanks.fomcBoard`; rejected ones leave it untouched.
 *
 * Reuses `nppCabinetVote` and `cabinetDidPass` from this package's already-ported
 * cabinet nomination lifecycle, so confirmation behaves exactly like a cabinet
 * confirmation (the reference's stated intent).
 *
 * Determinism: the reference's `nppCabinetVote` uses Math.random(); Native threads
 * a deterministic draw (the same hash-based sequence cabinet/nominationLifecycle.ts
 * uses) so tests are reproducible. No Date.now, no Math.random.
 *
 * Reported gaps (reference input not modelled in Native — see report):
 *  - `computeCabinetNominationTally` (seat-weighted re-tally from live elected
 *    officials) — Native's cabinet port left this a placeholder (`tallyVotes`
 *    returns 0), so resolution uses the stored votesFor/votesAgainst counters,
 *    exactly as this package's `processCabinetNominationLifecycle` does.
 *  - `createNotifications` / nomineeUserId: Native has no per-character user
 *    notification channel; confirmation/rejection is recorded on the nomination
 *    and surfaced in world.news.
 *  - technocrat NPP ids (`nomineeNppId`): Native has no `spawnTechnocratNpp`
 *    generator, so an NPP nominee may carry a caller-supplied string id or null.
 */

import type { WorldState } from "../types.js";
import { FOMC_TERM_TURNS, FOMC_VOTE_WINDOW_TURNS } from "./constants.js";
import { cabinetDidPass, nppCabinetVote, type SenateVote } from "../cabinet/nominationLifecycle.js";
import type { FomcNomination } from "./types.js";

export interface FomcNominationLifecycleResult {
  nominationsProcessed: number;
  confirmed: number;
  rejected: number;
}

/** Cast catch-up NPP senator votes on one active nomination. Source: fomcNominationLifecycle.ts castNppFomcVotes. */
function castNppFomcVotes(
  world: WorldState,
  nom: FomcNomination,
  presidentParty: string | undefined,
  nextDraw: () => number,
): void {
  const holders = world.politicians.filter(
    (p) => p.countryId === nom.countryId && p.chamberKey === "senate",
  );
  const seen = new Set<string>();
  for (const holder of holders) {
    const idStr = holder.id;
    if (seen.has(idStr)) continue;
    seen.add(idStr);
    const key = `npp_${idStr}`;
    if (nom.votes[key]) continue;
    const vote: SenateVote = nppCabinetVote(
      holder.partyId,
      nom.nomineeParty ?? undefined,
      presidentParty,
      nextDraw(),
    );
    nom.votes[key] = vote;
    if (vote === "for") nom.votesFor += 1;
    else if (vote === "against") nom.votesAgainst += 1;
    else nom.votesAbstain += 1;
  }
}

/** Install a confirmed nominee into the target seat on the bank's board. Source: fomcNominationLifecycle.ts installConfirmedSeat. */
function installConfirmedSeat(world: WorldState, nom: FomcNomination, turn: number): void {
  const bank = world.centralBanks[nom.bankId];
  if (!bank?.fomcBoard) return;

  // A fresh term is load-bearing: keeping the outgoing seat's (often already
  // expired) term made `expireSeats` replace the confirmed nominee with a
  // technocrat on the same turn, which looked like endless appointment.
  const termExpiresAtTurn = turn + FOMC_TERM_TURNS;

  bank.fomcBoard = bank.fomcBoard.map((seat) => {
    if (seat.seatId !== nom.seatId) {
      // A new chair vacates the chair flag everywhere else.
      return nom.makeChair ? { ...seat, isChair: false } : seat;
    }
    return {
      ...seat,
      occupantType: nom.occupantType,
      characterId: nom.nomineeCharacterId,
      characterName: nom.nomineeName,
      nppId: nom.occupantType === "npp" ? nom.nomineeNppId : null,
      alignment: nom.alignment,
      isChair: nom.makeChair ? true : seat.isChair,
      appointedByPresidentId: nom.proposedByPresidentId,
      appointedAtTurn: turn,
      termExpiresAtTurn,
    };
  });

  // Keep the single-chair mirror fields coherent when the chair seat changes.
  if (nom.makeChair) {
    bank.chairAlignment = nom.alignment;
    bank.chairTermExpiresAtTurn = termExpiresAtTurn;
    bank.chairAppointedBy = nom.proposedByPresidentId ?? null;
    if (nom.occupantType === "player") {
      bank.chairMode = "character";
    } else {
      bank.chairMode = "npp";
    }
  }
}

/**
 * Advance active FOMC nominations: cast NPP Senate votes then resolve expired
 * ones. Pure over WorldState. Source: fomcNominationLifecycle.ts
 * processFomcNominationLifecycle.
 */
export function processFomcNominationLifecycle(world: WorldState): FomcNominationLifecycleResult {
  const turn = world.meta.turn;
  const result: FomcNominationLifecycleResult = {
    nominationsProcessed: 0,
    confirmed: 0,
    rejected: 0,
  };

  // Deterministic draw sequence (does NOT advance world.meta.rng — mirrors
  // cabinet/nominationLifecycle.ts so save/reload determinism is preserved).
  const seed0 = world.meta.rng[0] ?? 0;
  let drawIndex = 0;
  const nextDraw = (): number => {
    const v = ((turn * 7919 + drawIndex * 5009 + seed0) % 10000) / 10000;
    drawIndex++;
    return v;
  };

  for (const nom of world.fomcNominations) {
    if (nom.status !== "active") continue;

    // A. Catch-up NPP senator votes while the voting window is open.
    if (turn < nom.votingEndsOnTurn) {
      const presidentParty = world.executives[nom.countryId]?.presidentParty ?? undefined;
      castNppFomcVotes(world, nom, presidentParty, nextDraw);
      continue;
    }

    // B. Resolve expired nominations at or past votingEndsOnTurn.
    result.nominationsProcessed++;
    const passed = cabinetDidPass(nom.votesFor, nom.votesAgainst);
    const seatLabel = nom.makeChair ? "Fed Chair" : `FOMC seat ${nom.seatId}`;

    if (passed) {
      installConfirmedSeat(world, nom, turn);
      nom.status = "confirmed";
      nom.confirmedAtTurn = turn;
      result.confirmed++;
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `${nom.nomineeName} confirmed as ${seatLabel}`,
      });
    } else {
      nom.status = "rejected";
      nom.rejectedAtTurn = turn;
      result.rejected++;
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `${nom.nomineeName} rejected for ${seatLabel}`,
      });
    }
  }

  return result;
}

export interface ProposeFomcNominationOptions {
  countryId: string;
  seatId: string;
  makeChair?: boolean;
  /** Player / NPP-politician nominee id ("player" or a politician id). */
  nomineeCharacterId?: string | null;
  /** Technocrat NPP nominee id (caller-supplied — no generator in Native). */
  nomineeNppId?: string | null;
  nomineeName: string;
  nomineeParty?: string | null;
  occupantType: "player" | "npp";
  alignment: "hawk" | "dove";
  proposedByPresidentId?: string | null;
  proposedByPresidentName?: string | null;
  /** Defaults to turn + FOMC_VOTE_WINDOW_TURNS, matching the nominate route. */
  votingEndsOnTurn?: number;
}

/**
 * Executive nomination eligibility + creation. Mirrors the nominate route's
 * checks (committee must exist, seat must exist, one active nomination per seat,
 * exactly one of nomineeCharacterId/nomineeNppId) with Native's cabinet-style
 * eligibility (nominee must be the player or a known politician). Throws on
 * ineligible. Source: fomc/nominate/route.ts.
 */
export function proposeFomcNomination(world: WorldState, opts: ProposeFomcNominationOptions): string {
  const bank = world.centralBanks[opts.countryId];
  if (!bank?.fomcBoard) throw new Error("Committee not found");
  if (!bank.fomcBoard.some((s) => s.seatId === opts.seatId)) throw new Error("Unknown seat");
  const existing = world.fomcNominations.find(
    (n) => n.bankId === opts.countryId && n.seatId === opts.seatId && n.status === "active",
  );
  if (existing) throw new Error("A nomination for this seat is already before the Senate");
  if (Boolean(opts.nomineeCharacterId) === Boolean(opts.nomineeNppId)) {
    throw new Error("Provide exactly one of nomineeCharacterId or nomineeNppId");
  }

  // Nominee eligibility (mirrors cabinet proposeCabinetNomination): the player,
  // or a known politician in the same country.
  const isPlayer = opts.nomineeCharacterId === "player";
  if (opts.nomineeCharacterId && !isPlayer) {
    const pol = world.politicians.find((p) => p.id === opts.nomineeCharacterId);
    if (!pol) throw new Error(`Nominee ${opts.nomineeCharacterId} not found`);
    if (pol.countryId !== opts.countryId) throw new Error(`Nominee not from ${opts.countryId}`);
  }

  const turn = world.meta.turn;
  const id = `fomc_nom_${opts.countryId}_${turn}_${world.fomcNominations.length + 1}`;
  const nom: FomcNomination = {
    id,
    countryId: opts.countryId,
    bankId: opts.countryId,
    seatId: opts.seatId,
    makeChair: opts.makeChair ?? false,
    nomineeCharacterId: opts.nomineeCharacterId ?? null,
    nomineeNppId: opts.nomineeNppId ?? null,
    nomineeName: opts.nomineeName,
    nomineeParty: opts.nomineeParty ?? null,
    occupantType: opts.occupantType,
    alignment: opts.alignment,
    proposedByPresidentId: opts.proposedByPresidentId ?? null,
    proposedByPresidentName: opts.proposedByPresidentName ?? null,
    status: "active",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    votes: {},
    votingEndsOnTurn: opts.votingEndsOnTurn ?? turn + FOMC_VOTE_WINDOW_TURNS,
    proposedAtTurn: turn,
  };
  world.fomcNominations.push(nom);
  return id;
}
