/**
 * National party leadership elections.
 * Ports src/lib/nationalPartyElections.ts createMissing + processCompleted.
 */

import type { WorldState, Politician } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { NationalPartyElectionRecord } from "./types.js";
import {
  NATIONAL_PARTY_ELECTION_DURATION_TURNS,
  FOUNDING_CHAIR_ELECTION_DURATION_TURNS,
  NATIONAL_PARTY_POSITIONS,
} from "./constants.js";
import { isPlayerNationalLeadershipVoter } from "./leadershipTenure.js";
import { syncCoalitionChairsForParty } from "./coalitions.js";

function electionId(countryId: string, partyId: string, position: string, cycle: number): string {
  return `${countryId}:${partyId}:${position}:c${cycle}`;
}

export function createMissingNationalPartyElections(world: WorldState, _rng: WorldRng): number {
  const turn = world.meta.turn;
  const parties = Object.values(world.parties);
  const activeKeys = new Set(
    world.nationalPartyElections.filter((e) => e.status === "voting").map((e) => `${e.countryId}:${e.partyId}:${e.position}`),
  );
  let created = 0;
  for (const party of parties) {
    const customDuration = party.customElectionDurationTurns ?? NATIONAL_PARTY_ELECTION_DURATION_TURNS;
    for (const position of NATIONAL_PARTY_POSITIONS) {
      const key = `${party.countryId}:${party.id}:${position}`;
      if (activeKeys.has(key)) continue;
      const existingMax = Math.max(
        0,
        ...world.nationalPartyElections
          .filter((e) => e.partyId === party.id && e.countryId === party.countryId && e.position === position)
          .map((e) => e.cycle),
      );
      const cycle = existingMax + 1;
      const isFounding = existingMax === 0
        && position === "chair"
        && world.charters.some((charter) => charter.partyId === party.id && charter.foundedAtTurn !== undefined);
      const effectiveDuration = isFounding ? FOUNDING_CHAIR_ELECTION_DURATION_TURNS : customDuration;
      const rec: NationalPartyElectionRecord = {
        id: electionId(party.countryId, party.id, position, cycle),
        partyId: party.id,
        countryId: party.countryId,
        position,
        status: "voting",
        startTurn: turn,
        endTurn: turn + effectiveDuration,
        durationTurns: effectiveDuration,
        cycle,
        winnerId: null,
        ...(isFounding ? { founding: true } : {}),
        candidateIds: [],
        votes: {},
        createdAt: world.meta.date,
        updatedAt: world.meta.date,
      };
      // AHDGame leadership candidacy is a Character action. NPPs are not
      // auto-entered, and Native has no separate Character roster beyond the
      // player. contestPartyLeadership adds the player explicitly.
      rec.candidateIds = [];
      world.nationalPartyElections.push(rec);
      created++;
    }
  }
  if (created > 0) world.nationalPartyElections.sort((a, b) => a.id.localeCompare(b.id));
  return created;
}

export function resolveNationalPartyElections(world: WorldState, _rng: WorldRng): number {
  const turn = world.meta.turn;
  const due = world.nationalPartyElections.filter((e) => e.status === "voting" && e.endTurn <= turn);
  if (due.length === 0) return 0;
  let resolved = 0;
  for (const election of due.sort((a, b) => a.id.localeCompare(b.id))) {
    const candidatePols: Array<Pick<Politician, "id" | "ideology">> = [];
    for (const cid of election.candidateIds) {
      if (cid === "player") {
        const party = world.parties[election.partyId];
        candidatePols.push({ id: "player", ideology: { economic: party?.economicPosition ?? 0, social: party?.socialPosition ?? 0 } });
      }
    }
    // AHDGame's national leadership voters are Characters. NPPs do not vote,
    // and their partyInfluence is always zero. Native persists only the
    // player's ballot here; old NPC ballot keys are ignored on resolution.
    const party = world.parties[election.partyId] as unknown as { leadershipElectionMethod?: string; chairId?: string | null; viceChairId?: string | null; treasurerId?: string | null; committeeIds?: string[] } | undefined;
    const useInfluence = party?.leadershipElectionMethod === "influence";
    const counts = new Map<string, number>();
    for (const cid of election.candidateIds) counts.set(cid, 0);

    for (const [voterId, votedFor] of Object.entries(election.votes)) {
      if (voterId !== "player" || !isPlayerNationalLeadershipVoter(world, election.partyId)) continue;
      const weight = useInfluence ? Math.max(0, world.player.partyInfluence ?? 0) : 1;
      if (weight > 0 && counts.has(votedFor)) {
        counts.set(votedFor, (counts.get(votedFor) ?? 0) + weight);
      }
    }
    let winnerId: string | null = null;
    let max = -1;
    for (const cid of [...election.candidateIds].sort((a, b) => a.localeCompare(b))) {
      const c = counts.get(cid) ?? 0;
      if (c > max) {
        max = c;
        winnerId = cid;
      }
    }
    if (candidatePols.length === 0 || max <= 0) winnerId = null;
    if (winnerId === null) {
      // No winner: check incumbent vacate logic per src/lib/nationalPartyElections.ts ticket #1100
      // incumbent who did not stand loses seat; who stood keeps it.
      const field = election.position === "chair" ? "chairId" : election.position === "viceChair" ? "viceChairId" : "treasurerId";
      const holderId = (party as Record<string, unknown> | undefined)?.[field] as string | null | undefined ?? null;
      const incumbentStood = holderId != null && election.candidateIds.includes(holderId);
      if (holderId && !incumbentStood && party) {
        (party as Record<string, unknown>)[field] = null;
        if (election.position === "chair") {
          syncCoalitionChairsForParty(world, election.partyId);
        }
        world.news.push({
          turn: world.meta.turn,
          date: world.meta.date,
          headline: `National party election: ${partyIdLabel(election.partyId, world)} ${election.position} vacated (incumbent did not stand)`,
        });
      }
      election.status = "completed";
      election.winnerId = null;
      election.updatedAt = world.meta.date;
      resolved++;
      continue;
    }
    election.status = "completed";
    election.winnerId = winnerId;
    election.updatedAt = world.meta.date;
    // Apply to party leadership
    const field = election.position === "chair" ? "chairId" : election.position === "viceChair" ? "viceChairId" : "treasurerId";
    if (party) {
      (party as Record<string, unknown>)[field] = winnerId;
      // Auto-vacate other offices held by same winner (src/lib/nationalPartyElections.ts cross-position vacate)
      for (const pos of NATIONAL_PARTY_POSITIONS) {
        if (pos === election.position) continue;
        const otherField = pos === "chair" ? "chairId" : pos === "viceChair" ? "viceChairId" : "treasurerId";
        if ((party as Record<string, unknown>)[otherField] === winnerId) {
          (party as Record<string, unknown>)[otherField] = null;
        }
      }
      // Sync coalition chairCharacterId if this was chair election
      if (election.position === "chair") {
        syncCoalitionChairsForParty(world, election.partyId);
      }
    }
    resolved++;
    const winnerName = winnerId === "player" ? world.player.name : (world.politicians.find((p) => p.id === winnerId)?.name ?? winnerId);
    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline: `National party election: ${partyIdLabel(election.partyId, world)} ${election.position} won by ${winnerName}`,
    });
  }
  return resolved;
}

function partyIdLabel(partyId: string, world: WorldState): string {
  return world.parties[partyId]?.name ?? partyId;
}

/** Apply the vacant-chair majority-vote acceleration once per race. */
export function accelerateNationalPartyElections(world: WorldState): number {
  let accelerated = 0;
  for (const election of world.nationalPartyElections) {
    if (election.status !== "voting") continue;
    const party = world.parties[election.partyId];
    if (!party || party.chairId !== null && party.chairId !== undefined) continue;
    const eligibleVoters = world.politicians.filter((p) => p.partyId === election.partyId).length
      + (world.player.partyId === election.partyId ? 1 : 0);
    const recordedVoters = Object.keys(election.votes).length;
    if (eligibleVoters > 0 && recordedVoters > Math.floor(eligibleVoters / 2)) {
      const acceleratedEnd = world.meta.turn + Math.max(1, Math.ceil(election.durationTurns / 2));
      if (acceleratedEnd < election.endTurn) {
        election.endTurn = acceleratedEnd;
        election.updatedAt = world.meta.date;
        accelerated++;
      }
    }
  }
  return accelerated;
}
