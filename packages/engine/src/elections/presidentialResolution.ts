import type { WorldState } from "../types.js";
import { isElectionCandidateActive, type ElectionRecord } from "./types.js";
import {
  loadContingentElectionDataPlain,
  type CandidateInput as ContingentCandidateInput,
  type CharacterInput as ContingentCharacterInput,
  type ElectedOfficialInput,
  type PartyInput as ContingentPartyInput,
} from "../electionEngine/resolution/contingentData.js";
import { resolveContingentElection, type ContingentElectionResult } from "../electionEngine/resolution/contingentElection.js";
import { archiveCampaignsForElection } from "../campaigns/lifecycle.js";
import { allocatePresidentialResolutionVotes, electoralMajorityFor } from "./presidentialElectoralCollege.js";
import { survivingElectionPartyId } from "./survivingParty.js";

/**
 * Source US presidential resolution through actual electoral-unit votes.
 *
 * Game turn/election/presidentResolution.ts requires unit vote data, recovers
 * the last eligible unit snapshots where available, and vacates when no unit
 * can allocate electors. The proportional national fallback in the source
 * electoralVoteService is for display and does not seat an executive.
 *
 * The live college uses era and current-year apportionment, including DC and
 * Maine/Nebraska district units. Majority and contingent ballots use allocated
 * electors. VP home-state and governor endorsement factors are applied during
 * presidential vote accumulation in tallyAdapter.ts.
 *
 * The ported 12th Amendment resolver supplies House and Senate contingent
 * ballots when no candidate clears the actual electoral majority. Historical
 * saves without recoverable electoral-unit data resolve to a vacant office.
 */

function targetOffice(world: WorldState, id: string): { partyId: string } | undefined {
  if (id === "player") return world.player.partyId ? { partyId: world.player.partyId } : undefined;
  const pol = world.politicians.find((p) => p.id === id);
  return pol ? { partyId: pol.partyId } : undefined;
}

export function buildContingentInputs(world: WorldState, rec: ElectionRecord) {
  const countryId = rec.countryId;

  const characters: ContingentCharacterInput[] = world.politicians.map((p) => ({
    _id: p.id,
    party: p.partyId,
    policies: { economic: p.ideology.economic, social: p.ideology.social },
    currentOffice: null,
  }));
  characters.push({
    _id: "player",
    // "independent" fallback (never bare `undefined` — exactOptionalPropertyTypes).
    party: world.player.partyId ?? "independent",
    ...(world.player.policies ? { policies: world.player.policies } : {}),
    currentOffice: null,
  });

  const partyMap = new Map<string, ContingentPartyInput>();
  for (const p of Object.values(world.parties)) {
    if (p.countryId !== countryId) continue;
    partyMap.set(`${countryId}:${p.id}`, { economicPosition: p.economicPosition, socialPosition: p.socialPosition });
  }

  const houseOfficials: ElectedOfficialInput[] = world.politicians
    .filter((p) => p.countryId === countryId && p.chamberKey === "house")
    .map((p) => ({
      _id: p.id,
      ...(p.electedState !== undefined ? { state: p.electedState } : {}),
      party: p.partyId,
      characterId: p.id,
      isNPP: false,
      ...(p.seatsHeld !== undefined ? { seatsHeld: p.seatsHeld } : {}),
    }));
  // A career player enters the House delegation only when the actual winning
  // race stored a region. Do not invent a state for legacy or at-large seats.
  const playerHouseSeat = world.player.legislativeSeat;
  const playerHouseState = playerHouseSeat?.regionId;
  if (
    playerHouseSeat?.countryId === countryId &&
    playerHouseSeat.chamberKey === "house" &&
    playerHouseState &&
    playerHouseState !== "DC" &&
    world.regions[playerHouseState]?.countryId === countryId
  ) {
    houseOfficials.push({
      _id: "player",
      state: playerHouseState,
      party: world.player.partyId ?? "independent",
      characterId: "player",
      isNPP: false,
      ...(playerHouseSeat.seatsHeld !== undefined ? { seatsHeld: playerHouseSeat.seatsHeld } : {}),
    });
  }

  const senateOfficials: ElectedOfficialInput[] = world.politicians
    .filter((p) => p.countryId === countryId && p.chamberKey === "senate")
    .map((p) => ({
      _id: p.id,
      ...(p.electedState !== undefined ? { state: p.electedState } : {}),
      party: p.partyId,
      characterId: p.id,
      isNPP: false,
      ...(p.seatsHeld !== undefined ? { seatsHeld: p.seatsHeld } : {}),
    }));
  if (
    world.player.legislativeSeat != null &&
    world.player.legislativeSeat.countryId === countryId &&
    world.player.legislativeSeat.chamberKey === "senate"
  ) {
    senateOfficials.push({
      _id: "player",
      party: world.player.partyId ?? "independent",
      characterId: "player",
      isNPP: false,
      ...(world.player.legislativeSeat.seatsHeld !== undefined
        ? { seatsHeld: world.player.legislativeSeat.seatsHeld }
        : {}),
    });
  }

  const candidates: ContingentCandidateInput[] = rec.candidates.filter(isElectionCandidateActive).map((c) => ({
    _id: c.id,
    party: survivingElectionPartyId(world, c.partyId) ?? c.partyId,
    isNPP: false,
    characterId: c.id,
    ...(c.runningMateId !== undefined ? { runningMateId: c.runningMateId } : {}),
  }));

  return { countryId, candidates, characters, partyMap, houseOfficials, senateOfficials };
}

function vpPartyFor(world: WorldState, vpId: string | null): string | null {
  if (!vpId) return null;
  if (vpId === "player") return world.player.partyId;
  return world.politicians.find((p) => p.id === vpId)?.partyId ?? null;
}

/** Vacate the executive when candidates or electoral-unit votes are absent. */
function vacate(world: WorldState, rec: ElectionRecord): void {
  const exec = world.executives[rec.countryId] ?? {
    countryId: rec.countryId,
    presidentId: null,
    presidentParty: null,
    termStartTurn: null,
    vicePresidentId: null,
    vicePresidentParty: null,
  };
  exec.presidentId = null;
  exec.presidentParty = null;
  exec.termStartTurn = null;
  exec.vicePresidentId = null;
  exec.vicePresidentParty = null;
  world.executives[rec.countryId] = exec;
  rec.status = "resolved";
  rec.winners = [];
  rec.resolvedTurn = world.meta.turn;
  archiveCampaignsForElection(world, rec.id);
  world.news.push({
    id: `election:${rec.id}:resolved`,
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `The ${rec.countryId} presidency stays vacant: the election resolved with no eligible electoral votes`,
    category: "Election",
    countryId: rec.countryId,
    electionId: rec.id,
  });
}

export function applyPresidentialResolution(world: WorldState, rec: ElectionRecord): void {
  if (!rec.candidates.some(isElectionCandidateActive)) {
    vacate(world, rec);
    return;
  }

  // Game's turn resolver requires electoral-unit votes. Its proportional
  // national fallback is a display helper and cannot seat an executive.
  const ec = allocatePresidentialResolutionVotes(world, rec);
  if (!ec) {
    vacate(world, rec);
    return;
  }
  const scoreTally = ec.evByCandidate;
  const majorityThreshold = electoralMajorityFor(ec.totalEv);

  const ranked = Object.entries(scoreTally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  let winnerId: string;
  let vpWinnerId: string | null;
  let resolutionMode: ContingentElectionResult["resolutionMode"] | "majority" = "majority";
  let contingentResult: ContingentElectionResult | undefined;

  const topEntry = ranked[0];
  if (topEntry && topEntry[1] >= majorityThreshold) {
    winnerId = topEntry[0];
    const winnerCand = rec.candidates.find((c) => isElectionCandidateActive(c) && c.id === winnerId);
    vpWinnerId = winnerCand?.runningMateId ?? null;
  } else {
    const { countryId, candidates, characters, partyMap, houseOfficials, senateOfficials } = buildContingentInputs(
      world,
      rec,
    );
    const loaded = loadContingentElectionDataPlain({
      countryId,
      candidates,
      electoralVotesByCandidate: scoreTally,
      characters,
      npps: [],
      partyMap,
      houseOfficials,
      senateOfficials,
      frozenChamber: null,
      capturedAt: new Date(`${world.meta.date}T00:00:00Z`),
    });
    contingentResult = resolveContingentElection({
      electionId: rec.id,
      electoralVotesByCandidate: scoreTally,
      presidentCandidates: loaded.presidentCandidates,
      vicePresidentCandidates: loaded.vicePresidentCandidates,
      houseDelegations: loaded.houseDelegations,
      senators: loaded.senators,
      evByEligibleId: loaded.evByEligibleId,
    });
    winnerId = contingentResult.presidentWinnerId;
    vpWinnerId = contingentResult.vicePresidentWinnerId;
    resolutionMode = contingentResult.resolutionMode;
  }

  if (ec) {
    rec.electoralCollegeResult = {
      stateWinners: { ...ec.stateWinners },
      evByCandidate: { ...ec.evByCandidate },
      totalEv: ec.totalEv,
      resolutionMode,
    };
  }

  const winnerCand = rec.candidates.find((c) => isElectionCandidateActive(c) && c.id === winnerId);
  const rawWinnerParty = winnerCand?.partyId ?? targetOffice(world, winnerId)?.partyId ?? "independent";
  const winnerParty = survivingElectionPartyId(world, rawWinnerParty) ?? rawWinnerParty;
  const rawVpParty = vpPartyFor(world, vpWinnerId);
  const vpParty = survivingElectionPartyId(world, rawVpParty) ?? rawVpParty;

  const exec = world.executives[rec.countryId] ?? {
    countryId: rec.countryId,
    presidentId: null,
    presidentParty: null,
    termStartTurn: null,
    vicePresidentId: null,
    vicePresidentParty: null,
  };
  exec.presidentId = winnerId;
  exec.presidentParty = winnerParty;
  exec.termStartTurn = world.meta.turn;
  exec.vicePresidentId = vpWinnerId;
  exec.vicePresidentParty = vpParty;
  world.executives[rec.countryId] = exec;

  // Retire losing generated challengers (and their VP running mates) that
  // hold no other seat — same NPC-population bound as the legislative path
  // (orchestration.ts applyResolution).
  const winnerRunningMateIds = new Set([vpWinnerId].filter((id): id is string => id != null));
  const losingGeneratedIds = new Set<string>();
  for (const c of rec.candidates) {
    if (c.id !== winnerId && c.id.includes("-CH")) losingGeneratedIds.add(c.id);
    if (c.runningMateId && !winnerRunningMateIds.has(c.runningMateId) && c.runningMateId.includes("-VP")) {
      losingGeneratedIds.add(c.runningMateId);
    }
  }
  if (losingGeneratedIds.size > 0) {
    world.politicians = world.politicians.filter(
      (p) => !(losingGeneratedIds.has(p.id) && p.chamberKey === ""),
    );
  }

  rec.status = "resolved";
  rec.winners = [winnerId];
  rec.resolvedTurn = world.meta.turn;
  archiveCampaignsForElection(world, rec.id);

  const winnerName = winnerId === "player" ? world.player.name : (winnerCand?.name ?? winnerId);
  const modeLabel =
    resolutionMode !== "majority" ? "House contingent election" : "electoral college majority";
  world.news.push({
    id: `election:${rec.id}:resolved`,
    turn: world.meta.turn,
    date: world.meta.date,
    headline:
      winnerId === "player"
        ? `You win the ${rec.countryId} presidency (${modeLabel})`
        : `${winnerName} (${winnerParty}) wins the ${rec.countryId} presidency (${modeLabel})`,
    category: "Election",
    countryId: rec.countryId,
    partyId: winnerParty,
    electionId: rec.id,
  });
}
